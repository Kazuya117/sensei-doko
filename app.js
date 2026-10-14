'use strict';
/* 先生いまどこ？ — 先生を探し回る時間をなくすための、学内向けアプリ
   だれが何を見られるかは、データベース側（行レベルセキュリティ）で守っている。
   校内の部屋の名前と配置はデータベースにあり、ログインした人にだけ届く（このファイルには入れていない）。
   下のキーは公開用（publishable）で、ページに含めてよい種類のもの。
   見本モード: ログインしなくても、架空の先生・生徒・校舎でひととおりの動きを見られる。データベースには何も書かない。 */
const VERSION = 2;
const SB_URL = 'https://lotmxestisnibdyfemdk.supabase.co';
const SB_KEY = 'sb_publishable_Y0Vyfl28HOGzRdj_t5dr4g_b_xIrP3K';
const sb = window.supabase.createClient(SB_URL, SB_KEY);

const PURPOSES = { question: '質問', submit: '提出物', consult: '相談', club: '部活', other: 'そのほか' };
const STATUS = {
  here: { ico: '📍', label: 'ここにいます', needsPlace: true },
  back_soon: { ico: '↩️', label: 'もうすぐ職員室に戻ります' },
  meeting: { ico: '🗓️', label: '会議中です' },
  busy: { ico: '📚', label: '授業・部活中です' },
  away: { ico: '🚪', label: '今日は不在です' },
};
const FLOORS = ['1F', '2F', '3F', 'other'];
const FLOOR_LABEL = { '1F': '1階', '2F': '2階', '3F': '3階', other: 'そのほか' };
const AGO_LABEL = { 0: 'たった今', 30: '30分くらい前', 60: '1時間くらい前' };
const TWO_HOURS = 2 * 3600e3;

const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

let user = null, me = null, demo = false;
let tdme = { can_be_teacher: false, school_hours: true };
let places = [], teachers = [], requests = [], searches = [], sightings = [];
let view = 'find', choosing = null, timer = null;
const placeOf = (k) => places.find((p) => p.key === k);
const teacherOf = (id) => teachers.find((t) => t.user_id === id);
const myTeacher = () => teachers.find((t) => t.user_id === user.id);

function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.hidden = false;
  clearTimeout(toast.t); toast.t = setTimeout(() => (t.hidden = true), 3200);
}
function explain(error) {
  const m = (error && error.message) || '';
  if (/使えるのは|すでに探している|1日10回|10分に1回|選べません|管理者だけ/.test(m)) return m;
  if (error && (error.code === '42501' || /row-level security/.test(m))) return 'いまはこの操作ができません（先生が「探さないで」にしている可能性があります）';
  if (/Failed to fetch|NetworkError/i.test(m)) return '通信できませんでした。電波を確認してください';
  return 'うまくいきませんでした。少し待ってもう一度試してください';
}
function ago(iso, extraMin = 0) {
  const m = (Date.now() - new Date(iso).getTime()) / 60000 + extraMin;
  if (m < 5) return 'たった今';
  if (m < 60) return `約${Math.round(m / 5) * 5}分前`;
  return `約${Math.round(m / 30) / 2}時間前`;
}
const seenAt = (g) => { const a = ago(g.created_at, g.ago); return a === 'たった今' ? 'たった今、見かけた' : a + 'に見かけた'; };
const fresh = (iso) => iso && Date.now() - new Date(iso).getTime() < TWO_HOURS;
const paused = (t) => t.paused_until && new Date(t.paused_until).getTime() > Date.now();
function placeName(k) {
  const p = placeOf(k); if (!p) return '';
  return (p.floor === 'other' ? '' : FLOOR_LABEL[p.floor] + ' ') + p.label;
}
/* 先生が自分で出している状況の1行 */
function statusLine(t) {
  if (paused(t)) return '<p class="status off">🔕 いまは探せません</p>';
  if (!t.status_kind || !fresh(t.status_at)) return '';
  const s = STATUS[t.status_kind];
  const where = t.status_kind === 'here' && t.status_place ? `：${esc(placeName(t.status_place))}` : '';
  const until = t.status_until ? `（${esc(t.status_until)}まで）` : '';
  return `<p class="status">${s.ico} ${s.label}${where}${until} <small>先生から・${ago(t.status_at)}</small></p>`;
}

/* ---------- 地図 ---------- */
/* marks: { 場所key: 件数 }（見かけた報告）、star: 先生が自分で出した場所、picked: 選択中 */
function mapSVG(floor, { marks = {}, star = null, picked = null, pickable = false } = {}) {
  const rooms = places.filter((p) => p.floor === floor && p.x != null);
  if (!rooms.length) return '';
  const pad = 14;
  const x0 = Math.min(...rooms.map((r) => r.x - Math.max(r.w, r.h) / 2)) - pad, x1 = Math.max(...rooms.map((r) => r.x + Math.max(r.w, r.h) / 2)) + pad;
  const y0 = Math.min(...rooms.map((r) => r.y - Math.max(r.w, r.h) / 2)) - pad, y1 = Math.max(...rooms.map((r) => r.y + Math.max(r.w, r.h) / 2)) + pad;
  let s = `<svg class="fmap" viewBox="${x0} ${y0} ${x1 - x0} ${y1 - y0}" role="group" aria-label="${FLOOR_LABEL[floor]}の地図">`;
  for (const r of rooms) {
    const can = pickable && r.selectable;
    const cls = ['room', 'k-' + r.kind, can ? 'sel-able' : '', picked === r.key ? 'picked' : '', marks[r.key] ? 'seen' : ''].join(' ');
    const lines = r.label.length > 5 ? [r.label.slice(0, Math.ceil(r.label.length / 2)), r.label.slice(Math.ceil(r.label.length / 2))] : [r.label];
    const ty = r.y + (lines.length > 1 ? -2 : 3) - (r.sub ? 3 : 0);
    s += `<g class="${cls}" ${can ? `data-place="${r.key}" tabindex="0" role="button" aria-label="${esc(r.label)}"` : ''}>`
      + `<rect x="${r.x - r.w / 2}" y="${r.y - r.h / 2}" width="${r.w}" height="${r.h}" rx="5" transform="rotate(${r.rot} ${r.x} ${r.y})"/>`
      + lines.map((l, i) => `<text x="${r.x}" y="${ty + i * 10}">${esc(l)}</text>`).join('')
      + (r.sub ? `<text class="num" x="${r.x}" y="${ty + lines.length * 10 - 1}">${esc(r.sub)}</text>` : '')
      + (marks[r.key] ? `<circle class="pin" cx="${r.x + r.w / 2 - 4}" cy="${r.y - r.h / 2 + 4}" r="8"/><text class="pin-t" x="${r.x + r.w / 2 - 4}" y="${r.y - r.h / 2 + 7}">${marks[r.key]}</text>` : '')
      + (star === r.key ? `<text class="star" x="${r.x - r.w / 2 + 6}" y="${r.y - r.h / 2 + 9}">📍</text>` : '')
      + '</g>';
  }
  return s + '</svg>';
}

/* ---------- 画面の出し分け ---------- */
function screen(name) { ['boot', 'login', 'app'].forEach((id) => ($('#' + id).hidden = id !== name)); }
function show(v) {
  view = v;
  $$('.view').forEach((el) => (el.hidden = el.id !== `view-${v}`));
  $$('#tabs button').forEach((b) => b.classList.toggle('on', b.dataset.view === v));
  window.scrollTo(0, 0); render();
  if (v === 'me') renderAdmin();
}

/* ---------- ログイン ---------- */
$('#login-btn').addEventListener('click', async () => {
  $('#login-btn').disabled = true;
  const { error } = await sb.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: location.origin + location.pathname, queryParams: { prompt: 'select_account' } },
  });
  if (error) { $('#login-btn').disabled = false; loginError(explain(error)); }
});
function loginError(msg) { const e = $('#login-error'); e.textContent = msg; e.hidden = false; }
$('#logout-btn').addEventListener('click', async () => { if (demo) return leaveDemo(); await sb.auth.signOut(); });
function readAuthError() {
  const p = new URLSearchParams(location.search + '&' + location.hash.replace(/^#/, ''));
  const desc = p.get('error_description');
  if (!desc && !p.get('error')) return;
  history.replaceState(null, '', location.pathname);
  loginError(/Database error|学校のメール/.test(desc || '')
    ? 'このアカウントでは使えません。学校のGoogleアカウント（@mita-is.ed.jp）でログインしてください。'
    : 'ログインできませんでした。もう一度試してください。');
}
async function onSession(session) {
  if (demo) return;
  user = session ? session.user : null;
  clearInterval(timer);
  if (!user) { me = null; screen('login'); $('#login-btn').disabled = false; return; }
  const { data, error } = await sb.from('profiles').select('id, role').eq('id', user.id).maybeSingle();
  if (error || !data) { screen('login'); loginError('利用者情報を読み込めませんでした。もう一度ログインしてください。'); return; }
  me = data;
  const pl = await sb.from('td_places').select('*').order('sort');
  places = pl.data || [];
  await refresh();
  screen('app'); show('find');
  timer = setInterval(() => { if (document.visibilityState === 'visible' && $('#picker').hidden) refresh(); }, 20000);
}

/* ---------- データの読み書き ---------- */
/* 本番は Supabase。見本モードのときは、この画面の中だけで同じ形の読み書きをする（下の demoDb）。
   どれも { error } を返す。 */
const live = {
  async load() {
    const since = new Date(Date.now() - TWO_HOURS).toISOString();
    const [m, t, r, s, g] = await Promise.all([
      sb.rpc('td_me'),
      sb.from('td_teachers').select('*').order('display_name'),
      sb.rpc('td_open_requests'),
      sb.from('td_searches').select('id, teacher_id, purpose, created_at').is('closed_at', null).gt('created_at', since).order('created_at', { ascending: false }),
      sb.from('td_sightings').select('id, teacher_id, place, ago, created_at').order('created_at', { ascending: false }),
    ]);
    const error = m.error || t.error || r.error || s.error || g.error;
    if (error) return { error };
    return { data: {
      tdme: (Array.isArray(m.data) ? m.data[0] : m.data) || tdme,
      teachers: t.data || [], requests: r.data || [], searches: s.data || [], sightings: g.data || [],
    } };
  },
  insertSearch: (row) => sb.from('td_searches').insert(row),
  closeSearch: (id, outcome) => sb.from('td_searches').update({ closed_at: new Date().toISOString(), outcome }).eq('id', id),
  insertSighting: (row) => sb.from('td_sightings').insert(row),
  deleteSighting: (id) => sb.from('td_sightings').delete().eq('id', id),
  insertTeacher: (row) => sb.from('td_teachers').insert(row),
  updateTeacher: (patch) => sb.from('td_teachers').update(patch).eq('user_id', user.id),
  deleteTeacher: () => sb.from('td_teachers').delete().eq('user_id', user.id),
};
let db = live;

/* ---------- 読み込み ---------- */
async function refresh() {
  const { data, error } = await db.load();
  if (error) { toast(explain(error)); return; }
  ({ tdme, teachers, requests, searches, sightings } = data);
  render();
}
/* 自分が答えられる依頼（自分が探している分と、自分自身の分は除く） */
const answerable = () => requests.filter((q) => !q.mine && q.teacher_id !== user.id && teacherOf(q.teacher_id));

function render() {
  $('#hours').hidden = tdme.school_hours;
  $('#tab-teacher').hidden = !(tdme.can_be_teacher || myTeacher());
  const n = answerable().length;
  $('#badge').hidden = !n; $('#badge').textContent = n;
  if (view === 'find') renderFind();
  if (view === 'answer') renderAnswer();
  if (view === 'teacher') renderTeacher();
}

/* ---------- さがす ---------- */
function renderFind() {
  $('#my-searches').innerHTML = searches.map((s) => {
    const t = teacherOf(s.teacher_id); if (!t) return '';
    const list = sightings.filter((g) => g.teacher_id === s.teacher_id && new Date(g.created_at) >= new Date(s.created_at) - 60000);
    const marks = {}; list.forEach((g) => (marks[g.place] = (marks[g.place] || 0) + 1));
    const star = t.status_kind === 'here' && fresh(t.status_at) && !paused(t) ? t.status_place : null;
    const floors = [...new Set([...list.map((g) => placeOf(g.place)), placeOf(star)].filter((p) => p && p.floor !== 'other').map((p) => p.floor))];
    return `<article class="card hot" data-search="${s.id}">
      <div class="t-head"><span class="t-name">${esc(t.display_name)}</span><span class="t-note">を探しています・${PURPOSES[s.purpose]}</span><span class="sp"></span><span class="t-note">${ago(s.created_at)}</span></div>
      ${statusLine(t)}
      ${list.length ? `<ul class="sight">${list.map((g) => `<li>👀 <b>${esc(placeName(g.place))}</b><span>${seenAt(g)}</span></li>`).join('')}</ul>`
        : '<p class="waiting">まだ情報がありません。見かけた人が答えてくれるのを待っています…</p>'}
      ${floors.map((f) => `<p class="legend">${FLOOR_LABEL[f]}</p>${mapSVG(f, { marks, star })}`).join('')}
      ${floors.length ? '<p class="legend">数字＝見かけた報告の数　📍＝先生が自分で知らせた場所</p>' : ''}
      <div class="chips"><button class="ghost on" data-close="met">会えた</button><button class="ghost" data-close="not_met">会えなかった</button><button class="ghost" data-close="cancel">探すのをやめる</button></div>
    </article>`;
  }).join('');

  const q = $('#filter').value.trim();
  const mine = new Set(searches.map((s) => s.teacher_id));
  const list = teachers.filter((t) => t.participating && t.user_id !== user.id && !mine.has(t.user_id) && (!q || t.display_name.includes(q)));
  $('#teachers').innerHTML = list.length ? list.map((t) => `<article class="card" data-teacher="${t.user_id}">
      <div class="t-head"><div><div class="t-name">${esc(t.display_name)}</div>${t.note ? `<div class="t-note">${esc(t.note)}</div>` : ''}</div><span class="sp"></span>
        <button class="ghost" data-act="ask" ${paused(t) || !tdme.school_hours ? 'disabled' : ''}>さがす</button></div>
      ${statusLine(t)}
      ${choosing === t.user_id ? `<div class="chips"><p>用件を選ぶと、ほかの生徒に「見かけた？」と聞きます。あなたが探していることは、ほかの生徒には見えません。</p>${Object.entries(PURPOSES).map(([k, v]) => `<button class="ghost" data-purpose="${k}">${v}</button>`).join('')}</div>` : ''}
    </article>`).join('')
    : `<p class="empty">${teachers.some((t) => t.participating) ? '当てはまる先生がいません。' : 'まだ参加している先生がいません。<br>先生が参加すると、ここに表示されます。'}</p>`;
}
$('#filter').addEventListener('input', renderFind);
$('#teachers').addEventListener('click', async (e) => {
  const card = e.target.closest('[data-teacher]'); if (!card) return;
  const id = card.dataset.teacher;
  if (e.target.closest('[data-act=ask]')) { choosing = choosing === id ? null : id; return renderFind(); }
  const p = e.target.closest('[data-purpose]');
  if (p) {
    const { error } = await db.insertSearch({ teacher_id: id, purpose: p.dataset.purpose });
    choosing = null;
    toast(error ? explain(error) : '聞いてみました。見かけた人の答えを待ちましょう');
    await refresh();
  }
});
$('#my-searches').addEventListener('click', async (e) => {
  const b = e.target.closest('[data-close]'); if (!b) return;
  const id = b.closest('[data-search]').dataset.search;
  const { error } = await db.closeSearch(id, b.dataset.close);
  toast(error ? explain(error) : b.dataset.close === 'met' ? '会えてよかった！記録しました' : '記録しました');
  await refresh();
});

/* ---------- こたえる ---------- */
function renderAnswer() {
  const list = answerable();
  const mineSeen = new Set(sightings.filter((g) => Date.now() - new Date(g.created_at) < 600e3 && !searches.some((s) => s.teacher_id === g.teacher_id)).map((g) => g.teacher_id));
  $('#requests').innerHTML = list.length ? list.map((q) => {
    const t = teacherOf(q.teacher_id);
    return `<article class="card" data-teacher="${t.user_id}">
      <div class="t-head"><div><div class="t-name">${esc(t.display_name)}</div><div class="t-note">探している人が${q.n}人います・${ago(q.last_at)}</div></div><span class="sp"></span>
        <button class="ghost on" data-act="seen" ${mineSeen.has(t.user_id) || !tdme.school_hours ? 'disabled' : ''}>${mineSeen.has(t.user_id) ? '答えました' : '見かけた'}</button></div>
    </article>`;
  }).join('') : '<p class="empty">いま探されている先生はいません。</p>';
}
$('#requests').addEventListener('click', (e) => {
  if (!e.target.closest('[data-act=seen]')) return;
  const id = e.target.closest('[data-teacher]').dataset.teacher;
  openPicker({ title: `${teacherOf(id).display_name}を、どこで見かけた？`, mode: 'sighting', teacher: id });
});

/* ---------- 場所を選ぶシート ---------- */
let pick = null; // { mode, teacher, floor, place }
function openPicker(opts) {
  pick = { floor: '1F', place: null, ...opts };
  $('#picker-title').textContent = opts.title;
  $('#picker').hidden = false; drawPicker();
}
function drawPicker() {
  $('#floor-seg').innerHTML = FLOORS.map((f) => `<button data-floor="${f}" class="${pick.floor === f ? 'on' : ''}">${FLOOR_LABEL[f]}</button>`).join('');
  $('#map').innerHTML = pick.floor === 'other' ? '' : mapSVG(pick.floor, { picked: pick.place, pickable: true });
  $('#others').innerHTML = pick.floor === 'other'
    ? places.filter((p) => p.floor === 'other' && p.selectable).map((p) => `<button class="ghost ${pick.place === p.key ? 'on' : ''}" data-place="${p.key}">${esc(p.label)}</button>`).join('') : '';
  $('#picked').textContent = pick.place ? `選んだ場所：${placeName(pick.place)}` : '地図の部屋を押して、場所を選んでください。';
  $('#ago-row').hidden = !(pick.place && pick.mode === 'sighting');
  $('#picker-ok').hidden = !(pick.place && pick.mode === 'status');
}
$('#picker').addEventListener('click', async (e) => {
  if (e.target.id === 'picker' || e.target.closest('#picker-close')) { $('#picker').hidden = true; return; }
  const f = e.target.closest('[data-floor]'); if (f) { pick.floor = f.dataset.floor; return drawPicker(); }
  const p = e.target.closest('[data-place]'); if (p) { pick.place = p.dataset.place; return drawPicker(); }
  const a = e.target.closest('[data-ago]');
  if (a && pick.place) {
    const { error } = await db.insertSighting({ teacher_id: pick.teacher, place: pick.place, ago: +a.dataset.ago });
    $('#picker').hidden = true;
    toast(error ? explain(error) : 'ありがとう！探している人に届きました');
    await refresh();
  }
  if (e.target.closest('#picker-ok') && pick.place) {
    $('#picker').hidden = true;
    await setStatus('here', pick.place);
  }
});

/* ---------- 先生用 ---------- */
function renderTeacher() {
  const t = myTeacher(), el = $('#teacher');
  if (!t) {
    el.innerHTML = `<div class="card"><h2>参加すると、こうなります</h2>
      <ul class="rules"><li>生徒が、あなたを「さがす」ことができるようになります。</li>
      <li>だれかが探しているときだけ、ほかの生徒が「見かけた場所」を知らせられます。</li>
      <li>知らせた場所は、探している生徒とあなたにだけ届き、2時間で消えます。履歴は残りません。</li>
      <li>「いまは探さないで」を、いつでも理由なしで設定できます。</li>
      <li>参加は、いつでもやめられます。</li></ul>
      <label for="t-name">生徒に表示する名前</label><input id="t-name" maxlength="20" placeholder="例：中川先生">
      <label for="t-note">ひとこと（任意）</label><input id="t-note" maxlength="30" placeholder="例：数学・S2A担任">
      <button class="primary" data-t="join">参加する</button></div>`;
    return;
  }
  const req = requests.find((q) => q.teacher_id === user.id);
  const about = sightings.filter((g) => g.teacher_id === user.id);
  const on = (k) => (t.status_kind === k && fresh(t.status_at) ? 'on' : '');
  el.innerHTML = `
    <div class="card ${req ? 'hot' : ''}"><h2>いま探している生徒</h2>
      ${req ? `<p class="t-name">${req.n}人が探しています</p><p class="t-note">用件：${(req.purposes || []).map((p) => PURPOSES[p]).join('、')}</p>
        <p class="note" style="margin:8px 0 0">下の「いまの状況」を押すと、探している生徒にすぐ届きます。</p>` : '<p class="t-note">いまは、だれも探していません。</p>'}
    </div>
    <div class="card"><h2>いまの状況を知らせる</h2>
      ${statusLine(t) || '<p class="t-note">何も知らせていません。</p>'}
      <label for="t-until">何時まで（任意）</label><input id="t-until" maxlength="10" placeholder="例：16:30" value="${esc(t.status_until || '')}">
      <div class="chips">${Object.entries(STATUS).map(([k, s]) => `<button class="ghost ${on(k)}" data-status="${k}">${s.ico} ${s.label}</button>`).join('')}
        <button class="ghost" data-status="">知らせるのをやめる</button></div>
      <p class="legend">知らせた内容は、2時間たつと自動で消えます。</p>
    </div>
    <div class="card"><h2>いまは探さないで</h2>
      <p class="t-note">${paused(t) ? `設定中です（${new Date(t.paused_until).toTimeString().slice(0, 5)}まで）。生徒は、あなたを探すことも、場所を知らせることもできません。` : '設定すると、生徒はあなたを探せなくなります。理由は表示されません。'}</p>
      <div class="chips"><button class="ghost ${paused(t) ? '' : ''}" data-pause="60">1時間</button><button class="ghost" data-pause="today">今日はもう</button>
        <button class="ghost" data-pause="0" ${paused(t) ? '' : 'disabled'}>解除する</button></div>
    </div>
    <div class="card"><h2>あなたについて届いた「見かけた」</h2>
      ${about.length ? `<ul class="sight">${about.map((g) => `<li data-sight="${g.id}">👀 <b>${esc(placeName(g.place))}</b><span>${ago(g.created_at, g.ago)}</span><button class="x" data-t="del" aria-label="この報告を消す">×</button></li>`).join('')}</ul>
        <p class="legend">×で消せます。消すと、探している生徒にも見えなくなります。</p>` : '<p class="t-note">ありません。</p>'}
    </div>
    <div class="card"><h2>表示する名前</h2>
      <div class="row"><input id="t-name" maxlength="20" value="${esc(t.display_name)}"><button class="ghost" data-t="rename">変更</button></div>
      <label for="t-note">ひとこと（任意）</label><input id="t-note" maxlength="30" value="${esc(t.note || '')}">
      <div class="chips"><button class="ghost" data-t="toggle">${t.participating ? '参加を一時的に止める（一覧から消える）' : '参加を再開する'}</button>
        <button class="ghost warn" data-t="leave">参加をやめて、情報を消す</button></div>
      ${t.participating ? '' : '<p class="status off">いまは参加を止めています。生徒の画面には表示されません。</p>'}
    </div>`;
}
async function updateTeacher(patch, okMsg) {
  const { error } = await db.updateTeacher(patch);
  toast(error ? explain(error) : okMsg); await refresh();
}
async function setStatus(kind, place = null) {
  const until = ($('#t-until') ? $('#t-until').value.trim() : '') || null;
  await updateTeacher(kind ? { status_kind: kind, status_place: place, status_until: until, status_at: new Date().toISOString() }
    : { status_kind: null, status_place: null, status_until: null, status_at: null }, kind ? '知らせました' : '知らせるのをやめました');
}
$('#teacher').addEventListener('click', async (e) => {
  const st = e.target.closest('[data-status]');
  if (st) {
    const k = st.dataset.status;
    if (k === 'here') return openPicker({ title: 'いまいる場所を選ぶ', mode: 'status' });
    return setStatus(k || null);
  }
  const pz = e.target.closest('[data-pause]');
  if (pz) {
    const v = pz.dataset.pause; let until = null;
    if (v === '60') until = new Date(Date.now() + 3600e3);
    if (v === 'today') { until = new Date(); until.setHours(23, 59, 0, 0); }
    return updateTeacher({ paused_until: until ? until.toISOString() : null }, until ? '「いまは探さないで」にしました' : '解除しました');
  }
  const b = e.target.closest('[data-t]'); if (!b) return;
  const act = b.dataset.t;
  if (act === 'join') {
    const display_name = $('#t-name').value.trim();
    if (!display_name) return toast('表示する名前を入れてください');
    const { error } = await db.insertTeacher({ user_id: user.id, display_name, note: $('#t-note').value.trim() || null });
    toast(error ? explain(error) : '参加しました。いつでも止められます'); return refresh();
  }
  if (act === 'rename') {
    const display_name = $('#t-name').value.trim();
    if (!display_name) return toast('表示する名前を入れてください');
    return updateTeacher({ display_name, note: $('#t-note').value.trim() || null }, '変更しました');
  }
  if (act === 'toggle') { const t = myTeacher(); return updateTeacher({ participating: !t.participating }, t.participating ? '参加を止めました' : '参加を再開しました'); }
  if (act === 'del') {
    const { error } = await db.deleteSighting(b.closest('[data-sight]').dataset.sight);
    toast(error ? explain(error) : '消しました'); return refresh();
  }
  if (act === 'leave') {
    if (b.dataset.sure !== '1') { b.dataset.sure = '1'; b.textContent = 'もう一度押すと、参加をやめます'; return; }
    const { error } = await db.deleteTeacher();
    toast(error ? explain(error) : '参加をやめました。情報は消えました'); return refresh();
  }
});

/* ---------- 管理者：参加できる先生のアドレス ---------- */
async function renderAdmin(action = 'list', email = null) {
  const el = $('#admin');
  if (!me || me.role !== 'moderator') { el.innerHTML = ''; return; }
  const { data, error } = await sb.rpc('td_admin_teacher_emails', { p_action: action, p_email: email });
  if (error) { toast(explain(error)); return; }
  el.innerHTML = `<div class="card"><h2>管理：参加できる先生のアドレス</h2>
    <p class="t-note">同意をもらった先生のアドレスだけを登録します。登録しても、先生本人がログインして「参加する」を押すまでは、生徒には表示されません。</p>
    <ul class="sight">${(data || []).map((m) => `<li><b>${esc(m)}</b><button class="x" data-rm="${esc(m)}" aria-label="削除">×</button></li>`).join('')}</ul>
    <div class="row"><input id="a-email" type="email" placeholder="先生のメールアドレス" autocomplete="off"><button class="ghost" id="a-add">追加</button></div></div>`;
}
$('#admin').addEventListener('click', (e) => {
  const rm = e.target.closest('[data-rm]'); if (rm) return renderAdmin('remove', rm.dataset.rm);
  if (e.target.closest('#a-add')) { const v = $('#a-email').value.trim(); if (v) renderAdmin('add', v); }
});

/* ---------- 見本モード ---------- */
/* ログインしなくても、どんなアプリか分かるようにする。先生・生徒・校舎はすべて架空で、
   押した結果はこの画面の中にだけ残り、画面を閉じると消える。データベースには何も送らない。 */
const DEMO_UID = 'demo-me';
const room = (floor, key, label, kind, x, y, w = 48, h = 36, extra = {}) =>
  ({ key, floor, label, kind, x, y, w, h, rot: 0, selectable: true, sub: null, ...extra });
const DEMO_PLACES = [
  room('1F', 'd_1a', '1年A組', 'jhs', 40, 30), room('1F', 'd_1b', '1年B組', 'jhs', 96, 30), room('1F', 'd_1c', '1年C組', 'jhs', 152, 30),
  room('1F', 'd_sci', '理科室', 'special', 208, 30), room('1F', 'd_nurse', '保健室', 'closed', 264, 30, 48, 36, { selectable: false }),
  room('1F', 'd_staff', '職員室', 'staff', 76, 90, 120, 36), room('1F', 'd_entrance', '昇降口', 'common', 172, 90, 64, 36), room('1F', 'd_mp', '多目的室', 'special', 240, 90, 60, 36),
  room('2F', 'd_2a', '2年A組', 'jhs', 40, 30), room('2F', 'd_2b', '2年B組', 'jhs', 96, 30), room('2F', 'd_2c', '2年C組', 'jhs', 152, 30),
  room('2F', 'd_music', '音楽室', 'special', 208, 30), room('2F', 'd_art', '美術室', 'special', 264, 30),
  room('2F', 'd_lib', '図書室', 'common', 76, 90, 120, 36), room('2F', 'd_career', '進路室', 'staff', 172, 90, 64, 36), room('2F', 'd_pc', 'PC室', 'special', 240, 90, 60, 36),
  room('3F', 'd_3a', '3年A組', 'jhs', 40, 30), room('3F', 'd_3b', '3年B組', 'jhs', 96, 30), room('3F', 'd_3c', '3年C組', 'jhs', 152, 30),
  room('3F', 'd_home', '家庭科室', 'special', 208, 30), room('3F', 'd_hall', 'ホール', 'common', 264, 30),
  room('3F', 'd_study', '自習室', 'common', 76, 90, 120, 36), room('3F', 'd_staff2', '第2職員室', 'staff', 190, 90, 100, 36),
  { key: 'd_gym', floor: 'other', label: '体育館', kind: 'common', selectable: true, rot: 0 },
  { key: 'd_ground', floor: 'other', label: 'グラウンド', kind: 'common', selectable: true, rot: 0 },
  { key: 'd_moving', floor: 'other', label: '廊下・階段（移動中）', kind: 'common', selectable: true, rot: 0 },
  { key: 'd_elsewhere', floor: 'other', label: '校内のそのほか', kind: 'common', selectable: true, rot: 0 },
];
function demoDb() {
  const t0 = Date.now();
  const at = (min) => new Date(t0 - min * 60000).toISOString();
  const nid = () => 'demo-' + Math.random().toString(36).slice(2, 8);
  const T = (user_id, display_name, note, extra = {}) =>
    ({ user_id, display_name, note, participating: true, paused_until: null, status_kind: null, status_place: null, status_until: null, status_at: null, ...extra });
  const tl = [
    T('demo-t1', '田中先生', '数学・2年A組担任'),
    T('demo-t2', '佐藤先生', '理科・科学部顧問', { status_kind: 'here', status_place: 'd_sci', status_until: '16:30', status_at: at(8) }),
    T('demo-t3', '鈴木先生', '英語'),
    T('demo-t4', '高橋先生', '国語・図書委員会', { status_kind: 'back_soon', status_at: at(15) }),
    T('demo-t5', '山本先生', '体育・サッカー部', { status_kind: 'busy', status_until: '17:00', status_at: at(40) }),
    T('demo-t6', '渡辺先生', '社会', { paused_until: new Date(t0 + 3600e3).toISOString() }),
    T('demo-t7', '小林先生', '音楽'),
    T(DEMO_UID, '見本の先生（あなた）', '「先生用」タブの見本'),
  ];
  const sl = [ /* 自分（見本の生徒）が探している */
    { id: nid(), teacher_id: 'demo-t1', purpose: 'question', created_at: at(12) },
    { id: nid(), teacher_id: 'demo-t2', purpose: 'consult', created_at: at(20) },
  ];
  const ol = [ /* ほかの生徒が探している（だれが、は見えない） */
    { teacher_id: 'demo-t3', purpose: 'submit', created_at: at(5) }, { teacher_id: 'demo-t3', purpose: 'question', created_at: at(18) },
    { teacher_id: 'demo-t4', purpose: 'club', created_at: at(25) },
    { teacher_id: DEMO_UID, purpose: 'question', created_at: at(6) }, { teacher_id: DEMO_UID, purpose: 'submit', created_at: at(14) },
  ];
  const gl = [ /* 「見かけた」の報告 */
    { id: nid(), teacher_id: 'demo-t1', place: 'd_lib', ago: 0, created_at: at(3), reporter_id: 'demo-s1' },
    { id: nid(), teacher_id: 'demo-t1', place: 'd_2a', ago: 30, created_at: at(10), reporter_id: 'demo-s2' },
    { id: nid(), teacher_id: DEMO_UID, place: 'd_art', ago: 30, created_at: at(4), reporter_id: 'demo-s3' },
  ];
  const requests = () => { /* td_open_requests と同じ形にまとめる */
    const by = {};
    for (const s of [...sl.map((s) => ({ ...s, mine: true })), ...ol]) {
      const q = by[s.teacher_id] || (by[s.teacher_id] = { teacher_id: s.teacher_id, n: 0, last_at: s.created_at, purposes: [], mine: false });
      q.n++; if (s.created_at > q.last_at) q.last_at = s.created_at; q.purposes.push(s.purpose); q.mine = q.mine || !!s.mine;
    }
    return Object.values(by).map((q) => ({ ...q, purposes: q.teacher_id === DEMO_UID ? q.purposes : null }));
  };
  const ok = () => Promise.resolve({ error: null });
  return {
    async load() {
      return { data: { tdme: { can_be_teacher: true, school_hours: true }, teachers: [...tl], requests: requests(), searches: [...sl], sightings: [...gl] } };
    },
    insertSearch(row) {
      sl.unshift({ id: nid(), teacher_id: row.teacher_id, purpose: row.purpose, created_at: new Date().toISOString() });
      setTimeout(async () => { /* 6秒後に、架空の生徒が答える */
        if (!demo || !sl.some((s) => s.teacher_id === row.teacher_id)) return;
        const pool = DEMO_PLACES.filter((p) => p.selectable && p.x != null);
        gl.unshift({ id: nid(), teacher_id: row.teacher_id, place: pool[Math.floor(Math.random() * pool.length)].key, ago: 0, created_at: new Date().toISOString(), reporter_id: 'demo-s9' });
        await refresh(); toast('（見本）ほかの生徒が「見かけた」と答えました');
      }, 6000);
      return ok();
    },
    closeSearch(id) { const i = sl.findIndex((s) => s.id === id); if (i >= 0) sl.splice(i, 1); return ok(); },
    insertSighting(row) { gl.unshift({ id: nid(), ...row, created_at: new Date().toISOString(), reporter_id: DEMO_UID }); return ok(); },
    deleteSighting(id) { const i = gl.findIndex((g) => g.id === id); if (i >= 0) gl.splice(i, 1); return ok(); },
    insertTeacher(row) { tl.push(T(DEMO_UID, row.display_name, row.note)); return ok(); },
    updateTeacher(patch) { Object.assign(tl.find((t) => t.user_id === DEMO_UID), patch); return ok(); },
    deleteTeacher() { const i = tl.findIndex((t) => t.user_id === DEMO_UID); if (i >= 0) tl.splice(i, 1); return ok(); },
  };
}
async function enterDemo() {
  demo = true; db = demoDb();
  user = { id: DEMO_UID }; me = { id: DEMO_UID, role: 'member' }; places = DEMO_PLACES;
  clearInterval(timer);
  $('#demo-banner').hidden = false; $('#logout-btn').textContent = '見本を終わる';
  await refresh(); screen('app'); show('find');
  timer = setInterval(() => { if (document.visibilityState === 'visible' && $('#picker').hidden) refresh(); }, 20000);
}
function leaveDemo() { location.replace(location.pathname); }
$('#demo-btn').addEventListener('click', enterDemo);
$('#demo-exit').addEventListener('click', leaveDemo);

/* ---------- 起動 ---------- */
$('#tabs').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) show(b.dataset.view); });
document.addEventListener('visibilitychange', () => { if (user && document.visibilityState === 'visible') refresh(); });
$('#ver').textContent = `バージョン ${VERSION}`;
readAuthError();
if (new URLSearchParams(location.search).has('demo')) enterDemo();
let lastUid;
sb.auth.onAuthStateChange((event, session) => {
  const uid = session ? session.user.id : null;
  if (event !== 'INITIAL_SESSION' && uid === lastUid) return;
  lastUid = uid;
  setTimeout(() => onSession(session), 0);
});
if ('serviceWorker' in navigator && location.protocol === 'https:') {
  const had = !!navigator.serviceWorker.controller; let reloaded = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (had && !reloaded) { reloaded = true; location.reload(); } });
  navigator.serviceWorker.register('sw.js').then((r) => r.update()).catch(() => {});
}

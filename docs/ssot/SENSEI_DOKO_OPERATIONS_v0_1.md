---
document_id: SENSEI_DOKO_OPERATIONS
ssot_id: SSOT-3
version: v0.1
status: DRAFT
project: sensei-doko
as_of: "2026-10-23"
parent_charter: "先生いまどこ？ MASTER CHARTER v0.1 — 第 3 章（主体と権限）/ 第 5 章（製品構造）/ 第 8 章 8-4（開発規律）"
parent_charter_status: DRAFT
drafted_by: "Builder = Claude Code（PM Kazuya117 の依頼 2026-10-23）"
ratified_by: "未"
evidence: "gh api（Pages・repo）・Supabase API・README.md・git log（2026-10-23 実測）"
---

> **status: DRAFT。** 本書は「どこで動き、誰がどう運営し、どう更新するか」を固定する。CTO Studio が配布されたら第 5 章を配布物に合わせて改版する。

# 先生いまどこ？ OPERATIONS v0.1 (DRAFT 2026-10-23)

## 第 1 章 配信と実行環境

| ID | 項目 | 値（2026-10-23 実測） |
|---|---|---|
| S3-1 | 配信 | GitHub Pages。URL https://kazuya117.github.io/sensei-doko/ 。main の内容がそのまま配信される（ビルドなし） |
| S3-2 | repo | `Kazuya117/sensei-doko`（PUBLIC）。手元の作業場所は WSL の `~/sensei-doko` |
| S3-3 | データ | Supabase プロジェクト `idea-seeds`（ref `lotmxestisnibdyfemdk`・東京 ap-northeast-1・Postgres 17.11）。「アイデアの種」と**共用**。本アプリの表は `td_` で始まる |
| S3-4 | ログイン | Supabase Auth の Google ログイン |
| S3-5 | 配信中の版 | `VERSION = 2`（app.js）・`CACHE = 'sensei-doko-v2'`（sw.js） |
| S3-6 | 秘密情報 | repo に秘密キーを置かない。`app.js` のキーは公開用。Supabase の管理操作は PM のアカウントで行う |

## 第 2 章 運営の手順（運営チーム）

| ID | 作業 | 手順 | 誰が |
|---|---|---|---|
| S3-7 | 先生を参加できるようにする | 同意をもらってから、`private.teacher_emails` にアドレスを追加する（設定画面から管理者が登録） | 運営チーム（管理者） |
| S3-8 | 場所の追加・変更 | `td_places` を直接編集する。`selectable = false` にすると地図に描かれるが選べなくなる | 運営チーム・PM |
| S3-9 | 利用時間帯の変更 | `private.td_school_hours()` を変える。**AP-6 の変更なのでオーナー裁定** | PM（オーナー裁定後） |
| S3-10 | 生徒のアカウント削除 | 運営チームが依頼を受け、PM が Supabase Auth で削除する | 運営チーム → PM |
| S3-11 | 問い合わせ | 運営チーム（学校側のチーム）または担当教員。連絡先は repo に書かない | 運営チーム |
| S3-12 | 探究活動の終了 | すべてのデータを削除する。**日付・手順は未定**（Charter Q-6） | PM（オーナー裁定） |

## 第 3 章 更新（版上げ）の手順

| ID | 手順 |
|---|---|
| S3-13 | 変更はブランチで行い、PR を作る。main に直接 push しない |
| S3-14 | 利用者の端末に届かせるときは、`app.js` の `VERSION`・`index.html` の `?v=`・`sw.js` の `CACHE` を**同じ数字**に上げる。1 つでも忘れると古い版が残る |
| S3-15 | 見本モード（`?demo`）で一通りの動きを確認してから merge する。確認の実出力（画面の確認結果・コンソールのエラーなし）を PR に書く |
| S3-16 | DB の定義変更はマイグレーションとして記録し、PR 本文にマイグレーション名を書く。SSOT-2 を同じ PR で改版する |
| S3-17 | merge 後、配信 URL で `VERSION` が上がったことを確認して完了とする（`gh run watch` → 配信 URL の取得） |

## 第 4 章 開発規律（Charter 8-4 の具体）

| ID | 規律 | 強制の所在 |
|---|---|---|
| S3-18 | main 直 push 禁止・PR 必須 | GitHub の branch protection。**2026-10-23 実測: 未設定**（API 応答 `Branch not protected`）。オーナーが設定するまでは手動で守る（Charter Q-8） |
| S3-19 | 完了の自己申告を受理しない。証拠（実出力・PR 番号）を添える | PR テンプレート（未作成） |
| S3-20 | 決定と理由を日付つきで残す | `docs/decisions/DECISIONS.md`（CTO Studio 配布後は `.rkstm/memory/DECISIONS.md`） |
| S3-21 | 学校名・個人名・メールアドレス・個人の記録を repo・Issue・PR に書かない | レビューで確認 |
| S3-22 | 作業の始めに前回の記録を読む。終わりに引き継ぎを書く | `docs/decisions/SESSION_HANDOFF.md`（配布後は `.rkstm/memory/SESSION_HANDOFF.md`） |

## 第 5 章 CTO Studio との関係

| ID | 条項 | 現状 |
|---|---|---|
| S3-23 | CTO Studio（rkstm devkit）は配布されていない。配布の可否は decipro-core #418 でオーナー兼 PM が上申中（既定 = 配布しない・期限 2026-11-07） | 2026-10-23 実測: decipro-core の rkstm を本 repo に向けると `REFUSED: RECIPIENT_BINDING_MISMATCH` |
| S3-24 | 配布された場合: `.rkstm/` は CORE 所有面として編集しない。`rkstm check start` を作業前、`rkstm check done` を完了前に通す。第 4 章の記録ファイルは `.rkstm/memory/` に移す | — |
| S3-25 | 配布されない場合: 第 4 章の規律を手動で守る。`docs/decisions/` を記録の場所とする | — |

## 第 6 章 監視と証拠

| ID | 条項 |
|---|---|
| S3-26 | 配信の健全性: 配信 URL が 200 を返し、`VERSION` が期待値であること。確認は版上げのたび（S3-17） |
| S3-27 | DB の健全性: Supabase の advisor（セキュリティ・性能）を月 1 回確認し、警告を Issue に写す。2026-10-23 の警告 = `private.*` 4 表の RLS 無効（SSOT-2 S2-27） |
| S3-28 | 利用の実測（会えるまでの時間・会えた割合）は個人が分からない形で集計する（SSOT-2 S2-30）。集計の仕組みは未実装（SSOT-1 S1-23） |

## 第 7 章 改版

| 版 | 日付 | 内容 |
|---|---|---|
| v0.1 DRAFT | 2026-10-23 | 初版。環境 6 件・運営手順 6 件・版上げ 5 手順・開発規律 5 条・CTO Studio との関係 3 条・監視 3 条 |

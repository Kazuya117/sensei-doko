# SESSION HANDOFF — 次に作業する人（Builder）が最初に読むもの

> Charter 8-4 / SSOT-3 S3-22。CTO Studio が配布されたら `.rkstm/memory/SESSION_HANDOFF.md` へ移す。

## 2026-10-23 — 正本 DRAFT を起草（PR #3）

- やったこと: `docs/ssot/` に Charter v0.1 と SSOT-1〜3 を DRAFT で作成。Supabase を実測（マイグレーション 2 本・`td_*` 4 表 RLS 有効・`private.*` 4 表 RLS 無効の警告）。branch protection は未設定
- 持ち越し（オーナー裁定）: Charter 付録 B の Q-1〜Q-8。特に Q-3（2 時間削除の実装経路・README の `sensei_doko_deletes` は存在しない）と Q-5（`private.*` の RLS）
- 次のセッションが最初に確かめること: PR #3 が merge されたか → 付録 B の裁定が Issue に付いたか → Q-3 の実測（`sensei_doko_rules` の中身を読む）

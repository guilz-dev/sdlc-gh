# sdlc-gh 機能拡張ロードマップ — ハーネス性能のフル活用と汎用ワークフロー化

> 対象: `guilz-dev/sdlc-gh`
> 前提: [gh-aw-improvements.md](gh-aw-improvements.md)（P0〜P2 の是正）が先行すること
> 観点: ①ハーネスが既に持つ性能（walls / eval / telemetry / 自律性ラダー）を使い切る ②gh-aw の機能で開発ワークフロー全般に汎用展開する
> 作成日: 2026-07-07

---

## 0. 現在地と拡張の方向性

sdlc-gh の現在の実装は「**守り**」が中心で、しかも守りの資産は既にかなり揃っている:

| 資産 | 実装状況 | 活用度 |
|------|---------|--------|
| CC-SD 契約 + issue-spec ゲート | 実装済み | ○ L1 docs/test-fix のみ |
| task/autonomy ラベル + diff-size ゲート | 実装済み | ○ L1 は warn-only |
| retry orchestrator（最大3回・同一署名2回で停止） | 実装済み | ○ |
| テレメトリ artifact + nightly 集計 + issue routing | 実装済み | △ 分類→**人手**の morning queue 止まり |
| eval 基盤（e2e bench 9タスク / trajectories / gh models eval） | 部分実装 | △ prompt 1個・break-and-fix 未実装 |
| custom agents（triager/implementer/reviewer）+ quality-loop skill | 実装済み | △ |
| hooks（破壊的コマンド遮断） | 実装済み | ✕ **1ルールのみ** |
| gh-aw 統合 | spec 段階 | ✕ compile 検証のみ |

拡張の軸は 3 つ:

1. **ループを閉じる** — outer loop（分類・routing）の出力を inner loop（実装委任）へ自動接続する。現状は [docs/operations.md](docs/operations.md) の「morning queue（毎朝30分の人手チェックリスト）」が結節点で、ここがボトルネック。
2. **gh-aw をイベント駆動の汎用オートメーションに使う** — schedule だけでなく command trigger / label trigger / safe-outputs を使い、Issue・PR 上の日常操作をエージェント化する。
3. **測る→締める** — L2 昇格基準（adoption >90% など）が定義済みなのに測定が手動。KPI 計測を自動化し、autonomy ladder を実際に登れるようにする。

いずれの拡張も設計 3 原則（**壁は決定論的 / 人間ゲートは PR review のみ / eval なしにハーネス変更なし**）を壊さないことを制約とする。

---

## 1. ループを閉じる — outer→inner 自動接続【最重要】

### 1.1 routed issue の自動 L1 委任（`create-agent-session`）

**現状**: [route-harness-review.mjs](scripts/route-harness-review.mjs) が繰り返し失敗を issue 化 → 人間が morning queue で読み、手で implementer に assign。

**拡張**: gh-aw の safe-output **`create-agent-session`**（Copilot coding agent セッションを起動する公式機構）で、条件を満たす routed issue を自動委任する。

```yaml
# .github/workflows/harness-fix-dispatcher.md (新規 gh-aw workflow)
on:
  issues:
    types: [labeled]
safe-outputs:
  create-agent-session:
    max: 1
```

- 起動条件は決定論的に絞る: `outer-loop:ff-gap` かつ `task:docs|test-fix` かつ `autonomy:L1` かつ issue-spec-check 相当の CC-SD 完備。
- エージェントは「委任してよいか」の最終判定のみ行い、書き込みは safe-output 経由。
- 人間ゲートは従来どおり **PR review に収斂**（自動 merge はしない）ので、設計原則と矛盾しない。
- 効果: FF不足系の定型修正（instructions の追記、convention テスト追加）が夜間に PR 草案まで到達し、朝は「レビューするだけ」になる。

### 1.2 spec-writer ワークフロー（CC-SD 契約の下書き生成）

**現状**: CC-SD 5 フィールドは人間が書く。不備だと triager が差し戻す（= 往復コスト）。

**拡張**: ラフな issue に `/spec` コマンド（または `needs-spec` ラベル）で gh-aw workflow を起動し、リポジトリを読んで CC-SD 草案を生成:

```yaml
on:
  command:
    name: spec
roles: [admin, maintainer, write]
permissions:
  contents: read
  issues: read
safe-outputs:
  update-issue:
    body: { append: true }   # 草案を追記（上書きしない）
  add-labels:
    allowed: ["needs-spec-review"]
```

- `Goal / Non-goals / Constraints / Acceptance criteria / Rollback hints` を issue 本文とコード文脈から起草。人間は添削するだけ。
- [check-issue-spec.mjs](scripts/check-issue-spec.mjs) がそのまま品質ゲートとして機能する（生成物も同じ壁を通る）。
- 効果: L1 委任の入口コストを下げ、CC-SD 運用の採用率を上げる。**ハーネスの入口を広げる拡張**。

### 1.3 CI failure explainer（retry orchestrator の判断材料供給）

**現状**: [agent-retry-orchestrator.yml](.github/workflows/agent-retry-orchestrator.yml) は失敗署名ベースで機械的に retry/stop。**なぜ落ちたか**は人間がログを読む。

**拡張**: PR の CI 失敗時に gh-aw workflow が [docs/failure-taxonomy.md](docs/failure-taxonomy.md) に沿って原因を 1 コメントで分類・要約:

```yaml
on:
  workflow_run:
    workflows: ["Harness CI"]
    types: [completed]
safe-outputs:
  add-comment:
    max: 1
    hide-older-comments: true   # 再実行のたびに積もらない
```

- 出力フォーマットを taxonomy のキー（`FF不足 / 壁不足 / モデル限界` + `wall_failure_type`）に固定 → そのままテレメトリ artifact に載せれば nightly 集計の分類精度も上がる。
- `hide-older-comments` で PR を汚さない（gh-aw ネイティブ機能）。

---

## 2. gh-aw の汎用ワークフロー化 — イベント駆動カタログ

gh-aw の command / label / schedule トリガと safe-outputs を組み合わせ、**「壁とラベル分類は sdlc-gh、実行は gh-aw」** の分業で日常ワークフローを段階的にエージェント化する。公式の 6 カテゴリに対応させたカタログ案:

| カテゴリ | ワークフロー案 | トリガ | safe-outputs | 備考 |
|----------|---------------|--------|--------------|------|
| Issue/PR 管理 | **issue-dedupe** — 新規 issue の重複検出 | `issues: opened` | `add-comment` + `add-labels: [duplicate?]` | `deduplicate-by-title` の知見を流用 |
| Issue/PR 管理 | **stale-pr-nudge** — 放置 draft PR の棚卸し | schedule (週次) | `add-comment` / `close-pull-request` | open-pr-limit（[check-open-pr-limit.mjs](scripts/check-open-pr-limit.mjs)）と整合 |
| 継続ドキュメント | **docs-drift-detector** — コード変更と docs の乖離検出 | `push: main` | `create-issue` (`task:docs` + CC-SD 草案付き) | **1.2 と連結すると docs 修正が全自動で L1 委任可能形式になる** |
| 継続ドキュメント | **release-notes** — マージ済み PR から draft release 生成 | `release` / schedule | `update-release` | PR の contract summary をそのまま素材にできる |
| 継続改善 | **flaky-test-detector** — retry ログから不安定テスト抽出 | schedule (週次) | `create-issue` (`task:test-fix`) | retry orchestrator の telemetry が入力源 |
| 継続改善 | **todo-harvester** — TODO/FIXME の issue 化 | schedule (月次) | `create-issue` (max 5, dedupe) | |
| メトリクス | **weekly-kpi-report**（§4.1 で詳述） | schedule (週次) | `create-discussion` / `update-issue` | [kpi-baseline.md](docs/kpi-baseline.md) の手動運用を置換 |
| 品質 | **dependency-triage** — Dependabot PR の影響分析コメント | `pull_request` (bot filter) | `add-comment` | `task:dependency-bump` の自動ラベル付けと連動 |
| マルチリポジトリ | §5 参照 | — | `target-repo` | |

**設計上の共通ルール**（ハーネス原則の維持）:

1. すべて `roles: [admin, maintainer, write]` 以上 + `bots:` フィルタを明示。
2. 書き込みは safe-outputs のみ・`max` は最小で開始。**merge 系 safe-output は使わない**。
3. 新規ワークフローはまず **staged/trial mode**（gh-aw の実行プレビュー機能）で 1〜2 週間動かし、出力を artifact で観察してから本番化 — これは repo 既存の「dogfood → promotion criteria」文化のワークフロー版。
4. 各 `.md` は dogfood トラックと同じ検査対象に追加（[gh-aw-dogfood.mjs](scripts/lib/gh-aw-dogfood.mjs) の `GH_AW_SOURCE_WORKFLOWS` を配列拡張するだけで CI が付いてくる — この構造は既に良くできている）。

**共通フラグメント化**: カタログが増えると frontmatter/ポリシー定型が重複するので、gh-aw の `imports:` で共有する:

```
.github/aw/shared/
├── policy-guards.md      # roles / bots / forbidden-ops 定型
├── ccsd-contract.md      # CC-SD 5 フィールド定義（AGENTS.md と単一ソース化）
└── taxonomy.md           # FF不足/壁不足/モデル限界 の分類契約
```

CC-SD 定義は現在 [AGENTS.md](AGENTS.md) / [copilot-instructions.md](.github/copilot-instructions.md) / [ccsd-contract.mjs](scripts/lib/ccsd-contract.mjs) / issue template の 4 箇所に散在しており、fragment 化はドリフト防止としても価値がある（validate-harness に「定義一致チェック」を追加するとなお良い）。

---

## 3. 壁（walls）の増築 — hooks とゲートの拡充

### 3.1 hooks.json の拡充

**現状**: [hooks.json](.github/hooks/hooks.json) は正規表現 **1 パターンのみ**（force push / rm -rf / DROP）。[test-hooks-scenarios.mjs](scripts/test-hooks-scenarios.mjs) のテスト基盤があるのに中身が薄い。

**拡張**（すべて決定論的なので原則に整合）:

| 追加ルール | パターン例 | 根拠 |
|-----------|-----------|------|
| secrets 流出系 | `printenv.*SECRET`, `cat .env`, `gh secret list` | [docs/auth-boundaries.md](docs/auth-boundaries.md) の境界を機械化 |
| パッケージ公開 | `npm publish`, `gem push`, `twine upload` | 供給網事故の遮断 |
| CI 改変 | `git commit` 対象に `.github/workflows` 変更 + ハーネスラベル無し | CODEOWNERS 前の早期遮断 |
| 履歴改変 | `git rebase`, `git filter-branch`, `git push --delete` | 既存ルールの穴埋め |
| スタック別破壊操作 | `rails db:drop`, `prisma migrate reset`, `DROP SCHEMA` | instructions/profiles ごとに追加可能 |

hooks はスタックプロファイル（[.github/instructions/profiles/](.github/instructions/profiles/)）と対で管理し、bootstrap 時に stack に応じてマージする設計にすると汎用性が上がる。

### 3.2 protected-files（gh-aw ネイティブ）でハーネス自己防衛

gh-aw の `create-pull-request.protected-files` は指定ファイルへの変更を PR から弾き issue にフォールバックする供給網防御。ハーネス自身の急所を宣言する:

```yaml
safe-outputs:
  create-pull-request:
    max: 1
    protected-files:
      - ".github/hooks/**"
      - ".github/workflows/harness-ci.yml"
      - "scripts/check-*.mjs"
```

「エージェントが自分の壁を書き換える」経路を **frontmatter 宣言だけで** 塞げる。CODEOWNERS（レビュー強制）より手前の層になる。

### 3.3 diff-size 以外の品質壁（Phase 4+ の弾）

diff-size ゲートの実装パターン（scenario テスト + 環境変数 opt-in）を踏襲して追加できる壁:

- **テスト増減ゲート**: `task:feature-small` で product コード追加 + テスト差分ゼロ → warn/fail
- **public API 変更検知**: エクスポート署名の diff を検出し `autonomy:L1` では warn（`feature-small` を L2 に上げる際の前提壁）
- **循環的複雑度の差分上限**: 既存ツール（radon / gocyclo 等）をスタックプロファイルに紐付け

これらは「**L2/L3 昇格の際に増やす壁**」としてロードマップ化し、[docs/operations.md](docs/operations.md) の昇格基準とセットで文書化する。

---

## 4. 測る→締める — autonomy ladder を実際に登る

### 4.1 KPI 計測の自動化（weekly-kpi-report ワークフロー）

**現状**: [docs/kpi-baseline.md](docs/kpi-baseline.md) は**手動記入テンプレート**。一方 L2 昇格基準（[docs/operations.md](docs/operations.md)）は「直近 50 タスクで adoption rate >90%・90 日間 major revert ゼロ・e2e pass@1 安定」と**定量的**。測っていないので永遠に昇格できない構造。

**拡張**: telemetry artifact（[telemetry-artifact.mjs](scripts/lib/telemetry-artifact.mjs) のスキーマは既にある）を週次で集計する決定論スクリプト + gh-aw で要約を discussion 投稿:

1. `scripts/aggregate-kpi.mjs`（新規・決定論）: 週間 window で adoption rate / revert 数 / retry 率 / task class 別成功率を JSON 出力
2. gh-aw workflow が JSON を読んで人間可読の週報を `create-discussion`（`group-by-day` 不要、週次 dedupe）
3. **昇格条件の判定自体はスクリプト側**（決定論）に置き、エージェントは解説のみ担当 — 「壁は決定論的」の原則維持

これで morning queue のチェックリスト 4 項目のうち 2 項目が自動化され、L2 昇格判断が evidence 付きで回るようになる。

### 4.2 eval の実戦化 — break-and-fix runner

**現状**: [evals/e2e-bench/](evals/e2e-bench/) は 9 タスクの「実行可能な受け入れチェック」で、README も自認するとおり **break-and-fix agent runner ではない**（エージェントに解かせて pass@1 を測る仕組みが無い）。つまり「No harness change without an eval」の eval が、ハーネス資産の整合性チェックに留まりエージェント性能を測れていない。

**拡張**:

1. e2e タスク定義（YAML）に「意図的に壊した状態のブランチ/パッチ」を追加
2. `create-agent-session` で implementer に修理させ、受け入れチェックで pass@1 を採点
3. 結果を [evals/.score-baseline.json](evals/.score-baseline.json) と比較し、[check-eval-score-drift.mjs](scripts/check-eval-score-drift.mjs) の既存ドリフト検知に接続
4. 実行は **週次 schedule + ハーネス資産 PR 時**（コスト管理のため `max-ai-credits` を workflow 単位で宣言）

これが入ると「instructions を変えた → pass@1 がどう動いたか」が数字で見えるようになり、outer loop の核心（harness revision の効果測定）が完成する。

### 4.3 gh models eval の拡充

**現状**: [prompts/triager-classify.prompt.yml](prompts/triager-classify.prompt.yml) が 1 個だけ、evaluator は `similarity / expected: docs` のみ（docs 以外の入力に対する評価が無い）。

**拡張**:

- タスククラス 7 種 × 境界事例（docs↔refactor、test-fix↔feature-small など紛らわしいペア）でテストケース行列を作る
- reviewer / spec-writer 用 prompt も追加し、**エージェント指示文の変更 = prompt eval の変更を必須にする** CI ルール（eval-ci の change-type selection は既にあるので、対象パスに `prompts/` ↔ `.github/agents/` の対応を追加するだけ)

---

## 5. マルチリポジトリ展開 — テンプレートから「ハーネス基盤」へ

**現状**: [docs/shared-config.md](docs/shared-config.md) に配布戦略の文書はあるが、実装は bootstrap（コピー）+ 週次 drift-report のみ。product repo が増えるほどコピーの発散が痛くなる。

**拡張の 3 段階**:

| 段階 | 仕組み | gh-aw 機能 |
|------|--------|-----------|
| a. カタログ配布 | §2 のワークフロー群を `gh aw add guilz-dev/sdlc-gh/<workflow>` でインストール可能にする | `source:` トラッキング、`private: false`、`check-for-updates` |
| b. 中央監視 | sdlc-gh（またはハーネス管理 repo）の nightly review が **複数 product repo** の telemetry を集約し、各 repo に issue routing | safe-outputs の `target-repo` + `github-app` 認証 |
| c. 一斉更新 | ハーネス資産の更新を各 repo へ PR 配布（現 drift-report の逆方向） | `dispatch-workflow` の cross-repo allowlist（公式 changelog 掲載の新機能） |

- a は npm 配布（`@guilz-dev/sdlc-gh`）と補完関係: **CI 資産は npm/bootstrap、エージェントワークフローは `gh aw add`** という配布チャネルの分担が自然。
- b/c は権限が強いので、[docs/auth-boundaries.md](docs/auth-boundaries.md) に GitHub App の権限表を追加し、`roles` + App の fine-grained permission で二重に絞る。

---

## 6. DX — CLI とオンボーディングの拡張

既存 CLI（[sdlc-gh-cli.mjs](scripts/sdlc-gh-cli.mjs): init / wizard / doctor）に運用系サブコマンドを追加:

| コマンド | 内容 | 実装素材 |
|----------|------|----------|
| `sdlc-gh status` | morning queue のダイジェスト（routed issue / eval drift / KPI 速報）をターミナルに一枚出し | 既存: route-harness-review + aggregate（§4.1） |
| `sdlc-gh promote <workflow>` | gh-aw promotion criteria（dogfood 3 連続 green 等）の充足チェック → schedule 有効化 PR の雛形生成 | [docs/gh-aw-dogfood.md](docs/gh-aw-dogfood.md) の基準を機械化 |
| `sdlc-gh new-workflow <name>` | §2 の共通ガード（roles / safe-outputs max / imports）入り gh-aw `.md` scaffold 生成 + dogfood 配列へ自動登録 | `GH_AW_SOURCE_WORKFLOWS` 拡張 |
| `sdlc-gh kpi` | §4.1 の週次集計をローカル実行 | aggregate-kpi.mjs |

`new-workflow` は特に重要で、**「gh-aw ワークフローを足すときの正しい形」をテンプレートが強制する** ことで、カタログ拡大時の品質を担保する（= ハーネスの思想をハーネス自身の拡張にも適用する）。

---

## 6.1 コード品質 Outer Loop（実装プラン）

日次マージ差分の AI レビュー → Issue 化 → 条件付き修正 PR までを汎用プロダクト化する詳細計画:

- **[docs/outer-loop-implementation-plan.md](docs/outer-loop-implementation-plan.md)** — Epic E0〜E6、PR 分割、リリース v0.2.0〜v0.4.x

本ロードマップ §1.1（routed issue 自動 L1 委任）、§1.2（spec-writer）、§2（ワークフローカタログ）は上記プランに統合済み。

---

## 7. 優先順位マトリクス

| 順 | 拡張 | 節 | 効果 | 工数 | 前提 |
|----|------|-----|------|------|------|
| 1 | KPI 集計自動化 + weekly-kpi-report | 4.1 | ◎ 昇格判断が回り始める | 小〜中 | telemetry 配線済み（済） |
| 2 | hooks.json 拡充（スタック別） | 3.1 | ◎ 即効の安全性向上 | 小 | なし |
| 3 | spec-writer（/spec コマンド） | 1.2 | ◎ L1 入口コスト削減 | 中 | improvements P0-P1 |
| 4 | CI failure explainer | 1.3 | ○ morning queue 負荷減 | 中 | improvements P1（テレメトリ経路） |
| 5 | protected-files 宣言 | 3.2 | ○ 自己防衛・工数ほぼゼロ | 極小 | gh-aw promote 時 |
| 6 | routed issue 自動 L1 委任 | 1.1 | ◎ ループが閉じる | 中〜大 | 3, 4 と dogfood green |
| 7 | break-and-fix eval runner | 4.2 | ◎ outer loop の完成 | 大 | 6（create-agent-session 実績） |
| 8 | ワークフローカタログ（docs-drift / flaky / release-notes …） | 2 | ○ 汎用価値・採用促進 | 中（1 本ずつ） | imports 基盤 |
| 9 | マルチリポジトリ（target-repo / gh aw add） | 5 | ○ スケール | 大 | 8 の実績 |

**推奨の進め方**: 1〜2 → 3〜5 → 6 → 7 の順で、各段階とも「dogfood トラックに載せる → staged/trial で観察 → promotion criteria を満たしたら schedule 化」という既存の昇格プロセスをそのまま適用する。ハーネスの拡張自体をハーネスの流儀で行うことが、このテンプレートの最大の説得力になる。

---

## 付録: 拡張時に守る不変条件（チェックリスト)

新しいワークフロー / 壁 / エージェントを足すときの PR チェックリスト案（`.github/pull_request_template.md` への追記候補）:

- [ ] 書き込みはすべて safe-outputs 経由か（直接 write permission を足していないか）
- [ ] `roles:` / `bots:` / `max` / `max-ai-credits` / `stop-after` を明示したか
- [ ] 判定ロジックは決定論スクリプト側、エージェントは解釈・起草のみか
- [ ] dogfood 配列（`GH_AW_SOURCE_WORKFLOWS`）と scenario テストに追加したか
- [ ] eval（prompt eval または e2e タスク）を同 PR で追加・更新したか
- [ ] 人間ゲートが PR review 以外に増えていないか
- [ ] `docs/operations.md`（canonical policy）との整合を確認したか

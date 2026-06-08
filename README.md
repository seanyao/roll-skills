# roll-skills

The **skill contracts** for [roll](https://github.com/seanyao/roll) — markdown
playbooks that AI agents (Claude, Cursor, Kimi, Pi, …) load and follow when
they work inside a roll-managed project. This repo is mounted into the main
repo as the `skills/` git submodule and ships inside the
[`@seanyao/roll`](https://www.npmjs.com/package/@seanyao/roll) npm package;
`roll setup` syncs the contracts into each installed AI client.

roll 的**技能契约**仓——AI agent 在 roll 项目里工作时加载并遵循的 markdown
工作流手册。以 `skills/` 子模块挂载进主仓、随 npm 包发布，`roll setup`
负责同步到各 AI 客户端。

## Skills · 技能清单

**Delivery · 交付主链**
- `roll-design` — 讨论/设计/拆卡入口（DDD 建模 + INVEST 拆分落 backlog）
- `roll-build` — 万能交付：US 卡经 TCR 全流程（含验证门与验收证据）
- `roll-fix` — 缺陷修复轻量链路（FIX 卡专用）
- `roll-idea` — 一句话快速捕获 → 自动分类编号落 backlog
- `roll-loop` — 无人值守 BACKLOG 执行器的工作流契约

**Quality · 质量与评审**
- `roll-peer` — 跨 agent 协商评审（三态协议 + 时间盒）
- `roll-review-pr` — PR 评审，输出 APPROVE / REQUEST_CHANGES / UNCERTAIN
- `roll-spar` — 攻防 TDD（高危逻辑双 agent 对抗）
- `roll-.review` / `roll-.qa` — TCR 内嵌自审与测试金字塔基准

**Observation · 观察与汇报**
- `roll-brief` — owner 简报；`roll-notes` — 项目日记
- `roll-sentinel` — 生产抽查巡检；`roll-.dream` — 夜间架构/文档健康扫描
- `roll-doctor` — 工具链体检；`roll-doc` — 存量文档自动化

**Lifecycle & misc · 生命周期与杂项**
- `roll-onboard` — 存量项目交互式接入
- `roll-propose` — 产品视角提案生成（只进 proposals，不直写 backlog）
- `roll-.changelog` — Done 卡 → 用户 changelog（含验收证据 marker 约定）
- `roll-deck` — 双语 18 页 deck 生成
- `roll-debug` — 网页黑盒诊断探针
- `roll-.clarify` / `roll-.echo` — 模糊输入的被动澄清

> Each skill's full contract lives in `<skill>/SKILL.md`. Dot-prefixed skills
> (`roll-.x`) are passive/auto-triggered. 每个技能的完整契约在各自的
> `SKILL.md`；带点前缀的为被动技能，自动触发。

## Editing · 修改约定

Skills are prose contracts — edit the markdown, PR to `main`, then bump the
`skills/` submodule pointer in the main repo. Conventions (bilingual output,
backlog write-back rules, evidence chain) are defined by the main repo's
AGENTS.md and enforced there.

## Health & Authoring · 健康检查与编写纪律

Skill descriptions are model-facing routing triggers, not human summaries. New
or edited skills must keep a compact `Load when...` description, positive and
negative route cases, Roll-specific gotchas, and progressive disclosure through
`references/`, `assets/`, or `scripts/` when the hub grows.

```bash
node scripts/audit-skills.mjs --strict
node scripts/test-audit-skills.mjs
```

See [docs/skill-authoring.md](docs/skill-authoring.md) for the full rules.

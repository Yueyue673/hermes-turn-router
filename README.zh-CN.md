![Hermes Turn Router](assets/hero.svg)

# Hermes Turn Router

[![Release](https://img.shields.io/github/v/release/Yueyue673/hermes-turn-router?display_name=tag&sort=semver&color=ff4d00)](https://github.com/Yueyue673/hermes-turn-router/releases/latest)
[![CI](https://github.com/Yueyue673/hermes-turn-router/actions/workflows/ci.yml/badge.svg)](https://github.com/Yueyue673/hermes-turn-router/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-171717.svg)](LICENSE)
[![Node 20+](https://img.shields.io/badge/node-20%2B-171717.svg)](package.json)
[![Hermes 0.20.5](https://img.shields.io/badge/Hermes-0.20.5-0e7c66.svg)](docs/compatibility.md)

面向 [Hermes Agent](https://github.com/NousResearch/hermes-agent) 的本地、缓存感知、逐 turn 模型路由器。它在 Desktop 每条消息发送前选择允许的 target，让同一决策贯穿排队、重试和重启，并由 Gateway 决定实际 provider、model、reasoning effort 与成本等级。

**不调用额外分类模型。不修改全局模型。不在 Router ledger 保存消息正文。**

[English](README.md) · [开始使用](docs/getting-started.md) · [架构](docs/architecture.md) · [兼容性](docs/compatibility.md) · [故障排查](docs/troubleshooting.md) · [最新版本](https://github.com/Yueyue673/hermes-turn-router/releases/latest)

> [!IMPORTANT]
> 策略核心和 CLI 可以跨平台使用。Hermes 执行桥有意锁定上游版本，目前验证的是 Hermes Agent `0.20.5`、commit `2584b7c4eca82ada05f16eba08936d157b483329`。安装前请先看[兼容矩阵](docs/compatibility.md)。

## 为什么需要它

所有消息固定使用强模型，会把额度浪费在普通 turn 上。粗暴地逐条切模型也可能更糟：长会话换到另一个模型后，已有 prompt cache 边界可能失效，延迟反而上升。

Hermes Turn Router 把四类本应一起判断的信息放进同一次决策：

- 当前消息信号和用户明确模式；
- 服务端允许的 target 与安全下限；
- 当前真实模型和 **reasoning effort**；
- 上下文规模、切换成本和缓存风险。

下面来自一次真实的 691 条消息会话。一个解释型 turn 从 Sol High 被切到 Luna，Luna 首次处理约 388K 未缓存输入，耗时 30.8 秒。v0.3 对同一输入的回放结果是 `large_context_sticky`：保持 Sol High、不切换、缓存风险为 none。

![长上下文事故回放](assets/decision-demo.svg)

## 你会得到什么

| 层 | 行为 |
|---|---|
| 本地策略 | 同步 TypeScript 纯函数，不访问网络和文件系统 |
| 四档 target | 参考策略包含 Luna Medium、Sol Medium、Sol High、Sol XHigh |
| 缓存稳定 | Auto 在 32K+ 已建立会话中不做边缘性降档 |
| 明确控制 | Desktop 提供 `auto`、`save`、`quality`、`off` 和 `Best once` |
| 服务端授权 | 客户端只提交不透明 target ID，Gateway 解析真实模型 |
| 持久准入 | SQLite lease ledger，包含 reserved/accepted/completed 与冲突检测 |
| Fail-open | Router 能力异常时提示并旁路，绝不吞掉用户消息 |
| 真实状态 | Desktop 显示当前临时 turn 实际使用的模型与 effort |
| 回放评估 | target 分布、切换率、缓存风险、期望命中、usage 与 latency 字段 |
| 安全安装 | commit/hash 预检、ZIP 备份、Desktop staging、完整回滚 |

## 快速开始

### A. 先试策略核心

```bash
git clone https://github.com/Yueyue673/hermes-turn-router.git
cd hermes-turn-router
npm ci
npm run check
```

查看一次真实决策：

```bash
node dist/cli.js route \
  --text "请仔细审查这个生产迁移方案" \
  --allow fast,balanced,strong,premium \
  --context-tokens 24000 \
  --current-provider openai-codex \
  --current-model gpt-5.6-luna \
  --current-reasoning medium
```

```json
{
  "target": {
    "id": "balanced",
    "label": "Sol · Medium",
    "provider": "openai-codex",
    "model": "gpt-5.6-sol",
    "reasoningEffort": "medium"
  },
  "score": 45,
  "reasons": ["high_impact"],
  "switched": true,
  "contextPenalty": 6,
  "cacheRisk": "medium"
}
```

回放仓库内置的脱敏样本：

```bash
node dist/cli.js replay --input examples/replay.ndjson
```

当前 fixture 包含 6 条期望决策：6 条命中、1 次模型切换、0 个路由错误。

### B. 安装 Hermes 执行桥

先做预检：

```bash
python integrations/hermes/scripts/install.py check \
  --hermes-source C:/path/to/hermes-agent \
  --hermes-home C:/path/to/hermes-home
```

安装源码接缝、catalog、Desktop plugin、备份并执行验证：

```bash
python integrations/hermes/scripts/install.py install \
  --hermes-source C:/path/to/hermes-agent \
  --hermes-home C:/path/to/hermes-home \
  --full-verify
```

安装到已验证的 Windows unpacked Desktop release 时，先彻底退出 Hermes，再追加 `--deploy-desktop`。完成后重启 Hermes，在输入框旁选择 `auto`。

前置条件、target catalog、打包部署、验收与回滚见[开始使用](docs/getting-started.md)。

## 一条 turn 如何流动

![Hermes Turn Router 架构](assets/architecture.svg)

1. Desktop 本地评分，只提交 `targetId` 与理由元数据。
2. Gateway 检查 profile catalog、成本上限、跨 provider 策略和 approval 要求。
3. SQLite lease 按 `(profile, lineage, clientTurnId)` 预留，并使用服务端计算的 prompt digest。
4. Gateway 应用授权 target；完全相同的 target 直接 no-op，只改 effort 时不重建 Provider client。
5. One-shot 只在明确 accepted 后消费。
6. 排队、重试和重启保留同一份不可变决策。
7. Gateway 完成 ledger，并在 turn 结束后恢复基础 runtime。

完整协议见[架构](docs/architecture.md)和 [Hermes 集成](integrations/hermes/README.md)。

## 参考 target 阶梯

内置 preset 只是参考，不绑定特定 provider：

| ID | 参考 target | 分数 | 典型工作 |
|---|---|---:|---|
| `fast` | Luna · Medium | `<25` | 明确、低风险、可验证的 turn |
| `balanced` | Sol · Medium | `25–59` | 分析、代码、多步执行 |
| `strong` | Sol · High | `60–89` | 高影响综合与审查 |
| `premium` | Sol · XHigh | `90+` | 明确高质量、架构、最终对抗审查 |

Target 在两个地方声明，各自承担不同信任角色：

- policy target：本地纯函数使用的评分元数据；
- Gateway catalog target：服务端对 provider/model/effort/cost 的最终授权。

两处 ID 必须一致。Gateway 不信任 Desktop 发来的 provider/model 字符串。

## Desktop 模式

| 控件 | 含义 |
|---|---|
| `auto` | 每条重新评估，同时考虑安全、当前 target、上下文规模和缓存成本 |
| `save` | 明确应用低成本倾向，但保留安全下限 |
| `quality` | 明确应用强模型倾向 |
| `off` | 交给 Hermes 原生模型选择器，也就是固定模型工作流 |
| `Best once` | 下一条 accepted turn 使用 `premium`，之后恢复原模式 |

CLI/库仍支持明确的 `fixed` target。Desktop 不再用第二套 fixed UI 重复 Hermes 原生模型选择器。

## 代码调用

```ts
import { codexLunaSolPolicy, routeMessage } from 'hermes-turn-router'

const decision = routeMessage({
  text: '认真检查这个迁移方案',
  mode: 'auto',
  policy: codexLunaSolPolicy,
  allowedTargetIds: ['fast', 'balanced', 'strong', 'premium'],
  estimatedContextTokens: 24_000,
  state: {
    currentProvider: 'openai-codex',
    currentModel: 'gpt-5.6-luna',
    currentReasoningEffort: 'medium'
  }
})
```

`routeMessage()` 是同步纯函数，无副作用。策略通过 JSON Schema 验证，可配置云端 provider、本地 endpoint 或混合模型池。

## 安全与隐私

- 策略在本地执行，不把消息发给额外分类模型。
- Gateway 拒绝客户端 provider/model override。
- Catalog ID 有格式和数量边界。
- 高影响信号执行可配置的最低档位。
- Approval token 是短期 HMAC，绑定 profile、lineage、turn、target 和 expiry。
- Ledger 只保存哈希和生命周期元数据，不保存消息和附件正文。
- 能力协商有界重试并 fail-open。
- 安装器拒绝不支持的 commit、hash 不匹配、脏 worktree 和不安全 patch。

威胁边界与漏洞报告见 [SECURITY.md](SECURITY.md)。

## 兼容性

| 组件 | 当前状态 |
|---|---|
| Policy/CLI | Node 20+，Windows/macOS/Linux |
| Hermes source bridge | commit `2584b7c4eca82ada05f16eba08936d157b483329` |
| 已验证 Hermes 版本 | `0.20.5` |
| Packaged Desktop 部署 | 已验证 Windows unpacked release |
| 其他 provider | Catalog 结构支持，必须按目标 profile 验证 |

完整矩阵见 [docs/compatibility.md](docs/compatibility.md)。

## 已知限制

- Hermes bridge 目前尚未成为稳定的 upstream plugin API，当前使用版本化 patch + 外置 Desktop plugin。
- 参考 Router 采用可解释启发式评分，不包含训练型语义分类器。
- 尚未提供自动反馈学习和交互式 approval UI。
- 默认 Desktop 会隐藏 `requires_approval` target，直到批准 UI 完成。
- macOS/Linux 的 packaged Desktop 部署尚未验证。
- Provider transport 卡顿仍属于 Provider/网络问题；Router 会减少不必要切换并显示真实服务模型，但不会在 stream 已打开后重复请求。

## 文档

| 文档 | 用途 |
|---|---|
| [开始使用](docs/getting-started.md) | 首次安装、验收、回滚 |
| [架构](docs/architecture.md) | 信任边界和 turn 生命周期 |
| [Hermes 集成](integrations/hermes/README.md) | patch manifest 与安装命令 |
| [CLI](docs/cli.md) | validate、route、replay 参数 |
| [兼容性](docs/compatibility.md) | 支持平台与 Hermes 版本 |
| [故障排查](docs/troubleshooting.md) | Gateway、catalog、延迟、安装问题 |
| [Token 与缓存](docs/token-economics.md) | 缓存风险和评估指标 |
| [Roadmap](docs/roadmap.md) | 当前范围和后续计划 |

## 开发

```bash
npm ci
npm run check
npm run render:assets
npm pack --dry-run
```

路由策略变更需要行为测试或脱敏 replay fixture。集成变更还要证明干净安装、Gateway/Desktop 测试、适用时的 packaged deployment，以及 rollback。

参见 [CONTRIBUTING.md](CONTRIBUTING.md)、[行为准则](CODE_OF_CONDUCT.md)和 [Issue 模板](.github/ISSUE_TEMPLATE/)。

## 项目状态

`0.3.1` 在缓存稳定的四档路由上补齐了已验证的开始路径、兼容矩阵、故障排查、文档自动校验和完整视觉系统。执行核心包含持久 turn admission、服务端 target 授权、长上下文粘滞、no-op/effort-only 执行、真实服务模型显示、fail-open 发送，以及面向已验证 Hermes commit 的版本化安装器。

社区项目，与 Nous Research 无官方隶属关系。

## License

MIT，见 [LICENSE](LICENSE)。

![Hermes Turn Router：逐消息、缓存感知、本地路由](assets/hero.svg)

# Hermes Turn Router

**给 Hermes Agent 用的逐消息、缓存感知模型路由器。**

[![CI](https://github.com/Yueyue673/hermes-turn-router/actions/workflows/ci.yml/badge.svg)](https://github.com/Yueyue673/hermes-turn-router/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-111111.svg)](LICENSE)
[![Local routing](https://img.shields.io/badge/router-local-ff4d00.svg)](docs/privacy.md)

让问候、代码、研究和生产迁移使用不同模型档位，**但不修改 Hermes 的全局默认模型，也不先调用另一个 LLM 来判断该用谁。**

真正要优化的不是“这句话能不能丢给便宜模型”，而是：

> **模型消耗 + 缓存重读 + 返工 + 纠正成本 + 错误风险。**

[架构](docs/architecture.md) · [Token 经济性](docs/token-economics.md) · [隐私](docs/privacy.md) · [English](README.md)

## 现在拿下来能做什么

| 层 | 用途 | 状态 |
|---|---|---|
| **策略核心** | 根据消息、模式、上下文长度和当前模型选择允许的 target | 已测试 |
| **CLI + 回放评估器** | 验证策略、查看单条决策、批量统计切换率和命中率 | 已测试 |
| **Hermes 集成契约** | 让同一决策贯穿排队、重试、临时切换和恢复 | 参考集成；仍需 Hermes 上游稳定能力 |

核心能力：

- 本地同步判断，**零分类模型 Token**；
- 长会话提高切换门槛，避免 Luna/Sol 来回跳导致缓存重读；
- `save` 不能突破高影响任务的安全下限；
- 只从服务端确认过的 target allowlist 中选择；
- 输出模型、分数、原因、原始档位、最终档位和缓存风险；
- provider/model/reasoning 都是配置，不绑死 Codex；
- 回放默认只输出汇总，不复述消息正文。

## 两分钟试用

```bash
git clone https://github.com/Yueyue673/hermes-turn-router.git
cd hermes-turn-router
npm ci
npm run check
```

### 看一条消息会怎么路由

```bash
node dist/cli.js route   --text "请认真深入审查这个迁移架构"   --allow fast,balanced,premium   --context-tokens 24000   --current-provider openai-codex   --current-model gpt-5.6-luna   --current-reasoning medium
```

真实输出会包含：

```json
{
  "target": {"id":"premium","model":"gpt-5.6-sol","reasoningEffort":"xhigh"},
  "reasons": ["explicit_quality","high_impact","complex_reasoning"],
  "switched": true,
  "contextPenalty": 6,
  "cacheRisk": "medium"
}
```

### 批量回放，先证明策略再部署

```bash
node dist/cli.js replay --input examples/replay.ndjson
```

当前内置样本实测：**6/6 期望档位命中、实际切换 1 次、错误 0**。它会统计每档占比、切换率、缓存风险、理由和期望命中率，但不输出原消息。

![本地回放和缓存成本判断](assets/decision-demo.svg)

## 为什么它不会“为了省 Token 反而更贵”

切模型本身可能打断 provider/model 的提示词缓存。长会话从 A 切到 B，B 可能要重新读取整个历史；切回来又可能再付一次。高 reasoning 档还会产生更多推理 Token。

因此 `auto` 不是见到简单句就降档，而是依次考虑：

1. 当前消息的语义分数；
2. 高影响任务安全下限；
3. 升档/降档必须跨过的额外 margin；
4. 随上下文增长的切换惩罚；
5. “你继续”这类续接消息的任务粘滞。

用户明确选择的 `quality / save / fixed / one-shot` 仍然优先；滞回只防止自动模式摇摆，不替用户做主。

## 模型档案，而不是套餐写死

`presets/codex-luna-sol.json` 是当前实测参考档案，但通用核心里没有 Plus/Pro 这类 ChatGPT 套餐概念。任何 target 都只是：ID、provider、model、可选 reasoning 和分数门槛。

你可以做 Anthropic、Gemini、DeepSeek、OpenRouter、LM Studio，或本地+云端混合档案。先用 [JSON Schema](policy.schema.json) 验证，再用自己的脱敏样本回放，不能凭感觉写阈值。

## Hermes 集成现状

> [!WARNING]
> 这是社区实验项目，不属于 Nous Research 官方组件。策略核心和 CLI 现在可用；Desktop 公开集成目前是严谨的参考契约，不是假装兼容所有版本的一键覆盖脚本。

安全的 Hermes 集成必须同时具备：稳定 turn ID、消息与路由同一 RPC、Gateway 服务端解析 target、成本/provider allowlist、持久去重、成功/错误/中断均恢复、能力协商、全局配置零写入。

详见 [集成契约](integrations/hermes/README.md) 和 [验收矩阵](docs/hermes-integration.md)。等 Hermes 的 `composer.turn-model-override` 边界稳定后，再做真正的一键安装包。

## 开发与验证

```bash
npm run check          # 类型检查 + 13 项测试 + 构建 + CLI 冒烟
npm run render:assets  # 从可编辑 SVG 重建 PNG 预览
npm pack --dry-run     # 检查公开包内容
```

0.1 已经完成通用策略、CLI、回放、缓存滞回、allowlist、文档与 CI。下一步是 provider capability、真实 usage 数据闭环、Hermes 上游能力协商和持久 turn ledger。详见 [路线图](docs/roadmap.md)。

MIT License。社区维护，与 Nous Research 无官方隶属关系。

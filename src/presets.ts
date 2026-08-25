import type { RouterPolicy } from './types.js'

export const codexLunaSolPolicy: RouterPolicy = {
  version: 1,
  tiers: [
    { id: 'fast', label: 'Luna · Medium', provider: 'openai-codex', model: 'gpt-5.6-luna', reasoningEffort: 'medium', minScore: -100 },
    { id: 'balanced', label: 'Sol · Medium', provider: 'openai-codex', model: 'gpt-5.6-sol', reasoningEffort: 'medium', minScore: 25 },
    { id: 'strong', label: 'Sol · High', provider: 'openai-codex', model: 'gpt-5.6-sol', reasoningEffort: 'high', minScore: 60 },
    { id: 'premium', label: 'Sol · XHigh', provider: 'openai-codex', model: 'gpt-5.6-sol', reasoningEffort: 'xhigh', minScore: 90 }
  ],
  signals: [
    {
      id: 'explicit-quality',
      reasonCode: 'explicit_quality',
      pattern: /(认真|仔细|深入|深度|想清楚|高质量|最好(?:的)?模型|最强|不要敷衍|strict(?:ly)? review|think\s+carefully|high[ -]?quality|best\s+model)/.source,
      weight: 90,
      forceUpgrade: true
    },
    {
      id: 'explicit-saving',
      reasonCode: 'explicit_saving',
      pattern: /(省额度|节省额度|简单回答|简短回答|不用想太多|低成本|save\s+(?:tokens?|quota)|keep\s+it\s+simple)/.source,
      weight: -45
    },
    {
      id: 'high-impact',
      reasonCode: 'high_impact',
      pattern: /(删除|覆盖|清空|迁移|批量.*(?:改|写|重命名)|凭据|密码|token|api\s*key|权限|安全|隐私|生产环境|上线|部署|服务器|数据库|备份|恢复|回滚|支付|合同|医疗|药物|delete|overwrite|migrat|credential|permission|security|privacy|production|deploy|database|backup|restore)/.source,
      weight: 45
    },
    {
      id: 'complex-reasoning',
      reasonCode: 'complex_reasoning',
      pattern: /(架构|系统设计|根因|复盘|取舍|权衡|多约束|长期方案|自动化|路由|批判|本质|交叉验证|architecture|root cause|trade[ -]?off|multi[ -]?constraint|research|cross[ -]?validate)/.source,
      weight: 35
    },
    {
      id: 'code-tools',
      reasonCode: 'code_or_tools',
      pattern: /(```|\b(?:typescript|javascript|python|react|electron|api|git|sql|docker|regex|json|yaml)\b|代码|源码|报错|测试|构建|编译|终端|命令|文件|网页|搜索)/.source,
      weight: 14
    }
  ],
  simpleRequestPatterns: [
    /^(你好|嗨|hello|hi|谢谢|感谢|好的|好|行|可以|收到|知道了|嗯|哦|翻译[:：]?|润色[:：]?|格式化[:：]?|任务完成了吗|下载好了吗)[？?！!。\s\S]{0,32}$/.source
  ],
  continuationPatterns: [
    /^(你)?(继续|接着|往下|照这个做|按这个来|继续执行|继续吧|开始吧|就这样做)[吧。！!\s]*$/.source,
    /^(continue|keep going|go on|proceed)[.!\s]*$/.source
  ],
  modeBias: { auto: 0, save: -28, quality: 25 },
  attachmentsWeight: 11,
  mediumMessageChars: 180,
  mediumMessageWeight: 16,
  longMessageChars: 600,
  longMessageWeight: 30,
  safetyFloorTierId: 'balanced',
  switchUpMargin: 10,
  switchDownMargin: 12,
  contextTokenStep: 4_000,
  maxContextPenalty: 20,
  largeContextStickyTokens: 32_000
}

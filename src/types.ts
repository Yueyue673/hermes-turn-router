export type RouterMode = 'auto' | 'save' | 'quality' | 'fixed' | 'off'

export interface ModelTarget {
  id: string
  label: string
  provider: string
  model: string
  reasoningEffort?: string
  minScore: number
}

export interface SignalRule {
  id: string
  reasonCode: string
  pattern: string
  flags?: string
  weight: number
  forceUpgrade?: boolean
}

export interface RouterPolicy {
  version: 1
  tiers: ModelTarget[]
  signals: SignalRule[]
  simpleRequestPatterns: string[]
  continuationPatterns: string[]
  modeBias: Record<Exclude<RouterMode, 'fixed' | 'off'>, number>
  attachmentsWeight: number
  mediumMessageChars: number
  mediumMessageWeight: number
  longMessageChars: number
  longMessageWeight: number
  safetyFloorTierId: string
  switchUpMargin: number
  switchDownMargin: number
  contextTokenStep: number
  maxContextPenalty: number
  /** Auto mode will not downgrade an established session above this size. */
  largeContextStickyTokens?: number
}

export interface RouterState {
  currentProvider?: string
  currentModel?: string
  currentReasoningEffort?: string
  turnsSinceSwitch?: number
}

export interface RouteInput {
  text: string
  mode: RouterMode
  policy: RouterPolicy
  state?: RouterState
  fixedTierId?: string
  oneShotTierId?: string
  hasAttachments?: boolean
  estimatedContextTokens?: number
  /** Server-verified targets available to this account/profile. */
  allowedTargetIds?: string[]
}

export interface RouteDecision {
  target: ModelTarget
  score: number
  rawTierId: string
  reasons: string[]
  switched: boolean
  hysteresisApplied: boolean
  contextPenalty: number
  cacheRisk: 'none' | 'low' | 'medium' | 'high'
}

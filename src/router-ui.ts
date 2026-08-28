export const ROUTER_CONTROL_MODES = ['auto', 'save', 'quality', 'off'] as const
export type RouterControlMode = typeof ROUTER_CONTROL_MODES[number]
export type RouterVisualState = 'checking' | 'ready' | 'routing' | 'bypass' | 'offline'
export type RouterStatusTone = 'good' | 'muted' | 'warn' | 'bad'

export const ROUTER_MODE_PRESENTATION: Record<RouterControlMode, {
  label: string
  description: string
  className: string
}> = {
  auto: {
    label: 'AUTO',
    description: 'Choose a target for every new turn.',
    className: 'border-primary/35 bg-primary/10 text-primary hover:bg-primary/15'
  },
  save: {
    label: 'SAVE',
    description: 'Prefer lower-cost targets while keeping safety floors.',
    className: 'border-emerald-500/35 bg-emerald-500/10 text-emerald-700 hover:bg-emerald-500/15 dark:text-emerald-300'
  },
  quality: {
    label: 'QUALITY',
    description: 'Bias each turn toward stronger targets.',
    className: 'border-amber-500/40 bg-amber-500/10 text-amber-800 hover:bg-amber-500/15 dark:text-amber-300'
  },
  off: {
    label: 'OFF',
    description: 'Use Hermes native model selection without routing.',
    className: 'border-border/60 bg-muted/25 text-muted-foreground hover:bg-muted/40'
  }
}

export function compactTargetLabel(label: string): string {
  const known: Record<string, string> = {
    'Luna · Medium': 'LUNA M',
    'Sol · Medium': 'SOL M',
    'Sol · High': 'SOL H',
    'Sol · Ultra': 'SOL ULTRA'
  }
  if (known[label]) return known[label]
  const words: string[] = []
  let word = ''
  for (const char of label.slice(0, 256)) {
    if (char === '·' || char.trim() === '') {
      if (word) words.push(word)
      word = ''
    } else {
      word += char
    }
  }
  if (word) words.push(word)
  const normalized = words.join(' ').toUpperCase()
  return normalized.length > 14 ? `${normalized.slice(0, 13)}…` : normalized
}

export function routerStatusTone(mode: RouterControlMode, state: RouterVisualState): RouterStatusTone {
  if (mode === 'off') return 'muted'
  if (state === 'offline') return 'bad'
  if (state === 'checking' || state === 'routing' || state === 'bypass') return 'warn'
  return 'good'
}

export function routerPillText(
  mode: RouterControlMode,
  state: RouterVisualState,
  lastTarget: string
): string {
  const label = ROUTER_MODE_PRESENTATION[mode].label
  if (mode === 'off') return `${label} · NATIVE`
  if (state === 'offline') return `${label} · OFFLINE`
  if (state === 'checking') return `${label} · CHECKING`
  if (state === 'routing') return `${label} · ROUTING`
  if (state === 'bypass') return `${label} · BYPASS`
  return lastTarget ? `${label} · ${compactTargetLabel(lastTarget)}` : label
}

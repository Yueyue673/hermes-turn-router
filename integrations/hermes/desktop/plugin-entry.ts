import {
  atom,
  Button,
  COMPOSER_AREAS,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  host,
  icons,
  StatusDot,
  Tip,
  cn,
  useValue
} from '@hermes/plugin-sdk'
import * as HermesSdk from '@hermes/plugin-sdk'
import { jsx, jsxs } from 'react/jsx-runtime'

import { OneShotController } from '../../../src/one-shot.js'
import { codexLunaSolPolicy } from '../../../src/presets.js'
import { bestCompatibleTargetId, compatibleTargetIds, requestHermesCapabilities } from '../../../src/capabilities.js'
import { routeMessageSafely } from '../../../src/safe-route.js'
import {
  DEFAULT_ROUTER_MODE,
  ROUTER_CONTROL_MODES,
  ROUTER_MODE_PRESENTATION,
  routerPillText,
  routerStatusTone,
  type RouterControlMode,
  type RouterVisualState
} from '../../../src/router-ui.js'
import type { RouterPolicy } from '../../../src/types.js'

declare const __HERMES_TURN_ROUTER_POLICY__: RouterPolicy | undefined

const desktopPolicy = typeof __HERMES_TURN_ROUTER_POLICY__ === 'undefined'
  ? codexLunaSolPolicy
  : __HERMES_TURN_ROUTER_POLICY__

const PLUGIN_ID = 'hermes-turn-router'
// `off` + Hermes' native model picker already provides a true fixed-model
// workflow. A second "fixed" mode without its own target picker was duplicate
// UI and silently forced `balanced`, so the Desktop surface no longer offers it.
const MODE_DOT_CLASS: Record<RouterControlMode, string> = {
  auto: 'bg-primary',
  save: 'bg-emerald-500',
  quality: 'bg-amber-500',
  off: 'bg-muted-foreground/45'
}
const $mode = atom<RouterControlMode>(DEFAULT_ROUTER_MODE)
const $oneShotArmed = atom(false)
const $availableTargets = atom<string[]>([])
const $bestTargetId = atom<string | undefined>(undefined)
const $status = atom('Checking Gateway capability…')
const $lastTarget = atom('')
const $visualState = atom<RouterVisualState>('checking')
const oneShot = new OneShotController()
let capabilityRefresh: Promise<boolean> | null = null

function targetLabel(targetId: string | undefined): string {
  return desktopPolicy.tiers.find(target => target.id === targetId)?.label ?? targetId ?? 'best target'
}

async function refreshCapabilities(attempts = 12): Promise<boolean> {
  if (capabilityRefresh) return capabilityRefresh
  $visualState.set('checking')
  $status.set('Checking Gateway routing capability…')
  const task = (async () => {
    try {
      const response = await requestHermesCapabilities(
        () => host.request('router.capabilities', {}),
        { attempts, delayMs: 150 }
      )
      const compatibleTargets = compatibleTargetIds(response, desktopPolicy)
      $availableTargets.set(compatibleTargets)
      $bestTargetId.set(bestCompatibleTargetId(response, desktopPolicy))
      if (host.state.gateway.get() !== 'open') {
        $visualState.set('offline')
        $status.set('Gateway offline · native Hermes send remains available')
      } else if ($mode.get() === 'off') {
        $visualState.set('ready')
        $status.set(ROUTER_MODE_PRESENTATION.off.description)
      } else {
        $status.set(`${compatibleTargets.length}/${response.targets.length} targets compatible`)
        $visualState.set(compatibleTargets.length > 0 ? 'ready' : 'bypass')
      }
      return compatibleTargets.length > 0
    } catch (error) {
      $availableTargets.set([])
      $bestTargetId.set(undefined)
      if ($mode.get() === 'off') {
        $visualState.set('ready')
        $status.set(ROUTER_MODE_PRESENTATION.off.description)
      } else {
        $status.set(error instanceof Error ? error.message : String(error))
        $visualState.set(host.state.gateway.get() === 'open' ? 'bypass' : 'offline')
      }
      return false
    }
  })()
  capabilityRefresh = task
  try {
    return await task
  } finally {
    if (capabilityRefresh === task) capabilityRefresh = null
  }
}

function setMode(mode: RouterControlMode) {
  if ($mode.get() === mode) return
  $mode.set(mode)
  $lastTarget.set('')
  const presentation = ROUTER_MODE_PRESENTATION[mode]
  if (mode === 'off') {
    $visualState.set('ready')
    $status.set(presentation.description)
  } else if (host.state.gateway.get() === 'open') {
    void refreshCapabilities(4)
  } else {
    $visualState.set('offline')
    $status.set('Gateway offline · native Hermes send remains available')
  }
}

function RouterControls() {
  const mode = useValue($mode)
  const oneShotArmed = useValue($oneShotArmed)
  const status = useValue($status)
  const lastTarget = useValue($lastTarget)
  const availableTargets = useValue($availableTargets)
  const bestTargetId = useValue($bestTargetId)
  const gateway = useValue(host.state.gateway)
  const storedVisualState = useValue($visualState)
  const visualState = mode === 'off' ? 'ready' : storedVisualState
  const presentation = ROUTER_MODE_PRESENTATION[mode]
  const tone = routerStatusTone(mode, visualState)
  const pillText = routerPillText(mode, visualState, lastTarget)
  const stateClass = visualState === 'bypass'
    ? 'border-amber-500/45 bg-amber-500/12 text-amber-800 hover:bg-amber-500/18 dark:text-amber-300'
    : visualState === 'offline'
      ? 'border-destructive/45 bg-destructive/10 text-destructive hover:bg-destructive/15'
      : visualState === 'checking' || visualState === 'routing'
        ? 'border-amber-500/35 bg-amber-500/8 text-amber-800 hover:bg-amber-500/14 dark:text-amber-300'
        : presentation.className
  return jsxs('div', {
    className: 'flex items-center gap-1.5',
    children: [
      jsx(DropdownMenu, {
        children: jsxs('div', {
          children: [
            jsx(Tip, {
              label: `${status} · Click to change routing mode.`,
              side: 'top',
              children: jsx(DropdownMenuTrigger, {
                asChild: true,
                children: jsxs(Button, {
                  'aria-label': `Hermes Turn Router: ${pillText}. ${status}`,
                  className: cn(
                    'h-6 gap-1.5 rounded-[4px] px-2 font-semibold tracking-[0.035em] shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]',
                    stateClass
                  ),
                  size: 'xs',
                  type: 'button',
                  variant: 'outline',
                  children: [
                    jsx(StatusDot, {
                      className: cn(
                        MODE_DOT_CLASS[mode],
                        (visualState === 'checking' || visualState === 'routing') && 'animate-pulse'
                      ),
                      tone
                    }),
                    jsx('span', { 'aria-live': 'polite', children: pillText }),
                    jsx(icons.ChevronDown, { className: 'opacity-65' })
                  ]
                })
              })
            }),
            jsx(DropdownMenuContent, {
              align: 'end',
              className: 'min-w-64',
              side: 'top',
              children: ROUTER_CONTROL_MODES.map(value => {
                const item = ROUTER_MODE_PRESENTATION[value]
                return jsx(DropdownMenuItem, {
                  className: cn('py-2', mode === value && 'bg-accent/60'),
                  onSelect: () => setMode(value),
                  children: jsxs('div', {
                    className: 'flex min-w-0 items-start gap-2.5',
                    children: [
                      jsx(StatusDot, {
                        className: cn('mt-1.5', MODE_DOT_CLASS[value]),
                        tone: routerStatusTone(value, 'ready')
                      }),
                      jsxs('div', {
                        className: 'min-w-0',
                        children: [
                          jsxs('div', {
                            className: 'flex items-center gap-2 text-xs font-semibold',
                            children: [item.label, mode === value ? '✓' : '']
                          }),
                          jsx('div', {
                            className: 'mt-0.5 text-[0.625rem] leading-4 text-muted-foreground',
                            children: item.description
                          })
                        ]
                      })
                    ]
                  })
                }, value)
              })
            })
          ]
        })
      }),
      jsx(Tip, {
        label: oneShotArmed
          ? `Armed for ${targetLabel(bestTargetId)}. Click to cancel.`
          : `Use ${targetLabel(bestTargetId)} for the next accepted turn.`,
        side: 'top',
        children: jsxs(Button, {
          'aria-label': oneShotArmed ? 'Cancel Best once' : 'Arm Best once',
          className: cn(
            'h-6 rounded-[4px] px-2 font-semibold tracking-[0.035em]',
            oneShotArmed
              ? 'border-amber-500/45 bg-amber-500/12 text-amber-800 hover:bg-amber-500/18 dark:text-amber-300'
              : 'border-border/55 bg-background/35 text-muted-foreground hover:bg-accent/55 hover:text-foreground'
          ),
          disabled: gateway !== 'open' || mode === 'off' || !bestTargetId,
          onClick: () => {
            if (!bestTargetId) return
            if (oneShotArmed) {
              oneShot.disarm()
              $oneShotArmed.set(false)
            } else {
              oneShot.arm(bestTargetId)
              $oneShotArmed.set(true)
            }
          },
          size: 'xs',
          type: 'button',
          variant: 'outline',
          children: [
            jsx(StatusDot, {
              className: oneShotArmed ? 'animate-pulse bg-amber-500' : 'bg-muted-foreground/40',
              tone: oneShotArmed ? 'warn' : 'muted'
            }),
            oneShotArmed ? 'BEST · ARMED' : 'BEST ONCE'
          ]
        })
      })
    ]
  })
}

const plugin = {
  id: PLUGIN_ID,
  name: 'Hermes Turn Router',
  description: 'Per-turn model routing with cache-aware policies and Gateway-authorized targets.',
  defaultEnabled: true,
  register(ctx) {
    const stored = ctx.storage.get('settings', { mode: DEFAULT_ROUTER_MODE })
    const initialMode = ROUTER_CONTROL_MODES.includes(stored.mode as RouterControlMode)
      ? stored.mode as RouterControlMode
      : DEFAULT_ROUTER_MODE
    $mode.set(initialMode)
    $lastTarget.set('')
    $visualState.set(initialMode === 'off' ? 'ready' : 'checking')
    $status.set(initialMode === 'off'
      ? ROUTER_MODE_PRESENTATION.off.description
      : 'Checking Gateway routing capability…')
    const save = () => ctx.storage.set('settings', { mode: $mode.get() })
    ctx.onDispose($mode.listen(save))
    const consumeOneShot = (clientTurnId: string) => {
      if (!oneShot.accepted(clientTurnId)) return
      $oneShotArmed.set(false)
      $visualState.set('ready')
      const selected = $lastTarget.get() || 'best target'
      $status.set(`Best once consumed · ${selected}`)
    }
    const acceptedHook = (HermesSdk as unknown as {
      onTurnAccepted?: (listener: (clientTurnId: string) => void) => () => void
    }).onTurnAccepted
    if (typeof acceptedHook === 'function') {
      ctx.onDispose(acceptedHook(consumeOneShot))
    } else {
      $status.set('Restart Hermes to activate the per-turn routing SDK')
      $visualState.set('bypass')
    }
    ctx.onDispose(host.onEvent('turn.accepted', event => {
      const payload = event.payload as { client_turn_id?: string } | undefined
      if (payload?.client_turn_id) consumeOneShot(payload.client_turn_id)
    }))
    const onGateway = (state: string) => {
      if (state === 'open') {
        if ($mode.get() === 'off') {
          $visualState.set('ready')
          $status.set(ROUTER_MODE_PRESENTATION.off.description)
        } else {
          void refreshCapabilities()
        }
      } else {
        $availableTargets.set([])
        $bestTargetId.set(undefined)
        if ($mode.get() !== 'off') {
          $visualState.set('offline')
          $status.set('Gateway offline · native Hermes send remains available')
        }
      }
    }
    ctx.onDispose(host.state.gateway.listen(onGateway))
    onGateway(host.state.gateway.get())

    ctx.registerMany([
      { id: 'controls', area: COMPOSER_AREAS.actions, order: 40, render: () => jsx(RouterControls, {}) },
      {
        id: 'middleware',
        area: COMPOSER_AREAS.middleware,
        order: 10,
        data: {
          async handler(draft) {
            const mode = $mode.get()
            if (mode === 'off') {
              $visualState.set('ready')
              $status.set(ROUTER_MODE_PRESENTATION.off.description)
              return draft
            }
            const snapshot = oneShot.snapshot(draft.turnEnvelope.clientTurnId)
            let availableTargetIds = $availableTargets.get()
            if (!availableTargetIds.length) {
              await refreshCapabilities(4)
              availableTargetIds = $availableTargets.get()
            }
            if (!availableTargetIds.length) {
              oneShot.rejected(draft.turnEnvelope.clientTurnId)
              $lastTarget.set('bypass')
              $visualState.set('bypass')
              return draft
            }
            const reasoningState = (host.state as unknown as {
              reasoningEffort?: { get?: () => string }
            }).reasoningEffort
            $visualState.set('routing')
            $status.set(`${ROUTER_MODE_PRESENTATION[mode].label} · evaluating this turn…`)
            const routed = routeMessageSafely({
              text: draft.text,
              mode,
              policy: desktopPolicy,
              allowedTargetIds: availableTargetIds,
              ...(snapshot ? { oneShotTierId: snapshot.targetId } : {}),
              hasAttachments: Boolean(draft.attachments?.length),
              estimatedContextTokens: host.state.focusedUsage.get()?.context_used ?? 0,
              state: {
                currentModel: host.state.model.get(),
                currentProvider: host.state.provider.get(),
                currentReasoningEffort: reasoningState?.get?.()
              }
            })
            if (routed.error) {
              oneShot.rejected(draft.turnEnvelope.clientTurnId)
              if (snapshot) {
                oneShot.disarm()
                $oneShotArmed.set(false)
              }
              $lastTarget.set('bypass')
              $visualState.set('bypass')
              $status.set(`Policy mismatch: ${routed.error}`)
              return draft
            }
            const decision = routed.decision
            if (!decision) {
              $lastTarget.set('')
              $visualState.set('ready')
              $status.set('No routing decision · native Hermes send')
              return draft
            }
            $lastTarget.set(decision.target.label)
            $visualState.set('ready')
            $status.set(`${decision.target.label} · ${decision.reasons.join(', ')}`)
            return {
              ...draft,
              turnEnvelope: {
                ...draft.turnEnvelope,
                routingIntent: {
                  targetId: decision.target.id,
                  mode,
                  reasonCodes: [...decision.reasons]
                }
              }
            }
          }
        }
      }
    ])
  }
}

export default plugin

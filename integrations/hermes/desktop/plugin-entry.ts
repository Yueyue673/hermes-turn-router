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
  useValue
} from '@hermes/plugin-sdk'
import * as HermesSdk from '@hermes/plugin-sdk'
import { jsx, jsxs } from 'react/jsx-runtime'

import { OneShotController } from '../../../src/one-shot.js'
import { codexLunaSolPolicy } from '../../../src/presets.js'
import { routeMessage } from '../../../src/router.js'
import { requestHermesCapabilities } from '../../../src/capabilities.js'
import type { RouterPolicy } from '../../../src/types.js'

declare const __HERMES_TURN_ROUTER_POLICY__: RouterPolicy | undefined

const desktopPolicy = typeof __HERMES_TURN_ROUTER_POLICY__ === 'undefined'
  ? codexLunaSolPolicy
  : __HERMES_TURN_ROUTER_POLICY__

const PLUGIN_ID = 'hermes-turn-router'
// `off` + Hermes' native model picker already provides a true fixed-model
// workflow. A second "fixed" mode without its own target picker was duplicate
// UI and silently forced `balanced`, so the Desktop surface no longer offers it.
const MODES = ['auto', 'save', 'quality', 'off']
const $mode = atom('auto')
const $oneShotArmed = atom(false)
const $availableTargets = atom([])
const $status = atom('Checking Gateway capability…')
const $lastTarget = atom('')
const oneShot = new OneShotController()
let capabilityRefresh: Promise<boolean> | null = null

async function refreshCapabilities(attempts = 12): Promise<boolean> {
  if (capabilityRefresh) return capabilityRefresh
  const task = (async () => {
    try {
      const response = await requestHermesCapabilities(
        () => host.request('router.capabilities', {}),
        { attempts, delayMs: 150 }
      )
      $availableTargets.set(
        response.targets
          .filter(target => target.enabled && !target.requires_approval)
          .map(target => target.id)
      )
      $status.set(`${response.targets.length} targets available`)
      return true
    } catch (error) {
      $availableTargets.set([])
      $status.set(error instanceof Error ? error.message : String(error))
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

function setMode(mode) {
  $mode.set(mode)
}

function RouterControls() {
  const mode = useValue($mode)
  const oneShotArmed = useValue($oneShotArmed)
  const status = useValue($status)
  const lastTarget = useValue($lastTarget)
  const availableTargets = useValue($availableTargets)
  const gateway = useValue(host.state.gateway)
  const bestTargetId = [...desktopPolicy.tiers]
    .reverse()
    .find(target => availableTargets.includes(target.id))?.id
  return jsxs('div', {
    className: 'flex items-center gap-1',
    title: status,
    children: [
      jsx(DropdownMenu, {
        children: jsxs('div', {
          children: [
            jsx(DropdownMenuTrigger, {
              asChild: true,
              children: jsxs(Button, {
                'aria-label': 'Hermes Turn Router mode',
                disabled: gateway !== 'open',
                size: 'xs',
                type: 'button',
                variant: 'ghost',
                children: [
                  jsx(icons.Brain, {}),
                  `Router · ${mode}${lastTarget ? ` → ${lastTarget}` : ''}`,
                  jsx(icons.ChevronDown, {})
                ]
              })
            }),
            jsx(DropdownMenuContent, {
              align: 'end',
              side: 'top',
              children: MODES.map(value => jsx(DropdownMenuItem, {
                onSelect: () => setMode(value),
                children: `${mode === value ? '✓ ' : ''}${value}`
              }, value))
            })
          ]
        })
      }),
      jsx(Button, {
        disabled: gateway !== 'open' || !bestTargetId,
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
        variant: oneShotArmed ? 'secondary' : 'ghost',
        children: oneShotArmed ? 'Best ✓' : 'Best once'
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
    const stored = ctx.storage.get('settings', { mode: 'auto' })
    $mode.set(MODES.includes(stored.mode) ? stored.mode : 'auto')
    const save = () => ctx.storage.set('settings', { mode: $mode.get() })
    ctx.onDispose($mode.listen(save))
    const acceptedHook = (HermesSdk as unknown as {
      onTurnAccepted?: (listener: (clientTurnId: string) => void) => () => void
    }).onTurnAccepted
    if (typeof acceptedHook === 'function') {
      ctx.onDispose(acceptedHook(clientTurnId => {
        if (oneShot.accepted(clientTurnId)) $oneShotArmed.set(false)
      }))
    } else {
      $status.set('Restart Hermes to activate the per-turn routing SDK')
    }
    ctx.onDispose(host.onEvent('turn.accepted', event => {
      const payload = event.payload as { client_turn_id?: string } | undefined
      if (payload?.client_turn_id && oneShot.accepted(payload.client_turn_id)) {
        $oneShotArmed.set(false)
      }
    }))
    const onGateway = state => {
      if (state === 'open') void refreshCapabilities()
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
            if (mode === 'off') return draft
            const snapshot = oneShot.snapshot(draft.turnEnvelope.clientTurnId)
            let availableTargetIds = $availableTargets.get()
            if (!availableTargetIds.length) {
              await refreshCapabilities(4)
              availableTargetIds = $availableTargets.get()
            }
            if (!availableTargetIds.length) {
              oneShot.rejected(draft.turnEnvelope.clientTurnId)
              $lastTarget.set('bypass')
              host.notify({ kind: 'warning', message: `Router bypassed: ${$status.get()}` })
              return draft
            }
            const reasoningState = (host.state as unknown as {
              reasoningEffort?: { get?: () => string }
            }).reasoningEffort
            const decision = routeMessage({
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
            if (!decision) return draft
            $lastTarget.set(decision.target.label)
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

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
import { validateHermesCapabilities } from '../../../src/capabilities.js'

const PLUGIN_ID = 'hermes-turn-router'
const MODES = ['auto', 'save', 'quality', 'fixed', 'off']
const $mode = atom('auto')
const $fixedTarget = atom('balanced')
const $oneShotArmed = atom(false)
const $availableTargets = atom([])
const $status = atom('Checking Gateway capability…')
const oneShot = new OneShotController()

async function refreshCapabilities() {
  try {
    const response = validateHermesCapabilities(await host.request('router.capabilities', {}))
    $availableTargets.set(
      response.targets
        .filter(target => target.enabled && !target.requires_approval)
        .map(target => target.id)
    )
    $status.set(`${response.targets.length} targets available`)
  } catch (error) {
    $availableTargets.set([])
    $status.set(error instanceof Error ? error.message : String(error))
  }
}

function setMode(mode) {
  $mode.set(mode)
}

function RouterControls() {
  const mode = useValue($mode)
  const oneShotArmed = useValue($oneShotArmed)
  const status = useValue($status)
  const gateway = useValue(host.state.gateway)
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
                children: [jsx(icons.Brain, {}), `Router · ${mode}`, jsx(icons.ChevronDown, {})]
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
        disabled: gateway !== 'open',
        onClick: () => {
          if (oneShotArmed) {
            oneShot.disarm()
            $oneShotArmed.set(false)
          } else {
            oneShot.arm('premium')
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
    const stored = ctx.storage.get('settings', { fixedTarget: 'balanced', mode: 'auto' })
    $mode.set(MODES.includes(stored.mode) ? stored.mode : 'auto')
    $fixedTarget.set(typeof stored.fixedTarget === 'string' ? stored.fixedTarget : 'balanced')
    const save = () => ctx.storage.set('settings', { fixedTarget: $fixedTarget.get(), mode: $mode.get() })
    ctx.onDispose($mode.listen(save))
    ctx.onDispose($fixedTarget.listen(save))
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
          handler(draft) {
            const mode = $mode.get()
            if (mode === 'off') return draft
            const snapshot = oneShot.snapshot(draft.turnEnvelope.clientTurnId)
            const availableTargetIds = $availableTargets.get()
            if (!availableTargetIds.length) {
              oneShot.rejected(draft.turnEnvelope.clientTurnId)
              host.notify({ kind: 'error', message: $status.get() })
              return null
            }
            const decision = routeMessage({
              text: draft.text,
              mode,
              policy: codexLunaSolPolicy,
              allowedTargetIds: availableTargetIds,
              ...(mode === 'fixed' ? { fixedTierId: $fixedTarget.get() } : {}),
              ...(snapshot ? { oneShotTierId: snapshot.targetId } : {}),
              hasAttachments: Boolean(draft.attachments?.length),
              estimatedContextTokens: host.state.focusedUsage.get()?.context_used ?? 0,
              state: {
                currentModel: host.state.model.get(),
                currentProvider: host.state.provider.get()
              }
            })
            if (!decision) return draft
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

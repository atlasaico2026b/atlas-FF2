// SPDX-License-Identifier: Apache-2.0
import { X, Trash2, MapPin, Lock, Gauge } from 'lucide-react'
import { Separator } from '@/components/ui/separator'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import SchematicIcon from '@/components/SchematicIcon'
import { cn } from '@/lib/cn'
import {
  PIPE_POINT_ITEMS, PIPE_POINT_GROUPS,
  canFitPointItem, togglePointItem,
} from '@/lib/pipePoints'
import {
  specFields, resolveSpec, fittingFlow, defaultFlowFor,
  specOutlets, isDischargeFitting, sanitizeNodeSpecs,
} from '@/lib/pipePointSpecs'
import type { PipePointSpec } from '@/lib/pipePointSpecs'
import type { PipeNode } from '@/lib/pipeNodeTypes'

interface PointEditorProps {
  node: PipeNode
  pipeLabel?: string
  pipeSize?: string
  onUpdate: (pipeId: string, nodeId: string, updates: Partial<PipeNode>) => void
  onDelete: (pipeId: string, nodeId: string) => void
  onClose: () => void
}

const FA_DIGITS = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹']
const faNum = (n: number) => String(n).replace(/\d/g, d => FA_DIGITS[Number(d)])

interface SpecEditorProps {
  id: string
  spec: PipePointSpec
  onChange: (key: string, value: number) => void
}

/**
 * The numbers a fitting needs to be countable: its outlet size, and — for a
 * monitor or hydrant — how much water that outlet throws.
 */
function SpecEditor({ id, spec, onChange }: SpecEditorProps) {
  const fields = specFields(id)
  if (!fields.length) return null
  const flow = fittingFlow(id, spec)
  const outlets = specOutlets(id)

  return (
    <div className="mt-1 mr-9 rounded-xl border border-sky-100 bg-white p-2 space-y-2">
      {fields.map(f => (
        <div key={f.key} className="flex items-center gap-2">
          <Label className="text-[10px] text-gray-500 w-[68px] flex-shrink-0">{f.label}</Label>
          {f.sizes ? (
            <div className="flex flex-wrap gap-1">
              {f.sizes.map(s => (
                <button
                  key={s}
                  type="button"
                  onClick={() => onChange(f.key, s)}
                  className={cn(
                    'px-2 h-6 rounded-lg border text-[10px] tabular-nums transition',
                    Number(spec[f.key]) === s
                      ? 'border-sky-400 bg-sky-50 text-sky-700 font-medium'
                      : 'border-gray-200 text-gray-500 hover:bg-gray-50',
                  )}
                >
                  {s}"
                </button>
              ))}
            </div>
          ) : (
            <div className="flex items-center gap-1 flex-1 min-w-0">
              <Input
                type="number"
                value={spec[f.key] === undefined ? '' : String(spec[f.key])}
                min={f.min}
                max={f.max}
                step={f.step}
                onChange={e => onChange(f.key, Number(e.target.value))}
                className="h-7 text-[11px] tabular-nums"
                dir="ltr"
                aria-label={`${id}-${f.key}`}
              />
              {f.unit && <span className="text-[10px] text-gray-400 whitespace-nowrap">{f.unit}</span>}
            </div>
          )}
        </div>
      ))}
      {isDischargeFitting(id) && (
        <div className="flex items-center gap-1 pt-1.5 border-t border-gray-100 text-[10px] text-emerald-700">
          <Gauge className="w-3 h-3 flex-shrink-0" />
          <span>
            دبی این آیتم: <span className="font-bold tabular-nums">{flow}</span> L/min
            {outlets > 1 && <span className="text-gray-400"> ({outlets} خروجی)</span>}
          </span>
        </div>
      )}
    </div>
  )
}

export default function PointEditor({ node, pipeLabel, pipeSize, onUpdate, onDelete, onClose }: PointEditorProps) {
  const items = node.items || []
  const specs = node.specs || {}

  /** «یکی از ۳» label for rows that belong to an exclusive group. */
  const groupHint = (id: string): string | null => {
    const g = PIPE_POINT_GROUPS.find(gr => gr.includes(id))
    return g ? `یکی از ${faNum(g.length)}` : null
  }

  // Ticking or unticking also drops/creates the fitting's spec entry, so a
  // node never carries numbers for a fitting that is no longer on it.
  const setItems = (next: string[]) => onUpdate(node.pipeId, node.id, {
    items: next,
    specs: sanitizeNodeSpecs(next, specs),
  })

  const setSpec = (id: string, key: string, value: number) => {
    const current = resolveSpec(id, specs[id])
    const updated: PipePointSpec = { ...current, [key]: value }
    // Picking an outlet size re-fills the flow from that size, so the demand
    // stays plausible unless the designer overrides it deliberately.
    if (key === 'size') {
      const implied = defaultFlowFor(id, value)
      if (implied !== undefined) updated.flow = implied
    }
    onUpdate(node.pipeId, node.id, { specs: sanitizeNodeSpecs(items, { ...specs, [id]: updated }) })
  }

  const nodeFlow = items.reduce((sum, id) => sum + fittingFlow(id, specs[id]), 0)
  const hasDischarge = items.some(isDischargeFitting)

  return (
    <div className="fixed inset-y-0 left-0 z-50 w-80 max-w-[92vw] flex flex-col shadow-2xl bg-white/95 backdrop-blur-xl border-r border-gray-200">
      <div className="flex items-center justify-between p-3 border-b border-gray-100">
        <div className="flex items-center gap-2">
          <MapPin className="w-4 h-4 text-sky-500" />
          <h3 className="font-bold text-gray-700 text-sm">گره روی لوله (Point)</h3>
        </div>
        <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-lg">
          <X className="w-4 h-4 text-gray-400" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        <div className="px-3 py-2 bg-sky-50 rounded-xl border border-sky-100 space-y-1">
          <div className="text-[11px] text-sky-700">
            لوله: <span className="font-medium">{pipeLabel || '—'}</span>
            {pipeSize ? ` (${pipeSize})` : ''}
          </div>
          <div className="text-[10px] text-sky-500" dir="ltr">
            X: {Math.round(node.x)}px &nbsp; Y: {Math.round(node.y)}px
          </div>
        </div>

        <Separator />

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-gray-500 uppercase tracking-wide">تجهیزات این گره</span>
            <span className="text-[10px] text-gray-400">{items.length} انتخاب</span>
          </div>

          <div className="space-y-1">
            {PIPE_POINT_ITEMS.map(item => {
              const active = items.includes(item.id)
              const verdict = canFitPointItem(items, item.id)
              const locked = !active && !verdict.ok
              const hint = groupHint(item.id)
              // Rows inside the same exclusive group stay live, so one tick swaps
              // the fitting rather than asking the user to untick first.
              const swappable = !active && !locked && !!hint && hint.startsWith('یکی از')

              return (
                <div key={item.id}>
                  <label
                    title={locked ? verdict.reason : undefined}
                    className={cn(
                      'flex items-center gap-2 p-2 rounded-xl border transition-all',
                      active && 'border-sky-300 bg-sky-50',
                      !active && !locked && 'border-gray-200 bg-gray-50 hover:bg-white cursor-pointer',
                      locked && 'border-gray-100 bg-gray-50/60 opacity-60 cursor-not-allowed',
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={active}
                      disabled={locked}
                      onChange={() => setItems(togglePointItem(items, item.id))}
                      className="w-4 h-4 rounded border-gray-300 text-sky-600 focus:ring-sky-500 disabled:cursor-not-allowed"
                    />
                    <span className="w-7 h-7 flex items-center justify-center flex-shrink-0">
                      <SchematicIcon id={item.id} color={item.color} size={26} />
                    </span>
                    <span className={cn('text-xs flex-1', active ? 'text-sky-700 font-medium' : 'text-gray-600')}>
                      {item.label}
                    </span>
                    {swappable && (
                      <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 whitespace-nowrap">
                        {hint}
                      </span>
                    )}
                    <span className="text-[9px] text-gray-400 font-mono">{item.short}</span>
                    {locked && <Lock className="w-3 h-3 text-amber-500 flex-shrink-0" />}
                  </label>
                  {locked && verdict.reason && (
                    <div className="mt-0.5 mb-1 pr-8 text-[10px] text-amber-600">{verdict.reason}</div>
                  )}
                  {active && (
                    <SpecEditor
                      id={item.id}
                      spec={resolveSpec(item.id, specs[item.id])}
                      onChange={(key, value) => setSpec(item.id, key, value)}
                    />
                  )}
                </div>
              )
            })}
          </div>
        </div>

        {items.length > 0 ? (
          <div className="px-3 py-2 bg-emerald-50 rounded-xl border border-emerald-100">
            <span className="text-[10px] text-emerald-700 block mb-2">شمای این گره روی نقشه:</span>
            <div className="flex items-center gap-2 flex-wrap">
              {items.map(id => {
                const def = PIPE_POINT_ITEMS.find(i => i.id === id)
                if (!def) return null
                return (
                  <span key={id} className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-white border border-emerald-100">
                    <SchematicIcon id={id} color={def.color} size={22} />
                    <span className="text-[10px] text-emerald-800">{def.label}</span>
                  </span>
                )
              })}
            </div>
            {hasDischarge && (
              <div className="mt-2 pt-2 border-t border-emerald-200 flex items-center justify-between text-[11px] text-emerald-800">
                <span className="flex items-center gap-1">
                  <Gauge className="w-3 h-3" />
                  جمع دبی این گره
                </span>
                <span className="font-bold tabular-nums">{nodeFlow} L/min</span>
              </div>
            )}
          </div>
        ) : (
          <div className="px-3 py-2 bg-gray-50 rounded-xl border border-gray-100">
            <span className="text-[10px] text-gray-500">
              هنوز تجهیزی انتخاب نشده — گره روی نقشه فقط یک نقطه اتصال است.
            </span>
          </div>
        )}
      </div>

      <div className="p-4 border-t border-gray-100">
        <button
          onClick={() => onDelete(node.pipeId, node.id)}
          className="w-full flex items-center justify-center gap-1 h-9 rounded-xl border border-red-200 text-red-500 text-xs hover:bg-red-50 transition"
        >
          <Trash2 className="w-3.5 h-3.5" />
          حذف گره
        </button>
      </div>
    </div>
  )
}

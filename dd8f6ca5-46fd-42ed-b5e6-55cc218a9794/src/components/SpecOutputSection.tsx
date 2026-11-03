// SPDX-License-Identifier: Apache-2.0
// ═══════════════════════════════════════════════════════════════════
// SPECIFICATION OUTPUT — all twenty outputs of §4.1
//
// Renders the complete output matrix for every tank on the map, straight from
// `runProjectSpec`. Each row shows the value, the §13 status, the §4 formula ids
// that produced it, and the §3.x reference tables it was read from — because
// §17 rule 14 requires the source ids to be visible, not merely recorded.
// ═══════════════════════════════════════════════════════════════════

import { useMemo } from 'react'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { AlertTriangle, Ban, CheckCircle2, Info, Sigma, BookOpen } from 'lucide-react'
import { runProjectSpec, type PlacedElement } from '@/lib/specProject'
import type { SpecOutput, SpecRun } from '@/lib/spec/engine'
import { FORMULA_BY_ID, SPEC_RULES, SPEC_SOURCE_DOCUMENT, sectionRef } from '@/lib/spec'

interface Props {
  project: any
  elements: PlacedElement[]
}

const STATUS_META: Record<string, { label: string; className: string; Icon: typeof Ban }> = {
  VALID: { label: 'معتبر', className: 'border-emerald-300 bg-emerald-50 text-emerald-700', Icon: CheckCircle2 },
  VELOCITY_LIMIT_EXCEEDED: { label: 'سرعت بیش از حد', className: 'border-amber-300 bg-amber-50 text-amber-700', Icon: AlertTriangle },
  JOCKEY_BASIS_REQUIRED: { label: 'مبنای پمپ جاکی', className: 'border-amber-300 bg-amber-50 text-amber-700', Icon: Info },
  INPUT_REQUIRED: { label: 'ورودی لازم', className: 'border-red-300 bg-red-50 text-red-700', Icon: Ban },
  INPUT_OUT_OF_RANGE: { label: 'خارج از بازه', className: 'border-red-300 bg-red-50 text-red-700', Icon: Ban },
  STANDARD_VALUE_NOT_DEFINED: { label: 'مقدار استاندارد تعریف نشده', className: 'border-red-300 bg-red-50 text-red-700', Icon: Ban },
  METHOD_NOT_PERMITTED: { label: 'روش مجاز نیست', className: 'border-red-300 bg-red-50 text-red-700', Icon: Ban },
  HYDRAULIC_PRESSURE_FAIL: { label: 'فشار هیدرولیکی تأمین نشد', className: 'border-red-300 bg-red-50 text-red-700', Icon: Ban },
  COVERAGE_FAIL: { label: 'پوشش ناقص', className: 'border-red-300 bg-red-50 text-red-700', Icon: Ban },
}

const statusMeta = (s: string) => STATUS_META[s] ?? { label: s, className: 'border-gray-300 bg-gray-50 text-gray-700', Icon: Info }

const nf = (n: number) => n.toLocaleString('en-US')

function OutputRow({ o }: { o: SpecOutput }) {
  const meta = statusMeta(o.status)
  const Icon = meta.Icon
  return (
    <div className="border-b border-gray-100 last:border-0 py-2.5">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span className="font-mono text-[10px] text-gray-400">{o.id}</span>
        <span className="text-[12px] font-semibold text-gray-800 flex-1 min-w-[140px]">{o.label}</span>
        <span className="font-mono text-[13px] font-bold text-gray-900" dir="ltr">
          {o.display}
        </span>
        <span className="text-[10px] text-gray-500">{o.unit}</span>
        <Badge variant="outline" className={`text-[9px] shrink-0 ${meta.className}`}>
          <Icon className="w-2.5 h-2.5 ml-0.5" />
          {meta.label}
        </Badge>
      </div>

      <div className="mt-1 font-mono text-[10px] text-sky-700 bg-sky-50/60 rounded px-1.5 py-1 leading-relaxed break-words" dir="ltr">
        {o.substitution}
      </div>

      {o.note && <div className="mt-1 text-[10px] text-gray-500 leading-relaxed">{o.note}</div>}

      <div className="mt-1 flex flex-wrap gap-1.5">
        {o.formulaIds.map((f) => (
          <span key={f} className="inline-flex items-center gap-0.5 rounded bg-violet-50 text-violet-700 px-1.5 py-0.5 text-[9px] font-mono" title={FORMULA_BY_ID[f]?.expression}>
            <Sigma className="w-2.5 h-2.5" />
            {f}
          </span>
        ))}
        {o.referenceIds.map((r) => (
          <span key={r} className="inline-flex items-center gap-0.5 rounded bg-amber-50 text-amber-700 px-1.5 py-0.5 text-[9px] font-mono" title={sectionRef(r)}>
            <BookOpen className="w-2.5 h-2.5" />
            {r.startsWith('T') || r.startsWith('GEOM') ? r : sectionRef(r)}
          </span>
        ))}
      </div>
    </div>
  )
}

function RunBlock({ run }: { run: SpecRun }) {
  const counts = run.statusCounts
  return (
    <div className="rounded-xl border border-gray-200 overflow-hidden">
      <div className="bg-gray-50 px-3 py-2 flex flex-wrap items-center gap-2">
        <span className="text-[12px] font-bold text-gray-800">{run.tankLabel}</span>
        <span className="text-[10px] text-gray-400 font-mono" dir="ltr">
          ⌀{run.geometry.diameterM}m × {run.geometry.shellHeightM}m
        </span>
        <Badge variant="outline" className="text-[9px] font-mono">{run.scenarioId}</Badge>
        <span className="text-[10px] text-gray-500">— {run.scenario.foamMethod || '—'}</span>
        <span className="text-[10px] text-gray-400 mr-auto font-mono" dir="ltr">
          {run.fuel.name} · {run.classification.cls}
        </span>
      </div>

      <div className="px-3 py-1.5 bg-white border-b border-gray-100">
        <div className="text-[10px] text-gray-500 leading-relaxed">
          <b className="text-gray-700">طبقهبندی NFPA 30:</b> {run.classification.reason}
          <span className="font-mono text-[9px] text-amber-600 mr-1"> §3.0A</span>
        </div>
        <div className="text-[10px] text-gray-500 leading-relaxed mt-0.5">
          <b className="text-gray-700">ناحیه حفاظتشده:</b> {run.scenario.protectedArea} — {run.scenario.specialLogic}
        </div>
        {run.classification.boilingPointAssumed && (
          <div className="text-[10px] text-amber-700 mt-0.5">
            ⚠ نقطه جوش ثبت نشده — طبقه IA/IB نیازمند تأیید BP است
          </div>
        )}
      </div>

      <div className="px-3 pb-1">
        {run.outputs.map((o) => (
          <OutputRow key={o.id} o={o} />
        ))}
      </div>

      <div className="bg-gray-50 px-3 py-2 flex flex-wrap gap-3 text-[10px]">
        {Object.entries(counts).map(([k, v]) => {
          const m = statusMeta(k)
          return (
            <span key={k} className={m.className.split(' ').filter((c) => c.startsWith('text-')).join(' ')}>
              {m.label}: <b>{v}</b>
            </span>
          )
        })}
      </div>
    </div>
  )
}

export default function SpecOutputSection({ project, elements }: Props) {
  const result = useMemo(() => runProjectSpec(project, elements), [project, elements])

  if (!result.runs.length) {
    return (
      <div className="rounded-xl border border-amber-300 bg-amber-50 p-3">
        <div className="flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
          <div className="text-[11px] text-amber-800 leading-relaxed">
            خروجی موتور استاندارد تولید نشد.
            {result.notes.map((n, i) => (
              <div key={i}>• {n}</div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  const totals = result.runs.reduce<Record<string, number>>((acc, r) => {
    for (const [k, v] of Object.entries(r.statusCounts)) acc[k] = (acc[k] ?? 0) + v
    return acc
  }, {})

  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2">
        <Sigma className="w-4 h-4 text-sky-600" />
        <h3 className="font-bold text-gray-800 text-[13px]">خروجی موتور محاسبات استاندارد</h3>
        <Badge variant="outline" className="text-[9px] mr-auto font-mono" dir="ltr">
          §4.1 · {result.runs[0]?.outputs.length ?? 0} outputs
        </Badge>
      </div>

      {/* Standards profile the run was executed against */}
      <div className="rounded-lg border border-gray-200 bg-gray-50 p-2.5">
        <div className="text-[10px] font-semibold text-gray-600 mb-1">پروفایل استاندارد قفلشده</div>
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-[10px] font-mono text-gray-700" dir="ltr">
          <span>NFPA 11 — {result.config.profile.nfpa11}</span>
          <span>NFPA 15 — {result.config.profile.nfpa15}</span>
          <span>NFPA 30 — {result.config.profile.nfpa30}</span>
          <span>NFPA 20 — {result.config.profile.nfpa20}</span>
          <span>NFPA 22 — {result.config.profile.nfpa22}</span>
          <span>NFPA 24 — {result.config.profile.nfpa24}</span>
        </div>
        <div className="text-[9px] text-gray-400 mt-1 font-mono" dir="ltr">
          ref: {SPEC_SOURCE_DOCUMENT}
        </div>
      </div>

      {result.runs.map((run, i) => (
        <RunBlock key={i} run={run} />
      ))}

      {/* Site totals across every tank */}
      {result.runs.length > 1 && (
        <div className="rounded-lg border border-sky-200 bg-sky-50 p-2.5">
          <div className="text-[10px] font-semibold text-sky-800 mb-1">
            جمع وضعیتها روی {result.runs.length} مخزن
          </div>
          <div className="flex flex-wrap gap-3 text-[10px]">
            {Object.entries(totals).map(([k, v]) => {
              const m = statusMeta(k)
              return (
                <span key={k} className={m.className.split(' ').filter((c) => c.startsWith('text-')).join(' ')}>
                  {m.label}: <b>{v}</b>
                </span>
              )
            })}
          </div>
        </div>
      )}

      {/* Demand build-up, per SITE-001 / SITE-007 */}
      {result.runs[0] && (
        <div className="rounded-lg border border-gray-200 p-2.5">
          <div className="text-[10px] font-semibold text-gray-600 mb-1.5">
            ساختار دبی طراحی (SITE-001 / SITE-007)
          </div>
          <div className="space-y-1">
            {result.runs[0].demandTerms.map((t, i) => (
              <div key={i} className="flex items-baseline gap-2 text-[10px]">
                <span className="text-gray-600 flex-1 min-w-[120px]">{t.label}</span>
                <span className="font-mono text-gray-800">{nf(Number(t.lpm.toFixed(1)))} L/min</span>
                {t.formulaId && (
                  <span className="font-mono text-[9px] text-violet-600">{t.formulaId}</span>
                )}
              </div>
            ))}
            <Separator className="my-1" />
            <div className="flex items-baseline gap-2 text-[11px] font-bold">
              <span className="text-gray-800 flex-1">جمع (بدترین حالت)</span>
              <span className="font-mono text-sky-700">
                {nf(Number(result.runs[0].demandTerms.reduce((s, t) => s + t.lpm, 0).toFixed(1)))} L/min
              </span>
            </div>
          </div>
        </div>
      )}

      {/* §17 non-negotiable rules — transcribed from the specification */}
      <details className="rounded-lg border border-gray-200 p-2.5">
        <summary className="text-[10px] font-semibold text-gray-600 cursor-pointer">
          قواعد غیرقابلمذاکره موتور (§17) — {SPEC_RULES.length} مورد
        </summary>
        <ol className="mt-2 space-y-1 text-[10px] text-gray-600 leading-relaxed" dir="ltr">
          {SPEC_RULES.map((r) => (
            <li key={r.n} className="flex gap-1.5">
              <span className="font-mono text-gray-400 shrink-0">{r.n}.</span>
              <span>{r.text}</span>
            </li>
          ))}
        </ol>
      </details>
    </section>
  )
}

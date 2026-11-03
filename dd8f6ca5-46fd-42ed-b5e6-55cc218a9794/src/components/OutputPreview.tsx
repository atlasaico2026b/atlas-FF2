// SPDX-License-Identifier: Apache-2.0
import { useMemo, useRef, useCallback, useState } from 'react'
import { X, Printer, Droplets, Flame, Package, GitBranch, MapPin, Gauge, Ruler, ShieldAlert, Ban, AlertTriangle, Info, Download } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { Badge } from '@/components/ui/badge'
import type { DesignElement, PipeSegment } from './DesignWorkspace'
import { PIPE_POINT_ITEMS } from '@/lib/pipePoints'
import { collectFittingStats } from '@/lib/fittingStats'
import { specSummary, fittingFlow } from '@/lib/pipePointSpecs'
import { ELEMENT_LABELS } from '@/lib/equipmentSvgData'
import {
  calcCoolingNozzleCount,
} from '@/lib/fireCalculations'
import { defaultSpecConfig, specRunForElement } from '@/lib/specProject'
import { isFireSystemActive, type FireSystemId } from '@/lib/fireSystemRules'

/**
 * Foam outlet counts come from the specification engine. The site terms in the
 * configuration do not enter a tank-level outlet count, so the default is enough
 * here — a caller sizing a pump must pass the project's own config.
 */
const SPEC_CONFIG = defaultSpecConfig()
import type { DesignBasis, ResultStatus } from '@/lib/calc/provenance'
import { RESULT_STATUS_LABELS, SOURCE_LABELS, STATUS_LABELS } from '@/lib/calc/provenance'
import { computeWaterSpray } from '@/lib/calc/nfpa15'
import { fireWaterDemand } from '@/lib/calc/demand'
import { demandInputFromNodes, countBuiltInEstimates, countDischargeFittings, defaultScenarioLabel } from '@/lib/demandFromNodes'
import { defaultBasis } from '@/lib/calc/basis'
import SpecOutputSection from './SpecOutputSection'
import { buildReport, sectionFromWaterSpray, sectionFromDemand, basisAsTable, CALC_ENGINE_VERSION } from '@/lib/calc/report'
import { CONSTANTS_VERSION } from '@/lib/calc/constants'
import type { ValidationIssue, ValidationResult } from '@/lib/calc/validate'

interface OutputPreviewProps {
  project: any
  elements: DesignElement[]
  pipes: PipeSegment[]
  zones: Record<string, string>
  basis?: DesignBasis
  worstCaseResult?: any
  validation?: ValidationResult | null
  onClose: () => void
}

const ISSUE_META: Record<ValidationIssue['severity'], { label: string; className: string; Icon: typeof Ban }> = {
  blocking: { label: 'بازدارنده', className: 'border-red-300 bg-red-50 text-red-700', Icon: Ban },
  warning: { label: 'هشدار', className: 'border-amber-300 bg-amber-50 text-amber-700', Icon: AlertTriangle },
  info: { label: 'اطلاع', className: 'border-sky-300 bg-sky-50 text-sky-700', Icon: Info },
}

interface EquipmentRow {
  type: string
  label: string
  count: number
  systems: string[]
  specs: string
}

const SYSTEM_LABELS: Record<string, string> = {
  cooling: 'کولینگ',
  foam_chamber: 'فوم چمبر',
  co2_system: 'CO₂ اتوماتیک',
  sprinkler: 'اسپرینکلر',
}

export default function OutputPreview({ project, elements, pipes, zones, basis, worstCaseResult, validation, onClose }: OutputPreviewProps) {
  const [capturedCanvasImage, setCapturedCanvasImage] = useState<string | null>(null)
  const [mapPreviewOpen, setMapPreviewOpen] = useState(false)

  const captureDesignCanvasImage = useCallback(async () => {
    const canvasContainer = document.getElementById('design-canvas-container') as HTMLElement | null
    if (!canvasContainer) {
      throw new Error('نقشه طراحی یافت نشد')
    }

    const canvas = canvasContainer.querySelector('canvas') as HTMLCanvasElement | null
    if (!canvas) {
      throw new Error('canvas نقشه پیدا نشد')
    }

    const dataUrl = canvas.toDataURL('image/png')

    const decode = (src: string) =>
      new Promise<HTMLImageElement>((resolve, reject) => {
        const img = new Image()
        img.onload = () => resolve(img)
        img.onerror = () => reject(new Error('بارگذاری تصویر برای آماده‌سازی پیش‌نمایش شکست خورد'))
        img.src = src
      })

    const img = await decode(dataUrl)

    // Add extra padding on top/bottom so the printed/downloaded frame matches
    // the container the user sees (especially near Y axis / labels).
    const padTop = Math.round(img.height * 0.2)
    const padBottom = Math.round(img.height * 0.2)

    const expanded = document.createElement('canvas')
    expanded.width = img.width
    expanded.height = img.height + padTop + padBottom
    const ctx = expanded.getContext('2d')
    if (!ctx) throw new Error('Canvas context در دسترس نیست')

    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, expanded.width, expanded.height)
    ctx.drawImage(img, 0, padTop)

    return expanded.toDataURL('image/png')
  }, [])

  const downloadCapturedDesignCanvas = useCallback(() => {
    if (!capturedCanvasImage) return
    const link = document.createElement('a')
    link.href = capturedCanvasImage
    link.download = `${project?.name || 'design'}_map_${new Date().toISOString().slice(0, 10)}.png`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }, [capturedCanvasImage, project?.name])

  const downloadDesignCanvas = useCallback(async () => {
    try {
      const dataUrl = await captureDesignCanvasImage()
      setCapturedCanvasImage(dataUrl)
      setMapPreviewOpen(true)
    } catch (error) {
      console.error('خطا در گرفتن پیشنمایش نقشه:', error)
      alert(error instanceof Error ? error.message : 'خطا در گرفتن پیشنمایش نقشه')
    }
  }, [captureDesignCanvasImage])

  const printWithDesignCanvas = useCallback(async () => {
    try {
      const dataUrl = await captureDesignCanvasImage()
      setCapturedCanvasImage(dataUrl)

      const img = new Image()
      img.onload = () => {
        window.print()
      }
      img.onerror = () => {
        window.print()
      }
      img.src = dataUrl
    } catch (error) {
      console.error('خطا در چاپ نقشه:', error)
      alert(error instanceof Error ? error.message : 'خطا در چاپ نقشه')
      window.print()
    }
  }, [captureDesignCanvasImage])

  // ─── Pipe schedule ───
  const pipeRows = useMemo(() => pipes.map(p => ({
    id: p.id,
    label: p.label || '—',
    size: p.pipeSize || '—',
    length: p.length ?? 0,
    nodeCount: (p.nodes || []).length,
    layer: p.layer,
  })), [pipes])

  const totalPipeLength = useMemo(
    () => Math.round(pipeRows.reduce((s, r) => s + r.length, 0) * 10) / 10,
    [pipeRows]
  )

  // ─── Nodes / fittings schedule ───
  // Each node lists what is fitted *and* how big it is and how much it throws,
  // because those numbers are what the demand calculation is built from.
  const nodeRows = useMemo(() => pipes.flatMap(p => (p.nodes || []).map(n => ({
    pipe: p.label || '—',
    lines: (n.items || []).map(id => ({
      id,
      label: PIPE_POINT_ITEMS.find(i => i.id === id)?.label || id,
      summary: specSummary(id, n.specs?.[id]),
      flow: fittingFlow(id, n.specs?.[id]),
    })),
  }))), [pipes])

  // ─── Fitting statistics ─── build from the same roll-up the tests use.
  const fittings = useMemo(() => collectFittingStats(pipes), [pipes])

  // ─── Equipment schedule ───
  const equipmentRows = useMemo((): EquipmentRow[] => {
    const map = new Map<string, EquipmentRow>()
    for (const el of elements) {
      if (el.layer < 0) continue
      const key = el.type
      const existing = map.get(key)
      const systems = Object.keys(el.properties || {})
        .filter(k => SYSTEM_LABELS[k] && el.properties?.[k])
        .map(k => SYSTEM_LABELS[k])
      if (existing) {
        existing.count += 1
        for (const s of systems) if (!existing.systems.includes(s)) existing.systems.push(s)
      } else {
        const p = el.properties || {}
        const specParts: string[] = []
        if (p.diameter) specParts.push(`Ø${p.diameter}m`)
        if (p.height) specParts.push(`H${p.height}m`)
        if (p.volume) specParts.push(`${p.volume}m³`)
        if (p.flowRate) specParts.push(`${p.flowRate} L/min`)
        map.set(key, {
          type: key,
          label: ELEMENT_LABELS[key] || el.label || key,
          count: 1,
          systems,
          specs: specParts.join(' • '),
        })
      }
    }
    return Array.from(map.values())
  }, [elements])

  // ─── Fire systems — computed quantities ───
  const fireSystems = useMemo(() => {
    const tanks = elements.filter(e => e.layer >= 0 && (e.type === 'oil_tank' || e.type === 'contamination_tank'))
    const out: { name: string; detail: string; formula: string }[] = []
    let totalNozzles = 0
    let totalChambers = 0

    for (const t of tanks) {
      const d = parseFloat(String(t.properties?.diameter ?? '')) || 0
      const h = parseFloat(String(t.properties?.height ?? '')) || 0
      if (d <= 0 || h <= 0) continue
      const p = t.properties || {}
      const name = t.label || ELEMENT_LABELS[t.type]
      // Read every flag through the roof gate, so a leftover flag in a saved
      // design (a dam on a fixed roof, a chamber on a pond) is not counted.
      const on = (id: FireSystemId) => isFireSystemActive(t.type, p, id)
      if (on('cooling')) {
        const n = calcCoolingNozzleCount(d, h)
        totalNozzles += n.total
        out.push({
          name: `${name} — کولینگ`,
          detail: `${n.total} نازل (${n.perRing} نازل × ${n.rings} رینگ)`,
          formula: `N = ⌈πD/S⌉ × ⌈H/V⌉ = ⌈π×${d}/2.4⌉ × ⌈${h}/3⌉`,
        })
      }
      if (on('foam_chamber')) {
        // The outlet table is selected by the roof type (IN-008) before anything
        // else: §3.1 for a fixed roof, §3.3 for subsurface, §3.4/§3.5 spacing for
        // a floating roof. Reading §3.1 from the diameter alone gave every tank
        // the fixed-roof count — including tanks whose roof nobody had declared.
        const run = specRunForElement(t, SPEC_CONFIG)
        const count = run?.foam?.outletCount ?? null
        if (run === null || count === null) {
          out.push({
            name: `${name} — فوم چمبر`,
            detail: '—',
            formula: 'نوع سقف مخزن (IN-008) ثبت نشده — جدول §3.1/§3.3/§3.4/§3.5 انتخاب نمی‌شود',
          })
        } else {
          const row = run.byId['OUT-002']
          totalChambers += count
          out.push({
            name: `${name} — فوم چمبر`,
            detail: `${count} عدد`,
            formula: `${row.referenceIds.join(', ')} — ${row.note ?? ''}`,
          })
        }
      }
    }

    const buildings = elements.filter(e => e.layer >= 0 && (e.type === 'turbine' || e.type === 'control_building' ||
      e.type === 'warehouse' || e.type === 'workshop' || e.type === 'office_building' || e.type === 'hse_building'))
    for (const b of buildings) {
      const p = b.properties || {}
      const name = b.label || ELEMENT_LABELS[b.type]
      const h = parseFloat(String(p.height ?? '')) || 0
      if (p.co2_system) {
        out.push({
          name: `${name} — CO₂ اتوماتیک`,
          detail: `${Math.max(2, Math.ceil(h / 2))} سیلندر`,
          formula: 'NFPA 12 — CO₂ total flooding',
        })
      }
      if (p.sprinkler) {
        out.push({
          name: `${name} — اسپرینکلر`,
          detail: `${Math.max(6, Math.ceil(h * 4))} اسپرینکلر`,
          formula: 'NFPA 13 — Density/area method',
        })
      }
    }

    return { out, totalNozzles, totalChambers }
  }, [elements])

  const zoneSummary = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const z of Object.values(zones)) counts[z] = (counts[z] || 0) + 1
    return counts
  }, [zones])

  // Design demand, aggregated by the demand engine rather than by arithmetic in
  // this component — so simultaneity, per-outlet source and units are handled
  // there. The project allowance is kept out of the base figure so the headline
  // number is the same one the schedules have always shown; it is reported
  // separately instead of being folded in silently.
  //
  // Declared before the report memo, which reads it.
  const { demand, builtInEstimateCount, fittingCount } = useMemo(() => {
    const b = basis ?? defaultBasis()
    const { sources, input } = demandInputFromNodes(pipes, b, {
      scenario: defaultScenarioLabel(),
      allowanceFraction: 0,
    })
    return {
      demand: fireWaterDemand(input, b),
      builtInEstimateCount: countBuiltInEstimates(sources),
      fittingCount: countDischargeFittings(sources),
    }
  }, [pipes, basis])

  // ─── Auditable report ───
  // Built from the same engine the panel uses, so what is printed and what is
  // validated cannot drift apart.
  const report = useMemo(() => {
    if (!basis) return null
    const D = Number(worstCaseResult?.D) || 0
    const H = Number(worstCaseResult?.H) || 0
    const sections = D > 0 && H > 0
      ? [sectionFromWaterSpray(computeWaterSpray({ equipmentClass: 'vertical_atmospheric_tank', diameterM: D, heightM: H }, basis))]
      : []
    // The demand section travels with the water-spray section, so the printed
    // report carries the same scenario and per-outlet sourcing as the screen.
    if (demand.rows.length > 0) sections.push(sectionFromDemand(demand))
    const v = validation ?? { blockers: [], warnings: [], statement: '', ok: true, infos: [] }
    const overall: ResultStatus = v.ok ? 'calculated' : 'requires_engineering_review'
    return buildReport({
      basis,
      sections,
      validation: { blockers: v.blockers, warnings: v.warnings, statement: v.statement, ok: v.ok },
      overallStatus: overall,
    })
  }, [basis, worstCaseResult, validation])

  const basisTable = useMemo(() => (basis ? basisAsTable(basis) : null), [basis])

  return (
    <div className="fixed inset-0 z-[60] bg-black/40 backdrop-blur-sm flex items-start justify-center overflow-y-auto p-4 print:p-0 print:bg-white">
      <div className="w-full max-w-4xl bg-white rounded-2xl shadow-2xl my-6 print:my-0 print:shadow-none print:rounded-none print:max-w-none">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200 print:hidden">
          <h2 className="font-bold text-gray-800">نمایش خروجی طراحی</h2>
          <div className="flex items-center gap-2">
            <Button onClick={downloadDesignCanvas} className="h-8 text-xs bg-emerald-500 hover:bg-emerald-600 text-white">
              <Download className="w-3.5 h-3.5 ml-1" />
              دانلود نقشه
            </Button>
            <Button onClick={printWithDesignCanvas} className="h-8 text-xs bg-sky-500 hover:bg-sky-600 text-white">
              <Printer className="w-3.5 h-3.5 ml-1" />
              چاپ
            </Button>
            <button onClick={onClose} aria-label="بستن گزارش" className="p-2 hover:bg-gray-100 rounded-lg">
              <X className="w-4 h-4 text-gray-500" />
            </button>
          </div>
        </div>

        <div className="p-6 space-y-5 text-sm print:text-black print:p-0 print:space-y-0">
          {/* Design Canvas Preview / Print */}
          {mapPreviewOpen && capturedCanvasImage && (
            <div className="fixed inset-0 z-[100] bg-black/40 backdrop-blur-sm flex items-center justify-center p-4 print:hidden">
              <div className="w-full max-w-5xl bg-white rounded-lg p-4">
                <img
                  src={capturedCanvasImage}
                  alt="پیشنمایش نقشه"
                  className="w-full max-w-none border-0 rounded-none"
                />
                <div className="mt-4 flex justify-end gap-2">
                  <Button
                    onClick={downloadCapturedDesignCanvas}
                    className="h-9 text-sm bg-emerald-500 hover:bg-emerald-600 text-white"
                  >
                    دانلود
                  </Button>
                  <Button
                    onClick={() => setMapPreviewOpen(false)}
                    className="h-9 text-sm bg-gray-100 hover:bg-gray-200 text-gray-900"
                  >
                    بستن
                  </Button>
                </div>
              </div>
            </div>
          )}

          {capturedCanvasImage && (
            <div className="hidden print:block page-break-after">
              <img
                src={capturedCanvasImage}
                alt="نقشه طراحی"
                className="w-full max-w-none border-0 rounded-none"
                style={{ imageRendering: 'auto' }}
              />
              <div style={{ pageBreakAfter: 'always' }} />
            </div>
          )}

          {/* Verification banner — the report is never presented as compliant */}
          {report && (
            <div className={`rounded-xl border-2 p-3 ${report.overallStatus === 'verified' ? 'border-emerald-300 bg-emerald-50' : 'border-red-300 bg-red-50'}`}>
              <div className="flex items-start gap-2">
                <ShieldAlert className={`w-5 h-5 mt-0.5 shrink-0 ${report.overallStatus === 'verified' ? 'text-emerald-600' : 'text-red-600'}`} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-bold text-xs text-red-800">
                      این گزارش «منطبق با استاندارد» نیست — نیازمند بازبینی مهندسی است
                    </span>
                    <Badge variant="outline" className="text-[9px] bg-white">
                      وضعیت: {RESULT_STATUS_LABELS[report.overallStatus]}
                    </Badge>
                  </div>
                  <p className="text-[11px] text-red-700 mt-1 leading-relaxed">{report.statement}</p>
                  <div className="mt-2 flex flex-wrap gap-3 text-[10px] text-red-700">
                    <span>خطای بازدارنده: <b>{report.blockers.length}</b></span>
                    <span>هشدار: <b>{report.warnings.length}</b></span>
                    <span dir="ltr">engine v{report.engineVersion} · constants {CONSTANTS_VERSION}</span>
                    <span dir="ltr">{new Date(report.generatedAt).toLocaleString('fa-IR')}</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Title */}
          <div className="text-center space-y-1">
            <h1 className="text-lg font-bold text-gray-800">گزارش خروجی طراحی سیستم اطفا حریق</h1>
            <p className="text-xs text-gray-500">{project?.name || 'پروژه'}</p>
            <p className="text-[10px] text-gray-400">
              ابعاد سایت: {project?.widthMeters || 100}m × {project?.heightMeters || 100}m — مبدأ (0,0) در ضلع جنوب‌غربی
            </p>
            <p className="text-[10px] text-gray-400">{new Date().toLocaleDateString('fa-IR')}</p>
          </div>

          <Separator />

          {/* §4.1 specification output matrix — all twenty outputs, automatic */}
          <SpecOutputSection project={project} elements={elements} />

          <Separator />

          {/* Summary cards */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
            <div className="rounded-xl border border-gray-200 p-3 text-center">
              <Package className="w-4 h-4 mx-auto text-sky-500 mb-1" />
              <div className="text-lg font-bold text-gray-800">{elements.filter(e => e.layer >= 0).length}</div>
              <div className="text-[10px] text-gray-500">تجهیزات جانمایی</div>
            </div>
            <div className="rounded-xl border border-gray-200 p-3 text-center">
              <MapPin className="w-4 h-4 mx-auto text-emerald-500 mb-1" />
              <div className="text-lg font-bold text-gray-800">{fittings.totalFittings}</div>
              <div className="text-[10px] text-gray-500">تجهیز گره ({fittings.fittedNodeCount} گره)</div>
            </div>
            <div className="rounded-xl border border-gray-200 p-3 text-center">
              <GitBranch className="w-4 h-4 mx-auto text-red-500 mb-1" />
              <div className="text-lg font-bold text-gray-800">{totalPipeLength}m</div>
              <div className="text-[10px] text-gray-500">طول لوله‌ها ({pipes.length} خط)</div>
            </div>
            <div className="rounded-xl border border-gray-200 p-3 text-center">
              <Gauge className="w-4 h-4 mx-auto text-blue-600 mb-1" />
              <div className="text-lg font-bold text-gray-800 tabular-nums">{fittings.discharge.totalFlow}</div>
              <div className="text-[10px] text-gray-500">دبی طراحی (L/min)</div>
            </div>
            <div className="rounded-xl border border-gray-200 p-3 text-center">
              <Droplets className="w-4 h-4 mx-auto text-cyan-500 mb-1" />
              <div className="text-lg font-bold text-gray-800">{fireSystems.totalNozzles}</div>
              <div className="text-[10px] text-gray-500">نازل کولینگ</div>
            </div>
            <div className="rounded-xl border border-gray-200 p-3 text-center">
              <Flame className="w-4 h-4 mx-auto text-amber-500 mb-1" />
              <div className="text-lg font-bold text-gray-800">{fireSystems.totalChambers}</div>
              <div className="text-[10px] text-gray-500">فوم چمبر</div>
            </div>
          </div>

          {/* Equipment schedule */}
          <div>
            <h3 className="font-bold text-gray-700 text-sm mb-2">۱. فهرست تجهیزات</h3>
            {equipmentRows.length === 0 ? (
              <p className="text-xs text-gray-400">تجهیزی جانمایی نشده است.</p>
            ) : (
              <table className="w-full text-xs border border-gray-200 rounded-lg overflow-hidden">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="p-2 text-right font-medium text-gray-600">#</th>
                    <th className="p-2 text-right font-medium text-gray-600">تجهیز</th>
                    <th className="p-2 text-right font-medium text-gray-600">تعداد</th>
                    <th className="p-2 text-right font-medium text-gray-600">مشخصات</th>
                    <th className="p-2 text-right font-medium text-gray-600">سیستم اطفا</th>
                  </tr>
                </thead>
                <tbody>
                  {equipmentRows.map((r, i) => (
                    <tr key={r.type} className="border-t border-gray-100">
                      <td className="p-2 text-gray-400">{i + 1}</td>
                      <td className="p-2 text-gray-700">{r.label}</td>
                      <td className="p-2 font-medium">{r.count}</td>
                      <td className="p-2 text-gray-500" dir="ltr">{r.specs || '—'}</td>
                      <td className="p-2 text-red-600">{r.systems.length ? r.systems.join(' + ') : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Pipe schedule */}
          <div>
            <h3 className="font-bold text-gray-700 text-sm mb-2">۲. فهرست لوله‌ها</h3>
            {pipeRows.length === 0 ? (
              <p className="text-xs text-gray-400">لوله‌ای رسم نشده است.</p>
            ) : (
              <table className="w-full text-xs border border-gray-200 rounded-lg overflow-hidden">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="p-2 text-right font-medium text-gray-600">#</th>
                    <th className="p-2 text-right font-medium text-gray-600">نوع</th>
                    <th className="p-2 text-right font-medium text-gray-600">سایز</th>
                    <th className="p-2 text-right font-medium text-gray-600">طول (m)</th>
                    <th className="p-2 text-right font-medium text-gray-600">گره</th>
                  </tr>
                </thead>
                <tbody>
                  {pipeRows.map((r, i) => (
                    <tr key={r.id} className="border-t border-gray-100">
                      <td className="p-2 text-gray-400">{i + 1}</td>
                      <td className="p-2 text-gray-700">{r.label}</td>
                      <td className="p-2" dir="ltr">{r.size}</td>
                      <td className="p-2 font-medium">{r.length}</td>
                      <td className="p-2">{r.nodeCount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Nodes */}
          {nodeRows.length > 0 && (
            <div>
              <h3 className="font-bold text-gray-700 text-sm mb-2">
                ۳. گره‌ها و تجهیزات انتخاب‌شده ({nodeRows.length} گره)
              </h3>
              <div className="space-y-2">
                {nodeRows.map((r, i) => (
                  <div key={i} className="border border-gray-200 rounded-lg overflow-hidden">
                    <div className="flex items-center justify-between bg-gray-50 px-2 py-1.5">
                      <span className="text-[11px] text-gray-600">
                        گره {i + 1} — لوله <span className="font-medium">{r.pipe}</span>
                      </span>
                      {r.lines.some(l => l.flow > 0) && (
                        <span className="text-[11px] font-bold text-blue-700 tabular-nums">
                          {r.lines.reduce((s, l) => s + l.flow, 0)} L/min
                        </span>
                      )}
                    </div>
                    {r.lines.length === 0 ? (
                      <div className="px-2 py-1.5 text-[11px] text-gray-400">بدون تجهیز</div>
                    ) : (
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="text-[10px] text-gray-500">
                            <th className="p-1.5 text-right font-medium">تجهیز</th>
                            <th className="p-1.5 text-right font-medium">مشخصات</th>
                            <th className="p-1.5 text-right font-medium">دبی (L/min)</th>
                          </tr>
                        </thead>
                        <tbody>
                          {r.lines.map(l => (
                            <tr key={l.id} className="border-t border-gray-100">
                              <td className="p-1.5 text-sky-700">{l.label}</td>
                              <td className="p-1.5 text-gray-600" dir="ltr">{l.summary || '—'}</td>
                              <td className="p-1.5 tabular-nums">
                                {l.flow > 0 ? <span className="font-medium">{l.flow}</span> : <span className="text-gray-300">—</span>}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Fitting statistics */}
          {fittings.rows.length > 0 && (
            <div>
              <h3 className="font-bold text-gray-700 text-sm mb-2">۴. آمار تجهیزات گره‌ها</h3>
              <table className="w-full text-xs border border-gray-200 rounded-lg overflow-hidden">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="p-2 text-right font-medium text-gray-600">#</th>
                    <th className="p-2 text-right font-medium text-gray-600">تجهیز</th>
                    <th className="p-2 text-right font-medium text-gray-600">تعداد</th>
                    <th className="p-2 text-right font-medium text-gray-600">سایزها (اینچ)</th>
                    <th className="p-2 text-right font-medium text-gray-600">دبی (L/min)</th>
                  </tr>
                </thead>
                <tbody>
                  {fittings.rows.map((r, i) => (
                    <tr key={r.id} className="border-t border-gray-100">
                      <td className="p-2 text-gray-400">{i + 1}</td>
                      <td className="p-2 text-gray-700">{r.label}</td>
                      <td className="p-2 font-medium tabular-nums">{r.count}</td>
                      <td className="p-2 text-gray-600 tabular-nums" dir="ltr">{r.sizeSummary || '—'}</td>
                      <td className="p-2 tabular-nums">
                        {r.flow > 0 ? <span className="font-medium text-blue-700">{r.flow}</span> : <span className="text-gray-300">—</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-gray-200 bg-gray-50">
                    <td className="p-2" />
                    <td className="p-2 font-bold text-gray-700">جمع</td>
                    <td className="p-2 font-bold tabular-nums">{fittings.totalFittings}</td>
                    <td className="p-2" />
                    <td className="p-2 font-bold text-blue-700 tabular-nums">{fittings.discharge.totalFlow}</td>
                  </tr>
                </tfoot>
              </table>

              {fittings.sizeCounts.length > 0 && (
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  <span className="flex items-center gap-1 text-[10px] text-gray-500">
                    <Ruler className="w-3 h-3" />
                    سایزهای استفاده‌شده:
                  </span>
                  {fittings.sizeCounts.map(s => (
                    <span key={s.size} className="px-2 py-0.5 rounded-lg bg-gray-100 text-[10px] text-gray-700 tabular-nums" dir="ltr">
                      {s.size}" × {s.count}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Design demand — aggregated by the demand engine, not by ad-hoc
              arithmetic here, so simultaneity and provenance are handled. */}
          <div>
            <h3 className="font-bold text-gray-700 text-sm mb-2">
              ۵. محاسبه دبی طراحی (بر اساس مشخصات تجهیزات گره)
            </h3>
            {demand.totalDemandLpm === 0 ? (
              <p className="text-xs text-gray-400">
                هیچ مانیتور یا هایدرانتی روی گره‌ها ثبت نشده است. در ویرایشگر گره، تجهیز را انتخاب و دبی خروجی آن را وارد کنید.
              </p>
            ) : (
              <div className="space-y-2">
                <div className="rounded-xl border border-gray-200 bg-gray-50 p-2">
                  <div className="text-[10px] text-gray-600">
                    <b>سناریوی طراحی:</b> {demand.scenario}
                  </div>
                  {builtInEstimateCount > 0 && (
                    <div className="text-[10px] text-orange-700 mt-1">
                      <b>{builtInEstimateCount}</b> خروجی هنوز روی برآورد اولیه داخلی برنامه است و منبع تأییدشده ندارد.
                    </div>
                  )}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <div className="rounded-xl border border-red-200 bg-red-50/50 p-2 text-center">
                    <div className="text-[10px] text-red-700">جمع دبی مانیتورها</div>
                    <div className="text-base font-bold text-red-700 tabular-nums">{demand.byKind.monitor.flowLpm.toFixed(0)}</div>
                    <div className="text-[9px] text-red-500">{fittingCount.monitor} مانیتور / {demand.byKind.monitor.count} خروجی — L/min</div>
                  </div>
                  <div className="rounded-xl border border-orange-200 bg-orange-50/50 p-2 text-center">
                    <div className="text-[10px] text-orange-700">جمع دبی هایدرانت‌ها</div>
                    <div className="text-base font-bold text-orange-700 tabular-nums">{demand.byKind.hydrant.flowLpm.toFixed(0)}</div>
                    <div className="text-[9px] text-orange-500">{fittingCount.hydrant} هایدرانت / {demand.byKind.hydrant.count} خروجی — L/min</div>
                  </div>
                  <div className="rounded-xl border border-blue-300 bg-blue-50 p-2 text-center">
                    <div className="text-[10px] text-blue-700">دبی طراحی کل</div>
                    <div className="text-base font-bold text-blue-700 tabular-nums">{demand.totalDemandLpm.toFixed(0)}</div>
                    <div className="text-[9px] text-blue-500">L/min — مبنای انتخاب پمپ</div>
                  </div>
                </div>

                {/* Per-outlet breakdown with its source */}
                <div className="overflow-x-auto rounded-xl border border-gray-200">
                  <table className="w-full text-[10px] min-w-[620px]">
                    <thead className="bg-gray-50 text-gray-500">
                      <tr>
                        <th className="text-right px-2 py-1.5 font-bold">محل / تجهیز</th>
                        <th className="text-right px-2 py-1.5 font-bold">نوع</th>
                        <th className="text-right px-2 py-1.5 font-bold">دبی واحد</th>
                        <th className="text-right px-2 py-1.5 font-bold">تعداد</th>
                        <th className="text-right px-2 py-1.5 font-bold">جمع</th>
                        <th className="text-right px-2 py-1.5 font-bold">منبع دبی</th>
                        <th className="text-right px-2 py-1.5 font-bold">وضعیت</th>
                      </tr>
                    </thead>
                    <tbody>
                      {demand.rows.map(r => (
                        <tr key={r.id} className="border-t border-gray-100 align-top">
                          <td className="px-2 py-1.5 text-gray-700">{r.location}</td>
                          <td className="px-2 py-1.5 text-gray-600">{r.kind === 'monitor' ? 'مانیتور' : 'هایدرانت'}</td>
                          <td className="px-2 py-1.5 text-gray-700 tabular-nums" dir="ltr">{r.flowPerOutletLpm.toFixed(0)} L/min</td>
                          <td className="px-2 py-1.5 text-gray-700 tabular-nums">{r.outletCount}</td>
                          <td className="px-2 py-1.5 font-bold text-gray-800 tabular-nums" dir="ltr">{r.subtotalLpm.toFixed(0)} L/min</td>
                          <td className="px-2 py-1.5 text-gray-500">{r.reference}</td>
                          <td className="px-2 py-1.5">
                            <span className={`text-[9px] px-1.5 py-0.5 rounded border ${r.status === 'unverified_legacy' ? 'bg-orange-100 text-orange-800 border-orange-300' : 'bg-amber-100 text-amber-800 border-amber-300'}`}>
                              {r.status === 'unverified_legacy' ? 'برآورد تأییدنشده' : 'نیازمند بازبینی'}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="text-[10px] text-gray-500 text-right" dir="ltr">
                  {demand.equation}
                  <br />
                  {demand.substitution}
                </div>
                {demand.notes.map((n, i) => (
                  <p key={i} className="text-[10px] text-gray-400">{n}</p>
                ))}
              </div>
            )}
          </div>

          {/* Fire systems */}
          <div>
            <h3 className="font-bold text-gray-700 text-sm mb-2">۶. محاسبات سیستم‌های اطفا حریق</h3>
            {fireSystems.out.length === 0 ? (
              <p className="text-xs text-gray-400">
                هیچ سیستم اطفا حریقی روی تجهیزات فعال نشده است. در پنل «ویژگی‌های تجهیز» سیستم‌ها را فعال کنید.
              </p>
            ) : (
              <div className="space-y-1.5">
                {fireSystems.out.map((s, i) => (
                  <div key={i} className="flex items-start justify-between gap-3 p-2 rounded-lg border border-gray-200">
                    <div className="min-w-0">
                      <div className="text-xs text-gray-700">{s.name}</div>
                      <div className="text-[9px] text-gray-400" dir="ltr">{s.formula}</div>
                    </div>
                    <div className="text-xs font-bold text-red-600 whitespace-nowrap">{s.detail}</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Zones */}
          {Object.keys(zoneSummary).length > 0 && (
            <div>
              <h3 className="font-bold text-gray-700 text-sm mb-2">۷. سطح حفاظتی (زون)</h3>
              <div className="flex flex-wrap gap-2">
                {Object.entries(zoneSummary).map(([z, c]) => (
                  <span key={z} className="px-3 py-1 rounded-lg bg-gray-100 text-xs text-gray-700">
                    زون {z}: {c} تجهیز
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Open items — what stops this being a verified design */}
          {report && (report.blockers.length > 0 || report.warnings.length > 0) && (
            <div className="space-y-2">
              <h3 className="font-bold text-gray-700 text-sm flex items-center gap-1">
                <ShieldAlert className="w-3.5 h-3.5" /> موارد باز (بازدارنده و هشدار)
              </h3>
              {[...report.blockers, ...report.warnings].map(issue => {
                const meta = ISSUE_META[issue.severity]
                return (
                  <div key={issue.id} className={`rounded-xl border p-3 ${meta.className}`}>
                    <div className="flex items-start gap-2">
                      <meta.Icon className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-xs font-bold">{issue.title}</span>
                          <Badge variant="outline" className="text-[9px] bg-white/60">{meta.label}</Badge>
                        </div>
                        <p className="text-[10px] mt-1 whitespace-pre-line leading-relaxed">{issue.detail}</p>
                        <p className="text-[9px] mt-1 opacity-90">
                          <b>ورودی:</b> <span dir="ltr">{issue.affectedInput}</span> · <b>منبع:</b> {issue.source} · <b>اقدام:</b> {issue.correctiveAction}
                        </p>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {/* Report sections — equation, substitution, result, status */}
          {report && report.sections.length > 0 && (
            <div className="space-y-3">
              <h3 className="font-bold text-gray-700 text-sm">محاسبات با معادله، جای‌گذاری و وضعیت</h3>
              {report.sections.map(section => (
                <div key={section.id} className="rounded-xl border border-gray-200 overflow-hidden">
                  <div className="px-3 py-2 bg-gray-50 flex flex-wrap items-center gap-2">
                    <span className="text-xs font-bold text-gray-700">{section.title}</span>
                    <Badge variant="outline" className="text-[9px]">{RESULT_STATUS_LABELS[section.status]}</Badge>
                  </div>
                  <div className="divide-y divide-gray-100">
                    {section.equations.map(eq => (
                      <div key={eq.id} className="p-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-[11px] font-bold text-gray-700">{eq.title}</span>
                          <Badge variant="outline" className="text-[9px]">{eq.standardRef}</Badge>
                        </div>
                        <div className="mt-1.5 text-[10px] text-gray-600 space-y-0.5" dir="ltr">
                          <div><b>eq:</b> <span className="font-mono">{eq.equation}</span></div>
                          <div><b>sub:</b> <span className="font-mono">{eq.substitution}</span></div>
                          <div><b>result:</b> <span className="font-mono text-gray-800">{eq.result}</span></div>
                        </div>
                        {eq.notes && eq.notes.length > 0 && (
                          <ul className="mt-1.5 text-[9px] text-gray-500 list-disc pr-4 space-y-0.5">
                            {eq.notes.map((n, i) => <li key={i}>{n}</li>)}
                          </ul>
                        )}
                      </div>
                    ))}
                  </div>
                  {section.table && (
                    <div className="overflow-x-auto border-t border-gray-100">
                      <table className="w-full text-[10px] min-w-[520px]">
                        <thead className="bg-gray-50 text-gray-500">
                          <tr>{section.table.columns.map(c => <th key={c} className="text-right px-2 py-1.5 font-bold">{c}</th>)}</tr>
                        </thead>
                        <tbody>
                          {section.table.rows.map((r, i) => (
                            <tr key={i} className="border-t border-gray-100">
                              <td className="px-2 py-1.5 text-gray-700">{r.label}</td>
                              <td className="px-2 py-1.5 text-gray-700" dir="ltr">{r.value}{r.unit ? ` ${r.unit}` : ''}</td>
                              <td className="px-2 py-1.5 text-gray-500">{r.source}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                  {section.notes.length > 0 && (
                    <ul className="px-3 py-2 text-[9px] text-gray-500 list-disc pr-6 space-y-0.5 border-t border-gray-100">
                      {section.notes.map((n, i) => <li key={i}>{n}</li>)}
                    </ul>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Design basis appendix */}
          {basisTable && (
            <div className="rounded-xl border border-gray-200 overflow-hidden">
              <div className="px-3 py-2 bg-gray-50">
                <span className="text-xs font-bold text-gray-700">
                  پیوست الف — ثابت‌های محاسبه و مبنای هر عدد (غیرقابل ویرایش)
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-[9px] min-w-[720px]">
                  <thead className="bg-gray-50 text-gray-500">
                    <tr>{basisTable.columns.map(c => <th key={c} className="text-right px-2 py-1.5 font-bold">{c}</th>)}</tr>
                  </thead>
                  <tbody>
                    {basisTable.rows.map((r, i) => (
                      <tr key={i} className="border-t border-gray-100 align-top">
                        <td className="px-2 py-1.5 text-gray-700">{r.label}</td>
                        <td className="px-2 py-1.5 text-gray-700" dir="ltr">{r.value}{r.unit ? ` ${r.unit}` : ''}</td>
                        <td className="px-2 py-1.5 text-gray-500" dir="ltr">{r.unit || '—'}</td>
                        <td className="px-2 py-1.5 text-gray-600">{r.source}</td>
                        <td className="px-2 py-1.5 text-gray-500">{r.status}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Limitations */}
          {report && (
            <div className="rounded-xl bg-amber-50 border border-amber-200 p-3">
              <h3 className="font-bold text-amber-800 text-xs mb-1.5">محدودیت‌ها و آنچه این گزارش پوشش نمی‌دهد</h3>
              <ul className="text-[10px] text-amber-800 list-disc pr-4 space-y-0.5 leading-relaxed">
                {report.limitations.map((l, i) => <li key={i}>{l}</li>)}
              </ul>
              {report.migrations.length > 0 && (
                <div className="mt-2 pt-2 border-t border-amber-200">
                  <div className="text-[10px] font-bold text-amber-800">مهاجرت داده (بدون حذف مقدار):</div>
                  <ul className="text-[9px] text-amber-700 list-disc pr-4 mt-0.5">
                    {report.migrations.map((m, i) => <li key={i}>{m}</li>)}
                  </ul>
                </div>
              )}
            </div>
          )}

          {/* Formula sheet — with provenance, not just names */}
          <div className="rounded-xl bg-gray-50 border border-gray-200 p-3">
            <h3 className="font-bold text-gray-700 text-xs mb-2 flex items-center gap-1">
              <MapPin className="w-3 h-3" /> مرجع فرمول‌ها، مبنا و وضعیت تأیید
            </h3>
            <ul className="text-[10px] text-gray-600 space-y-1" dir="ltr">
              <li>
                <b>Water spray demand</b> — Q = Σ(A_i · R_i)
                {' · '}R = {String((basis?.entries['nfpa15.rate.governing']?.value === 'project'
                  ? basis?.entries['nfpa15.rate.project']?.value
                  : basis?.entries['nfpa15.rate.required']?.value) ?? 4.1)} L/min/m²
                {' '}<span className="text-blue-700">({basis?.entries['nfpa15.rate.required']?.reference ?? 'NFPA 15 — مقدار استاندارد'})</span>
                {basis?.entries['nfpa15.rate.governing']?.value === 'project' && (
                  <span className="text-red-600"> — هشدار: مقدار جایگزین غیراستاندارد انتخاب شده است</span>
                )}
              </li>
              <li>
                <b>Nozzle flow</b> — Q_n = K·√P · K = {String(basis?.entries['nfpa15.nozzle.kFactor']?.value ?? '—')} L/min/bar^0.5 @ {String(basis?.entries['nfpa15.nozzle.pressure']?.value ?? '—')} bar
                {' '}<span className="text-orange-600">(مقدار مرجع جانشین — با کاتالوگ سازنده جایگزین شود)</span>
              </li>
              <li>
                <b>Nozzle layout</b> — N_ring = max(2, ⌈π·D/S⌉), rings from actual elevations · S = {String(basis?.entries['nfpa15.spacing.horizontal']?.value ?? 2.4)} m, V = {String(basis?.entries['nfpa15.spacing.vertical']?.value ?? 3.0)} m
                {' '}<span className="text-orange-600">(Project Default — Not a universal NFPA requirement)</span>
              </li>
              <li>
                <b>Rundown limit</b> — V_max = {String(basis?.entries['nfpa15.spacing.rundownMax']?.value ?? 3.7)} m
                {' '}<span className="text-amber-600">({basis?.entries['nfpa15.spacing.rundownMax']?.reference ?? 'needs verification'})</span>
              </li>
              <li><b>Foam solution</b> — Q_foam = A · R ; V_solution = Q_foam · t ; V_concentrate = V_solution · C &nbsp;<span className="text-orange-600">(rates carry no edition reference)</span></li>
              <li><b>Foam chambers</b> — §3.1 سند موتور مشخصات (T3.1)</li>
              <li><b>Hand hose lines</b> — §3.9 سند موتور مشخصات (T3.9)</li>
              <li><b>Foam dam height</b> — §3.6 · DAM-001: <span className="font-mono" dir="ltr">MAX(300, H_secondary+50, H_burnout+50)</span></li>
              <li><b>TDH</b> — TDH = H_static + H_friction + H_residual ; H_residual = P_residual/(ρ·g) &nbsp;<span className="text-orange-600">(friction is a project allowance, not a network calculation)</span></li>
              <li><b>Pump power</b> — P_hyd = ρ·g·Q·H/1000 ; P_input = P_hyd/η &nbsp;<span className="text-red-600">(the previous expression over-reported by 16.67× and has been corrected)</span></li>
              <li><b>Design demand</b> — Q = ΣQ(simultaneous) + Σmax(Q per exclusive group), from the specs recorded on each node</li>
              <li><b>Hydrant outlet reference</b> — {String(basis?.entries['demand.hydrantOutlet.flow']?.value ?? 946)} L/min <span className="text-orange-600">(project reference default — NOT a universal NFPA 24 requirement)</span></li>
              <li><b>Hazen-Williams</b> — h_f = 10.67·L·Q^1.852/(C^1.852·D^4.87), SI, Q in m³/s, D in m</li>
              <li><b>Bundwall</b> — {basis?.entries['bundwall.rule']?.reference ?? 'project rule'} <span className="text-orange-600">(project/regulatory rule, not a universal NFPA requirement)</span></li>
            </ul>
            <p className="text-[9px] text-gray-500 mt-2" dir="ltr">
              Engine v{CALC_ENGINE_VERSION} · constants {CONSTANTS_VERSION} · no clause in this report has been
              checked against a licensed edition in this build.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

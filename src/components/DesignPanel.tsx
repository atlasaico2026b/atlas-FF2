// SPDX-License-Identifier: Apache-2.0
// ═══════════════════════════════════════════════════════════════
// DESIGN PANEL — Per Master Prompt sections 26-37
// Three sheets: Alpha (full), Beta (no auto), Gamma (monitors+hydrants only)
// ═══════════════════════════════════════════════════════════════
import { useState, useMemo } from 'react'
import {
  Layers, Printer, Download, RotateCcw, CheckCircle, AlertTriangle,
  ChevronDown, ChevronUp, RefreshCw, Edit3, Trash2, Zap, PenTool,
  Eye, Settings,
} from 'lucide-react'
import type { DesignElement, PipeSegment } from './DesignWorkspace'
import {
  calcCoolingWaterRate, calcAdjacentTankCooling,
  calcTotalDynamicHead, calcPumpPower, calcJockeyPumpSpec, recommendPipeSize,
  hazenWilliamsHeadLoss_LPM, headLossToBar, calcPipeVelocity,
  calcFoamConcentrateQuantity, getSupplementaryHoseLines, calcSupplementaryFoamQuantity,
  FUEL_PROPERTIES, type HydrocarbonType,
} from '../lib/fireCalculations'

import { NFPA15 } from '../lib/calc/constants'
import { collectFittingStats } from '../lib/fittingStats'

// ─── Types ───
interface DesignPanelProps {
  elements: DesignElement[]
  pipes: PipeSegment[]
  zones: Record<string, string>
  project: any
  worstCaseResult: any
  onAddPipe: (pipe: PipeSegment) => void
  onAddElement: (element: DesignElement) => void
  onDeletePipe?: (id: string) => void
}

type DesignSheet = 'alpha' | 'beta' | 'gamma'
type DesignMode = 'choose' | 'smart' | 'manual' | 'generating' | 'result'

const SHEET_INFO: Record<DesignSheet, { label: string; icon: string; desc: string; color: string }> = {
  alpha: { label: 'آلفا', icon: '🅰️', desc: 'طراحی کامل — تمام سیستم‌ها', color: 'from-sky-500 to-blue-600' },
  beta: { label: 'بتا', icon: '🅱️', desc: 'بدون سیستم‌های اتوماتیک اطفا', color: 'from-emerald-500 to-green-600' },
  gamma: { label: 'گاما', icon: '🅶', desc: 'فقط مانیتور و هایدرانت', color: 'from-amber-500 to-orange-600' },
}

const PIPE_SIZES = [
  { nominal: '2"', id: 51 }, { nominal: '2.5"', id: 64 }, { nominal: '3"', id: 78 },
  { nominal: '4"', id: 102 }, { nominal: '5"', id: 127 }, { nominal: '6"', id: 154 },
  { nominal: '8"', id: 203 }, { nominal: '10"', id: 254 }, { nominal: '12"', id: 305 },
]

function computePipeLength(p: PipeSegment): number {
  if (typeof p.length === 'number' && Number.isFinite(p.length)) return p.length
  const pts = p.points || []
  if (pts.length < 2) return 0
  let sum = 0
  for (let i = 1; i < pts.length; i++) {
    const dx = pts[i].x - pts[i - 1].x
    const dy = pts[i].y - pts[i - 1].y
    sum += Math.sqrt(dx * dx + dy * dy)
  }
  return sum
}

function computeElbowCountFromPipePoints(points: { x: number; y: number }[] | undefined): number {
  if (!points || points.length < 3) return 0
  const cosThreshold = Math.cos((15 * Math.PI) / 180)
  let elbows = 0
  for (let i = 1; i < points.length - 1; i++) {
    const a = { x: points[i].x - points[i - 1].x, y: points[i].y - points[i - 1].y }
    const b = { x: points[i + 1].x - points[i].x, y: points[i + 1].y - points[i].y }
    const la = Math.hypot(a.x, a.y)
    const lb = Math.hypot(b.x, b.y)
    if (la < 1e-6 || lb < 1e-6) continue
    const dot = a.x * b.x + a.y * b.y
    const cos = dot / (la * lb)
    if (cos < cosThreshold) elbows += 1
  }
  return elbows
}

function computeTeeCountFromPipeEndpoints(pipes: PipeSegment[]): number {
  const tolPx = 10
  const keyOf = (pt: { x: number; y: number }) => `${Math.round(pt.x / tolPx)},${Math.round(pt.y / tolPx)}`
  const degree = new Map<string, number>()
  for (const p of pipes) {
    const pts = p.points || []
    if (pts.length < 2) continue
    const a = keyOf(pts[0])
    const b = keyOf(pts[pts.length - 1])
    degree.set(a, (degree.get(a) || 0) + 1)
    degree.set(b, (degree.get(b) || 0) + 1)
  }
  let tees = 0
  for (const deg of degree.values()) {
    if (deg >= 3) tees += Math.max(0, deg - 2)
  }
  return tees
}

function safeCountByRowId(stats: ReturnType<typeof collectFittingStats>, id: string): number {
  const row = stats.rows.find(r => r.id === id)
  return row?.count ?? 0
}

// ═══════════════════════════════════════════════════════════════
// DESIGN ENGINE — Single centralized engine per Master Prompt §38
// ═══════════════════════════════════════════════════════════════
function generateDesign(
  sheet: DesignSheet,
  wc: any,
  elements: DesignElement[],
  pipes: PipeSegment[],
  project: any,
) {
  if (!wc) return null

  const D = wc.D || 30
  const hasCooling = sheet !== 'gamma'
  const hasFoaming = sheet === 'alpha'
  const hasCO2 = sheet === 'alpha'

  const totalDemand = wc.requiredFlow || 3000
  const mainPipe = recommendPipeSize(totalDemand)
  const branchPipe = recommendPipeSize(totalDemand * 0.5)
  const coolingPipe = hasCooling ? recommendPipeSize(wc.totalCoolingLpm || 500) : null
  const foamPipe = hasFoaming ? recommendPipeSize(wc.fsdr || 1000) : null

  const fittingStats = collectFittingStats(
    pipes.map(p => ({
      label: p.label,
      nodes: p.nodes,
    })),
  )

  const monitorCount = fittingStats.discharge.monitorCount
  const hydrantCount = fittingStats.discharge.hydrantCount

  const coolingNozzles = hasCooling ? (wc.coolingNozzleTotal ?? 0) : 0

  // No diameter-only fallback. `calcNumberOfFoamChambers(D)` was always the §3.1
  // fixed-roof table, so a floating-roof tank got a cone-roof chamber count here,
  // and a tank whose roof was never declared got one silently. The count now
  // travels with the worst-case result, which the engine fills only once the
  // roof type (IN-008) is on record.
  const foamChambers = hasFoaming ? (wc.foamChambers ?? 0) : 0

  const totalPipeLength = Math.round(pipes.reduce((sum, p) => sum + computePipeLength(p), 0))

  const isolationValves = safeCountByRowId(fittingStats, 'inline_valve')
  const butterflyValves = safeCountByRowId(fittingStats, 'butterfly_valve')
  const checkValves = safeCountByRowId(fittingStats, 'blind_flange')
  const elbows = pipes.reduce((sum, p) => sum + computeElbowCountFromPipePoints(p.points), 0)
  const tees = computeTeeCountFromPipeEndpoints(pipes)
  const co2Systems = hasCO2 ? elements.filter(e => e.type === 'co2_system').length : 0

  // Pipe lengths by the actual drawn pipeSize
  const pipeLengths: Record<string, number> = {}
  for (const p of pipes) {
    const key = p.pipeSize || mainPipe.nominal
    pipeLengths[key] = (pipeLengths[key] || 0) + computePipeLength(p)
  }
  for (const k of Object.keys(pipeLengths)) pipeLengths[k] = Math.round(pipeLengths[k])

  // Flow calculations
  const foamFlow = hasFoaming ? (wc.fsdr || 0) : 0
  const coolingFlow = hasCooling ? (wc.totalCoolingLpm || 0) : 0
  const monitorFlow = fittingStats.discharge.monitorFlow
  const hydrantFlow = fittingStats.discharge.hydrantFlow
  const totalFlow = foamFlow + coolingFlow + Math.max(monitorFlow, hydrantFlow)

  // Water storage
  const dischargeTime = wc.dischargeTime || 55
  const fireFightingWater = Math.round(totalFlow * dischargeTime / 1000)
  const coolingWater4h = Math.round(coolingFlow * 240 / 1000)
  const totalWater = Math.round((fireFightingWater + coolingWater4h) * 1.1)

  // Foam
  const foamConcentrate3 = hasFoaming ? Math.round(wc.totalConcentrate || 0) : 0
  const foamConcentrate6 = hasFoaming ? Math.round(foamConcentrate3 * 0.5) : 0
  const foamSolution = hasFoaming ? Math.round(foamConcentrate3 * 33.33) : 0

  // Friction loss
  const frictionLossM = hazenWilliamsHeadLoss_LPM(500, totalDemand, 100, mainPipe.id)
  const frictionLossBar = headLossToBar(frictionLossM)

  return {
    sheet, monitorCount, hydrantCount, coolingNozzles, foamChambers,
    isolationValves, butterflyValves, checkValves, elbows, tees, co2Systems,
    pipeLengths, totalFlow, totalPipeLength,
    fireFightingWater, coolingWater4h, totalWater,
    foamConcentrate3, foamConcentrate6, foamSolution,
    mainPipe: `${mainPipe.nominal} (Ø${mainPipe.id}mm)`,
    branchPipe: sheet !== 'gamma' ? `${branchPipe.nominal} (Ø${branchPipe.id}mm)` : '-',
    coolingPipe: hasCooling && coolingPipe ? `${coolingPipe.nominal} (Ø${coolingPipe.id}mm)` : '-',
    foamPipe: hasFoaming && foamPipe ? `${foamPipe.nominal} (Ø${foamPipe.id}mm)` : '-',
    hasCooling, hasFoaming, hasCO2,
    velocity: calcPipeVelocity(totalDemand, mainPipe.id).toFixed(1),
    frictionLossM: frictionLossM.toFixed(1),
    frictionLossBar: frictionLossBar.toFixed(2),
  }
}

// ═══════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════
export default function DesignPanel({ elements, pipes, zones, project, worstCaseResult, onAddPipe, onAddElement }: DesignPanelProps) {
  const [activeSheet, setActiveSheet] = useState<DesignSheet>('alpha')
  const [designMode, setDesignMode] = useState<DesignMode>('choose')
  const [showFormulas, setShowFormulas] = useState(false)
  const [showEdit, setShowEdit] = useState(false)

  const design = useMemo(() => {
    return generateDesign(activeSheet, worstCaseResult, elements, pipes, project)
  }, [activeSheet, worstCaseResult, elements])

  const hasWorstCase = !!worstCaseResult

  const handleGenerate = () => {
    setDesignMode('generating')
    setTimeout(() => setDesignMode('result'), 500)
  }

  const handleReset = () => {
    setDesignMode('choose')
  }

  const handlePrint = () => window.print()

  const handleExport = () => {
    if (!design) return
    const lines = [
      '═══════════════════════════════════════════',
      `  DESIGN SHEET ${activeSheet.toUpperCase()} — ATLAS Fire Protection`,
      '═══════════════════════════════════════════',
      `Project: ${project?.name || 'N/A'}`,
      `Date: ${new Date().toLocaleDateString('fa-IR')}`,
      `Sheet: ${SHEET_INFO[activeSheet].label} — ${SHEET_INFO[activeSheet].desc}`,
      '',
      '─── EQUIPMENT ───',
      `Monitors: ${design.monitorCount}`,
      `Hydrants: ${design.hydrantCount}`,
      design.hasCooling ? `Cooling Nozzles: ${design.coolingNozzles}` : '',
      design.hasFoaming ? `Foam Chambers: ${design.foamChambers}` : '',
      `Isolation Valves: ${design.isolationValves}`,
      `Butterfly Valves: ${design.butterflyValves}`,
      `Check Valves: ${design.checkValves}`,
      `Elbows: ${design.elbows}`,
      `Tees: ${design.tees}`,
      design.hasCO2 ? `CO2 Systems: ${design.co2Systems}` : '',
      '',
      '─── PIPE ───',
      `Main Ring: ${design.mainPipe} — ${design.totalPipeLength}m`,
      ...Object.entries(design.pipeLengths).map(([size, len]) => `  ${size}: ${len}m`),
      `Velocity: ${design.velocity} m/s`,
      `Friction Loss (500m): ${design.frictionLossM}m / ${design.frictionLossBar} bar`,
      '',
      '─── FLOW ───',
      `Total Flow: ${design.totalFlow} Lpm`,
      '',
      '─── WATER STORAGE ───',
      `Fire Fighting: ${design.fireFightingWater} m³`,
      `Cooling (4h): ${design.coolingWater4h} m³`,
      `Total Required: ${design.totalWater} m³`,
      '',
      '─── FOAM ───',
      `Concentrate 3%: ${design.foamConcentrate3} L`,
      `Concentrate 6%: ${design.foamConcentrate6} L`,
      `Foam Solution: ${design.foamSolution} L`,
    ].filter(Boolean).join('\n')

    const blob = new Blob([lines], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `ATLAS-Design-${activeSheet.toUpperCase()}-${Date.now()}.txt`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="w-80 bg-white/60 backdrop-blur-md border-l border-white/50 overflow-y-auto flex-shrink-0">
      <div className="p-4">
        <h3 className="font-bold text-gray-700 mb-1 flex items-center gap-2">
          <Layers className="w-5 h-5 text-sky-500" />
          طراحی سیستم اطفا
        </h3>
        <p className="text-[10px] text-gray-400 mb-3">بر اساس ورست‌کیس تأیید شده</p>

        {/* Worst Case Warning */}
        {!hasWorstCase && (
          <div className="bg-amber-50/80 rounded-xl border border-amber-200 p-3 mb-3">
            <div className="flex items-center gap-2 text-amber-700 text-xs font-medium">
              <AlertTriangle className="w-4 h-4" />
              ورست‌کیس تأیید نشده
            </div>
            <p className="text-[10px] text-amber-600 mt-1">ابتدا ورست‌کیس را تکمیل و تأیید کنید</p>
          </div>
        )}

        {/* ═══ DESIGN MODE: CHOOSE — Smart vs Manual ═══ */}
        {designMode === 'choose' && (
          <div className="space-y-3">
            <h4 className="text-xs font-bold text-gray-700">نوع طراحی را انتخاب کنید:</h4>

            <button onClick={() => { setDesignMode('smart') }}
              disabled={!hasWorstCase}
              className={`w-full p-4 rounded-2xl text-right transition-all border shadow-md flex items-center gap-3 ${
                hasWorstCase
                  ? 'bg-gradient-to-r from-sky-500 to-blue-600 text-white border-transparent hover:shadow-lg'
                  : 'bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed'
              }`}>
              <Zap className="w-8 h-8 flex-shrink-0" />
              <div>
                <div className="text-sm font-bold">طراحی هوشمند</div>
                <div className={`text-[10px] ${hasWorstCase ? 'text-white/80' : 'text-gray-400'}`}>
                  سیستم خودکار رینگ و تجهیزات را بر اساس ورست‌کیس طراحی میکند
                </div>
                {!hasWorstCase && <div className="text-[10px] text-red-400 mt-1">⚠ ابتدا ورست‌کیس را تأیید کنید</div>}
              </div>
            </button>

            <button onClick={() => { setDesignMode('manual') }}
              className="w-full p-4 bg-white/60 text-gray-600 rounded-2xl font-medium border border-gray-200 hover:bg-white/80 transition-all flex items-center gap-3 shadow-sm">
              <PenTool className="w-8 h-8 flex-shrink-0" />
              <div className="text-right">
                <div className="text-sm font-bold">طراحی دستی</div>
                <div className="text-[10px] text-gray-400">
                  جانمایی دستی رینگ، لوله‌ها و تجهیزات روی نقشه
                </div>
              </div>
            </button>

            {hasWorstCase && (
              <div className="bg-green-50/50 rounded-xl border border-green-200 p-3 text-[10px] text-green-600">
                ✅ ورست‌کیس تأیید شده — دبی: {worstCaseResult?.requiredFlow} Lpm |
                فشار: {worstCaseResult?.tdlhM || worstCaseResult?.tdhM} m |
                پمپ: {worstCaseResult?.pumpPowerKW} kW
              </div>
            )}
          </div>
        )}

        {/* ═══ DESIGN MODE: SMART — Select sheets ═══ */}
        {designMode === 'smart' && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sky-600">
              <Zap className="w-4 h-4" />
              <span className="text-xs font-bold">طراحی هوشمند</span>
            </div>
            <p className="text-[10px] text-gray-400">بر اساس محاسبات ورست‌کیس — یک یا چند شیت انتخاب کنید:</p>

            {(Object.keys(SHEET_INFO) as DesignSheet[]).map(s => {
              const info = SHEET_INFO[s]
              return (
                <button key={s} onClick={() => setActiveSheet(s)}
                  className={`w-full p-3 rounded-xl text-right transition-all border ${
                    activeSheet === s
                      ? `bg-gradient-to-r ${info.color} text-white border-transparent shadow-md`
                      : 'bg-white/40 text-gray-600 border-gray-200 hover:bg-white/60'
                  }`}>
                  <div className="flex items-center gap-2">
                    <span className="text-lg">{info.icon}</span>
                    <div>
                      <div className="text-sm font-medium">{info.label}</div>
                      <div className={`text-[10px] ${activeSheet === s ? 'text-white/80' : 'text-gray-400'}`}>{info.desc}</div>
                    </div>
                  </div>
                </button>
              )
            })}

            <div className="flex gap-2">
              <button onClick={handleGenerate}
                className="flex-1 py-2.5 bg-gradient-to-r from-sky-500 to-blue-600 text-white rounded-xl text-sm font-medium shadow hover:shadow-md transition-all flex items-center justify-center gap-2">
                <Zap className="w-4 h-4" /> تولید {SHEET_INFO[activeSheet].label}
              </button>
              <button onClick={() => setDesignMode('choose')}
                className="py-2.5 px-3 bg-white/50 text-gray-500 rounded-xl text-xs border border-gray-200 hover:bg-white/70 transition">
                برگشت
              </button>
            </div>
          </div>
        )}

        {/* ═══ DESIGN MODE: MANUAL — User-driven ═══ */}
        {designMode === 'manual' && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-amber-600">
              <PenTool className="w-4 h-4" />
              <span className="text-xs font-bold">طراحی دستی</span>
            </div>

            <div className="bg-amber-50/50 rounded-xl border border-amber-200 p-3">
              <p className="text-[10px] text-amber-700 font-medium mb-2">راهنمای طراحی دستی:</p>
              <ol className="text-[10px] text-amber-600 space-y-1 list-decimal list-inside">
                <li>ابزار <strong>جاده</strong> را انتخاب کنید و رینگ اصلی را رسم کنید</li>
                <li>تجهیزات (مانیتور، هایدرانت، فوم چمبر) را روی نقشه جانمایی کنید</li>
                <li>لوله‌ها و اتصالات را رسم کنید</li>
                <li>در هر لحظه خروجی هر شیت را ببینید</li>
              </ol>
            </div>

            {/* Sheet Selection */}
            <h4 className="text-xs font-bold text-gray-600">شیت خروجی:</h4>
            <div className="flex gap-1">
              {(Object.keys(SHEET_INFO) as DesignSheet[]).map(s => {
                const info = SHEET_INFO[s]
                return (
                  <button key={s} onClick={() => setActiveSheet(s)}
                    className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition-all ${
                      activeSheet === s
                        ? `bg-gradient-to-r ${info.color} text-white shadow`
                        : 'bg-white/40 text-gray-500 hover:bg-white/60'
                    }`}>
                    {info.icon} {info.label}
                  </button>
                )
              })}
            </div>

            {/* Show current equipment count */}
            <div className="bg-white/40 rounded-xl border border-gray-200 p-3 space-y-1">
              <div className="text-[10px] text-gray-500 font-medium">تجهیزات موجود روی نقشه:</div>
              <div className="text-[10px] text-gray-600">
                مانیتور: <strong>{elements.filter(e => e.type === 'monitor').length}</strong> |
                هایدرانت: <strong>{elements.filter(e => e.type === 'hydrant').length}</strong> |
                لوله: <strong>{pipes.length}</strong>
              </div>
              <div className="text-[10px] text-gray-600">
                فوم چمبر: <strong>{elements.filter(e => e.type === 'foam_chamber').length}</strong> |
                CO₂: <strong>{elements.filter(e => e.type === 'co2').length}</strong>
              </div>
            </div>

            <div className="flex gap-2">
              <button onClick={handleGenerate}
                disabled={elements.filter(e => e.type === 'monitor' || e.type === 'hydrant').length === 0}
                className={`flex-1 py-2.5 rounded-xl text-sm font-medium shadow transition-all flex items-center justify-center gap-2 ${
                  elements.filter(e => e.type === 'monitor' || e.type === 'hydrant').length > 0
                    ? 'bg-gradient-to-r from-amber-500 to-orange-500 text-white hover:shadow-md'
                    : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                }`}>
                <Layers className="w-4 h-4" /> تولید خروجی {SHEET_INFO[activeSheet].label}
              </button>
              <button onClick={() => setDesignMode('choose')}
                className="py-2.5 px-3 bg-white/50 text-gray-500 rounded-xl text-xs border border-gray-200 hover:bg-white/70 transition">
                برگشت
              </button>
            </div>
          </div>
        )}

        {/* ═══ DESIGN MODE: RESULT ═══ */}
        {designMode === 'result' && design && (
          <div className="space-y-2">
            {/* Active Sheet Tabs */}
            <div className="flex gap-1 mb-2">
              {(Object.keys(SHEET_INFO) as DesignSheet[]).map(s => {
                const info = SHEET_INFO[s]
                return (
                  <button key={s} onClick={() => setActiveSheet(s)}
                    className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition-all ${
                      activeSheet === s
                        ? `bg-gradient-to-r ${info.color} text-white shadow`
                        : 'bg-white/40 text-gray-500 hover:bg-white/60'
                    }`}>
                    {info.icon} {info.label}
                  </button>
                )
              })}
            </div>
            <p className="text-[10px] text-gray-400 text-center mb-2">{SHEET_INFO[activeSheet].desc}</p>

            {/* Equipment BOM */}
            <ResSec title="تجهیزات و لوازم" color="sky">
              <RRow label="مانیتور آتش‌نشانی (۹۰۰ Lpm)" value={`${design.monitorCount} عدد`} />
              <RRow label="هایدرانت" value={`${design.hydrantCount} عدد`} />
              {design.hasCooling && <RRow label="نازل خنک‌کاری" value={`${design.coolingNozzles} عدد`} />}
              {design.hasFoaming && <RRow label="فوم چمبر" value={`${design.foamChambers} عدد`} />}
              <RRow label="شیر ایزوله" value={`${design.isolationValves} عدد`} />
              <RRow label="شیر پروانه‌ای" value={`${design.butterflyValves} عدد`} />
              <RRow label="شیر چک" value={`${design.checkValves} عدد`} />
              <RRow label="زانو" value={`${design.elbows} عدد`} />
              <RRow label="سه‌راهی" value={`${design.tees} عدد`} />
              {design.hasCO2 && design.co2Systems > 0 && (
                <RRow label="سیستم CO₂ اتوماتیک" value={`${design.co2Systems} عدد`} />
              )}
            </ResSec>

            {/* Pipes */}
            <ResSec title="لوله‌کشی" color="cyan">
              <RRow label="رینگ اصلی" value={design.mainPipe} />
              <RRow label="طول کل لوله" value={`${design.totalPipeLength} متر`} />
              {Object.entries(design.pipeLengths).map(([size, len]) => (
                <RRow key={size} label={`  ${size}`} value={`${len}m`} />
              ))}
              <RRow label="سرعت جریان" value={`${design.velocity} m/s`} />
              <RRow label="افت فشار (۵۰۰m)" value={`${design.frictionLossM} m / ${design.frictionLossBar} bar`} formula="Hazen-Williams" />
              {design.hasCooling && <RRow label="لوله خنک‌کاری" value={design.coolingPipe} />}
              {design.hasFoaming && <RRow label="لوله فوم" value={design.foamPipe} />}
              {design.sheet !== 'gamma' && <RRow label="لوله فرعی" value={design.branchPipe} />}
            </ResSec>

            {/* Water & Foam */}
            <ResSec title="آب و فوم" color="emerald">
              <RRow label="دبی کل" value={`${design.totalFlow} Lpm`} />
              <RRow label="آب اطفا" value={`${design.fireFightingWater} m³`} />
              <RRow label="آب خنک‌کاری (۴ ساعته)" value={`${design.coolingWater4h} m³`} />
              <RRow label="کل آب مورد نیاز" value={`${design.totalWater} m³`} bold />
              {design.hasFoaming && <>
                <RRow label="کنسانتره ۳٪" value={`${design.foamConcentrate3} L`} />
                <RRow label="کنسانتره ۶٪" value={`${design.foamConcentrate6} L`} />
                <RRow label="محلول فوم" value={`${design.foamSolution} L`} />
              </>}
            </ResSec>

            {/* Formulas */}
            <button onClick={() => setShowFormulas(!showFormulas)}
              className="w-full flex items-center justify-center gap-1 text-xs text-gray-400 hover:text-gray-600 transition">
              {showFormulas ? 'بستن فرمول‌ها' : 'فرمول‌ها و استانداردها'}
              {showFormulas ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            </button>
            {showFormulas && (
              <div className="p-3 bg-gray-50/50 rounded-xl border border-gray-200 text-[10px] text-gray-500 space-y-2">
                <div><strong>NFPA 11:</strong> FSDR = Area × Rate | V = FSDR × t</div>
                <div><strong>§3.10:</strong> Cooling = A_wetted × {NFPA15.waterSprayRateLminM2} Lpm/m²</div>
                <div><strong>NFPA 20:</strong> TDH = Static + Friction + Residual</div>
                <div><strong>Hazen-Williams:</strong> h = 10.67×L×Q^1.852 / (C^1.852×D^4.87)</div>
                <div><strong>V限额:</strong> v ≤ 3.0 m/s (fire protection)</div>
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-2 mt-3">
              <button onClick={handlePrint}
                className="flex-1 py-2 bg-white/50 rounded-xl text-xs text-gray-600 border border-gray-200 hover:bg-white/70 transition flex items-center justify-center gap-1">
                <Printer className="w-3 h-3" /> پرینت
              </button>
              <button onClick={handleExport}
                className="flex-1 py-2 bg-white/50 rounded-xl text-xs text-gray-600 border border-gray-200 hover:bg-white/70 transition flex items-center justify-center gap-1">
                <Download className="w-3 h-3" /> خروجی
              </button>
            </div>

            <div className="flex gap-2">
              <button onClick={handleReset}
                className="flex-1 py-2 bg-white/50 rounded-xl text-xs text-gray-500 hover:bg-white/70 transition flex items-center justify-center gap-1">
                <RefreshCw className="w-3 h-3" /> بازسازی
              </button>
              <button onClick={() => setDesignMode('choose')}
                className="flex-1 py-2 bg-white/50 rounded-xl text-xs text-gray-500 hover:bg-white/70 transition flex items-center justify-center gap-1">
                <Edit3 className="w-3 h-3" /> اصلاح
              </button>
            </div>
          </div>
        )}

        {/* Empty state */}
        {designMode === 'choose' && !hasWorstCase && (
          <div className="text-center py-6 text-gray-400 text-xs">
            <Layers className="w-8 h-8 mx-auto mb-2 opacity-30" />
            ابتدا ورست‌کیس را تکمیل کنید
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Reusable Components ───
function ResSec({ title, color, children }: { title: string; color: string; children: React.ReactNode }) {
  const cm: Record<string, string> = {
    sky: 'bg-sky-50/50 border-sky-200 text-sky-600',
    cyan: 'bg-cyan-50/50 border-cyan-200 text-cyan-600',
    emerald: 'bg-emerald-50/50 border-emerald-200 text-emerald-600',
    amber: 'bg-amber-50/50 border-amber-200 text-amber-600',
  }
  return (
    <div className={`rounded-xl border p-3 ${cm[color] || cm.sky}`}>
      <h4 className="text-xs font-bold mb-2">{title}</h4>
      <div className="space-y-1">{children}</div>
    </div>
  )
}

function RRow({ label, value, formula, bold }: { label: string; value: string; formula?: string; bold?: boolean }) {
  return (
    <div className={`flex justify-between items-center text-xs ${bold ? 'font-bold' : ''}`}>
      <span className="text-gray-500">{label}</span>
      <div className="text-left">
        <span className={`font-medium ${bold ? 'text-gray-800' : 'text-gray-700'}`}>{value}</span>
        {formula && <div className="text-[9px] text-gray-400 font-normal">{formula}</div>}
      </div>
    </div>
  )
}

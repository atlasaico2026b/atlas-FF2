// SPDX-License-Identifier: Apache-2.0
import { useState, useCallback, useMemo } from 'react'
import { Sparkles, Hand, RotateCcw, ChevronDown, Info } from 'lucide-react'
import type { DesignElement, PipeSegment } from './DesignWorkspace'
import {
  calcFoamConcentrateQuantity,
  calcSupplementaryFoamQuantity,
  getSupplementaryHoseLines,
  calcCoolingWaterRate,
  calcTotalDynamicHead,
  calcPumpPower,
  calcJockeyPumpSpec,
  hazenWilliamsHeadLoss_LPM,
  headLossToBar,
  recommendPipeSize,
  calcPipeVelocity,
} from '../lib/fireCalculations'
import { defaultSpecConfig, specRunForElement } from '../lib/specProject'
import type { SpecRun } from '../lib/spec/engine'

/**
 * Foam demand is read from the specification engine, per tank, so each tank's own
 * roof type selects its rate, protected area and outlet table. The site terms in
 * this configuration do not enter a tank-level foam basis.
 */
const SPEC_CONFIG = defaultSpecConfig()

import { NFPA15 } from '../lib/calc/constants'

interface DesignProposalProps {
  elements: DesignElement[]
  zones: Record<string, string>
  project: any
  pipes: PipeSegment[]
  onAddPipe: (pipe: PipeSegment) => void
}

export default function DesignProposal({ elements, zones, project, pipes, onAddPipe }: DesignProposalProps) {
  const [mode, setMode] = useState<'choose' | 'ai' | 'manual'>('choose')
  const [isGenerating, setIsGenerating] = useState(false)
  const [showFormulas, setShowFormulas] = useState(false)

  const waterTanks = useMemo(() => elements.filter(e => e.type === 'water_tank'), [elements])
  const pumps = useMemo(() => elements.filter(e => e.type === 'pump'), [elements])
  const monitors = useMemo(() => elements.filter(e => e.type === 'monitor'), [elements])
  const hydrants = useMemo(() => elements.filter(e => e.type === 'hydrant'), [elements])
  const oilTanks = useMemo(() => elements.filter(e => e.type === 'oil_tank'), [elements])

  const proposal = useMemo(() => {
    // Roof-aware, per tank. This used to average the tank diameters and then run
    // the cone-roof basis (gasoline, fixed roof) for the whole site — so a site of
    // floating-roof tanks was proposed a fixed-roof system, and a site whose roofs
    // were never declared was proposed one silently.
    const tankRuns = oilTanks
      .map(el => specRunForElement(el, SPEC_CONFIG))
      .filter((r): r is SpecRun => r !== null)
    const foamRuns = tankRuns.filter(r => r.foam !== null)
    const roofMissingCount = tankRuns.length - foamRuns.length

    const avgDiameter = tankRuns.length > 0
      ? tankRuns.reduce((sum, r) => sum + r.geometry.diameterM, 0) / tankRuns.length
      : 25
    const tankHeight = tankRuns.length > 0
      ? tankRuns.reduce((sum, r) => sum + r.geometry.shellHeightM, 0) / tankRuns.length
      : 12

    // Demand sums over the tanks that have a declared basis; the rate and time
    // shown are the governing (largest) values across them.
    const surfaceArea = foamRuns.reduce((sum, r) => sum + (r.foam?.areaM2 ?? 0), 0)
    const fsdr = foamRuns.reduce((sum, r) => sum + (r.foam?.qSolutionLpm ?? 0), 0)
    const foamChambers = foamRuns.reduce((sum, r) => sum + (r.foam?.outletCount ?? 0), 0)
    const applicationRate = foamRuns.length
      ? Math.max(...foamRuns.map(r => r.foam?.rateLminM2 ?? 0))
      : 0
    const dischargeTime = foamRuns.length
      ? Math.max(...foamRuns.map(r => r.foam?.timeMin ?? 0))
      : 0

    /** The tank the site is sized around — the one with the largest foam flow. */
    const governing = foamRuns.reduce<SpecRun | null>(
      (best, r) => (best === null || (r.foam?.qSolutionLpm ?? 0) > (best.foam?.qSolutionLpm ?? 0) ? r : best),
      null,
    )
    const governingDiameter = governing?.geometry.diameterM ?? avgDiameter
    const flowPerChamber = foamChambers > 0 ? fsdr / foamChambers : 0
    const primaryFoam = calcFoamConcentrateQuantity(fsdr, dischargeTime, 3)
    const hoseInfo = getSupplementaryHoseLines(governingDiameter)
    const supplementaryFoam = calcSupplementaryFoamQuantity(hoseInfo.count, hoseInfo.dischargeTimeMin, 3)

    // NFPA 15 — Cooling
    const cooling = calcCoolingWaterRate(avgDiameter, tankHeight, governing?.geometry.roofKind ?? null)

    // Total system demand
    const totalDemand = fsdr + cooling.totalFlowLpm

    // NFPA 20 — Pump sizing
    const tdh = calcTotalDynamicHead(5, 15, 70) // static + friction + residual
    const pumpPower = calcPumpPower(totalDemand, tdh)
    const jockey = calcJockeyPumpSpec(totalDemand, tdh)

    // Hazen-Williams — Pipe sizing
    const pipeSize = recommendPipeSize(totalDemand)
    const pipeSizeUp = recommendPipeSize(totalDemand * 1.25)
    const pipeVelocity = calcPipeVelocity(totalDemand, pipeSize.id)
    const frictionLoss500m = hazenWilliamsHeadLoss_LPM(500, totalDemand, 100, pipeSize.id)
    const frictionLossBar = headLossToBar(frictionLoss500m)

    // Water storage
    const waterVolume = (totalDemand * dischargeTime) / 1000 * 1.1

    // Recommended counts
    const monitorCount = Math.max(monitors.length, Math.ceil(fsdr / 1500))
    const hydrantCount = Math.max(hydrants.length, Math.ceil(cooling.totalFlowLpm / 1000))

    return {
      ringSize: `${pipeSize.nominal} (Ø${pipeSize.id}mm)`,
      ringSizeRec: `${pipeSizeUp.nominal} (Ø${pipeSizeUp.id}mm)`,
      pipeVelocity: pipeVelocity.toFixed(1),
      frictionLossBar: frictionLossBar.toFixed(2),
      foam: {
        surfaceArea: surfaceArea.toFixed(0),
        applicationRate,
        dischargeTime: dischargeTime,
        fsdr: Math.round(fsdr),
        chambers: foamChambers,
        flowPerChamber: Math.round(flowPerChamber),
        primaryFoam: Math.round(primaryFoam),
        supplementaryFoam: Math.round(supplementaryFoam),
        totalFoam: Math.round(primaryFoam + supplementaryFoam),
      },
      cooling: {
        wettedArea: Math.round(cooling.wettedAreaM2),
        flowLpm: Math.round(cooling.totalFlowLpm),
        volumeM3: Math.round(cooling.totalFlowLpm * dischargeTime / 1000),
      },
      pump: {
        flowLpm: Math.round(totalDemand),
        headM: Math.round(tdh),
        powerKW: Math.round(pumpPower * 1.1),
        jockeyFlow: jockey.flowLpm,
        jockeyHead: jockey.headM,
        jockeyPower: jockey.powerKW,
      },
      monitorCount,
      hydrantCount,
      waterVolume: Math.round(waterVolume),
      totalDemand: Math.round(totalDemand),
      /** Tanks whose roof type (IN-008) is not declared — excluded from the foam sums. */
      roofMissingCount,
      tankCount: tankRuns.length,
    }
  }, [elements, oilTanks, monitors, hydrants])

  const generateDesign = useCallback(() => {
    setIsGenerating(true)
    setTimeout(() => {
      // Generate ring main pipe connecting water tanks to pumps
      if (waterTanks.length > 0 && pumps.length > 0) {
        const tankCenter = {
          x: waterTanks[0].x + waterTanks[0].width / 2,
          y: waterTanks[0].y + waterTanks[0].height / 2,
        }
        const pumpCenter = {
          x: pumps[0].x + pumps[0].width / 2,
          y: pumps[0].y + pumps[0].height / 2,
        }
        const pipe: PipeSegment = {
          id: `ring-${Date.now()}`,
          points: [tankCenter, { x: pumpCenter.x, y: tankCenter.y }, pumpCenter],
          layer: 6,
          color: '#dc2626',
          label: `رینگ ${proposal.ringSize}`,
          length: Math.round(Math.abs(pumpCenter.x - tankCenter.x) / 10 + Math.abs(pumpCenter.y - tankCenter.y) / 10),
        }
        onAddPipe(pipe)
      }
      setIsGenerating(false)
      setMode('ai')
    }, 2000)
  }, [waterTanks, pumps, onAddPipe, proposal])

  return (
    <div className="w-80 bg-white/60 backdrop-blur-md border-l border-white/50 overflow-y-auto flex-shrink-0">
      <div className="p-4">
        <h3 className="font-bold text-gray-700 mb-1">طراحی رینگ آب آتش‌نشانی</h3>
        <p className="text-[10px] text-gray-400 mb-4">
          NFPA 20 + NFPA 11 + Hazen-Williams + IPS-E-GN-100
        </p>

        {mode === 'choose' && (
          <div className="space-y-3">
            <button
              onClick={generateDesign}
              disabled={isGenerating}
              className="w-full p-4 bg-gradient-to-r from-sky-500 to-blue-500 text-white rounded-2xl font-medium shadow-md hover:shadow-lg transition-all flex items-center gap-3 disabled:opacity-50"
            >
              <Sparkles className="w-6 h-6" />
              <div className="text-right">
                <div>طراحی پیشنهادی هوش اطلس</div>
                <div className="text-xs opacity-80">محاسبه خودکار بر اساس استانداردها</div>
              </div>
            </button>
            <button
              onClick={() => setMode('manual')}
              className="w-full p-4 bg-white/50 backdrop-blur-md text-gray-600 rounded-2xl font-medium border border-white/50 hover:bg-white/70 transition-all flex items-center gap-3"
            >
              <Hand className="w-6 h-6" />
              <div className="text-right">
                <div>طراحی دستی (Manual)</div>
                <div className="text-xs text-gray-400">ترسیم دستی با ابزار خط رسم</div>
              </div>
            </button>
          </div>
        )}

        {mode === 'ai' && isGenerating && (
          <div className="text-center py-8">
            <div className="animate-spin w-12 h-12 border-4 border-sky-200 border-t-sky-500 rounded-full mx-auto mb-4" />
            <p className="text-gray-500 text-sm">در حال محاسبه...</p>
            <p className="text-gray-400 text-xs mt-2">NFPA 20 + Hazen-Williams + NFPA 11</p>
          </div>
        )}

        {mode === 'ai' && !isGenerating && (
          <div className="space-y-3">
            {/* RING MAIN */}
            <ResultCard title="رینگ اصلی آب" icon="🔵">
              <ResultRow label="سایز پیشنهادی" value={proposal.ringSize} />
              <ResultRow label="سایز پیشنهادی+" value={proposal.ringSizeRec} />
              <ResultRow label="سرعت جریان" value={`${proposal.pipeVelocity} m/s`} />
              <ResultRow label="افت فشار (۵۰۰m)" value={`${proposal.frictionLossBar} bar`} formula="Hazen-Williams" />
            </ResultCard>

            {/* PUMP SPECS */}
            <ResultCard title="مشخصات پمپ — NFPA 20" icon="🔧">
              <ResultRow label="دبی" value={`${proposal.pump.flowLpm} Lpm`} />
              <ResultRow label="فشار کل (TDH)" value={`${proposal.pump.headM} m`} />
              <ResultRow label="توان" value={`${proposal.pump.powerKW} kW`} />
              <div className="border-t border-sky-100 pt-1 mt-1">
                <ResultRow label="جوکی — دبی" value={`${proposal.pump.jockeyFlow} Lpm`} />
                <ResultRow label="جوکی — فشار" value={`${proposal.pump.jockeyHead} m`} />
                <ResultRow label="جوکی — توان" value={`${proposal.pump.jockeyPower} kW`} />
              </div>
            </ResultCard>

            {/* FOAM */}
            <ResultCard title="فوم — NFPA 11" icon="🟡">
              {proposal.roofMissingCount > 0 && (
                <p className="text-[10px] text-red-600 bg-red-50 rounded-lg p-2 border border-red-200 leading-relaxed">
                  {proposal.roofMissingCount} از {proposal.tankCount} مخزن نوع سقف ثبت نشده دارند و در جمع فوم
                  حساب نشده‌اند. نرخ پاشش و تعداد چمبر هر مخزن از نوع سقف خودش می‌آید — ابتدا آن را در
                  «مشخصات تجهیزات» ثبت کنید.
                </p>
              )}
              <ResultRow label="مساحت سطح" value={`${proposal.foam.surfaceArea} m²`} />
              <ResultRow label="شدت پاشش" value={`${proposal.foam.applicationRate} Lpm/m²`} />
              <ResultRow label="زمان پاشش" value={`${proposal.foam.dischargeTime} دقیقه`} />
              <ResultRow label="FSDR" value={`${proposal.foam.fsdr} Lpm`} />
              <ResultRow label="فوم چمبر" value={`${proposal.foam.chambers} عدد`} />
              <ResultRow label="دبی هر چمبر" value={`${proposal.foam.flowPerChamber} Lpm`} />
              <div className="border-t border-amber-100 pt-1 mt-1">
                <ResultRow label="کنسانتره کل" value={`${proposal.foam.totalFoam} L`} bold />
              </div>
            </ResultCard>

            {/* COOLING */}
            <ResultCard title="خنک‌کاری — NFPA 15" icon="💧">
              <ResultRow label="مساحت خیس" value={`${proposal.cooling.wettedArea} m²`} />
              <ResultRow label="دبی" value={`${proposal.cooling.flowLpm} Lpm`} />
              <ResultRow label="حجم آب" value={`${proposal.cooling.volumeM3} m³`} />
            </ResultCard>

            {/* SUMMARY */}
            <ResultCard title="خلاصه سیستم" icon="📊">
              <ResultRow label="دبی کل" value={`${proposal.totalDemand} Lpm`} />
              <ResultRow label="حجم مخزن آب" value={`${proposal.waterVolume} m³`} />
              <ResultRow label="تعداد مانیتور" value={`${proposal.monitorCount}`} />
              <ResultRow label="تعداد هایدرانت" value={`${proposal.hydrantCount}`} />
              <ResultRow label="لوله‌های رسم شده" value={`${pipes.length}`} />
            </ResultCard>

            {/* Formula Reference */}
            <button
              onClick={() => setShowFormulas(!showFormulas)}
              className="w-full flex items-center justify-center gap-1 text-xs text-gray-400 hover:text-gray-600 transition"
            >
              <Info className="w-3 h-3" />
              {showFormulas ? 'بستن فرمول‌ها' : 'مشاهده فرمول‌ها'}
              <ChevronDown className={`w-3 h-3 transition-transform ${showFormulas ? 'rotate-180' : ''}`} />
            </button>

            {showFormulas && (
              <div className="p-3 bg-gray-50/50 rounded-xl border border-gray-200 text-[10px] text-gray-500 space-y-2">
                <div><strong>Hazen-Williams:</strong><br />h = 10.67 × L × Q^1.852 / (C^1.852 × D^4.87)</div>
                <div><strong>§4 HYD/PUMP:</strong><br />TDH = Static + Friction + Residual<br />P = (Q/60000 × TDH × ρ × g) / (1000 × η)</div>
                <div><strong>NFPA 11:</strong><br />FSDR = Area × App Rate<br />Concentrate = FSDR × Time × %</div>
                <div><strong>§3.10:</strong><br />Cooling = {NFPA15.waterSprayRateLminM2} Lpm/m² × Wetted Area</div>
              </div>
            )}

            <div className="flex gap-2">
              <button
                onClick={() => setMode('choose')}
                className="flex-1 px-3 py-2 bg-white/50 rounded-xl text-xs text-gray-500 hover:bg-white/70 transition flex items-center justify-center gap-1"
              >
                <RotateCcw className="w-3 h-3" />
                برگشت
              </button>
              <button
                onClick={() => setMode('manual')}
                className="flex-1 px-3 py-2 bg-sky-100 rounded-xl text-xs text-sky-600 hover:bg-sky-200 transition flex items-center justify-center gap-1"
              >
                <Hand className="w-3 h-3" />
                ویرایش دستی
              </button>
            </div>
          </div>
        )}

        {mode === 'manual' && (
          <div className="space-y-3">
            <p className="text-xs text-gray-400">
              از ابزار «رسم خط» در نوار بالا استفاده کنید تا مسیر لوله‌ها را ترسیم کنید.
            </p>
            <div className="p-3 bg-white/50 rounded-xl border border-white/50">
              <div className="text-xs text-gray-500 mb-2">راهنما:</div>
              <ul className="text-xs text-gray-400 space-y-1">
                <li>• ابزار «رسم خط» را انتخاب کنید</li>
                <li>• کلیک چپ: ادامه مسیر</li>
                <li>• کلیک راست: پایان مسیر</li>
                <li>• لوله‌ها رنگ‌بندی خودکار دارند</li>
              </ul>
            </div>
            <div className="text-xs text-gray-400">
              لوله‌های رسم شده: {pipes.length}
            </div>
            <button
              onClick={() => setMode('choose')}
              className="w-full px-3 py-2 bg-white/50 rounded-xl text-xs text-gray-500 hover:bg-white/70 transition"
            >
              برگشت
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

function ResultCard({ title, icon, children }: { title: string; icon: string; children: React.ReactNode }) {
  return (
    <div className="p-3 bg-sky-50/50 rounded-xl border border-sky-200">
      <h4 className="text-xs font-bold text-sky-600 mb-2">{icon} {title}</h4>
      <div className="space-y-1">{children}</div>
    </div>
  )
}

function ResultRow({ label, value, formula, bold }: { label: string; value: string; formula?: string; bold?: boolean }) {
  return (
    <div className={`flex justify-between items-center text-xs ${bold ? 'font-bold' : ''}`}>
      <span className="text-gray-500">{label}</span>
      <div className="text-left">
        <span className={`font-medium ${bold ? 'text-sky-700' : 'text-gray-700'}`}>{value}</span>
        {formula && <div className="text-[9px] text-gray-400">{formula}</div>}
      </div>
    </div>
  )
}

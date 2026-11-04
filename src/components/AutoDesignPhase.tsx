// SPDX-License-Identifier: Apache-2.0
import { useState, useMemo, useCallback } from 'react'
import {
  Wand2, Settings, RotateCcw, Check, Info, Droplets,
  Flame, Gauge, Circle, ArrowLeft
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Badge } from '@/components/ui/badge'
import type { DesignElement, PipeSegment, LayerConfig } from './DesignWorkspace'
import {
  calcCoolingWaterRate, calcTotalDynamicHead,
  calcPumpPower, calcJockeyPumpSpec, recommendPipeSize,
  hazenWilliamsHeadLoss_LPM, headLossToBar,
} from '@/lib/fireCalculations'
import { defaultSpecConfig, specRunForElement } from '@/lib/specProject'
import { HYDRAULICS } from '@/lib/calc/constants'

/**
 * Foam demand is summed from the specification engine, per tank, so each tank's
 * own roof type selects its rate and protected area.
 */
const SPEC_CONFIG = defaultSpecConfig()

interface AutoDesignPhaseProps {
  elements: DesignElement[]
  pipes: PipeSegment[]
  zones: Record<string, string>
  project: any
  onAddPipe: (pipe: PipeSegment) => void
  onAddElement: (element: DesignElement) => void
  onSetMode: (mode: 'auto' | 'manual' | null) => void
  designMode: 'auto' | 'manual' | null
}

interface DesignResult {
  ringMainSize: { nominal: string; id: number }
  ringMainSizeUp: { nominal: string; id: number }
  pumpSpec: {
    flowRateLpm: number
    tdhM: number
    powerKW: number
    impellerType: string
  }
  jockeySpec: {
    flowLpm: number
    headM: number
    powerKW: number
  }
  waterTankVolume: number
  monitorCount: number
  monitorFlowEach: number
  hydrantCount: number
  hydrantFlowEach: number
  totalSystemDemand: number
  foamDemand: number
  /** Tanks whose roof type (IN-008) is unstated — excluded from the foam sum. */
  roofMissingCount: number
  coolingDemand: number
  ringMainLength: number
  pressureLoss: number
  valvePositions: { x: number; y: number; type: string }[]
  monitorPositions: { x: number; y: number; flowLpm: number }[]
  hydrantPositions: { x: number; y: number }[]
}

export default function AutoDesignPhase({
  elements, pipes, zones, project, onAddPipe, onAddElement, onSetMode, designMode
}: AutoDesignPhaseProps) {
  const [generating, setGenerating] = useState(false)
  const [result, setResult] = useState<DesignResult | null>(null)
  const [showDetails, setShowDetails] = useState(false)

  const oilTanks = useMemo(() => elements.filter(e => e.type === 'oil_tank'), [elements])
  const waterTanks = useMemo(() => elements.filter(e => e.type === 'water_tank'), [elements])
  const pumps = useMemo(() => elements.filter(e => e.type === 'pump'), [elements])

  const generateAutoDesign = useCallback(() => {
    setGenerating(true)

    // Simulate AI design process
    setTimeout(() => {
      // Calculate total fire demand from all tanks
      let totalFoamFlow = 0
      let totalCoolingFlow = 0

      let roofMissingCount = 0

      oilTanks.forEach(tank => {
        const props = tank.properties || {}
        const diameter = (props.diameter as number) || 30
        const height = (props.height as number) || 15

        // Roof-aware. This loop used to apply the cone-roof rate to the plan area
        // of every tank, whatever its roof. The engine now selects the rate, the
        // protected area and the outlet table from the tank's own roof kind
        // (IN-008), and reports a tank whose roof is not on record instead of
        // sizing the pump on a guess.
        const run = specRunForElement(tank, SPEC_CONFIG)
        const fsdr = run?.foam?.qSolutionLpm ?? 0
        if (run === null || run.foam === null) roofMissingCount += 1
        totalFoamFlow += fsdr

        const cooling = calcCoolingWaterRate(diameter, height, run?.geometry.roofKind ?? null)
        totalCoolingFlow += cooling.totalFlowLpm
      })

      // Monitor flows: standard 450 and 900 L/min
      const monitorFlowEach = 900
      const monitorCount = Math.max(4, Math.ceil(oilTanks.length * 2))
      const totalMonitorFlow = monitorCount * monitorFlowEach

      // Hydrant flows: 2.5 inch = ~750 L/min each
      const hydrantFlowEach = 750
      const hydrantCount = Math.max(4, Math.ceil(elements.length * 0.5))
      const totalHydrantFlow = hydrantCount * hydrantFlowEach

      // Total system demand (worst case: simultaneous foam + cooling + nearest monitors)
      const totalDemand = Math.max(
        totalFoamFlow + totalCoolingFlow,
        totalMonitorFlow + totalHydrantFlow
      )

      // Pipe sizing
      const pipeSize = recommendPipeSize(totalDemand)
      const pipeSizeUp = recommendPipeSize(totalDemand * 1.25)

      // Ring main length estimate
      const ringMainLength = elements.length > 0 ? 800 : 0

      // Pressure loss (Hazen-Williams, C=120 for steel)
      const pressureLossM = hazenWilliamsHeadLoss_LPM(ringMainLength, totalDemand, HYDRAULICS.hazenWilliamsC, pipeSize.id)
      const pressureLossBar = headLossToBar(pressureLossM)

      // Pump sizing
      const staticLift = 5
      const residualPressureM = 70
      const tdh = calcTotalDynamicHead(staticLift, pressureLossM, residualPressureM)
      const pumpPower = calcPumpPower(totalDemand, tdh)

      // Jockey pump
      const jockey = calcJockeyPumpSpec(totalDemand, tdh)

      // Water tank volume: 4 hours of operations
      const waterTankVolume = totalDemand * 60 * 4 // 4 hours in liters

      // Generate positions for monitors, hydrants, valves
      const monitorPositions = Array.from({ length: monitorCount }, (_, i) => ({
        x: 100 + (i % 4) * 200,
        y: 100 + Math.floor(i / 4) * 200,
        flowLpm: monitorFlowEach,
      }))

      const hydrantPositions = Array.from({ length: hydrantCount }, (_, i) => ({
        x: 150 + (i % 3) * 250,
        y: 300 + Math.floor(i / 3) * 250,
      }))

      const valvePositions = Array.from({ length: Math.ceil(hydrantCount / 2) }, (_, i) => ({
        x: 200 + i * 300,
        y: 250,
        type: i % 2 === 0 ? 'butterfly' : 'gate',
      }))

      const designResult: DesignResult = {
        ringMainSize: pipeSize,
        ringMainSizeUp: pipeSizeUp,
        pumpSpec: {
          flowRateLpm: Math.round(totalDemand),
          tdhM: Math.round(tdh),
          powerKW: Math.round(pumpPower * 1.1),
          impellerType: totalDemand > 5000 ? 'axial' : 'radial',
        },
        jockeySpec: {
          flowLpm: jockey.flowLpm,
          headM: jockey.headM,
          powerKW: jockey.powerKW,
        },
        waterTankVolume: Math.round(waterTankVolume),
        monitorCount,
        monitorFlowEach,
        hydrantCount,
        hydrantFlowEach,
        totalSystemDemand: Math.round(totalDemand),
        foamDemand: Math.round(totalFoamFlow),
        roofMissingCount,
        coolingDemand: Math.round(totalCoolingFlow),
        ringMainLength,
        pressureLoss: Math.round(pressureLossBar * 100) / 100,
        valvePositions,
        monitorPositions,
        hydrantPositions,
      }

      setResult(designResult)
      setGenerating(false)
    }, 2000)
  }, [oilTanks, elements])

  const placeDesignElements = useCallback(() => {
    if (!result) return

    // Place monitors
    result.monitorPositions.forEach((pos, i) => {
      onAddElement({
        id: `monitor_${Date.now()}_${i}`,
        type: 'monitor',
        x: pos.x,
        y: pos.y,
        width: 40,
        height: 40,
        rotation: 0,
        layer: 6,
        label: `مانیتور ${i + 1}`,
        properties: { flowRate: pos.flowLpm, throw: 60 }
      })
    })

    // Place hydrants
    result.hydrantPositions.forEach((pos, i) => {
      onAddElement({
        id: `hydrant_${Date.now()}_${i}`,
        type: 'hydrant',
        x: pos.x,
        y: pos.y,
        width: 24,
        height: 24,
        rotation: 0,
        layer: 6,
        label: `هایدرانت ${i + 1}`,
        properties: { size: 2.5, flowRate: result.hydrantFlowEach }
      })
    })

    // Place valves
    result.valvePositions.forEach((pos, i) => {
      onAddElement({
        id: `valve_${Date.now()}_${i}`,
        type: pos.type === 'butterfly' ? 'butterfly_valve' : 'gate_valve',
        x: pos.x,
        y: pos.y,
        width: 20,
        height: 20,
        rotation: 0,
        layer: 6,
        label: `${pos.type === 'butterfly' ? 'ولو پروانه‌ای' : 'ولو'} ${i + 1}`,
        properties: { diameter: result.ringMainSize.id }
      })
    })

    onSetMode('auto')
  }, [result, onAddElement, onSetMode])

  return (
    <div className="w-96 bg-white/60 backdrop-blur-md border-l border-white/50 overflow-y-auto flex-shrink-0">
      <div className="p-4">
        <h3 className="font-bold text-gray-700 mb-1 flex items-center gap-2">
          <Wand2 className="w-5 h-5 text-sky-500" />
          طراحی خودکار رینگ آب
        </h3>
        <p className="text-xs text-gray-400 mb-4">
          هوش مصنوعی مسیر بهینه رینگ، پمپ، مانیتور و هایدرانت را طراحی می‌کند
        </p>

        {/* Mode Selection */}
        <div className="grid grid-cols-2 gap-2 mb-4">
          <button
            onClick={() => onSetMode('auto')}
            className={`p-3 rounded-xl border text-center transition-all ${
              designMode === 'auto'
                ? 'bg-sky-50 border-sky-300 shadow-sm'
                : 'bg-white/50 border-gray-200 hover:border-sky-200'
            }`}
          >
            <Wand2 className={`w-5 h-5 mx-auto mb-1 ${designMode === 'auto' ? 'text-sky-500' : 'text-gray-400'}`} />
            <span className={`text-[11px] font-medium ${designMode === 'auto' ? 'text-sky-600' : 'text-gray-500'}`}>
              طراحی خودکار
            </span>
          </button>
          <button
            onClick={() => onSetMode('manual')}
            className={`p-3 rounded-xl border text-center transition-all ${
              designMode === 'manual'
                ? 'bg-amber-50 border-amber-300 shadow-sm'
                : 'bg-white/50 border-gray-200 hover:border-amber-200'
            }`}
          >
            <Settings className={`w-5 h-5 mx-auto mb-1 ${designMode === 'manual' ? 'text-amber-500' : 'text-gray-400'}`} />
            <span className={`text-[11px] font-medium ${designMode === 'manual' ? 'text-amber-600' : 'text-gray-500'}`}>
              طراحی دستی
            </span>
          </button>
        </div>

        {/* Inputs Summary */}
        <div className="p-3 bg-white/50 rounded-xl border border-gray-100 mb-4 space-y-1.5">
          <Label className="text-[10px] font-bold text-gray-500 uppercase">ورودی‌های طراحی</Label>
          <div className="space-y-1 text-[11px] text-gray-600">
            <div className="flex justify-between"><span>مخازن نفتی:</span><span className="font-bold">{oilTanks.length}</span></div>
            <div className="flex justify-between"><span>مخازن آب:</span><span className="font-bold">{waterTanks.length}</span></div>
            <div className="flex justify-between"><span>پمپ‌ها:</span><span className="font-bold">{pumps.length}</span></div>
            <div className="flex justify-between"><span>کل تجهیزات:</span><span className="font-bold">{elements.length}</span></div>
          </div>
        </div>

        {/* Generate Button */}
        {!result && (
          <Button
            onClick={generateAutoDesign}
            disabled={generating || oilTanks.length === 0}
            className="w-full bg-gradient-to-r from-sky-500 to-blue-500 hover:from-sky-600 hover:to-blue-600 text-white h-10"
          >
            {generating ? (
              <>
                <div className="animate-spin w-4 h-4 border-2 border-white/30 border-t-white rounded-full ml-2" />
                در حال طراحی...
              </>
            ) : (
              <>
                <Wand2 className="w-4 h-4 ml-2" />
                تولید طراحی خودکار
              </>
            )}
          </Button>
        )}

        {oilTanks.length === 0 && !result && (
          <div className="flex items-center gap-2 mt-2 px-3 py-2 bg-amber-50 rounded-lg border border-amber-200">
            <Info className="w-4 h-4 text-amber-500 flex-shrink-0" />
            <span className="text-[10px] text-amber-600">ابتدا مخازن نفتی را در مرحله جانمایی قرار دهید</span>
          </div>
        )}

        {/* Results */}
        {result && (
          <div className="space-y-3">
            <Separator />

            {/* Ring Main */}
            <ResultSection
              icon={<Circle className="w-4 h-4 text-cyan-500" />}
              title="سایز رینگ آب آتش‌نشانی"
            >
              <div className="space-y-1.5">
                <div className="p-2 bg-cyan-50 rounded-lg border border-cyan-100">
                  <div className="text-sm font-bold text-cyan-700">{result.ringMainSize.nominal} (Ø{result.ringMainSize.id}mm)</div>
                  <div className="text-[10px] text-cyan-500 mt-0.5">حداقل استاندارد — فشار: {result.pressureLoss} bar افت</div>
                </div>
                <div className="p-2 bg-emerald-50 rounded-lg border border-emerald-100">
                  <div className="text-sm font-bold text-emerald-700">{result.ringMainSizeUp.nominal} (Ø{result.ringMainSizeUp.id}mm)</div>
                  <div className="text-[10px] text-emerald-500 mt-0.5">پیشنهاد اطلس — حداکثر توان عملیاتی (+25%)</div>
                </div>
              </div>
            </ResultSection>

            {/* Pump */}
            <ResultSection
              icon={<Droplets className="w-4 h-4 text-blue-500" />}
              title="مشخصات پمپ آتش‌نشانی"
            >
              <div className="space-y-1 text-[11px]">
                <ResultRow label="دبی" value={`${result.pumpSpec.flowRateLpm.toLocaleString()} L/min`} />
                <ResultRow label="هد کل (TDH)" value={`${result.pumpSpec.tdhM} m`} />
                <ResultRow label="توان" value={`${result.pumpSpec.powerKW} kW`} />
                <ResultRow label="نوع پروانه" value={result.pumpSpec.impellerType === 'axial' ? 'محوری' : 'شعاعی'} />
              </div>
            </ResultSection>

            {/* Jockey Pump */}
            <ResultSection
              icon={<Gauge className="w-4 h-4 text-purple-500" />}
              title="جوکی پمپ"
            >
              <div className="space-y-1 text-[11px]">
                <ResultRow label="دبی" value={`${result.jockeySpec.flowLpm} L/min`} />
                <ResultRow label="هد" value={`${result.jockeySpec.headM} m`} />
                <ResultRow label="توان" value={`${result.jockeySpec.powerKW} kW`} />
              </div>
            </ResultSection>

            {/* Water Tank */}
            <ResultSection
              icon={<Droplets className="w-4 h-4 text-sky-500" />}
              title="حجم مخزن آب مورد نیاز"
            >
              <div className="space-y-1 text-[11px]">
                <ResultRow label="حجم عملیاتی (4 ساعت)" value={`${(result.waterTankVolume / 1000).toFixed(0)} m³`} />
                <ResultRow label="دبی کل سیستم" value={`${result.totalSystemDemand.toLocaleString()} L/min`} />
              </div>
            </ResultSection>

            {/* Monitors & Hydrants */}
            <ResultSection
              icon={<Flame className="w-4 h-4 text-red-500" />}
              title="مانیتورها و هایدرانتها"
            >
              <div className="space-y-1 text-[11px]">
                <ResultRow label="مانیتور" value={`${result.monitorCount} عدد × ${result.monitorFlowEach} L/min`} />
                <ResultRow label="هایدرانت 2.5 اینچ" value={`${result.hydrantCount} عدد × ${result.hydrantFlowEach} L/min`} />
              </div>
            </ResultSection>

            {/* Foam & Cooling */}
            <ResultSection
              icon={<Flame className="w-4 h-4 text-orange-500" />}
              title="نیاز فوم و کولینگ"
            >
              <div className="space-y-1 text-[11px]">
                <ResultRow label="دبی فوم" value={`${result.foamDemand.toLocaleString()} L/min`} />
                <ResultRow label="دبی کولینگ" value={`${result.coolingDemand.toLocaleString()} L/min`} />
              </div>
              {result.roofMissingCount > 0 && (
                <p className="text-[10px] text-red-600 bg-red-50 rounded-lg p-2 border border-red-200 leading-relaxed">
                  {result.roofMissingCount} مخزن نوع سقف ثبت نشده دارد و در «دبی فوم» بالا حساب نشده است.
                  نرخ پاشش و مساحت حفاظت‌شده هر مخزن از نوع سقف خودش می‌آید — آن را در «مشخصات تجهیزات»
                  ثبت کنید تا نیاز فوم و در نتیجه دبی پمپ کامل شود.
                </p>
              )}
            </ResultSection>

            {/* Place Elements */}
            <Button
              onClick={placeDesignElements}
              className="w-full bg-emerald-500 hover:bg-emerald-600 text-white h-9"
            >
              <Check className="w-4 h-4 ml-2" />
              اعمال طراحی روی نقشه
            </Button>

            <Button
              variant="outline"
              onClick={() => setResult(null)}
              className="w-full h-8 text-xs"
            >
              <RotateCcw className="w-3.5 h-3.5 ml-1" />
              مجدد محاسبه کن
            </Button>
          </div>
        )}

        {/* Edit Notice */}
        {designMode === 'auto' && result && (
          <div className="mt-4 p-3 bg-sky-50/50 rounded-xl border border-sky-100">
            <p className="text-[10px] text-sky-600 leading-relaxed">
              پس از اعمال طراحی، می‌توانید با کلیک روی هر تجهیز، موقعیت و ویژگی‌های آن را تغییر دهید.
              برای بازگشت به طراحی خودکار، دکمه «مجدد محاسبه کن» را بزنید.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

function ResultSection({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        {icon}
        <Label className="text-xs font-bold text-gray-600">{title}</Label>
      </div>
      {children}
    </div>
  )
}

function ResultRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between items-center">
      <span className="text-gray-500">{label}</span>
      <span className="font-bold text-gray-700">{value}</span>
    </div>
  )
}

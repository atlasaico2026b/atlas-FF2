// SPDX-License-Identifier: Apache-2.0
// ═══════════════════════════════════════════════════════════════
// WORST CASE PANEL — Per Master Prompt (49 sections)
// States: choose → scanned → (smart_validate | manual_select) → result
// ═══════════════════════════════════════════════════════════════
import { useState, useMemo, useCallback } from 'react'
import {
  AlertTriangle, Zap, Scan, RotateCcw, Play, PenTool,
  CheckCircle, XCircle, ChevronDown, ChevronUp, Undo2, Printer,
  Download, Edit3, Trash2, RefreshCw, ArrowRight, Info,
} from 'lucide-react'
import type { DesignElement } from './DesignWorkspace'
import {
  FUEL_PROPERTIES,
  type HydrocarbonType, type TankType,
  calcFoamConcentrateQuantity, calcSupplementaryFoamQuantity,
  calcHandHoseSizing, calcCoolingNozzleCount,
  calcCoolingWaterRate, calcAdjacentTankCooling,
  calcTotalDynamicHead, calcPumpPower, calcJockeyPumpSpec, recommendPipeSize,
  hazenWilliamsHeadLoss_LPM, headLossToBar, calcPipeVelocity,
  calcTankVolume, calcAnnularRingArea,
  calcFloatingRoofDischargeRate,
} from '../lib/fireCalculations'
import { NFPA11, NFPA15 } from '../lib/calc/constants'
import { TABLE_E3_BEYOND_AREA_STEP_M2, TABLE_E3_CHAMBERS, TABLE_E5_HAND_HOSE } from '../lib/calc/nfpa11'
import { runSpecEngine, type SpecConfig, type SpecTank } from '../lib/spec/engine'
import { roofKindFromTankType, specConfigFromProject } from '../lib/specProject'

// ─── Types ───
interface WorstCasePanelProps {
  elements: DesignElement[]
  zones: Record<string, string>
  project: any
  onApplyDesign?: (design: any) => void
  onResetDesign?: () => void
}

type Mode = 'choose' | 'scanned' | 'smart_validate' | 'manual_select' | 'manual_scenario' | 'manual_config' | 'result'

interface TankInfo {
  id: string
  label: string
  name: string
  number: string
  x: number
  y: number
  diameterM: number
  heightM: number
  fuelType: HydrocarbonType
  /** IN-008. `null` = the project has not declared the roof — never assumed. */
  tankType: TankType | null
  hasCooling: boolean
  hasFoaming: boolean
  foamChambers: number
  foamChamberOverride: boolean
  adjacentTankIds: string[]
  zone: string
}

interface ScanResult {
  oilTanks: DesignElement[]
  waterTanks: DesignElement[]
  pumps: DesignElement[]
  monitors: DesignElement[]
  hydrants: DesignElement[]
  buildings: DesignElement[]
  co2: DesignElement[]
  turbines: DesignElement[]
}

const HYDROCARBON_LIST: { key: HydrocarbonType; label: string }[] = [
  { key: 'benzin', label: 'بنزین' },
  { key: 'benzin_super', label: 'بنزین سوپر' },
  { key: 'nafte_gaz', label: 'نفت گاز' },
  { key: 'nafte_safid', label: 'نفت سفید' },
  { key: 'nafta', label: 'نفتا' },
  { key: 'naft_kham', label: 'نفت خام سبک' },
  { key: 'naft_kham_torsh', label: 'نفت خام ترش' },
  { key: 'naft_kham_sangin', label: 'نفت خام سنگین' },
  { key: 'naft_koreh', label: 'نفت کوره' },
  { key: 'aloodeh', label: 'مواد آلوده' },
]

const TANK_SCENARIOS: Record<TankType, { key: string; label: string }[]> = {
  cone_roof: [
    { key: 'fixed_roof_fire', label: 'آتش سقف ثابت' },
    { key: 'fixed_roof_full', label: 'درگیری کامل مخزن' },
  ],
  floating_internal: [
    { key: 'rim_seal_fire', label: 'آتش ریم‌سیل' },
    { key: 'ifr_fully_involved', label: 'شناور داخلی درگیر کامل' },
  ],
  floating_external: [
    { key: 'rim_seal_fire', label: 'آتش ریم‌سیل خارجی' },
    { key: 'efr_sunk', label: 'غرق شدن سقف شناور' },
    { key: 'efr_fully_involved', label: 'شناور خارجی درگیر کامل' },
  ],
  contaminated: [
    { key: 'contaminated_spill', label: 'نشت مواد آلوده' },
    { key: 'contaminated_full', label: 'درگیری کامل مخزن' },
  ],
}

const BUILDING_TYPES = ['control_building', 'office_building', 'workshop', 'warehouse', 'hse_building', 'equipment_store', 'turbine', 'electrical_station', 'telecom_station', 'gas_station']

// ─── Helpers ───
function scanMap(elements: DesignElement[]): ScanResult {
  return {
    oilTanks: elements.filter(e => e.type === 'oil_tank'),
    waterTanks: elements.filter(e => e.type === 'water_tank'),
    pumps: elements.filter(e => e.type === 'pump'),
    monitors: elements.filter(e => e.type === 'monitor'),
    hydrants: elements.filter(e => e.type === 'hydrant'),
    buildings: elements.filter(e => BUILDING_TYPES.includes(e.type)),
    co2: elements.filter(e => e.type === 'co2'),
    turbines: elements.filter(e => e.type === 'turbine'),
  }
}

function elToTank(el: DesignElement): TankInfo {
  const p = el.properties || {}
  return {
    id: el.id,
    label: el.label || el.type,
    name: (p.tankName as string) || el.label || 'مخزن',
    number: (p.tankNumber as string) || el.id.slice(-4),
    x: el.x, y: el.y,
    diameterM: parseFloat(p.diameter as string) || 30,
    heightM: parseFloat(p.height as string) || 15,
    fuelType: (p.fuelType as HydrocarbonType) || 'nafte_gaz',
    // No `|| 'cone_roof'` here: inventing a roof is what made this panel print
    // §3.1 fixed-roof chamber counts for tanks whose roof nobody had declared.
    // `validateTank` now actually reports the missing input.
    tankType: (p.tankType as TankType) || null,
    hasCooling: p.hasCooling !== false,
    hasFoaming: p.hasFoaming !== false,
    foamChambers: 0,
    foamChamberOverride: false,
    adjacentTankIds: [],
    zone: (p.zone as string) || '',
  }
}

function validateTank(t: TankInfo): { valid: boolean; missing: string[] } {
  const missing: string[] = []
  if (!t.diameterM || t.diameterM <= 0) missing.push('قطر')
  if (!t.heightM || t.heightM <= 0) missing.push('ارتفاع')
  if (!t.fuelType) missing.push('نوع ماده')
  if (!t.tankType) missing.push('نوع سقف')
  return { valid: missing.length === 0, missing }
}

// ═══════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════
export default function WorstCasePanel({ elements, zones, project, onApplyDesign, onResetDesign }: WorstCasePanelProps) {
  const [mode, setMode] = useState<Mode>('choose')
  const [scanResult, setScanResult] = useState<ScanResult | null>(null)
  const [scannedTanks, setScannedTanks] = useState<TankInfo[]>([])
  const [scannedBuildings, setScannedBuildings] = useState<DesignElement[]>([])

  // Smart mode state
  const [smartTanks, setSmartTanks] = useState<TankInfo[]>([])
  const [concentratePercent, setConcentratePercent] = useState(3)

  // Manual mode state
  const [mainCaseId, setMainCaseId] = useState<string>('')
  const [adjacentCaseIds, setAdjacentCaseIds] = useState<string[]>([])
  const [selectedScenario, setSelectedScenario] = useState('')
  const [manualBundwallL, setManualBundwallL] = useState('')
  const [manualBundwallW, setManualBundwallW] = useState('')
  const [manualBundwallH, setManualBundwallH] = useState('3')
  const [isBuildingCase, setIsBuildingCase] = useState(false)
  const [buildingFireArea, setBuildingFireArea] = useState('')
  const [buildingHeight, setBuildingHeight] = useState('')

  // UI state
  const [showFormulas, setShowFormulas] = useState(false)
  const [showAuditTrail, setShowAuditTrail] = useState(false)
  const [auditLog, setAuditLog] = useState<string[]>([])
  const [resultConfirmed, setResultConfirmed] = useState(false)

  // ─── Smart Scan ───
  const performScan = useCallback(() => {
    // Reset all previous state
    setSmartTanks([])
    setMainCaseId('')
    setAdjacentCaseIds([])
    setSelectedScenario('')
    setResultConfirmed(false)
    setConcentratePercent(3)
    setIsBuildingCase(false)
    setBuildingFireArea('')
    setBuildingHeight('')

    const scanned = scanMap(elements)
    setScanResult(scanned)
    const tanks = scanned.oilTanks.map(elToTank)
    // No chamber count is pre-filled here. It used to be `calcFoamChamberSizing(D)`
    // — always the §3.1 fixed-roof table — which made every scanned tank look as
    // if its chambers had been designed. The count is now read from the engine
    // once the tank's roof type is known; `foamChambers` means "manual override".
    setScannedTanks(tanks)
    setSmartTanks(tanks.map(t => ({ ...t })))
    setScannedBuildings(scanned.buildings)
    addAudit(`اسکن هوشمند نقشه — ${scanned.oilTanks.length} مخزن، ${scanned.buildings.length} ساختمان`)
    setMode('scanned')
  }, [elements])

  const addAudit = useCallback((msg: string) => {
    setAuditLog(prev => [...prev, `[${new Date().toLocaleTimeString('fa-IR')}] ${msg}`])
  }, [])

  // ─── Smart Validation ───
  const smartValidation = useMemo(() => {
    if (mode !== 'smart_validate') return { allValid: true, tankValidations: [] as { id: string; valid: boolean; missing: string[] }[] }
    const tankValidations = smartTanks.map(t => ({ id: t.id, ...validateTank(t) }))
    const allValid = tankValidations.every(v => v.valid)
    return { allValid, tankValidations }
  }, [mode, smartTanks])

  // ─── Manual Case Options ───
  const manualCaseOptions = useMemo(() => {
    const allCases: { id: string; label: string; isBuilding: boolean }[] = []
    scannedTanks.forEach(t => allCases.push({ id: t.id, label: `${t.number} — ${t.name}`, isBuilding: false }))
    scannedBuildings.forEach(b => allCases.push({ id: b.id, label: b.label || b.type, isBuilding: true }))
    return allCases
  }, [scannedTanks, scannedBuildings])

  const mainCase = manualCaseOptions.find(c => c.id === mainCaseId)
  /** IN-008 of the manually selected tank — `null` until the project declares it. */
  const mainCaseRoofType = scannedTanks.find(c => c.id === mainCaseId)?.tankType ?? null

  // ─── Specification configuration ───
  // The panel reads its foam basis from the specification engine, so the
  // standards/site configuration has to travel into every run.
  const specCfg = useMemo(
    () => specConfigFromProject(project, elements, []),
    [project, elements],
  )

  /**
   * Roof-aware outlet count for one tank, read from the engine.
   *
   * `null` when the roof type is not on record — the panel then shows a dash
   * rather than a §3.1 count for a tank nobody has described.
   */
  const outletCountFor = useCallback(
    (t: TankInfo): number | null => runSpecEngine(specTankFrom(t), specCfg).foam?.outletCount ?? null,
    [specCfg],
  )

  // ─── Run Smart Calculation ───
  const smartResult = useMemo(() => {
    if (mode !== 'result') return null
    const mainTank = smartTanks[0] || scannedTanks[0]
    if (!mainTank) return null
    return calculateWorstCase(mainTank, smartTanks.filter(t => t.id !== mainTank.id), concentratePercent, true, specCfg)
  }, [mode, smartTanks, scannedTanks, concentratePercent, specCfg])

  // ─── Run Manual Calculation ───
  const manualResult = useMemo(() => {
    if (mode !== 'result' || !mainCaseId || !selectedScenario) return null
    if (isBuildingCase) {
      return calculateBuildingWorstCase(mainCaseId, mainCase?.label || '', parseFloat(buildingFireArea) || 500, parseFloat(buildingHeight) || 10, concentratePercent)
    }
    const mainTank = scannedTanks.find(t => t.id === mainCaseId)
    if (!mainTank) return null
    const adjTanks = scannedTanks.filter(t => adjacentCaseIds.includes(t.id))
    return calculateWorstCase(mainTank, adjTanks, concentratePercent, false, specCfg)
  }, [mode, mainCaseId, selectedScenario, adjacentCaseIds, scannedTanks, concentratePercent, isBuildingCase, buildingFireArea, buildingHeight, mainCase, specCfg])

  const activeResult = smartResult || manualResult

  // ─── Actions ───
  const handleSmartValidate = () => {
    addAudit('حالت هوشمند انتخاب شد — در حال اعتبارسنجی')
    setMode('smart_validate')
  }

  const handleManualSelect = () => {
    addAudit('حالت دستی انتخاب شد')
    setMode('manual_select')
  }

  const handleRunCalculation = () => {
    addAudit('محاسبات ورست‌کیس اجرا شد')
    setResultConfirmed(false)
    setMode('result')
  }

  const handleConfirmResult = () => {
    if (!activeResult) return
    setResultConfirmed(true)
    addAudit('ورست‌کیس تأیید شد')
    onApplyDesign?.(activeResult)
  }

  const handleReset = () => {
    setMode('choose')
    setScanResult(null)
    setScannedTanks([])
    setSmartTanks([])
    setMainCaseId('')
    setAdjacentCaseIds([])
    setSelectedScenario('')
    setResultConfirmed(false)
    onResetDesign?.()
    addAudit('ورست‌کیس ریست شد')
  }

  const handleBack = () => {
    setMode('choose')
    addAudit('برگشت به مرحله انتخاب')
  }

  const handleExport = () => {
    if (!activeResult) return
    const r = activeResult
    const lines = [
      '═══════════════════════════════════════════',
      '  WORST CASE REPORT — ATLAS Fire Protection',
      '═══════════════════════════════════════════',
      `Project: ${project?.name || 'N/A'}`,
      `Date: ${new Date().toLocaleDateString('fa-IR')}`,
      `Scenario: ${r.scenario || 'N/A'}`,
      '',
      '─── TANK INFO ───',
      `Name: ${r.tankName}`, `Number: ${r.tankNumber}`,
      `Diameter: ${r.D}m`, `Height: ${r.H}m`, `Liquid Level: ${r.L}m`,
      `Fuel: ${r.fuelName}`, `Roof Type: ${r.roofType}`,
      '',
      '─── FIRE AREA ───',
      `Tank Fire Area: ${r.fireArea} m²`,
      `Total Fire Area: ${r.totalFireArea} m²`,
      '',
      '─── FOAM ───',
      `Application Rate: ${r.appRate} Lpm/m²`,
      `FSDR: ${r.fsdr} Lpm`, `Discharge Time: ${r.dischargeTime} min`,
      `Foam Chambers: ${r.foamChambers}`,
      `Primary Concentrate: ${r.primaryFoam} L`,
      `Supplementary: ${r.supplementaryFoam} L`,
      `Total Concentrate: ${r.totalConcentrate} L (${r.concentratePct}%)`,
      `Foam Solution: ${r.foamSolution} L`,
      '',
      '─── COOLING ───',
      `Main Tank: ${r.mainCoolingLpm} Lpm`,
      `Adjacent Tanks: ${r.adjacentCoolingLpm} Lpm`,
      `Total Cooling: ${r.totalCoolingLpm} Lpm`,
      `Cooling Volume (4h): ${r.coolingVolume4h} m³`,
      '',
      '─── MONITORS ───',
      `Required Monitors (900 Lpm): ${r.monitorCount}`,
      '',
      '─── LOSS ───',
      `Flow Before Loss: ${r.flowBeforeLoss} Lpm`,
      `Loss (20%): ${r.lossLpm} Lpm`,
      `Required Final Flow: ${r.requiredFlow} Lpm`,
      '',
      '─── PUMP ───',
      `Required Flow: ${r.requiredFlow} Lpm`,
      `Required Pressure (TDH): ${r.tdhM} m`,
      `Pump Power: ${r.pumpPowerKW} kW`,
      `Jockey Pump: ${r.jockeyFlowLpm} Lpm / ${r.jockeyHeadM} m / ${r.jockeyPowerKW} kW`,
      '',
      '─── WATER STORAGE ───',
      `Firefighting: ${r.fireWaterM3} m³`,
      `Cooling 4h: ${r.coolingWaterM3} m³`,
      `Total Operational: ${r.totalWaterM3} m³`,
      '',
      '─── FOAM STORAGE ───',
      `Concentrate 3%: ${r.concentrate3L} L`,
      `Concentrate 6%: ${r.concentrate6L} L`,
      `Foam Solution: ${r.foamSolution} L`,
      '',
      '─── FORMULAS ───',
      `§3.1 خروجی‌های ثابت (سقف ثابت): FSDR = A × R | ${TABLE_E3_CHAMBERS.map((b) => (b.maxDiameterM === null ? `>×→+1/${TABLE_E3_BEYOND_AREA_STEP_M2}m²` : `D≤${b.maxDiameterM}→${b.value}`)).join(', ')}`,
      `DAM-001 ارتفاع کاسه فوم: H = MAX(${NFPA11.damHeightMm}, H_ثانویه+50, H_سوختگی+50) mm`,
      `§3.9 خطوط شیلنگ مکمل: ${TABLE_E5_HAND_HOSE.map((b) => (b.maxDiameterM === null ? 'D>×' : `D≤${b.maxDiameterM}`) + `→${b.value.count}×${NFPA11.handHoseFlowLpm}`).join(', ')} L/min`,
      `§3.10 نازل خنک‌کاری: N_ring = ⌈H/${NFPA15.rundownMaxSpacingM}⌉ | N_ring_nozzles = ⌈πD/${NFPA15.horizontalSpacingM}⌉ | Q_cool = A × ${NFPA15.waterSprayRateLminM2} Lpm/m²`,
      'NFPA 20: TDH = Static + Friction + Residual',
      'Hazen-Williams: h = 10.67×L×Q^1.852 / (C^1.852×D^4.87)',
    ].filter(Boolean).join('\n')

    const blob = new Blob([lines], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `WorstCase-${r.tankNumber || 'report'}-${Date.now()}.txt`
    a.click()
    URL.revokeObjectURL(url)
    addAudit('خروجی گزارش تولید شد')
  }

  const handlePrint = () => window.print()

  // ─── RENDER ───
  return (
    <div className="w-80 bg-white/60 backdrop-blur-md border-l border-white/50 overflow-y-auto flex-shrink-0">
      <div className="p-4">
        <h3 className="font-bold text-gray-700 mb-1 flex items-center gap-2">
          <AlertTriangle className="w-5 h-5 text-amber-500" />
          ورست‌کیس
        </h3>
        <p className="text-[10px] text-gray-400 mb-3">NFPA 11, 15, 20 — IPS-E-GN-100</p>

        {/* Back button */}
        {mode !== 'choose' && (
          <button onClick={handleBack} className="w-full mb-3 py-1.5 bg-white/50 rounded-xl text-xs text-gray-500 hover:bg-white/70 transition flex items-center justify-center gap-1">
            <RotateCcw className="w-3 h-3" /> برگشت
          </button>
        )}

        {/* ═══ STEP 1: CHOOSE ═══ */}
        {mode === 'choose' && (
          <div className="space-y-3">
            <button onClick={performScan}
              className="w-full p-4 bg-gradient-to-r from-sky-500 to-blue-600 text-white rounded-2xl font-medium shadow-md hover:shadow-lg transition-all flex items-center gap-3">
              <Scan className="w-6 h-6" />
              <div className="text-right">
                <div>اسکن هوشمند نقشه و تجهیزات</div>
                <div className="text-xs opacity-80">بررسی تمام مخازن، ساختمان‌ها، فاصله‌ها و گرید</div>
              </div>
            </button>
          </div>
        )}

        {/* ═══ STEP 2: SCANNED — Equipment List + Choose Mode ═══ */}
        {mode === 'scanned' && (
          <div className="space-y-3">
            <div className="bg-green-50/80 rounded-xl border border-green-200 p-3 flex items-center gap-2">
              <CheckCircle className="w-5 h-5 text-green-500" />
              <span className="text-xs font-bold text-green-700">Smart Scan Completed</span>
            </div>

            {/* Equipment Summary */}
            <div className="bg-sky-50/50 rounded-xl border border-sky-200 p-3">
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-xs font-bold text-sky-700">تجهیزات شناسایی شده</h4>
                <button onClick={performScan}
                  className="flex items-center gap-1 text-[10px] text-sky-500 hover:text-sky-700 transition bg-sky-100 px-2 py-0.5 rounded-lg">
                  <RefreshCw className="w-3 h-3" /> اسکن مجدد
                </button>
              </div>
              <div className="space-y-1 text-xs text-sky-600">
                {scanResult && <>
                  <Row label="مخازن نفتی" value={`${scanResult.oilTanks.length}`} />
                  <Row label="مخزن آب" value={`${scanResult.waterTanks.length}`} />
                  <Row label="پمپ‌ها" value={`${scanResult.pumps.length}`} />
                  <Row label="مانیتورها" value={`${scanResult.monitors.length}`} />
                  <Row label="هایدرانت‌ها" value={`${scanResult.hydrants.length}`} />
                  <Row label="ساختمان‌ها" value={`${scanResult.buildings.length}`} />
                  <Row label="توربین‌ها" value={`${scanResult.turbines.length}`} />
                </>}
              </div>
            </div>

            {/* Tank Details */}
            {scannedTanks.length > 0 && (
              <div className="bg-amber-50/50 rounded-xl border border-amber-200 p-3 max-h-48 overflow-y-auto">
                <h4 className="text-xs font-bold text-amber-700 mb-2">مشخصات مخازن</h4>
                {scannedTanks.map(t => (
                  <div key={t.id} className="bg-white/60 rounded-lg p-2 mb-1.5 text-[10px] border border-amber-100">
                    <div className="font-bold text-amber-800">{t.number} — {t.name}</div>
                    <div className="text-amber-600">⌀{t.diameterM}m × {t.heightM}m | {FUEL_PROPERTIES[t.fuelType].nameFa}</div>
                    <div className="text-amber-500">سقف: {t.tankType === 'cone_roof' ? 'ثابت' : t.tankType === 'floating_external' ? 'شناور خارجی' : t.tankType === 'floating_internal' ? 'شناور داخلی' : 'آلوده'}</div>
                  </div>
                ))}
              </div>
            )}

            {/* Mode Selection */}
            <h4 className="text-xs font-bold text-gray-600 mt-2">روش تعیین سناریو را انتخاب کنید:</h4>
            <button onClick={handleSmartValidate}
              className="w-full p-3 bg-gradient-to-r from-amber-500 to-orange-500 text-white rounded-xl font-medium shadow hover:shadow-md transition-all flex items-center gap-2">
              <Zap className="w-5 h-5" />
              <div className="text-right">
                <div className="text-sm">انتخاب هوشمند سناریوی ورست‌کیس</div>
                <div className="text-xs opacity-80">سیستم خودکار محاسبه میکند</div>
              </div>
            </button>
            <button onClick={handleManualSelect}
              className="w-full p-3 bg-white/60 text-gray-600 rounded-xl font-medium border border-gray-200 hover:bg-white/80 transition-all flex items-center gap-2">
              <PenTool className="w-5 h-5" />
              <div className="text-right">
                <div className="text-sm">انتخاب دستی سناریوی ورست‌کیس</div>
                <div className="text-xs text-gray-400">خودتان کیس و سناریو را انتخاب کنید</div>
              </div>
            </button>
          </div>
        )}

        {/* ═══ STEP 3A: SMART VALIDATE ═══ */}
        {mode === 'smart_validate' && (
          <div className="space-y-3">
            <h4 className="text-xs font-bold text-amber-700">اعتبارسنجی اطلاعات مخازن</h4>
            <p className="text-[10px] text-gray-400">فیلدهای قرمز ناقص هستند — پس از تکمیل سبز میشوند</p>
            {smartTanks.map((tank, idx) => {
              const validation = smartValidation.tankValidations.find(v => v.id === tank.id)
              const isComplete = validation?.valid ?? false
              return (
                <div key={tank.id} className={`rounded-xl border p-3 ${isComplete ? 'bg-green-50/50 border-green-200' : 'bg-red-50/50 border-red-200'}`}>
                  <div className="flex items-center gap-2 mb-2">
                    {isComplete ? <CheckCircle className="w-4 h-4 text-green-500" /> : <XCircle className="w-4 h-4 text-red-400" />}
                    <span className="text-xs font-bold text-gray-700">{tank.number} — {tank.name}</span>
                  </div>
                  <div className="space-y-1.5">
                    <SmartField label="نام" value={tank.name} onChange={v => updateSmartTank(idx, 'name', v)} />
                    <SmartField label="قطر (m)" value={String(tank.diameterM)} type="number" onChange={v => updateSmartTank(idx, 'diameterM', parseFloat(v) || 0)} missing={validation?.missing.includes('قطر')} />
                    <SmartField label="ارتفاع (m)" value={String(tank.heightM)} type="number" onChange={v => updateSmartTank(idx, 'heightM', parseFloat(v) || 0)} missing={validation?.missing.includes('ارتفاع')} />
                    <div>
                      <label className="text-[10px] text-gray-400">نوع سقف</label>
                      <select value={tank.tankType ?? ''} onChange={e => updateSmartTank(idx, 'tankType', e.target.value)}
                        className={`w-full px-2 py-1 rounded-lg border text-xs ${validation?.missing.includes('نوع سقف') ? 'border-red-400 bg-red-50' : 'border-green-300 bg-green-50'}`}>
                        <option value="" disabled>— انتخاب نوع سقف —</option>
                        <option value="cone_roof">سقف ثابت (Cone Roof)</option>
                        <option value="floating_external">شناور خارجی</option>
                        <option value="floating_internal">شناور داخلی</option>
                        <option value="contaminated">مواد آلوده</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-[10px] text-gray-400">نوع ماده</label>
                      <select value={tank.fuelType} onChange={e => updateSmartTank(idx, 'fuelType', e.target.value)}
                        className={`w-full px-2 py-1 rounded-lg border text-xs ${validation?.missing.includes('نوع ماده') ? 'border-red-400 bg-red-50' : 'border-green-300 bg-green-50'}`}>
                        {HYDROCARBON_LIST.map(f => <option key={f.key} value={f.key}>{f.label}</option>)}
                      </select>
                    </div>
                    <div className="flex gap-2 mt-1">
                      <label className="flex items-center gap-1.5 text-[10px] text-gray-500">
                        <input type="checkbox" checked={tank.hasCooling} onChange={e => updateSmartTank(idx, 'hasCooling', e.target.checked)} className="rounded" />
                        خنک‌کاری
                      </label>
                      <label className="flex items-center gap-1.5 text-[10px] text-gray-500">
                        <input type="checkbox" checked={tank.hasFoaming} onChange={e => updateSmartTank(idx, 'hasFoaming', e.target.checked)} className="rounded" />
                        فومینگ
                      </label>
                    </div>
                    <div className="text-[10px] text-gray-500">
                      فوم چمبر: <span className="font-bold">
                        {tank.foamChamberOverride
                          ? tank.foamChambers
                          : (outletCountFor(tank) ?? '— (نوع سقف ثبت نشده)')}
                      </span>
                      {tank.foamChamberOverride && <span className="text-amber-500 mr-1">(Manual Override)</span>}
                    </div>
                  </div>
                </div>
              )
            })}

            {/* Concentrate % */}
            <div>
              <label className="text-xs text-gray-500 mb-1 block">درصد کنسانتره</label>
              <div className="flex gap-1">
                {[3, 6, 1].map(pct => (
                  <button key={pct} onClick={() => setConcentratePercent(pct)}
                    className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition ${concentratePercent === pct ? 'bg-amber-500 text-white' : 'bg-white/50 text-gray-500 hover:bg-white/70'}`}>
                    {pct}%
                  </button>
                ))}
              </div>
            </div>

            {/* Smart Action Button */}
            <button onClick={handleRunCalculation} disabled={!smartValidation.allValid}
              className={`w-full py-2.5 rounded-xl text-sm font-medium shadow transition-all flex items-center justify-center gap-2 ${
                smartValidation.allValid
                  ? 'bg-gradient-to-r from-amber-500 to-orange-500 text-white hover:shadow-md'
                  : 'bg-gray-200 text-gray-400 cursor-not-allowed'
              }`}>
              <Play className="w-4 h-4" /> اقدام هوشمند
            </button>
            {!smartValidation.allValid && (
              <p className="text-[10px] text-red-400 text-center">لطفاً اطلاعات ناقص را تکمیل کنید</p>
            )}
          </div>
        )}

        {/* ═══ STEP 3B: MANUAL SELECT ═══ */}
        {mode === 'manual_select' && (
          <div className="space-y-3">
            <h4 className="text-xs font-bold text-gray-700">انتخاب کیس اصلی</h4>
            <select value={mainCaseId} onChange={e => {
              const val = e.target.value
              setMainCaseId(val)
              const isBldg = scannedBuildings.some(b => b.id === val)
              setIsBuildingCase(isBldg)
              setSelectedScenario('')
              setAdjacentCaseIds([])
            }}
              className="w-full px-3 py-2 bg-white/60 rounded-xl border border-gray-200 text-sm">
              <option value="">— انتخاب کنید —</option>
              {manualCaseOptions.map(c => (
                <option key={c.id} value={c.id}>{c.label}</option>
              ))}
            </select>

            {/* Adjacent Cases */}
            {mainCaseId && !isBuildingCase && (
              <>
                <h4 className="text-xs font-bold text-gray-700 mt-2">کیس‌های همجوار (خنک‌کاری)</h4>
                <div className="space-y-1 max-h-32 overflow-y-auto">
                  {manualCaseOptions.filter(c => c.id !== mainCaseId).map(c => (
                    <label key={c.id} className="flex items-center gap-2 text-xs text-gray-600 bg-white/40 rounded-lg p-1.5">
                      <input type="checkbox" checked={adjacentCaseIds.includes(c.id)}
                        onChange={e => setAdjacentCaseIds(prev => e.target.checked ? [...prev, c.id] : prev.filter(id => id !== c.id))}
                        className="rounded" />
                      {c.label}
                    </label>
                  ))}
                </div>
              </>
            )}

            {/* Scenario Selection */}
            {mainCaseId && (
              <div className="mt-2">
                <h4 className="text-xs font-bold text-gray-700 mb-1">انتخاب سناریو</h4>
                {isBuildingCase ? (
                  <div className="space-y-2">
                    <SmartField label="مساحت حریق (m²)" value={buildingFireArea} type="number" onChange={setBuildingFireArea} />
                    <SmartField label="ارتفاع ساختمان (m)" value={buildingHeight} type="number" onChange={setBuildingHeight} />
                    <button onClick={() => { setSelectedScenario('building_fire'); handleRunCalculation() }}
                      className="w-full py-2 bg-gradient-to-r from-amber-500 to-orange-500 text-white rounded-xl text-xs font-medium shadow hover:shadow-md transition-all">
                      تهیه خروجی ورست‌کیس
                    </button>
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    {mainCaseRoofType === null ? (
                      <p className="text-[10px] text-red-500 p-2 rounded-lg bg-red-50 border border-red-200">
                        نوع سقف این مخزن ثبت نشده است. تا انتخاب آن از «مشخصات تجهیزات»، سناریوی حریق و ابعاد فومینگ تعیین نمی‌شود.
                      </p>
                    ) : (
                      (TANK_SCENARIOS[mainCaseRoofType] ?? []).map(s => (
                      <button key={s.key} onClick={() => { setSelectedScenario(s.key); handleRunCalculation() }}
                        className={`w-full p-2 rounded-xl text-xs text-right transition-all border ${
                          selectedScenario === s.key
                            ? 'bg-amber-100 border-amber-300 text-amber-700 font-bold'
                            : 'bg-white/40 border-gray-200 text-gray-600 hover:bg-amber-50'
                        }`}>
                        {s.label}
                      </button>
                      ))
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ═══ STEP 4: RESULT ═══ */}
        {mode === 'result' && activeResult && (
          <div className="space-y-2">
            {/* Summary Banner */}
            <div className={`rounded-xl border p-3 ${resultConfirmed ? 'bg-green-50/80 border-green-200' : 'bg-amber-50/80 border-amber-200'}`}>
              <div className="flex items-center gap-2">
                {resultConfirmed ? <CheckCircle className="w-5 h-5 text-green-500" /> : <AlertTriangle className="w-5 h-5 text-amber-500" />}
                <div>
                  <span className="text-xs font-bold">{resultConfirmed ? 'ورست‌کیس تأیید شده' : 'گزارش ورست‌کیس'}</span>
                  <div className="text-[10px] text-gray-500">{activeResult.scenario}</div>
                </div>
              </div>
            </div>

            {/* Tank Info — only for tanks */}
            {!activeResult.isBuilding && (
            <ResSection title="اطلاعات مخزن" color="amber">
              <Row label="نام" value={activeResult.tankName} />
              <Row label="شماره" value={activeResult.tankNumber} />
              {activeResult.D > 0 && <Row label="قطر" value={`${activeResult.D} m`} />}
              <Row label="ارتفاع" value={`${activeResult.H} m`} />
              <Row label="فرآورده" value={activeResult.fuelName} />
              {activeResult.flashpointC > 0 && <Row label="نقطه اشتعال" value={`${activeResult.flashpointC}°C`} />}
              <Row label="نوع سقف" value={activeResult.roofType} />
            </ResSection>
            )}

            {/* Building Info — only for buildings */}
            {activeResult.isBuilding && (
            <ResSection title="اطلاعات ساختمان" color="amber">
              <Row label="نام" value={activeResult.tankName} />
              <Row label="ارتفاع" value={`${activeResult.H} m`} />
              <Row label="مساحت حریق" value={`${activeResult.fireArea} m²`} />
            </ResSection>
            )}

            {/* Fire Area */}
            <ResSection title="مساحت حریق" color="red">
              <Row label="سطح حریق مخزن" value={`${activeResult.fireArea} m²`} formula="π × r²" />
              <Row label="مجموع سطوح" value={`${activeResult.totalFireArea} m²`} bold />
            </ResSection>

            {/* Foam — the engine withholds the whole basis until IN-008 is declared */}
            {!activeResult.isBuilding && activeResult.foamBlocked && (
            <ResSection title="فوم — NFPA 11" color="amber">
              <div className="p-2.5 rounded-xl bg-red-50 border border-red-200 text-[11px] text-red-700 leading-relaxed">
                <div className="font-bold mb-1 flex items-center gap-1">
                  <AlertTriangle className="w-3.5 h-3.5" /> ورودی لازم — نوع سقف مخزن (IN-008)
                </div>
                <div>{activeResult.foamBlockedReason}</div>
                <div className="mt-1 text-red-600">
                  نرخ پاشش، مساحت حفاظت‌شده، تعداد فوم چمبر و در نتیجه دبی پمپ همه به نوع سقف وابسته‌اند
                  (§3.1/§3.3/§3.4/§3.5). بدون آن هیچ عددی ارائه نمی‌شود.
                </div>
                <div className="mt-1 text-red-600">
                  مسیر: مشخصات تجهیزات مخزن ← «نوع سقف».
                </div>
              </div>
              <Row label="خطوط شیلنگ دستی" value={`${activeResult.handHoseCount} خط / ${activeResult.handHoseTimeMin} دقیقه`} formula={activeResult.handHoseRef} />
            </ResSection>
            )}

            {/* Foam — only when the engine produced a basis */}
            {!activeResult.isBuilding && !activeResult.foamBlocked && activeResult.foamChambers > 0 && (
            <ResSection title="فوم — NFPA 11" color="amber">
              <Row label="شدت پاشش" value={`${activeResult.appRate} Lpm/m²`} />
              <Row label="FSDR" value={`${activeResult.fsdr} Lpm`} formula="Area × Rate" />
              <Row label="زمان پاشش" value={`${activeResult.dischargeTime} min`} />
              <Row label="فوم چمبر" value={`${activeResult.foamChambers} عدد`} formula={activeResult.chamberRef} />
              <Row label="خطوط شیلنگ دستی (فوم خارجی)" value={`${activeResult.handHoseCount} خط / ${activeResult.handHoseTimeMin} دقیقه`} formula={activeResult.handHoseRef} />
              <Row label="دبی فوم خارجی" value={`${activeResult.handHoseFlowLpm} Lpm`} />
              <Row label="کنسانتره اولیه" value={`${activeResult.primaryFoam} L`} />
              <Row label="کنسانتره تکمیلی" value={`${activeResult.supplementaryFoam} L`} />
              <Row label="کل کنسانتره" value={`${activeResult.totalConcentrate} L (${activeResult.concentratePct}%)`} bold />
              <Row label="محلول فوم" value={`${activeResult.foamSolution} L`} />
            </ResSection>
            )}

            {/* Cooling — only for tanks with cooling */}
            {!activeResult.isBuilding && activeResult.totalCoolingLpm > 0 && (
            <ResSection title="خنک‌کاری — NFPA 15" color="blue">
              <Row label="خنک‌کاری مخزن اصلی" value={`${activeResult.mainCoolingLpm} Lpm`} formula="π×D×H × 2.0" />
              {activeResult.adjacentCoolingLpm > 0 && <Row label="خنک‌کاری مخازن همجوار" value={`${activeResult.adjacentCoolingLpm} Lpm`} />}
              <Row label="تعداد آبپاش کولینگ" value={`${activeResult.coolingNozzleTotal} نازل`} formula="⌈πD/S⌉ × ⌈H/V⌉   (S=2.4m, V=3m)" />
              <Row label="نازل در هر رینگ" value={`${activeResult.coolingNozzlePerRing} عدد (${activeResult.coolingNozzleRings} رینگ)`} />
              <Row label="کل خنک‌کاری" value={`${activeResult.totalCoolingLpm} Lpm`} bold />
              <Row label="حجم آب (۴ ساعته)" value={`${activeResult.coolingVolume4h} m³`} />
            </ResSection>
            )}

            {/* Monitors */}
            <ResSection title="مانیتور و تجهیزات" color="cyan">
              <Row label="مانیتور ۹۰۰ Lpm" value={`${activeResult.monitorCount} عدد`} />
            </ResSection>

            {/* Loss */}
            <ResSection title="هدررفت (Loss)" color="gray">
              <Row label="دبی قبل از هدررفت" value={`${activeResult.flowBeforeLoss} Lpm`} />
              <Row label="هدررفت (۲۰٪)" value={`${activeResult.lossLpm} Lpm`} />
              <Row label="دبی نهایی مورد نیاز" value={`${activeResult.requiredFlow} Lpm`} bold />
            </ResSection>

            {/* Pump */}
            <ResSection title="پمپ آتش‌نشانی — NFPA 20" color="sky">
              <Row label="دبی مورد نیاز" value={`${activeResult.requiredFlow} Lpm`} />
              <Row label="فشار کل (TDH)" value={`${activeResult.tdhM} m`} formula="Static + Friction + Residual" />
              <Row label="توان پمپ" value={`${activeResult.pumpPowerKW} kW`} />
              <Row label="نوع پمپ" value={activeResult.pumpType} />
            </ResSection>

            {/* Jockey Pump */}
            <ResSection title="جوکی پمپ" color="sky">
              <Row label="دبی" value={`${activeResult.jockeyFlowLpm} Lpm`} />
              <Row label="فشار" value={`${activeResult.jockeyHeadM} m`} />
              <Row label="توان" value={`${activeResult.jockeyPowerKW} kW`} />
            </ResSection>

            {/* Water Storage */}
            <ResSection title="مخزن ذخیره آب" color="emerald">
              <Row label="آب اطفا" value={`${activeResult.fireWaterM3} m³`} />
              <Row label="آب خنک‌کاری (۴ ساعته)" value={`${activeResult.coolingWaterM3} m³`} />
              <Row label="کل آب عملیاتی" value={`${activeResult.totalWaterM3} m³`} bold />
            </ResSection>

            {/* Foam Storage — only for tanks */}
            {!activeResult.isBuilding && activeResult.totalConcentrate > 0 && (
            <ResSection title="ذخیره فوم" color="amber">
              <Row label="کنسانتره ۳٪" value={`${activeResult.concentrate3L} L`} />
              <Row label="کنسانتره ۶٪" value={`${activeResult.concentrate6L} L`} />
              <Row label="محلول فوم" value={`${activeResult.foamSolution} L`} />
            </ResSection>
            )}

            {/* Formulas */}
            <button onClick={() => setShowFormulas(!showFormulas)}
              className="w-full flex items-center justify-center gap-1 text-xs text-gray-400 hover:text-gray-600 transition">
              {showFormulas ? 'بستن فرمول‌ها' : 'نمایش فرمول‌ها'}
              {showFormulas ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            </button>
            {showFormulas && (
              <div className="p-3 bg-gray-50/50 rounded-xl border border-gray-200 text-[10px] text-gray-500 space-y-2">
                <div><strong>NFPA 11:</strong> FSDR = A × R | V = FSDR × t</div>
                <div><strong>§3.10:</strong> Q = A × {NFPA15.waterSprayRateLminM2} Lpm/m² | V = Q × 240 min</div>
                <div><strong>§4 HYD/PUMP:</strong> TDH = Hs + Hf + Hp | P = (Q/60000 × TDH × ρ × g) / (1000 × η)</div>
                <div><strong>Hazen-Williams:</strong> h = 10.67 × L × Q^1.852 / (C^1.852 × D^4.87)</div>
                <div><strong>Bundwall:</strong> MAX(110% بزرگترین, 25% مجموع)</div>
              </div>
            )}

            {/* Audit Trail */}
            <button onClick={() => setShowAuditTrail(!showAuditTrail)}
              className="w-full flex items-center justify-center gap-1 text-xs text-gray-400 hover:text-gray-600 transition">
              <Edit3 className="w-3 h-3" /> رد تغییرات ({auditLog.length})
            </button>
            {showAuditTrail && (
              <div className="p-3 bg-gray-50/50 rounded-xl border border-gray-200 text-[10px] text-gray-500 space-y-1 max-h-32 overflow-y-auto">
                {auditLog.map((log, i) => <div key={i}>{log}</div>)}
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex gap-2 mt-3">
              {!resultConfirmed ? (
                <>
                  <button onClick={handleConfirmResult}
                    className="flex-1 py-2.5 bg-gradient-to-r from-green-500 to-emerald-500 text-white rounded-xl text-xs font-medium shadow hover:shadow-md transition-all flex items-center justify-center gap-1">
                    <CheckCircle className="w-3 h-3" /> تأیید و اعمال
                  </button>
                  <button onClick={handleBack}
                    className="flex-1 py-2.5 bg-white/50 text-gray-600 rounded-xl text-xs font-medium border border-gray-200 hover:bg-white/70 transition-all flex items-center justify-center gap-1">
                    <Edit3 className="w-3 h-3" /> اصلاح
                  </button>
                </>
              ) : (
                <button onClick={handleReset}
                  className="flex-1 py-2.5 bg-white/50 text-gray-600 rounded-xl text-xs font-medium border border-gray-200 hover:bg-white/70 transition-all flex items-center justify-center gap-1">
                  <Trash2 className="w-3 h-3" /> حذف و بازنشانی
                </button>
              )}
            </div>

            <div className="flex gap-2">
              <button onClick={handlePrint}
                className="flex-1 py-2 bg-white/50 rounded-xl text-xs text-gray-600 border border-gray-200 hover:bg-white/70 transition flex items-center justify-center gap-1">
                <Printer className="w-3 h-3" /> پرینت
              </button>
              <button onClick={handleExport}
                className="flex-1 py-2 bg-white/50 rounded-xl text-xs text-gray-600 border border-gray-200 hover:bg-white/70 transition flex items-center justify-center gap-1">
                <Download className="w-3 h-3" /> خروجی
              </button>
            </div>

            {/* Regenerate */}
            <button onClick={() => { setResultConfirmed(false); setMode(mainCaseId ? 'manual_select' : 'smart_validate') }}
              className="w-full py-2 bg-white/50 rounded-xl text-xs text-gray-500 hover:bg-white/70 transition flex items-center justify-center gap-1">
              <RefreshCw className="w-3 h-3" /> تولید مجدد
            </button>
          </div>
        )}
      </div>
    </div>
  )

  // ─── Smart Tank Updater ───
  function updateSmartTank(idx: number, field: string, value: any) {
    setSmartTanks(prev => {
      const next = [...prev]
      // The chamber count is no longer cached on the tank: it is read from the
      // engine on render, so it always matches the tank's current roof type.
      next[idx] = { ...next[idx], [field]: value }
      return next
    })
  }
}

// ─── Calc Function ───

/**
 * The §2 inputs this panel can state about a tank.
 *
 * `roofKind` is `null` when the project has not declared one; the engine then
 * refuses to pick a design basis instead of assuming a fixed roof.
 */
function specTankFrom(t: TankInfo, concentratePct?: number): SpecTank {
  return {
    id: t.id,
    label: t.name,
    diameterM: t.diameterM,
    shellHeightM: t.heightM,
    liquidLevelM: t.heightM * 0.85,
    fuelKey: t.fuelType,
    roofKind: roofKindFromTankType(t.tankType),
    coolingHeightM: t.heightM,
    ...(concentratePct !== undefined ? { foamConcentration: concentratePct / 100 } : {}),
  }
}

function calculateWorstCase(
  mainTank: TankInfo,
  adjacentTanks: TankInfo[],
  concentratePct: number,
  isSmart: boolean,
  config: SpecConfig,
) {
  const D = mainTank.diameterM
  const H = mainTank.heightM
  const fuel = FUEL_PROPERTIES[mainTank.fuelType]
  const roofKind = roofKindFromTankType(mainTank.tankType)
  const scenarioLabel = roofKind === 'external_floating'
    ? 'غرق شدن سقف شناور خارجی'
    : roofKind === 'internal_floating'
      ? 'آتش ریم‌سیل شناور داخلی'
      : roofKind === 'ord'
        ? 'نشت مواد آلوده'
        : roofKind === 'fixed'
          ? 'آتش سقف ثابت'
          : 'نوع سقف ثبت نشده'

  // ── the foam basis comes from the specification engine ───────────
  //
  // This panel used to form its own basis: the plan area, the cone-roof rate
  // and the §3.1 chamber table — for every roof kind, and for a tank with no
  // roof declared at all. A floating-roof tank was therefore designed as a
  // fixed-roof tank, which over-states the protected area and under-states the
  // seal rate. One engine call replaces the lot, and it returns `null` rather
  // than a number when the roof is not on record.
  const specRun = runSpecEngine(specTankFrom(mainTank, concentratePct), config)
  const foam = specRun.foam
  const foamBlocked = foam === null

  const surfaceArea = foam?.areaM2 ?? 0
  const applicationRate = foam?.rateLminM2 ?? 0
  const dischargeTime = foam?.timeMin ?? 0
  const fsdr = foam?.qSolutionLpm ?? 0
  const foamChambers = mainTank.foamChamberOverride ? mainTank.foamChambers : (foam?.outletCount ?? 0)
  const handHose = calcHandHoseSizing(D)
  const primaryFoam = calcFoamConcentrateQuantity(fsdr, dischargeTime, concentratePct)
  const supplementaryFoam = calcSupplementaryFoamQuantity(handHose.count, handHose.dischargeTimeMin, concentratePct)
  const totalConcentrate = primaryFoam + supplementaryFoam
  const dilution = concentratePct === 1 ? 100 : concentratePct === 3 ? 33.33 : 16.67
  const foamSolution = totalConcentrate * dilution

  const mainCooling = mainTank.hasCooling
    ? calcCoolingWaterRate(D, H, roofKindFromTankType(mainTank.tankType))
    : { wettedAreaM2: 0, coolingRateLpmM2: NFPA15.waterSprayRateLminM2, totalFlowLpm: 0 }
  const nozzles = calcCoolingNozzleCount(D, H)
  const adjCooling = adjacentTanks.reduce((sum, t) => sum + calcAdjacentTankCooling(t.diameterM, t.heightM), 0)
  const totalCooling = mainCooling.totalFlowLpm + adjCooling
  const coolingVolume4h = Math.round(totalCooling * 240 / 1000)

  const monitorCount = Math.ceil(fsdr / 900)
  const flowBeforeLoss = fsdr + totalCooling
  const lossLpm = Math.round(flowBeforeLoss * 0.20)
  const requiredFlow = Math.round(flowBeforeLoss + lossLpm)

  const tdhM = Math.round(calcTotalDynamicHead(5, 15, 70))
  const pumpPowerKW = Math.round(calcPumpPower(requiredFlow, tdhM) * 1.1)
  const jockey = calcJockeyPumpSpec(requiredFlow, tdhM)
  const pumpType = requiredFlow > 5000 ? 'axonial' : 'radial'

  const fireWaterM3 = Math.round(requiredFlow * dischargeTime / 1000)
  const totalWaterM3 = Math.round((fireWaterM3 + coolingVolume4h) * 1.1)

  const concentrate3L = Math.round(totalConcentrate)
  const concentrate6L = Math.round(totalConcentrate * 0.5)

  return {
    scenario: scenarioLabel,
    tankName: mainTank.name, tankNumber: mainTank.number,
    D, H, L: 0, fuelName: fuel.nameFa, flashpointC: fuel.flashpointC,
    roofType: roofKind === 'fixed' ? 'سقف ثابت'
      : roofKind === 'external_floating' ? 'شناور خارجی'
        : roofKind === 'internal_floating' ? 'شناور داخلی'
          : roofKind === 'ord' ? 'آلوده / حوضچه'
            : 'نامشخص — ثبت نشده',
    fireArea: Math.round(surfaceArea), bundwallArea: 0, totalFireArea: Math.round(surfaceArea),
    appRate: applicationRate, fsdr: Math.round(fsdr), dischargeTime,
    foamChambers, chamberRule: specRun.scenario.rateTimeSource,
    chamberRef: foamBlocked
      ? 'IN-008 — ورودی لازم'
      : String(specRun.byId['OUT-002'].referenceIds.join(', ') || '§3.1'),
    foamBlocked,
    foamBlockedReason: foamBlocked
      ? String(specRun.byId['OUT-002'].note ?? 'نوع سقف ثبت نشده است')
      : '',
    handHoseRef: handHose.provenance.reference,
    handHoseCount: handHose.count, handHoseTimeMin: handHose.dischargeTimeMin, handHoseFlowLpm: handHose.totalFlowLpm,
    primaryFoam: Math.round(primaryFoam), supplementaryFoam: Math.round(supplementaryFoam),
    totalConcentrate: Math.round(totalConcentrate), concentratePct, foamSolution: Math.round(foamSolution),
    mainCoolingLpm: Math.round(mainCooling.totalFlowLpm), adjacentCoolingLpm: Math.round(adjCooling),
    totalCoolingLpm: Math.round(totalCooling), coolingVolume4h,
    coolingNozzleTotal: nozzles.total, coolingNozzlePerRing: nozzles.perRing, coolingNozzleRings: nozzles.rings,
    monitorCount, flowBeforeLoss: Math.round(flowBeforeLoss), lossLpm, requiredFlow,
    tdhM, pumpPowerKW, pumpType,
    jockeyFlowLpm: jockey.flowLpm, jockeyHeadM: jockey.headM, jockeyPowerKW: jockey.powerKW,
    fireWaterM3, coolingWaterM3: coolingVolume4h, totalWaterM3,
    concentrate3L, concentrate6L,
    isBuilding: false,
    bundwallRequired: 0, bundwallRule1: 0, bundwallRule2: 0, bundwallRule: '',
  }
}

function calculateBuildingWorstCase(
  buildingId: string, buildingLabel: string, fireAreaM2: number, heightM: number, concentratePct: number,
) {
  const fsdr = fireAreaM2 * 6.5
  const monitorCount = Math.ceil(fsdr / 900)
  const flowBeforeLoss = fsdr
  const lossLpm = Math.round(flowBeforeLoss * 0.20)
  const requiredFlow = Math.round(flowBeforeLoss + lossLpm)
  const tdhM = Math.round(calcTotalDynamicHead(5, 15, 70))
  const pumpPowerKW = Math.round(calcPumpPower(requiredFlow, tdhM) * 1.1)
  const jockey = calcJockeyPumpSpec(requiredFlow, tdhM)
  const fireWaterM3 = Math.round(requiredFlow * 60 / 1000)
  const totalWaterM3 = Math.round(fireWaterM3 * 1.1)
  const concentrate3L = Math.round(fsdr * 60 * concentratePct / 100)
  const concentrate6L = Math.round(concentrate3L * 0.5)
  const foamSolution = concentrate3L * 33.33

  return {
    scenario: `آتش ساختمان — ${buildingLabel}`,
    tankName: buildingLabel, tankNumber: buildingId,
    D: 0, H: heightM, L: 0, fuelName: 'ساختمان', flashpointC: 0, roofType: 'ساختمان',
    fireArea: Math.round(fireAreaM2), bundwallArea: 0, totalFireArea: Math.round(fireAreaM2),
    appRate: 6.5, fsdr: Math.round(fsdr), dischargeTime: 60,
    foamChambers: 0, chamberRule: '', chamberRef: '',
    foamBlocked: false, foamBlockedReason: '',
    handHoseRef: '',
    handHoseCount: 0, handHoseTimeMin: 0, handHoseFlowLpm: 0,
    primaryFoam: 0, supplementaryFoam: 0,
    totalConcentrate: Math.round(concentrate3L), concentratePct, foamSolution: Math.round(foamSolution),
    mainCoolingLpm: 0, adjacentCoolingLpm: 0, totalCoolingLpm: 0, coolingVolume4h: 0,
    coolingNozzleTotal: 0, coolingNozzlePerRing: 0, coolingNozzleRings: 0,
    monitorCount, flowBeforeLoss: Math.round(flowBeforeLoss), lossLpm, requiredFlow,
    tdhM, pumpPowerKW, pumpType: 'radial',
    jockeyFlowLpm: jockey.flowLpm, jockeyHeadM: jockey.headM, jockeyPowerKW: jockey.powerKW,
    fireWaterM3, coolingWaterM3: 0, totalWaterM3,
    concentrate3L: Math.round(concentrate3L), concentrate6L: Math.round(concentrate6L),
    isBuilding: true,
    bundwallRequired: 0, bundwallRule1: 0, bundwallRule2: 0, bundwallRule: '',
  }
}

// ─── Small Components ───
function Row({ label, value, formula, bold }: { label: string; value: string; formula?: string; bold?: boolean }) {
  return (
    <div className={`flex justify-between items-center text-xs ${bold ? 'font-bold' : ''}`}>
      <span className="text-gray-500">{label}</span>
      <div className="text-left">
        <span className={`font-medium ${bold ? 'text-gray-800' : 'text-gray-700'}`}>{value}</span>
      </div>
    </div>
  )
}

function SmartField({ label, value, type, onChange, missing }: { label: string; value: string; type?: string; onChange: (v: string) => void; missing?: boolean }) {
  return (
    <div>
      <label className="text-[10px] text-gray-400">{label}</label>
      <input type={type || 'text'} value={value} onChange={e => onChange(e.target.value)}
        className={`w-full px-2 py-1 rounded-lg border text-xs ${missing ? 'border-red-400 bg-red-50 text-red-600' : 'border-green-300 bg-green-50'}`} />
    </div>
  )
}

function ResSection({ title, color, children }: { title: string; color: string; children: React.ReactNode }) {
  const cm: Record<string, string> = {
    amber: 'bg-amber-50/50 border-amber-200 text-amber-600',
    blue: 'bg-blue-50/50 border-blue-200 text-blue-600',
    sky: 'bg-sky-50/50 border-sky-200 text-sky-600',
    cyan: 'bg-cyan-50/50 border-cyan-200 text-cyan-600',
    emerald: 'bg-emerald-50/50 border-emerald-200 text-emerald-600',
    gray: 'bg-gray-50/50 border-gray-200 text-gray-600',
    red: 'bg-red-50/50 border-red-200 text-red-600',
  }
  return (
    <div className={`rounded-xl border p-3 ${cm[color] || cm.amber}`}>
      <h4 className="text-xs font-bold mb-2">{title}</h4>
      <div className="space-y-1">{children}</div>
    </div>
  )
}

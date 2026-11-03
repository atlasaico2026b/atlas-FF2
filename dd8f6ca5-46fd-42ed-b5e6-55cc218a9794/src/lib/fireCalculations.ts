// SPDX-License-Identifier: Apache-2.0
// ═══════════════════════════════════════════════════════════════════
// ATLAS FIRE ENGINEERING — COMPATIBILITY FACADE
//
// This file used to BE the calculation engine: every formula lived here, with
// its unit convention described only in a comment and its provenance nowhere.
//
// All calculating now happens in `src/lib/calc/`, which is unit-aware, carries a
// design basis and reports verification status. This module keeps the old
// function names and signatures so the components that call them did not have to
// be rewritten, and delegates every one of them.
//
// What deliberately did NOT stay the same:
//   • calcPumpPower / calcJockeyPumpSpec — the old expression divided L/min by
//     3600 instead of converting to m³/s, overstating power by 1000/60 ≈ 16.67×.
//     Verified against the SI definition and the US brake-horsepower form, then
//     replaced. See `legacyPumpPowerKW` in calc/nfpa20.ts.
//   • calcCoolingNozzleCount — now generates real ring elevations rather than
//     assuming ceil(H/V) rings; the count is unchanged for every input but the
//     elevations and the spacing check are now available.
//   • Every result that could be read as a standard requirement now carries the
//     source and verification status alongside it.
//
// Reference: NFPA 11, NFPA 15, NFPA 20, IPS-E-GN-100, Hazen-Williams.
// No clause or table in this file is represented as verified — see calc/basis.ts.
// ═══════════════════════════════════════════════════════════════════

import {
  annularRingAreaM2,
  cylinderVolumeM3,
  generateRingElevations,
  nozzlesPerRing,
  planAreaM2,
} from './calc/geometry'

import { coolingAreaM2, shellCoolingAreaM2 } from './coolingArea'

import {
  getActiveBasis,
  basisNumber,
  K,
} from './calc/basis'
import { HYDRAULICS, NFPA11, NFPA15, NFPA20 } from './calc/constants'
import { CalcInputError, convert, U } from './calc/units'
import { ENGINE_CONVENTIONS } from './spec/engine'
import {
  PIPE_SIZES,
  hazenWilliamsHeadLossFromLpm,
  recommendPipeSize as engineRecommendPipeSize,
  velocityMs,
} from './calc/hydraulics'
import { hydraulicPowerKW, shaftPowerKW, PUMP_ACCEPTANCE_LIMITS, headPressurePa, pressureHeadM } from './calc/nfpa20'
import { foamChamberLookup, handHoseLookup, dischargeDeviceCount } from './calc/nfpa11'
import { requiredBundwallVolume } from './calc/bundwall'
import type { DesignBasis, VerificationStatus } from './calc/provenance'
import { runSpecEngine, FIXED_ROOF_OPEN_BAND_FROM_M, type RoofKind } from './spec/engine'
import { defaultSpecConfig, roofKindFromTankType } from './specProject'

// ─── Hydrocarbon Fuel Types ───
export type HydrocarbonType =
  | 'benzin'           // بنزین (Gasoline) — FP < 38°C
  | 'benzin_super'     // بنزین سوپر
  | 'nafte_gaz'        // نفت گاز (Diesel/Fuel Oil No.2)
  | 'nafte_safid'      // نفت سفید (Kerosene) — FP 38-93°C
  | 'nafta'            // نفتا (Naphtha)
  | 'naft_kham'        // نفت خام سبک (Light Crude)
  | 'naft_kham_torsh'  // نفت خام ترش (Sour Crude)
  | 'naft_kham_sangin' // نفت خام سنگین (Heavy Crude)
  | 'naft_koreh'       // نفت کوره (Fuel Oil No.4-6)
  | 'aloodeh'          // مواد آلوده (Contaminated)

export interface FuelProperties {
  name: string
  nameFa: string
  flashpointC: number
  flashpointCategory: 'below_38' | '38_to_93' | 'above_93'
  waterSoluble: boolean
}

export const FUEL_PROPERTIES: Record<HydrocarbonType, FuelProperties> = {
  benzin:           { name: 'Gasoline', nameFa: 'بنزین', flashpointC: -43, flashpointCategory: 'below_38', waterSoluble: false },
  benzin_super:     { name: 'Super Gasoline', nameFa: 'بنزین سوپر', flashpointC: -40, flashpointCategory: 'below_38', waterSoluble: false },
  nafte_gaz:        { name: 'Diesel / Fuel Oil No.2', nameFa: 'نفت گاز', flashpointC: 52, flashpointCategory: '38_to_93', waterSoluble: false },
  nafte_safid:      { name: 'Kerosene', nameFa: 'نفت سفید', flashpointC: 38, flashpointCategory: '38_to_93', waterSoluble: false },
  nafta:            { name: 'Naphtha', nameFa: 'نفتا', flashpointC: -2, flashpointCategory: 'below_38', waterSoluble: false },
  naft_kham:        { name: 'Light Crude Oil', nameFa: 'نفت خام سبک', flashpointC: -20, flashpointCategory: 'below_38', waterSoluble: false },
  naft_kham_torsh:  { name: 'Sour Crude Oil', nameFa: 'نفت خام ترش', flashpointC: -10, flashpointCategory: 'below_38', waterSoluble: false },
  naft_kham_sangin: { name: 'Heavy Crude Oil', nameFa: 'نفت خام سنگین', flashpointC: 120, flashpointCategory: 'above_93', waterSoluble: false },
  naft_koreh:       { name: 'Fuel Oil No.4-6', nameFa: 'نفت کوره', flashpointC: 61, flashpointCategory: '38_to_93', waterSoluble: false },
  aloodeh:          { name: 'Contaminated Product', nameFa: 'مواد آلوده', flashpointC: 0, flashpointCategory: 'below_38', waterSoluble: false },
}

export type TankType = 'cone_roof' | 'floating_internal' | 'floating_external' | 'contaminated'
export type FoamConcentrateType = 'protein' | 'fluoroprotein' | 'afff' | 'arc' | '3x3' | '3x6'

/** Provenance attached to every legacy result, so nothing reads as verified. */
export interface Provenance {
  reference: string
  status: VerificationStatus
}

const PROV = (key: string): Provenance => {
  const e = getActiveBasis().entries[key]
  return { reference: e?.reference ?? '—', status: e?.status ?? 'unverified_legacy' }
}

// ═══════════════════════════════════════════════════════════════════
// NFPA 11 — FOAM
// ═══════════════════════════════════════════════════════════════════

interface FoamTableEntry {
  applicationRate: number  // Lpm/m²
  dischargeTime: number    // minutes
  provenance: Provenance
}

/**
 * Rate and duration for a cone-roof tank.
 *
 * Both values come from the design basis and are `unverified_legacy`: the old
 * engine held them as literals with no edition or table reference.
 */
export function getConeRoofFoamParams(
  fuel: HydrocarbonType,
  protectionType: 'foam_chamber' | 'monitor_hose'
): FoamTableEntry {
  const props = FUEL_PROPERTIES[fuel]
  const isGroupA = props.flashpointCategory === '38_to_93'
  const basis = getActiveBasis()

  const rateKey = protectionType === 'foam_chamber' ? K.foamChamberRate : K.foamMonitorHoseRate
  const durationKey = protectionType === 'foam_chamber'
    ? (isGroupA ? K.foamChamberDurationGroupA : K.foamChamberDurationGroupB)
    : (isGroupA ? K.foamMonitorDurationGroupA : K.foamMonitorDurationGroupB)

  return {
    applicationRate: basisNumber(basis, rateKey) ?? (protectionType === 'foam_chamber' ? NFPA11.chamberRateLminM2 : NFPA11.monitorHoseRateLminM2),
    dischargeTime: basisNumber(basis, durationKey) ?? (protectionType === 'foam_chamber'
      ? (isGroupA ? NFPA11.chamberDurationGroupAMin : NFPA11.chamberDurationGroupBMin)
      : (isGroupA ? NFPA11.monitorDurationGroupAMin : NFPA11.monitorDurationGroupBMin)),
    provenance: PROV(rateKey),
  }
}

/** Plan area of a tank footprint: A = π·(D/2)². */
export function calcSurfaceArea(diameterM: number): number {
  try {
    return planAreaM2(diameterM)
  } catch (err) {
    if (err instanceof CalcInputError) return 0
    throw err
  }
}

/** Annular ring area between the wall and the foam dam. */
export function calcAnnularRingArea(tankDiameterM: number, foamDamOffsetM = 0.6): number {
  const W = foamDamOffsetM
  try {
    // geometry.ts expects a radial offset (inner radius = outer radius − offset).
    // The UI/SPEC define the inner diameter as (D − W), so the needed radial offset
    // is W/2.
    return annularRingAreaM2(tankDiameterM, W / 2)
  } catch {
    return 0
  }
}

/** FSDR = Area × Application rate. */
export function calcFoamSolutionDischargeRate(surfaceAreaM2: number, applicationRateLpmM2: number): number {
  return surfaceAreaM2 * applicationRateLpmM2
}

/**
 * Floating-roof discharge rate and duration.
 *
 * Rates/times are the legacy literals; they carry no edition reference and are
 * reported as such.
 */
export function calcFloatingRoofDischargeRate(
  annularRingAreaM2: number,
  sealPosition: 'top' | 'below'
): { dischargeRate: number; dischargeTime: number; applicationRate: number; provenance: Provenance } {
  const applicationRate = sealPosition === 'top' ? 12.2 : 20.1
  const dischargeTime = sealPosition === 'top' ? 20 : 10
  return {
    dischargeRate: annularRingAreaM2 * applicationRate,
    dischargeTime,
    applicationRate,
    provenance: { reference: 'موتور قبلی — بدون شماره نسخه/جدول', status: 'unverified_legacy' },
  }
}

/** V_concentrate = Q × t × C */
export function calcFoamConcentrateQuantity(
  dischargeRateLpm: number,
  dischargeTimeMin: number,
  concentratePercent: number
): number {
  return dischargeRateLpm * dischargeTimeMin * (concentratePercent / 100)
}

/**
 * §3.1 of the engine specification — minimum number of foam chambers.
 *
 * Delegates to the engine's explicit band table, so the diameter boundaries are
 * testable and a diameter beyond the published bands is reported as extrapolated
 * rather than returned as if it were a table row.
 */
export function calcNumberOfFoamChambers(tankDiameterM: number): number {
  try {
    return foamChamberLookup(tankDiameterM, getActiveBasis()).count
  } catch {
    return 0
  }
}

export function calcFoamChamberSizing(diameterM: number): { count: number; rule: string; extrapolated: boolean; provenance: Provenance } {
  const lookup = foamChamberLookup(diameterM, getActiveBasis())
  return { count: lookup.count, rule: lookup.rule, extrapolated: lookup.extrapolated, provenance: { reference: '§3.1 سند موتور مشخصات (T3.1) — خروجی OUT-002', status: lookup.status } }
}

/** §3.9 of the engine specification — supplementary hand hose lines. */
export function getSupplementaryHoseLines(tankDiameterM: number): { count: number; dischargeTimeMin: number } {
  const row = handHoseLookup(tankDiameterM, getActiveBasis()).row
  return row ? { count: row.count, dischargeTimeMin: row.durationMin } : { count: 3, dischargeTimeMin: 30 }
}

export function calcHandHoseSizing(diameterM: number): {
  count: number
  dischargeTimeMin: number
  flowPerLineLpm: number
  totalFlowLpm: number
  rule: string
  extrapolated: boolean
  provenance: Provenance
} {
  const lookup = handHoseLookup(diameterM, getActiveBasis())
  const flowPerLine = basisNumber(getActiveBasis(), K.foamHandHoseFlow) ?? NFPA11.handHoseFlowLpm
  const row = lookup.row ?? { count: 3, durationMin: 30 }
  return {
    count: row.count,
    dischargeTimeMin: row.durationMin,
    flowPerLineLpm: flowPerLine,
    totalFlowLpm: row.count * flowPerLine,
    rule: lookup.rule,
    extrapolated: lookup.extrapolated,
    provenance: PROV(K.foamHandHoseFlow),
  }
}

/**
 * Q_supplementary = N × Q_line × t × C, with Q_line from §3.9.
 *
 * The literal 189 this used to multiply by was the retired flow per hose line;
 * §3.9 states 190. It disagreed with `calcHandHoseSizing`, which is the figure
 * the report shows, so the same design carried two different supplementary
 * volumes.
 */
export function calcSupplementaryFoamQuantity(
  numberOfHoseLines: number,
  dischargeTimeMin: number,
  concentratePercent: number
): number {
  return numberOfHoseLines * NFPA11.handHoseFlowLpm * dischargeTimeMin * (concentratePercent / 100)
}

export function calcTotalFoamQuantity(primary: number, supplementary: number): number {
  return primary + supplementary
}

/**
 * Foam dam height.
 *
 * The old engine attributed the 300/450/600 mm steps to a clause. That
 * attribution is not confirmed against a licensed edition, so the step rule is
 * now reported as a project default.
 */

/** Number of discharge devices around a floating-roof seal. */
export function calcNumberOfDischargeDevices(tankDiameterM: number, maxSpacingM: number): number {
  try {
    return dischargeDeviceCount(tankDiameterM, maxSpacingM)
  } catch {
    return 0
  }
}

/** §3.4 / §3.5 of the engine specification — maximum discharge device spacing.
 *
 * A return of 0 means the table rows carried in this build do not cover that
 * combination of seal type / dam height / protection position. It is not a
 * spacing of zero metres — callers must treat 0 as "no published row".
 */
export function getFloatingRoofSpacing(
  sealType: 'pantograph' | 'tube_seal_high' | 'tube_seal_low',
  foamDamHeightCm: number,
  protectionPosition: 'top' | 'below'
): number {
  if (sealType === 'pantograph') {
    if (foamDamHeightCm === 0) return protectionPosition === 'below' ? 39.6 : 0
    if (foamDamHeightCm <= 30) return protectionPosition === 'top' ? 12.2 : 0
    if (foamDamHeightCm <= 60) return protectionPosition === 'top' ? 24.4 : 0
  }
  if (sealType === 'tube_seal_high') {
    if (foamDamHeightCm === 0) return protectionPosition === 'below' ? 18.3 : 0
    if (foamDamHeightCm <= 30) return protectionPosition === 'top' ? 12.2 : 0
    if (foamDamHeightCm <= 60) return protectionPosition === 'top' ? 24.4 : 0
  }
  if (sealType === 'tube_seal_low') {
    if (foamDamHeightCm <= 30) return protectionPosition === 'top' ? 12.2 : 18.3
    if (foamDamHeightCm <= 60) return protectionPosition === 'top' ? 24.4 : 18.3
  }
  return 12.2
}

export function calcFlowPerChamber(totalFSDR: number, numberOfChambers: number): number {
  if (!numberOfChambers) return 0
  return totalFSDR / numberOfChambers
}

// ═══════════════════════════════════════════════════════════════════
// HAZEN-WILLIAMS
// ═══════════════════════════════════════════════════════════════════

/**
 * h_f = 10.67 · L · Q^1.852 / (C^1.852 · D^4.87)
 * SI form, declared units: L in m, Q in m³/s, D in m. Inputs are validated and
 * a non-positive value is rejected rather than returning Infinity or NaN.
 */
export function hazenWilliamsHeadLoss(
  lengthM: number,
  flowRateM3s: number,
  roughnessC: number,
  diameterM: number
): number {
  try {
    return hazenWilliamsHeadLossFromLpm(lengthM, flowRateM3s * 60000, roughnessC, diameterM * 1000).headLossM
  } catch {
    return 0
  }
}

/** Same relation, with the boundary units the UI holds (L/min, mm). */
export function hazenWilliamsHeadLoss_LPM(
  lengthM: number,
  flowRateLpm: number,
  roughnessC: number,
  diameterMm: number
): number {
  try {
    return hazenWilliamsHeadLossFromLpm(lengthM, flowRateLpm, roughnessC, diameterMm).headLossM
  } catch {
    return 0
  }
}

export function headLossToBar(headLossM: number): number {
  if (!Number.isFinite(headLossM) || headLossM <= 0) return 0
  // Pressure and head are different dimensions: the conversion goes through the
  // fluid density, and the unit layer refuses a direct head→pressure cast.
  return headPressurePa(headLossM, getActiveBasis().fluid.densityKgm3) / 1e5
}

// ═══════════════════════════════════════════════════════════════════
// NFPA 20 — FIRE PUMP
// ═══════════════════════════════════════════════════════════════════

export interface PumpSpec {
  flowRateLpm: number
  totalHeadM: number
  powerKW: number
  impellerType: 'axial' | 'radial' | 'mixed'
  electricDiesel: 'electric' | 'diesel'
  jockeyFlowLpm: number
  jockeyHeadM: number
  jockeyPowerKW: number
}

/** Worst-case simultaneous demand across monitors, hydrants, foam and cooling. */
export function calcPumpFlowRate(
  monitorFlowsLpm: number[],
  hydrantFlowsLpm: number[],
  foamFlowLpm: number,
  coolingFlowLpm: number
): number {
  const totalMonitorFlow = monitorFlowsLpm.reduce((a, b) => a + b, 0)
  const totalHydrantFlow = hydrantFlowsLpm.reduce((a, b) => a + b, 0)
  return Math.max(totalMonitorFlow + totalHydrantFlow, foamFlowLpm, coolingFlowLpm)
}

/**
 * TDH = H_static + H_friction + H_residual.
 *
 * The residual is passed here **as head in metres**, which is the convention this
 * signature has always used. The datum and which term the suction is folded into
 * must be stated by the caller; they are not inferable from three numbers.
 */
export function calcTotalDynamicHead(
  staticLiftM: number,
  frictionLossM: number,
  residualPressureM: number
): number {
  return staticLiftM + frictionLossM + residualPressureM
}

/**
 * Pump shaft power, kW.
 *
 * P = ρ·g·Q·H / 1000 / η  with Q in m³/s.
 *
 * FIXED: the previous implementation computed
 * `(Q_lpm × H × ρ × g) / (3600 × 1000 × η)`, which divides L/min by 3600 instead
 * of converting it to m³/s. That overstates power by 1000/60 ≈ 16.67×. The test
 * suite asserts this function now agrees with both the SI definition and the US
 * brake-horsepower form, and that the deprecated expression does not.
 */
export function calcPumpPower(
  flowRateLpm: number,
  tdhM: number,
  efficiency = 0.70
): number {
  if (!(flowRateLpm > 0) || !(tdhM > 0) || !(efficiency > 0 && efficiency <= 1)) return 0
  const basis = getActiveBasis()
  const rho = basis.fluid.densityKgm3
  return shaftPowerKW(hydraulicPowerKW(flowRateLpm / 60000, tdhM, rho), efficiency)
}

/** Jockey pump sizing — project practice, not a standard requirement. */
/**
 * Jockey pump — LOOK-011.
 *
 * The specification is explicit that no universal hard-coded jockey flow is
 * permitted, so this is an engine convention and says so. It used to be 15 % of
 * the fire-pump flow with a +20 m margin, which for a 30 000 L/min site gave a
 * 4 500 L/min, 135 kW "jockey" pump — larger than most fire pumps. The engine
 * convention is 1 % and a 0.7 bar margin (≈10 psi above the fire-pump duty
 * point), and this delegates to the same constants so the two cannot drift.
 */
export function calcJockeyPumpSpec(mainPumpFlow: number, mainPumpHead: number) {
  const basis = getActiveBasis()
  const rho = basis.fluid.densityKgm3
  const leak = ENGINE_CONVENTIONS.jockeyLeakFraction
  const flowLpm = Math.round(mainPumpFlow * leak)
  const headM = mainPumpHead + (ENGINE_CONVENTIONS.jockeyPressureMarginBar * 100000) / (rho * ENGINE_CONVENTIONS.g)
  const powerKW = flowLpm > 0 && headM > 0
    ? Math.round(shaftPowerKW(hydraulicPowerKW(flowLpm / 60000, headM, rho), 0.60))
    : 0
  return {
    flowLpm,
    headM: Math.round(headM * 10) / 10,
    powerKW,
    provenance: {
      reference: `کنوانسیون موتور: ${(leak * 100).toFixed(0)}٪ دبی پمپ آتش‌نشانی و +${ENGINE_CONVENTIONS.jockeyPressureMarginBar} bar — الزام استاندارد نیست (LOOK-011)`,
      status: 'requires_engineering_review' as VerificationStatus,
    },
  }
}

/** Exposed so the UI can show that pump selection needs a certified curve. */
export const PUMP_SELECTION_LIMITS = PUMP_ACCEPTANCE_LIMITS

// ═══════════════════════════════════════════════════════════════════
// NFPA 15 — COOLING / WATER SPRAY
// ═══════════════════════════════════════════════════════════════════

/**
 * Nozzle count around a tank.
 *
 * `perRing × rings` is unchanged for every input, but the ring count now comes
 * from generated elevations (so the end distances and the largest installed gap
 * are known) instead of being assumed to be ceil(H/V).
 */
export function calcCoolingNozzleCount(
  diameterM: number,
  heightM: number,
  spacingM = 2.4,
  verticalCoverageM = 3.0
): {
  total: number
  perRing: number
  rings: number
  circumferenceM: number
  spacingM: number
  verticalCoverageM: number
  wettedAreaM2: number
  elevationsM: number[]
  maxGapM: number
  bottomEdgeM: number
  topEdgeM: number
  exceedsVerticalLimit: boolean
} {
  let perRing = 2
  let circumferenceM = 0
  try {
    const r = nozzlesPerRing(diameterM, spacingM)
    perRing = r.count
    circumferenceM = r.circumferenceM
  } catch {
    return {
      total: 0, perRing: 0, rings: 0, circumferenceM: 0, spacingM, verticalCoverageM,
      wettedAreaM2: 0, elevationsM: [], maxGapM: 0, bottomEdgeM: 0, topEdgeM: 0, exceedsVerticalLimit: false,
    }
  }

  let layout
  try {
    layout = generateRingElevations({ protectedHeightM: heightM, maxVerticalSpacingM: verticalCoverageM })
  } catch {
    layout = { elevationsM: [0], ringCount: 1, intervals: 0, maxGapM: 0, bottomEdgeM: 0, topEdgeM: 0, exceedsDesignSpacing: false, status: 'preliminary' as const }
  }

  return {
    total: perRing * layout.ringCount,
    perRing,
    rings: layout.ringCount,
    circumferenceM,
    spacingM,
    verticalCoverageM,
    wettedAreaM2: circumferenceM * heightM,
    elevationsM: layout.elevationsM,
    maxGapM: layout.maxGapM,
    bottomEdgeM: layout.bottomEdgeM,
    topEdgeM: layout.topEdgeM,
    exceedsVerticalLimit: layout.exceedsDesignSpacing,
  }
}

/**
 * Which cooling-rate entry the engine is currently applying.
 *
 * The switch is a code-level default, not a screen: `defaultBasis()` sets it to
 * `required`, so the standard's figure governs unless the code itself is
 * changed. It never falls back to the retired value on a missing entry.
 */
function governingRateKey(basis: DesignBasis): string {
  const governing = (basis.entries[K.sprayRateGoverns]?.value as string) ?? 'required'
  return governing === 'required' ? K.sprayRequiredRate : K.sprayProjectRate
}

/**
 * The cooling application rate the engine applies, L/min/m².
 *
 * Every cooling path resolves through here — the burning tank and each adjacent
 * tank — so the two can never disagree. The adjacent-tank path used to read the
 * retired 2.0 L/min/m² entry directly, which understated it 5.1×.
 */
export function governingCoolingRateLpmM2(basis: DesignBasis): number {
  return basisNumber(basis, governingRateKey(basis)) ?? NFPA15.waterSprayRateLminM2
}

/**
 * Cooling water demand: Q = A_cool × R.
 *
 * A_cool is half the shell, plus the roof when the tank has a fixed roof
 * (`src/lib/coolingArea.ts`). The rate is the engine constant (§3.10 of the
 * engine specification) via `governingCoolingRateLpmM2`; the source and status
 * travel with the result.
 */
export function calcCoolingWaterRate(
  tankDiameterM: number,
  tankHeightM: number,
  roofKind: RoofKind | null = null,
): { wettedAreaM2: number; coolingRateLpmM2: number; totalFlowLpm: number; rateSource: string; rateStatus: VerificationStatus } {
  let wettedAreaM2 = 0
  try {
    wettedAreaM2 = coolingAreaM2(tankDiameterM, tankHeightM, roofKind).totalM2
  } catch {
    wettedAreaM2 = 0
  }
  const basis = getActiveBasis()
  const key = governingRateKey(basis)
  const coolingRateLpmM2 = governingCoolingRateLpmM2(basis)
  return {
    wettedAreaM2,
    coolingRateLpmM2,
    totalFlowLpm: wettedAreaM2 * coolingRateLpmM2,
    rateSource: basis.entries[key]?.reference ?? '—',
    rateStatus: basis.entries[key]?.status ?? 'unverified_legacy',
  }
}

export function calcCoolingWaterVolume(totalFlowLpm: number, durationMin = 60): number {
  return totalFlowLpm * durationMin
}

/**
 * Cooling requirement for an adjacent tank within one diameter.
 *
 * "Within one diameter" is a project rule carried from the old engine. The rate
 * is NOT: it resolves through `governingCoolingRateLpmM2`, the same figure the
 * burning tank uses. This function previously read the retired 2.0 L/min/m²
 * entry directly, so every adjacent tank was understated 5.1×.
 *
 * An adjacent tank is cooled on half its shell; it has no roof exposure.
 */
export function calcAdjacentTankCooling(
  adjacentTankDiameterM: number,
  adjacentTankHeightM: number
): number {
  let wettedArea = 0
  try {
    wettedArea = shellCoolingAreaM2(adjacentTankDiameterM, adjacentTankHeightM)
  } catch {
    return 0
  }
  return wettedArea * governingCoolingRateLpmM2(getActiveBasis())
}

// ═══════════════════════════════════════════════════════════════════
// IPS-E-GN-100 — PIPE SCHEDULE
// ═══════════════════════════════════════════════════════════════════

export const PIPE_SIZES_MM = PIPE_SIZES.map(p => ({ nominal: p.nominal, id: p.id, od: p.od, schedule: p.schedule }))

export function calcPipeVelocity(flowRateLpm: number, diameterMm: number): number {
  try {
    return velocityMs(flowRateLpm, diameterMm)
  } catch {
    return 0
  }
}

export function recommendPipeSize(flowRateLpm: number): { nominal: string; id: number } {
  const maxVelocity = basisNumber(getActiveBasis(), K.hwMaxVelocity) ?? HYDRAULICS.maxVelocityMs
  try {
    const size = engineRecommendPipeSize(flowRateLpm, maxVelocity)
    return { nominal: size.nominal, id: size.id }
  } catch {
    return { nominal: '12"', id: 305 }
  }
}

// ═══════════════════════════════════════════════════════════════════
// WORST CASE SCENARIO
// ═══════════════════════════════════════════════════════════════════

export interface Tank {
  id: string
  name: string
  type: TankType
  diameterM: number
  heightM: number
  fuelType: HydrocarbonType
  x: number
  y: number
}

export interface WorstCaseScenario {
  burningTanks: Tank[]
  totalFireAreaM2: number
  foamDemand: {
    primary: number
    supplementary: number
    total: number
    dischargeTimeMin: number
    applicationRateLpmM2: number
    /** FOAM-002 — the flow each outlet must deliver; the §4.1 listing check value. */
    flowPerOutletLpm: number
    rateProvenance: Provenance
  }
  coolingDemand: {
    burningTank: number
    adjacentTanks: number
    total: number
    rateProvenance: Provenance
  }
  coolingNozzles: {
    total: number
    perRing: number
    rings: number
    circumferenceM: number
    spacingM: number
    verticalCoverageM: number
    wettedAreaM2: number
    elevationsM: number[]
    maxGapM: number
    exceedsVerticalLimit: boolean
  }
  foamChambers: { count: number; rule: string; extrapolated: boolean; provenance: Provenance }
  handHose: {
    count: number
    dischargeTimeMin: number
    flowPerLineLpm: number
    totalFlowLpm: number
    rule: string
    extrapolated: boolean
    provenance: Provenance
  }
  totalWaterDemandLpm: number
  pumpSpec: PumpSpec
  ringMainSize: string
  ringMainSizeRecommended: string
}

export function identifyWorstCaseTank(tanks: Tank[]): Tank | null {
  if (tanks.length === 0) return null
  return tanks.reduce((worst, current) => {
    const worstScore = worst.diameterM * worst.heightM
    const currentScore = current.diameterM * current.heightM
    return currentScore > worstScore ? current : worst
  })
}

export function findAdjacentTanks(burningTank: Tank, allTanks: Tank[]): Tank[] {
  const maxDistance = burningTank.diameterM
  return allTanks.filter(t => {
    if (t.id === burningTank.id) return false
    const dx = t.x - burningTank.x
    const dy = t.y - burningTank.y
    return Math.sqrt(dx * dx + dy * dy) <= maxDistance
  })
}

export function calcWorstCase(tanks: Tank[]): WorstCaseScenario | null {
  const burningTank = identifyWorstCaseTank(tanks)
  if (!burningTank) return null

  const adjacentTanks = findAdjacentTanks(burningTank, tanks)

  // Roof-aware, from the specification engine: the protected area, the rate and
  // time, and the outlet table are each selected by the tank's roof kind (IN-008).
  // This facade used to run the cone-roof basis for every tank and then read the
  // §3.1 chamber count from the diameter alone — so a floating-roof tank was
  // given a fixed-roof design, and a tank whose roof nobody had declared was
  // given one silently. With the roof unstated the engine returns no basis, and
  // no scenario can be formed.
  const specRun = runSpecEngine(
    {
      id: burningTank.id,
      label: burningTank.name,
      diameterM: burningTank.diameterM,
      shellHeightM: burningTank.heightM,
      liquidLevelM: burningTank.heightM * 0.85,
      fuelKey: burningTank.fuelType,
      roofKind: roofKindFromTankType(burningTank.type),
      coolingHeightM: burningTank.heightM,
    },
    defaultSpecConfig(),
  )
  const foam = specRun.foam
  if (!foam || foam.areaM2 === null || foam.rateLminM2 === null || foam.timeMin === null) return null

  const surfaceArea = foam.areaM2
  const fsdr = foam.qSolutionLpm ?? 0
  const outletCount = foam.outletCount ?? 0
  const flowPerChamber = outletCount > 0 ? fsdr / outletCount : 0
  const primaryFoam = calcFoamConcentrateQuantity(fsdr, foam.timeMin, 3)

  const outletRow = specRun.byId['OUT-002']
  const chamberSizing = {
    count: outletCount,
    rule: `${outletRow.referenceIds.join(', ')} — ${outletRow.note ?? ''}`,
    extrapolated:
      specRun.geometry.roofKind === 'fixed' && burningTank.diameterM > FIXED_ROOF_OPEN_BAND_FROM_M,
    provenance: {
      reference: `${outletRow.referenceIds.join(', ') || '§3.1'} سند موتور مشخصات — خروجی OUT-002`,
      status: 'requires_engineering_review' as VerificationStatus,
    },
  }

  const hoseInfo = getSupplementaryHoseLines(burningTank.diameterM)
  const supplementaryFoam = calcSupplementaryFoamQuantity(hoseInfo.count, hoseInfo.dischargeTimeMin, 3)

  const burningTankCooling = calcCoolingWaterRate(
    burningTank.diameterM,
    burningTank.heightM,
    roofKindFromTankType(burningTank.type),
  )
  const adjacentCoolingTotal = adjacentTanks.reduce((sum, t) => sum + calcAdjacentTankCooling(t.diameterM, t.heightM), 0)

  const coolingNozzles = calcCoolingNozzleCount(burningTank.diameterM, burningTank.heightM)
  const handHose = calcHandHoseSizing(burningTank.diameterM)

  const totalWaterDemand = Math.max(fsdr + adjacentCoolingTotal, burningTankCooling.totalFlowLpm + adjacentCoolingTotal)

  // Friction is a project allowance here, not a network calculation — the report
  // says so explicitly rather than presenting it as a computed loss.
  const pipeLoss = basisNumber(getActiveBasis(), K.pumpFrictionAllowance) ?? NFPA20.frictionAllowanceM
  const staticLift = basisNumber(getActiveBasis(), K.pumpStaticLift) ?? NFPA20.staticLiftM
  const residualBar = basisNumber(getActiveBasis(), K.pumpMonitorResidual) ?? NFPA20.monitorResidualBar
  const residualPressure = pressureHeadM(residualBar * 1e5, getActiveBasis().fluid.densityKgm3)
  const tdh = calcTotalDynamicHead(staticLift, pipeLoss, residualPressure)

  const pumpPower = calcPumpPower(totalWaterDemand, tdh)
  const jockey = calcJockeyPumpSpec(totalWaterDemand, tdh)
  const safetyFactor = basisNumber(getActiveBasis(), K.pumpSafetyFactor) ?? NFPA20.powerSafetyFactor

  const pumpSpec: PumpSpec = {
    flowRateLpm: Math.round(totalWaterDemand),
    totalHeadM: Math.round(tdh),
    powerKW: Math.round(pumpPower * safetyFactor),
    impellerType: totalWaterDemand > 5000 ? 'axial' : 'radial',
    electricDiesel: 'electric',
    jockeyFlowLpm: jockey.flowLpm,
    jockeyHeadM: jockey.headM,
    jockeyPowerKW: jockey.powerKW,
  }

  const pipeSize = recommendPipeSize(totalWaterDemand)
  const pipeSizeUp = recommendPipeSize(totalWaterDemand * 1.25)

  // Flow per outlet is reported, not discarded: it is the value the §4.1 listing
  // check is performed against (FOAM-002), and it used to be computed then dropped.

  return {
    burningTanks: [burningTank],
    totalFireAreaM2: surfaceArea,
    foamDemand: {
      primary: Math.round(primaryFoam),
      supplementary: Math.round(supplementaryFoam),
      total: Math.round(primaryFoam + supplementaryFoam),
      dischargeTimeMin: foam.timeMin,
      applicationRateLpmM2: foam.rateLminM2,
      flowPerOutletLpm: Math.round(flowPerChamber),
      rateProvenance: {
        reference: specRun.byId['OUT-003'].referenceIds.join(', ') || '§3.2',
        status: 'requires_engineering_review' as VerificationStatus,
      },
    },
    coolingDemand: {
      burningTank: Math.round(burningTankCooling.totalFlowLpm),
      adjacentTanks: Math.round(adjacentCoolingTotal),
      total: Math.round(burningTankCooling.totalFlowLpm + adjacentCoolingTotal),
      rateProvenance: { reference: burningTankCooling.rateSource, status: burningTankCooling.rateStatus },
    },
    coolingNozzles: {
      total: coolingNozzles.total,
      perRing: coolingNozzles.perRing,
      rings: coolingNozzles.rings,
      circumferenceM: Math.round(coolingNozzles.circumferenceM * 10) / 10,
      spacingM: coolingNozzles.spacingM,
      verticalCoverageM: coolingNozzles.verticalCoverageM,
      wettedAreaM2: Math.round(coolingNozzles.wettedAreaM2),
      elevationsM: coolingNozzles.elevationsM,
      maxGapM: coolingNozzles.maxGapM,
      exceedsVerticalLimit: coolingNozzles.exceedsVerticalLimit,
    },
    foamChambers: chamberSizing,
    handHose,
    totalWaterDemandLpm: Math.round(totalWaterDemand),
    pumpSpec,
    ringMainSize: `${pipeSize.nominal} (Ø${pipeSize.id}mm)`,
    ringMainSizeRecommended: `${pipeSizeUp.nominal} (Ø${pipeSizeUp.id}mm) — پیشنهاد برای حداکثر ظرفیت عملیاتی`,
  }
}

// ═══════════════════════════════════════════════════════════════════
// BUNDWALL — SECONDARY CONTAINMENT
// ═══════════════════════════════════════════════════════════════════

/**
 * Required containment volume.
 *
 * The rule — MAX(110% of the largest tank, 25% of the aggregate) — is a project/
 * regulatory rule with no recorded source, NOT a universal NFPA requirement. The
 * engine implements the competing formulations alongside it; see calc/bundwall.ts.
 */
export function calcRequiredBandwallVolume(
  tanks: { diameterM: number; heightM: number }[]
): {
  requiredVolume: number
  largestVolume: number
  totalVolume: number
  rule1: number
  rule2: number
  appliedRule: string
  provenance: Provenance
} {
  const req = requiredBundwallVolume(tanks, getActiveBasis())
  const legacy = req.candidates.find(c => c.ruleId === 'legacy_110_or_25')
  const rule1 = req.largestVolumeM3 * 1.1
  const rule2 = req.totalVolumeM3 * 0.25
  return {
    requiredVolume: req.requiredVolumeM3,
    largestVolume: req.largestVolumeM3,
    totalVolume: req.totalVolumeM3,
    rule1,
    rule2,
    appliedRule: req.governing === 'legacy_110_or_25'
      ? (rule1 >= rule2 ? '۱۱۰٪ بزرگ‌ترین مخزن' : '۲۵٪ مجموع مخازن')
      : req.governingExpression,
    provenance: { reference: req.source, status: req.verification },
  }
}

export function calcTankVolume(diameterM: number, heightM: number): number {
  try {
    return cylinderVolumeM3(diameterM, heightM)
  } catch {
    return 0
  }
}

export function calcBandwallActualVolume(
  bandwallAreaM2: number,
  heightM: number,
  tanksWithin: { diameterM: number }[]
): number {
  const tankFootprint = tanksWithin.reduce((sum, t) => sum + calcSurfaceArea(t.diameterM), 0)
  return (bandwallAreaM2 - tankFootprint) * heightM
}

// SPDX-License-Identifier: Apache-2.0
// ═══════════════════════════════════════════════════════════════════
// NFPA 20 — FIRE PUMP DUTY
//
// One consistent head formulation. Pressure and head are different
// dimensions, so a residual pressure is converted to head exactly once, via
// the fluid density, at the boundary — never added to a head as a bare number.
//
// The power chain is hydraulic power → shaft power, with the volumetric flow
// converted to SI once. The legacy expression that shipped before this change
// is kept, marked deprecated, solely so the test suite can demonstrate that it
// does not agree with the SI definition.
// ═══════════════════════════════════════════════════════════════════

import { assertPositive, assertRange, G } from './units'

/** h = P / (ρ·g). Pressure in Pa, density in kg/m³, result in m of fluid. */
export function pressureHeadM(pressurePa: number, densityKgm3: number, g = G): number {
  const P = assertPositive(pressurePa, 'pressure')
  const rho = assertPositive(densityKgm3, 'fluid density')
  assertPositive(g, 'gravitational acceleration')
  return P / (rho * g)
}

/** P = ρ·g·h. Result in Pa. */
export function headPressurePa(headM: number, densityKgm3: number, g = G): number {
  return assertPositive(headM, 'head') * assertPositive(densityKgm3, 'fluid density') * g
}

export interface TdhInput {
  /** Static elevation difference between the source and the controlling point, m. */
  staticLiftM: number
  /** Total calculated friction loss, m. */
  frictionLossM: number
  /** Required residual pressure at the controlling point, Pa. */
  residualPressurePa: number
  densityKgm3: number
  /** Whether the datum and suction conditions below are the ones used. */
  datumNote?: string
}

export interface TdhResult {
  staticLiftM: number
  frictionLossM: number
  residualHeadM: number
  totalDynamicHeadM: number
  equation: string
  substitution: string
  /** Things the caller must not silently double count. */
  cautions: string[]
}

/**
 * TDH = H_static + H_friction + H_residual
 *
 * The residual pressure is converted to head here. `staticLiftM` is defined as
 * the elevation difference from the pump datum (or the source surface, whichever
 * the chosen formulation declares) to the controlling point — the caller must
 * not also add the source elevation, and must not include the residual in the
 * static term.
 */
export function totalDynamicHead(input: TdhInput): TdhResult {
  const { staticLiftM, frictionLossM, residualPressurePa, densityKgm3, datumNote } = input
  // A lift may legitimately be zero or negative (a downhill gravity feed).
  if (!Number.isFinite(staticLiftM)) throw new TypeError('static lift must be finite')
  const Hf = assertPositive(frictionLossM, 'friction loss')
  const Hres = pressureHeadM(residualPressurePa, densityKgm3)
  const tdh = staticLiftM + Hf + Hres

  const cautions: string[] = [
    'هد استاتیک از مبنای (datum) پمپ تا نقطه کنترل اندازه‌گیری می‌شود؛ ارتفاع منبع نباید دوباره اضافه شود.',
    'فشار باقی‌مانده یک بار به هد تبدیل شده است و نباید به‌صورت عدد خام با هد جمع شود.',
  ]
  if (datumNote) cautions.push(`مبنای مرجع: ${datumNote}`)

  return {
    staticLiftM,
    frictionLossM: Hf,
    residualHeadM: Hres,
    totalDynamicHeadM: tdh,
    equation: 'TDH = H_static + H_friction + H_residual   (H_residual = P_residual / (ρ·g))',
    substitution: `${staticLiftM.toFixed(2)} + ${Hf.toFixed(2)} + ${Hres.toFixed(2)} = ${tdh.toFixed(2)} m`,
    cautions,
  }
}

// ─── Power ─────────────────────────────────────────────────────────
/** P_hyd = ρ·g·Q·H / 1000, kW, with Q in m³/s and H in m. */
export function hydraulicPowerKW(flowM3s: number, headM: number, densityKgm3: number, g = G): number {
  const Q = assertPositive(flowM3s, 'flow rate')
  const H = assertPositive(headM, 'head')
  const rho = assertPositive(densityKgm3, 'fluid density')
  return (rho * g * Q * H) / 1000
}

/** P_input = P_hyd / η. */
export function shaftPowerKW(hydraulicKW: number, efficiency: number): number {
  const P = assertPositive(hydraulicKW, 'hydraulic power')
  assertRange(efficiency, 'pump efficiency', 0.01, 1)
  return P / efficiency
}

export interface PumpPowerResult {
  flowLpm: number
  flowM3s: number
  headM: number
  densityKgm3: number
  efficiency: number
  hydraulicKW: number
  shaftKW: number
  equation: string
  substitution: string
}

/**
 * Full power chain for a pump duty point, with the L/min → m³/s conversion
 * performed exactly once and the substitution shown for the report.
 */
export function pumpPower(input: {
  flowLpm: number
  headM: number
  densityKgm3: number
  efficiency: number
}): PumpPowerResult {
  const { flowLpm, headM, densityKgm3, efficiency } = input
  const Q = assertPositive(flowLpm, 'flow rate') / 60000
  const H = assertPositive(headM, 'head')
  const rho = assertPositive(densityKgm3, 'fluid density')
  assertRange(efficiency, 'pump efficiency', 0.01, 1)

  const hydraulicKW = hydraulicPowerKW(Q, H, rho)
  const shaftKW = shaftPowerKW(hydraulicKW, efficiency)

  return {
    flowLpm,
    flowM3s: Q,
    headM: H,
    densityKgm3,
    efficiency,
    hydraulicKW,
    shaftKW,
    equation: 'P_hyd = ρ·g·Q·H/1000  →  P_input = P_hyd / η',
    substitution:
      `${rho} × ${G} × ${Q.toFixed(6)} m³/s × ${H} m / 1000 = ${hydraulicKW.toFixed(2)} kW ÷ ${efficiency} = ${shaftKW.toFixed(2)} kW`,
  }
}

/**
 * The expression that shipped in the original engine:
 *
 *   P = (Q[L/min] × TDH × ρ × g) / (3600 × η)
 *
 * It is dimensionally wrong: dividing L/min by 3600 mixes the L/min → m³/s
 * factor of 60000 with an hour conversion, so it overstates power by 1000/60.
 * It also hard-codes g = 9.81 where the corrected chain uses standard gravity,
 * so the observed ratio is (1000/60) × (9.81/g) = 16.6724.
 *
 * Retained only so the test suite can prove it disagrees with the SI definition.
 * Do not call it from application code.
 *
 * @deprecated Verified incorrect — superseded by `pumpPower`.
 */
export function legacyPumpPowerKW(flowLpm: number, headM: number, efficiency = 0.7, densityKgm3 = 1000): number {
  return (flowLpm * headM * densityKgm3 * 9.81) / (3600 * 1000 * efficiency)
}

/**
 * How far the deprecated expression diverges: the unit error (1000/60) combined
 * with the difference between its hard-coded g = 9.81 and standard gravity.
 */
export const LEGACY_POWER_UNIT_FACTOR = 1000 / 60 // 16.6667 — the dimension error alone
export const LEGACY_POWER_ERROR_FACTOR = (1000 / 60) * (9.81 / G) // 16.6724 — as observed

// ─── Pump selection against a certified curve ──────────────────────
export interface CurvePoint {
  flowLpm: number
  headM: number
}

export interface PumpDutyCheck {
  /** Whether the system demand point sits on/under the supplied curve. */
  covered: boolean | null
  /** Available head at the demand flow, interpolated strictly between points. */
  availableHeadM: number | null
  headMarginM: number | null
  /** Why the check could not be made, when it could not. */
  reason?: string
  status: 'verified' | 'manufacturer_specific' | 'requires_engineering_review'
  note: string
}

/**
 * Check the system demand point against the manufacturer's certified curve.
 *
 * Interpolation is strictly between two published points. A demand flow outside
 * the published range returns `covered: null` with a reason — the curve is never
 * extrapolated.
 */
export function evaluatePumpDuty(
  demandFlowLpm: number,
  demandHeadM: number,
  curve: CurvePoint[] | null | undefined,
): PumpDutyCheck {
  if (!curve || curve.length < 2) {
    return {
      covered: null,
      availableHeadM: null,
      headMarginM: null,
      reason: 'منحنی تأییدشده پمپ در دسترس نیست',
      status: 'manufacturer_specific',
      note: 'بدون منحنی گواهی‌شده سازنده، تطابق نقطه کار پمپ قابل تأیید نیست. TDH به‌تنهایی دلیل کفایت پمپ نیست.',
    }
  }

  const sorted = [...curve].sort((a, b) => a.flowLpm - b.flowLpm)
  const min = sorted[0].flowLpm
  const max = sorted[sorted.length - 1].flowLpm

  if (demandFlowLpm < min || demandFlowLpm > max) {
    return {
      covered: null,
      availableHeadM: null,
      headMarginM: null,
      reason: `دبی تقاضا (${demandFlowLpm} L/min) خارج از بازه منحنی منتشرشده (${min}–${max} L/min) است`,
      status: 'requires_engineering_review',
      note: 'برون‌یابی فراتر از داده منتشرشده انجام نشد؛ نیازمند تأیید مهندسی و داده سازنده است.',
    }
  }

  let availableHeadM: number | null = null
  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i]
    const b = sorted[i + 1]
    if (demandFlowLpm >= a.flowLpm && demandFlowLpm <= b.flowLpm) {
      const t = b.flowLpm === a.flowLpm ? 0 : (demandFlowLpm - a.flowLpm) / (b.flowLpm - a.flowLpm)
      availableHeadM = a.headM + t * (b.headM - a.headM)
      break
    }
  }

  if (availableHeadM === null) {
    return {
      covered: null, availableHeadM: null, headMarginM: null,
      reason: 'درون‌یابی روی منحنی ممکن نشد',
      status: 'requires_engineering_review',
      note: 'نقاط منحنی نیازمند بازبینی است.',
    }
  }

  const headMarginM = availableHeadM - demandHeadM
  return {
    covered: headMarginM >= 0,
    availableHeadM,
    headMarginM,
    status: 'verified',
    note: 'هد موجود از درون‌یابی خطی بین نقاط منتشرشده منحنی محاسبه شد (بدون برون‌یابی).',
  }
}

/**
 * Acceptance limits used when assessing a pump against NFPA 20.
 *
 * These percentages are widely published but have NOT been checked against the
 * licensed text of an adopted edition in this build, so they ship as
 * `requires_engineering_review` and any assessment that relies on them is
 * reported as such.
 */
export const PUMP_ACCEPTANCE_LIMITS = {
  overload: { flowPercentOfRated: 150, minHeadPercentOfRated: 65 },
  churn: { maxHeadPercentOfRated: 140 },
  reference: 'NFPA 20 — نسخه ثبت نشده؛ این درصدها باید با متن نسخه مصوب تطبیق داده شوند',
  status: 'requires_engineering_review' as const,
}

export interface PumpAcceptanceResult {
  ratedFlowLpm: number
  ratedHeadM: number
  evaluated: { point: string; flowLpm: number; headM: number; pass: boolean | null }[]
  status: 'requires_engineering_review'
  note: string
}

/** Evaluate the overload/churn points on a supplied curve. Null = not on curve. */
export function evaluatePumpAcceptance(
  ratedFlowLpm: number,
  ratedHeadM: number,
  curve: CurvePoint[] | null | undefined,
): PumpAcceptanceResult {
  const rated = assertPositive(ratedFlowLpm, 'rated flow')
  const ratedH = assertPositive(ratedHeadM, 'rated head')

  const at = (pctFlow: number) => {
    const flow = (rated * pctFlow) / 100
    const c = evaluatePumpDuty(flow, 0, curve)
    return { flow, availableHeadM: c.availableHeadM }
  }

  const overload = at(PUMP_ACCEPTANCE_LIMITS.overload.flowPercentOfRated)
  const churn = at(0)
  const minHead = (ratedH * PUMP_ACCEPTANCE_LIMITS.overload.minHeadPercentOfRated) / 100
  const maxChurn = (ratedH * PUMP_ACCEPTANCE_LIMITS.churn.maxHeadPercentOfRated) / 100

  return {
    ratedFlowLpm: rated,
    ratedHeadM: ratedH,
    evaluated: [
      {
        point: `150% دبی نامی (${PUMP_ACCEPTANCE_LIMITS.overload.flowPercentOfRated}%)`,
        flowLpm: overload.flow,
        headM: overload.availableHeadM ?? NaN,
        pass: overload.availableHeadM === null ? null : overload.availableHeadM >= minHead,
      },
      {
        point: 'دبی صفر (churn)',
        flowLpm: 0,
        headM: churn.availableHeadM ?? NaN,
        pass: churn.availableHeadM === null ? null : churn.availableHeadM <= maxChurn,
      },
    ],
    status: 'requires_engineering_review',
    note: `${PUMP_ACCEPTANCE_LIMITS.reference}. محدودیت پذیرش ۱۵۰٪/۶۵٪ و churn ۱۴۰٪ در این ساخت تأیید نشده است.`,
  }
}

/** Jockey pump: project practice, not a standard requirement. */
export function jockeyPumpSpec(mainFlowLpm: number, mainHeadM: number, densityKgm3: number, split = 0.15, boostM = 20) {
  const flow = assertPositive(mainFlowLpm, 'main pump flow') * split
  const head = assertPositive(mainHeadM, 'main pump head') + boostM
  const power = pumpPower({ flowLpm: flow, headM: head, densityKgm3, efficiency: 0.6 })
  return {
    flowLpm: Math.round(flow),
    headM: head,
    powerKW: Math.round(power.shaftKW),
    source: 'project_default' as const,
    reference: 'رویه پروژه: ۱۵٪ دبی پمپ اصلی و +۲۰ متر — الزام استاندارد نیست',
  }
}

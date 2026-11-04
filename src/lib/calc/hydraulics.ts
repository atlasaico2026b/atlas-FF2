// SPDX-License-Identifier: Apache-2.0
// ═══════════════════════════════════════════════════════════════════
// HYDRAULICS — HAZEN-WILLIAMS AND MINOR LOSSES
//
// ONE implementation, SI units declared explicitly. Callers that hold L/min
// and mm convert here; nothing else in the codebase is allowed to carry its
// own copy of the coefficient.
//
// Hazen-Williams limitations (stated, not hidden): it is an empirical
// relation for water at ordinary temperatures in the turbulent regime with a
// C value appropriate to the pipe material and condition. It does not model
// transition/laminar flow, and it carries no minor losses — those must be
// added, once, by the caller.
// ═══════════════════════════════════════════════════════════════════

import type { DesignBasis } from './provenance'
import { basisNumber, K } from './basis'
import { HYDRAULICS } from './constants'
import { assertPositive, assertRange, G } from './units'

/** SI Hazen-Williams coefficient. Valid only for Q in m³/s and D in m. */
export const HW_COEFFICIENT_SI = 10.67

export interface HazenWilliamsInput {
  /** Pipe length, m — must be positive. */
  lengthM: number
  /** Volumetric flow, m³/s — must be positive. */
  flowM3s: number
  /** Hazen-Williams C (dimensionless). */
  c: number
  /** Internal diameter, m — must be positive. */
  diameterM: number
}

export interface HazenWilliamsResult {
  headLossM: number
  /** Friction slope, m of head per m of pipe. */
  slopeMm: number
  velocityMs: number
  reynoldsApprox: number
  equation: string
  substitution: string
}

/**
 * h_f = 10.67 · L · Q^1.852 / (C^1.852 · D^4.87)
 * with h_f in m, L in m, Q in m³/s, D in m, C dimensionless.
 */
export function hazenWilliamsHeadLossM({
  lengthM,
  flowM3s,
  c,
  diameterM,
}: HazenWilliamsInput): HazenWilliamsResult {
  const L = assertPositive(lengthM, 'pipe length')
  const Q = assertPositive(flowM3s, 'flow rate')
  const C = assertPositive(c, 'Hazen-Williams coefficient C')
  const D = assertPositive(diameterM, 'internal diameter')

  const numerator = HW_COEFFICIENT_SI * L * Math.pow(Q, 1.852)
  const denominator = Math.pow(C, 1.852) * Math.pow(D, 4.87)
  const headLossM = numerator / denominator

  const area = (Math.PI * Math.pow(D, 2)) / 4
  const velocityMs = Q / area
  // Kinematic viscosity of water at 20 °C, 1.004e-6 m²/s. Reported as an
  // indicator only: Hazen-Williams is not a Reynolds-based method.
  const reynoldsApprox = (velocityMs * D) / 1.004e-6

  return {
    headLossM,
    slopeMm: headLossM / L,
    velocityMs,
    reynoldsApprox,
    equation: 'h_f = 10.67 · L · Q^1.852 / (C^1.852 · D^4.87)',
    substitution:
      `${HW_COEFFICIENT_SI} × ${L} × ${Q.toFixed(6)}^1.852 / (${C}^1.852 × ${D}^4.87) = ${headLossM.toFixed(4)} m`,
  }
}

/** Convenience boundary for the units the UI holds (L/min, mm). */
export function hazenWilliamsHeadLossFromLpm(
  lengthM: number,
  flowLpm: number,
  c: number,
  diameterMm: number,
): HazenWilliamsResult {
  return hazenWilliamsHeadLossM({
    lengthM,
    flowM3s: flowLpm / 60000,
    c,
    diameterM: diameterMm / 1000,
  })
}

/** Same calculation, resolving C from the design basis instead of a literal. */
export function hazenWilliamsWithBasis(
  lengthM: number,
  flowLpm: number,
  diameterMm: number,
  basis: DesignBasis,
): HazenWilliamsResult & { cUsed: number; cBasisKey: string } {
  const c = basisNumber(basis, K.hwCoefficient)
  assertPositive(c ?? NaN, `design basis entry ${K.hwCoefficient}`)
  return { ...hazenWilliamsHeadLossFromLpm(lengthM, flowLpm, c as number, diameterMm), cUsed: c as number, cBasisKey: K.hwCoefficient }
}

export function velocityMs(flowLpm: number, diameterMm: number): number {
  const Q = assertPositive(flowLpm, 'flow rate') / 60000
  const D = assertPositive(diameterMm, 'internal diameter') / 1000
  return Q / ((Math.PI * Math.pow(D, 2)) / 4)
}

// ─── Minor losses ──────────────────────────────────────────────────
/**
 * Minor/component loss by the velocity-head (K) method: h = K · v²/(2g).
 *
 * The K values themselves are project/methodology data. The reference set below
 * is indicative only — the project's own methodology or the manufacturer's data
 * governs, and every entry is flagged for review.
 */
export function minorLossHeadM(k: number, velocity: number): number {
  assertPositive(k, 'loss coefficient K')
  assertPositive(velocity, 'velocity')
  return (k * Math.pow(velocity, 2)) / (2 * G)
}

export interface FittingKLoss {
  id: string
  label: string
  k: number
  note?: string
}

/**
 * Indicative K values. NOT a standard requirement and NOT manufacturer data —
 * shipped so the methodology can be applied, every entry marked for review.
 */
export const FITTING_K_REFERENCE: FittingKLoss[] = [
  { id: 'elbow_90_lr', label: 'زانویی ۹۰ درجه شعاع بلند', k: 0.6 },
  { id: 'elbow_90_sr', label: 'زانویی ۹۰ درجه شعاع کوتاه', k: 0.9 },
  { id: 'elbow_45', label: 'زانویی ۴۵ درجه', k: 0.4 },
  { id: 'tee_through', label: 'سه‌راهی — مسیر مستقیم', k: 0.3 },
  { id: 'tee_branch', label: 'سه‌راهی — انشعاب', k: 1.0 },
  { id: 'gate_valve', label: 'ولو کشویی باز', k: 0.15 },
  { id: 'butterfly_valve', label: 'ولو پروانه‌ای باز', k: 0.6 },
  { id: 'check_valve_swing', label: 'چک ولو سوپاپی', k: 2.5 },
  { id: 'reducer', label: 'کوپلر کاهنده', k: 0.5, note: 'به شدت تابع هندسه است' },
]

export function minorLossFromFittings(
  fittings: { k: number; count: number }[],
  velocity: number,
): { totalK: number; headLossM: number } {
  const totalK = fittings.reduce((sum, f) => sum + assertPositive(f.k, 'fitting K') * Math.max(0, f.count), 0)
  return { totalK, headLossM: minorLossHeadM(totalK, velocity) }
}

// ─── Pipe schedule ─────────────────────────────────────────────────
export interface PipeSize {
  nominal: string
  /** Internal diameter, mm (Schedule 40 steel unless noted). */
  id: number
  od: number
  schedule: number
}

/** Project pipe schedule. Internal diameters are project data, not a standard. */
export const PIPE_SIZES: PipeSize[] = [
  { nominal: '1"', id: 25, od: 33.7, schedule: 40 },
  { nominal: '1.5"', id: 38, od: 48.3, schedule: 40 },
  { nominal: '2"', id: 51, od: 60.3, schedule: 40 },
  { nominal: '2.5"', id: 64, od: 73.0, schedule: 40 },
  { nominal: '3"', id: 78, od: 88.9, schedule: 40 },
  { nominal: '4"', id: 102, od: 114.3, schedule: 40 },
  { nominal: '5"', id: 127, od: 141.3, schedule: 40 },
  { nominal: '6"', id: 154, od: 168.3, schedule: 40 },
  { nominal: '8"', id: 203, od: 219.1, schedule: 40 },
  { nominal: '10"', id: 254, od: 273.1, schedule: 40 },
  { nominal: '12"', id: 305, od: 323.9, schedule: 40 },
]

/** Smallest standard size whose velocity stays within the limit. */
export function recommendPipeSize(flowLpm: number, maxVelocity: number): PipeSize {
  assertPositive(flowLpm, 'flow rate')
  assertRange(maxVelocity, 'max velocity', 0.1, 15)
  for (const pipe of PIPE_SIZES) {
    if (velocityMs(flowLpm, pipe.id) <= maxVelocity) return pipe
  }
  return PIPE_SIZES[PIPE_SIZES.length - 1]
}

export function recommendPipeSizeFromBasis(flowLpm: number, basis: DesignBasis): PipeSize {
  const v = basisNumber(basis, K.hwMaxVelocity) ?? HYDRAULICS.maxVelocityMs
  return recommendPipeSize(flowLpm, v)
}

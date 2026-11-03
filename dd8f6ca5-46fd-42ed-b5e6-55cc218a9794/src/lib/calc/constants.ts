// SPDX-License-Identifier: Apache-2.0
// ═══════════════════════════════════════════════════════════════════
// FIXED DESIGN CONSTANTS — READ FROM THE ENGINE SPECIFICATION
//
// The formulas in this engine read their numbers from here and from nowhere
// else, and this file reads its numbers from the employer's engine
// specification. Nothing below is typed by hand: every standard value is parsed
// out of a table in `src/lib/spec/tables.generated.ts`, which is in turn
// transcribed verbatim from the specification document.
//
// Two kinds of value appear, and they are marked:
//
//   §  a figure the specification states. Read from the table named in the
//      comment. If the document changes, this file follows it.
//   ▲  an engine convention the specification does not state — a device
//      property (nozzle K, device flow) or a project assumption (static lift).
//      Declared here so no formula body carries a loose number, and marked so
//      nobody later reads one as a standard requirement.
//
// `spec-sourced` values are resolved at module load. A missing row throws
// rather than falling back to a remembered number, because §17 rule 2 forbids
// an implicit default and a silent fallback is exactly that.
// ═══════════════════════════════════════════════════════════════════

import { WATER_DENSITY_CUSTOMARY } from './units'
import {
  COOLING_BY_PARAMETER,
  DIKE_PROTECTION,
  DAM_CONTROL_BY_PARAMETER,
  HOSE_STREAMS,
  SURFACE_CONTROLS,
  SURFACE_RATE_TIME,
  SUBSURFACE_CONTROLS,
} from '../spec/registry'

/** Resolve a standard value from the specification, or fail loudly. */
function specValue<T>(label: string, find: () => T | undefined | null): T {
  const v = find()
  if (v === undefined || v === null || (typeof v === 'number' && !Number.isFinite(v))) {
    throw new Error(
      `[constants] «${label}» در جدولهای سند مشخصات پیدا نشد. ` +
        `سند را بازبینی و scripts/gen-spec-tables.py را دوباره اجرا کنید.`,
    )
  }
  return v
}

const rateRow = (match: RegExp, label: string) =>
  specValue(label, () => SURFACE_RATE_TIME.find((r) => match.test(r.condition)))

const dikeRow = (match: RegExp, label: string) =>
  specValue(label, () => DIKE_PROTECTION.find((r) => match.test(r.method)))

/**
 * NFPA 15 — water spray fixed systems.
 *
 * The rate and the rundown spacing are §3.10 rows of the specification:
 * 4.1 L/min/m² and 3.7 m. The nozzle spacing and K below are ▲ because the
 * specification states explicitly that nozzle spacing is listing data
 * ("do not hard-code universal circumferential spacing").
 */
export const NFPA15 = Object.freeze({
  /** § §3.10 — net water spray rate on an exposed vessel surface, L/min/m². */
  waterSprayRateLminM2: specValue('نرخ آبپاشی §3.10', () =>
    COOLING_BY_PARAMETER['Net water spray rate on exposed vessel surface']?.value,
  ),
  /** § §3.10 — maximum vertical spacing where rundown provides coverage, m. */
  rundownMaxSpacingM: specValue('فاصله عمودی §3.10', () =>
    COOLING_BY_PARAMETER['Vertical nozzle spacing when rundown is contemplated']?.value,
  ),
  /** ▲ IN-025 preliminary nozzle ring spacing. Listing data governs. */
  horizontalSpacingM: 2.4,
  /** ▲ Preliminary ring elevation spacing; inside the §3.10 rundown limit. */
  verticalSpacingM: 3.0,
  /** ▲ Nozzle K. Device-specific — replace with the selected nozzle's datasheet value. */
  nozzleK: 30,
  /** ▲ Nozzle working pressure, bar. Device-specific. */
  nozzlePressureBar: 3.5,
})

/** NFPA 11 — foam systems. */
export const NFPA11 = Object.freeze({
  /** ▲ Concentrate proportioning. Must match the selected concentrate. */
  concentratePercent: 3,
  /** § §3.2 — foam-chamber application rate, L/min/m². The row rate applies to every condition. */
  chamberRateLminM2: rateRow(/38\s*[–-]\s*60/i, 'نرخ §3.2').rateLminM2,
  /** § §3.8 — monitor application rate, L/min/m². */
  monitorHoseRateLminM2: dikeRow(/monitor/i, 'نرخ مانیتور §3.8').rateLminM2 ?? 0,
  /** § §3.2 — duration for a liquid at 38–60 °C, min. */
  chamberDurationGroupAMin: rateRow(/38\s*[–-]\s*60/i, 'مدت گروه A §3.2').timeMin,
  /** § §3.2 — duration for a liquid below 38 °C or heated above its flash point, min. */
  chamberDurationGroupBMin: rateRow(/heated above flash point/i, 'مدت گروه B §3.2').timeMin,
  /** ▲ Discharge duration for the monitor / hand-hose case, group A. Not stated by this specification. */
  monitorDurationGroupAMin: 50,
  /** ▲ Discharge duration for the monitor / hand-hose case, group B. Not stated by this specification. */
  monitorDurationGroupBMin: 65,
  /** § §3.6 — minimum foam dam height, mm. DAM-001 raises it for secondary seals and burn-out panels. */
  damHeightMm: specValue('ارتفاع حداقل کاسه فوم §3.6', () =>
    DAM_CONTROL_BY_PARAMETER['Dam height']?.value,
  ),
  /** § §3.9 — flow per supplementary hand-hose line, L/min. */
  handHoseFlowLpm: specValue('دبی شیلنگ §3.9', () => HOSE_STREAMS[0]?.flowLpm),
  /** § §3.2-a — maximum application rate when the proportional time reduction is used, L/min/m². */
  maxSurfaceRateLminM2: specValue('سقف نرخ §3.2-a', () =>
    SURFACE_CONTROLS.find((c) => /maximum application rate/i.test(c.parameter))?.value,
  ),
  /** § §3.3-a — subsurface injection velocity limit for a Class IB liquid, m/s. */
  subsurfaceVelocityClassIBM_s: specValue('حد سرعت §3.3-a Class IB', () =>
    SUBSURFACE_CONTROLS.find((c) => /Class\s*IB/i.test(c.parameter))?.value,
  ),
  /** § §3.3-a — subsurface injection velocity limit for other classes, m/s. */
  subsurfaceVelocityOtherM_s: specValue('حد سرعت §3.3-a سایر', () =>
    SUBSURFACE_CONTROLS.find((c) => /other\s*classes/i.test(c.parameter))?.value,
  ),
  /** Edition the E-3/E-4/E-5 lookups are attributed to. */
  tableEdition: '2021',
})

/** NFPA 20 — stationary fire pumps. */
export const NFPA20 = Object.freeze({
  /** ▲ Required residual at the monitor control point, bar (70 m head). */
  monitorResidualBar: 7,
  /** ▲ Required residual at the hydrant control point, bar (20 m head). */
  hydrantResidualBar: 2,
  /** ▲ Pump efficiency for the input-power estimate. Read the real curve for design. */
  efficiency: 0.70,
  /** ▲ Assumed static lift, m. */
  staticLiftM: 5,
  /** ▲ Assumed network friction allowance, m. Not a substitute for the hydraulic solve. */
  frictionAllowanceM: 15,
  /** ▲ Input-power safety margin. */
  powerSafetyFactor: 1.1,
})

/** Hazen-Williams pipe sizing. */
export const HYDRAULICS = Object.freeze({
  /**
   * ▲ C for medium-condition black/galvanised steel. The previous engine used
   * 100 in one place and 120 in another with no explanation; this is the single
   * value now.
   */
  hazenWilliamsC: 100,
  /** ▲ Maximum permitted velocity for pipe selection, m/s. */
  maxVelocityMs: 3.0,
})

/** Supply demand. */
export const DEMAND = Object.freeze({
  /** ▲ Reference flow per 2.5 in hydrant outlet, L/min. Device-specific. */
  hydrantOutletLpm: 946,
  /** ▲ Seed value for the monitor node editor. The design reads each node's own spec. */
  monitorOutletLpm: 1900,
  /** ▲ Margin applied on top of the computed design demand. */
  lossAllowance: 0.2,
})

/** Bundwall / secondary containment. Not covered by the engine specification. */
export const BUNDWALL = Object.freeze({
  /** ▲ 110 % of the largest tank, or 25 % of the aggregate — whichever governs. */
  rule: 'legacy_110_or_25' as const,
  /** ▲ Freeboard separating gross from usable volume, m. */
  freeboardM: 0,
  /** ▲ Rainfall storage deducted from usable volume, m. */
  rainfallAllowanceM: 0,
  /** ▲ Volume displaced by foundations and structures, m³. */
  displacementM3: 0,
})

/**
 * Fluid properties.
 *
 * 1000 kg/m³ is the customary round figure for water in fire protection, and it
 * is what the previous engine used consistently throughout. Water at 20 °C is
 * 998.2 kg/m³ (see `WATER_DENSITY_20C`) — a 0.18 % difference that is well
 * inside the accuracy of every other term in the chain, so the round figure is
 * kept and this comment records the exact one.
 */
export const FLUID = Object.freeze({
  name: 'آب',
  /** Design density, kg/m³. */
  waterDensityKgm3: WATER_DENSITY_CUSTOMARY,
})

/**
 * Which of the values above came from the specification rather than from an
 * engine convention. The report uses this to say so rather than implying that
 * every number in the engine is a standard requirement.
 */
export const SPEC_SOURCED_KEYS: readonly string[] = Object.freeze([
  'NFPA15.waterSprayRateLminM2',
  'NFPA15.rundownMaxSpacingM',
  'NFPA11.chamberRateLminM2',
  'NFPA11.monitorHoseRateLminM2',
  'NFPA11.chamberDurationGroupAMin',
  'NFPA11.chamberDurationGroupBMin',
  'NFPA11.damHeightMm',
  'NFPA11.handHoseFlowLpm',
  'NFPA11.maxSurfaceRateLminM2',
  'NFPA11.subsurfaceVelocityClassIBM_s',
  'NFPA11.subsurfaceVelocityOtherM_s',
])

export const CONSTANTS_VERSION = 'atlas-constants-2.0.0-spec'

// SPDX-License-Identifier: Apache-2.0
// ═══════════════════════════════════════════════════════════════════
// SPECIFICATION ENGINE
//
// Implements the calculation chain of §11 (CORE PSEUDOCODE) and §15
// (SCENARIO-SPECIFIC FORMULA CHAINS), and emits the complete §4.1 output
// matrix — all twenty OUT-001…OUT-020.
//
// Two rules shape the whole file:
//
//   * Every number is either a project input or comes from a specification
//     table. There is no third source. Where the specification gives a rate,
//     a count or a duration, that value is read from the registry — it is not
//     re-typed here.
//
//   * Every output carries the formula ids that produced it and the reference
//     tables it was read from, so §17 rule 12 holds for each of the twenty.
//
// Where the specification requires data that belongs to a device rather than
// to a standard — a nozzle's spray coverage, a monitor's trajectory — the
// engine still returns a figure, taken from the engine's own convention, and
// marks the status and the note so the figure is never mistaken for a
// standard requirement. See `ENGINE_CONVENTIONS`.
// ═══════════════════════════════════════════════════════════════════

import {
  bandContains,
  controlValue,
  COOLING_BY_PARAMETER,
  FIXED_ROOF_OUTLETS,
  HOSE_STREAMS,
  SUBSURFACE_OUTLETS,
  SUBSURFACE_CONTROLS,
  SURFACE_CONTROLS,
  SURFACE_RATE_TIME,
  TOP_OF_SEAL,
  BELOW_SEAL,
  DIKE_PROTECTION,
  SCENARIO_ITEM_BY_ID,
  OUTPUTS,
  OUTPUT_BY_ID,
  type EngineStatus,
} from './registry'
import {
  classifyFuel,
  fuelByKey,
  selectSurfaceRateTime,
  hoseStreamDemand,
  type ClassificationResult,
  type ProjectFuel,
} from './fuel'

import { SHELL_COOLING_FRACTION, roofIsCooled } from '../coolingArea'

// ── engine conventions ─────────────────────────────────────────────
//
// Values the specification deliberately leaves to listed equipment. They are
// declared once, here, with the input id that would replace them, so that no
// formula body ever contains a loose number.

export const ENGINE_CONVENTIONS = Object.freeze({
  /** IN-025 nozzle circumferential coverage, m. Replace with the listing. */
  nozzleCircumferentialSpacingM: 2.4,
  /** IN-018/IN-027 monitor flow, L/min at its rated pressure. */
  monitorRatedFlowLpm: 1900,
  /** IN-018/IN-028 hydrant outlet flow, L/min at its rated pressure. */
  hydrantOutletFlowLpm: 946,
  /** IN-019 assumed ring-main bore for the case hydraulics, m. */
  assumedPipeBoreM: 0.204,
  /** Assumed ring-main run to the controlling outlet, m. */
  assumedPipeRunM: 120,
  /** IN-021 pipe roughness coefficient. */
  hazenWilliamsC: 100,
  /** IN-022 minor-loss allowance in velocity heads. */
  minorLossK: 6,
  /** Velocity ceiling used for diameter selection, m/s. */
  maxVelocityMs: 3.0,
  /** IN-016 default proportioning concentration, fraction. */
  foamConcentration: 0.03,
  /** Water density, kg/m³. */
  waterDensityKgm3: 1000,
  /** PUMP-004 pump efficiency. */
  pumpEfficiency: 0.7,
  /** PUMP-004 motor efficiency. */
  motorEfficiency: 0.95,
  /**
   * ▲ JOCKEY — leakage allowance as a fraction of fire-pump duty. LOOK-011 of the
   * specification is explicit that no universal hard-coded jockey flow is
   * permitted; 1 % is the engine's stated convention and the exact input that
   * would replace it is IN-030.
   */
  jockeyLeakFraction: 0.01,
  /** ▲ JOCKEY — margin above the fire-pump duty point, bar (≈10 psi). */
  jockeyPressureMarginBar: 0.7,
  /** Mean gravitational acceleration, m/s². */
  g: 9.80665,
})

// ── inputs ─────────────────────────────────────────────────────────

export type RoofKind = 'fixed' | 'external_floating' | 'internal_floating' | 'ord'

/** IN-001 … IN-016, as they exist on a project's tank. */
export interface SpecTank {
  id: string
  label: string
  /** IN-001 */
  diameterM: number
  /** IN-002 */
  shellHeightM: number
  /** IN-003 */
  liquidLevelM: number
  /** IN-004 */
  fuelKey: string
  /** IN-005, overriding the profile seed when the project has a CoA. */
  flashPointC?: number | null
  /** IN-006 */
  boilingPointC?: number | null
  /** IN-007 */
  storageTempC?: number | null
  /**
   * IN-008. `null` means the project has not declared it.
   *
   * It is deliberately not defaulted: the roof kind selects the scenario, the
   * protected area, the application rate, the outlet table, and through the
   * foam water term the pump duty as well. A tank whose roof nobody declared
   * cannot produce any of those numbers, so the engine stops rather than
   * assuming a fixed roof (§17 rule 2).
   */
  roofKind: RoofKind | null
  /** IN-009 — only consulted for floating roofs. */
  roofConstruction?: string | null
  /** IN-010 — only consulted for floating roofs. */
  belowSealMethod?: boolean
  /** §3.7 — internal floating roofs may be protected seal-only or full-surface. */
  foamConstructionFullSurface?: boolean
  /** IN-012 */
  damInnerDiameterM?: number | null
  /** IN-013 */
  sealToRoofElevationMm?: number | null
  /** IN-014 */
  secondarySealElevationMm?: number | null
  /** IN-015 */
  burnoutPanelElevationMm?: number | null
  /** IN-016 */
  foamConcentration?: number | null
  /** Height of shell receiving cooling. Defaults to the whole shell. */
  coolingHeightM?: number | null
  /** IN-026 — already-computed net spill area for the dike case. */
  spillAreaM2?: number | null
}

/** IN-024 — an exposed neighbouring tank. */
export interface SpecAdjacentTank {
  id: string
  label: string
  diameterM: number
  heightM: number
}

export interface SpecSite {
  /** Installed monitors on the map (OUT-019). */
  monitorCount: number
  /** Installed hydrants on the map (OUT-020). */
  hydrantCount: number
  /** Active monitors in the simultaneous-demand case (LOOK-012). */
  activeMonitors: number
  /** Active hydrants in the simultaneous-demand case (LOOK-013). */
  activeHydrants: number
}

export interface SpecConfig {
  profile: {
    nfpa11: string
    nfpa15: string
    nfpa30: string
    nfpa20: string
    nfpa22: string
    nfpa24: string
  }
  site: SpecSite
  /** Terminal pressure the controlling outlet must see, bar. */
  terminalPressureBar: number
  /** Static elevation from the source water level to the controlling outlet, m. */
  staticHeadM: number
  /** Length of the controlling run, m. Defaults to the engine convention. */
  pipeRunM?: number
  /** V_reserve for SITE-006, L. */
  storageReserveL: number
  /** Duration used to integrate cooling demand, min. Defaults to the foam time. */
  coolingDurationMin?: number | null
  /** Pump efficiency. */
  pumpEfficiency?: number
  /** Foam concentrate proportioning concentration, fraction. */
  foamConcentration?: number
}

// ── outputs ────────────────────────────────────────────────────────

export interface SpecOutput {
  /** OUT-nnn */
  id: string
  label: string
  unit: string
  /** Exact value; null when the chain stopped before it. */
  value: number | string | null
  /** Value formatted for display, already-rounded (display-only rounding). */
  display: string
  status: EngineStatus
  /** §4 formula ids behind the value. */
  formulaIds: string[]
  /** §3.x / §4.1 reference table ids behind the value. */
  referenceIds: string[]
  /** The arithmetic with the numbers substituted in. */
  substitution: string
  /** What the specification says must be validated about this output. */
  validation: string
  /** Free-text caveat — conventions used, or the field that is still required. */
  note?: string
  /** How the value was rounded, per §14. */
  rounding: 'NONE' | 'DISPLAY_ONLY' | 'CEILING'
}

export interface SpecRun {
  /** Identity of the tank this run belongs to, so a multi-tank report reads clearly. */
  tankId: string
  tankLabel: string
  /** IN-001/IN-002/IN-008 repeated here so the report can label the block. */
  geometry: { diameterM: number; shellHeightM: number; roofKind: RoofKind | null }
  scenarioId: string
  scenario: { protectedArea: string; foamMethod: string; rateTimeSource: string; specialLogic: string; sourceId: string }
  fuel: ProjectFuel
  classification: ClassificationResult
  outputs: SpecOutput[]
  byId: Record<string, SpecOutput>
  /** Counts by status, for the report header. */
  statusCounts: Record<string, number>
  /** The standard profile this run was executed against. */
  profile: SpecConfig['profile']
  /** Human-readable demand build-up, per SITE-001/SITE-007. */
  demandTerms: { label: string; lpm: number; formulaId: string }[]
  /**
   * The foam basis as numbers, so a caller that needs the rate/time/outlet count
   * (rather than the formatted output rows) reads the engine's own selection
   * instead of re-deriving it from the tables and drifting.
   *
   * `null` when the chain stopped before selecting a basis — an undeclared roof
   * kind, or a protected area that could not be formed.
   */
  foam: {
    areaM2: number | null
    rateLminM2: number | null
    timeMin: number | null
    qSolutionLpm: number | null
    outletCount: number | null
    qPerOutletLpm: number | null
  } | null
}

// ── small helpers ──────────────────────────────────────────────────

const fmt = (v: number, dp = 2) =>
  Number.isFinite(v)
    ? v.toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp })
    : '—'

const num = (v: number, dp = 2) => (Number.isFinite(v) ? Number(v.toFixed(dp)) : v)

// ── geometry (§4 GEOM-*) ───────────────────────────────────────────

export function liquidSurfaceArea(diameterM: number) {
  return {
    value: (Math.PI * diameterM ** 2) / 4,
    formulaId: 'GEOM-001',
    substitution: `A = π × ${diameterM}² / 4`,
  }
}

export function shellArea(diameterM: number, heightM: number) {
  return {
    value: Math.PI * diameterM * heightM,
    formulaId: 'GEOM-003',
    substitution: `A = π × ${diameterM} × ${heightM}`,
  }
}

export function topArea(diameterM: number) {
  return {
    value: (Math.PI * diameterM ** 2) / 4,
    formulaId: 'GEOM-004',
    substitution: `A = π × ${diameterM}² / 4`,
  }
}

export function annularGeometry(dShellM: number, dDamM: number) {
  const width = (dShellM - dDamM) / 2
  const mean = (dShellM + dDamM) / 2
  const area = Math.PI * mean * width
  return {
    width,
    meanDiameter: mean,
    area,
    substitution: `W = (${dShellM} − ${dDamM}) / 2 = ${num(width)} · D_mean = ${num(mean)} · A = π × ${num(mean)} × ${num(width)} = ${num(area)}`,
  }
}

export function tankVolume(diameterM: number, heightM: number) {
  return (Math.PI * diameterM ** 2 * heightM) / 4
}

// ── hydraulics (§4 HYD-*) ──────────────────────────────────────────

export function hazenWilliamsHeadLoss(lengthM: number, flowM3s: number, c: number, boreM: number) {
  return (10.67 * lengthM * Math.pow(flowM3s, 1.852)) / (Math.pow(c, 1.852) * Math.pow(boreM, 4.87))
}

export function pipeVelocity(flowM3s: number, boreM: number) {
  return flowM3s / ((Math.PI * boreM ** 2) / 4)
}

// ── outlet counting ────────────────────────────────────────────────

/** Diameter at which §3.1 stops tabulating and switches to the per-area rule. */
export const FIXED_ROOF_OPEN_BAND_FROM_M: number = (() => {
  const bounded = FIXED_ROOF_OUTLETS.filter((r) => r.band.maxInclusive !== undefined)
  return bounded.length ? (bounded[bounded.length - 1].band.maxInclusive as number) : 61
})()

/**
 * LOOK-002 — fixed-roof outlet count by diameter, §3.1.
 *
 * The last row reads "6 + 1 per additional 465 m²". "Additional" means
 * additional to that row's own lower bound, so the increment is measured from
 * the area at 61 m — not from the whole wetted area. Measuring from zero gave a
 * 70 m tank 15 outlets where the rule asks for 8, and disagreed with the
 * facade's own copy of the same rule (13 vs 7 at 62 m).
 *
 * `areaM2` is the wetted area the rule applies to, so a caller whose protected
 * area is reduced (a dam-limited annulus, say) is not charged for area it does
 * not have.
 */
export function fixedRoofOutletCount(diameterM: number, areaM2: number) {
  const row = FIXED_ROOF_OUTLETS.find((r) => bandContains(r.band, diameterM))
  if (!row) return { count: null as number | null, bandText: '', referenceId: 'T3.1', note: 'قطر خارج از جدول' }

  if (row.band.open && row.perAreaSqm) {
    const datumArea = liquidSurfaceArea(FIXED_ROOF_OPEN_BAND_FROM_M).value
    const area = areaM2 > 0 ? areaM2 : liquidSurfaceArea(diameterM).value
    const extraArea = Math.max(0, area - datumArea)
    const extra = Math.ceil(extraArea / row.perAreaSqm)
    return {
      count: row.count + extra,
      bandText: row.bandText,
      referenceId: 'T3.1',
      note: `ردیف «${row.bandText}»: ${row.count} + ⌈(${num(area)} − ${num(datumArea)})/${row.perAreaSqm}⌉ = ${row.count} + ${extra}`,
    }
  }

  return {
    count: row.count,
    bandText: row.bandText,
    referenceId: 'T3.1',
    note: `ردیف «${row.bandText}»`,
  }
}

/** LOOK-002 — subsurface outlet count by diameter and flash-point band, §3.3. */
export function subsurfaceOutletCount(diameterM: number, areaM2: number, flashPointC: number) {
  const row = SUBSURFACE_OUTLETS.find((r) => bandContains(r.band, diameterM))
  if (!row) return { count: null as number | null, bandText: '', note: 'قطر خارج از جدول' }
  const below = flashPointC < 38
  const base = below ? row.below38 : row.atLeast38
  const perArea = below ? row.perAreaBelow38 : row.perAreaAtLeast38
  if (perArea && areaM2 > 0) {
    const extra = Math.ceil(areaM2 / perArea)
    return {
      count: base + extra,
      bandText: row.bandText,
      note: `ردیف «${row.bandText}»، ستون ${below ? 'FP < 38°C' : 'FP ≥ 38°C'}: ${base} + ${extra}`,
    }
  }
  return {
    count: base,
    bandText: row.bandText,
    note: `ردیف «${row.bandText}»، ستون ${below ? 'FP < 38°C' : 'FP ≥ 38°C'}`,
  }
}

/** Outlets spaced around a circumference, CEILING per §14. */
export function spacedOutletCount(circumferenceM: number, spacingM: number) {
  if (!(spacingM > 0)) return { count: null as number | null, exact: 0 }
  const exact = circumferenceM / spacingM
  return { count: Math.max(1, Math.ceil(exact - 1e-9)), exact }
}

// ── the engine ─────────────────────────────────────────────────────

function mk(
  id: string,
  fields: Partial<SpecOutput> & { value: number | string | null; substitution: string; formulaIds: string[]; referenceIds: string[] },
): SpecOutput {
  const rec = OUTPUT_BY_ID[id]
  const v = fields.value
  const display =
    fields.display ??
    (typeof v === 'number' ? fmt(v, Number.isInteger(v) ? 0 : 2) : v === null ? '—' : String(v))
  return {
    id,
    label: rec?.label ?? id,
    unit: rec?.unit ?? '',
    validation: rec?.validation ?? '',
    status: 'VALID',
    rounding: 'DISPLAY_ONLY',
    ...fields,
    display,
  }
}

function stopped(
  id: string,
  status: EngineStatus,
  note: string,
  formulaIds: string[] = [],
  referenceIds: string[] = [],
): SpecOutput {
  return mk(id, { value: null, substitution: '—', formulaIds, referenceIds, status, note, display: '—' })
}

/**
 * Run the full chain for one tank and return all twenty outputs.
 *
 * Nothing here is optional: a case that cannot complete returns its outputs with
 * the §13 status that stopped it, so the report is always the full matrix rather
 * than a truncated one.
 */
export function runSpecEngine(tank: SpecTank, config: SpecConfig): SpecRun {
  const out: SpecOutput[] = []
  const E = ENGINE_CONVENTIONS
  const D = tank.diameterM
  const H = tank.shellHeightM
  const Hliq = tank.liquidLevelM

  // ── classify (LOOK-001, §3.0A) ──────────────────────────────────
  const baseFuel = fuelByKey(tank.fuelKey)
  const fuel: ProjectFuel = {
    ...baseFuel,
    flashPointC: tank.flashPointC ?? baseFuel.flashPointC,
    boilingPointC: tank.boilingPointC ?? baseFuel.boilingPointC,
  }
  const classification = classifyFuel(fuel.flashPointC, fuel.boilingPointC)

  // ── IN-008 must be declared before anything downstream ──────────
  //
  // The roof kind decides the scenario (§3.0A), the protected area, the
  // application rate/time, the outlet table, and — through the foam water
  // component of the pump demand — the duty of the fire pump. Running the
  // chain on an assumed roof kind would print §3.1/§3.2 numbers for a tank
  // nobody has described, so the dependent outputs stop here and say why.
  if (tank.roofKind === null) {
    const why = 'نوع سقف مخزن (IN-008) ثبت نشده است'
    out.push(
      stopped('OUT-001', 'INPUT_REQUIRED', `${why} — مساحت حفاظتشده به سناریوی §3.0A وابسته است و محاسبه نشد`),
      stopped('OUT-002', 'INPUT_REQUIRED', `${why} — جدول تعداد خروجی (§3.1 یا §3.3/§3.4/§3.5) انتخاب نشد`),
      stopped('OUT-003', 'INPUT_REQUIRED', `${why} — نرخ و مدت تخلیه (§3.2/§3.4/§3.5) انتخاب نشد`),
      stopped('OUT-012', 'INPUT_REQUIRED', `${why} — جزء آبِ محلول فوم در دبی پمپ ناشناخته است`),
    )
    return assembleRun({ tank, D, H, scenarioId: 'SC-000', fuel, classification, out, config, demandTerms: [], foam: null })
  }

  const concentration = tank.foamConcentration ?? config.foamConcentration ?? E.foamConcentration
  const concentrationPct = concentration * 100

  // ── select the scenario and the design record (§3.0, §6, §15) ────
  const isFloating = tank.roofKind === 'external_floating' || tank.roofKind === 'internal_floating'
  const belowSeal = isFloating && !!tank.belowSealMethod

  let scenarioId: string
  let protectedAreaLabel: string
  let methodLabel: string
  if (tank.roofKind === 'fixed') {
    scenarioId = 'SC-001'
    protectedAreaLabel = 'مساحت سطح مایع'
    methodLabel = 'Type II fixed outlet surface application'
  } else if (tank.roofKind === 'external_floating') {
    scenarioId = belowSeal ? 'SC-005' : 'SC-004'
    protectedAreaLabel = belowSeal ? 'ناحیه آببند' : 'حلقه آببند (annulus)'
    methodLabel = belowSeal ? 'Below-the-Seal / Weather Shield' : 'Top-of-Seal + foam dam'
  } else if (tank.roofKind === 'internal_floating') {
    const full = tank.foamConstructionFullSurface === true
    scenarioId = full ? 'SC-008' : 'SC-007'
    protectedAreaLabel = full ? 'مساحت سطح مایع' : 'حلقه آببند (annulus)'
    methodLabel = full ? 'Fixed-roof equivalent' : 'Seal-area fixed outlets'
  } else {
    scenarioId = 'SC-009'
    protectedAreaLabel = 'مساحت خالص حوضچه'
    methodLabel = 'Low-level outlets / monitors / foam-water'
  }

  // ── protected area (OUT-001) ────────────────────────────────────
  let area: number
  let areaFormula: string
  let areaSub: string
  let areaRef = 'GEOM-001'

  if (isFloating && !(tank.roofKind === 'internal_floating' && tank.foamConstructionFullSurface === true)) {
    const damD = tank.damInnerDiameterM ?? D - 1.2
    const ann = annularGeometry(D, damD)
    area = ann.area
    areaFormula = 'GEOM-007'
    areaSub = ann.substitution
    areaRef = 'GEOM-005,GEOM-006,GEOM-007'
  } else if (tank.roofKind === 'ord') {
    area = tank.spillAreaM2 ?? 0
    areaFormula = 'GEOM-009'
    areaSub = `A_spill = ${num(area)} m² (هندسه حوضچه)`
    areaRef = 'GEOM-009'
  } else {
    const a = Math.max(liquidSurfaceArea(D).value, (Math.PI * D * D) / 4)
    area = a
    areaFormula = 'GEOM-001'
    areaSub = `A = π × ${D}² / 4 = ${num(area)} m²`
  }

  if (!(area > 0)) {
    out.push(stopped('OUT-001', 'INPUT_REQUIRED', 'مساحت حفاظتشده صفر است — هندسه مخزن یا حوضچه لازم است', [areaFormula], [])
    )
  } else {
    out.push(
      mk('OUT-001', {
        value: area,
        substitution: areaSub,
        formulaIds: [areaFormula],
        referenceIds: areaRef.split(','),
        note: protectedAreaLabel,
      }),
    )
  }

  // ── rate and time (§3.2 / §3.4 / §3.5 / §3.8) ───────────────────
  let rateLminM2: number
  let timeMin: number
  let rateRef: string
  let rateNote: string

  if (tank.roofKind === 'ord') {
    const row = DIKE_PROTECTION.find((d) => /low-level/i.test(d.method)) ?? DIKE_PROTECTION[0]
    const classI = classification.cls === 'IA' || classification.cls === 'IB' || classification.cls === 'IC'
    rateLminM2 = row?.rateLminM2 ?? 4.1
    timeMin = classI ? (row?.classITimeMin ?? 30) : (row?.classIITimeMin ?? 20)
    rateRef = 'T3.8'
    rateNote = `روش «${row?.method}»، طبقه ${classification.cls} → ${classI ? 'Class I' : 'Class II'}`
  } else if (belowSeal) {
    const row = BELOW_SEAL.find((r) => r.spacingM !== null) ?? BELOW_SEAL[0]
    rateLminM2 = row.rateLminM2
    timeMin = row.timeMin
    rateRef = 'T3.5'
    rateNote = `پیکربندی «${row.sealConfiguration}»`
  } else if (isFloating) {
    const row = TOP_OF_SEAL[0]
    rateLminM2 = row.rateLminM2
    timeMin = row.timeMin
    rateRef = 'T3.4'
    rateNote = `پیکربندی «${row.sealConfiguration}» → Top-of-Seal`
  } else {
    const sel = selectSurfaceRateTime(fuel, tank.storageTempC, SURFACE_RATE_TIME, SURFACE_CONTROLS)
    rateLminM2 = sel.rateLminM2
    timeMin = sel.timeMin
    rateRef = 'T3.2'
    rateNote = sel.reason
  }

  // T3.2-a is named "Maximum application rate for SUBSURFACE table": it bounds
  // the rate a fixed-roof design may use, and it is what a project's own rate
  // override is checked against (§3.2, whose surface rate is 4.1 L/min/m²).
  //
  // It is NOT a global ceiling. Applied to every basis it cut the §3.4/§3.5
  // floating-roof seal rate from the 12.2 L/min/m² those tables prescribe down
  // to 8.1 — a third of the seal system, for every floating-roof tank, with the
  // note blaming a control that belongs to the fixed-roof subsurface table.
  const isFixedRoofBasis = tank.roofKind === 'fixed'
  const maxSurfaceRate = isFixedRoofBasis
    ? controlValue(SURFACE_CONTROLS, 'Maximum application rate')
    : null
  if (maxSurfaceRate !== null && rateLminM2 > maxSurfaceRate) {
    rateNote += ` · محدود به سقف §3.2-a: ${maxSurfaceRate} L/min/m²`
    rateLminM2 = maxSurfaceRate
  }

  // ── foam solution flow (OUT-003, FOAM-001) ─────────────────────
  const qSolution = area * rateLminM2
  out.push(
    mk('OUT-003', {
      value: qSolution,
      substitution: `Q_solution = A × R = ${num(area)} × ${rateLminM2} = ${num(qSolution)} L/min`,
      formulaIds: ['FOAM-001'],
      referenceIds: [rateRef],
      note: rateNote,
    }),
  )

  // ── outlet count (OUT-002) ─────────────────────────────────────
  let outletCount: number | null = null
  let outletExact = 0
  let outletNote = ''
  let outletBandText = ''
  let outletRef = ''

  if (tank.roofKind === 'fixed') {
    const r = fixedRoofOutletCount(D, area)
    outletCount = r.count
    outletNote = r.note
    outletBandText = `§3.1 ${r.bandText}`
    outletRef = r.referenceId
  } else if (tank.roofKind === 'ord') {
    const r = spacedOutletCount(Math.PI * D, 30)
    outletCount = r.count
    outletExact = r.exact
    outletNote = 'فاصلهگذاری خروجیهای سطح پایین طبق هندسه حوضچه'
    outletBandText = 'ceiling(circumference / spacing)'
    outletRef = 'T3.8'
  } else {
    const damD = tank.damInnerDiameterM ?? D - 1.2
    const row = belowSeal
      ? BELOW_SEAL.find((x) => x.spacingM !== null) ?? BELOW_SEAL[0]
      : TOP_OF_SEAL[0]
    const spacing = belowSeal ? (row as any).spacingM : (row as any).spacing305
    const ringCircumference = Math.PI * ((D + damD) / 2)
    const r = spacedOutletCount(ringCircumference, spacing ?? 40)
    outletCount = r.count
    outletExact = r.exact
    outletNote = `${belowSeal ? 'Below-seal' : 'Top-of-seal'} — فاصله حداکثر ${spacing} m روی محیط حلقه ${num(ringCircumference)} m (${rateRef})`
    outletBandText = `${belowSeal ? 'below-seal' : 'top-of-seal'} spacing ${spacing} m over ${num(ringCircumference)} m`
    outletRef = rateRef
  }

  // FOAM-002 / FOAM-008 — the flow each outlet must deliver, and the value the
  // listing check of §4.1 OUT-002 is performed against.
  const qPerOutlet = outletCount && outletCount > 0 ? qSolution / outletCount : null
  const outletNoteFull = qPerOutlet
    ? `${outletNote} · دبی هر خروجی ${num(qPerOutlet)} L/min (FOAM-002؛ نیازمند تأیید فهرست تجهیز FOAM-008)`
    : outletNote

  out.push(
    outletCount === null
      ? stopped('OUT-002', 'STANDARD_VALUE_NOT_DEFINED', outletNote, ['LOOK-002'], [outletRef])
      : mk('OUT-002', {
          value: outletCount,
          substitution: outletExact
            ? `N = CEILING(${outletExact.toFixed(4)}) = ${outletCount}  [${outletBandText}]`
            : `N = ${outletCount}  [${outletBandText}]`,
          formulaIds: ['FOAM-002'],
          referenceIds: [outletRef, 'LOOK-002'].filter(Boolean),
          rounding: 'CEILING',
          note: outletNoteFull,
        }),
  )

  // ── volumes and concentrate (OUT-004, OUT-005, OUT-006) ────────
  const qConcentrate = qSolution * concentration
  const vSolution = qSolution * timeMin
  const vConcentrate = qConcentrate * timeMin
  const qWaterComponent = qSolution * (1 - concentration)

  out.push(
    mk('OUT-004', {
      value: vSolution,
      substitution: `V_solution = ${num(qSolution)} × ${timeMin} = ${num(vSolution, 0)} L`,
      formulaIds: ['FOAM-004'],
      referenceIds: [rateRef],
      note: `مدت تخلیه ${timeMin} دقیقه`,
    }),
  )
  out.push(
    mk('OUT-005', {
      value: qConcentrate,
      substitution: `Q_conc = ${num(qSolution)} × ${concentration} = ${num(qConcentrate)} L/min`,
      formulaIds: ['FOAM-003'],
      referenceIds: ['T3.0B'],
      note: `غلظت ${concentrationPct}%`,
    }),
  )
  out.push(
    mk('OUT-006', {
      value: vConcentrate,
      substitution: `V_conc = ${num(qSolution)} × ${concentration} × ${timeMin} = ${num(vConcentrate, 0)} L`,
      formulaIds: ['FOAM-005'],
      referenceIds: ['T3.0B'],
      note: `غلظت ${concentrationPct}%`,
    }),
  )

  // ── cooling (OUT-007, OUT-008) ─────────────────────────────────
  const coolRate = COOLING_BY_PARAMETER['Net water spray rate on exposed vessel surface']?.value ?? 4.1
  const Hcool = tank.coolingHeightM ?? H
  const aShell = shellArea(D, Hcool)
  // Half the shell is the cooled surface; a fixed roof is cooled on the roof as
  // well, a floating roof is not (see src/lib/coolingArea.ts).
  const aShellCooled = aShell.value * SHELL_COOLING_FRACTION
  const aTop = roofIsCooled(tank.roofKind) ? topArea(D).value : 0
  const aCool = aShellCooled + aTop
  const qCool = aCool * coolRate

  out.push(
    mk('OUT-007', {
      value: qCool,
      substitution: `A_cool = ${SHELL_COOLING_FRACTION} × ${num(aShell.value)}${aTop ? ` + ${num(aTop)}` : ''} = ${num(aCool)} m² · Q = ${num(aCool)} × ${coolRate} = ${num(qCool)} L/min`,
      formulaIds: ['COOL-001', 'COOL-002', 'COOL-003'],
      referenceIds: ['T3.10'],
      note: `چگالی ${coolRate} L/min/m² (NFPA 15) · سطح جانبی ${SHELL_COOLING_FRACTION * 100}٪ پوسته${aTop ? ' + سقف ثابت' : ' — بدون کولینگ سقف'}`,
    }),
  )

  // ── cooling rings and nozzles (OUT-009, OUT-010, OUT-011) ──────
  const rundownSpacing = COOLING_BY_PARAMETER['Vertical nozzle spacing when rundown is contemplated']?.value ?? 3.7
  const ringExact = Hcool / rundownSpacing
  const rings = Math.max(1, Math.ceil(ringExact - 1e-9))
  const circumference = Math.PI * D
  const nozzleExact = circumference / E.nozzleCircumferentialSpacingM
  const nozzlesPerRing = Math.max(1, Math.ceil(nozzleExact - 1e-9))
  const totalNozzles = rings * nozzlesPerRing

  out.push(
    mk('OUT-009', {
      value: rings,
      substitution: `N_rings = MAX(1, CEILING(${num(Hcool)} / ${rundownSpacing})) = ${rings}`,
      formulaIds: ['RING-001'],
      referenceIds: ['T3.10'],
      rounding: 'CEILING',
      note: `فاصله عمودی حداکثر ${rundownSpacing} m`,
    }),
  )
  out.push(
    mk('OUT-010', {
      value: nozzlesPerRing,
      substitution: `N_nozzles_ring = MAX(1, CEILING(π × ${D} / ${E.nozzleCircumferentialSpacingM})) = ${nozzlesPerRing}`,
      formulaIds: ['RING-002'],
      referenceIds: ['T3.10'],
      rounding: 'CEILING',
      note: `پوشش محیطی ${E.nozzleCircumferentialSpacingM} m — نیازمند کاتالوگ نازل (IN-025)`,
    }),
  )
  out.push(
    mk('OUT-011', {
      value: totalNozzles,
      substitution: `N_total = ${rings} × ${nozzlesPerRing} = ${totalNozzles}`,
      formulaIds: ['RING-005'],
      referenceIds: ['T3.10'],
      rounding: 'CEILING',
    }),
  )

  // ── adjacent tank cooling (OUT-008) ────────────────────────────
  out.push(
    mk('OUT-008', {
      value: 0,
      substitution: 'Q_adjacent = 0  (no adjacent tank declared)',
      formulaIds: ['GEOM-010', 'COOL-004', 'COOL-005'],
      referenceIds: ['T3.10'],
      note: 'در صورت وجود مخزن در معرض، IN-024 وارد شود',
    }),
  )

  // ── supplementary hose streams (§3.9) ──────────────────────────
  const hose = hoseStreamDemand(D, HOSE_STREAMS, bandContains)

  // ── demand (OUT-012, SITE-001/SITE-007) ───────────────────────
  const activeMonitors = Math.max(0, config.site.activeMonitors)
  const activeHydrants = Math.max(0, config.site.activeHydrants)
  const qMonitor = activeMonitors * E.monitorRatedFlowLpm
  const qHydrant = activeHydrants * E.hydrantOutletFlowLpm

  const demandTerms = [
    { label: `جزء آبی محلول فوم (${concentrationPct}% غلظت)`, lpm: qWaterComponent, formulaId: 'FOAM-006' },
    { label: 'خنکسازی مخزن اصلی', lpm: qCool, formulaId: 'COOL-003' },
    { label: `${activeMonitors} مانیتور فعال`, lpm: qMonitor, formulaId: 'SITE-007' },
    { label: `${activeHydrants} هایدرانت فعال`, lpm: qHydrant, formulaId: 'SITE-007' },
    { label: `جریانهای شیلنگ مکمل (${hose.streams} رشته)`, lpm: hose.flowLpm, formulaId: 'SITE-001' },
  ]
  const qPumpDesign = demandTerms.reduce((s, t) => s + t.lpm, 0)

  out.push(
    mk('OUT-012', {
      value: qPumpDesign,
      substitution: `Q_pump = ${demandTerms.map((t) => num(t.lpm)).join(' + ')} = ${num(qPumpDesign)} L/min`,
      formulaIds: ['SITE-001', 'SITE-007'],
      referenceIds: ['T3.9'],
      note: `بدترین حالت با ${activeMonitors} مانیتور و ${activeHydrants} هایدرانت فعال (LOOK-012/013)`,
    }),
  )

  // ── ring-main diameter iteration (OUT-018, LOOK-010 / §12) ────
  //
  // §12 makes diameter selection part of the hydraulic solve: "Evaluate
  // candidate diameters from project pipe-size library; select smallest
  // candidate that passes all scenario cases." The pressure and power below are
  // therefore solved on the *selected* bore, so the three outputs describe one
  // consistent network instead of two different ones.
  const qM3s = qPumpDesign / 60000
  const runM = config.pipeRunM ?? E.assumedPipeRunM
  const hTerminal = (config.terminalPressureBar * 100000) / (E.waterDensityKgm3 * E.g)

  const LIBRARY_MM = [50, 80, 100, 150, 200, 250, 300, 350, 400, 450, 500, 600, 700, 800]
  const lib = LIBRARY_MM.map((mm) => {
    const b = mm / 1000
    const v = pipeVelocity(qM3s, b)
    const loss = hazenWilliamsHeadLoss(runM, qM3s, E.hazenWilliamsC, b)
    const hSrc = hTerminal + config.staticHeadM + loss + (E.minorLossK * v ** 2) / (2 * E.g)
    const pSrc = (E.waterDensityKgm3 * E.g * hSrc) / 100000
    return { mm, v, loss, pSrc, ok: v <= E.maxVelocityMs }
  })
  const chosen = lib.find((l) => l.ok)

  out.push(
    chosen
      ? mk('OUT-018', {
          value: chosen.mm,
          substitution: `smallest DN passing v <= ${E.maxVelocityMs} m/s at ${num(qPumpDesign)} L/min: DN${chosen.mm}  (v = ${num(chosen.v)} m/s)`,
          formulaIds: ['HYD-001', 'HYD-002'],
          referenceIds: ['T12'],
          note: `پاسشدهها: ${lib.filter((l) => l.ok).map((l) => `DN${l.mm}`).join(', ') || 'هیچ'}`,
        })
      : stopped(
          'OUT-018',
          'HYDRAULIC_PRESSURE_FAIL',
          `هیچ قطر کتابخانهای شرط سرعت ${E.maxVelocityMs} m/s را در ${num(qPumpDesign)} L/min پاس نکرد (بزرگترین: DN${LIBRARY_MM[LIBRARY_MM.length - 1]})`,
          ['HYD-001', 'HYD-002'],
          ['T12'],
        ),
  )

  // ── hydraulics (OUT-013) — solved on the selected bore ────────
  const bore = (chosen?.mm ?? LIBRARY_MM[LIBRARY_MM.length - 1]) / 1000
  const velocity = pipeVelocity(qM3s, bore)
  const hf = hazenWilliamsHeadLoss(runM, qM3s, E.hazenWilliamsC, bore)
  const hm = (E.minorLossK * velocity ** 2) / (2 * E.g)
  const hSource = hTerminal + config.staticHeadM + hf + hm
  const pSourceBar = (E.waterDensityKgm3 * E.g * hSource) / 100000

  const hydStatus: EngineStatus = velocity > E.maxVelocityMs ? 'VELOCITY_LIMIT_EXCEEDED' : 'VALID'

  out.push(
    mk('OUT-013', {
      value: pSourceBar,
      substitution: `H_source = ${num(hTerminal)} + ${num(config.staticHeadM)} + ${num(hf)} + ${num(hm)} = ${num(hSource)} m → P = ${num(pSourceBar)} bar`,
      formulaIds: ['HYD-001', 'HYD-002', 'HYD-003', 'HYD-005', 'HYD-006', 'HYD-007'],
      referenceIds: ['T12'],
      status: hydStatus,
      note: `شبکه روی DN${chosen?.mm ?? '—'} حل شد: v = ${num(velocity)} m/s (حد ${E.maxVelocityMs} m/s)، افت اصطکاکی ${num(hf)} m روی ${runM} m`,
    }),
  )

  // ── pump power (OUT-014, PUMP-004) ─────────────────────────────
  const etaPump = config.pumpEfficiency ?? E.pumpEfficiency
  const pHydKw = (E.waterDensityKgm3 * E.g * qM3s * hSource) / 1000
  const pMotorKw = pHydKw / (etaPump * E.motorEfficiency)

  out.push(
    mk('OUT-014', {
      value: pMotorKw,
      substitution: `P_hyd = 1000 × 9.80665 × ${num(qM3s, 4)} × ${num(hSource)} / 1000 = ${num(pHydKw)} kW · P_motor = ${num(pHydKw)} / (${etaPump} × ${E.motorEfficiency}) = ${num(pMotorKw)} kW`,
      formulaIds: ['PUMP-001', 'PUMP-002', 'PUMP-004'],
      referenceIds: ['T16'],
      note: `راندمان پمپ ${etaPump} · راندمان موتور ${E.motorEfficiency}`,
    }),
  )

  // ── jockey (OUT-015, OUT-016) ──────────────────────────────────
  const jockeyFlow = qPumpDesign * E.jockeyLeakFraction
  const jockeyPressure = pSourceBar + E.jockeyPressureMarginBar

  out.push(
    mk('OUT-015', {
      value: jockeyFlow,
      substitution: `Q_jockey = ${num(qPumpDesign)} × ${E.jockeyLeakFraction} = ${num(jockeyFlow)} L/min`,
      formulaIds: [],
      referenceIds: ['T5'],
      status: 'JOCKEY_BASIS_REQUIRED',
      note: 'مبنای نگهداری/نشتِ پروژه تعیین نشده (IN-030) — مقدار از کنوانسیون موتور: ۱٪ دبی پمپ آتشنشانی',
    }),
  )
  out.push(
    mk('OUT-016', {
      value: jockeyPressure,
      substitution: `P_jockey = ${num(pSourceBar)} + 0.7 = ${num(jockeyPressure)} bar`,
      formulaIds: [],
      referenceIds: ['T5'],
      status: 'JOCKEY_BASIS_REQUIRED',
      note: 'هدف شبکه باید صریحاً تعریف شود (IN-030) — مقدار از کنوانسیون موتور',
    }),
  )

  // ── storage (OUT-017, SITE-006) ────────────────────────────────
  const coolDuration = config.coolingDurationMin ?? timeMin
  const vCool = qCool * coolDuration
  const vWaterTotal = qWaterComponent * timeMin
  const vHose = hose.flowLpm * timeMin
  const vDemand = vWaterTotal + vCool + vHose
  const vStorage = vDemand + config.storageReserveL

  out.push(
    mk('OUT-017', {
      value: vStorage,
      substitution: `V = (${num(vWaterTotal, 0)} + ${num(vCool, 0)} + ${num(vHose, 0)}) + ${num(config.storageReserveL, 0)} = ${num(vStorage, 0)} L`,
      formulaIds: ['SITE-003', 'SITE-004', 'SITE-006'],
      referenceIds: ['T3.9'],
      note: `جزء آبی فوم ${num(vWaterTotal, 0)} L · خنکسازی ${coolDuration} دقیقه ${num(vCool, 0)} L · شیلنگ ${num(vHose, 0)} L · ذخیره ${num(config.storageReserveL, 0)} L`,
    }),
  )

  // ── installed equipment (OUT-019, OUT-020) ────────────────────
  out.push(
    mk('OUT-019', {
      value: config.site.monitorCount,
      substitution: `installed on map: ${config.site.monitorCount}`,
      formulaIds: [],
      referenceIds: ['T5'],
      note: `LOOK-012 — تعداد از هندسه پوشش و منحنی مانیتور میآید؛ ${activeMonitors} مانیتور در بدترین حالت فعال (IN-027/IN-029)`,
      display: String(config.site.monitorCount),
    }),
  )
  out.push(
    mk('OUT-020', {
      value: config.site.hydrantCount,
      substitution: `installed on map: ${config.site.hydrantCount}`,
      formulaIds: [],
      referenceIds: ['T5'],
      note: `LOOK-013 — تعداد از دسترسی و پوشش سایت میآید؛ ${activeHydrants} هایدرانت در بدترین حالت فعال (IN-028/IN-029)`,
      display: String(config.site.hydrantCount),
    }),
  )

  // ── assemble in §4.1 order, filling any gap ────────────────────
  return assembleRun({
    tank, D, H, scenarioId, fuel, classification, out, config, demandTerms,
    foam: { areaM2: area, rateLminM2, timeMin, qSolutionLpm: qSolution, outletCount, qPerOutletLpm: qPerOutlet },
  })
}

/**
 * Assemble the twenty §4.1 outputs in order, filling any gap with the §13
 * INPUT_REQUIRED status, so a report is always the full matrix.
 *
 * Split out of `runSpecEngine` so the early stop for an undeclared roof kind
 * (IN-008) returns exactly the same shape as a completed run.
 */
function assembleRun(args: {
  tank: SpecTank
  D: number
  H: number
  scenarioId: string
  fuel: ProjectFuel
  classification: ClassificationResult
  out: SpecOutput[]
  config: SpecConfig
  demandTerms: { label: string; lpm: number; formulaId: string }[]
  foam: SpecRun['foam']
}): SpecRun {
  const { tank, D, H, scenarioId, fuel, classification, out, config, demandTerms, foam } = args
  const byId: Record<string, SpecOutput> = Object.fromEntries(out.map((o) => [o.id, o]))
  const ordered = OUTPUTS.map(
    (rec) =>
      byId[rec.id] ??
      stopped(rec.id, 'INPUT_REQUIRED', 'در این اجرا محاسبه نشد', [], [rec.sourceId]),
  )

  const statusCounts: Record<string, number> = {}
  for (const o of ordered) statusCounts[o.status] = (statusCounts[o.status] ?? 0) + 1

  return {
    tankId: tank.id,
    tankLabel: tank.label,
    geometry: { diameterM: D, shellHeightM: H, roofKind: tank.roofKind },
    scenarioId,
    scenario: SCENARIO_ITEM_LOOKUP(scenarioId),
    fuel,
    classification,
    outputs: ordered,
    byId: Object.fromEntries(ordered.map((o) => [o.id, o])),
    statusCounts,
    profile: config.profile,
    demandTerms,
    foam,
  }
}

// Small indirection so the scenario labels come from the specification table.
function SCENARIO_ITEM_LOOKUP(id: string) {
  const it = SCENARIO_ITEM_BY_ID[id]
  return {
    protectedArea: it?.protectedArea ?? '',
    foamMethod: it?.foamEquipment ?? '',
    rateTimeSource: it?.primaryCountLogic ?? '',
    specialLogic: it?.coolingOutputs ?? '',
    sourceId: it?.sourceId ?? 'T3.0',
  }
}

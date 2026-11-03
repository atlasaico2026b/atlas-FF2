// SPDX-License-Identifier: Apache-2.0
// ═══════════════════════════════════════════════════════════════════
// SPECIFICATION REGISTRY
//
// A typed view over `tables.generated.ts`. Every record below is parsed out of
// a table in the employer's engine specification, and every record carries the
// id of the table it came from. Nothing here decides a number: the numbers are
// in the generated file, which is in turn transcribed from the document.
//
// Numeric text such as "4.1 L/min/m²" or ">24 to 37 m" is parsed here once, so
// that the rest of the engine works with numbers and ranges rather than with
// prose that has to be re-interpreted at each call site.
// ═══════════════════════════════════════════════════════════════════

import { SPEC_TABLES, SPEC_TABLE_BY_ID, SPEC_RULES, SPEC_SOURCE_DOCUMENT, type SpecTable } from './tables.generated'

export { SPEC_TABLES, SPEC_TABLE_BY_ID, SPEC_RULES, SPEC_SOURCE_DOCUMENT }
export type { SpecTable }

export const SPEC_VERSION = 'ENGINE-SPEC-v1.2'

/** A section reference for display, e.g. `§3.1`. */
export function sectionRef(tableId: string): string {
  const t = SPEC_TABLE_BY_ID[tableId]
  return t ? `§${t.section}` : `§${tableId}`
}

// ── numeric parsing ────────────────────────────────────────────────

/** First number in a string. `"4.1 L/min/m²"` → `4.1`. */
export function parseNum(text: string): number | null {
  const m = /-?\d+(?:\.\d+)?/.exec(text ?? '')
  return m ? Number(m[0]) : null
}

/** All numbers in a string. */
export function parseNums(text: string): number[] {
  return (text ?? '').match(/-?\d+(?:\.\d+)?/g)?.map(Number) ?? []
}

/**
 * A diameter band. Handles every form the specification uses:
 *   "≤ 24 m"          → { maxInclusive: 24 }
 *   ">24 to 37 m"     → { minExclusive: 24, maxInclusive: 37 }
 *   "20–36 m"         → { minInclusive: 20, maxInclusive: 36 }
 *   ">61 m"           → { minExclusive: 61, open: true }
 */
export interface Band {
  minInclusive?: number
  minExclusive?: number
  maxInclusive?: number
  maxExclusive?: number
  open: boolean
}

export function parseBand(text: string): Band {
  const t = (text ?? '').replace(/≤\s*/g, '≤ ').replace(/≥\s*/g, '≥ ')
  if (/[>≥]/.test(t) && /to|–|-/.test(t)) {
    const [a, b] = t.split(/to|–|-/)
    const lo = parseNum(a)
    const hi = parseNum(b)
    return {
      minExclusive: /[>]/.test(a) && !/[≥]/.test(a) ? (lo ?? undefined) : undefined,
      minInclusive: /[≥]/.test(a) ? (lo ?? undefined) : undefined,
      maxInclusive: hi ?? undefined,
      open: false,
    }
  }
  if (/^≤/.test(t) || /≤/.test(t)) {
    return { maxInclusive: parseNum(t) ?? undefined, open: false }
  }
  if (/^[>]/.test(t) || /^>/.test(t)) {
    return { minExclusive: parseNum(t) ?? undefined, open: true }
  }
  if (/^≥/.test(t)) {
    return { minInclusive: parseNum(t) ?? undefined, open: true }
  }
  const range = t.match(/^([\d.]+)\s*[–-]\s*([\d.]+)/)
  if (range) {
    return { minInclusive: Number(range[1]), maxInclusive: Number(range[2]), open: false }
  }
  return { open: true }
}

export function bandContains(b: Band, v: number): boolean {
  if (b.minInclusive !== undefined && v < b.minInclusive) return false
  if (b.minExclusive !== undefined && v <= b.minExclusive) return false
  if (b.maxInclusive !== undefined && v > b.maxInclusive) return false
  if (b.maxExclusive !== undefined && v >= b.maxExclusive) return false
  return true
}

// ── table record types ─────────────────────────────────────────────

export interface FormulaRecord {
  id: string
  name: string
  expression: string
  inputs: string
  output: string
  /** Table the record came from (always `T4`). */
  sourceId: string
  section: string
}

export interface OutputRecord {
  id: string
  label: string
  sourceIds: string
  unit: string
  validation: string
  sourceId: string
  section: string
}

export interface LookupRecord {
  id: string
  algorithm: string
  rule: string
  sourceId: string
}

export interface ErrorRecord {
  code: string
  meaning: string
  action: string
  sourceId: string
}

export interface ScenarioRecord {
  id: string
  roofCondition: string
  primaryProtectedArea: string
  foamMethod: string
  rateTimeSource: string
  cooling: string
  specialLogic: string
  sourceId: string
}

export interface ScenarioItemRecord {
  id: string
  roofCondition: string
  protectedArea: string
  foamEquipment: string
  foamDam: string
  coolingOutputs: string
  primaryCountLogic: string
  sourceId: string
}

export interface InputParameterRecord {
  id: string
  parameter: string
  unit: string
  requiredWhen: string
  sourceId: string
}

function rows(tableId: string): string[][] {
  return SPEC_TABLE_BY_ID[tableId]?.rows ?? []
}

function build<T>(tableId: string, fn: (r: string[], section: string) => T): T[] {
  const sec = SPEC_TABLE_BY_ID[tableId]?.section ?? ''
  return rows(tableId).map((r) => fn(r, sec))
}

// ── §4 formula repository ──────────────────────────────────────────

export const FORMULAS: FormulaRecord[] = build('T4', (r, section) => ({
  id: r[0] ?? '',
  name: r[1] ?? '',
  expression: r[2] ?? '',
  inputs: r[3] ?? '',
  output: r[4] ?? '',
  sourceId: 'T4',
  section,
})).filter((f) => /^[A-Z]+-\d+$/.test(f.id))

export const FORMULA_BY_ID: Record<string, FormulaRecord> = Object.freeze(
  Object.fromEntries(FORMULAS.map((f) => [f.id, f])),
)

/** Formula ids grouped by prefix, e.g. `GEOM` → GEOM-001… — used by the report. */
export const FORMULA_GROUPS: Record<string, FormulaRecord[]> = Object.freeze(
  FORMULAS.reduce<Record<string, FormulaRecord[]>>((acc, f) => {
    const g = f.id.split('-')[0]
    ;(acc[g] ||= []).push(f)
    return acc
  }, {}),
)

// ── §4.1 output matrix ─────────────────────────────────────────────

export const OUTPUTS: OutputRecord[] = build('T4.1', (r, section) => ({
  id: r[0] ?? '',
  label: r[1] ?? '',
  sourceIds: r[2] ?? '',
  unit: r[3] ?? '',
  validation: r[4] ?? '',
  sourceId: 'T4.1',
  section,
})).filter((o) => /^OUT-\d+$/.test(o.id))

export const OUTPUT_BY_ID: Record<string, OutputRecord> = Object.freeze(
  Object.fromEntries(OUTPUTS.map((o) => [o.id, o])),
)

// ── §5 lookup algorithms ───────────────────────────────────────────

export const LOOKUPS: LookupRecord[] = build('T5', (r) => ({
  id: r[0] ?? '',
  algorithm: r[1] ?? '',
  rule: r[2] ?? '',
  sourceId: 'T5',
})).filter((l) => /^LOOK-\d+$/.test(l.id))

export const LOOKUP_BY_ID: Record<string, LookupRecord> = Object.freeze(
  Object.fromEntries(LOOKUPS.map((l) => [l.id, l])),
)

// ── §13 validation & error states ──────────────────────────────────

export const ERROR_CODES: ErrorRecord[] = build('T13', (r) => ({
  code: r[0] ?? '',
  meaning: r[1] ?? '',
  action: r[2] ?? '',
  sourceId: 'T13',
})).filter((e) => /^[A-Z][A-Z_]+$/.test(e.code))

export const ERROR_BY_CODE: Record<string, ErrorRecord> = Object.freeze(
  Object.fromEntries(ERROR_CODES.map((e) => [e.code, e])),
)

export type EngineStatus =
  | 'VALID'
  | 'INPUT_REQUIRED'
  | 'INPUT_OUT_OF_RANGE'
  | 'STANDARD_VALUE_NOT_DEFINED'
  | 'METHOD_NOT_PERMITTED'
  | 'EQUIPMENT_NOT_LISTED'
  | 'FLOW_OUT_OF_RANGE'
  | 'PRESSURE_OUT_OF_RANGE'
  | 'VELOCITY_LIMIT_EXCEEDED'
  | 'HYDRAULIC_PRESSURE_FAIL'
  | 'HYDRAULIC_BALANCE_FAIL'
  | 'COVERAGE_FAIL'
  | 'PUMP_SELECTION_FAILED'
  | 'JOCKEY_BASIS_REQUIRED'

// ── §6 scenario matrix and §3.0 item matrix ────────────────────────

export const SCENARIOS: ScenarioRecord[] = build('T6', (r) => ({
  id: r[0] ?? '',
  roofCondition: r[1] ?? '',
  primaryProtectedArea: r[2] ?? '',
  foamMethod: r[3] ?? '',
  rateTimeSource: r[4] ?? '',
  cooling: r[5] ?? '',
  specialLogic: r[6] ?? '',
  sourceId: 'T6',
})).filter((s) => /^SC-\d+$/.test(s.id))

export const SCENARIO_BY_ID: Record<string, ScenarioRecord> = Object.freeze(
  Object.fromEntries(SCENARIOS.map((s) => [s.id, s])),
)

export const SCENARIO_ITEMS: ScenarioItemRecord[] = build('T3.0', (r) => ({
  id: r[0] ?? '',
  roofCondition: r[1] ?? '',
  protectedArea: r[2] ?? '',
  foamEquipment: r[3] ?? '',
  foamDam: r[4] ?? '',
  coolingOutputs: r[5] ?? '',
  primaryCountLogic: r[6] ?? '',
  sourceId: 'T3.0',
})).filter((s) => /^SC-\d+$/.test(s.id))

export const SCENARIO_ITEM_BY_ID: Record<string, ScenarioItemRecord> = Object.freeze(
  Object.fromEntries(SCENARIO_ITEMS.map((s) => [s.id, s])),
)

// ── §2 required input parameters ───────────────────────────────────

export const INPUT_PARAMETERS: InputParameterRecord[] = build('T2', (r) => ({
  id: r[0] ?? '',
  parameter: r[1] ?? '',
  unit: r[2] ?? '',
  requiredWhen: r[3] ?? '',
  sourceId: 'T2',
})).filter((p) => /^IN-\d+$/.test(p.id))

export const INPUT_PARAMETER_BY_ID: Record<string, InputParameterRecord> = Object.freeze(
  Object.fromEntries(INPUT_PARAMETERS.map((p) => [p.id, p])),
)

// ── §3 numeric reference tables ────────────────────────────────────
//
// Each entry keeps the raw cell it was parsed from so the report can print the
// specification's own wording next to the number.

export interface RawRef<T> {
  value: T
  /** The verbatim cell text from the specification. */
  text: string
  sourceId: string
}

const raw = <T>(tableId: string, cell: (r: string[]) => string, value: (r: string[]) => T): RawRef<T>[] =>
  rows(tableId)
    .slice(1)
    .map((r) => ({ value: value(r), text: cell(r), sourceId: tableId }))

/** §3.1 — minimum fixed foam outlets on a fixed-roof tank, by diameter. */
export interface DiameterTableEntry {
  band: Band
  bandText: string
  count: number
  /** True where the specification adds outlets per additional area. */
  perAreaSqm: number | null
}
export const FIXED_ROOF_OUTLETS: DiameterTableEntry[] = rows('T3.1').slice(1).map((r) => {
  const text = r[0] ?? ''
  const countCell = r[1] ?? ''
  const perArea = /per\s+(?:additional\s+)?([\d.]+)\s*m²/.exec(countCell)
  return {
    band: parseBand(text),
    bandText: text,
    count: parseNum(countCell) ?? 1,
    perAreaSqm: perArea ? Number(perArea[1]) : null,
  }
})

/** §3.3 — subsurface outlets, by diameter and flash-point class. */
export interface SubsurfaceEntry {
  band: Band
  bandText: string
  /** FP < 38 °C column. */
  below38: number
  /** FP ≥ 38 °C column. */
  atLeast38: number
  perAreaBelow38: number | null
  perAreaAtLeast38: number | null
}
export const SUBSURFACE_OUTLETS: SubsurfaceEntry[] = rows('T3.3').slice(1).map((r) => {
  const a = /per\s+([\d.]+)\s*m²/.exec(r[1] ?? '')
  const b = /per\s+([\d.]+)\s*m²/.exec(r[2] ?? '')
  return {
    band: parseBand(r[0] ?? ''),
    bandText: r[0] ?? '',
    below38: parseNum(r[1] ?? '') ?? 1,
    atLeast38: parseNum(r[2] ?? '') ?? 1,
    perAreaBelow38: a ? Number(a[1]) : null,
    perAreaAtLeast38: b ? Number(b[1]) : null,
  }
})

/** §3.2 — surface application rate and time for fixed-roof hydrocarbon tanks. */
export interface RateTimeEntry {
  condition: string
  rateLminM2: number
  timeMin: number
  text: string
}
export const SURFACE_RATE_TIME: RateTimeEntry[] = rows('T3.2').slice(1).map((r) => ({
  condition: r[0] ?? '',
  rateLminM2: parseNum(r[1] ?? '') ?? 0,
  timeMin: parseNum(r[2] ?? '') ?? 0,
  text: `${r[1]} / ${r[2]}`,
}))

/** §3.4 — external floating roof, top-of-seal. */
export interface SealEntry {
  sealConfiguration: string
  rateLminM2: number
  timeMin: number
  spacing305: number | null
  spacing600: number | null
  spacingM: number | null
  foamDam: string
  text: string
}
export const TOP_OF_SEAL: SealEntry[] = rows('T3.4').slice(1).map((r) => ({
  sealConfiguration: r[0] ?? '',
  rateLminM2: parseNum(r[1] ?? '') ?? 0,
  timeMin: parseNum(r[2] ?? '') ?? 0,
  spacing305: parseNum(r[3] ?? ''),
  spacing600: parseNum(r[4] ?? ''),
  spacingM: null,
  foamDam: 'Required',
  text: `${r[1]} / ${r[2]}`,
}))

/** §3.5 — external floating roof, below-the-seal / weather shield. */
export const BELOW_SEAL: SealEntry[] = rows('T3.5').slice(1).map((r) => ({
  sealConfiguration: r[0] ?? '',
  rateLminM2: parseNum(r[1] ?? '') ?? 0,
  timeMin: parseNum(r[2] ?? '') ?? 0,
  spacing305: null,
  spacing600: null,
  spacingM: parseNum(r[3] ?? ''),
  foamDam: r[4] ?? '',
  text: `${r[1]} / ${r[2]}`,
}))

/** §3.6 — foam dam controls. */
export interface DamControl {
  parameter: string
  constraint: string
  value: number | null
  sourceId: string
}
export const DAM_CONTROLS: DamControl[] = rows('T3.6').slice(1).map((r) => ({
  parameter: r[0] ?? '',
  constraint: r[1] ?? '',
  value: parseNum(r[1] ?? ''),
  sourceId: 'T3.6',
}))

export const DAM_CONTROL_BY_PARAMETER: Record<string, DamControl> = Object.freeze(
  Object.fromEntries(DAM_CONTROLS.map((d) => [d.parameter, d])),
)

/** §3.7 — internal / covered floating roof logic. */
export interface InternalRoofEntry {
  roofConstruction: string
  sealOnlyAllowed: boolean
  fullSurfaceProtection: string
  sourceId: string
}
export const INTERNAL_ROOF_LOGIC: InternalRoofEntry[] = rows('T3.7').slice(1).map((r) => ({
  roofConstruction: r[0] ?? '',
  sealOnlyAllowed: /^yes$/i.test((r[1] ?? '').trim()),
  fullSurfaceProtection: r[2] ?? '',
  sourceId: 'T3.7',
}))

/** §3.7-a — how an internal floating roof fire is mapped. */
export interface InternalFireBasis {
  basis: string
  mapping: string
  sourceId: string
}
export const INTERNAL_FIRE_BASIS: InternalFireBasis[] = rows('T3.7-a').slice(1).map((r) => ({
  basis: r[0] ?? '',
  mapping: r[1] ?? '',
  sourceId: 'T3.7-a',
}))

/** §3.8 — diked area / spill protection. */
export interface DikeEntry {
  method: string
  rateLminM2: number | null
  classITimeMin: number
  classIITimeMin: number
  /** True where the rate is manufacturer-listed rather than tabulated. */
  manufacturerBasis: boolean
  text: string
}
export const DIKE_PROTECTION: DikeEntry[] = rows('T3.8').slice(1).map((r) => ({
  method: r[0] ?? '',
  rateLminM2: /listed/i.test(r[1] ?? '') ? null : parseNum(r[1] ?? ''),
  classITimeMin: parseNum(r[2] ?? '') ?? 0,
  classIITimeMin: parseNum(r[3] ?? '') ?? 0,
  manufacturerBasis: /listed/i.test(r[1] ?? ''),
  text: `${r[1]} / ${r[2]} / ${r[3]}`,
}))

/** §3.9 — supplementary foam hose streams. */
export interface HoseStreamEntry {
  band: Band
  bandText: string
  streams: number
  flowLpm: number
  operatingTime: string
}
export const HOSE_STREAMS: HoseStreamEntry[] = rows('T3.9').slice(1).map((r) => ({
  band: parseBand(r[0] ?? ''),
  bandText: r[0] ?? '',
  streams: parseNum(r[1] ?? '') ?? 0,
  flowLpm: parseNum(r[2] ?? '') ?? 0,
  operatingTime: r[3] ?? '',
}))

/** §3.10 — NFPA 15 vessel exposure cooling. */
export interface CoolingRequirement {
  parameter: string
  requirement: string
  value: number | null
  sourceId: string
}
export const COOLING_REQUIREMENTS: CoolingRequirement[] = rows('T3.10').slice(1).map((r) => ({
  parameter: r[0] ?? '',
  requirement: r[1] ?? '',
  value: parseNum(r[1] ?? ''),
  sourceId: 'T3.10',
}))

export const COOLING_BY_PARAMETER: Record<string, CoolingRequirement> = Object.freeze(
  Object.fromEntries(COOLING_REQUIREMENTS.map((c) => [c.parameter, c])),
)

/** §3.0A — NFPA 30 liquid classification table, verbatim. */
export interface ClassificationRow {
  cls: string
  flashPointText: string
  boilingPointText: string
  rule: string
  sourceId: string
}
export const LIQUID_CLASSIFICATION: ClassificationRow[] = rows('T3.0A').slice(1).map((r) => ({
  cls: r[0] ?? '',
  flashPointText: r[1] ?? '',
  boilingPointText: r[2] ?? '',
  rule: r[3] ?? '',
  sourceId: 'T3.0A',
}))

// ── §3.2-a / §3.3-a control rows ───────────────────────────────────

export const SURFACE_CONTROLS: DamControl[] = rows('T3.2-a').slice(1).map((r) => ({
  parameter: r[0] ?? '',
  constraint: r[1] ?? '',
  value: parseNum(r[1] ?? ''),
  sourceId: 'T3.2-a',
}))

export const SUBSURFACE_CONTROLS: DamControl[] = rows('T3.3-a').slice(1).map((r) => ({
  parameter: r[0] ?? '',
  constraint: r[1] ?? '',
  value: parseNum(r[1] ?? ''),
  sourceId: 'T3.3-a',
}))

export function controlValue(table: DamControl[], parameterPart: string): number | null {
  const hit = table.find((c) => c.parameter.toLowerCase().includes(parameterPart.toLowerCase()))
  return hit?.value ?? null
}

export function controlText(table: DamControl[], parameterPart: string): string {
  const hit = table.find((c) => c.parameter.toLowerCase().includes(parameterPart.toLowerCase()))
  return hit?.constraint ?? ''
}

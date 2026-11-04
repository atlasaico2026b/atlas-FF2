// SPDX-License-Identifier: Apache-2.0
// ═══════════════════════════════════════════════════════════════════
// DESIGN BASIS — PROVENANCE AND VERIFICATION
//
// No number in this engine is allowed to be anonymous. Every design
// parameter is an entry that records where it came from, which standard
// edition and clause it is attributed to, the applicability it was chosen
// under, and whether anyone has actually verified it.
//
// This is what keeps normative requirements, project defaults, engineering
// assumptions, manufacturer data and AHJ requirements apart — and it is what
// makes "the formula ran" distinguishable from "the design is verified".
// ═══════════════════════════════════════════════════════════════════

/** Where a value comes from. */
export type SourceType =
  /** A requirement of an adopted standard. */
  | 'normative'
  /** A configurable project default. Not a standard requirement. */
  | 'project_default'
  /** An engineering assumption made for this design. */
  | 'engineering_assumption'
  /** Published manufacturer data (datasheet, spray-pattern chart, curve). */
  | 'manufacturer_data'
  /** A requirement imposed by the authority having jurisdiction. */
  | 'ahj_requirement'
  /** Carried over from the previous engine, with no traceable source. */
  | 'legacy_value'
  /** Computed from other basis entries — not an input. */
  | 'derived'

/** Whether a value's source and applicability have been checked. */
export type VerificationStatus =
  /**
   * Pre-filled from the standard's stated figure. The calculation runs on it
   * without any project input; what remains open is only whether the clause
   * applies to this equipment, which is why it is not "verified".
   */
  | 'standard_default'
  /**
   * Pre-filled working default (project practice, an engineering assumption or a
   * value from the previous engine). Usable as-is; change it if your design basis
   * differs. Never claim it is a standard requirement.
   */
  | 'preset_default'
  /** Checked against the licensed/official text of the adopted edition. */
  | 'verified'
  /** Value known, but its applicability to this project/equipment is unconfirmed. */
  | 'requires_engineering_review'
  /** Inherited from the legacy engine. Never verified. Must be reviewed. */
  | 'unverified_legacy'
  /** Must be taken from the actual manufacturer datasheet. */
  | 'manufacturer_specific'
  /** Not applicable to the selected equipment class / scenario. */
  | 'not_applicable'

/**
 * Statuses that mean "the engineer must do something before this is complete".
 *
 * A pre-filled default is deliberately NOT in this set: the whole point of a
 * default is that the calculation proceeds without anyone typing it in.
 */
export const NEEDS_ACTION: VerificationStatus[] = [
  'requires_engineering_review',
  'unverified_legacy',
  'manufacturer_specific',
]

/** How a computed result may be described. */
export type ResultStatus =
  /** Formula executed on validated inputs. Says nothing about compliance. */
  | 'calculated'
  /** Geometric/rough estimate; must not be used as a design output. */
  | 'preliminary'
  /** Checked against verified standard text and approved data. */
  | 'verified'
  /** Needs a competent engineer's review before use. */
  | 'requires_engineering_review'
  /** Not computed — inputs invalid or applicability unresolved. */
  | 'blocked'

export interface BasisEntry<V = number> {
  /** Stable key used to look the entry up. */
  key: string
  /** Human label, both languages. */
  parameter: string
  value: V
  unit?: string
  source: SourceType
  /** "§3.10 سند موتور مشخصات (T3.10)" | "Client brief, 2026-09-28" | "Project spec §4.2" | "—" */
  reference: string
  /** Under what conditions this value may be used. */
  applicability: string
  status: VerificationStatus
  note?: string
  /**
   * True when the specification itself places this value in the project's
   * hands — a seal elevation, a listed device property. Such an entry is
   * allowed to be absent: §17 rule 2 forbids inventing a default for it, and
   * the calculation that needs it reports which input is missing rather than
   * silently substituting one.
   */
  projectSupplied?: boolean
}

export interface AdoptedStandard {
  /** 'NFPA 11' */
  standard: string
  /** null = the adopted edition is not recorded, which blocks applicability. */
  edition: string | null
  /** Where the edition statement came from. */
  source: string
  status: VerificationStatus
}

export const DESIGN_BASIS_SCHEMA_VERSION = 2
export const BASIS_VERSION = 'atlas-basis-2.0.0'

export interface DesignBasis {
  schemaVersion: number
  basisVersion: string
  /** Standards and the edition this design is actually being built to. */
  adoptedStandards: AdoptedStandard[]
  /** Design parameters, keyed by `BasisEntry.key`. */
  entries: Record<string, BasisEntry<unknown>>
  /** Fluid used for hydraulics and power. */
  fluid: { name: string; densityKgm3: number; densitySource: SourceType; densityReference: string }
  /** Free-text basis notes carried with the design. */
  notes: string[]
  /** Anything the migration from a previous schema had to interpret. */
  migrations: string[]
}

// ─── Standards registry ────────────────────────────────────────────
/**
 * The editions the engine can attribute a value to.
 *
 * These are **pre-set defaults**, not a record that someone read the text: the
 * engine ships with the edition each default is attributed to so that no
 * calculation is blocked waiting for a manual selection. `edition: null` is
 * still accepted and means the project has deliberately not recorded one — every
 * clause reference then resolves to `requires_engineering_review` instead of
 * being presented as a satisfied requirement.
 *
 * Package versions here (2022/2021) are what the shipped defaults are attributed
 * to. If the project adopts a different edition, pick it — the attributed values
 * do not silently change underneath you, but the report will say which edition
 * they are being compared against.
 */
export function defaultAdoptedStandards(): AdoptedStandard[] {
  const preset = (standard: string, edition: string): AdoptedStandard => ({
    standard,
    edition,
    source: 'pre-set default — confirm against the project design basis',
    status: 'requires_engineering_review',
  })
  return [
    preset('NFPA 11', '2021'),
    preset('NFPA 15', '2022'),
    preset('NFPA 20', '2022'),
    preset('NFPA 24', '2022'),
    preset('NFPA 30', '2024'),
  ]
}

export const STANDARD_EDITIONS: Record<string, string[]> = {
  'NFPA 11': ['2024', '2021', '2016', '2010'],
  'NFPA 15': ['2022', '2017', '2012'],
  'NFPA 20': ['2025', '2022', '2019', '2016'],
  'NFPA 24': ['2022', '2019', '2016'],
  'NFPA 30': ['2024', '2021', '2018'],
}

// ─── Constructors ──────────────────────────────────────────────────
export function entry<V>(
  key: string,
  parameter: string,
  value: V,
  opts: {
    unit?: string
    source: SourceType
    reference: string
    applicability: string
    status: VerificationStatus
    note?: string
  },
): BasisEntry<V> {
  return { key, parameter, value, ...opts }
}

/** A parameter that must be reviewed before the design can be relied on. */
export function needsReview(e: BasisEntry<unknown>): boolean {
  // A value only the project can supply is not "waiting to be reviewed" — it is
  // waiting to be supplied, and the formula that needs it says so.
  if (e.projectSupplied) return false
  return NEEDS_ACTION.includes(e.status)
}

/** A pre-filled default that needs no manual entry to make the calculation run. */
export function isPreFilled(e: BasisEntry<unknown>): boolean {
  return e.status === 'standard_default' || e.status === 'preset_default'
}

/** A parameter that blocks the design outright because it is absent. */
export function isAbsent(e: BasisEntry<unknown>): boolean {
  if (e.projectSupplied) return false
  return e.value === null || e.value === undefined || e.value === ''
}

export const SOURCE_LABELS: Record<SourceType, string> = {
  normative: 'الزام استاندارد',
  project_default: 'پیش‌فرض پروژه',
  engineering_assumption: 'فرض مهندسی',
  manufacturer_data: 'داده سازنده',
  ahj_requirement: 'الزام آتش‌نشانی (AHJ)',
  legacy_value: 'مقدار قدیمی موتور قبلی',
  derived: 'محاسبه‌شده',
}

export const STATUS_LABELS: Record<VerificationStatus, string> = {
  standard_default: 'پیش‌فرض استاندارد — آماده استفاده',
  preset_default: 'پیش‌فرض آماده — قابل استفاده',
  verified: 'تأییدشده',
  requires_engineering_review: 'نیازمند بازبینی مهندسی',
  unverified_legacy: 'تأییدنشده (قدیمی)',
  manufacturer_specific: 'وابسته به داده سازنده',
  not_applicable: 'قابل اعمال نیست',
}

export const RESULT_STATUS_LABELS: Record<ResultStatus, string> = {
  calculated: 'محاسبه‌شده',
  preliminary: 'مقدماتی',
  verified: 'تأییدشده',
  requires_engineering_review: 'نیازمند بازبینی مهندسی',
  blocked: 'محاسبه نشده',
}

/** Any status other than `verified` means the number must not be read as a requirement met. */
export function isVerified(status: VerificationStatus | ResultStatus): boolean {
  return status === 'verified'
}

export function describeEntry(e: BasisEntry): string {
  const v = typeof e.value === 'number' ? String(e.value) : String(e.value)
  return `${e.parameter} = ${v}${e.unit ? ' ' + e.unit : ''} — ${SOURCE_LABELS[e.source]} / ${STATUS_LABELS[e.status]} (${e.reference})`
}

/** Count of entries still needing review, for the report header. */
export function reviewSummary(basis: DesignBasis): { total: number; needsReview: number; verified: number; absent: number } {
  const all = Object.values(basis.entries)
  const unverifiedStandards = basis.adoptedStandards.filter(s => s.edition === null).length
  return {
    total: all.length + unverifiedStandards,
    needsReview: all.filter(needsReview).length + unverifiedStandards,
    verified: all.filter(e => e.status === 'verified').length,
    absent: all.filter(isAbsent).length,
  }
}

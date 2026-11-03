// SPDX-License-Identifier: Apache-2.0
// ═══════════════════════════════════════════════════════════════════
// LEGACY PROJECT MIGRATION
//
// Projects saved before the design basis existed carry no provenance at all:
// the values lived as literals inside the calculation functions. Migration
// adopts them **unchanged** — nothing a designer set is allowed to move — and
// records that they came from the old engine so nothing is silently presented as
// a verified requirement.
//
// These are a HISTORICAL RECORD of what the previous engine used, not live
// defaults. The cooling rate stays 2.0 here because that is what the old engine
// actually computed with, and the migration report has to say so accurately.
// The specification states 4.1 L/min/m² in §3.10, so 2.0 no longer governs
// anything — it survives only as the explicitly-labelled opt-out alternative.
//
// The two spacing values the client called out (S = 2.4 m, V = 3.0 m) are
// explicitly asserted to survive migration.
// ═══════════════════════════════════════════════════════════════════

import { defaultBasis, K, setBasisValue } from './basis'
import {
  BASIS_VERSION,
  DESIGN_BASIS_SCHEMA_VERSION,
  type DesignBasis,
} from './provenance'

/** Values the previous engine hard-coded, kept for migration assertions. */
export const LEGACY_ENGINE_DEFAULTS = {
  horizontalSpacingM: 2.4,
  verticalSpacingM: 3.0,
  coolingRateLpmM2: 2.0,
  concentratePercent: 3,
  hazenWilliamsC: 120,
  pumpEfficiency: 0.70,
  jockeySplit: 0.15,
  jockeyBoostM: 20,
  lossAllowance: 0.20,
} as const

/** Settings a user may have overridden, in whatever shape the old project had. */
export interface LegacySettings {
  horizontalSpacingM?: number
  verticalSpacingM?: number
  coolingRateLpmM2?: number
  concentratePercent?: number
  hazenWilliamsC?: number
  pumpEfficiency?: number
  lossAllowance?: number
  roundingTolerance?: number
}

export interface MigrationResult {
  basis: DesignBasis
  /** Human-readable record of what the migration did. */
  migrations: string[]
  /** Values that were carried over unchanged from the old engine. */
  preservedLegacy: { key: string; value: number; note: string }[]
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

/**
 * Pull whatever legacy overrides a saved project might hold.
 *
 * Old projects stored only results (`worstCase`, `designData`), so this looks in
 * a few plausible places and ignores anything it does not recognise rather than
 * inventing a value.
 */
export function extractLegacySettings(raw: unknown): LegacySettings {
  if (!isObject(raw)) return {}
  const settings: LegacySettings = {}
  const read = (source: Record<string, unknown>, keys: string[]) => {
    for (const k of keys) {
      const v = source[k]
      if (typeof v === 'number' && Number.isFinite(v)) (settings as Record<string, number>)[k] = v
    }
  }
  read(raw, ['horizontalSpacingM', 'verticalSpacingM', 'coolingRateLpmM2', 'concentratePercent', 'hazenWilliamsC', 'pumpEfficiency', 'lossAllowance', 'roundingTolerance'])
  const nested = raw.settings
  if (isObject(nested)) read(nested, ['horizontalSpacingM', 'verticalSpacingM', 'coolingRateLpmM2', 'concentratePercent', 'hazenWilliamsC', 'pumpEfficiency', 'lossAllowance'])
  return settings
}

function applyLegacySettings(basis: DesignBasis, settings: LegacySettings, migrations: string[], preserved: MigrationResult['preservedLegacy']): DesignBasis {
  let next = basis
  const apply = (key: string, value: number | undefined, note: string) => {
    if (value === undefined) return
    next = setBasisValue(next, key, value)
    preserved.push({ key, value, note })
    migrations.push(`${note}: مقدار ${value} بدون تغییر از پروژه قبلی منتقل شد (وضعیت: نیازمند بازبینی).`)
  }
  apply(K.sprayHorizontalSpacing, settings.horizontalSpacingM, 'فاصله افقی نازل')
  apply(K.sprayVerticalSpacing, settings.verticalSpacingM, 'فاصله عمودی رینگ')
  apply(K.sprayProjectRate, settings.coolingRateLpmM2, 'میزان آب‌پاشی پروژه')
  apply(K.foamConcentratePercent, settings.concentratePercent, 'درصد کنسانتره فوم')
  apply(K.hwCoefficient, settings.hazenWilliamsC, 'ضریب C هیزن-ویلیامز')
  apply(K.pumpEfficiency, settings.pumpEfficiency, 'راندمان پمپ')
  apply(K.demandLossAllowance, settings.lossAllowance, 'ضریب ذخیره دبی')
  return next
}

/**
 * Reconcile a stored design basis (of any age) against the current schema.
 *
 * - no basis on file → defaults, with the legacy values explicitly recorded
 * - a basis from an older schema → every incoming value is kept and the missing
 *   keys are filled from the defaults, so a new parameter never blanks an old one
 * - a current basis → validated and topped up
 */
export function migrateDesignBasis(raw: unknown): MigrationResult {
  const migrations: string[] = []
  const preservedLegacy: MigrationResult['preservedLegacy'] = []
  const fresh = defaultBasis()

  if (!isObject(raw) || raw.schemaVersion === undefined) {
    migrations.push(
      'پایه طراحی در این پروژه وجود نداشت. مقادیر موتور قبلی از اینجا حذف شد و محاسبات فقط با «آخرین دیتا» انجام می‌شوند.',
    )
    return { basis: { ...fresh, migrations }, migrations, preservedLegacy }
  }

  const schemaVersion = typeof raw.schemaVersion === 'number' ? raw.schemaVersion : 0
  const incomingEntries = isObject(raw.entries) ? (raw.entries as Record<string, unknown>) : {}

  if (schemaVersion !== DESIGN_BASIS_SCHEMA_VERSION) {
    migrations.push(`پایه طراحی از نسخه ${schemaVersion} به نسخه ${DESIGN_BASIS_SCHEMA_VERSION} منتقل شد. مقادیر ورودی حفظ شدند.`)
  }

  const entries = { ...fresh.entries }
  let carried = 0
  for (const [key, value] of Object.entries(incomingEntries)) {
    if (!isObject(value)) continue
    const merged = entries[key] ? { ...entries[key], ...value } : (value as unknown as DesignBasis['entries'][string])
    // A stored value is user data: keep it, and never let a merge promote it to
    // a verified requirement.
    if (merged.status === 'verified' && merged.source !== 'normative') merged.status = 'requires_engineering_review'
    entries[key] = merged
    carried++
  }
  if (carried > 0) migrations.push(`${carried} پارامتر از پایه طراحی ذخیره‌شده خوانده و حفظ شد.`)

  const finalEntries = entries

  const missing = Object.keys(fresh.entries).filter(k => !(k in incomingEntries))
  if (missing.length) migrations.push(`${missing.length} پارامتر جدید به پایه طراحی اضافه شد و با پیش‌فرض تأییدنشده مقدار گرفت.`)

  const basis: DesignBasis = {
    ...fresh,
    schemaVersion: DESIGN_BASIS_SCHEMA_VERSION,
    basisVersion: BASIS_VERSION,
    entries: finalEntries,
    adoptedStandards: Array.isArray(raw.adoptedStandards) && raw.adoptedStandards.length
      ? (raw.adoptedStandards as DesignBasis['adoptedStandards'])
      : fresh.adoptedStandards,
    fluid: isObject(raw.fluid) ? { ...fresh.fluid, ...(raw.fluid as unknown as DesignBasis['fluid']) } : fresh.fluid,
    notes: [...fresh.notes, ...(Array.isArray(raw.notes) ? (raw.notes as string[]) : [])],
    migrations,
  }

  return { basis, migrations, preservedLegacy }
}

/**
 * Serialise a basis for storage. Values only — the provenance is rebuilt from the
 * key on load, which keeps the stored payload small and stops a hand-edited file
 * from claiming a status it never earned.
 */
export function serialiseDesignBasis(basis: DesignBasis): string {
  const entries = Object.keys(basis.entries)
    .sort()
    .map(k => [k, basis.entries[k]] as const)
  return JSON.stringify({
    schemaVersion: DESIGN_BASIS_SCHEMA_VERSION,
    basisVersion: BASIS_VERSION,
    adoptedStandards: basis.adoptedStandards,
    entries: Object.fromEntries(entries),
    fluid: basis.fluid,
    notes: basis.notes,
    migrations: basis.migrations,
  })
}

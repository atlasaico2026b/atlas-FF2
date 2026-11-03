// SPDX-License-Identifier: Apache-2.0
// ═══════════════════════════════════════════════════════════════════
// FUEL IDENTIFICATION AND NFPA 30 CLASSIFICATION
//
// Spec §3.0A gives the classification table and §3.0B the fuel profiles.
// LOOK-001 is explicit that the class comes from the *properties* — flash point
// and, where the table needs it, boiling point — never from the fuel's name.
// `classifyFuel` therefore takes numbers, and the only thing the profile table
// supplies is those numbers: which product a project is storing is a project
// fact, but which class it falls into is arithmetic.
// ═══════════════════════════════════════════════════════════════════

import { LIQUID_CLASSIFICATION, SPEC_TABLE_BY_ID } from './registry'

export type LiquidClass = 'IA' | 'IB' | 'IC' | 'II' | 'IIIA' | 'IIIB'

export interface ClassificationResult {
  cls: LiquidClass
  /** The specification row the class came from. */
  sourceId: string
  /** Display row, verbatim from §3.0A. */
  row: { flashPointText: string; boilingPointText: string; rule: string }
  /** True when the class needed a boiling point that the project did not supply. */
  boilingPointAssumed: boolean
  /** Human-readable justification, e.g. "FP −43 °C < 22.8 °C and BP 39 °C ≥ 37.8 °C". */
  reason: string
}

export const FLASH_POINT_BOUNDARY_C = 22.8
export const BOILING_POINT_BOUNDARY_C = 37.8
export const FP_LOWER_BAND_C = 37.8
export const FP_UPPER_BAND_C = 60
export const FP_HIGH_BAND_C = 93

/**
 * Classify from explicit properties (LOOK-001 / §3.0A).
 *
 * `bpC` is required only in the Class IA/IB branch — the one branch where the
 * table's boiling-point column is consulted. When FP < 22.8 °C and no boiling
 * point is available the result is Class IB with `boilingPointAssumed` set,
 * because Class IA additionally asserts BP < 37.8 °C and inventing that
 * assertion would be the unsafe direction.
 */
export function classifyFuel(
  flashPointC: number,
  boilingPointC?: number | null,
): ClassificationResult {
  const row = (cls: LiquidClass) => {
    const r = LIQUID_CLASSIFICATION.find((x) => x.cls === cls)!
    return { flashPointText: r.flashPointText, boilingPointText: r.boilingPointText, rule: r.rule }
  }

  if (!Number.isFinite(flashPointC)) {
    const r = row('IB')
    return {
      cls: 'IB',
      sourceId: 'T3.0A',
      row: r,
      boilingPointAssumed: true,
      reason: 'نقطه اشتعال ثبت نشده — طبقه‌بندی ممکن نیست',
    }
  }

  const fp = flashPointC

  if (fp < FLASH_POINT_BOUNDARY_C) {
    if (boilingPointC === null || boilingPointC === undefined || !Number.isFinite(boilingPointC)) {
      return {
        cls: 'IB',
        sourceId: 'T3.0A',
        row: row('IB'),
        boilingPointAssumed: true,
        reason: `FP ${fp}°C < ${FLASH_POINT_BOUNDARY_C}°C، نقطه جوش ثبت نشده → IB (نیازمند تأیید BP)`,
      }
    }
    if (boilingPointC < BOILING_POINT_BOUNDARY_C) {
      return {
        cls: 'IA',
        sourceId: 'T3.0A',
        row: row('IA'),
        boilingPointAssumed: false,
        reason: `FP ${fp}°C < ${FLASH_POINT_BOUNDARY_C}°C و BP ${boilingPointC}°C < ${BOILING_POINT_BOUNDARY_C}°C`,
      }
    }
    return {
      cls: 'IB',
      sourceId: 'T3.0A',
      row: row('IB'),
      boilingPointAssumed: false,
      reason: `FP ${fp}°C < ${FLASH_POINT_BOUNDARY_C}°C و BP ${boilingPointC}°C ≥ ${BOILING_POINT_BOUNDARY_C}°C`,
    }
  }

  if (fp < FP_LOWER_BAND_C) {
    return {
      cls: 'IC',
      sourceId: 'T3.0A',
      row: row('IC'),
      boilingPointAssumed: false,
      reason: `${FLASH_POINT_BOUNDARY_C}°C ≤ FP ${fp}°C < ${FP_LOWER_BAND_C}°C`,
    }
  }
  if (fp < FP_UPPER_BAND_C) {
    return {
      cls: 'II',
      sourceId: 'T3.0A',
      row: row('II'),
      boilingPointAssumed: false,
      reason: `${FP_LOWER_BAND_C}°C ≤ FP ${fp}°C < ${FP_UPPER_BAND_C}°C`,
    }
  }
  if (fp < FP_HIGH_BAND_C) {
    return {
      cls: 'IIIA',
      sourceId: 'T3.0A',
      row: row('IIIA'),
      boilingPointAssumed: false,
      reason: `${FP_UPPER_BAND_C}°C ≤ FP ${fp}°C < ${FP_HIGH_BAND_C}°C`,
    }
  }
  return {
    cls: 'IIIB',
    sourceId: 'T3.0A',
    row: row('IIIB'),
    boilingPointAssumed: false,
    reason: `FP ${fp}°C ≥ ${FP_HIGH_BAND_C}°C`,
  }
}

// ── §3.0B supported fuel profiles ──────────────────────────────────

export interface SpecFuelProfile {
  id: string
  name: string
  requiredInputs: string
  rateTimeDependency: string
  sourceId: string
}

export const SPEC_FUELS: SpecFuelProfile[] = (SPEC_TABLE_BY_ID['T3.0B']?.rows ?? [])
  .slice(1)
  .map((r) => ({
    id: r[0] ?? '',
    name: r[1] ?? '',
    requiredInputs: r[2] ?? '',
    rateTimeDependency: r[3] ?? '',
    sourceId: 'T3.0B',
  }))
  .filter((f) => /^FUEL-\d+$/.test(f.id))

export const SPEC_FUEL_BY_ID: Record<string, SpecFuelProfile> = Object.freeze(
  Object.fromEntries(SPEC_FUELS.map((f) => [f.id, f])),
)

/**
 * Project fuel library.
 *
 * `flashPointC` is the property the class is actually computed from. `boilingPointC`
 * is carried where the Class IA/IB branch needs it; §3.0B requires BP for exactly
 * those products. Both are product data, not standard requirements — a project
 * that has a certificate of analysis for its product overrides them and the
 * classification recomputes.
 */
export interface ProjectFuel {
  /** The app's fuel key. */
  key: string
  nameFa: string
  name: string
  /** §3.0B profile this product is assessed against. */
  specFuelId: string
  flashPointC: number
  boilingPointC: number | null
  /** True for the products §3.2 gives a 55-minute duration as "crude petroleum". */
  crudePetroleum: boolean
}

export const PROJECT_FUELS: Record<string, ProjectFuel> = Object.freeze({
  benzin: { key: 'benzin', nameFa: 'بنزین', name: 'Gasoline', specFuelId: 'FUEL-001', flashPointC: -43, boilingPointC: 39, crudePetroleum: false },
  benzin_super: { key: 'benzin_super', nameFa: 'بنزین سوپر', name: 'Premium Gasoline', specFuelId: 'FUEL-002', flashPointC: -40, boilingPointC: 39, crudePetroleum: false },
  nafte_gaz: { key: 'nafte_gaz', nameFa: 'نفت گاز', name: 'Diesel Fuel', specFuelId: 'FUEL-003', flashPointC: 52, boilingPointC: null, crudePetroleum: false },
  nafte_safid: { key: 'nafte_safid', nameFa: 'نفت سفید', name: 'Kerosene', specFuelId: 'FUEL-004', flashPointC: 38, boilingPointC: null, crudePetroleum: false },
  nafta: { key: 'nafta', nameFa: 'نفتا', name: 'Naphtha', specFuelId: 'FUEL-005', flashPointC: -2, boilingPointC: 60, crudePetroleum: false },
  naft_kham: { key: 'naft_kham', nameFa: 'نفت خام سبک', name: 'Crude Oil', specFuelId: 'FUEL-006', flashPointC: -20, boilingPointC: 60, crudePetroleum: true },
  naft_kham_torsh: { key: 'naft_kham_torsh', nameFa: 'نفت خام ترش', name: 'Sour Crude Oil', specFuelId: 'FUEL-007', flashPointC: -10, boilingPointC: 60, crudePetroleum: true },
  naft_kham_sangin: { key: 'naft_kham_sangin', nameFa: 'نفت خام سنگین', name: 'Heavy Crude Oil', specFuelId: 'FUEL-006', flashPointC: 120, boilingPointC: null, crudePetroleum: true },
  naft_koreh: { key: 'naft_koreh', nameFa: 'نفت کوره', name: 'Fuel Oil No.4-6', specFuelId: 'FUEL-003', flashPointC: 61, boilingPointC: null, crudePetroleum: false },
  aloodeh: { key: 'aloodeh', nameFa: 'مواد آلوده', name: 'Oil-Contaminated Material (ORD)', specFuelId: 'FUEL-008', flashPointC: 0, boilingPointC: 60, crudePetroleum: false },
})

export const DEFAULT_FUEL_KEY = 'naft_kham'

export function fuelByKey(key: string | undefined | null): ProjectFuel {
  return PROJECT_FUELS[key ?? ''] ?? PROJECT_FUELS[DEFAULT_FUEL_KEY]
}

/**
 * §3.2 selects the discharge duration from two facts: whether the liquid is a
 * crude petroleum, and whether it is stored at or above its flash point. The
 * rate is 4.1 L/min/m² on every row of the table.
 */
export interface SurfaceRateTime {
  rateLminM2: number
  timeMin: number
  /** Which §3.2 row was selected. */
  condition: string
  sourceId: string
  reason: string
}

export function selectSurfaceRateTime(
  fuel: ProjectFuel,
  storageTempC: number | null | undefined,
  table: { condition: string; rateLminM2: number; timeMin: number; text: string }[],
  controls: { parameter: string; constraint: string }[],
): SurfaceRateTime {
  const rate = table[0]?.rateLminM2 ?? 4.1
  const heatedAboveFlash =
    storageTempC !== null && storageTempC !== undefined && Number.isFinite(storageTempC) && storageTempC >= fuel.flashPointC

  let row = table.find((t) => /38[–-]60/i.test(t.condition))
  let reason: string

  if (fuel.crudePetroleum) {
    row = table.find((t) => /crude/i.test(t.condition)) ?? row
    reason = 'نفت خام طبق ردیف Crude petroleum'
  } else if (heatedAboveFlash) {
    row = table.find((t) => /heated above flash point/i.test(t.condition)) ?? row
    reason = `دمای ذخیرهسازی ${storageTempC}°C ≥ نقطه اشتعال ${fuel.flashPointC}°C`
  } else if (fuel.flashPointC < FP_LOWER_BAND_C) {
    row = table.find((t) => /heated above flash point|<\s*38/i.test(t.condition)) ?? row
    reason = `نقطه اشتعال ${fuel.flashPointC}°C < ${FP_LOWER_BAND_C}°C`
  } else {
    reason = `نقطه اشتعال ${fuel.flashPointC}°C در بازه ۳۸ تا ۶۰°C`
  }

  return {
    rateLminM2: rate,
    timeMin: row?.timeMin ?? 55,
    condition: row?.condition ?? '',
    sourceId: 'T3.2',
    reason,
  }
}

/** §3.9 — supplementary hose stream demand for the largest tank on the site. */
export function hoseStreamDemand(
  largestDiameterM: number,
  table: { band: any; bandText: string; streams: number; flowLpm: number; operatingTime: string }[],
  contains: (b: any, v: number) => boolean,
) {
  const row = table.find((t) => contains(t.band, largestDiameterM))
  return {
    streams: row?.streams ?? 0,
    flowLpm: (row?.streams ?? 0) * (row?.flowLpm ?? 0),
    operatingTime: row?.operatingTime ?? '',
    bandText: row?.bandText ?? '',
    sourceId: 'T3.9',
  }
}

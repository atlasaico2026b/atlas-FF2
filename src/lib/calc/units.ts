// SPDX-License-Identifier: Apache-2.0
// ═══════════════════════════════════════════════════════════════════
// UNIT-AWARE LAYER
//
// Every physical value carries its dimension. Values are stored
// canonically in SI; conversion happens only at the boundary (input
// parsing and output formatting). A dimension mismatch, a non-finite
// value or a non-positive magnitude where positivity is required is
// rejected with a typed error rather than silently producing NaN.
//
// Reference data (physical constants) is declared here once so no
// formula re-declares its own copy.
// ═══════════════════════════════════════════════════════════════════

/** Physical dimension of a quantity. Arithmetic between dimensions is checked. */
export type Dimension =
  | 'length'
  | 'area'
  | 'volume'
  | 'time'
  | 'flow'
  | 'velocity'
  | 'pressure'
  | 'head'
  | 'density'
  | 'power'
  | 'applicationRate'
  | 'ratio'

export interface UnitDef<D extends Dimension> {
  dim: D
  symbol: string
  label: string
  /** SI = value * scale (+ offset). */
  scale: number
  offset: number
}

function unit<D extends Dimension>(
  dim: D,
  symbol: string,
  label: string,
  scale = 1,
  offset = 0,
): UnitDef<D> {
  return { dim, symbol, label, scale, offset }
}

// ─── Reference constants ───────────────────────────────────────────
/** Standard gravity. */
export const G = 9.80665
/** Density of water at 20 °C. */
export const WATER_DENSITY_20C = 998.2
/** Customary rounded water density used by the project defaults. */
export const WATER_DENSITY_CUSTOMARY = 1000
/** Atmospheric pressure, for reference. */
export const ATM_PA = 101325

// ─── Unit registry ─────────────────────────────────────────────────
export const U = {
  length: {
    m: unit('length', 'm', 'متر'),
    mm: unit('length', 'mm', 'میلی‌متر', 1e-3),
    cm: unit('length', 'cm', 'سانتی‌متر', 1e-2),
    ft: unit('length', 'ft', 'فوت', 0.3048),
    in: unit('length', 'in', 'اینچ', 0.0254),
  },
  area: {
    m2: unit('area', 'm²', 'متر مربع'),
    cm2: unit('area', 'cm²', 'سانتی‌متر مربع', 1e-4),
    ft2: unit('area', 'ft²', 'فوت مربع', 0.09290304),
  },
  volume: {
    m3: unit('volume', 'm³', 'متر مکعب'),
    L: unit('volume', 'L', 'لیتر', 1e-3),
    galUS: unit('volume', 'gal', 'گالن آمریکایی', 3.785411784e-3),
  },
  time: {
    s: unit('time', 's', 'ثانیه'),
    min: unit('time', 'min', 'دقیقه', 60),
    h: unit('time', 'h', 'ساعت', 3600),
  },
  flow: {
    m3s: unit('flow', 'm³/s', 'متر مکعب بر ثانیه'),
    Ls: unit('flow', 'L/s', 'لیتر بر ثانیه', 1e-3),
    Lmin: unit('flow', 'L/min', 'لیتر بر دقیقه', 1 / 60000),
    m3h: unit('flow', 'm³/h', 'متر مکعب بر ساعت', 1 / 3600),
    gpm: unit('flow', 'gpm', 'گالن آمریکایی بر دقیقه', 3.785411784e-3 / 60),
  },
  velocity: {
    ms: unit('velocity', 'm/s', 'متر بر ثانیه'),
    fts: unit('velocity', 'ft/s', 'فوت بر ثانیه', 0.3048),
  },
  pressure: {
    Pa: unit('pressure', 'Pa', 'پاسکال'),
    kPa: unit('pressure', 'kPa', 'کیلوپاسکال', 1e3),
    bar: unit('pressure', 'bar', 'بار', 1e5),
    psi: unit('pressure', 'psi', 'پام بر اینچ مربع', 6894.757293168),
  },
  head: {
    m: unit('head', 'm', 'متر ستون آب'),
    mm: unit('head', 'mm', 'میلی‌متر ستون آب', 1e-3),
    ft: unit('head', 'ft', 'فوت ستون آب', 0.3048),
  },
  density: {
    kgm3: unit('density', 'kg/m³', 'کیلوگرم بر متر مکعب'),
    kgL: unit('density', 'kg/L', 'کیلوگرم بر لیتر', 1e3),
  },
  power: {
    W: unit('power', 'W', 'وات'),
    kW: unit('power', 'kW', 'کیلووات', 1e3),
    hp: unit('power', 'hp', 'اسب بخار مکانیکی', 745.6998715822702),
    metricHp: unit('power', 'PS', 'اسب بخار متریک', 735.49875),
  },
  applicationRate: {
    /** 1 L/min/m² of water ≡ 1 mm/min of rainfall — the same physical rate. */
    LminM2: unit('applicationRate', 'L/min/m²', 'لیتر بر دقیقه بر متر مربع'),
    mmMin: unit('applicationRate', 'mm/min', 'میلی‌متر بر دقیقه'),
    /** 1 gpm/ft² = 3.785411784 L/min / 0.09290304 m² = 40.7458335775 L/min/m². */
    gpmFt2: unit('applicationRate', 'gpm/ft²', 'گالن بر دقیقه بر فوت مربع', 40.7458335775003),
  },
  ratio: {
    one: unit('ratio', '—', 'بدون بعد'),
    pct: unit('ratio', '%', 'درصد', 1e-2),
  },
} as const

// ─── Errors ────────────────────────────────────────────────────────
export type InputErrorCode =
  | 'missing'
  | 'non_finite'
  | 'non_positive'
  | 'out_of_range'
  | 'dimension_mismatch'
  | 'unresolved_applicability'

/**
 * Thrown when a calculation is asked to proceed on an input that is absent,
 * non-finite, non-positive, out of range or of the wrong dimension.
 *
 * The validation layer turns these into user-facing blocking errors; nothing
 * downstream is allowed to substitute a fabricated value.
 */
export class CalcInputError extends Error {
  readonly code: InputErrorCode
  readonly field: string
  constructor(code: InputErrorCode, field: string, message: string) {
    super(message)
    this.name = 'CalcInputError'
    this.code = code
    this.field = field
  }
}

// ─── Quantity ──────────────────────────────────────────────────────
export interface Quantity<D extends Dimension> {
  dim: D
  /** Canonical SI magnitude. */
  si: number
  /** Unit the value was declared in (kept for reporting). */
  unit: UnitDef<D>
}

/** Build a quantity from a value declared in `unit`. */
export function q<D extends Dimension>(value: number, unit: UnitDef<D>): Quantity<D> {
  return { dim: unit.dim, si: value * unit.scale + unit.offset, unit }
}

/** Build a quantity from an already-canonical SI magnitude. */
export function qSI<D extends Dimension>(si: number, unit: UnitDef<D>): Quantity<D> {
  return { dim: unit.dim, si, unit }
}

/** Express a quantity in `unit`. */
export function val<D extends Dimension>(quantity: Quantity<D>, unit: UnitDef<D>): number {
  if (quantity.dim !== unit.dim) {
    throw new CalcInputError(
      'dimension_mismatch',
      'unit',
      `cannot express a ${quantity.dim} value in ${unit.symbol} (${unit.dim})`,
    )
  }
  return (quantity.si - unit.offset) / unit.scale
}

/** Convert a bare number between two units of the same dimension. */
export function convert<D extends Dimension>(value: number, from: UnitDef<D>, to: UnitDef<D>): number {
  if (from.dim !== to.dim) {
    throw new CalcInputError(
      'dimension_mismatch',
      'unit',
      `cannot convert ${from.symbol} (${from.dim}) to ${to.symbol} (${to.dim})`,
    )
  }
  return ((value * from.scale + from.offset) - to.offset) / to.scale
}

export function fmt<D extends Dimension>(quantity: Quantity<D>, digits = 3): string {
  return `${Number(val(quantity, quantity.unit).toFixed(digits))} ${quantity.unit.symbol}`
}

/** Render an `Equation`-style substitution with a consistent unit suffix. */
export function fmtNum(value: number, digits = 3): string {
  return String(Number(value.toFixed(digits)))
}

// ─── Guards ────────────────────────────────────────────────────────
export function assertFinite(value: number, field: string): number {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    throw new CalcInputError('missing', field, `${field} is missing or not a number`)
  }
  if (!Number.isFinite(value)) {
    throw new CalcInputError('non_finite', field, `${field} must be finite (got ${value})`)
  }
  return value
}

export function assertPositive(value: number, field: string): number {
  assertFinite(value, field)
  if (value <= 0) {
    throw new CalcInputError('non_positive', field, `${field} must be greater than zero (got ${value})`)
  }
  return value
}

export function assertNonNegative(value: number, field: string): number {
  assertFinite(value, field)
  if (value < 0) {
    throw new CalcInputError('non_positive', field, `${field} must not be negative (got ${value})`)
  }
  return value
}

export function assertRange(value: number, field: string, min: number, max: number): number {
  assertFinite(value, field)
  if (value < min || value > max) {
    throw new CalcInputError('out_of_range', field, `${field} must be within [${min}, ${max}] (got ${value})`)
  }
  return value
}

/** Positive value expressed in `unit`, returned canonically in SI. */
export function requirePositive<D extends Dimension>(
  value: number,
  unit: UnitDef<D>,
  field: string,
): Quantity<D> {
  assertPositive(value, `${field} [${unit.symbol}]`)
  return q(value, unit)
}

// ─── Pressure ⇄ head ───────────────────────────────────────────────
/**
 * Hydrostatic head equivalent of a pressure: h = P / (ρ·g).
 *
 * The conversion is density-dependent, so it is a function rather than a unit
 * scale — that is what stops a bar value being added to a metre value.
 */
export function pressureToHead(pressurePa: number, densityKgm3: number, g = G): number {
  assertFinite(pressurePa, 'pressure')
  assertPositive(densityKgm3, 'density')
  return pressurePa / (densityKgm3 * g)
}

export function headToPressure(headM: number, densityKgm3: number, g = G): number {
  assertFinite(headM, 'head')
  assertPositive(densityKgm3, 'density')
  return headM * densityKgm3 * g
}

// ─── Dimension helpers ─────────────────────────────────────────────
export function sameDimension(a: UnitDef<Dimension>, b: UnitDef<Dimension>): boolean {
  return a.dim === b.dim
}

/** Ratio of two quantities of the same dimension (dimensionless). */
export function ratioOf<D extends Dimension>(a: Quantity<D>, b: Quantity<D>): number {
  if (a.dim !== b.dim) {
    throw new CalcInputError('dimension_mismatch', 'ratio', `cannot divide ${a.dim} by ${b.dim}`)
  }
  assertPositive(b.si, 'ratio denominator')
  return a.si / b.si
}

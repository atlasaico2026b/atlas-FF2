// Fire-fighting calculation basis.
//
// Every type, value and table in this file comes from one document —
// «دستورالعمل نهایی برای موتور محاسبات شوگو». Nothing outside it is
// implemented here: no external standard, no additional formula, coefficient,
// design assumption, capability or output. The section markers in the comments
// point at the paragraph each value was taken from.

// ── §۲ دستهبندی مواد نفتی ────────────────────────────────────────────────────

export type FuelGroup = 'alpha' | 'beta'

export interface FireFuel {
  key: string
  nameFa: string
  group: FuelGroup
}

/**
 * §۲ — exactly the products the instruction names, split into exactly the two
 * groups it defines. No further product is offered.
 */
export const FIRE_FUELS: readonly FireFuel[] = Object.freeze([
  { key: 'benzin', nameFa: 'بنزین موتور', group: 'alpha' },
  { key: 'nafte_safid', nameFa: 'نفت سفید', group: 'alpha' },
  { key: 'naft_kham_torsh', nameFa: 'نفت خام ترش', group: 'alpha' },
  { key: 'naft_kham', nameFa: 'نفت خام سبک', group: 'alpha' },
  { key: 'aloodeh', nameFa: 'مواد آلوده نفتی', group: 'alpha' },
  { key: 'naft_koreh', nameFa: 'نفت کوره', group: 'beta' },
  { key: 'naft_kham_sangin', nameFa: 'نفت خام سنگین', group: 'beta' },
  { key: 'nafte_gaz', nameFa: 'گازوئیل یا نفتگاز', group: 'beta' },
])

export const GROUP_LABEL: Record<FuelGroup, string> = {
  alpha: 'گروه Alpha',
  beta: 'گروه Beta',
}

export function fuelByKey(key: string | null | undefined): FireFuel | null {
  return FIRE_FUELS.find((f) => f.key === key) ?? null
}

// ── نوع سقف و سناریوی اطفا ───────────────────────────────────────────────────

export type RoofType = 'fixed' | 'external_floating' | 'internal_floating'

export const ROOF_TYPES: readonly { id: RoofType; label: string }[] = Object.freeze([
  { id: 'fixed', label: 'سقف ثابت' },
  { id: 'external_floating', label: 'شناور خارجی' },
  { id: 'internal_floating', label: 'شناور داخلی' },
])

export type ScenarioId =
  | 'foam_chamber'
  | 'monitor_handhose'
  | 'sunk_full_surface'
  | 'top_of_seal'
  | 'below_the_seal'
  | 'internal_seal'

export interface ScenarioDef {
  id: ScenarioId
  roofType: RoofType
  label: string
  /** §۳–§۵ — the rate. */
  rateLminM2: number
  /**
   * §۳/§۴/§۵ discharge duration. `null` where the instruction states no
   * duration for the scenario — §۴-الف gives a rate only, so no duration may
   * be assumed for it.
   */
  durationAlphaMin: number | null
  durationBetaMin: number | null
  /** Which protected area the scenario applies to. */
  area: 'full' | 'annular'
  section: string
}

export const SCENARIOS: readonly ScenarioDef[] = Object.freeze([
  {
    id: 'foam_chamber',
    roofType: 'fixed',
    label: 'فوم‌چمبر',
    rateLminM2: 4.1,
    durationAlphaMin: 55,
    durationBetaMin: 30,
    area: 'full',
    section: '§۳-الف',
  },
  {
    id: 'monitor_handhose',
    roofType: 'fixed',
    label: 'مانیتور یا هوزدستی',
    rateLminM2: 6.5,
    durationAlphaMin: 65,
    durationBetaMin: 50,
    area: 'full',
    section: '§۳-ب',
  },
  {
    id: 'sunk_full_surface',
    roofType: 'external_floating',
    label: 'غرق‌شدن سقف و حریق سطح کامل',
    rateLminM2: 4.1,
    durationAlphaMin: null,
    durationBetaMin: null,
    area: 'full',
    section: '§۴-الف',
  },
  {
    id: 'top_of_seal',
    roofType: 'external_floating',
    label: 'تزریق فوم روی ناحیه سیل (Top-of-Seal)',
    rateLminM2: 12.2,
    durationAlphaMin: 20,
    durationBetaMin: 20,
    area: 'annular',
    section: '§۴-ب',
  },
  {
    id: 'below_the_seal',
    roofType: 'external_floating',
    label: 'تزریق فوم زیر ناحیه سیل (Below-the-Seal)',
    rateLminM2: 20.4,
    durationAlphaMin: 10,
    durationBetaMin: 10,
    area: 'annular',
    section: '§۴-ج',
  },
  {
    id: 'internal_seal',
    roofType: 'internal_floating',
    label: 'سیل (حریق ناحیه سیل)',
    rateLminM2: 12.2,
    durationAlphaMin: 20,
    durationBetaMin: 20,
    area: 'annular',
    section: '§۵',
  },
])

export function scenariosForRoof(roof: RoofType | null): ScenarioDef[] {
  if (!roof) return []
  return SCENARIOS.filter((s) => s.roofType === roof)
}

export function scenarioById(id: ScenarioId | null | undefined): ScenarioDef | null {
  return SCENARIOS.find((s) => s.id === id) ?? null
}

/** §۴-ب/§۴-ج/§۵ — «عرض ناحیه: 0.6 متر یا مقدار ورودی W». */
export const SEAL_WIDTH_DEFAULT_M = 0.6

// ── §۳-الف جدول حداقل تعداد فومچمبر ─────────────────────────────────────────

export interface ChamberBand {
  /** Upper bound of the band, exclusive of the previous band's bound. */
  upToM: number
  minChambers: number
}

export const CHAMBER_BANDS: readonly ChamberBand[] = Object.freeze([
  { upToM: 24, minChambers: 1 },
  { upToM: 37, minChambers: 2 },
  { upToM: 43, minChambers: 3 },
  { upToM: 49, minChambers: 4 },
  { upToM: 55, minChambers: 5 },
  { upToM: 61, minChambers: 6 },
])

/** «بیشتر از 61 متر» — 6 عدد به‌علاوه یک عدد به ازای هر 465 مترمربع مساحت اضافی. */
export const CHAMBER_BEYOND_M = 61
export const CHAMBER_AREA_STEP_M2 = 465
export const CHAMBER_BASE_COUNT = 6

/**
 * §۳-الف — minimum foam-chamber count for a tank diameter, with the rounding
 * the instruction requires («به عدد صحیح بالاتر گرد کن»).
 *
 * The area figure is passed in so the caller owns the single definition of the
 * protected area; the band edges alone do not determine the count above 61 m.
 */
export function minFoamChambers(diameterM: number, fullAreaM2: number): number {
  if (!Number.isFinite(diameterM) || diameterM <= 0) return 0
  for (const band of CHAMBER_BANDS) {
    if (diameterM <= band.upToM) return band.minChambers
  }
  const boundaryArea = (Math.PI / 4) * CHAMBER_BEYOND_M ** 2
  const additionalArea = Math.max(0, fullAreaM2 - boundaryArea)
  return CHAMBER_BASE_COUNT + Math.ceil(additionalArea / CHAMBER_AREA_STEP_M2)
}

// ── §۶ فوم ───────────────────────────────────────────────────────────────────

export interface Concentration {
  percent: number
  fraction: number
  label: string
}

/** §۶ — C = 0.03 for 3% foam and 0.06 for 6% foam; both are computed. */
export const CONCENTRATIONS: readonly Concentration[] = Object.freeze([
  { percent: 3, fraction: 0.03, label: 'فوم ۳٪' },
  { percent: 6, fraction: 0.06, label: 'فوم ۶٪' },
])

// ── §۷ کولینگ ────────────────────────────────────────────────────────────────

export const COOLING_RATE_LMIN_M2 = 4.1
export const COOLING_DURATION_MIN = 240

// ── §۹ ضریب اطمینان ──────────────────────────────────────────────────────────

export const SAFETY_FACTOR = 1.2

// ── §۱۰ انتخاب سایز لوله (هیزن–ویلیامز) ──────────────────────────────────────

/**
 * پارامتر طراحی موتور برای انتخاب خودکار سایز لوله: سرعت مجاز جریان آب آتش‌نشانی.
 * سایز انتخابی کوچک‌ترین قطری است که این حد را رعایت کند.
 */
export const MAX_VELOCITY_M_S = 5

/** قطرهای نامی استاندارد (mm) که برای انتخاب سایز بررسی می‌شوند. */
export const PIPE_LIBRARY_MM: readonly number[] = Object.freeze([
  50, 65, 80, 100, 125, 150, 200, 250, 300, 350, 400, 450, 500, 600,
])

// ── آب ───────────────────────────────────────────────────────────────────────

/** kg/m³ — used only to turn head into pressure for the pump outlet. */
export const WATER_DENSITY_KG_M3 = 1000
export const GRAVITY_M_S2 = 9.80665

// Bilingual support (Persian / English).
//
// The two languages are kept strictly apart: every visible string comes from
// this dictionary, and the document direction flips with the language. Latin
// technical tokens (Direct Spray, Rundown, Alpha/Beta, unit symbols) stay Latin
// in both languages — they are names, not prose — while every sentence around
// them is written out in the active language.
//
// The calculation engine keeps its own Persian labels (it is the specification's
// own vocabulary); the screens translate by id, so the engine never has to hold
// presentation text for two languages.

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'

export type Lang = 'fa' | 'en'

const STORAGE_KEY = 'atlas_lang'

type Entry = { fa: string; en: string }

const DICT: Record<string, Entry> = {
  // ── app shell ──────────────────────────────────────────────────────────────
  'app.name': { fa: 'اطلس', en: 'Atlas' },
  'app.tagline': {
    fa: 'نرم‌افزار طراحی سیستم‌های ایمنی و آتش‌نشانی',
    en: 'Fire & Safety System Design',
  },
  'app.lang.toggle': { fa: 'English', en: 'فارسی' },
  'app.lang.switchTo': { fa: 'تغییر زبان به انگلیسی', en: 'Switch language to Persian' },
  'app.back': { fa: 'بازگشت', en: 'Back' },

  // ── access gate ────────────────────────────────────────────────────────────
  'auth.title': { fa: 'ورود به سامانه', en: 'Sign in' },
  'auth.username': { fa: 'نام کاربری', en: 'Username' },
  'auth.password': { fa: 'رمز عبور', en: 'Password' },
  'auth.submit': { fa: 'ورود', en: 'Sign in' },
  'auth.guest': { fa: 'ورود مهمان', en: 'Continue as guest' },
  'auth.error': { fa: 'نام کاربری یا رمز عبور نادرست است', en: 'Wrong username or password' },
  'auth.role.admin': { fa: 'مدیر', en: 'Administrator' },
  'auth.role.user': { fa: 'کاربر', en: 'User' },
  'auth.guestName': { fa: 'کاربر مهمان', en: 'Guest' },

  // ── landing ────────────────────────────────────────────────────────────────
  'landing.enter': { fa: 'ورود به برنامه', en: 'Enter the application' },
  'landing.subtitle': {
    fa: 'محاسبات اطفا و کولینگ مخازن بر پایهٔ دستورالعمل مرجع',
    en: 'Tank fire-fighting and cooling calculations from the reference instruction',
  },
  'landing.title': { fa: 'طراحی سیستم‌های ایمنی و آتش‌نشانی', en: 'Fire & Safety System Design' },
  'landing.desc': {
    fa: 'نرم‌افزار هوشمند طراحی سیستم‌های اطفاء حریق، خنک‌کاری و ایمنی صنعتی',
    en: 'Intelligent design of fire-fighting, cooling and industrial safety systems',
  },
  'landing.standards': { fa: 'استانداردها', en: 'Standards' },
  'landing.ai': { fa: 'هوش مصنوعی', en: 'AI' },
  'landing.auto': { fa: 'طراحی خودکار', en: 'Automated design' },
  'landing.opt': { fa: 'بهینه‌سازی', en: 'Optimisation' },
  'landing.precise': { fa: 'محاسبات دقیق', en: 'Precise calculation' },
  'landing.credit': { fa: 'طراحی و برنامه‌نویسی: سپهر ممبینی', en: 'Designed by Sepehr Mombini' },

  // ── dashboard ──────────────────────────────────────────────────────────────
  'dash.title': { fa: 'میزکار', en: 'Dashboard' },
  'dash.calc': { fa: 'محاسبات اطفا', en: 'Fire calculations' },
  'dash.calc.desc': {
    fa: 'محاسبهٔ ۱۷ خروجی بر پایهٔ دستورالعمل مرجع',
    en: 'Compute the seventeen outputs from the reference instruction',
  },
  'dash.projects': { fa: 'پروژه‌ها', en: 'Projects' },
  'dash.logout': { fa: 'خروج', en: 'Sign out' },
  'dash.newProject': { fa: 'پروژهٔ جدید', en: 'New project' },
  'dash.empty': { fa: 'هنوز پروژه‌ای ساخته نشده', en: 'No project yet' },
  'dash.appTitle': {
    fa: 'اطلس — طراحی سیستم‌های ایمنی و آتش‌نشانی',
    en: 'Atlas — Fire & Safety System Design',
  },
  'dash.standards': { fa: 'استانداردها', en: 'Standards' },
  'dash.openProject': { fa: 'باز کردن پروژه', en: 'Open project' },
  'dash.loading': { fa: 'در حال بارگذاری...', en: 'Loading…' },
  'dash.noProjects': { fa: 'هنوز پروژه‌ای وجود ندارد', en: 'There is no project yet' },
  'dash.noProjectsHint': {
    fa: 'برای شروع، یک پروژه جدید ایجاد کنید',
    en: 'Create a new project to begin',
  },
  'dash.saveAtlas': { fa: 'ذخیره .atlas', en: 'Save .atlas' },
  'dash.copy': { fa: 'کپی', en: 'Copy' },
  'dash.delete': { fa: 'حذف', en: 'Delete' },
  'dash.searchStandards': { fa: 'جستجوی استاندارد...', en: 'Search standards…' },
  'dash.adminName': { fa: 'مدیر سیستم', en: 'System administrator' },

  // ── calculation screen: structure ──────────────────────────────────────────
  'calc.title': { fa: 'محاسبات اطفا و کولینگ', en: 'Fire-fighting & cooling calculations' },
  'calc.step1': { fa: '۱. مشخصات مخزن و سناریو', en: '1. Tank data and scenario' },
  'calc.step2': { fa: '۲. باندوال (§۱)', en: '2. Bundwall (§1)' },
  'calc.step3': { fa: '۳. تجهیزات اطفا', en: '3. Fire-fighting equipment' },
  'calc.step4': { fa: '۴. تجهیزات مجاور (سناریوی Worst Case)', en: '4. Adjacent equipment (worst case)' },
  'calc.step5': { fa: '۵. داده‌های هیدرولیکی سایت (§۱۰)', en: '5. Site hydraulic data (§10)' },
  'calc.step6': { fa: '۶. سیستم کولینگ (§۱۱)', en: '6. Cooling system (§11)' },
  'calc.run': { fa: 'محاسبه', en: 'Calculate' },
  'calc.results': { fa: 'خروجی‌های محاسبه', en: 'Calculation outputs' },
  'calc.outputsCount': { fa: 'خروجی', en: 'outputs' },
  'calc.basis': { fa: 'مبنای محاسبه', en: 'Calculation basis' },
  'calc.missing': { fa: 'داده‌های لازم', en: 'Required data' },
  'calc.missingAll': { fa: 'ورودی‌های لازم برای شروع محاسبه:', en: 'Inputs required before the calculation:' },
  'calc.notes': { fa: 'یادداشت‌ها', en: 'Notes' },
  'calc.group': { fa: 'گروه', en: 'Group' },
  'calc.coolingBothModes': {
    fa: 'هر دو حالت Direct Spray و Rundown جداگانه محاسبه می‌شوند تا انتخاب کنید کدام اجرا شود.',
    en: 'Both Direct Spray and Rundown are computed separately so you can choose which one to install.',
  },
  'calc.type': { fa: 'نوع', en: 'Type' },

  // ── fields ─────────────────────────────────────────────────────────────────
  'f.fuel': { fa: 'نوع ماده نفتی', en: 'Product' },
  'f.fuel.hint': { fa: '§۲ دسته‌بندی مواد', en: '§2 product classification' },
  'f.roof': { fa: 'نوع سقف', en: 'Roof type' },
  'f.roof.hint': { fa: '§۳/§۴/§۵', en: '§3 / §4 / §5' },
  'f.roof.placeholder': { fa: 'انتخاب نوع سقف', en: 'Select a roof type' },
  'f.diameter': { fa: 'قطر مخزن D', en: 'Tank diameter D' },
  'f.diameter.hint': { fa: 'متر', en: 'metres' },
  'f.height': { fa: 'ارتفاع مخزن H', en: 'Tank height H' },
  'f.height.hint': { fa: 'متر', en: 'metres' },
  'f.scenario': { fa: 'سناریوی اطفا', en: 'Fire scenario' },
  'f.scenario.placeholder': { fa: 'انتخاب سناریو', en: 'Select a scenario' },
  'f.scenario.needRoof': { fa: 'ابتدا نوع سقف را انتخاب کنید', en: 'Select a roof type first' },
  'f.scenario.hint': { fa: 'متناسب با نوع سقف', en: 'depends on the roof type' },
  'f.sealWidth': { fa: 'عرض ناحیه سیل W', en: 'Rim-seal width W' },
  'f.sealWidth.hint': {
    fa: 'متر — خالی یعنی ۰.۶ (§۴-ب)',
    en: 'metres — blank means 0.6 (§4-b)',
  },
  'f.bundwall.mode': { fa: 'روش ورود', en: 'Entry method' },
  'f.bundwall.area': { fa: 'ورود مساحت', en: 'Enter area' },
  'f.bundwall.lw': { fa: 'از طول × عرض', en: 'From length × width' },
  'f.bundwall.areaM2': { fa: 'مساحت باندوال', en: 'Bundwall area' },
  'f.length': { fa: 'طول', en: 'Length' },
  'f.width': { fa: 'عرض', en: 'Width' },
  'f.model': { fa: 'مدل تجهیز', en: 'Equipment model' },
  'f.model.hint': { fa: '§۳-ب', en: '§3-b' },
  'f.capacity': { fa: 'ظرفیت هر تجهیز', en: 'Capacity per unit' },
  'f.name': { fa: 'نام', en: 'Name' },
  'f.coolingPercent': { fa: 'کولینگ', en: 'Cooling' },
  'f.pipeLength': { fa: 'طول لوله', en: 'Pipe length' },
  'f.pipeDiameter': { fa: 'قطر داخلی لوله', en: 'Pipe internal diameter' },
  'f.pipeDiameter.hint': {
    fa: 'mm — خالی بگذارید تا خودکار انتخاب شود',
    en: 'mm — leave blank to select automatically',
  },
  'f.pipeDiameter.placeholder': { fa: 'انتخاب خودکار', en: 'Automatic' },
  'f.cFactor': { fa: 'ضریب C', en: 'C factor' },
  'f.cFactor.hint': { fa: 'هیزن–ویلیامز', en: 'Hazen-Williams' },
  'f.staticHead': { fa: 'ارتفاع استاتیک', en: 'Static head' },
  'f.residual': { fa: 'فشار باقی‌مانده', en: 'Residual pressure' },
  'f.sprayRing': { fa: 'Direct Spray — فاصله رینگ', en: 'Direct Spray — ring spacing' },
  'f.spraySprinkler': { fa: 'Direct Spray — فاصله اسپرینکلر', en: 'Direct Spray — sprinkler spacing' },
  'f.rundownRing': { fa: 'Rundown — فاصله رینگ', en: 'Rundown — ring spacing' },
  'f.rundownSprinkler': { fa: 'Rundown — فاصله اسپرینکلر', en: 'Rundown — sprinkler spacing' },
  'f.adjacent.add': { fa: 'افزودن تجهیز مجاور', en: 'Add adjacent equipment' },
  'f.adjacent.remove': { fa: 'حذف', en: 'Remove' },

  // ── output status ──────────────────────────────────────────────────────────
  'status.ok': { fa: 'محاسبه‌شده', en: 'Calculated' },
  'status.insufficient': { fa: 'داده کافی نیست', en: 'Insufficient data' },
  'status.na': { fa: 'بی‌ارتباط با سناریو', en: 'Not applicable' },
  'status.not_defined': { fa: 'در مرجع تعریف نشده', en: 'Not defined in the reference' },

  // ── weather ────────────────────────────────────────────────────────────────
  'w.calcFailed': { fa: 'محاسبه انجام نشد', en: 'The calculation did not run' },
}

export function translate(lang: Lang, key: string): string {
  const e = DICT[key]
  if (!e) return key
  return lang === 'fa' ? e.fa : e.en
}

/** The engine's Persian vocabulary, translated by id. */
const ENGINE_TERMS: Record<string, Entry> = {
  // roof types
  'roof.fixed': { fa: 'سقف ثابت', en: 'Fixed roof' },
  'roof.external_floating': { fa: 'شناور خارجی', en: 'External floating roof' },
  'roof.internal_floating': { fa: 'شناور داخلی', en: 'Internal floating roof' },

  // fuel groups
  'group.alpha': { fa: 'گروه Alpha', en: 'Group Alpha' },
  'group.beta': { fa: 'گروه Beta', en: 'Group Beta' },

  // fuels
  'fuel.benzin': { fa: 'بنزین موتور', en: 'Motor gasoline' },
  'fuel.nafte_safid': { fa: 'نفت سفید', en: 'Kerosene' },
  'fuel.naft_kham_torsh': { fa: 'نفت خام ترش', en: 'Sour crude oil' },
  'fuel.naft_kham': { fa: 'نفت خام سبک', en: 'Light crude oil' },
  'fuel.aloodeh': { fa: 'مواد آلوده نفتی', en: 'Oily contaminated material' },
  'fuel.naft_koreh': { fa: 'نفت کوره', en: 'Fuel oil' },
  'fuel.naft_kham_sangin': { fa: 'نفت خام سنگین', en: 'Heavy crude oil' },
  'fuel.nafte_gaz': { fa: 'گازوئیل یا نفت‌گاز', en: 'Gas oil / diesel' },

  // scenarios
  'scenario.foam_chamber': { fa: 'فوم‌چمبر', en: 'Foam chamber' },
  'scenario.monitor_handhose': { fa: 'مانیتور یا هوزدستی', en: 'Monitor or hand hose' },
  'scenario.sunk_full_surface': {
    fa: 'غرق‌شدن سقف و حریق سطح کامل',
    en: 'Sunk roof / full-surface fire',
  },
  'scenario.top_of_seal': {
    fa: 'تزریق فوم روی ناحیه سیل (Top-of-Seal)',
    en: 'Foam injection on the rim seal (top-of-seal)',
  },
  'scenario.below_the_seal': {
    fa: 'تزریق فوم زیر ناحیه سیل (Below-the-Seal)',
    en: 'Foam injection below the rim seal (below-the-seal)',
  },
  'scenario.internal_seal': { fa: 'سیل (حریق ناحیه سیل)', en: 'Rim seal fire' },
}

export function translateEngineTerm(lang: Lang, key: string): string {
  const e = ENGINE_TERMS[key]
  if (!e) return key
  return lang === 'fa' ? e.fa : e.en
}

/** §۱۲ output labels, translated by output id. */
const OUTPUT_TERMS: Record<number, Entry> = {
  1: { fa: 'دبی موردنیاز اطفای فوم', en: 'Required foam-fighting flow' },
  2: { fa: 'دبی موردنیاز کولینگ', en: 'Required cooling flow' },
  3: { fa: 'دبی موردنیاز هر فوم‌چمبر', en: 'Required flow per foam chamber' },
  4: { fa: 'دبی مانیتور یا هوزدستی', en: 'Monitor / hand-hose flow' },
  5: { fa: 'حجم آب موردنیاز فوم ۳٪', en: 'Water volume for 3% foam' },
  6: { fa: 'حجم آب موردنیاز فوم ۶٪', en: 'Water volume for 6% foam' },
  7: { fa: 'حجم آب کولینگ مخزن تحت حریق', en: 'Cooling water for the tank on fire' },
  8: { fa: 'حجم آب کولینگ تجهیزات مجاور', en: 'Cooling water for adjacent equipment' },
  9: { fa: 'حجم آب موردنیاز مانیتور یا هوزدستی', en: 'Water volume for monitor / hand hose' },
  10: {
    fa: 'حجم کل آب موردنیاز عملیات با ضریب اطمینان ۲۰٪',
    en: 'Total operation water with the 20% safety factor',
  },
  11: {
    fa: 'دبی کل موردنیاز عملیات با ضریب اطمینان ۲۰٪',
    en: 'Total operation flow with the 20% safety factor',
  },
  12: { fa: 'دبی و فشار موردنیاز پمپ آتش‌نشانی', en: 'Fire-pump flow and pressure required' },
  13: { fa: 'مشخصات جوکی‌پمپ موردنیاز', en: 'Required jockey-pump specification' },
  14: { fa: 'مدت‌زمان اطفای حریق', en: 'Fire-fighting duration' },
  15: { fa: 'مدت‌زمان کولینگ', en: 'Cooling duration' },
  16: { fa: 'حجم نهایی مخزن ذخیره آب عملیاتی', en: 'Final operational water storage volume' },
  17: {
    fa: 'نوع سیستم کولینگ، تعداد رینگ‌ها و تعداد اسپرینکلرها',
    en: 'Cooling system type, ring count and sprinkler count',
  },
}

export function translateOutput(lang: Lang, id: number, fallback: string): string {
  const e = OUTPUT_TERMS[id]
  if (!e) return fallback
  return lang === 'fa' ? e.fa : e.en
}

// ── context ──────────────────────────────────────────────────────────────────

interface LangContextValue {
  lang: Lang
  dir: 'rtl' | 'ltr'
  setLang: (l: Lang) => void
  t: (key: string) => string
  term: (key: string) => string
  out: (id: number, fallback: string) => string
  text: (engineText: string) => string
  sec: (section: string) => string
}

const LangContext = createContext<LangContextValue | null>(null)

function readStored(): Lang {
  try {
    const v = localStorage.getItem(STORAGE_KEY)
    if (v === 'en' || v === 'fa') return v
  } catch {
    /* ignore */
  }
  return 'fa'
}

export function LangProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>(readStored)

  useEffect(() => {
    const dir = lang === 'fa' ? 'rtl' : 'ltr'
    const root = document.documentElement
    root.setAttribute('lang', lang)
    root.setAttribute('dir', dir)
    root.setAttribute('data-lang', lang)
  }, [lang])

  const setLang = useCallback((l: Lang) => {
    setLangState(l)
    try {
      localStorage.setItem(STORAGE_KEY, l)
    } catch {
      /* ignore */
    }
  }, [])

  const value = useMemo<LangContextValue>(
    () => ({
      lang,
      dir: lang === 'fa' ? 'rtl' : 'ltr',
      setLang,
      t: (key) => translate(lang, key),
      term: (key) => translateEngineTerm(lang, key),
      out: (id, fallback) => translateOutput(lang, id, fallback),
      text: (engineText) => translateEngineText(lang, engineText),
      sec: (section) => translateSection(lang, section),
    }),
    [lang, setLang],
  )

  return <LangContext.Provider value={value}>{children}</LangContext.Provider>
}

export function useLang(): LangContextValue {
  const ctx = useContext(LangContext)
  if (!ctx) {
    // A component used outside the provider still works — it just stays in the
    // default language rather than crashing.
    return {
      lang: 'fa',
      dir: 'rtl',
      setLang: () => {},
      t: (key) => translate('fa', key),
      term: (key) => translateEngineTerm('fa', key),
      out: (_id, fallback) => fallback,
      text: (engineText) => engineText,
      sec: (section) => section,
    }
  }
  return ctx
}

/** Latin technical tokens stay Latin; unit symbols never translate. */
export const LATIN_TOKENS = ['Direct Spray', 'Rundown', 'Alpha', 'Beta'] as const

// ── engine prose ─────────────────────────────────────────────────────────────
//
// The engine writes its "missing input" entries and notes in the reference
// document's own Persian. The screens translate them by exact match, so the
// engine never has to carry two languages and the English view still reads as
// English. An unmapped string falls through unchanged rather than being hidden.

const ENGINE_TEXT: Record<string, string> = {
  'نوع ماده نفتی': 'Product',
  'قطر مخزن (D)': 'Tank diameter (D)',
  'ارتفاع مخزن (H)': 'Tank height (H)',
  'نوع سقف': 'Roof type',
  'سناریوی اطفا': 'Fire scenario',
  'سناریوی سازگار با نوع سقف انتخاب‌شده': 'a scenario compatible with the selected roof',
  'عرض ناحیه سیل (باید کمتر از قطر مخزن باشد)':
    'Rim-seal width (must be less than the tank diameter)',
  'طول لوله': 'Pipe length',
  'ضریب C هیزن–ویلیامز': 'Hazen-Williams C factor',
  'ارتفاع استاتیک': 'Static head',
  'فشار باقی‌مانده در دورترین خروجی': 'Residual pressure at the farthest outlet',
  'قطر لوله بزرگ‌تر از کتابخانه — ورود دستی قطر':
    'Pipe diameter beyond the library — enter it manually',
  'فاصله رینگ/اسپرینکلر حالت Direct Spray': 'Direct Spray ring/sprinkler spacing',
  'فاصله رینگ/اسپرینکلر حالت Rundown': 'Rundown ring/sprinkler spacing',
  'ظرفیت تجهیز مانیتور/هوزدستی': 'Monitor / hand-hose unit capacity',
  'مدت‌زمان تخلیه سناریوی «غرق‌شدن سقف و حریق سطح کامل»':
    'discharge duration for the sunk-roof / full-surface scenario',
  'مدت‌زمان تخلیه سناریوی انتخابی': 'discharge duration for the selected scenario',

  'مدل و ظرفیت تجهیزات مانیتور/هوزدستی ثبت نشده — تعداد تجهیزات محاسبه نشد.':
    'No monitor / hand-hose model or capacity recorded — the unit count was not computed.',
  'ظرفیت تجهیز انتخابی ثبت نشده — §۳-ب اجازه فرض مقدار ثابت را نمی‌دهد.':
    'The selected unit has no capacity — §3-b does not allow assuming a fixed value.',
  'تجهیز مجاوری ثبت نشده — کولینگ تجهیزات مجاور صفر در نظر گرفته شد.':
    'No adjacent equipment recorded — adjacent cooling is taken as zero.',
  'برخی تجهیزات مجاور ناقص‌اند و در جمع کولینگ وارد نشدند.':
    'Some adjacent equipment is incomplete and was left out of the cooling total.',
  'آب اطفای حوضچه محاسبه نشد: دستورالعمل نرخ یا مدتی برای آن تعریف نکرده است.':
    'Bund/pool fire water was not computed: the instruction defines no rate or duration for it.',
  'سناریوی انتخابی خودِ مانیتور/هوزدستی است؛ مصرف آن یک‌بار در جمع لحاظ شد.':
    'The selected scenario is the monitor / hand hose itself; its demand is counted once.',
  'مانیتور/هوزدستی در جمع وارد نشد: تجهیزی ثبت نشده بود.':
    'The monitor / hand hose was not counted: no unit was recorded.',
  'قاعده تعیین مشخصات جوکی‌پمپ در دستورالعمل تعریف نشده؛ مقدار حدس زده نشد':
    'The instruction defines no rule for jockey-pump sizing; no value was guessed',
  'مقدار فرضی ساخته نشد': 'No assumed value was created',
  'قطر نامناسب انتخاب نشد': 'No unsuitable diameter was chosen',
  '§۳-ب مخصوص سقف ثابت است': '§3-b applies to a fixed roof only',
  'ظرفیت ثابت فرض نشد': 'No fixed capacity was assumed',
  'این سناریو فوم‌چمبر ندارد': 'This scenario has no foam chamber',
  'مقدار صفر': 'zero',
  'مبنای سایز مخزن ذخیره': 'basis for the storage-tank size',
  'همان حجم کل §۱۲-۱۰؛ مبنای سایز مخزن ذخیره':
    'the same total as §12-10; basis for the storage-tank size',
  'سقف شناور فقط با فوم‌چمبر اطفا می‌شود؛ مانیتور و شیلنگ دستی برای آن به کار نمی‌رود':
    'A floating roof is fought with foam chambers only; monitors and hand hose are not used on it',
  'کنسانتره ۳٪ جداگانه در جمع آب نیامده است':
    'The 3% concentrate is not added to the water total separately',
  'کنسانتره ۶٪ جداگانه در جمع آب نیامده است':
    'The 6% concentrate is not added to the water total separately',
  'ظرفیت کافی است': 'The capacity is adequate',

  // figure labels the engine owns
  'حجم محلول فوم': 'Foam solution volume',
  'تعداد تجهیز لازم': 'Units required',
  'دبی نصب‌شده (تعداد × ظرفیت)': 'Installed flow (count × capacity)',
  'سایز لوله انتخاب‌شده': 'Selected pipe size',
  'سایز لوله ورودی': 'Entered pipe size',
  'سرعت جریان در لوله': 'Flow velocity in the pipe',
  'افت اصطکاکی hf': 'Friction loss hf',
  'هد کل پمپ': 'Pump total head',
  'دبی پمپ (جمع کل با ضریب اطمینان)': 'Pump flow (total with safety factor)',
  'Direct Spray — تعداد رینگ': 'Direct Spray — ring count',
  'Direct Spray — تعداد آب‌پاش (نازل)': 'Direct Spray — nozzle count',
  'Rundown — تعداد رینگ': 'Rundown — ring count',
  'Rundown — تعداد آب‌پاش (نازل)': 'Rundown — nozzle count',

  'تجهیزی ثبت نشده، پس در جمع §۸ وارد نشد':
    'No unit was recorded, so it was left out of the §8 total',
}

/** §-section identifiers used in hints; the document numbers them in Persian. */
const SECTION_LATIN: Record<string, string> = {
  '§۳': '§3',
  '§۳-الف': '§3-a',
  '§۳-ب': '§3-b',
  '§۴': '§4',
  '§۴-الف': '§4-a',
  '§۴-ب': '§4-b',
  '§۴-ج': '§4-c',
  '§۵': '§5',
  '§۶': '§6',
  '§۷': '§7',
  '§۸': '§8',
  '§۹': '§9',
  '§۱۰': '§10',
  '§۱۱': '§11',
  '§۱۲': '§12',
  '§۱۳': '§13',
}

export function translateSection(lang: Lang, section: string): string {
  if (lang === 'fa') return section
  return SECTION_LATIN[section] ?? section
}

const PERSIAN_DIGITS = '۰۱۲۳۴۵۶۷۸۹'
const latinizeDigits = (s: string) =>
  s.replace(/[۰-۹]/g, (d) => String(PERSIAN_DIGITS.indexOf(d)))

/**
 * Engine prose with an embedded figure — the prefix decides the sentence, the
 * number is carried through unchanged.
 */
const ENGINE_PREFIXES: { re: RegExp; en: (m: RegExpMatchArray) => string }[] = [
  { re: /^حجم کنسانتره ([۰-۹0-9]+)٪$/, en: (m) => `Concentrate volume ${latinizeDigits(m[1])}%` },
  {
    re: /^کنسانتره ([۰-۹0-9]+)٪ جداگانه در جمع آب نیامده است$/,
    en: (m) => `The ${latinizeDigits(m[1])}% concentrate is not added to the water total separately`,
  },
  {
    re: /^مساحت باندوال ثبت‌شده: (.+)$/,
    en: (m) => `Recorded bundwall area: ${latinizeDigits(m[1])}`,
  },
  {
    re: /^قطر (.+?) m → N = (.+)$/,
    en: (m) => `Diameter ${latinizeDigits(m[1])} m → N = ${latinizeDigits(m[2])}`,
  },
  {
    re: /^ظرفیت کافی است: دبی نصب‌شده (.+?) ≥ دبی موردنیاز (.+?) L\/min$/,
    en: (m) =>
      `The capacity is adequate: installed flow ${latinizeDigits(m[1])} ≥ required ${latinizeDigits(m[2])} L/min`,
  },
]

export function translateEngineText(lang: Lang, text: string): string {
  if (lang === 'fa') return text
  const exact = ENGINE_TEXT[text]
  if (exact !== undefined) return exact
  const section = SECTION_LATIN[text]
  if (section !== undefined) return section
  for (const p of ENGINE_PREFIXES) {
    const m = text.match(p.re)
    if (m) return p.en(m)
  }
  return text
}

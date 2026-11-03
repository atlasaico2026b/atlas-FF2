// Renders the real FireCalcScreen and drives it the way a user would — pick a
// product, a roof, a scenario, type the tank, press محاسبه — then reads the
// seventeen outputs off the screen.
//
// Everything asserted here is a JavaScript path that compiles clean and still
// fails at runtime, so only a real render proves it.
import { createRoot } from 'react-dom/client'
import { act } from 'react'
import FireCalcScreen from '../src/components/FireCalcScreen'

const results: string[] = []
let pass = 0
let fail = 0
function check(name: string, ok: boolean, detail = '') {
  if (ok) {
    pass++
    results.push(`PASS  ${name}${detail ? ' :: ' + detail : ''}`)
  } else {
    fail++
    results.push(`FAIL  ${name}${detail ? ' :: ' + detail : ''}`)
  }
}

const setValue = (el: HTMLInputElement, value: string) => {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
  setter?.call(el, value)
  el.dispatchEvent(new Event('input', { bubbles: true }))
}

const buttons = () => Array.from(document.querySelectorAll('button'))

const openList = async (triggerText: string) => {
  const trigger = buttons().find((b) => (b.textContent ?? '').includes(triggerText))
  if (!trigger) throw new Error(`trigger not found: ${triggerText}`)
  await act(async () => { trigger.click() })
}

const chooseItem = async (optionText: string) => {
  const items = Array.from(document.querySelectorAll('div')).filter((d) =>
    d.className.includes('cursor-pointer'))
  const item = items.find((d) => (d.textContent ?? '').includes(optionText))
  if (!item) throw new Error(`option not found: ${optionText}`)
  await act(async () => { (item as HTMLElement).click() })
}

async function pick(triggerText: string, optionText: string) {
  await openList(triggerText)
  await chooseItem(optionText)
}

async function run() {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  await act(async () => { root.render(<FireCalcScreen onBack={() => {}} />) })

  const text0 = host.textContent ?? ''
  check('the screen renders', text0.includes('محاسبات اطفا و کولینگ'))
  check('the scenario selector is inert until a roof is chosen',
    text0.includes('ابتدا نوع سقف را انتخاب کنید'))
  check('no output exists before محاسبه', !text0.includes('خروجی‌های محاسبه'))

  // §۲ — the list the user is actually offered, read from the open list.
  await openList('نوع ماده نفتی')
  const fuelList = host.textContent ?? ''
  const products = ['بنزین موتور', 'نفت سفید', 'نفت خام ترش', 'نفت خام سبک', 'مواد آلوده نفتی',
    'نفت کوره', 'نفت خام سنگین', 'گازوئیل یا نفتگاز']
  // ZWNJ is a typographic choice, not a product name — compare without it.
  const strip = (x: string) => x.replace(/\u200c/g, '')
  const flatFuel = strip(fuelList)
  const productsMissing = products.filter((p) => !flatFuel.includes(strip(p)))
  check('the product list offers all eight products §۲ names',
    productsMissing.length === 0, productsMissing.join(' | ') || '8/8')
  check('and the two groups are labelled on the list',
    fuelList.includes('گروه Alpha') && fuelList.includes('گروه Beta'))
  await chooseItem('نفت خام سبک')
  check('the picked product shows its group',
    (host.textContent ?? '').includes('گروه Alpha'), 'نفت خام سبک → Alpha')

  await pick('انتخاب نوع سقف', 'سقف ثابت')

  // §۳ — only the two fixed-roof scenarios may be offered for a fixed roof.
  await openList('انتخاب سناریو')
  const scenList = host.textContent ?? ''
  check('both fixed-roof scenarios are offered for a fixed roof',
    scenList.includes('فوم‌چمبر') && scenList.includes('مانیتور یا هوزدستی'))
  check('and no floating-roof scenario leaks into that list',
    !scenList.includes('Top-of-Seal') && !scenList.includes('Below-the-Seal'))
  await chooseItem('فوم‌چمبر')
  check('the scenario lands on the trigger',
    (host.textContent ?? '').includes('فوم‌چمبر'))

  const d = document.querySelector('input[placeholder="30"]') as HTMLInputElement | null
  const h = document.querySelector('input[placeholder="15"]') as HTMLInputElement | null
  check('the tank inputs are on the form', !!d && !!h)
  await act(async () => {
    if (d) setValue(d, '30')
    if (h) setValue(h, '15')
  })

  const calc = buttons().find((b) => (b.textContent ?? '').trim() === 'محاسبه')
  check('the محاسبه button exists', !!calc)
  await act(async () => { calc?.click() })

  const text = host.textContent ?? ''
  check('the results section appears', text.includes('خروجی‌های محاسبه'))
  check('exactly seventeen outputs are rendered',
    text.includes('17 خروجی'), (text.match(/(\d+) خروجی/) ?? [])[0])

  // §۱۲ verbatim labels, all seventeen.
  const labels = [
    'دبی موردنیاز اطفای فوم', 'دبی موردنیاز کولینگ', 'دبی موردنیاز هر فوم‌چمبر',
    'دبی مانیتور یا هوزدستی', 'حجم آب موردنیاز فوم ۳٪', 'حجم آب موردنیاز فوم ۶٪',
    'حجم آب کولینگ مخزن تحت حریق', 'حجم آب کولینگ تجهیزات مجاور',
    'حجم آب موردنیاز مانیتور یا هوزدستی', 'حجم کل آب موردنیاز عملیات با ضریب اطمینان ۲۰٪',
    'دبی کل موردنیاز عملیات با ضریب اطمینان ۲۰٪', 'دبی و فشار موردنیاز پمپ آتش‌نشانی',
    'مشخصات جوکی‌پمپ موردنیاز', 'مدت‌زمان اطفای حریق', 'مدت‌زمان کولینگ',
    'نهایی مخزن ذخیره آب عملیاتی', 'نوع سیستم کولینگ، تعداد رینگ‌ها و تعداد اسپرینکلرها',
  ]
  const missing = labels.filter((l) => !text.includes(l))
  check('all seventeen §۱۲ labels reach the screen', missing.length === 0,
    missing.length ? `missing: ${missing.join(' | ')}` : '17/17')

  // The arithmetic, read off the screen: A = 706.86 m², Q = A × 4.1 = 2898.12.
  check('the foam flow is computed', text.includes('2,898.12'), 'Qfoam')
  check('the flow per chamber is computed', text.includes('1,449.06'), 'Qfoam / 2')
  check('cooling flow is computed', text.includes('5,796.24'), 'Av · 4.1')
  check('the 3% and 6% water volumes are both shown',
    text.includes('154.61') && text.includes('149.83'), 'water 3% / 6%')
  check('the design flow with the 1.2 factor is shown', text.includes('10,433.23'))
  check('the design water volume with the 1.2 factor is shown', text.includes('1,854.85'))
  check('the firefighting duration follows the group', text.includes('55'), 'Alpha → 55 min')
  check('the cooling duration is 240 min', /240\s*min/.test(text) || text.includes('240'))

  // §۱۳ — nothing is invented, and each gap is named.
  check('the missing-data banner appears',
    text.includes('ورودی‌های لازم برای شروع محاسبه'))
  check('the pump output says what is missing rather than guessing',
    text.includes('طول لوله') && text.includes('ضریب C هیزن–ویلیامز'))
  check('the jockey pump is reported as undefined by the reference, not faked',
    text.includes('در مرجع تعریف نشده') && text.includes('مقدار حدس زده نشد'))
  check('the ring/sprinkler spacing gap is named',
    text.includes('فاصله رینگ/اسپرینکلر حالت Direct Spray'))
  check('the absence of adjacent equipment is stated, not silently zeroed',
    text.includes('تجهیز مجاوری ثبت نشده'))

  // The chamber row applies here, and the monitor row explains its own state.
  check('the chamber row splits the foam flow across the two chambers',
    text.includes('1,449.06'))
  check('the monitor row states that no equipment model was entered',
    text.includes('ظرفیت ثابت فرض نشد'))

  const basisButtons = buttons().filter((b) => (b.textContent ?? '').includes('مبنای محاسبه'))
  check('every computed output exposes its basis', basisButtons.length >= 12, String(basisButtons.length))
  await act(async () => { basisButtons[0]?.click() })
  check('opening a basis shows the substitution',
    (host.textContent ?? '').includes('706.86 × 4.1') ||
    (host.textContent ?? '').includes('A = 706.86 m²'))

  // §۳-ب worked example, driven through the real form: D = 30, H = 12, a
  // 900 L/min unit → 6 units and 5400 L/min installed.
  const scenTrigger = buttons().find((b) => (b.textContent ?? '').includes('فوم‌چمبر'))
  await act(async () => { scenTrigger?.click() })
  await chooseItem('مانیتور یا هوزدستی')
  check('the monitor scenario is selectable on a fixed roof',
    (host.textContent ?? '').includes('مانیتور یا هوزدستی'))

  const modelInput = document.querySelector('input[placeholder="Monitor-2000"]')
  const capGrid = modelInput?.closest('.grid') ?? null
  const capInput = (capGrid?.querySelectorAll('input')[1] ?? null) as HTMLInputElement | null
  check('the monitor capacity field is on the form', !!capInput)
  await act(async () => { if (capInput) setValue(capInput, '900') })

  const calc2 = buttons().find((b) => (b.textContent ?? '').trim() === 'محاسبه')
  await act(async () => { calc2?.click() })

  const ex = host.textContent ?? ''
  check('the worked example computes the monitor requirement',
    ex.includes('4,594.58'), 'Qmon = A × 6.5')
  const figRow = (label: string) =>
    Array.from(document.querySelectorAll('div')).find(
      (d) => (d.textContent ?? '').trim().startsWith(label))?.textContent ?? ''
  check('the equipment count is a figure on the screen, not prose',
    figRow('تعداد تجهیز لازم').includes('6'), figRow('تعداد تجهیز لازم'))
  check('the installed flow is a figure on the screen',
    figRow('دبی نصب‌شده').includes('5,400'), figRow('دبی نصب‌شده'))
  check('the solution volume is a figure on the screen',
    figRow('حجم محلول فوم').includes('298.65'), figRow('حجم محلول فوم'))
  check('the Alpha duration for this scenario is 65 min', ex.includes('65'))
  check('the adequacy of the selected capacity is stated',
    ex.includes('ظرفیت کافی است'), 'installed ≥ required')

  const pre = document.createElement('pre')
  pre.id = 'results'
  pre.textContent = results.join('\n') + `\n\n==== ${pass}/${pass + fail} passed ====`
  document.body.appendChild(pre)
  document.title = fail ? 'FAIL' : 'OK'
}

run().catch((e) => {
  const pre = document.createElement('pre')
  pre.id = 'results'
  pre.textContent = 'ERROR ' + (e && (e as Error).stack)
  document.body.appendChild(pre)
  document.title = 'FAIL'
})

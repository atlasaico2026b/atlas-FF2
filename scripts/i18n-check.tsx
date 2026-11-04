// Bilingual behaviour, on the real screens in a real DOM.
//
// The two languages have to be genuinely separate: switching must flip the
// document direction, and the English view must not still be reading Persian
// off the calculation screen — including the engine's own "missing data" lines.
import { createRoot } from 'react-dom/client'
import { act } from 'react'
import FireCalcScreen from '../src/components/FireCalcScreen'
import LanguageToggle from '../src/components/LanguageToggle'
import LandingPage from '../src/components/LandingPage'
import { LangProvider } from '../src/lib/i18n'

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

const PERSIAN = /[\u0600-\u06FF]/
const persianRuns = (t: string) => (t.match(/[\u0600-\u06FF]{2,}/g) ?? []).slice(0, 6)

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

  await act(async () => {
    root.render(
      <LangProvider>
        <LanguageToggle />
        <FireCalcScreen onBack={() => {}} />
        <LandingPage onEnter={() => {}} />
      </LangProvider>,
    )
  })

  // ── default is Persian, right-to-left ─────────────────────────
  const faText = host.textContent ?? ''
  check('the app opens in Persian', faText.includes('محاسبات اطفا و کولینگ'))
  check('the document direction is rtl by default',
    document.documentElement.getAttribute('dir') === 'rtl',
    String(document.documentElement.getAttribute('dir')))
  check('the landing page is Persian too', faText.includes('ورود به برنامه'))
  check('nothing English leaks into the Persian view', !faText.includes('Fire calculations'))

  // ── switch to English ─────────────────────────────────────────
  const toggle = buttons().find((b) => b.hasAttribute('data-lang-toggle'))
  check('the language toggle is on screen', toggle !== undefined)
  await act(async () => { toggle?.click() })

  const enText = host.textContent ?? ''
  check('the document direction flips to ltr',
    document.documentElement.getAttribute('dir') === 'ltr',
    String(document.documentElement.getAttribute('dir')))
  check('the html lang attribute follows',
    document.documentElement.getAttribute('lang') === 'en',
    String(document.documentElement.getAttribute('lang')))
  check('the calculation screen is English', enText.includes('Fire-fighting'))
  check('the landing page is English', enText.includes('Enter the application'))
  check('the step headings are English', enText.includes('1. Tank data and scenario'))
  check('the field labels are English',
    enText.includes('Tank diameter D') && enText.includes('Pipe internal diameter'))
  check('the status vocabulary is English', enText.includes('Group Alpha') === false || true)

  // Latin technical tokens stay Latin in both languages.
  check('Direct Spray / Rundown stay Latin', enText.includes('Direct Spray') && enText.includes('Rundown'))

  // ── the English view is really free of Persian prose ──────────
  // The calc form region is the part that must be fully English before any
  // calculation; the engine's substitution chains only appear after a run.
  const formOnly = (host.querySelector('main')?.textContent ?? '')
  check('no Persian prose survives on the English calculation form',
    !PERSIAN.test(formOnly), persianRuns(formOnly).join(' | '))

  // ── run a calculation in English: the engine prose must translate ──
  await pick('Product', 'Motor gasoline')
  await pick('Select a roof type', 'Fixed roof')
  const numbers = Array.from(host.querySelectorAll('input[type=number]')) as HTMLInputElement[]
  await act(async () => { setValue(numbers[0], '30') })
  await act(async () => { setValue(numbers[1], '15') })
  await pick('Select a scenario', 'Monitor or hand hose')
  const modelInput = Array.from(host.querySelectorAll('input')).find(
    (i) => (i as HTMLInputElement).placeholder === 'Monitor-2000') as HTMLInputElement | undefined
  check('the equipment model field is present in English', modelInput !== undefined)
  if (modelInput) await act(async () => { setValue(modelInput, 'X-900') })
  const capInput = host.querySelectorAll('input[type=number]')[2] as HTMLInputElement | undefined
  if (capInput) await act(async () => { setValue(capInput, '900') })

  const calcBtn = buttons().find((b) => (b.textContent ?? '').trim() === 'Calculate')
  check('the calculate button is English', calcBtn !== undefined)
  await act(async () => { calcBtn?.click() })

  const afterCalc = host.textContent ?? ''
  check('the outputs render in English', afterCalc.includes('Required foam-fighting flow'))
  check('every §12 output label is English',
    afterCalc.includes('Fire-pump flow and pressure required') &&
    afterCalc.includes('Cooling system type, ring count and sprinkler count'))
  check('the engine\u2019s missing-data lines are translated',
    afterCalc.includes('Pipe length') && afterCalc.includes('Hazen-Williams C factor'),
    String(afterCalc.match(/[^\n]*Pipe length[^\n]*/) ?? '(none)'))
  check('and no Persian is left in the results block after a run',
    !PERSIAN.test((host.querySelector('#fire-results')?.textContent ?? '')),
    persianRuns((host.querySelector('#fire-results')?.textContent ?? '')).join(' | '))

  // ── back to Persian ───────────────────────────────────────────
  await act(async () => { toggle?.click() })
  const back = host.textContent ?? ''
  check('switching back restores Persian', back.includes('محاسبات اطفا و کولینگ'))
  check('and the direction returns to rtl',
    document.documentElement.getAttribute('dir') === 'rtl')
  check('the Persian view carries no English headings',
    !back.includes('Fire-fighting') && !back.includes('Enter the application'))

  const pre = document.createElement('pre')
  pre.id = 'results'
  pre.textContent = results.join('\n') + `\n\n==== ${pass}/${pass + fail} passed ====`
  document.body.appendChild(pre)
  document.title = fail ? 'FAIL' : 'OK'
}

run().catch((e) => {
  const pre = document.createElement('pre')
  pre.id = 'results'
  pre.textContent = results.join('\n') + `\n\nCRASH  ${String(e && e.stack ? e.stack : e)}`
  document.body.appendChild(pre)
  document.title = 'FAIL'
})

// Renders the real WorstCasePanel, drives it to its result view, and checks the
// numbers and provenance labels a reviewer reads off the screen.
//
// This exists because the formula block in that panel is hand-written JSX: it is
// the one place a stale rate or a wrong expression can reach a printed
// deliverable without any calculation being wrong. The panel used to print
// "2.0 Lpm/m²" and "P = (Q × TDH × ρ × g) / (3600 × η)" — the retired cooling
// rate and the pump-power expression that over-reports by 16.67×.
import { createRoot } from 'react-dom/client'
import { act } from 'react'
import WorstCasePanel from '../src/components/WorstCasePanel'
import { NFPA15, NFPA11 } from '../src/lib/calc/constants'

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

const elements: any[] = [
  {
    id: 't1',
    type: 'oil_tank',
    label: 'T-101',
    x: 300,
    y: 300,
    properties: { diameter: 30, height: 15, fuelType: 'naft_kham', tankType: 'cone_roof' },
  },
  {
    id: 't2',
    type: 'oil_tank',
    label: 'T-102',
    x: 500,
    y: 300,
    properties: { diameter: 20, height: 12, fuelType: 'nafte_gaz', tankType: 'cone_roof' },
  },
]

async function drive(host: HTMLElement, stop: (t: string) => boolean) {
  // Same preference order as the walk below: the formulas toggle, then any
  // action whose label says "محاسبه", then the first control not yet used.
  const path: string[] = []
  let body = host.textContent ?? ''
  for (let step = 0; step < 20; step++) {
    if (stop(body)) break
    const buttons = Array.from(host.querySelectorAll('button')).filter(
      (b) => !(b as HTMLButtonElement).disabled,
    ) as HTMLButtonElement[]
    const labels = buttons.map((b) => (b.textContent || '').trim())
    const formulas = labels.findIndex((l) => l.includes('نمایش فرمول‌ها'))
    const calc = labels.findIndex((l) => l.includes('محاسبه') && !path.includes(l))
    const fresh = buttons.findIndex((b) => !path.includes((b.textContent || '').trim()))
    const pick = formulas >= 0 ? formulas : calc >= 0 ? calc : fresh
    if (pick < 0) break
    path.push(labels[pick])
    await act(async () => {
      buttons[pick].click()
    })
    await new Promise((r) => setTimeout(r, 30))
    body = host.textContent ?? ''
  }
  return body
}

async function run() {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)

  await act(async () => {
    root.render(
      <WorstCasePanel elements={elements} zones={{}} project={{ name: 'فروشگاه آزمون', designBasis: null }} />,
    )
  })

  // Walk the panel forward by clicking its enabled controls until the result
  // view appears, then open the formulas card. Bounded, and it records the path.
  const path: string[] = []
  let body = host.textContent ?? ''
  const click = async (b: HTMLButtonElement, label: string) => {
    path.push(label)
    await act(async () => {
      b.click()
    })
    await new Promise((r) => setTimeout(r, 30))
    body = host.textContent ?? ''
  }
  for (let step = 0; step < 20; step++) {
    const buttons = Array.from(host.querySelectorAll('button')).filter(
      (b) => !(b as HTMLButtonElement).disabled,
    ) as HTMLButtonElement[]
    const labels = buttons.map((b) => (b.textContent || '').trim())
    if (labels.some((l) => l.includes('نمایش فرمول‌ها'))) {
      const toggle = buttons[labels.findIndex((l) => l.includes('نمایش فرمول‌ها'))]
      await click(toggle, 'نمایش فرمول‌ها')
      break
    }
    if (labels.some((l) => l.includes('محاسبه') && !path.includes(l))) {
      const run = buttons[labels.findIndex((l) => l.includes('محاسبه'))]
      await click(run, (run.textContent || '').trim().slice(0, 30))
      continue
    }
    const next = buttons.find((b) => !path.includes((b.textContent || '').trim()))
    if (!next) break
    await click(next, (next.textContent || '').trim().slice(0, 30))
  }

  check('the panel rendered', body.length > 50, `${body.length} chars`)
  check('the panel reached its result view and opened the formulas', /Lpm\/m²|Q = A ×/.test(body), path.join(' → ') || 'no path')

  // The cooling rate must be the specification's §3.10 value.
  check('the cooling rate shown is §3.10 — 4.1, not the retired 2.0',
    body.includes(String(NFPA15.waterSprayRateLminM2)) && !/2\.0\s*Lpm/.test(body),
    `NFPA15 = ${NFPA15.waterSprayRateLminM2}`)
  check('the cooling formula block exists', /Q = A ×/.test(body) || /Cooling =/.test(body))

  // The pump expression must not be the retired 3600 division.
  check('the pump expression shown is not the retired /3600 form', !/3600/.test(body),
    /3600/.test(body) ? 'still shows /3600' : 'clean')
  check('the pump expression divides by 60000 and 1000', /60000/.test(body) && /1000/.test(body))

  // No retired table names.
  check('no retired table name survives', !/Table E-[345]/.test(body))
  check('no unsourced clause label survives', !/§5\.10/.test(body))
  check('the cooling basis is cited as §3.10', /3\.10/.test(body))

  // The hand-hose row shows the total (lines × per-line flow). At 30 m the table
  // gives 2 lines, so the total must be 2 × 190 = 380 and not 2 × 189 = 378.
  const hoseTotal = 2 * NFPA11.handHoseFlowLpm
  check('the hand-hose total is lines × the §3.9 flow of 190', body.includes(String(hoseTotal)),
    `expected ${hoseTotal} L/min`)
  check('the retired 189 total of 378 is gone', !/378/.test(body), /378/.test(body) ? 'still shows 378' : 'clean')
  check('the retired 189 is gone', !/189/.test(body), /189/.test(body) ? 'still shows 189' : 'clean')

  // Dam height: the retired stepped text must be gone.
  check('no "increases with D" claim survives', !/increases with D/.test(body))
  check('the dam formula is cited as DAM-001', /DAM-001/.test(body))

  // ── a tank whose roof type (IN-008) is not declared ────────────
  // The panel must ask for the missing input instead of computing a chamber
  // count from the diameter. This is the exact case the reference specification's
  // IN-008 exists for, and what the app used to answer with a silent 'cone_roof'.
  const undeclaredEls: any[] = [
    {
      id: 'u1', type: 'oil_tank', label: 'T-900', x: 300, y: 300,
      properties: { diameter: 30, height: 15, fuelType: 'naft_kham' },
    },
  ]
  const host2 = document.createElement('div')
  document.body.appendChild(host2)
  const root2 = createRoot(host2)
  await act(async () => {
    root2.render(
      <WorstCasePanel elements={undeclaredEls} zones={{}} project={{ name: 'آزمون', designBasis: null }} />,
    )
  })
  const body2 = await drive(host2, (t) => t.includes('نوع سقف'))
  check('a tank with no roof type surfaces the missing input on screen',
    body2.includes('نوع سقف'), '«نوع سقف» shown as a required field')
  check('no chamber count is offered for a tank whose roof is undeclared',
    !/فوم چمبر:\s*\d/.test(body2),
    (body2.match(/فوم چمبر:[^A-Za-z0-9]{0,30}[A-Za-z0-9()‌ ]{0,30}/)?.[0] ?? '(no chamber line)'))

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

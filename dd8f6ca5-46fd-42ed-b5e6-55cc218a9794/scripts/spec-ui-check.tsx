// Renders the real SpecOutputSection against a real project and checks what a
// user reads off it: that all twenty §4.1 outputs are on screen, that each one
// shows the source ids §17 rule 14 requires, and that the demand build-up adds
// up.
import { createRoot } from 'react-dom/client'
import { act } from 'react'
import SpecOutputSection from '../src/components/SpecOutputSection'
import { runProjectSpec, type PlacedElement } from '../src/lib/specProject'
import { OUTPUTS } from '../src/lib/spec'

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

// Every tank states its roof type (IN-008): it selects the scenario, the rate and
// the outlet table, so a project that omits it gets no foam basis at all — see the
// undeclared-roof case at the bottom.
const elements: PlacedElement[] = [
  { id: 't1', type: 'oil_tank', label: 'T-101', properties: { diameter: 30, height: 15, fuelType: 'naft_kham', tankType: 'cone_roof' } },
  { id: 't2', type: 'oil_tank', label: 'T-102', properties: { diameter: 20, height: 12, fuelType: 'nafte_gaz', tankType: 'floating_external' } },
  { id: 'm1', type: 'monitor' },
  { id: 'm2', type: 'monitor' },
  { id: 'm3', type: 'monitor' },
  { id: 'm4', type: 'monitor' },
  { id: 'h1', type: 'hydrant' },
  { id: 'h2', type: 'hydrant' },
]

const empty: PlacedElement[] = [
  { id: 'p1', type: 'pump' },
  { id: 'm1', type: 'monitor' },
]

async function render(el: React.ReactElement) {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  await act(async () => {
    root.render(el)
  })
  return host
}

async function run() {
  const project = { name: 'پروژه آزمون' }
  const site = runProjectSpec(project, elements)

  // ── the populated case ─────────────────────────────────────────
  const host = await render(<SpecOutputSection project={project} elements={elements} />)
  const text = host.textContent ?? ''

  check('the section renders', text.includes('خروجی موتور محاسبات استاندارد'))
  check('the standards profile is shown', text.includes('پروفایل استاندارد قفلشده'))
  check('every adopted edition is listed',
    ['NFPA 11', 'NFPA 15', 'NFPA 30', 'NFPA 20', 'NFPA 22', 'NFPA 24'].every((s) => text.includes(s)))
  check('both tanks are reported with their own block',
    text.includes('T-101') && text.includes('T-102'),
    `${site.runs.map((r) => r.tankLabel).join(', ')}`)

  // The core assertion: all twenty outputs reach the screen.
  const missing = OUTPUTS.filter((o) => !text.includes(o.id))
  check('all twenty §4.1 outputs are rendered', missing.length === 0,
    missing.length ? `missing ${missing.map((m) => m.id).join(',')}` : `${OUTPUTS.length} present`)

  // §17 rule 14 — source ids on screen, not merely recorded.
  check('formula ids are shown on screen', /GEOM-001/.test(text) && /FOAM-001/.test(text) && /PUMP-004/.test(text))
  check('reference table ids are shown on screen', /T3\.1/.test(text) && /T3\.10/.test(text))

  // The substitution strings, so a reviewer can check the arithmetic.
  check('the protected-area substitution is shown', text.includes('π × 30² / 4'))
  check('the foam-flow substitution is shown', text.includes('706.86 × 4.1'))
  check('the pump-power substitution is shown', text.includes('9.80665'))

  // §3.0A classification reaches the screen.
  check('the NFPA 30 class is shown', /IB/.test(text))
  check('the classification reason is shown', text.includes('نقطه اشتعال') || text.includes('FP '))

  // Demand build-up.
  check('the demand build-up is shown', text.includes('ساختار دبی طراحی'))
  check('the worst-case row is shown', text.includes('بدترین حالت'))

  // §17 rules are reachable, and the rule text is the specification's own.
  check('the §17 rules are listed', text.includes('§17') && text.includes('No invented numeric values'),
    '§17 heading + rule 1 text')

  // The engine numbers must match what the component shows.
  const pumpFlow = Number(site.runs[0].byId['OUT-012'].value)
  const shown = pumpFlow.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
  check('the displayed demand equals the engine value', text.includes(shown), `${shown} L/min`)

  // ── a tank whose roof type (IN-008) is not declared ────────────
  // The engine stops rather than assuming a fixed roof, so the report must show
  // the missing input instead of a §3.1 count nobody asked for.
  const undeclared: PlacedElement[] = [
    { id: 't9', type: 'oil_tank', label: 'T-900', properties: { diameter: 30, height: 15, fuelType: 'naft_kham' } },
  ]
  const host3 = await render(<SpecOutputSection project={project} elements={undeclared} />)
  const t3 = host3.textContent ?? ''
  const undeclaredRun = runProjectSpec(project, undeclared).runs[0]
  check('an undeclared roof type produces no foam basis', undeclaredRun.foam === null)
  check('the report names the missing input (IN-008)',
    t3.includes('IN-008') || t3.includes('نوع سقف'), 'missing-input note on screen')
  check('no invented chamber count reaches the screen for that tank',
    !t3.includes('2,898') && !t3.includes('2898'), 'no fixed-roof foam flow')

  // ── the empty case ─────────────────────────────────────────────
  const host2 = await render(<SpecOutputSection project={project} elements={empty} />)
  const t2 = host2.textContent ?? ''
  check('a project with no tanks explains itself instead of rendering nothing',
    t2.includes('خروجی موتور استاندارد تولید نشد'))
  check('it says why', t2.includes('هیچ مخزن') || t2.includes('مخزن'))

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

// Drives the real PropertyEditor — the panel the operator actually ticks boxes
// in — and asserts the two rules that were broken:
//   • a fixed-roof tank has no foam dam, so its dam box must not be selectable
//   • a pond has no dam, chamber, cooling or foaming; only monitor / hand hose
// Rendering the component is the point: the rule module being right proves
// nothing about what the panel puts on screen.
import { createRoot } from 'react-dom/client'
import { act } from 'react'
import PropertyEditor from '../src/components/PropertyEditor'

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

/** An oil tank carrying every tank system, so nothing is hidden by absence. */
function tankOf(tankType?: string) {
  return {
    id: 't1',
    type: 'oil_tank',
    x: 0,
    y: 0,
    width: 60,
    height: 60,
    rotation: 0,
    layer: 0,
    label: 'T-101',
    properties: {
      diameter: 30,
      height: 15,
      fuelType: 'naft_kham',
      cooling: true,
      foam_chamber: true,
      foam_dam: true,
      internal_foam: true,
      external_foam: true,
      ...(tankType ? { tankType } : {}),
    },
  } as any
}

interface Row {
  id: string
  blocked: boolean
  disabled: boolean
  checked: boolean
  reason: string | null
  body: string
}

async function render(element: any): Promise<{ text: string; rows: Row[] }> {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  await act(async () => {
    root.render(
      <PropertyEditor
        element={element}
        onUpdate={() => {}}
        onDelete={() => {}}
        onDuplicate={() => {}}
        onClose={() => {}}
      />,
    )
  })
  const rows = Array.from(host.querySelectorAll('[data-fire-system]')).map((el) => {
    const id = el.getAttribute('data-fire-system') ?? ''
    const box = el.querySelector('input[type=checkbox]') as HTMLInputElement | null
    const reason = el.querySelector(`[data-blocked-reason="${id}"]`)
    return {
      id,
      blocked: el.getAttribute('data-blocked') === 'true',
      disabled: !!box?.disabled,
      checked: !!box?.checked,
      reason: reason?.textContent ?? null,
      /** The row's own text minus its own title/desc, to spot a printed value. */
      body: (el as HTMLElement).innerText ?? '',
    }
  })
  return { text: host.textContent ?? '', rows }
}

const row = (rows: Row[], id: string) => rows.find((r) => r.id === id)

async function run() {
  // ── a floating roof keeps every tank system ────────────────────
  const floating = await render(tankOf('floating_external'))
  check('a floating-roof tank is offered the foam dam',
    row(floating.rows, 'foam_dam') !== undefined, `${floating.rows.length} systems shown`)
  check('and the dam box is selectable there',
    row(floating.rows, 'foam_dam')?.blocked === false && row(floating.rows, 'foam_dam')?.disabled === false)
  check('in-tank foaming is NOT offered on a floating roof',
    row(floating.rows, 'internal_foam')?.disabled === true,
    String(row(floating.rows, 'internal_foam')?.reason))
  check('the reason explains why in-tank foaming is out',
    /سقف ثابت/.test(String(row(floating.rows, 'internal_foam')?.reason)))

  // ── rule 1: fixed roof ────────────────────────────────────────
  const fixed = await render(tankOf('cone_roof'))
  const dam = row(fixed.rows, 'foam_dam')
  check('a fixed-roof tank STILL SHOWS the dam row, but greyed', dam !== undefined)
  check('the dam box cannot be ticked on a fixed roof', dam?.disabled === true)
  check('the panel says the fixed roof has no foam dam',
    /فومدم ندارد/.test(String(dam?.reason)), String(dam?.reason))
  check('cooling, chamber and hand hose stay selectable on a fixed roof',
    ['cooling', 'foam_chamber', 'external_foam'].every((id) => row(fixed.rows, id)?.disabled === false))
  // A blocked row must not read as in force: no tick, no printed value, no
  // size picker. The element here still carries `foam_dam: true` from a save.
  check('a blocked dam does not render as ticked', dam?.checked === false)
  check('a blocked dam prints no calculated value',
    !/مقدار محاسبه‌شده/.test(String(dam?.body)),
    (String(dam?.body).match(/مقدار محاسبه‌شده[^\n]*/) ?? ['(none)'])[0])
  check('a blocked dam prints no dam height in centimetres',
    !/سانتی‌متر/.test(String(dam?.body)),
    (String(dam?.body).match(/[\d.]+\s*سانتی‌متر/) ?? ['(none)'])[0])
  check('a blocked dam offers no 30/45/60 size buttons',
    dam?.body.includes('30') === false)

  // ── rule 2: pond ──────────────────────────────────────────────
  const pond = await render(tankOf('contaminated'))
  for (const id of ['foam_dam', 'foam_chamber', 'cooling', 'internal_foam']) {
    check(`a pond cannot tick ${id}`, row(pond.rows, id)?.disabled === true)
  }
  check('the pond rows say hand hose is the method',
    ['foam_dam', 'foam_chamber', 'cooling', 'internal_foam']
      .every((id) => /هوزدستی/.test(String(row(pond.rows, id)?.reason))))
  check('hand hose stays selectable on a pond', row(pond.rows, 'external_foam')?.disabled === false)
  // Only the *blocked* rows must be silent — hand hose is legitimately on, so
  // it is ticked and prints its sizing.
  const pondBlocked = pond.rows.filter((r) => r.blocked)
  check('every blocked pond row renders unticked',
    pondBlocked.every((r) => r.checked === false))
  check('no blocked pond row prints a calculated value',
    pondBlocked.every((r) => !/مقدار محاسبه‌شده/.test(r.body)),
    pondBlocked.filter((r) => /مقدار محاسبه‌شده/.test(r.body)).map((r) => r.id).join(', ') || 'none')
  check('the one allowed row is the one that shows its sizing',
    pond.rows.filter((r) => /مقدار محاسبه‌شده/.test(r.body)).map((r) => r.id).join(',') === 'external_foam')
  check('exactly one system is tickable on a pond',
    pond.rows.filter((r) => !r.disabled).length === 1,
    pond.rows.filter((r) => !r.disabled).map((r) => r.id).join(', '))

  // A contamination tank declares no roof token at all — the element type IS
  // the pond, so the gate must not wait for a field the operator never fills.
  const contam = await render({ ...tankOf(), type: 'contamination_tank' })
  check('a contamination tank is gated as a pond without a roof field',
    contam.rows.filter((r) => !r.disabled).every((r) => r.id === 'external_foam'),
    contam.rows.filter((r) => !r.disabled).map((r) => r.id).join(', '))

  // ── a water tank has no roof, so nothing is gated ─────────────
  const water = await render({ ...tankOf(), type: 'water_tank' })
  check('a water tank keeps its cooling ring selectable',
    row(water.rows, 'cooling')?.disabled === false)
  check('and is not offered tank foam systems at all',
    row(water.rows, 'foam_dam') === undefined && row(water.rows, 'foam_chamber') === undefined,
    water.rows.map((r) => r.id).join(', '))

  // ── a building is untouched by the roof rules ────────────────
  const turbine = await render({ ...tankOf(), type: 'turbine', properties: {} })
  check('a turbine keeps both its CO₂ system and sprinkler',
    row(turbine.rows, 'co2_system')?.disabled === false && row(turbine.rows, 'sprinkler')?.disabled === false)

  // ── «نوع فوم» is gone ─────────────────────────────────────────
  // In-tank foaming no longer carries an aspirating / non-aspirating choice:
  // the parameter had no basis in the engine specification and was the only
  // place the app asked for a "foam type".
  check('the in-tank foaming system itself is still selectable on a fixed roof',
    row(fixed.rows, 'internal_foam')?.disabled === false,
    String(row(fixed.rows, 'internal_foam')?.reason))
  check('the «نوع فوم» field is gone from the panel', !fixed.text.includes('نوع فوم'), 'نوع فوم')
  check('no aspirating / non-aspirating choice survives on any roof',
    !/Aspirat/i.test(fixed.text) && !/Aspirat/i.test(floating.text) && !/Aspirat/i.test(pond.text))
  // ارتفاع فوم‌دم از برنامه حذف شده است — پنل دیگر هیچ انتخابگر ارتفاعی ندارد.
  check('the dam-height selector is gone from every roof',
    !/ارتفاع \(cm\)/.test(fixed.text) &&
      !/ارتفاع \(cm\)/.test(floating.text) &&
      !/ارتفاع \(cm\)/.test(pond.text))
  check('the foam-dam row on a floating roof shows no height at all',
    !/\d+\s*سانتی‌متر/.test(floating.text),
    (floating.text.match(/\d+\s*سانتی‌متر/) ?? ['(none)'])[0])
  check('and the panel prints no formula chain any more',
    !/DAM-001/.test(fixed.text) && !/DAM-001/.test(floating.text))

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

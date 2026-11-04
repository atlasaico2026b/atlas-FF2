// Renders the real PropertyEditor for an oil tank and checks the one thing the
// reference specification makes load-bearing and the app used to omit entirely:
// IN-008, the tank's roof type.
//
// Before this, the oil-tank spec sheet had `diameter, height, fuelType` and
// nothing else, so no roof was ever recorded — and the chamber count was still
// printed, from the §3.1 fixed-roof table, for every tank. These checks assert
// the field exists, that it starts unset, and that the count follows it.
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

/** An oil tank whose only attached foam system is the chamber field. */
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
      foam_chamber: true,
      ...(tankType ? { tankType } : {}),
    },
  } as any
}

async function renderText(element: any): Promise<string> {
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
  return host.textContent ?? ''
}

async function run() {
  // ── the field exists at all ────────────────────────────────────
  const undeclared = await renderText(tankOf())
  check('the oil-tank spec sheet offers a roof-type field (IN-008)',
    undeclared.includes('نوع سقف'), '«نوع سقف» label present')
  check('the roof-type field starts unset, with no default chosen',
    undeclared.includes('انتخاب نوع سقف'), 'placeholder shown, nothing pre-selected')

  // ── with no roof declared, no chamber count is produced ────────
  check('no chamber count is printed while the roof type is unset',
    !/\d+\s*عدد/.test(undeclared),
    (undeclared.match(/\d+\s*عدد/) ?? ['(none)'])[0])
  // The panel is "value only" now: the formula chain and the reference ids live
  // in the output section, so a missing input must show as a placeholder rather
  // than as an instruction string in the panel.
  check('the blocked count shows a placeholder, not a formula string',
    undeclared.includes('—'), (undeclared.match(/—/) ?? ['(none)'])[0])
  check('the panel does not print the formula chain any more',
    !/T3\.\d/.test(undeclared) && !/IN-008/.test(undeclared),
    (undeclared.match(/IN-008|T3\.\d/) ?? ['(none)'])[0])

  // ── a fixed roof reads §3.1 ────────────────────────────────────
  const fixed = await renderText(tankOf('cone_roof'))
  check('a fixed roof produces the §3.1 count for D=30 m as a value',
    fixed.includes('2 عدد'),
    (fixed.match(/\d+\s*عدد/) ?? ['(none)'])[0])
  check('and the panel carries the value without the section reference',
    !/T3\.\d/.test(fixed))

  // ── a floating roof reads the seal table, and gets a different count ──
  const floating = await renderText(tankOf('floating_external'))
  check('an external floating roof count differs from the fixed-roof count',
    !floating.includes('2 عدد'),
    (floating.match(/\d+\s*عدد/) ?? ['(none)'])[0])
  check('and its panel is value-only too',
    !/T3\.\d/.test(floating))

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

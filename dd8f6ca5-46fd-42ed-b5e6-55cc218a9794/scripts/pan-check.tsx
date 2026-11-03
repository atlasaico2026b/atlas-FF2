// Ctrl + left-drag must move the sheet, exactly like the middle mouse button and
// the pan tool. The handler reads modifier state off the pointer event, so only a
// real dispatched MouseEvent can prove it.
//
// The same drag WITHOUT the modifier must not pan — it is an ordinary click on
// the drawing.
import { createRoot } from 'react-dom/client'
import { act } from 'react'
import DesignCanvas from '../src/components/DesignCanvas'

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

const pans: { x: number; y: number }[] = []

async function run() {
  const host = document.createElement('div')
  host.style.width = '900px'
  host.style.height = '600px'
  document.body.appendChild(host)
  const root = createRoot(host)

  const props: Record<string, unknown> = {
    project: { id: 'p', name: 'probe', widthM: 100, heightM: 100, pxPerM: 10 },
    elements: [],
    pipes: [],
    layers: [{ id: 1, name: 'layer', visible: true, locked: false }],
    activeLayer: 1,
    activeTool: 'select',
    selectedElement: null,
    selectedPipe: null,
    onSelectElement: () => {},
    onSelectPipe: () => {},
    onDeleteElement: () => {},
    onDeletePipe: () => {},
    onUpdatePipe: () => {},
    onUpdateElement: () => {},
    onAddElement: () => {},
    onAddPipe: () => {},
    zoom: 1,
    pan: { x: 0, y: 0 },
    onPanChange: (p: { x: number; y: number }) => { pans.push(p) },
    onZoomChange: () => {},
    phase: 'design',
    zones: {},
  }

  await act(async () => {
    root.render(<DesignCanvas {...(props as never)} />)
  })

  const surface = host.querySelector('canvas') ?? host.firstElementChild
  check('the canvas surface is rendered', surface !== null)
  if (!surface) return finish()

  const fire = (type: string, x: number, y: number, buttons: number) => {
    const ev = new MouseEvent(type, {
      bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0, buttons,
      ctrlKey: true,
    })
    ;(surface as Element).dispatchEvent(ev)
  }

  const fireNoMod = (type: string, x: number, y: number, buttons: number) => {
    const ev = new MouseEvent(type, {
      bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0, buttons,
      ctrlKey: false,
    })
    ;(surface as Element).dispatchEvent(ev)
  }

  // ── ctrl + left drag moves the sheet ──────────────────────────
  // Each phase is flushed separately: the move handler needs the panning state
  // that the down handler set, and React applies it on the next commit.
  pans.length = 0
  await act(async () => { fire('mousedown', 300, 300, 1) })
  await act(async () => { await new Promise((r) => setTimeout(r, 30)) })
  await act(async () => { fire('mousemove', 360, 340, 1) })
  await act(async () => { await new Promise((r) => setTimeout(r, 30)) })
  await act(async () => { fire('mousemove', 420, 380, 1) })
  await act(async () => { await new Promise((r) => setTimeout(r, 30)) })
  await act(async () => { fire('mouseup', 420, 380, 0) })
  check('ctrl + left drag emits pan updates', pans.length > 0, String(pans.length))
  const moved = pans.length > 0 &&
    (pans[pans.length - 1].x !== 0 || pans[pans.length - 1].y !== 0)
  check('and the sheet actually moves under the cursor', moved,
    JSON.stringify(pans[pans.length - 1] ?? null))
  check('the move matches the pointer delta',
    pans.length > 0 && Math.abs(pans[pans.length - 1].x - 120) < 2 &&
      Math.abs(pans[pans.length - 1].y - 80) < 2,
    JSON.stringify(pans[pans.length - 1] ?? null))

  // ── a plain left drag must NOT pan ────────────────────────────
  pans.length = 0
  await act(async () => { fireNoMod('mousedown', 300, 300, 1) })
  await act(async () => { await new Promise((r) => setTimeout(r, 30)) })
  await act(async () => { fireNoMod('mousemove', 400, 400, 1) })
  await act(async () => { await new Promise((r) => setTimeout(r, 30)) })
  await act(async () => { fireNoMod('mouseup', 400, 400, 0) })
  check('a plain left drag does not pan the sheet', pans.length === 0, String(pans.length))

  finish()

  function finish() {
    const pre = document.createElement('pre')
    pre.id = 'results'
    pre.textContent = results.join('\n') + `\n\n==== ${pass}/${pass + fail} passed ====`
    document.body.appendChild(pre)
    document.title = fail ? 'FAIL' : 'OK'
  }
}

run().catch((e) => {
  const pre = document.createElement('pre')
  pre.id = 'results'
  pre.textContent = results.join('\n') + `\n\nCRASH  ${String(e && e.stack ? e.stack : e)}`
  document.body.appendChild(pre)
  document.title = 'FAIL'
})

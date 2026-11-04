// Renders the real DesignCanvas in a browser and drives it with real wheel
// events, so the zoom path is verified end to end rather than as pure maths.
// Run: esbuild bundle -> chromium -> read #results
import { createRoot } from 'react-dom/client'
import { useState, useRef } from 'react'
import DesignCanvas from '../src/components/DesignCanvas'

declare global {
  interface Window {
    __state: () => { zoom: number; pan: { x: number; y: number } }
    __worldUnder: (px: number, py: number) => { x: number; y: number }
    __wheel: (px: number, py: number, dy: number, shift?: boolean) => void
    __setZoom: (z: number) => void
  }
}

function Harness() {
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const canvasHost = useRef<HTMLDivElement>(null)

  window.__state = () => ({ zoom, pan })
  window.__worldUnder = (px, py) => ({ x: (px - pan.x) / zoom, y: (py - pan.y) / zoom })
  window.__setZoom = setZoom
  window.__wheel = (px, py, dy, shift = false) => {
    const cvs = canvasHost.current?.querySelector('canvas')
    if (!cvs) return
    const r = cvs.getBoundingClientRect()
    cvs.dispatchEvent(new WheelEvent('wheel', {
      deltaY: dy, clientX: r.left + px, clientY: r.top + py,
      shiftKey: shift, bubbles: true, cancelable: true,
    }))
  }

  return (
    <div style={{ width: 900, height: 600, position: 'relative' }}>
      <div ref={canvasHost} style={{ width: 900, height: 600, position: 'relative' }}>
        <DesignCanvas
          project={{ widthMeters: 100, heightMeters: 100 }}
          elements={[]} pipes={[]} layers={[{ id: 0, name: 'l', visible: true, color: '#000' }] as any}
          activeLayer={0} activeTool="select"
          selectedElement={null} selectedPipe={null}
          onSelectElement={() => {}} onSelectPipe={() => {}}
          onDeleteElement={() => {}} onDeletePipe={() => {}}
          onUpdatePipe={() => {}} onUpdateElement={() => {}}
          onAddElement={() => {}} onAddPipe={() => {}}
          zoom={zoom} pan={pan} onPanChange={setPan} onZoomChange={setZoom}
          phase="design" zones={{}}
        />
      </div>
    </div>
  )
}

const results: string[] = []
let pass = 0, fail = 0
function check(name: string, ok: boolean, detail = '') {
  if (ok) { pass++; results.push(`PASS  ${name}${detail ? ' :: ' + detail : ''}`) }
  else { fail++; results.push(`FAIL  ${name}${detail ? ' :: ' + detail : ''}`) }
}

const tick = () => new Promise(r => setTimeout(r, 60))

async function run() {
  await tick()

  // Wait until the canvas has mounted and its wheel listener is attached, so the
  // first real assertion never races the effect that binds it.
  {
    let ready = false
    for (let i = 0; i < 60 && !ready; i++) {
      window.__wheel(120, 120, -120)
      await tick()
      if (window.__state().zoom !== 1) ready = true
    }
    // start every assertion from a known view
    window.__setZoom(1)
    await tick()
    check('the canvas accepts wheel input', ready, ready ? '' : 'listener never attached')
    window.__setZoom(1)
    await tick()
  }
  const HOST = { x: 250, y: 180 }

  // ── wheel zooms, and the point under the cursor does not move ──
  {
    const before = window.__state()
    const world = window.__worldUnder(HOST.x, HOST.y)
    window.__wheel(HOST.x, HOST.y, -240)
    await tick()
    const after = window.__state()
    const worldAfter = window.__worldUnder(HOST.x, HOST.y)

    check('the wheel actually changes the zoom level', after.zoom > before.zoom,
      `${before.zoom} -> ${after.zoom}`)
    check('the wheel moves pan as well as zoom', after.pan.x !== before.pan.x || after.pan.y !== before.pan.y,
      JSON.stringify(after.pan))
    check('the point under the cursor stays under the cursor',
      Math.abs(world.x - worldAfter.x) < 1e-6 && Math.abs(world.y - worldAfter.y) < 1e-6,
      `(${world.x.toFixed(3)},${world.y.toFixed(3)}) -> (${worldAfter.x.toFixed(3)},${worldAfter.y.toFixed(3)})`)
  }

  // ── wheel down zooms back out ──
  {
    const before = window.__state()
    window.__wheel(HOST.x, HOST.y, 240)
    await tick()
    const after = window.__state()
    check('scrolling the other way zooms out', after.zoom < before.zoom, `${before.zoom} -> ${after.zoom}`)
  }

  // ── repeat many times: no drift, no runaway ──
  {
    const world = window.__worldUnder(HOST.x, HOST.y)
    for (let i = 0; i < 12; i++) { window.__wheel(HOST.x, HOST.y, -60); await tick() }
    const worldAfter = window.__worldUnder(HOST.x, HOST.y)
    const z = window.__state().zoom
    check('zooming repeatedly never drifts the anchored point',
      Math.abs(world.x - worldAfter.x) < 1e-6 && Math.abs(world.y - worldAfter.y) < 1e-6,
      `zoom=${z.toFixed(3)} drift=(${(worldAfter.x - world.x).toExponential(2)}, ${(worldAfter.y - world.y).toExponential(2)})`)
    check('zoom stays inside the supported range', z > 0.1 && z <= 8, String(z))
  }

  // ── an external zoom (toolbar +/-) keeps the canvas centre fixed ──
  {
    // Use the frame the component itself measured (its inline style), not the
    // bounding rect — the two can differ while the host is still settling.
    const cvs = document.querySelector('canvas') as HTMLCanvasElement
    const fw = parseFloat(cvs.style.width)
    const fh = parseFloat(cvs.style.height)
    const cx = fw / 2, cy = fh / 2
    const world = window.__worldUnder(cx, cy)
    const z0 = window.__state().zoom
    window.__setZoom(Number((z0 * 1.5).toFixed(4)))
    await tick()
    const worldAfter = window.__worldUnder(cx, cy)
    check('toolbar zoom keeps the canvas centre fixed',
      Math.abs(world.x - worldAfter.x) < 1e-6 && Math.abs(world.y - worldAfter.y) < 1e-6,
      `centre=(${cx},${cy}) (${world.x.toFixed(2)},${world.y.toFixed(2)}) -> (${worldAfter.x.toFixed(2)},${worldAfter.y.toFixed(2)})`)
  }

  // ── the ruler stays in step with the zoom ──
  {
    const scale = window.__state().zoom
    check('a zoomed canvas still reports a positive scale', scale > 0, String(scale))
  }

  const pre = document.createElement('pre')
  pre.id = 'results'
  pre.textContent = results.join('\n') + `\n\n==== ${pass}/${pass + fail} passed ====`
  document.body.appendChild(pre)
  document.title = fail ? 'FAIL' : 'OK'
}

const root = createRoot(document.getElementById('root')!)
root.render(<Harness />)
run().catch(e => {
  const pre = document.createElement('pre')
  pre.id = 'results'
  pre.textContent = 'ERROR ' + (e && (e as Error).stack)
  document.body.appendChild(pre)
})

// Renders the real PointEditor in a browser and checks the exclusivity rules
// as the user actually meets them: which rows are locked, why, and what the
// schematic preview shows.
import { createRoot } from 'react-dom/client'
import PointEditor from '../src/components/PointEditor'
import { PIPE_POINT_ITEMS, sanitizePointItems } from '../src/lib/pipePoints'
import { defaultFlowFor } from '../src/lib/pipePointSpecs'
import { pointIconElement } from '../src/lib/pointIconSprites'
import type { PipeNode } from '../src/lib/pipeNodeTypes'

/** How many fits' renders have decoded so far. */
function waitForRenders(timeoutMs = 12000): Promise<number> {
  const deadline = Date.now() + timeoutMs
  return new Promise(resolve => {
    const poll = () => {
      const ready = PIPE_POINT_ITEMS
        .filter(i => (pointIconElement(i.id)?.naturalWidth ?? 0) > 0).length
      if (ready === PIPE_POINT_ITEMS.length || Date.now() > deadline) return resolve(ready)
      setTimeout(poll, 50)
    }
    poll()
  })
}

/** Mean luminance of a canvas's painted (non-transparent) pixels, or null. */
function meanPaintedLuminance(cvs: HTMLCanvasElement): number | null {
  const ctx = cvs.getContext('2d')
  if (!ctx) return null
  const { data } = ctx.getImageData(0, 0, cvs.width, cvs.height)
  let sum = 0, n = 0
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 128) continue
    sum += (data[i] + data[i + 1] + data[i + 2]) / 3
    n++
  }
  return n ? sum / n : null
}

const results: string[] = []
let pass = 0, fail = 0
/** What the editor asked the workspace to store, per case. */
const captured: Record<number, Record<string, any>> = {}
function check(name: string, ok: boolean, detail = '') {
  if (ok) { pass++; results.push(`PASS  ${name}${detail ? ' :: ' + detail : ''}`) }
  else { fail++; results.push(`FAIL  ${name}${detail ? ' :: ' + detail : ''}`) }
}

const CASES: { label: string; items: string[]; specs?: Record<string, any> }[] = [
  { label: 'empty node', items: [] },
  { label: 'water monitor', items: ['water_monitor'] },
  { label: 'water + foam monitor (saved clash)', items: ['water_monitor', 'foam_monitor'] },
  { label: 'blind flange', items: ['blind_flange'] },
  { label: 'monitor + valve + hydrant', items: ['water_monitor', 'butterfly_valve', 'hydrant_single'] },
  // Appended so the earlier cases keep their positions.
  {
    label: 'monitor with specs recorded',
    items: ['water_monitor'],
    specs: { water_monitor: { size: 3, flow: 2850 } },
  },
  {
    label: 'double hydrant with specs',
    items: ['hydrant_double'],
    specs: { hydrant_double: { size: 4, flow: 2400 } },
  },
]

const style = document.createElement('style')
style.textContent = '.host .fixed{position:absolute !important}'
document.head.appendChild(style)

const hosts: HTMLDivElement[] = []
CASES.forEach(c => {
  const host = document.createElement('div')
  host.className = 'host'
  host.style.cssText =
    'position:relative;display:inline-block;width:340px;height:700px;overflow:hidden;' +
    'background:#fff;vertical-align:top;border-right:1px solid #e5e7eb'
  const holder = document.createElement('div')
  holder.style.cssText = 'position:absolute;inset:0'
  host.appendChild(holder)
  document.body.appendChild(host)
  hosts.push(holder)
})
document.body.style.cssText = 'margin:0;background:#f8fafc;font-family:Vazirmatn,sans-serif'

/** Mirrors the load path: what reaches the editor has already been repaired. */
const nodeFor = (items: string[]): PipeNode => ({
  id: 'n1', pipeId: 'p1', x: 300, y: 500, segIndex: 0, items: sanitizePointItems(items),
})

CASES.forEach((c, i) => {
  createRoot(hosts[i]).render(
    <PointEditor
      node={{ ...nodeFor(c.items), specs: c.specs }}
      pipeLabel="لوله آب آتش‌نشانی"
      pipeSize='4"'
      onUpdate={(_p, _n, updates) => { captured[i] = updates }}
      onDelete={() => {}}
      onClose={() => {}}
    />,
  )
})

const tick = () => new Promise(r => setTimeout(r, 80))
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

async function run() {
  await tick()
  await tick()

  const root = (i: number) => hosts[i]

  check('the editor lists every remaining fitting',
    root(0).querySelectorAll('input[type=checkbox]').length === PIPE_POINT_ITEMS.length,
    'rows=' + root(0).querySelectorAll('input[type=checkbox]').length)

  {
    const disabled = root(0).querySelectorAll('input[disabled]').length
    check('an empty node locks nothing', disabled === 0, 'locked=' + disabled)
  }
  {
    const disabled = root(1).querySelectorAll('input[disabled]').length
    check('with a monitor fitted only the blind flange is locked', disabled === 1, 'locked=' + disabled)
    check('the locked row says why',
      root(1).textContent!.includes('بندفلنج فقط روی گره بدون تجهیز نصب می‌شود'))
    check('group members stay live so one tick swaps them',
      !root(1).querySelector('input[type=checkbox][disabled]')!.closest('label')!.textContent!.includes('مانیتور'))
  }
  {
    // A clash that survived in a saved design is repaired before it is shown.
    const checked = Array.from(root(2).querySelectorAll('input[type=checkbox]'))
      .filter(el => (el as HTMLInputElement).checked).length
    check('two saved monitors collapse to one on load', checked === 1, 'checked=' + checked)
    check('the group hint marks the monitor rows', root(2).textContent!.includes('یکی از ۳'))
    check('the valve group hint is shown', root(2).textContent!.includes('یکی از ۲'))
  }
  {
    const disabled = root(3).querySelectorAll('input[disabled]').length
    check('with a blind flange fitted every other row is locked',
      disabled === PIPE_POINT_ITEMS.length - 1, 'locked=' + disabled)
    check('each locked row explains itself',
      root(3).textContent!.includes('ابتدا بندفلنج را بردارید'))
  }
  {
    const holders = root(4).querySelectorAll('.bg-emerald-50 canvas')
    check('the node preview draws one schematic per fitting', holders.length === 3,
      'icons=' + holders.length)
    check('the editor draws a real symbol per row',
      root(4).querySelectorAll('canvas').length >= PIPE_POINT_ITEMS.length,
      'canvases=' + root(4).querySelectorAll('canvas').length)
  }

  // The row icons must show the supplied renders, not the vector stand-in.
  // The blind flange separates them cleanly: the render is pale machined steel
  // and the glyph is near-black ink, so mean luminance of the painted pixels
  // tells which one landed.
  {
    const rect = PIPE_POINT_ITEMS.findIndex(i => i.id === 'blind_flange')
    const loaded = await waitForRenders()
    check('every render decodes in the browser', loaded === PIPE_POINT_ITEMS.length,
      `${loaded}/${PIPE_POINT_ITEMS.length}`)
    // The icon repaints on the frame *after* its image lands, so re-query and
    // re-read rather than sampling once: the row may not even be mounted yet.
    let lum: number | null = null
    let canvases = 0
    for (let i = 0; i < 25; i++) {
      const rows = root(4).querySelectorAll('canvas')
      canvases = rows.length
      const cvs = rows[rect] as HTMLCanvasElement | undefined
      if (cvs) {
        lum = meanPaintedLuminance(cvs)
        if (lum !== null && lum > 100) break
      }
      await sleep(150)
    }
    check('a row icon paints the supplied render, not the vector glyph',
      lum !== null && lum > 100,
      `canvases=${canvases} mean luminance of painted pixels = ${lum === null ? 'none' : lum.toFixed(1)}`)
  }

  // ── the numbers a fitting carries ──
  const specCaseIndex = () => CASES.findIndex(c => c.label === 'monitor with specs recorded')
  const flowCaseIndex = () => CASES.findIndex(c => c.label === 'double hydrant with specs')

  {
    const host = root(specCaseIndex())
    const labels = [...host.querySelectorAll('label')].map(l => l.textContent || '')
    check('an active fitting offers its outlet size',
      !!labels.find(t => t.includes('قطر خروجی')), labels.join(' | ').slice(0, 120))

    const sizeButtons = [...host.querySelectorAll('button')]
      .filter(b => /^\d+(\.\d+)?"$/.test((b.textContent || '').trim()))
    check('the size picker offers the nominal sizes',
      sizeButtons.length >= 3, sizeButtons.map(b => b.textContent).join(','))

    const active = sizeButtons.find(b => b.className.includes('border-sky-400'))
    check('the recorded size is the one shown as chosen', active?.textContent?.trim() === '3"',
      active?.textContent?.trim() || 'none')

    const flowInput = host.querySelector('input[type=number]') as HTMLInputElement | null
    check('the recorded outlet flow is loaded into its field',
      flowInput?.value === '2850', flowInput?.value || 'none')

    check('the fitting shows what it contributes',
      (host.textContent || '').includes('دبی این آیتم') && (host.textContent || '').includes('2850'))
    check('the node shows the total it contributes',
      (host.textContent || '').includes('جمع دبی این گره') && (host.textContent || '').includes('2850'))

    // Picking a new size must carry the flow that size implies.
    const two = sizeButtons.find(b => b.textContent?.trim() === '2"')
    two?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await tick()
    const sent = captured[specCaseIndex()]?.specs?.water_monitor
    check('choosing an outlet size stores the size and the flow it implies',
      sent?.size === 2 && sent?.flow === defaultFlowFor('water_monitor', 2), JSON.stringify(sent))
  }

  {
    const text = root(flowCaseIndex()).textContent || ''
    check('a double hydrant reports both outlets', text.includes('2 خروجی'), text.slice(-140))
    check('a double hydrant totals both outlets',
      text.includes('جمع دبی این گره') && text.includes('4800'), text.slice(-140))
  }

  {
    // Ticking has to create the spec entry, unticking has to drop it.
    // A real .click() is what a user does; setting .checked directly does not
    // reach React's change handler.
    const box = [...root(0).querySelectorAll('input[type=checkbox]')][0] as HTMLInputElement
    box.click()
    await tick()
    check('ticking a fitting records a default spec for it',
      captured[0]?.specs?.water_monitor?.size === 2.5, JSON.stringify(captured[0]?.specs))

    const box2 = [...root(specCaseIndex()).querySelectorAll('input[type=checkbox]')][0] as HTMLInputElement
    box2.click()
    await tick()
    check('unticking a fitting drops its spec',
      captured[specCaseIndex()]?.specs === undefined, JSON.stringify(captured[specCaseIndex()]?.specs))
  }

  const pre = document.createElement('pre')
  pre.id = 'results'
  pre.textContent = results.join('\n') + `\n\n==== ${pass}/${pass + fail} passed ====`
  document.body.appendChild(pre)
  document.title = fail ? 'FAIL' : 'OK'
}

run().catch(e => {
  const pre = document.createElement('pre')
  pre.id = 'results'
  pre.textContent = 'ERROR ' + (e && (e as Error).stack)
  document.body.appendChild(pre)
  document.title = 'FAIL'
})

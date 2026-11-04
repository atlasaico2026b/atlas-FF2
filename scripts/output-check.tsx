// Renders the real OutputPreview with a design that carries fitting specs, and
// checks the numbers a user reads off it: what is on each node, the equipment
// statistics, and the design demand.
import { createRoot } from 'react-dom/client'
import OutputPreview from '../src/components/OutputPreview'
import type { PipeSegment } from '../src/components/DesignWorkspace'

const results: string[] = []
let pass = 0, fail = 0
function check(name: string, ok: boolean, detail = '') {
  if (ok) { pass++; results.push(`PASS  ${name}${detail ? ' :: ' + detail : ''}`) }
  else { fail++; results.push(`FAIL  ${name}${detail ? ' :: ' + detail : ''}`) }
}

const node = (id: string, items: string[], specs?: Record<string, any>) =>
  ({ id, pipeId: 'p1', x: 0, y: 0, segIndex: 0, items, specs }) as never

const design: PipeSegment[] = [
  {
    id: 'p1',
    label: 'رینگ اصلی',
    layer: 1,
    color: '#dc2626',
    points: [{ x: 0, y: 0 }, { x: 100, y: 0 }],
    pipeWidth: 36,
    pipeSize: '6"',
    length: 120,
    nodes: [
      node('n1', ['water_monitor', 'butterfly_valve'],
        { water_monitor: { size: 3, flow: 2850 }, butterfly_valve: { size: 6 } }),
      node('n2', ['hydrant_double'], { hydrant_double: { size: 4, flow: 2400 } }),
      node('n3', []),
    ],
  },
] as never

const cases: { label: string; pipes: PipeSegment[] }[] = [
  { label: 'design with specs', pipes: design },
  { label: 'design with nothing fitted', pipes: [{ ...(design[0] as object), nodes: [node('x', [])] } as never] },
  { label: 'no pipes at all', pipes: [] },
]

const style = document.createElement('style')
style.textContent = '.host .fixed{position:absolute !important}'
document.head.appendChild(style)

const hosts: HTMLDivElement[] = []
cases.forEach(() => {
  const host = document.createElement('div')
  host.className = 'host'
  host.style.cssText =
    'position:relative;display:inline-block;width:760px;height:1200px;overflow:auto;' +
    'background:#fff;vertical-align:top;border:1px solid #e5e7eb'
  const holder = document.createElement('div')
  holder.style.cssText = 'position:absolute;inset:0'
  host.appendChild(holder)
  document.body.appendChild(host)
  hosts.push(holder)
})
document.body.style.cssText = 'margin:0;background:#f8fafc;font-family:Vazirmatn,sans-serif'

cases.forEach((c, i) => {
  createRoot(hosts[i]).render(
    <OutputPreview
      project={{ name: 'پروژه آزمون', widthMeters: 100, heightMeters: 100 }}
      elements={[]}
      pipes={c.pipes}
      zones={{}}
      onClose={() => {}}
    />,
  )
})

const tick = () => new Promise(r => setTimeout(r, 60))

async function run() {
  await tick(); await tick(); await tick()

  const text = (i: number) => hosts[i].textContent || ''

  // ── what is on each node ──
  {
    const t = text(0)
    check('the output lists the fittings chosen on each node',
      t.includes('گره‌ها و تجهیزات انتخاب‌شده'), t.slice(0, 80))
    check('a node shows its fittings by name', t.includes('مانیتور آب') && t.includes('ولو پروانه‌ای'))
    check('a node shows the outlet size recorded for a fitting', t.includes('Ø3"'), t.slice(0, 200))
    check('a node shows the outlet flow recorded for a fitting', t.includes('2850 L/min'), '')
    check('a node with nothing fitted says so', t.includes('بدون تجهیز'))
  }

  // ── equipment statistics ──
  {
    const t = text(0)
    check('the output has an equipment statistics section', t.includes('آمار تجهیزات گره‌ها'))
    check('statistics count each fitting', t.includes('ولو پروانه‌ای') && t.includes('هایدرانت دوبل'))
    check('statistics report the sizes used', t.includes('6"×1') && t.includes('4"×1'),
      'size summary missing')
    check('statistics show the sizes as chips', t.includes('سایزهای استفاده‌شده'),
      '')
    const chips = [...hosts[0].querySelectorAll('span')]
      .map(s => (s.textContent || '').trim())
      .filter(x => /^\d+(\.\d+)?" × \d+$/.test(x))
    check('every used size appears once in the chips',
      chips.length === 3, chips.join(' | '))
  }

  // ── the demand calculation ──
  {
    const t = text(0)
    check('the output calculates a design demand', t.includes('محاسبه دبی طراحی'))
    check('the monitor total is shown', t.includes('جمع دبی مانیتورها') && t.includes('2850'))
    check('the hydrant total counts both outlets of a double hydrant',
      t.includes('جمع دبی هایدرانت‌ها') && t.includes('4800'),
      '')
    check('the design demand is the sum of the two', t.includes('7650'), '')
    check('the arithmetic is written out', t.includes('2850 + 4800 = 7650'), '')
    check('a summary card carries the design demand', t.includes('دبی طراحی (L/min)'))
    check('the reference sheet names the demand formula',
      t.includes('Design demand'), '')
  }

  // ── the empty states must not invent numbers ──
  {
    const t = text(1)
    check('a design with nothing fitted says there is no demand',
      t.includes('هیچ مانیتور یا هایدرانتی روی گره‌ها ثبت نشده'), '')
    check('a design with nothing fitted shows no statistics table',
      !t.includes('آمار تجهیزات گره‌ها'), '')
    check('its demand card reads zero', t.includes('دبی طراحی (L/min)'), '')
  }
  {
    const t = text(2)
    check('a design with no pipes still renders', t.includes('گزارش خروجی طراحی'))
    check('a design with no pipes reports no fittings', t.includes('تجهیز گره (0 گره)'), '')
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

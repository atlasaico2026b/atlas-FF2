// Screenshot harness: renders the real OutputPreview with a design basis and a
// worst-case result, so the banner, the open items and the constants appendix
// are all on screen.
import { createRoot } from 'react-dom/client'
import OutputPreview from '../src/components/OutputPreview'
import type { PipeSegment } from '../src/components/DesignWorkspace'
import { defaultBasis } from '../src/lib/calc/basis'
import { validateDesign } from '../src/lib/calc/validate'
import { computeWaterSpray } from '../src/lib/calc/nfpa15'
import { calcWorstCase } from '../src/lib/fireCalculations'

const node = (id: string, items: string[], specs?: Record<string, any>) =>
  ({ id, pipeId: 'p1', x: 0, y: 0, segIndex: 0, items, specs }) as never

const pipes: PipeSegment[] = [
  {
    id: 'p1', label: 'رینگ اصلی', layer: 1, color: '#dc2626',
    points: [{ x: 0, y: 0 }, { x: 100, y: 0 }],
    pipeWidth: 36, pipeSize: '6"', length: 120,
    nodes: [
      node('n1', ['water_monitor'], { water_monitor: { size: 3, flow: 1900 } }),
      node('n2', ['hydrant_double'], { hydrant_double: { size: 4, flow: 1200 } }),
    ],
  },
] as never

const basis = defaultBasis()
const worstCase = calcWorstCase([{
  id: 't1', name: 'T-1', type: 'cone_roof', diameterM: 30, heightM: 15,
  fuelType: 'nafte_gaz', x: 0, y: 0,
}])

const spray = computeWaterSpray({ equipmentClass: 'vertical_atmospheric_tank', diameterM: 30, heightM: 15 }, basis)
const validation = validateDesign({ basis, spray })

const host = document.createElement('div')
host.style.cssText = 'position:relative;width:900px;height:2400px;overflow:auto;background:#fff'
const holder = document.createElement('div')
holder.style.cssText = 'position:absolute;inset:0'
host.appendChild(holder)
document.body.appendChild(host)
document.body.style.cssText = 'margin:0;background:#f8fafc;font-family:Vazirmatn,sans-serif'
const style = document.createElement('style')
style.textContent = '.host .fixed{position:absolute !important}'
document.head.appendChild(style)

createRoot(holder).render(
  <OutputPreview
    project={{ name: 'پروژه آزمون', widthMeters: 100, heightMeters: 100 }}
    elements={[]}
    pipes={pipes}
    zones={{}}
    basis={basis}
    worstCaseResult={worstCase}
    validation={validation}
    onClose={() => {}}
  />,
)

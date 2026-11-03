// Deterministic checks for the per-fitting specs and the statistics the output
// schedules and the design-demand calculation are built from.
// Run: bun scripts/point-specs-check.ts
import { PIPE_POINT_ITEMS, togglePointItem } from '../src/lib/pipePoints'
import {
  PIPE_POINT_SPEC_DEFS, specFields, resolveSpec, defaultSpec, fittingFlow,
  defaultFlowFor, specSummary, specOutlets, isDischargeFitting, sanitizeNodeSpecs,
} from '../src/lib/pipePointSpecs'
import { collectFittingStats } from '../src/lib/fittingStats'
import type { PipeNode } from '../src/lib/pipeNodeTypes'

let pass = 0
let fail = 0
function check(name: string, ok: boolean, detail = '') {
  if (ok) { pass++; console.log(`PASS  ${name}${detail ? ' :: ' + detail : ''}`) }
  else { fail++; console.log(`FAIL  ${name}${detail ? ' :: ' + detail : ''}`) }
}

const node = (items: string[], specs?: Record<string, any>): PipeNode => ({
  id: 'n', pipeId: 'p', x: 0, y: 0, segIndex: 0, items, specs,
})

// ─── every catalogue fitting can be described ───
{
  const missing = PIPE_POINT_ITEMS.filter(i => !PIPE_POINT_SPEC_DEFS[i.id]).map(i => i.id)
  check('every fitting in the catalogue has spec fields', missing.length === 0, JSON.stringify(missing))

  const noSize = PIPE_POINT_ITEMS.filter(i => !specFields(i.id).some(f => f.key === 'size')).map(i => i.id)
  check('every fitting can record a size in inches', noSize.length === 0, JSON.stringify(noSize))

  const flowable = PIPE_POINT_ITEMS.filter(i => specFields(i.id).some(f => f.key === 'flow')).map(i => i.id)
  check('monitors and hydrants can record an outlet flow',
    flowable.length === 5 && flowable.every(id => isDischargeFitting(id)), JSON.stringify(flowable))
  check('valves and the inductor record no flow',
    ['butterfly_valve', 'inline_valve', 'inline_inductor'].every(id => !isDischargeFitting(id)))
  check('only a double hydrant has two outlets',
    specOutlets('hydrant_double') === 2
      && ['hydrant_single', 'water_monitor', 'butterfly_valve'].every(id => specOutlets(id) <= 1))
}

// ─── defaults, resolution and clamping ───
{
  const d = defaultSpec('water_monitor')
  check('a monitor defaults to a 2.5" outlet', d.size === 2.5, JSON.stringify(d))
  check('a monitor defaults to a real outlet flow', Number(d.flow) > 0, String(d.flow))

  check('a missing spec resolves to the defaults',
    JSON.stringify(resolveSpec('water_monitor', null)) === JSON.stringify(defaultSpec('water_monitor')))
  check('unknown keys are dropped',
    !('nonsense' in resolveSpec('water_monitor', { nonsense: 5 } as never)),
    JSON.stringify(resolveSpec('water_monitor', { nonsense: 5 } as never)))
  check('an unlisted size falls back to the default one',
    resolveSpec('water_monitor', { size: 7 }).size === 2.5,
    String(resolveSpec('water_monitor', { size: 7 }).size))
  check('a listed size is kept', resolveSpec('water_monitor', { size: 2 }).size === 2)
  check('a flow above the range is clamped',
    Number(resolveSpec('water_monitor', { flow: 999999 }).flow) < 999999,
    String(resolveSpec('water_monitor', { flow: 999999 }).flow))
  check('a flow below the range is clamped',
    Number(resolveSpec('water_monitor', { flow: -50 }).flow) > 0,
    String(resolveSpec('water_monitor', { flow: -50 }).flow))
  check('a nonsense flow falls back to the default',
    resolveSpec('water_monitor', { flow: 'abc' as never }).flow === defaultSpec('water_monitor').flow)
  check('a valve needs no flow field at all',
    !specFields('butterfly_valve').some(f => f.key === 'flow'),
    JSON.stringify(specFields('butterfly_valve').map(f => f.key)))
}

// ─── flow follows the chosen outlet size ───
{
  const sizes = specFields('water_monitor').find(f => f.sizes)!.sizes!
  check('the size list is ascending and non-empty', sizes.length >= 3 && sizes.every((s, i) => i === 0 || s > sizes[i - 1]),
    JSON.stringify(sizes))
  check('every monitor size implies a flow',
    sizes.every(s => (defaultFlowFor('water_monitor', s) ?? 0) > 0),
    JSON.stringify(sizes.map(s => [s, defaultFlowFor('water_monitor', s)])))
  check('a bigger outlet implies more flow',
    defaultFlowFor('water_monitor', 3)! > defaultFlowFor('water_monitor', 1.5)!,
    `${defaultFlowFor('water_monitor', 1.5)} -> ${defaultFlowFor('water_monitor', 3)}`)
  check('a valve implies no flow', defaultFlowFor('butterfly_valve', 4) === undefined)
}

// ─── contribution to the demand ───
{
  check('a monitor contributes its outlet flow',
    fittingFlow('water_monitor', { size: 2.5, flow: 1900 }) === 1900)
  check('a single hydrant contributes once',
    fittingFlow('hydrant_single', { size: 2.5, flow: 950 }) === 950)
  check('a double hydrant contributes both outlets',
    fittingFlow('hydrant_double', { size: 2.5, flow: 950 }) === 1900,
    String(fittingFlow('hydrant_double', { size: 2.5, flow: 950 })))
  check('a valve contributes nothing to the demand',
    fittingFlow('butterfly_valve', { size: 4 }) === 0)
  check('an unset fitting still contributes its default flow',
    fittingFlow('water_monitor', undefined) === Number(defaultSpec('water_monitor').flow))
}

// ─── spec text ───
{
  const s = specSummary('hydrant_double', { size: 4, flow: 2400 })
  check('the summary carries the size, the flow and the outlet count',
    s.includes('4"') && s.includes('2400') && /۲|2/.test(s), s)
  check('a valve summary is just its size', specSummary('butterfly_valve', { size: 6 }) === 'Ø6"',
    specSummary('butterfly_valve', { size: 6 }))
}

// ─── a node's specs are kept in step with its fittings ───
{
  const items = togglePointItem(togglePointItem([], 'water_monitor'), 'butterfly_valve')
  const specs = sanitizeNodeSpecs(items, undefined)
  check('ticking a fitting creates a spec for it',
    !!specs && items.every(id => !!specs[id]), JSON.stringify(specs))

  const stale = { water_monitor: { size: 3, flow: 2850 }, removed_valve: { size: 8 } }
  const kept = sanitizeNodeSpecs(['water_monitor'], stale as never)!
  check('a spec for a fitting that is no longer on the node is dropped',
    !('removed_valve' in kept), JSON.stringify(kept))
  check('the kept spec survives', kept.water_monitor.size === 3, JSON.stringify(kept.water_monitor))
  check('an empty node stores no specs', sanitizeNodeSpecs([], stale as never) === undefined)
}

// ─── the roll-up the report reads ───
{
  const pipes = [{
    label: 'رینگ اصلی',
    nodes: [
      node(['water_monitor', 'butterfly_valve'], { water_monitor: { size: 3, flow: 2850 }, butterfly_valve: { size: 6 } }),
      node(['hydrant_double'], { hydrant_double: { size: 4, flow: 2400 } }),
      node([], undefined),
    ],
  }]
  const st = collectFittingStats(pipes)

  check('only fitted nodes are counted', st.fittedNodeCount === 2, String(st.fittedNodeCount))
  check('every fitting on a node is counted', st.totalFittings === 3, String(st.totalFittings))
  check('the monitor row carries its size and flow',
    st.rows[0].id === 'water_monitor' && st.rows[0].count === 1 && st.rows[0].sizes[0] === 3 && st.rows[0].flow === 2850,
    JSON.stringify(st.rows[0]))
  check('monitor flow totals into the demand', st.discharge.monitorFlow === 2850, String(st.discharge.monitorFlow))
  check('a double hydrant counts both outlets in the demand',
    st.discharge.hydrantFlow === 4800 && st.discharge.hydrantCount === 1,
    JSON.stringify(st.discharge))
  check('the design demand is monitors plus hydrants',
    st.discharge.totalFlow === 7650, String(st.discharge.totalFlow))
  check('sizes used are tallied across fitting types',
    JSON.stringify(st.sizeCounts) === JSON.stringify([{ size: 3, count: 1 }, { size: 4, count: 1 }, { size: 6, count: 1 }]),
    JSON.stringify(st.sizeCounts))
  check('each node reports what is on it',
    st.nodes.length === 2 && st.nodes[0].lines.length === 2 && st.nodes[0].flow === 2850,
    JSON.stringify(st.nodes.map(n => n.lines.length)))
  const hydrantRow = st.rows.find(r => r.id === 'hydrant_double')!
  check('a row with one size and one item reads plainly',
    hydrantRow.sizeSummary === '4"×1', hydrantRow.sizeSummary)
}

{
  // A design saved before specs existed: items only, no specs at all.
  const legacy = [{ label: 'قدیمی', nodes: [node(['water_monitor', 'hydrant_single'])] }]
  const st = collectFittingStats(legacy)
  check('an old design still produces a demand from the defaults',
    st.discharge.totalFlow === Number(defaultSpec('water_monitor').flow) + Number(defaultSpec('hydrant_single').flow),
    String(st.discharge.totalFlow))
  check('an old design still lists its fittings', st.totalFittings === 2, String(st.totalFittings))
}

{
  // Retired ids may still sit in a saved file; they must not inflate anything.
  const withRetired = [{ label: 'x', nodes: [node(['check_valve', 'flowmeter'])] }]
  const st = collectFittingStats(withRetired)
  check('retired fittings never reach the statistics',
    st.totalFittings === 0 && st.discharge.totalFlow === 0, JSON.stringify(st.discharge))
}

{
  // Sizes of the same fitting type must be tallied separately.
  const mixed = [{
    label: 'y',
    nodes: [
      node(['butterfly_valve'], { butterfly_valve: { size: 4 } }),
      node(['butterfly_valve'], { butterfly_valve: { size: 6 } }),
      node(['butterfly_valve'], { butterfly_valve: { size: 4 } }),
    ],
  }]
  const st = collectFittingStats(mixed)
  const row = st.rows[0]
  check('two sizes of one fitting are each counted',
    row.count === 3 && row.sizeSummary === '4"×2 • 6"×1', `${row.count} :: ${row.sizeSummary}`)
  check('a valve adds no demand even when several are fitted', st.discharge.totalFlow === 0)
}

{
  // Ordering: the report must not reshuffle between runs.
  const st = collectFittingStats([{
    label: 'z',
    nodes: [node(['blind_flange', 'water_monitor', 'hydrant_single'], {
      blind_flange: { size: 4 }, water_monitor: { size: 2.5, flow: 1900 }, hydrant_single: { size: 2.5, flow: 950 },
    })],
  }])
  const order = st.rows.map(r => r.id)
  const expected = PIPE_POINT_ITEMS.map(i => i.id).filter(id => order.includes(id))
  check('rows always come out in catalogue order',
    JSON.stringify(order) === JSON.stringify(expected), JSON.stringify(order))
  check('node lines follow the same catalogue order',
    JSON.stringify(st.nodes[0].lines.map(l => l.id)) === JSON.stringify(expected),
    JSON.stringify(st.nodes[0].lines.map(l => l.id)))
}

console.log(`\n${pass} passed, ${fail} failed`)
if (fail) process.exit(1)

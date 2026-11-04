// SPDX-License-Identifier: Apache-2.0
// ═══════════════════════════════════════════════════════════════════
// FITTING STATISTICS — the roll-up the schedules and the demand
// calculation are built from.
//
// It is deliberately independent of the workspace's types: anything with a
// label and a node list can be summarised, so the same numbers feed the
// on-screen output, the printed report and the tests.
// ═══════════════════════════════════════════════════════════════════

import { PIPE_POINT_ITEMS } from './pipePoints'
import { fittingFlow, isDischargeFitting, resolveSpec, specSummary } from './pipePointSpecs'
import type { PipePointSpec } from './pipePointSpecs'
import type { PipeNode } from './pipeNodeTypes'

/** A pipe, reduced to what the statistics need. */
export interface StatsPipe {
  label?: string
  nodes?: PipeNode[]
}

export interface FittingStatRow {
  id: string
  label: string
  count: number
  /** Distinct nominal sizes used, ascending. */
  sizes: number[]
  /** `2.5"×3 • 4"×1` — how many of each size. */
  sizeSummary: string
  /** Total outlet flow this fitting type adds, L/min. */
  flow: number
}

export interface NodeStatLine {
  id: string
  label: string
  summary: string
  flow: number
}

export interface NodeStat {
  pipeLabel: string
  index: number
  lines: NodeStatLine[]
  flow: number
}

export interface FittingStats {
  rows: FittingStatRow[]
  nodes: NodeStat[]
  /** Nodes that carry at least one fitting. */
  fittedNodeCount: number
  totalFittings: number
  /** How many fittings use each nominal size, ascending. */
  sizeCounts: { size: number; count: number }[]
  discharge: {
    monitorFlow: number
    hydrantFlow: number
    totalFlow: number
    monitorCount: number
    hydrantCount: number
  }
}

// Ids are `water_monitor` / `hydrant_single`, so the kind is a prefix match,
// not a suffix one.
const isMonitor = (id: string) => id.includes('monitor')
const isHydrant = (id: string) => id.includes('hydrant')

interface Tally {
  count: number
  flow: number
  /** Nominal size → how many of that size. */
  sizes: Map<number, number>
}

export function collectFittingStats(pipes: StatsPipe[]): FittingStats {
  const byId = new Map<string, Tally>()
  const sizeTotals = new Map<number, number>()
  const nodes: NodeStat[] = []
  let totalFittings = 0
  let monitorFlow = 0, hydrantFlow = 0, monitorCount = 0, hydrantCount = 0

  pipes.forEach((pipe, pipeIndex) => {
    (pipe.nodes || []).forEach((node, nodeIndex) => {
      const lines: NodeStatLine[] = []
      let nodeFlow = 0

      // Walk the catalogue rather than the node's own list, so a node always
      // reads in the same order however it was built and retired ids are skipped.
      for (const def of PIPE_POINT_ITEMS) {
        if (!node.items?.includes(def.id)) continue
        const spec = node.specs?.[def.id] as PipePointSpec | undefined
        const flow = fittingFlow(def.id, spec)
        totalFittings += 1
        nodeFlow += flow

        const tally = byId.get(def.id) || { count: 0, flow: 0, sizes: new Map<number, number>() }
        tally.count += 1
        tally.flow += flow
        const size = Number(resolveSpec(def.id, spec).size)
        if (Number.isFinite(size)) {
          tally.sizes.set(size, (tally.sizes.get(size) || 0) + 1)
          sizeTotals.set(size, (sizeTotals.get(size) || 0) + 1)
        }
        byId.set(def.id, tally)

        if (isDischargeFitting(def.id)) {
          if (isMonitor(def.id)) { monitorFlow += flow; monitorCount += 1 }
          if (isHydrant(def.id)) { hydrantFlow += flow; hydrantCount += 1 }
        }

        lines.push({ id: def.id, label: def.label, summary: specSummary(def.id, spec), flow })
      }

      if (lines.length) {
        nodes.push({
          pipeLabel: pipe.label || `لوله ${pipeIndex + 1}`,
          index: nodeIndex + 1,
          lines,
          flow: nodeFlow,
        })
      }
    })
  })

  const rows: FittingStatRow[] = [...byId.entries()].map(([id, t]) => {
    const sizes = [...t.sizes.keys()].sort((a, b) => a - b)
    return {
      id,
      label: PIPE_POINT_ITEMS.find(i => i.id === id)?.label || id,
      count: t.count,
      sizes,
      sizeSummary: sizes.map(s => `${s}"×${t.sizes.get(s)}`).join(' • '),
      flow: t.flow,
    }
  })
  // Catalogue order keeps the schedule stable between reports.
  const order = (id: string) => PIPE_POINT_ITEMS.findIndex(i => i.id === id)
  rows.sort((a, b) => order(a.id) - order(b.id))

  return {
    rows,
    nodes,
    fittedNodeCount: nodes.length,
    totalFittings,
    sizeCounts: [...sizeTotals.entries()]
      .map(([size, count]) => ({ size, count }))
      .sort((a, b) => a.size - b.size),
    discharge: {
      monitorFlow, hydrantFlow,
      totalFlow: monitorFlow + hydrantFlow,
      monitorCount, hydrantCount,
    },
  }
}

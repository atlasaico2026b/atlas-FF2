// SPDX-License-Identifier: Apache-2.0
// Shared PipeNode shape — kept in its own module so both the lib helpers and
// the design workspace can import it without a circular dependency.

import type { PipePointSpec } from './pipePointSpecs'

export interface PipeNode {
  id: string
  pipeId: string
  /** Canvas world coordinates (pixels) */
  x: number
  y: number
  /** Index of the pipe segment this node sits on */
  segIndex: number
  /** Ids of the selected PIPE_POINT_ITEMS fitted at this node */
  items: string[]
  /**
   * Per-fitting spec (outlet size, flow, …) keyed by fitting id. Optional
   * because designs saved before specs existed carry no such field — a
   * missing entry resolves to that fitting's defaults.
   */
  specs?: Record<string, PipePointSpec>
}

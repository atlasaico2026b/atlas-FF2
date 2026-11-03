// SPDX-License-Identifier: Apache-2.0
// ═══════════════════════════════════════════════════════════════════
// CALCULATION SERVICE — PUBLIC SURFACE
//
// Layers, deliberately separated so a formula is never mixed with a policy:
//   units        — dimensions, conversions, input rejection
//   provenance   — source type, standard edition/clause, verification status
//   basis        — the project's design basis (all parameters with provenance)
//   geometry     — surfaces, volumes, ring elevations
//   nfpa15/11/20 — standard requirement resolution + the formulas
//   hydraulics   — Hazen-Williams and minor losses
//   bundwall     — containment gross/net
//   demand       — monitor/hydrant aggregation with simultaneity
//   validate     — blocking errors and warnings
//   report       — auditable report model
//   legacy       — migration of pre-basis projects
// ═══════════════════════════════════════════════════════════════════

export * from './units'
export * from './provenance'
export * from './basis'
export * from './geometry'
export * from './hydraulics'
export * from './nfpa15'
export * from './nfpa11'
export * from './nfpa20'
export * from './bundwall'
export * from './demand'
export * from './validate'
export * from './report'
export * from './legacy'

/**
 * Headless EXPLAIN plan analysis.
 *
 * This entry point has **no runtime dependencies** — no React, no graph library,
 * no host. Everything here takes a parsed `ExplainPlan` and derives something
 * from it.
 *
 * Rendering lives in `@tabularis/explain/react`; the ReactFlow adapter lives in
 * `@tabularis/explain/flow`.
 */

export type { ExplainNode, ExplainPlan } from "./types";

export type {
  ExplainMetrics,
  ExplainNodeMetrics,
  ExplainMetricKind,
} from "./metrics";
export {
  EXPLAIN_METRIC_KINDS,
  computeExplainMetrics,
  getNodeMetrics,
  getMetricValue,
  getMetricMax,
  isMetricAvailable,
  getAvailableMetricKinds,
  getDefaultMetricKind,
} from "./metrics";

export type {
  ExplainDiagnostic,
  ExplainDiagnosticKind,
  ExplainDiagnosticSeverity,
} from "./diagnostics";
export {
  EXPLAIN_DIAGNOSTIC_THRESHOLDS,
  getNodeDiagnostics,
  getPlanDiagnostics,
  getWorstSeverity,
  countDiagnosticsBySeverity,
} from "./diagnostics";

export type {
  ExplainPlanStats,
  ExplainNodeTypeStat,
  ExplainRelationStat,
  ExplainIndexStat,
} from "./stats";
export { getExplainPlanStats } from "./stats";

export type {
  NodeCostStyle,
  ExplainMetricNode,
  ExplainPlanSummary,
} from "./plan";
export {
  getNodeCostStyle,
  getHeatBarClass,
  formatCost,
  formatTime,
  formatRows,
  formatRatio,
  getMaxCost,
  getMaxTime,
  flattenExplainNodes,
  findExplainNode,
  getRowEstimateRatio,
  getExplainPlanSummary,
  getExplainDriverLegend,
} from "./plan";

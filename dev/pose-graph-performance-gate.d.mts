export const requiredCases: readonly string[];
export function poseGraphPerformanceGate(report: unknown): {
  status: 'PGRUN_FASTER_THAN_OMC_PASS' | 'PGRUN_PERFORMANCE_TARGET_MISSED';
  passed: boolean;
  cases: {name: string; omcMs: number; rumocaMs: number; ratio: number; passed: boolean}[];
  scope: string;
};

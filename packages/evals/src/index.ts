export type EvalCase<TInput = unknown, TExpected = unknown> = {
  id: string;
  task: string;
  input: TInput;
  expected: TExpected;
};

export type EvalResult = {
  caseId: string;
  passed: boolean;
  score: number;
  notes?: string;
};

export function releaseGate(results: EvalResult[], minimumAverage = 0.9): { pass: boolean; average: number } {
  if (results.length === 0) return { pass: false, average: 0 };
  if (results.some((result) => !result.passed)) return { pass: false, average: results.reduce((sum, item) => sum + item.score, 0) / results.length };
  const average = results.reduce((sum, item) => sum + item.score, 0) / results.length;
  return { pass: average >= minimumAverage, average };
}

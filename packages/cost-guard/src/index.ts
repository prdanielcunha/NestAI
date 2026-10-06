export type CostState = { requestsToday: number; providerCallsToday: number; neuronsToday?: number };
export type CostLimits = { maxRequestsPerDay: number; maxProviderCallsPerDay: number; maxNeuronsPerDay?: number };

export function assertWithinFreeBudget(state: CostState, limits: CostLimits): void {
  if (state.requestsToday >= limits.maxRequestsPerDay) throw new Error("COST_GUARD_REQUEST_LIMIT");
  if (state.providerCallsToday >= limits.maxProviderCallsPerDay) throw new Error("COST_GUARD_PROVIDER_LIMIT");
  if (limits.maxNeuronsPerDay !== undefined && state.neuronsToday !== undefined && state.neuronsToday >= limits.maxNeuronsPerDay) {
    throw new Error("COST_GUARD_NEURON_LIMIT");
  }
}

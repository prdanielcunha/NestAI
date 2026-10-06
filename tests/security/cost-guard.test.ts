import { describe, expect, it } from "vitest";
import { assertWithinFreeBudget } from "../../packages/cost-guard/src/index.js";

describe("free-only cost guard", () => {
  it("allows work below configured ceilings", () => {
    expect(() => assertWithinFreeBudget(
      { requestsToday: 10, providerCallsToday: 10, neuronsToday: 100 },
      { maxRequestsPerDay: 100, maxProviderCallsPerDay: 100, maxNeuronsPerDay: 10_000 },
    )).not.toThrow();
  });

  it("fails closed at request ceiling", () => {
    expect(() => assertWithinFreeBudget(
      { requestsToday: 100, providerCallsToday: 10 },
      { maxRequestsPerDay: 100, maxProviderCallsPerDay: 100 },
    )).toThrow("COST_GUARD_REQUEST_LIMIT");
  });

  it("fails closed at provider-call ceiling", () => {
    expect(() => assertWithinFreeBudget(
      { requestsToday: 10, providerCallsToday: 100 },
      { maxRequestsPerDay: 100, maxProviderCallsPerDay: 100 },
    )).toThrow("COST_GUARD_PROVIDER_LIMIT");
  });

  it("fails closed at Workers AI neuron ceiling", () => {
    expect(() => assertWithinFreeBudget(
      { requestsToday: 10, providerCallsToday: 10, neuronsToday: 10_000 },
      { maxRequestsPerDay: 100, maxProviderCallsPerDay: 100, maxNeuronsPerDay: 10_000 },
    )).toThrow("COST_GUARD_NEURON_LIMIT");
  });
});

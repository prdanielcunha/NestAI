import { z } from "zod";

export const Sensitivity = z.enum(["P0_PUBLIC","P1_INTERNAL","P2_PERSONAL","P3_SENSITIVE","P4_RESTRICTED"]);
export type Sensitivity = z.infer<typeof Sensitivity>;

export const BillingMode = z.enum(["FREE_ONLY","HYBRID_BUDGETED","PREMIUM_ROUTING"]);
export type BillingMode = z.infer<typeof BillingMode>;

export const TaskRequest = z.object({
  task: z.string().min(3),
  input: z.unknown(),
  context: z.object({ organizationId: z.string().min(1).optional(), locale: z.enum(["pt-BR","en","es"]).optional() }).default({})
});
export type TaskRequest = z.infer<typeof TaskRequest>;

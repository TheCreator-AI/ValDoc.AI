import { z } from "zod";

export const factModelSchema = z.object({
  intendedUse: z.string().nullable(),
  coreFunctions: z.array(z.string()).default([]),
  utilities: z.array(z.string()).default([]),
  safetyFeatures: z.array(z.string()).default([]),
  sensors: z.array(z.string()).default([]),
  dataInterfaces: z.array(z.string()).default([]),
  softwareVersion: z.string().nullable(),
  processRanges: z
    .array(
      z.object({
        parameter: z.string(),
        min: z.number(),
        max: z.number(),
        units: z.string()
      }).strict()
    )
    .default([]),
  citations: z
    .array(
      z.object({
        sourceDocumentId: z.string(),
        page: z.number().int().nonnegative(),
        section: z.string(),
        evidence: z.string()
      }).strict()
    )
    .default([])
}).strict();

export type FactModelSchema = z.infer<typeof factModelSchema>;

export const validateFactModel = (value: unknown) => {
  const result = factModelSchema.safeParse(value);
  if (!result.success) {
    throw new Error(`Invalid fact model schema: ${result.error.issues[0]?.message ?? "unknown error"}`);
  }
  return result.data;
};


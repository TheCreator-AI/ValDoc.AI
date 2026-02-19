import { riskTaxonomy } from "@/server/risk/taxonomy";

export const computeInitialRisk = (params: { severity: number; occurrence: number; detection: number }) => {
  const raw = params.severity * params.occurrence * params.detection;
  return Math.max(riskTaxonomy.scoring_model.min_risk, Math.min(riskTaxonomy.scoring_model.max_risk, raw));
};

export const computeResidualRisk = (params: { initialRisk: number; controlEffectiveness: number[] }) => {
  const totalEffectiveness = params.controlEffectiveness.reduce((acc, value) => acc + value, 0);
  const bounded = Math.max(0, Math.min(0.8, totalEffectiveness));
  const residual = Math.round(params.initialRisk * (1 - bounded));
  return Math.max(riskTaxonomy.scoring_model.min_risk, residual);
};

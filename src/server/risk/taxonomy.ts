import taxonomy from "../../../rules/risk_taxonomy.v1.json";

export type RiskTaxonomy = typeof taxonomy;

export const riskTaxonomy: RiskTaxonomy = taxonomy;

export const resolveHazardCategory = (category: string, statement: string) => {
  const haystack = `${category} ${statement}`.toLowerCase();
  for (const hazard of riskTaxonomy.hazard_categories) {
    if (hazard.keywords.some((keyword) => haystack.includes(keyword.toLowerCase()))) {
      return hazard;
    }
  }
  return riskTaxonomy.hazard_categories[3];
};

export const controlsForHazard = (hazardCategory: string) => {
  return riskTaxonomy.control_library.filter((control) => control.hazard_category === hazardCategory);
};

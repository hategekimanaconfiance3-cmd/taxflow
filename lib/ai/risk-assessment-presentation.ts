export interface RiskAssessmentFactorInput {
  signal: string;
  weight: number;
  value: number;
  description: string;
}

export interface RiskAssessmentInput {
  score: number;
  level: "low" | "medium" | "high" | "critical";
  factors: RiskAssessmentFactorInput[];
  computedAt: Date;
}

type FactorStatus = "computed" | "insufficient_data" | "unavailable";

export interface RiskAssessmentAIPresentation {
  findingType: string;
  status: "complete" | "incomplete";
  score: number | null;
  level: "low" | "medium" | "high" | "critical" | "unavailable";
  factors: Array<{
    signal: string;
    weight: number;
    value: number | null;
    status: FactorStatus;
    description: string;
  }>;
  computedAt: Date;
  methodology: {
    type: string;
    calibration: string;
    interpretation: string;
    limitations: string[];
  };
}

function getFactorStatus(description: string): FactorStatus {
  if (/unable to compute/i.test(description)) return "unavailable";
  if (/no recent transactions|no recent activity|no tax obligations/i.test(description)) return "insufficient_data";
  return "computed";
}

/**
 * Present the legacy risk heuristic safely to AI consumers. The underlying
 * calculation is unchanged; this prevents missing or failed inputs from being
 * described as a low-risk score.
 */
export function presentRiskAssessmentForAI(input: RiskAssessmentInput): RiskAssessmentAIPresentation {
  const factors = input.factors.map((factor) => {
    const status = getFactorStatus(factor.description);
    return {
      signal: factor.signal,
      weight: factor.weight,
      value: status === "computed" ? factor.value : null,
      status,
      description: factor.description,
    };
  });
  const complete = factors.every((factor) => factor.status === "computed");

  return {
    findingType: "system-generated risk signal",
    status: complete ? "complete" : "incomplete",
    score: complete ? input.score : null,
    level: complete ? input.level : "unavailable",
    factors,
    computedAt: input.computedAt,
    methodology: {
      type: "existing five-factor weighted heuristic",
      calibration: "not statistically calibrated or validated as a probability",
      interpretation: "A review signal only. It is not proof of fraud, a confirmed violation, or an official determination.",
      limitations: [
        "If any factor is missing or could not be computed, the composite score and level are withheld.",
        "The underlying factors use different observation windows and record sources.",
        "The current risk calculation does not return source-record identifiers for each factor.",
      ],
    },
  };
}

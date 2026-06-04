import { formatMeters } from "./planningNormalizer";
import type {
  PlanningBlock,
  PlanningListRuleProposal,
  PlanningNumericRuleProposal,
  PlanningRuleProposalStatus,
  PlanningRulesProposal,
} from "./projectInputSchema";

export type PlanningRuleProposalPath =
  | "buildability_m2_m2"
  | "occupancy_percent"
  | "max_height_m"
  | "max_floors"
  | "setbacks.front_m"
  | "setbacks.rear_m"
  | "setbacks.side_m"
  | "uses_allowed"
  | "uses_forbidden";

export interface ApplyPlanningRuleProposalResult {
  planning: PlanningBlock;
  appliedToRules: boolean;
  message: string;
}

function hasText(value: string | null | undefined): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function formatNumericProposalValue(value: number): string {
  return Number.isInteger(value) ? String(value) : String(value).replace(".", ",");
}

function getNumericProposal(
  proposal: PlanningRulesProposal,
  path: Exclude<PlanningRuleProposalPath, "uses_allowed" | "uses_forbidden">,
): PlanningNumericRuleProposal {
  switch (path) {
    case "buildability_m2_m2":
      return proposal.buildability_m2_m2;
    case "occupancy_percent":
      return proposal.occupancy_percent;
    case "max_height_m":
      return proposal.max_height_m;
    case "max_floors":
      return proposal.max_floors;
    case "setbacks.front_m":
      return proposal.setbacks.front_m;
    case "setbacks.rear_m":
      return proposal.setbacks.rear_m;
    case "setbacks.side_m":
      return proposal.setbacks.side_m;
  }
}

function getListProposal(
  proposal: PlanningRulesProposal,
  path: Extract<PlanningRuleProposalPath, "uses_allowed" | "uses_forbidden">,
): PlanningListRuleProposal {
  return path === "uses_allowed" ? proposal.uses_allowed : proposal.uses_forbidden;
}

function updateNumericProposalStatus(
  proposal: PlanningRulesProposal,
  path: Exclude<PlanningRuleProposalPath, "uses_allowed" | "uses_forbidden">,
  status: PlanningRuleProposalStatus,
): PlanningRulesProposal {
  switch (path) {
    case "buildability_m2_m2":
      return { ...proposal, buildability_m2_m2: { ...proposal.buildability_m2_m2, status } };
    case "occupancy_percent":
      return { ...proposal, occupancy_percent: { ...proposal.occupancy_percent, status } };
    case "max_height_m":
      return { ...proposal, max_height_m: { ...proposal.max_height_m, status } };
    case "max_floors":
      return { ...proposal, max_floors: { ...proposal.max_floors, status } };
    case "setbacks.front_m":
      return {
        ...proposal,
        setbacks: {
          ...proposal.setbacks,
          front_m: { ...proposal.setbacks.front_m, status },
        },
      };
    case "setbacks.rear_m":
      return {
        ...proposal,
        setbacks: {
          ...proposal.setbacks,
          rear_m: { ...proposal.setbacks.rear_m, status },
        },
      };
    case "setbacks.side_m":
      return {
        ...proposal,
        setbacks: {
          ...proposal.setbacks,
          side_m: { ...proposal.setbacks.side_m, status },
        },
      };
  }
}

function updateListProposalStatus(
  proposal: PlanningRulesProposal,
  path: Extract<PlanningRuleProposalPath, "uses_allowed" | "uses_forbidden">,
  status: PlanningRuleProposalStatus,
): PlanningRulesProposal {
  if (path === "uses_allowed") {
    return {
      ...proposal,
      uses_allowed: {
        ...proposal.uses_allowed,
        status,
      },
    };
  }

  return {
    ...proposal,
    uses_forbidden: {
      ...proposal.uses_forbidden,
      status,
    },
  };
}

export function setPlanningRuleProposalStatus(
  planning: PlanningBlock,
  path: PlanningRuleProposalPath,
  status: PlanningRuleProposalStatus,
): PlanningBlock {
  const rulesProposal =
    path === "uses_allowed" || path === "uses_forbidden"
      ? updateListProposalStatus(planning.rules_proposal, path, status)
      : updateNumericProposalStatus(planning.rules_proposal, path, status);

  return {
    ...planning,
    rules_proposal: rulesProposal,
    status: "processed_needs_review",
    rules_confirmed_by_user: false,
  };
}

function applySafeNumericEquivalence(
  planning: PlanningBlock,
  path: Exclude<PlanningRuleProposalPath, "uses_allowed" | "uses_forbidden">,
  proposal: PlanningNumericRuleProposal,
): ApplyPlanningRuleProposalResult {
  if (typeof proposal.value !== "number") {
    return {
      planning: setPlanningRuleProposalStatus(planning, path, "accepted"),
      appliedToRules: false,
      message: "La propuesta se ha marcado como aceptada, pero no tiene un valor numerico aplicable.",
    };
  }

  if (path === "occupancy_percent") {
    const proposalText = `${formatNumericProposalValue(proposal.value)} %`;
    const currentValue = planning.rules.occupancy.trim();
    if (hasText(currentValue) && currentValue !== proposalText) {
      return {
        planning: setPlanningRuleProposalStatus(planning, path, "accepted"),
        appliedToRules: false,
        message: `La propuesta se ha aceptado, pero se mantiene la ocupacion manual existente: "${planning.rules.occupancy}".`,
      };
    }

    return {
      planning: {
        ...setPlanningRuleProposalStatus(planning, path, "accepted"),
        rules: {
          ...planning.rules,
          occupancy: proposalText,
        },
      },
      appliedToRules: true,
      message: "La propuesta de ocupacion se ha aplicado a planning.rules.",
    };
  }

  if (path === "max_floors") {
    const proposalText = formatNumericProposalValue(proposal.value);
    const currentValue = planning.rules.max_floors.trim();
    if (hasText(currentValue) && currentValue !== proposalText) {
      return {
        planning: setPlanningRuleProposalStatus(planning, path, "accepted"),
        appliedToRules: false,
        message: `La propuesta se ha aceptado, pero se mantiene el numero maximo de plantas manual: "${planning.rules.max_floors}".`,
      };
    }

    return {
      planning: {
        ...setPlanningRuleProposalStatus(planning, path, "accepted"),
        rules: {
          ...planning.rules,
          max_floors: proposalText,
        },
      },
      appliedToRules: true,
      message: "La propuesta de numero maximo de plantas se ha aplicado a planning.rules.",
    };
  }

  if (path === "setbacks.front_m") {
    const proposalDisplay = formatMeters(proposal.value);
    const currentDisplay = planning.rules.setback_street_m_display.trim();
    const currentValue = planning.rules.setback_street_m;
    if (
      hasText(currentDisplay) &&
      (currentDisplay !== proposalDisplay || currentValue !== proposal.value)
    ) {
      return {
        planning: setPlanningRuleProposalStatus(planning, path, "accepted"),
        appliedToRules: false,
        message: `La propuesta se ha aceptado, pero se mantiene el retranqueo a calle manual: "${planning.rules.setback_street_m_display}".`,
      };
    }

    return {
      planning: {
        ...setPlanningRuleProposalStatus(planning, path, "accepted"),
        rules: {
          ...planning.rules,
          setback_street_m: proposal.value,
          setback_street_m_display: proposalDisplay,
        },
      },
      appliedToRules: true,
      message: "La propuesta de retranqueo frontal se ha aplicado a planning.rules como retranqueo a calle.",
    };
  }

  if (path === "setbacks.side_m") {
    const proposalDisplay = formatMeters(proposal.value);
    const currentDisplay = planning.rules.setback_boundary_m_display.trim();
    const currentValue = planning.rules.setback_boundary_m;
    if (
      hasText(currentDisplay) &&
      (currentDisplay !== proposalDisplay || currentValue !== proposal.value)
    ) {
      return {
        planning: setPlanningRuleProposalStatus(planning, path, "accepted"),
        appliedToRules: false,
        message: `La propuesta se ha aceptado, pero se mantiene el retranqueo a linderos manual: "${planning.rules.setback_boundary_m_display}".`,
      };
    }

    return {
      planning: {
        ...setPlanningRuleProposalStatus(planning, path, "accepted"),
        rules: {
          ...planning.rules,
          setback_boundary_m: proposal.value,
          setback_boundary_m_display: proposalDisplay,
        },
      },
      appliedToRules: true,
      message: "La propuesta de retranqueo lateral se ha aplicado a planning.rules como retranqueo a linderos.",
    };
  }

  return {
    planning: setPlanningRuleProposalStatus(planning, path, "accepted"),
    appliedToRules: false,
    message: "La propuesta se ha aceptado para revision, pero no tiene una equivalencia segura directa en planning.rules.",
  };
}

export function acceptPlanningRuleProposal(
  planning: PlanningBlock,
  path: PlanningRuleProposalPath,
): ApplyPlanningRuleProposalResult {
  if (path === "uses_allowed" || path === "uses_forbidden") {
    const proposal = getListProposal(planning.rules_proposal, path);
    const nextPlanning = setPlanningRuleProposalStatus(planning, path, "accepted");

    return {
      planning: nextPlanning,
      appliedToRules: false,
      message:
        proposal.values.length > 0
          ? "La propuesta se ha aceptado para revision, pero no se copia automaticamente a planning.rules."
          : "La propuesta se ha marcado como aceptada, pero no contiene valores revisables.",
    };
  }

  return applySafeNumericEquivalence(
    planning,
    path,
    getNumericProposal(planning.rules_proposal, path),
  );
}


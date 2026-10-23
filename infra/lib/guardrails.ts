import * as budgets from "aws-cdk-lib/aws-budgets";
import { Construct } from "constructs";

interface GuardrailsProps {
  monthlyBudgetUsd: number;
  alertEmails: string[];
}

/**
 * A cost budget for Trade Wars alone: it counts only resources tagged project=trade-wars, so the rest
 * of the account doesn't set it off. Emails at 50/80/100% of actual and 100% of forecast spend. It
 * alerts rather than stopping anything. The `project` tag has to be an active cost allocation tag for
 * the filter to match (see README).
 */
export class Guardrails extends Construct {
  constructor(scope: Construct, id: string, props: GuardrailsProps) {
    super(scope, id);

    const subscribers = props.alertEmails.map((address) => ({ subscriptionType: "EMAIL", address }));
    const at = (threshold: number, notificationType: "ACTUAL" | "FORECASTED") => ({
      notification: { notificationType, comparisonOperator: "GREATER_THAN", threshold, thresholdType: "PERCENTAGE" },
      subscribers,
    });

    new budgets.CfnBudget(this, "MonthlyBudget", {
      budget: {
        budgetName: "trade-wars-monthly",
        budgetType: "COST",
        timeUnit: "MONTHLY",
        budgetLimit: { amount: props.monthlyBudgetUsd, unit: "USD" },
        costFilters: { TagKeyValue: ["user:project$trade-wars"] },
      },
      notificationsWithSubscribers: [at(50, "ACTUAL"), at(80, "ACTUAL"), at(100, "ACTUAL"), at(100, "FORECASTED")],
    });
  }
}

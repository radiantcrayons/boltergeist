import { CfnOutput, Stack, Tags, type StackProps } from "aws-cdk-lib";
import { Construct } from "constructs";
import { Alarms } from "./alarms.ts";
import { Guardrails } from "./guardrails.ts";
import { Tables } from "./tables.ts";
import { Vercel } from "./vercel.ts";

/** Everything Trade Wars needs on AWS. */
export class TradeWarsStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);
    Tags.of(this).add("project", "trade-wars");

    const alertEmails = (process.env.ALERT_EMAIL ?? "")
      .split(",")
      .map((e) => e.trim())
      .filter(Boolean);
    if (!alertEmails.length) throw new Error("Set ALERT_EMAIL in infra/.env (see .env.example)");
    const team = process.env.VERCEL_TEAM;
    if (!team) throw new Error("Set VERCEL_TEAM in infra/.env (see .env.example)");

    const tables = new Tables(this, "Tables");
    const project = process.env.VERCEL_PROJECT || "trade-wars";
    const vercel = new Vercel(this, "Vercel", {
      team,
      project,
      apps: (process.env.VERCEL_APPS || project)
        .split(",")
        .map((a) => a.trim())
        .filter(Boolean),
      existingProvider: process.env.VERCEL_OIDC_PROVIDER === "existing",
      arenas: tables.arenas,
      arenasDev: tables.arenasDev,
    });
    new Guardrails(this, "Guardrails", { monthlyBudgetUsd: Number(process.env.BUDGET_USD || 10), alertEmails });
    const alarms = new Alarms(this, "Alarms", { arenas: tables.arenas, alertEmails });

    new CfnOutput(this, "ArenasTable", { value: tables.arenas.tableName });
    new CfnOutput(this, "ArenasDevTable", { value: tables.arenasDev.tableName });
    new CfnOutput(this, "VercelProductionRoleArn", { value: vercel.productionRole.roleArn });
    new CfnOutput(this, "VercelPreviewRoleArn", { value: vercel.previewRole.roleArn });
    new CfnOutput(this, "AlertsTopic", { value: alarms.topic.topicName });
  }
}

#!/usr/bin/env node
import "dotenv/config";
import * as cdk from "aws-cdk-lib";
import { TradeWarsStack } from "../lib/index.ts";

const app = new cdk.App();
new TradeWarsStack(app, "TradeWarsStack", {
  env: { account: process.env.CDK_DEFAULT_ACCOUNT, region: "us-east-1" },
  description: "Trade Wars: arena tables, Vercel OIDC roles, cost budget, alarms",
});

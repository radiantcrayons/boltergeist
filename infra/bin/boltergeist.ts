#!/usr/bin/env node
import "dotenv/config";
import * as cdk from "aws-cdk-lib";
import { BoltergeistStack } from "../lib/index.ts";

const app = new cdk.App();
new BoltergeistStack(app, "BoltergeistStack", {
  env: { account: process.env.CDK_DEFAULT_ACCOUNT, region: "us-east-1" },
  description: "Boltergeist: game tables, Vercel OIDC roles, cost budget, alarms",
});

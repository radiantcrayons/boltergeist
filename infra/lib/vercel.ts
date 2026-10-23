import { Stack } from "aws-cdk-lib";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as iam from "aws-cdk-lib/aws-iam";
import { Construct } from "constructs";
import { ARENAS_READ_WRITE } from "./tables.ts";

interface VercelProps {
  team: string;
  project: string;
  /** True when the account already has the team's OIDC provider: there can only be one. */
  existingProvider: boolean;
  arenas: dynamodb.ITableV2;
  arenasDev: dynamodb.ITableV2;
}

/**
 * Keyless access from Vercel. Functions present the team's OIDC token and assume a role scoped by
 * environment: production gets the production table, previews and `vercel dev` the dev one.
 */
export class Vercel extends Construct {
  readonly productionRole: iam.Role;
  readonly previewRole: iam.Role;

  constructor(scope: Construct, id: string, props: VercelProps) {
    super(scope, id);
    const issuer = `oidc.vercel.com/${props.team}`;
    const audience = `https://vercel.com/${props.team}`;

    const providerArn = props.existingProvider
      ? `arn:aws:iam::${Stack.of(this).account}:oidc-provider/${issuer}`
      : new iam.OidcProviderNative(this, "Provider", { url: `https://${issuer}`, clientIds: [audience] }).openIdConnectProviderArn;

    const roleFor = (roleId: string, roleName: string, environments: string[], table: dynamodb.ITableV2) => {
      const role = new iam.Role(this, roleId, {
        roleName,
        description: `Vercel ${props.project} (${environments.join(", ")}) via OIDC`,
        assumedBy: new iam.WebIdentityPrincipal(providerArn, {
          StringEquals: {
            [`${issuer}:aud`]: audience,
            [`${issuer}:sub`]: environments.map((env) => `owner:${props.team}:project:${props.project}:environment:${env}`),
          },
        }),
      });
      role.addToPolicy(new iam.PolicyStatement({ actions: ARENAS_READ_WRITE, resources: [table.tableArn] }));
      return role;
    };

    this.productionRole = roleFor("ProductionRole", `${props.project}-vercel-production`, ["production"], props.arenas);
    this.previewRole = roleFor("PreviewRole", `${props.project}-vercel-preview`, ["preview", "development"], props.arenasDev);
  }
}

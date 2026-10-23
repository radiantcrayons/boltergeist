import { RemovalPolicy } from "aws-cdk-lib";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import { Construct } from "constructs";

/**
 * The games: each haunt's players and moves under one partition key, gone a day after the haunt
 * ends (expiresAt). Paid per request, with a ceiling on each table: past it requests are throttled
 * rather than charged, and boltergeist-arenas-throttled emails.
 *
 *   boltergeist-arenas      production
 *   boltergeist-arenas-dev  local dev and Vercel previews
 *
 * Nothing in them outlives its fight, so there's no point-in-time recovery or export.
 */
export class Tables extends Construct {
  readonly arenas: dynamodb.TableV2;
  readonly arenasDev: dynamodb.TableV2;

  constructor(scope: Construct, id: string) {
    super(scope, id);

    const keys = {
      partitionKey: { name: "pk", type: dynamodb.AttributeType.STRING },
      sortKey: { name: "sk", type: dynamodb.AttributeType.STRING },
      timeToLiveAttribute: "expiresAt",
    };

    this.arenas = new dynamodb.TableV2(this, "Arenas", {
      ...keys,
      tableName: "boltergeist-arenas",
      billing: dynamodb.Billing.onDemand({ maxReadRequestUnits: 400, maxWriteRequestUnits: 100 }),
      deletionProtection: true,
      removalPolicy: RemovalPolicy.RETAIN,
    });

    this.arenasDev = new dynamodb.TableV2(this, "ArenasDev", {
      ...keys,
      tableName: "boltergeist-arenas-dev",
      billing: dynamodb.Billing.onDemand({ maxReadRequestUnits: 50, maxWriteRequestUnits: 25 }),
      removalPolicy: RemovalPolicy.DESTROY,
    });
  }
}

/** Everything the app does to an arenas table, transactions' per item checks included. */
export const ARENAS_READ_WRITE = ["dynamodb:GetItem", "dynamodb:PutItem", "dynamodb:UpdateItem", "dynamodb:Query", "dynamodb:ConditionCheckItem"];

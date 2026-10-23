import { Duration } from "aws-cdk-lib";
import * as cw from "aws-cdk-lib/aws-cloudwatch";
import * as cwActions from "aws-cdk-lib/aws-cloudwatch-actions";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as sns from "aws-cdk-lib/aws-sns";
import * as subs from "aws-cdk-lib/aws-sns-subscriptions";
import { Construct } from "constructs";

interface AlarmsProps {
  arenas: dynamodb.TableV2;
  alertEmails: string[];
}

/**
 * Emails when the arenas table turns requests away at its ceiling (lib/tables.ts), and again when it
 * stops. Players then fight on, but stop seeing each other's moves. Each address gets a one-time
 * "Confirm subscription" email from AWS on the first deploy.
 */
export class Alarms extends Construct {
  readonly topic: sns.Topic;

  constructor(scope: Construct, id: string, props: AlarmsProps) {
    super(scope, id);

    this.topic = new sns.Topic(this, "Topic", { topicName: "trade-wars-alerts", displayName: "Trade Wars alerts" });
    for (const email of props.alertEmails) this.topic.addSubscription(new subs.EmailSubscription(email));

    const throttleEvents = (metricName: string) =>
      new cw.Metric({
        namespace: "AWS/DynamoDB",
        metricName,
        dimensionsMap: { TableName: props.arenas.tableName },
        statistic: cw.Stats.SUM,
        period: Duration.minutes(5),
      });
    const throttled = new cw.Alarm(this, "ArenasThrottled", {
      alarmName: "trade-wars-arenas-throttled",
      alarmDescription:
        "trade-wars-arenas turned requests away at its ceiling (infra/lib/tables.ts). If it's real play, raise the ceiling and " +
        "deploy; if it's a flood, the firewall's rate limit (deploy/vercel-firewall.json).",
      metric: new cw.MathExpression({
        expression: "reads + writes",
        usingMetrics: { reads: throttleEvents("ReadThrottleEvents"), writes: throttleEvents("WriteThrottleEvents") },
        period: Duration.minutes(5),
      }),
      comparisonOperator: cw.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      threshold: 5,
      evaluationPeriods: 2,
      treatMissingData: cw.TreatMissingData.NOT_BREACHING,
    });
    throttled.addAlarmAction(new cwActions.SnsAction(this.topic));
    throttled.addOkAction(new cwActions.SnsAction(this.topic));
  }
}

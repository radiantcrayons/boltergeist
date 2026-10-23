import assert from "node:assert/strict";
import { test } from "node:test";
import { ATTEMPTS, backoff, busy, patient } from "./dynamo.ts";

const cancelled = (...codes: string[]) => Object.assign(new Error("cancelled"), { name: "TransactionCanceledException", CancellationReasons: codes.map((Code) => ({ Code })) });

test("a transaction turned away only for being busy is worth sending again", () => {
  assert.equal(busy(cancelled("ThrottlingError", "None")), true);
  assert.equal(busy(cancelled("ProvisionedThroughputExceeded", "TransactionConflict")), true);
  assert.equal(busy(cancelled("ConditionalCheckFailed", "ThrottlingError")), false);
  assert.equal(busy(cancelled("ConditionalCheckFailed", "None")), false);
  assert.equal(busy(cancelled("TransactionConflict")), false);
  assert.equal(busy(cancelled("ValidationError", "ThrottlingError")), false);
  assert.equal(busy(new Error("nope")), false);
  assert.equal(busy(null), false);
});

test("the table is asked again a few times, waiting longer when it's throttling, and never for a mistake", async () => {
  const s = patient();
  let t = await s.acquireInitialRetryToken("dynamodb");
  for (let i = 1; i < ATTEMPTS; i++) {
    t = await s.refreshRetryTokenForRetry(t, { errorType: "THROTTLING" });
    assert.equal(t.getRetryCount(), i);
    assert.ok(t.getRetryDelay() >= 0 && t.getRetryDelay() <= 5000);
  }
  await assert.rejects(s.refreshRetryTokenForRetry(t, { errorType: "THROTTLING" }));
  await assert.rejects(s.refreshRetryTokenForRetry(await s.acquireInitialRetryToken("dynamodb"), { errorType: "CLIENT_ERROR" }));
  for (let i = 0; i < 200; i++) {
    assert.ok(backoff(3, false) <= 320);
    assert.ok(backoff(10, true) <= 5000);
  }
});

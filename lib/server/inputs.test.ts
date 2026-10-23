import assert from "node:assert/strict";
import { test } from "node:test";
import { bodyOf, GAME, MOST, problem } from "./inputs.ts";

const post = (body: string, headers: Record<string, string> = {}) => new Request("http://x/api/arenas/a", { method: "POST", body, headers });
const status = async (p: Promise<unknown>) => {
  try {
    await p;
    return 200;
  } catch (err) {
    return (err as { status?: number }).status ?? 500;
  }
};

test("what anyone can send: too big, not JSON or not an object is the sender's mistake", async () => {
  assert.equal(await status(bodyOf(post("x".repeat(MOST + 1)))), 413);
  assert.equal(await status(bodyOf(post("{}", { "content-length": String(MOST * 10) }))), 413);
  assert.equal(await status(bodyOf(post("{not json"))), 400);
  assert.equal(await status(bodyOf(post("[1,2,3]"))), 400);
  assert.equal(await status(bodyOf(post("null"))), 400);
  assert.equal(await status(bodyOf(post('"text"'))), 400);
  assert.deepEqual(await bodyOf(post("")), {});
  const deep = "[".repeat(1000) + "]".repeat(1000);
  assert.equal(await status(bodyOf(post(`{"what":${deep}}`))), 200);
});

test("a game id is checked for its shape before anything is asked of the table or Strike", () => {
  for (const ok of ["skirmish-hsf0g", "battle-hsf00", "war-hsf00", "skirmish-hsf0g-2", "skirmish-hsf0g-19"]) assert.ok(GAME.test(ok), ok);
  for (const bad of ["", "x", "skirmish", "skirmish-", "skirmish-HSF0G", "skirmish-hsf0g-0", "skirmish-hsf0g-100", "a".repeat(5000), "skirmish-hsf0g/../x", "skirmish-hsf0g-2-3", "__proto__-x"]) assert.ok(!GAME.test(bad), bad);
});

test("settings that are set but wrong are named", () => {
  assert.equal(problem({}), null);
  assert.equal(problem({ ARENAS_TABLE: "boltergeist-arenas", AWS_ROLE_ARN: "arn:aws:iam::123456789012:role/boltergeist-vercel-production" }), null);
  assert.match(problem({ ARENAS_TABLE: "bad table!" }) ?? "", /ARENAS_TABLE/);
  assert.match(problem({ ARENAS_TABLE: "ok-table", AWS_ROLE_ARN: "not an arn" }) ?? "", /AWS_ROLE_ARN/);
});

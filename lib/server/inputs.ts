import { Refused } from "./moves.ts";

// What anyone can send the game server: a game's id, and a small JSON object. Anything else is turned away as the
// sender's mistake before it reaches the table.
export const GAME = /^[a-z]{3,10}-[0-9a-z]{1,10}(-[1-9][0-9]?)?$/;
export const MOST = 4096;

export async function bodyOf(req: Request, most = MOST): Promise<Record<string, unknown>> {
  if (Number(req.headers.get("content-length") ?? 0) > most) throw new Refused("That's too much to send", 413);
  const text = await req.text();
  if (text.length > most) throw new Refused("That's too much to send", 413);
  let got: unknown;
  try {
    got = text ? JSON.parse(text) : {};
  } catch {
    throw new Refused("That isn't JSON");
  }
  if (!got || typeof got !== "object" || Array.isArray(got)) throw new Refused("That isn't a move");
  return got as Record<string, unknown>;
}

// The table and the AWS role, checked for their shape once: one set wrong says so loudly instead of the game going quiet.
const TABLE = /^[A-Za-z0-9_.-]{3,255}$/;
const ROLE = /^arn:aws:iam::\d{12}:role\/[\w+=,.@/-]{1,128}$/;
export function problem(env: Record<string, string | undefined> = process.env): string | null {
  if (env.ARENAS_TABLE !== undefined && !TABLE.test(env.ARENAS_TABLE)) return "ARENAS_TABLE isn't a table name";
  if (env.AWS_ROLE_ARN !== undefined && env.AWS_ROLE_ARN !== "" && !ROLE.test(env.AWS_ROLE_ARN)) return "AWS_ROLE_ARN isn't a role's ARN";
  return null;
}

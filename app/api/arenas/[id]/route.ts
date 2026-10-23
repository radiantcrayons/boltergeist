import type { NextRequest } from "next/server";
import { act, arena, join, log, online, Refused } from "@/lib/server/arenas";
import { netFrom } from "@/lib/strike";

const OFFLINE = () => Response.json({ error: "The game is offline" }, { status: 503 });
const net = (req: NextRequest) => {
  const n = netFrom(req.nextUrl.searchParams.get("net"));
  if (!n) throw new Refused("Mainnet or testnet?");
  return n;
};
const failed = (err: unknown) => {
  if (err instanceof Refused) return Response.json({ error: err.message }, { status: err.status });
  console.error("game", err);
  return Response.json({ error: "Something went wrong" }, { status: 500 });
};

export async function GET(req: NextRequest, ctx: RouteContext<"/api/arenas/[id]">) {
  if (!online()) return OFFLINE();
  try {
    const a = await arena((await ctx.params).id, net(req));
    const after = req.nextUrl.searchParams.get("after") ?? undefined;
    return Response.json({ ...(await log(a, { after })), now: Date.now() }, { headers: { "Cache-Control": "public, max-age=0, s-maxage=1, stale-while-revalidate=1" } });
  } catch (err) {
    return failed(err);
  }
}

export async function POST(req: NextRequest, ctx: RouteContext<"/api/arenas/[id]">) {
  if (!online()) return OFFLINE();
  try {
    const a = await arena((await ctx.params).id, net(req));
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    if (body.what === "join") {
      const { player, arena: seat } = await join(a, body);
      return Response.json({ player, arena: seat.id, log: await log(seat, { fresh: true }), now: Date.now() });
    }
    return Response.json({ move: await act(a, body), now: Date.now() });
  } catch (err) {
    return failed(err);
  }
}

import type { NextRequest } from "next/server";
import { lobby, misconfigured, online } from "@/lib/server/arenas";
import { netFrom } from "@/lib/strike";

export async function GET(req: NextRequest) {
  if (!online() || misconfigured()) return Response.json({ error: misconfigured() ?? "The game is offline" }, { status: 503 });
  const ids = (req.nextUrl.searchParams.get("ids") ?? "").split(",").filter(Boolean).slice(0, 6);
  const net = netFrom(req.nextUrl.searchParams.get("net"));
  if (!net) return Response.json({ error: "Mainnet or testnet?" }, { status: 400 });
  try {
    return Response.json(await lobby(ids, net), { headers: { "Cache-Control": "public, max-age=0, s-maxage=2, stale-while-revalidate=2" } });
  } catch (err) {
    console.error("lobby", err);
    return Response.json({}, { status: 502 });
  }
}

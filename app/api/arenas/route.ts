import type { NextRequest } from "next/server";
import { lobby, online } from "@/lib/server/arenas";

export async function GET(req: NextRequest) {
  if (!online()) return Response.json({ error: "The game is offline" }, { status: 503 });
  const ids = (req.nextUrl.searchParams.get("ids") ?? "").split(",").filter(Boolean).slice(0, 6);
  try {
    return Response.json(await lobby(ids), { headers: { "Cache-Control": "public, max-age=0, s-maxage=2, stale-while-revalidate=2" } });
  } catch (err) {
    console.error("lobby", err);
    return Response.json({}, { status: 502 });
  }
}

import type { NextRequest } from "next/server";
import { REST } from "@/lib/strike";

const SYMBOL = /^[A-Z0-9]{2,12}-USD$/i;

// Strike's order by order snapshot carries no CORS headers, so browsers get it through here.
export async function GET(req: NextRequest) {
  const symbol = req.nextUrl.searchParams.get("symbol") ?? "";
  if (!SYMBOL.test(symbol)) return Response.json({ error: "That isn't a market" }, { status: 400 });
  try {
    const res = await fetch(`${REST}/v2/l3/snapshot?symbol=${symbol.toUpperCase()}`, { cache: "no-store", signal: AbortSignal.timeout(10_000) });
    return new Response(await res.text(), {
      status: res.status,
      headers: { "Content-Type": res.headers.get("content-type") ?? "application/json", "Cache-Control": "no-store" },
    });
  } catch (err) {
    console.error("l3", err);
    return Response.json({ error: "Can't reach Strike" }, { status: 502 });
  }
}

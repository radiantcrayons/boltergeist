export type Candle = { t: number; o: number; h: number; l: number; c: number };

import type { Tier } from "./game/war.ts";

export type Market = { symbol: string; base: string; tickSize: number; stepSize: number; minNotional: number; tiers: Tier[] };

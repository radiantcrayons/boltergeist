import type { Kind, Move, Side } from "../game/war.ts";

export class Refused extends Error {
  readonly status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

// What the game knows a player has on: their call or graves, each with its thundercloud, as the game took them.
export type Held = { side: Side; power: number; price: number; at: number; flag?: number; flagAt?: number };
export type State = { n: number; lastAt: number; call?: Held; trap?: Held; out?: boolean };

// How far graves or a thundercloud can sit from the price, and how close the price has to come for one to count as reached:
// a few seconds of the mark, and less than the taker fee a quick way out would cost.
export const REACH = 0.2;
export const TOL = 0.0005;
// The most moves one player can make in a game.
export const CAP: Record<Kind, number> = { skirmish: 300, battle: 1000, war: 4000 };

export type Prices = {
  mark: () => Promise<number>;
  // Whether the mark has gone down to (or up to) a price since a time.
  reached: (way: "down" | "up", price: number, since: number) => Promise<boolean>;
};

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v > 0 ? v : undefined);
const down = (side: Side) => (side === "long" ? "down" : "up");
const up = (side: Side) => (side === "long" ? "up" : "down");
// Past a price on a side's way: below it for long graves, above it for a long thundercloud.
const below = (side: Side, a: number, b: number) => (side === "long" ? a < b * (1 + TOL) : a > b * (1 - TOL));

const sided = (body: Record<string, unknown>) => {
  const side = body.side as Side;
  const power = num(body.power);
  if (side !== "long" && side !== "short") throw new Refused("Long or short?");
  if (!power || !Number.isInteger(power) || power > 100) throw new Refused("How much power?");
  return { side, power };
};

const within = (price: number | undefined, mark: number) => {
  if (!price) throw new Refused("At what price?");
  if (Math.abs(price / mark - 1) > REACH) throw new Refused("That's too far from Strike's price");
  return price;
};

const without = <T extends { flag?: number; flagAt?: number }>(x: T): T => {
  const next = { ...x };
  delete next.flag;
  delete next.flagAt;
  return next;
};

// A move as a player asks for it, checked against what they have on and Strike's price, and what it leaves them with.
// Calls and give-ups go at Strike's price, fills at the trap's own price, and nothing a player says about Strike is taken.
export async function rule(kind: Kind, was: State, body: Record<string, unknown>, now: number, prices: Prices): Promise<{ move: Omit<Move, "at" | "who">; state: State }> {
  if (was.n >= CAP[kind]) throw new Refused("That's all the moves one game takes", 429);
  if (was.out) throw new Refused("You're out of this game", 409);
  const state: State = { ...was, n: was.n + 1, lastAt: now };
  const live = body.live === true;
  switch (body.what) {
    case "call": {
      if (was.call) throw new Refused("You're in already", 409);
      const { side, power } = sided(body);
      const entry = await prices.mark();
      delete state.trap;
      return { move: { what: "call", side, power, entry, ...(live && { live }) }, state: { ...state, call: { side, power, price: entry, at: now } } };
    }
    case "trap": {
      if (was.call) throw new Refused("You're in already", 409);
      const { side, power } = sided(body);
      const mark = await prices.mark();
      const price = within(num(body.price), mark);
      if (!below(side, price, mark)) throw new Refused(side === "long" ? "Long graves go below the price" : "Short graves go above the price");
      const flag = num(body.flag);
      if (flag && (!below(side, price, within(flag, mark)) || flag === price)) throw new Refused("A thundercloud goes past the graves");
      return { move: { what: "trap", side, power, price, ...(flag && { flag }) }, state: { ...state, trap: { side, power, price, at: now, ...(flag && { flag, flagAt: now }) } } };
    }
    case "pull": {
      if (!was.trap) throw new Refused("No graves to fill in", 409);
      delete state.trap;
      return { move: { what: "pull" }, state };
    }
    case "flag": {
      const held = was.call ?? was.trap;
      if (!held) throw new Refused("Nothing to summon a thundercloud over", 409);
      const price = num(body.price);
      let next = without(held);
      if (price) {
        const mark = await prices.mark();
        within(price, mark);
        const past = was.call ? below(held.side, mark, price) : below(held.side, held.price, price) && price !== held.price;
        if (!past) throw new Refused("A thundercloud goes past the price");
        next = { ...next, flag: price, flagAt: now };
      }
      return { move: { what: "flag", ...(price && { price }) }, state: { ...state, ...(was.call ? { call: next } : { trap: next }) } };
    }
    case "fill": {
      if (was.call) throw new Refused("You're in already", 409);
      const trap = was.trap;
      if (!trap) throw new Refused("No graves to spring", 409);
      if (!(await prices.reached(down(trap.side), trap.price, trap.at))) throw new Refused("The price hasn't reached your graves", 409);
      delete state.trap;
      return { move: { what: "fill", price: trap.price }, state: { ...state, call: { ...trap, at: now } } };
    }
    case "bank": {
      const c = was.call;
      if (!c) throw new Refused("Nothing to give up", 409);
      const said = num(body.flag);
      const atFlag = !!c.flag && said === c.flag && (await prices.reached(up(c.side), c.flag, c.flagAt ?? c.at));
      const price = atFlag ? c.flag! : await prices.mark();
      delete state.call;
      return { move: { what: "bank", price, ...(atFlag && { flag: price }) }, state };
    }
    case "ko": {
      if (!was.call) throw new Refused("Nothing to knock out", 409);
      delete state.call;
      return { move: { what: "ko", price: num(body.price) }, state: { ...state, out: true } };
    }
    default:
      throw new Refused("Call, graves, thundercloud, give up or K.O.?");
  }
}

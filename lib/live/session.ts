import { NETWORK } from "../strike.ts";
import { forget, keysFrom, newKeys, post, signed, StrikeError, type Keys } from "./keys.ts";
import { connect, type Chain, type Wallet } from "./wallets.ts";

export const BUILDER = {
  code: process.env.NEXT_PUBLIC_BUILDER_CODE ?? "",
  feeBps: Math.max(0, Math.min(100, Math.floor(Number(process.env.NEXT_PUBLIC_BUILDER_FEE_BPS ?? 0) || 0))),
};

export type Session = {
  network: typeof NETWORK;
  keys: Keys;
  accountId: string;
  via: "wallet" | "key";
  chain?: Chain;
  address?: string;
  wallet?: string;
  expiresAt?: number;
};

export type Balance = { wallet: number; available: number };

const KEY = `tradewars.session.${NETWORK}`;
// A pasted API key never expires on Strike, so this browser forgets it after a while.
const KEY_TTL = 12 * 60 * 60 * 1000;

const read = () => JSON.parse(localStorage.getItem(KEY) ?? "null") as (Session & { keys?: Partial<Keys> & { secret?: string } }) | null;

// Only the public half of the key and where it's kept are saved here. A session saved the old way, with its key as text, is wiped.
export function loadSession(): Session | null {
  try {
    const kept = read();
    if (!kept) return null;
    const stale =
      !kept.keys?.id ||
      "secret" in kept.keys ||
      kept.network !== NETWORK ||
      (kept.via === "key" && !kept.expiresAt) ||
      (!!kept.expiresAt && kept.expiresAt < Date.now());
    if (!stale) return kept;
    localStorage.removeItem(KEY);
    void forget(kept.keys);
    return null;
  } catch {
    return null;
  }
}

// Saving another session, or none, also throws away the key the last one used.
export function saveSession(session: Session | null) {
  try {
    const before = read();
    if (before?.keys?.id && before.keys.id !== session?.keys.id) void forget(before.keys);
    if (session) localStorage.setItem(KEY, JSON.stringify({ ...session, keys: { public: session.keys.public, id: session.keys.id } }));
    else localStorage.removeItem(KEY);
  } catch {}
}

export async function viaWallet(wallet: Wallet): Promise<Session> {
  if (!BUILDER.code) throw new Error("Wallet sign-in isn't set up here yet: use an API key");
  const connected = await connect(wallet);
  const keys = await newKeys();
  try {
    return await linked(wallet, connected, keys);
  } catch (err) {
    void forget(keys);
    // The account that owns a builder code can't sign in through it, so the game's own wallet has to come in with an API key.
    if (err instanceof Error && /own builder code/i.test(err.message))
      throw new Error("This wallet's Strike account runs this game, so it can't sign in through it. Use another wallet, or an API key from Strike's API wallets page");
    throw err;
  }
}

async function linked(wallet: Wallet, connected: Awaited<ReturnType<typeof connect>>, keys: Keys): Promise<Session> {
  const challenge = await post<{ nonce: string; message_to_sign: string }>("/auth/builder/request-signature", {
    address: connected.address,
    chain: wallet.chain,
    code: BUILDER.code,
    fee_share_bps: BUILDER.feeBps,
    public_key: keys.public,
  });
  const signature = await connected.sign(challenge.message_to_sign);
  const done = await post<{ account_id: string; api_wallet_public_key: string; api_wallet_expired_at?: string }>("/auth/builder/verify-signature", {
    nonce: challenge.nonce,
    wallet_signature: signature,
  });
  if (done.api_wallet_public_key && done.api_wallet_public_key.toLowerCase() !== keys.public) throw new Error("Strike registered a different key: try again");
  const expires = done.api_wallet_expired_at ? Date.parse(done.api_wallet_expired_at) : NaN;
  return {
    network: NETWORK,
    keys,
    accountId: done.account_id,
    via: "wallet",
    chain: wallet.chain,
    address: connected.address,
    wallet: wallet.name,
    ...(Number.isFinite(expires) && { expiresAt: expires }),
  };
}

export async function viaKey(secretHex: string): Promise<Session> {
  const keys = await keysFrom(secretHex);
  const account = await signed<{ account_id: string; blockchain_address?: string | null; blockchain?: string }>(keys, "GET", "/v2/account").catch((err) => {
    void forget(keys);
    throw err instanceof StrikeError && err.status === 401 ? new Error(`Strike doesn't know that key on ${NETWORK}: register its public key on Strike's API wallets page`) : err;
  });
  return {
    network: NETWORK,
    keys,
    accountId: account.account_id,
    via: "key",
    address: account.blockchain_address ?? undefined,
    expiresAt: Date.now() + KEY_TTL,
  };
}

export async function balance(keys: Keys): Promise<Balance> {
  const a = await signed<{ wallet_balance: string; available_balance: string }>(keys, "GET", "/v2/account");
  return { wallet: Number(a.wallet_balance) || 0, available: Number(a.available_balance) || 0 };
}

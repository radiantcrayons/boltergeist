import { NETWORK } from "../strike";
import { keysFrom, newKeys, post, signed, StrikeError, type Keys } from "./keys";
import { connect, type Chain, type Wallet } from "./wallets";

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

export function loadSession(): Session | null {
  try {
    const kept = JSON.parse(localStorage.getItem(KEY) ?? "null") as Session | null;
    if (!kept?.keys?.secret || kept.network !== NETWORK) return null;
    if (kept.expiresAt && kept.expiresAt < Date.now()) return null;
    return kept;
  } catch {
    return null;
  }
}

export function saveSession(session: Session | null) {
  try {
    if (session) localStorage.setItem(KEY, JSON.stringify(session));
    else localStorage.removeItem(KEY);
  } catch {}
}

export async function viaWallet(wallet: Wallet): Promise<Session> {
  if (!BUILDER.code) throw new Error("Wallet sign-in isn't set up here yet: use an API key");
  const connected = await connect(wallet);
  const keys = await newKeys();
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
    throw err instanceof StrikeError && err.status === 401 ? new Error(`Strike doesn't know that key on ${NETWORK}: register its public key on Strike's API wallets page`) : err;
  });
  return { network: NETWORK, keys, accountId: account.account_id, via: "key", address: account.blockchain_address ?? undefined };
}

export async function balance(keys: Keys): Promise<Balance> {
  const a = await signed<{ wallet_balance: string; available_balance: string }>(keys, "GET", "/v2/account");
  return { wallet: Number(a.wallet_balance) || 0, available: Number(a.available_balance) || 0 };
}

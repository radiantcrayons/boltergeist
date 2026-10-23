import { NETWORK } from "../strike";
import { hex, unhex } from "./keys";

export type Chain = "ethereum" | "solana" | "cardano";

export type Wallet = { id: string; name: string; chain: Chain; icon?: string };

export type Connected = { wallet: Wallet; address: string; sign: (message: string) => Promise<string> };

/* eslint-disable @typescript-eslint/no-explicit-any */
const w = () => (typeof window === "undefined" ? {} : window) as any;

const CARDANO = ["eternl", "lace", "nami", "gerowallet", "vespr", "yoroi", "tokeo", "nufi", "begin", "typhoncip30"];

export function detect(): Wallet[] {
  const found: Wallet[] = [];
  const eth = w().ethereum;
  if (eth) {
    const providers: any[] = eth.providers ?? [eth];
    for (const p of providers) {
      if (p.isRabby) found.push({ id: "rabby", name: "Rabby", chain: "ethereum" });
      else if (p.isCoinbaseWallet) found.push({ id: "coinbase", name: "Coinbase", chain: "ethereum" });
      else if (p.isMetaMask && !p.isBraveWallet && !p.isPhantom) found.push({ id: "metamask", name: "MetaMask", chain: "ethereum" });
    }
    if (!found.length) found.push({ id: "injected", name: "Browser wallet", chain: "ethereum" });
  }
  if (w().phantom?.solana) found.push({ id: "phantom", name: "Phantom", chain: "solana" });
  if (w().solflare) found.push({ id: "solflare", name: "Solflare", chain: "solana" });
  for (const id of CARDANO) {
    const ns = w().cardano?.[id];
    if (ns?.enable) found.push({ id, name: ns.name ? cap(ns.name) : cap(id), chain: "cardano", icon: ns.icon });
  }
  return found.filter((x, i) => found.findIndex((y) => y.id === x.id) === i);
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export async function connect(wallet: Wallet): Promise<Connected> {
  if (wallet.chain === "ethereum") return connectEvm(wallet);
  if (wallet.chain === "solana") return connectSolana(wallet);
  return connectCardano(wallet);
}

async function connectEvm(wallet: Wallet): Promise<Connected> {
  const eth = w().ethereum;
  const providers: any[] = eth?.providers ?? [eth];
  const provider =
    (wallet.id === "rabby" && providers.find((p) => p.isRabby)) ||
    (wallet.id === "coinbase" && providers.find((p) => p.isCoinbaseWallet)) ||
    (wallet.id === "metamask" && providers.find((p) => p.isMetaMask && !p.isRabby && !p.isCoinbaseWallet)) ||
    eth;
  if (!provider) throw new Error("No Ethereum wallet found");
  const [address] = (await provider.request({ method: "eth_requestAccounts" })) as string[];
  if (!address) throw new Error("The wallet didn't share an address");
  return { wallet, address, sign: (message) => provider.request({ method: "personal_sign", params: [message, address] }) };
}

async function connectSolana(wallet: Wallet): Promise<Connected> {
  const provider = wallet.id === "solflare" ? w().solflare : (w().phantom?.solana ?? w().solana);
  if (!provider) throw new Error("No Solana wallet found");
  const reply = await provider.connect();
  const key = reply?.publicKey ?? provider.publicKey;
  if (!key) throw new Error("The wallet didn't share an address");
  return {
    wallet,
    address: key.toString(),
    sign: async (message) => {
      const out = await provider.signMessage(new TextEncoder().encode(message), "utf8");
      const sig: Uint8Array = out instanceof Uint8Array ? out : out?.signature instanceof Uint8Array ? out.signature : new Uint8Array(Object.values(out?.signature ?? out));
      return base58(sig);
    },
  };
}

async function connectCardano(wallet: Wallet): Promise<Connected> {
  const ns = w().cardano?.[wallet.id];
  if (!ns?.enable) throw new Error(`${wallet.name} isn't installed`);
  const api = await ns.enable();
  const network = await api.getNetworkId();
  if ((NETWORK === "testnet") !== (network === 0)) throw new Error(`Switch ${wallet.name} to ${NETWORK === "testnet" ? "the Preprod testnet" : "mainnet"}`);
  const raw: string = await api.getChangeAddress();
  const address = bech32(network === 1 ? "addr" : "addr_test", unhex(raw));
  return {
    wallet,
    address,
    sign: async (message) => {
      const { signature, key } = await api.signData(raw, hex(new TextEncoder().encode(message)));
      return `${signature}:${key}`;
    },
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

const B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

function base58(bytes: Uint8Array): string {
  let n = BigInt(`0x${hex(bytes) || "0"}`);
  let out = "";
  while (n > 0n) {
    out = B58[Number(n % 58n)] + out;
    n /= 58n;
  }
  for (const b of bytes) {
    if (b !== 0) break;
    out = `1${out}`;
  }
  return out;
}

const B32 = "qpzry9x8gf2tvdw0s3jn54khce6mua7l";

function polymod(values: number[]): number {
  const gen = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3];
  let chk = 1;
  for (const v of values) {
    const top = chk >> 25;
    chk = ((chk & 0x1ffffff) << 5) ^ v;
    for (let i = 0; i < 5; i++) if ((top >> i) & 1) chk ^= gen[i];
  }
  return chk;
}

function bech32(prefix: string, data: Uint8Array): string {
  const words: number[] = [];
  let acc = 0;
  let bits = 0;
  for (const b of data) {
    acc = (acc << 8) | b;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      words.push((acc >> bits) & 31);
    }
  }
  if (bits > 0) words.push((acc << (5 - bits)) & 31);
  const expanded = [...[...prefix].map((c) => c.charCodeAt(0) >> 5), 0, ...[...prefix].map((c) => c.charCodeAt(0) & 31)];
  const mod = polymod([...expanded, ...words, 0, 0, 0, 0, 0, 0]) ^ 1;
  const checksum = Array.from({ length: 6 }, (_, i) => (mod >> (5 * (5 - i))) & 31);
  return `${prefix}1${[...words, ...checksum].map((x) => B32[x]).join("")}`;
}

export const short = (address: string) => (address.length > 14 ? `${address.slice(0, 6)}...${address.slice(-4)}` : address);

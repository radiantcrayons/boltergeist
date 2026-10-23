"use client";

import { useEffect, useState } from "react";
import * as fmt from "@/lib/format";
import { BUILDER, viaKey, viaWallet, type Balance, type Session } from "@/lib/live/session";
import { detect, short, type Wallet } from "@/lib/live/wallets";
import { NETWORK, STRIKE_APP } from "@/lib/strike";

type Props = {
  session: Session | null;
  balance: Balance | null;
  onSession: (s: Session | null) => void;
  onClose: () => void;
};

const CHAINS = { ethereum: "Ethereum", solana: "Solana", cardano: "Cardano" } as const;

export function Connect({ session, balance, onSession, onClose }: Props) {
  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [key, setKey] = useState("");
  const [showKey, setShowKey] = useState(!BUILDER.code);

  useEffect(() => {
    const look = () => setWallets(detect());
    const timer = setTimeout(look, 0);
    const later = setTimeout(look, 600);
    return () => {
      clearTimeout(timer);
      clearTimeout(later);
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const run = async (label: string, f: () => Promise<Session>) => {
    setBusy(label);
    setError(null);
    try {
      onSession(await f());
    } catch (err) {
      setError((err as Error).message || "That didn't work");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="modal" role="dialog" aria-label="Connect to Strike" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <button className="close" onClick={onClose} aria-label="Close">
          &times;
        </button>
        <h2>{session ? "your Strike account" : "go live on Strike"}</h2>
        <p className={`network ${NETWORK}`}>{NETWORK === "testnet" ? "Strike testnet: test money only" : "Strike mainnet: real money"}</p>

        {session ? (
          <div className="account">
            <div className="row">
              <span className="dim">connected</span>
              <b>{session.address ? short(session.address) : short(session.accountId)}</b>
              {session.wallet && <span className="dim">{session.wallet}</span>}
            </div>
            <div className="row">
              <span className="dim">available</span>
              <b className="money">{balance ? fmt.money(balance.available) : "..."}</b>
              {balance && balance.wallet !== balance.available && <span className="dim">of {fmt.money(balance.wallet)}</span>}
            </div>
            <p className="dim">
              In a live game your graves and thunderclouds are real orders in Strike&apos;s book, and every call a real isolated position with your ghost&apos;s stake as its margin. Rivals stay pretend.
            </p>
            <div className="actions">
              <a className="big" href={STRIKE_APP} target="_blank" rel="noreferrer">
                deposit on Strike
              </a>
              <button className="plain" onClick={() => onSession(null)}>
                disconnect
              </button>
            </div>
          </div>
        ) : (
          <>
            {BUILDER.code && (
              <div className="wallets">
                {wallets.length ? (
                  wallets.map((w) => (
                    <button key={w.id} className="wallet" disabled={!!busy} onClick={() => run(w.id, () => viaWallet(w))}>
                      <span className="icon" style={w.icon ? { backgroundImage: `url("${w.icon}")` } : undefined} />
                      <span className="name">{w.name}</span>
                      <span className="chain">{CHAINS[w.chain]}</span>
                      {busy === w.id && <span className="dim">check your wallet...</span>}
                    </button>
                  ))
                ) : (
                  <p className="dim">No wallet found. Install MetaMask, Rabby, Phantom, or a Cardano wallet like Eternl or Lace, then reopen this.</p>
                )}
                <p className="dim small">
                  You sign one message to link a trading key to your Strike account. The key lives in this browser, can trade, and can&apos;t withdraw.
                  {BUILDER.feeBps > 0 && ` Trades carry a ${(BUILDER.feeBps / 100).toFixed(2)}% app fee.`}
                </p>
              </div>
            )}

            {showKey ? (
              <form
                className="apikey"
                onSubmit={(e) => {
                  e.preventDefault();
                  void run("key", () => viaKey(key));
                }}
              >
                <label>
                  <span className="label">API wallet private key</span>
                  <input type="password" autoComplete="off" spellCheck={false} value={key} onChange={(e) => setKey(e.target.value)} placeholder="64 hex characters" />
                </label>
                <button className="big" disabled={!key || !!busy}>
                  {busy === "key" ? "checking..." : "connect"}
                </button>
                <p className="dim small">
                  Make one at{" "}
                  <a href={`${STRIKE_APP}/api-keys`} target="_blank" rel="noreferrer">
                    Strike&apos;s API wallets page
                  </a>
                  . It can trade but can&apos;t withdraw, and it stays in this browser.
                </p>
              </form>
            ) : (
              <button className="link" onClick={() => setShowKey(true)}>
                or use an API key
              </button>
            )}
          </>
        )}
        {error && <p className="error">{error}</p>}
      </div>
    </div>
  );
}

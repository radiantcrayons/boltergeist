export function decimalsOf(step: number): number {
  const [digits, exponent] = step.toString().split("e-");
  const fraction = digits.split(".")[1]?.length ?? 0;
  return exponent ? Number(exponent) + fraction : fraction;
}

export function price(p: number, tick: number): string {
  const d = Math.min(decimalsOf(tick), 6);
  return p.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
}

export const money = (n: number, signed = false) => {
  const cents = Math.round(n * 100);
  return `${signed && cents > 0 ? "+" : cents < 0 ? "-" : ""}$${(Math.abs(cents) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

// Money in fractions of a cent, such as a maker rebate.
export const fine = (n: number) => (Math.abs(n) > 0 && Math.abs(n) < 1 ? `${n < 0 ? "-" : ""}$${Math.abs(n).toFixed(4).replace(/(\.\d\d\d*?)0+$/, "$1")}` : money(n));

export const whole = (n: number) => `$${n.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;

export const gain = (n: number) => (Math.abs(n) < 0.0005 ? "0%" : `${n > 0 ? "+" : ""}${(n * 100).toFixed(Math.abs(n) < 0.1 ? 1 : 0)}%`);

export const percent = (n: number, signed = false) => `${signed && n > 0 ? "+" : ""}${(n * 100).toFixed(2)}%`;

export function clock(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const two = (n: number) => String(n).padStart(2, "0");
  if (s >= 3600) return `${Math.floor(s / 3600)}:${two(Math.floor((s % 3600) / 60))}:${two(s % 60)}`;
  return `${Math.floor(s / 60)}:${two(s % 60)}`;
}

export const ordinal = (n: number) => `${n}${n % 10 === 1 && n % 100 !== 11 ? "st" : n % 10 === 2 && n % 100 !== 12 ? "nd" : n % 10 === 3 && n % 100 !== 13 ? "rd" : "th"}`;

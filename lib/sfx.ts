export type Sound = "pick" | "place" | "ready" | "bad" | "arm" | "enter" | "win" | "lose" | "out" | "zap" | "earth" | "strike" | "thunder";

// The sounds are made here, not played from files: low thuds, rumbling earth, wind and thunder, all run through a long dark reverb.
type Voice = (a: AudioContext, out: AudioNode, t: number) => void;

const VOLUME = 0.55;
const MUSIC = 0.32;
const TRACK = "/music/night-a.mp3";

let audio: AudioContext | null = null;
let bus: { dry: GainNode; wet: GainNode } | null = null;
let hiss: AudioBuffer | null = null;
let on = true;
let music: HTMLAudioElement | null = null;

// Brown noise, two seconds of it, made once: the stuff rumbles and wind are cut from.
function noise(a: AudioContext) {
  if (hiss) return hiss;
  hiss = a.createBuffer(1, a.sampleRate * 2, a.sampleRate);
  const d = hiss.getChannelData(0);
  let last = 0;
  for (let i = 0; i < d.length; i++) {
    last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02;
    d[i] = last * 3.5;
  }
  return hiss;
}

// The way out: straight to the speakers, and through a reverb made of decaying noise for the cave-like tail.
function outputs(a: AudioContext) {
  if (bus) return bus;
  const master = a.createDynamicsCompressor();
  master.threshold.value = -18;
  master.ratio.value = 4;
  master.connect(a.destination);
  const dry = a.createGain();
  dry.gain.value = VOLUME;
  dry.connect(master);
  const room = a.createConvolver();
  const len = a.sampleRate * 2.6;
  const ir = a.createBuffer(2, len, a.sampleRate);
  for (let c = 0; c < 2; c++) {
    const d = ir.getChannelData(c);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.2);
  }
  room.buffer = ir;
  const wet = a.createGain();
  wet.gain.value = VOLUME * 0.55;
  wet.connect(room).connect(master);
  bus = { dry, wet };
  return bus;
}

function envelope(a: AudioContext, t: number, attack: number, hold: number, release: number, peak: number) {
  const g = a.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + attack);
  g.gain.setValueAtTime(peak, t + attack + hold);
  g.gain.exponentialRampToValueAtTime(0.0001, t + attack + hold + release);
  return g;
}

// A low sweep of a pure tone: a thud, a boom, a groan.
const thud =
  (from: number, to: number, dur: number, peak: number, wave: OscillatorType = "sine"): Voice =>
  (a, out, t) => {
    const o = a.createOscillator();
    o.type = wave;
    o.frequency.setValueAtTime(from, t);
    o.frequency.exponentialRampToValueAtTime(to, t + dur);
    const lp = a.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 420;
    o.connect(lp).connect(envelope(a, t, 0.008, dur * 0.15, dur * 0.85, peak)).connect(out);
    o.start(t);
    o.stop(t + dur + 0.05);
  };

// Noise through a filter: a low rumble, gravel, wind, the crack of a strike.
const filtered =
  (type: BiquadFilterType, freq: number, dur: number, peak: number, o: { attack?: number; sweep?: number; q?: number; delay?: number; chop?: number } = {}): Voice =>
  (a, out, t0) => {
    const t = t0 + (o.delay ?? 0);
    const src = a.createBufferSource();
    src.buffer = noise(a);
    src.loop = true;
    const f = a.createBiquadFilter();
    f.type = type;
    f.Q.value = o.q ?? 0.8;
    f.frequency.setValueAtTime(freq, t);
    if (o.sweep) f.frequency.exponentialRampToValueAtTime(o.sweep, t + dur);
    let node: AudioNode = src.connect(f);
    if (o.chop) {
      const g = a.createGain();
      for (let s = 0; s < dur; s += 0.03) g.gain.setValueAtTime(Math.random() < o.chop ? 1 : 0.15, t + s);
      node = node.connect(g);
    }
    node.connect(envelope(a, t, o.attack ?? 0.02, 0, dur, peak)).connect(out);
    src.start(t, Math.random());
    src.stop(t + dur + (o.attack ?? 0.02) + 0.05);
  };

const chord =
  (freqs: number[], dur: number, peak: number): Voice =>
  (a, out, t) => {
    for (const f of freqs) {
      const o = a.createOscillator();
      o.type = "triangle";
      o.frequency.value = f;
      o.detune.value = (Math.random() - 0.5) * 14;
      const lp = a.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = 900;
      o.connect(lp).connect(envelope(a, t, dur * 0.3, dur * 0.2, dur * 0.5, peak / freqs.length)).connect(out);
      o.start(t);
      o.stop(t + dur + 0.05);
    }
  };

const VOICES: Record<Sound, { dry: Voice[]; wet?: Voice[] }> = {
  pick: { dry: [thud(130, 70, 0.12, 0.5)] },
  place: { dry: [thud(90, 45, 0.25, 0.6)], wet: [filtered("lowpass", 260, 0.5, 0.5)] },
  bad: { dry: [thud(80, 38, 0.35, 0.7)] },
  ready: { dry: [chord([196, 293.7, 392], 1.4, 0.5)], wet: [chord([196, 293.7], 1.6, 0.4)] },
  earth: {
    dry: [thud(70, 32, 0.9, 0.8), filtered("lowpass", 180, 1.1, 0.9, { attack: 0.15 }), filtered("bandpass", 900, 0.7, 0.35, { chop: 0.35, q: 1.4, delay: 0.1 })],
    wet: [filtered("lowpass", 240, 1.2, 0.5, { attack: 0.2 })],
  },
  enter: { dry: [filtered("bandpass", 260, 1.1, 0.6, { sweep: 1400, q: 2.2, attack: 0.35 }), thud(60, 40, 1, 0.5)], wet: [filtered("bandpass", 500, 1.2, 0.4, { sweep: 220, q: 2 })] },
  arm: { dry: [thud(95, 26, 1.6, 1), filtered("lowpass", 160, 2.2, 0.9, { attack: 0.05 }), filtered("highpass", 1800, 0.06, 0.25)], wet: [filtered("lowpass", 300, 2.4, 0.7)] },
  win: { dry: [chord([110, 164.8, 220, 329.6], 2.4, 0.7), thud(70, 50, 1.2, 0.4)], wet: [chord([220, 329.6, 440], 2.6, 0.4)] },
  lose: { dry: [thud(98, 38, 1.4, 0.7, "sawtooth"), filtered("lowpass", 140, 1.6, 0.7, { attack: 0.2 })], wet: [filtered("lowpass", 220, 1.8, 0.5)] },
  out: { dry: [thud(75, 40, 0.5, 0.5), filtered("lowpass", 200, 0.6, 0.4)] },
  strike: {
    dry: [filtered("highpass", 2400, 0.05, 0.12), filtered("lowpass", 150, 0.9, 0.35, { attack: 0.06, delay: 0.05 })],
    wet: [filtered("lowpass", 260, 1, 0.25, { delay: 0.05 })],
  },
  zap: { dry: [filtered("highpass", 2000, 0.07, 0.35), filtered("lowpass", 170, 1.6, 0.8, { attack: 0.08, delay: 0.06 })], wet: [filtered("lowpass", 300, 1.8, 0.6, { delay: 0.06 })] },
  thunder: {
    dry: [
      filtered("highpass", 1800, 0.08, 0.5),
      filtered("highpass", 2600, 0.05, 0.35, { delay: 0.11 }),
      thud(60, 28, 1.8, 0.8),
      filtered("lowpass", 140, 2.6, 1, { attack: 0.1, delay: 0.08, chop: 0.75 }),
    ],
    wet: [filtered("lowpass", 320, 2.8, 0.8, { delay: 0.08 })],
  },
};

// The music: one track, looping quietly under the game. Browsers only let it start after a touch or a key.
function startMusic() {
  if (!on || typeof window === "undefined") return;
  if (!music) {
    music = new Audio(TRACK);
    music.volume = MUSIC;
    music.loop = true;
  }
  if (music.paused) void music.play().catch(() => {});
}

if (typeof window !== "undefined") {
  for (const kind of ["pointerdown", "keydown"]) window.addEventListener(kind, startMusic);
}

export const setSound = (enabled: boolean) => {
  on = enabled;
  if (!enabled) music?.pause();
  else startMusic();
};

export function play(sound: Sound) {
  if (!on) return;
  try {
    audio ??= new AudioContext();
    if (audio.state === "suspended") void audio.resume();
    const out = outputs(audio);
    const t = audio.currentTime + 0.01;
    const v = VOICES[sound];
    for (const voice of v.dry) voice(audio, out.dry, t);
    for (const voice of v.wet ?? []) voice(audio, out.wet, t);
  } catch {}
}

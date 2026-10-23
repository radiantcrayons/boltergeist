import { INK, SPARKY, type ArtProps } from "./types";

const FUR = { base: "#f43f5e", shade: "#b4233f", deep: "#7a1530", hi: "#ff8da1" };
const CREAM = { base: "#ffe4e8", shade: "#f2b8c2" };
const CLAW = "#2a0f18";
const PLUM = "#4a0c2c";
const IRIS = "#b0102a";
const L = { fill: "none", stroke: INK, strokeWidth: 4, strokeLinejoin: "round", strokeLinecap: "round" } as const;
const l = { ...L, strokeWidth: 2.25 } as const;

const P = {
  torso: "M 60 100 C 84 92 126 92 150 104 C 162 110 166 124 160 138 C 166 150 168 172 160 188 C 152 202 134 208 108 208 C 84 208 66 202 58 190 C 50 176 48 158 48 144 C 40 130 42 108 60 100 Z",
  belly: "M 76 158 C 94 150 136 150 154 160 C 162 172 160 190 148 200 C 134 208 98 208 82 200 C 70 192 68 168 76 158 Z",
  legN: "M 62 184 C 52 196 46 208 44 222 L 82 222 C 88 210 96 198 100 188 Z",
  footN: "M 26 232 C 24 222 32 214 46 214 L 74 214 C 82 211 88 213 90 218 C 96 216 102 220 100 226 C 103 228 103 231 101 232 Z",
  legF: "M 116 188 C 120 200 122 212 122 222 L 160 222 C 160 208 156 196 150 186 Z",
  footF: "M 116 232 C 114 222 122 214 136 214 L 156 214 C 164 211 170 213 172 218 C 178 216 182 222 180 226 C 183 228 183 231 181 232 Z",
  armN: "M 72 138 C 62 150 48 158 36 158 Q 30 164 24 168 Q 25 161 23 156 Q 18 158 11 158 Q 15 152 15 148 C 10 142 8 134 8 124 C 6 110 6 96 10 84 L 46 82 C 44 96 44 108 46 118 C 48 108 54 100 62 98 C 68 96 74 98 78 102 Z",
  pawN: "M 10 78 C 4 68 6 54 16 48 C 26 42 42 44 48 52 C 54 60 52 76 44 82 C 34 90 16 88 10 78 Z",
  upperF: "M 138 104 C 154 98 168 106 172 120 C 176 132 176 144 168 150 C 160 156 150 150 146 142 Z",
  foreF: "M 158 146 C 158 134 162 124 168 116 L 186 120 C 184 134 180 146 174 152 C 168 158 158 156 158 146 Z",
  pawF: "M 164 122 C 156 114 156 102 166 98 C 174 94 184 96 188 104 C 192 112 190 122 184 126 C 178 132 170 130 164 122 Z",
  skull: "M 110 29 C 134 32 150 46 152 66 C 154 90 138 106 112 108 C 100 110 90 108 84 104 Q 80 110 70 112 Q 74 104 74 100 Q 66 100 58 98 Q 64 92 64 88 C 60 80 60 72 62 64 C 64 44 76 32 90 29 Q 92 24 92 18 Q 98 24 100 28 Q 104 22 106 18 Q 108 24 110 29 Z",
  ear: "M 73.7 25.2 A 13 13 0 1 1 66 29.6 L 71.5 31.5 Z",
  muzzle: "M 116 84 C 116 72 130 68 144 70 C 158 72 168 80 166 94 C 164 106 150 112 136 110 C 122 108 116 98 116 84 Z",
  eyeN: "M 92 60 C 100 58 112 62 120 68 C 118 76 112 80 106 80 C 98 80 91 72 92 60 Z",
  eyeF: "M 130 66 C 134 62 140 60 146 60 C 146 68 142 74 138 74 C 133 74 130 70 130 66 Z",
};
const CLAW_D = "M -4.5 0 C -4.5 -10 -1 -16 5 -19 C 3.5 -12 4.5 -6 4.5 0 Z";

function Claw({ x, y, r, s = 1 }: { x: number; y: number; r: number; s?: number }) {
  return (
    <g transform={`translate(${x} ${y}) rotate(${r}) scale(${s})`}>
      <path d={CLAW_D} fill={CLAW} stroke={INK} strokeWidth={2} strokeLinejoin="round" />
      <path d="M -2 -3 C -2 -9 0 -12 2.5 -14" fill="none" stroke="#7d3a50" strokeWidth={1.4} strokeLinecap="round" />
    </g>
  );
}

function Star({ x, y, r = 7 }: { x: number; y: number; r?: number }) {
  const pts = Array.from({ length: 10 }, (_, i) => {
    const a = (Math.PI / 5) * i - Math.PI / 2;
    const rr = i % 2 ? r * 0.45 : r;
    return `${(x + Math.cos(a) * rr).toFixed(1)},${(y + Math.sin(a) * rr).toFixed(1)}`;
  }).join(" ");
  return <polygon points={pts} fill={SPARKY} stroke={INK} strokeWidth={2} strokeLinejoin="round" />;
}

export function Bear({ mood = "ready", className }: ArtProps) {
  const happy = mood === "happy";
  const open = mood === "ready" || mood === "attack" || happy;
  return (
    <svg viewBox="0 0 200 240" className={className} aria-hidden="true">
      <g transform="translate(4 9.28) scale(0.96)">
        <path d={P.upperF} fill={FUR.base} />
        <path d="M 176 132 C 176 144 168 150 160 154 C 154 152 150 148 146 142 L 150 130 C 158 138 168 138 176 132 Z" fill={FUR.shade} />
        <path d={P.upperF} {...L} />
        <path d={P.foreF} fill={FUR.base} />
        <path d="M 186 120 C 184 134 180 146 174 152 C 168 158 158 156 158 146 C 168 148 174 138 178 120 Z" fill={FUR.shade} />
        <path d={P.foreF} {...L} />
        <path d={P.legF} fill={FUR.base} />
        <path d="M 150 186 C 156 196 160 208 160 222 L 146 222 C 146 208 144 198 140 188 Z" fill={FUR.shade} />
        <path d={P.legF} {...L} />
        <path d={P.footF} fill={FUR.base} />
        <path d="M 181 232 C 183 231 183 228 180 226 C 182 222 178 216 172 218 C 172 224 168 230 162 232 Z" fill={FUR.shade} />
        <path d={P.footF} {...L} />
        <Claw x={171} y={216} r={100} s={0.65} />
        <Claw x={180} y={225} r={112} s={0.65} />
        <path d={P.legN} fill={FUR.base} />
        <path d="M 100 188 C 96 198 88 210 82 222 L 70 222 C 76 210 82 198 86 188 Z" fill={FUR.shade} />
        <path d={P.legN} {...L} />
        <path d={P.footN} fill={FUR.base} />
        <path d="M 101 232 C 103 231 103 228 100 226 C 102 220 96 216 90 218 C 90 224 86 230 80 232 Z" fill={FUR.shade} />
        <path d={P.footN} {...L} />
        <Claw x={89} y={216} r={100} s={0.65} />
        <Claw x={99} y={225} r={112} s={0.65} />

        <path d={P.torso} fill={FUR.base} />
        <path d="M 160 138 C 166 150 168 172 160 188 C 152 202 134 208 108 208 C 84 208 66 202 58 190 C 80 200 130 200 150 180 C 160 168 162 150 160 138 Z" fill={FUR.shade} />
        <path d="M 64 104 C 84 120 128 122 152 108 C 132 94 84 94 64 104 Z" fill={FUR.shade} />
        <path d={P.torso} {...L} />
        <path d="M 72 120 L 114 140 L 156 120 L 158 130 L 114 152 L 70 130 Z" fill={PLUM} />
        <path d={P.belly} fill={CREAM.base} />
        <path d="M 154 160 C 162 172 160 190 148 200 C 134 208 98 208 82 200 C 104 202 140 196 154 160 Z" fill={CREAM.shade} />
        <path d="M 86 172 C 88 164 94 158 102 155" fill="none" stroke="#fff" strokeWidth={3.5} strokeLinecap="round" />
        <path d={P.belly} {...l} />

        <g transform="translate(4 0)">
          <path d={P.armN} fill={FUR.base} />
          <path d="M 46 82 C 44 96 44 108 46 118 C 44 126 46 134 52 140 C 46 150 36 154 28 148 C 34 140 36 126 34 118 C 32 106 34 94 36 82 Z" fill={FUR.shade} />
          <path d="M 72 138 C 62 150 48 158 36 158 Q 30 164 24 168 Q 25 161 23 156 Q 18 158 11 158 Q 15 152 15 148 C 30 154 52 150 70 128 Z" fill={FUR.shade} />
          <path d="M 58 102 C 52 104 48 110 47 116" fill="none" stroke={FUR.hi} strokeWidth={4} strokeLinecap="round" />
          <path d="M 13 100 C 11 108 11 116 12 124" fill="none" stroke={FUR.hi} strokeWidth={3.5} strokeLinecap="round" />
          <path d={P.armN} {...L} />
          <path d="M 46 118 C 44 126 46 134 52 140 M 62 98 C 70 106 72 120 68 132" {...l} />
          <g transform="rotate(-8 28 66)">
            <path d={P.pawN} fill={FUR.base} />
            <path d="M 48 52 C 54 60 52 76 44 82 C 34 90 16 88 10 78 C 28 80 44 72 48 52 Z" fill={FUR.shade} />
            <path d={P.pawN} {...L} />
            <path d="M 18 46 L 20 56 M 29 44 L 30 54 M 40 46 L 39 55" {...l} />
            <Claw x={11} y={54} r={-20} s={0.95} />
            <Claw x={21} y={46} r={-6} s={0.95} />
            <Claw x={33} y={44} r={8} s={0.95} />
            <Claw x={45} y={48} r={24} s={0.95} />
          </g>
        </g>

        <g transform="translate(176 117) scale(1.15) translate(-176 -112)">
          <path d={P.pawF} fill={FUR.base} />
          <path d="M 188 104 C 192 112 190 122 184 126 C 178 132 170 130 164 122 C 176 124 186 116 188 104 Z" fill={FUR.shade} />
          <path d="M 162 110 C 163 105 166 102 170 100" fill="none" stroke={FUR.hi} strokeWidth={3} strokeLinecap="round" />
          <path d={P.pawF} {...L} />
          <path d="M 173 96 L 174 104 M 181 98 L 180 106" {...l} />
          <Claw x={166} y={102} r={-8} s={0.8} />
          <Claw x={176} y={97} r={8} s={0.8} />
          <Claw x={185} y={100} r={18} s={0.75} />
        </g>

        <g transform="translate(-4 2)">
          <path d={P.ear} fill={FUR.base} />
          <path d="M 76 25 A 13 13 0 0 1 76 51 A 17 17 0 0 0 76 25 Z" fill={FUR.shade} />
          <path d={P.ear} {...L} />
          <circle cx="77" cy="39" r="6.5" fill={CREAM.base} stroke={INK} strokeWidth={2.25} />
          <circle cx="134" cy="34" r="11" fill={FUR.base} />
          <path d="M 134 23 A 11 11 0 0 1 134 45 A 14 14 0 0 0 134 23 Z" fill={FUR.shade} />
          <circle cx="134" cy="34" r="11" {...L} />
          <circle cx="136" cy="35" r="5.5" fill={CREAM.base} stroke={INK} strokeWidth={2.25} />

          <path d={P.skull} fill={FUR.base} />
          <path d="M 152 66 C 154 90 138 106 112 108 C 100 110 90 108 84 104 C 108 104 136 94 148 48 C 151 54 152 60 152 66 Z" fill={FUR.shade} />
          <path d="M 74 48 C 80 38 90 34 100 34 C 92 38 84 44 78 54 Z" fill={FUR.hi} />
          <path d={P.skull} {...L} />
          <path d={P.muzzle} fill={CREAM.base} />
          <path d="M 166 94 C 164 106 150 112 136 110 C 122 108 116 98 116 84 C 124 98 148 102 166 94 Z" fill={CREAM.shade} />
          <path d="M 124 80 C 126 76 130 74 135 73" fill="none" stroke="#fff" strokeWidth={3} strokeLinecap="round" />
          <path d={P.muzzle} {...L} strokeWidth={3} />

          {open ? (
            <g>
              <path d={P.eyeN} fill="#fff" />
              <circle cx={happy ? 112 : 109} cy={happy ? 73 : 70} r="5.5" fill={IRIS} />
              <circle cx={happy ? 113 : 110} cy={happy ? 73 : 70} r="2.4" fill={INK} />
              <circle cx={happy ? 110.5 : 107.5} cy={happy ? 72 : 68} r="1.4" fill="#fff" />
              <path d={P.eyeN} {...l} />
              <path d={P.eyeF} fill="#fff" />
              <circle cx={happy ? 141 : 140} cy={happy ? 69 : 67} r="4" fill={IRIS} />
              <circle cx={happy ? 141.5 : 140.5} cy={happy ? 69 : 67} r="1.8" fill={INK} />
              <path d={P.eyeF} {...l} />
              {happy ? (
                <g>
                  <path d="M 90 56 L 122 62 L 121 72 C 112 70 100 70 91 71 Z M 128 56 L 148 54 L 147 67 C 142 67 136 68 130 69 Z" fill={FUR.base} />
                  <path d="M 91 71 C 100 70 112 70 121 72 M 130 69 C 136 68 142 67 147 67" {...l} strokeWidth={3} />
                </g>
              ) : null}
              <path d="M 86 50 C 98 46 112 50 124 60 C 123 64 121 66 118 67 C 108 58 98 56 88 58 Z" fill={INK} transform={mood === "attack" ? "rotate(7 86 54)" : happy ? "rotate(-5 86 54)" : undefined} />
              <path d="M 128 64 C 134 56 142 50 154 46 C 156 50 155 54 152 55 C 144 57 138 62 134 68 Z" fill={INK} transform={mood === "attack" ? "rotate(-7 154 48)" : happy ? "translate(0 -3)" : undefined} />
            </g>
          ) : null}
          {mood === "hurt" ? (
            <g {...l} strokeWidth={3}>
              <path d="M 94 62 L 112 70 L 96 76" />
              <path d="M 146 62 L 134 68 L 144 74" />
              <path d="M 88 52 C 98 54 108 56 118 52" />
              <path d="M 132 52 C 138 50 144 48 150 50" />
            </g>
          ) : null}
          {mood === "ko" ? (
            <g {...l}>
              <circle cx="104" cy="68" r="10" fill="#fff" />
              <path d="M 104 68 m -1.5 0 a 1.5 1.5 0 1 1 3 0 a 3.5 3.5 0 1 1 -7 0 a 5.5 5.5 0 1 1 11 0 a 7.5 7.5 0 1 1 -15 0" />
              <circle cx="139" cy="66" r="7.5" fill="#fff" />
              <path d="M 139 66 m -1 0 a 1 1 0 1 1 2 0 a 2.5 2.5 0 1 1 -5 0 a 4 4 0 1 1 8 0 a 5.5 5.5 0 1 1 -11 0" />
            </g>
          ) : null}

          <path d="M 150 74 C 156 69 166 71 169 77 C 170 84 162 88 157 88 C 151 87 148 81 150 74 Z" fill={INK} />
          <ellipse cx="157" cy="76" rx="3" ry="1.8" fill="#5b6170" />

          {mood === "ready" ? (
            <g>
              <path d="M 120 97 C 132 103 152 103 166 95 C 166 106 156 114 142 114 C 130 114 121 107 120 97 Z" fill={INK} stroke={INK} strokeWidth={2.25} strokeLinejoin="round" />
              <path d="M 122 99 C 134 104 152 104 164 97 L 163 101 C 152 107 134 107 123 102 Z" fill="#fff" />
              <path d="M 126 101 L 130 112 L 134 103 Z M 155 101 L 157 111 L 161 99 Z M 135 114 L 138 107 L 141 114 Z M 148 114 L 151 107 L 154 113 Z" fill="#fff" stroke={INK} strokeWidth={1.5} strokeLinejoin="round" />
            </g>
          ) : null}
          {mood === "attack" ? (
            <g>
              <path d="M 118 94 C 116 116 128 134 143 134 C 158 134 170 116 166 92 Z" fill={CREAM.base} />
              <path d="M 168 104 C 166 122 156 134 143 134 C 132 134 124 128 120 118 C 132 126 156 124 168 104 Z" fill={CREAM.shade} />
              <path d="M 118 94 C 116 116 128 134 143 134 C 158 134 170 116 166 92" {...L} strokeWidth={3} />
              <path d="M 120 96 C 134 102 152 102 166 94 C 168 114 156 128 142 128 C 128 128 118 114 120 96 Z" fill="#3a0714" stroke={INK} strokeWidth={3} strokeLinejoin="round" />
              <path d="M 128 120 C 134 114 148 114 154 120 C 150 126 134 126 128 120 Z" fill="#ff6f8c" />
              <path d="M 126 100 L 130 110 L 134 101 Z M 152 100 L 156 109 L 159 98 Z M 130 124 L 133 116 L 137 125 Z M 150 124 L 154 115 L 157 122 Z" fill="#fff" stroke={INK} strokeWidth={1.5} strokeLinejoin="round" />
            </g>
          ) : null}
          {mood === "hurt" ? (
            <g>
              <path d="M 124 97 C 136 101 150 101 162 96 C 160 104 152 108 142 108 C 132 108 126 104 124 97 Z" {...l} fill="#fff" />
              <path d="M 126 102 C 136 104 150 104 160 100 M 134 100 L 134 108 M 144 101 L 144 108 M 153 99 L 153 106" {...l} strokeWidth={1.5} />
              <path d="M 62 42 C 56 52 54 58 58 62 C 62 65 68 62 66 54 C 65 50 64 46 62 42 Z" {...l} fill="#bfe9ff" />
            </g>
          ) : null}
          {mood === "ko" ? (
            <g>
              <path d="M 126 100 C 138 104 150 102 160 98 C 154 104 140 106 126 100 Z" {...l} fill={INK} />
              <path d="M 138 102 C 138 112 142 118 148 118 C 154 118 156 112 154 101 Z" {...l} fill="#ff6f8c" />
              <path d="M 146 106 L 147 113" {...l} strokeWidth={1.5} />
              <Star x={76} y={13} r={8.5} />
              <Star x={108} y={10} r={9.5} />
              <Star x={141} y={13} r={8.5} />
            </g>
          ) : null}
          {mood === "happy" ? (
            <g>
              <path d="M 120 94 C 134 104 152 104 166 90 C 164 106 152 116 140 116 C 130 116 122 108 120 94 Z" {...l} fill="#fff" />
              <path d="M 124 102 C 136 108 152 106 162 100" {...l} strokeWidth={1.5} />
            </g>
          ) : null}
        </g>
        {mood === "attack" ? (
          <g fill="none" strokeLinecap="round">
            <path d="M 164 28 Q 188 52 174 92 M 172 26 Q 196 52 182 94 M 180 28 Q 202 54 190 92" stroke={INK} strokeWidth={8} />
            <path d="M 164 28 Q 188 52 174 92 M 172 26 Q 196 52 182 94 M 180 28 Q 202 54 190 92" stroke="#fff" strokeWidth={3.5} />
          </g>
        ) : null}
      </g>
    </svg>
  );
}

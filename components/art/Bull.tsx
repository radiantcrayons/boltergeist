import { INK, SPARKY, type ArtProps } from "./types";

const HIDE = { base: "#f8931a", shade: "#b8620a", deep: "#7a3f05", hi: "#ffc46e" };
const HORN = { base: "#fff1d6", shade: "#e3c9a0" };
const SNOUT = { base: "#ffd9a8", shade: "#eeb877" };
const HOOF = { base: "#2b1a0a", hi: "#6a4522" };
const BROWN = "#4a2604";
const IRIS = "#b0102a";
const L = { fill: "none", stroke: INK, strokeWidth: 4, strokeLinejoin: "round", strokeLinecap: "round" } as const;
const l = { ...L, strokeWidth: 2.25 } as const;

const P = {
  torso: "M 56 104 C 80 94 128 94 156 106 C 170 114 172 132 164 142 C 158 156 150 172 146 190 C 144 200 138 206 120 208 C 100 210 80 208 72 200 C 66 184 58 164 50 148 C 38 136 38 114 56 104 Z",
  legN: "M 72 194 C 60 202 52 210 49 217 Q 54 218 57 224 Q 60 218 64 216 Q 67 220 70 225 Q 73 218 77 216 Q 81 219 85 223 C 88 212 96 206 104 200 Z",
  hoofN: "M 44 232 C 42 222 46 214 54 212 L 80 212 C 88 214 92 222 90 232 Z",
  legF: "M 118 198 C 124 206 128 212 129 216 Q 134 218 137 224 Q 140 218 144 216 Q 147 220 150 225 Q 153 218 157 216 Q 161 219 165 223 C 164 210 156 200 148 192 Z",
  hoofF: "M 124 232 C 122 222 126 214 134 212 L 160 212 C 168 214 172 222 170 232 Z",
  armN: "M 72 140 C 62 150 48 156 36 154 C 22 152 12 142 12 128 C 10 114 12 100 18 90 L 42 88 C 42 100 44 110 48 118 C 50 106 58 98 66 98 C 72 98 76 100 80 104 Z",
  fistN: "M 12 82 C 8 72 10 62 18 58 C 26 54 38 54 44 58 C 50 64 50 76 46 84 C 42 90 34 92 26 92 C 18 92 14 88 12 82 Z",
  upperF: "M 140 106 C 156 100 170 108 174 122 C 178 134 178 146 170 152 C 162 158 152 152 148 144 Z",
  foreF: "M 160 148 C 160 136 164 126 170 118 L 188 124 C 186 138 182 148 176 154 C 170 160 160 158 160 148 Z",
  fistF: "M 166 128 C 160 120 160 110 168 106 C 176 102 188 102 192 108 C 196 116 194 128 188 132 C 182 138 172 136 166 128 Z",
  hornN: "M 84 56 C 66 60 48 56 38 44 C 32 36 30 26 32 16 C 38 26 46 32 56 34 C 66 36 76 34 84 32 Z",
  hornF: "M 126 48 C 146 50 162 44 168 34 C 172 28 174 22 172 15 C 166 23 160 28 150 30 C 140 32 132 32 126 30 Z",
  earN: "M 68 64 C 60 62 50 64 44 72 C 52 76 62 74 68 70 Z",
  earF: "M 140 52 C 150 46 162 46 170 50 C 164 58 152 60 142 58 Z",
  skull: "M 78 44 C 92 32 120 30 136 38 C 148 46 152 62 150 76 C 148 90 140 100 128 106 C 112 112 92 110 80 102 C 68 94 62 80 64 66 C 66 56 70 50 78 44 Z",
  tuft: "M 136 48 C 142 36 138 24 126 18 C 120 15 114 14 108 14 C 112 18 114 22 114 26 C 106 21 98 19 90 20 C 94 24 96 28 96 32 C 88 30 82 30 76 32 C 82 36 86 42 86 48 Q 92 50 98 55 Q 98 50 100 47 Q 106 50 113 55 Q 113 50 116 46 Q 122 48 128 52 Q 128 48 130 46 Q 133 47 136 48 Z",
  muzzle: "M 112 86 C 116 76 134 72 150 76 C 166 80 172 92 168 104 C 164 116 148 122 132 120 C 116 118 108 102 112 86 Z",
  eyeN: "M 88 62 C 96 60 108 64 116 70 C 114 78 108 82 102 82 C 94 82 87 74 88 62 Z",
  eyeF: "M 126 66 C 130 62 136 60 142 60 C 142 68 138 74 134 74 C 129 74 126 70 126 66 Z",
};

function Star({ x, y, r = 7 }: { x: number; y: number; r?: number }) {
  const pts = Array.from({ length: 10 }, (_, i) => {
    const a = (Math.PI / 5) * i - Math.PI / 2;
    const rr = i % 2 ? r * 0.45 : r;
    return `${(x + Math.cos(a) * rr).toFixed(1)},${(y + Math.sin(a) * rr).toFixed(1)}`;
  }).join(" ");
  return <polygon points={pts} fill={SPARKY} stroke={INK} strokeWidth={2} strokeLinejoin="round" />;
}

export function Bull({ mood = "ready", className }: ArtProps) {
  const happy = mood === "happy";
  const open = mood === "ready" || mood === "attack" || happy;
  return (
    <svg viewBox="0 0 200 240" className={className} aria-hidden="true">
      <g transform="translate(4 9.28) scale(0.96)">
        <path d="M 70 184 C 44 186 30 196 30 210" fill="none" stroke={INK} strokeWidth={9} strokeLinecap="round" />
        <path d="M 70 184 C 44 186 30 196 30 210" fill="none" stroke={HIDE.base} strokeWidth={4} strokeLinecap="round" />
        <path d="M 30 204 C 38 208 40 218 34 226 C 34 220 32 220 30 222 C 28 218 24 220 22 224 C 20 216 22 208 30 204 Z" {...l} fill={HOOF.base} />

        <g transform="translate(0 8)">
          <path d={P.upperF} fill={HIDE.base} />
          <path d="M 178 134 C 178 146 170 152 162 156 C 156 154 152 150 148 144 L 152 132 C 160 140 170 140 178 134 Z" fill={HIDE.shade} />
          <path d={P.upperF} {...L} />
          <path d={P.foreF} fill={HIDE.base} />
          <path d="M 188 124 C 186 138 182 148 176 154 C 170 160 160 158 160 148 C 170 150 176 140 180 122 Z" fill={HIDE.shade} />
          <path d={P.foreF} {...L} />
        </g>

        <path d={P.hoofF} {...L} fill={HOOF.base} />
        <path d="M 150 231 L 151 224" {...l} stroke={HOOF.hi} strokeWidth={3} />
        <path d={P.legF} fill={HIDE.base} />
        <path d="M 148 192 C 156 200 164 210 165 223 Q 161 219 157 216 Q 155 219 153 222 C 151 210 146 202 140 196 Z" fill={HIDE.shade} />
        <path d={P.legF} {...L} />
        <path d={P.hoofN} {...L} fill={HOOF.base} />
        <path d="M 70 231 L 71 224" {...l} stroke={HOOF.hi} strokeWidth={3} />
        <path d={P.legN} fill={HIDE.base} />
        <path d="M 104 200 C 96 206 88 212 85 223 Q 81 219 77 216 Q 76 219 74 222 C 76 212 84 206 92 200 Z" fill={HIDE.shade} />
        <path d={P.legN} {...L} />

        <path d={P.torso} fill={HIDE.base} />
        <path d="M 164 142 C 158 156 150 172 146 190 C 144 200 138 206 120 208 C 100 210 80 208 72 200 C 96 202 128 196 136 176 C 142 160 150 150 164 142 Z" fill={HIDE.shade} />
        <path d="M 60 106 C 82 122 128 124 156 108 C 136 96 82 96 60 106 Z" fill={HIDE.shade} />
        <path d={P.torso} {...L} />
        <path d="M 70 146 C 84 156 102 156 114 148 C 126 156 144 154 154 144 M 114 150 L 114 196 M 94 166 C 102 170 108 170 114 168 C 120 170 128 170 136 164 M 98 184 C 104 186 110 186 114 184 C 118 186 124 186 132 182" {...l} />
        <path d="M 80 146 L 114 126 L 150 146 L 150 134 L 114 112 L 80 134 Z" fill={BROWN} />

        <path d={P.armN} fill={HIDE.base} />
        <path d="M 42 88 C 42 100 44 110 48 118 C 46 126 48 134 54 140 C 48 150 38 154 30 148 C 36 140 38 126 36 118 C 34 106 32 96 32 88 Z" fill={HIDE.shade} />
        <path d="M 72 140 C 62 150 48 156 36 154 C 28 152 20 148 16 142 C 32 150 54 146 70 128 Z" fill={HIDE.shade} />
        <path d="M 60 102 C 54 104 50 110 49 116" fill="none" stroke={HIDE.hi} strokeWidth={4} strokeLinecap="round" />
        <path d="M 18 104 C 16 110 15 116 16 124" fill="none" stroke={HIDE.hi} strokeWidth={3.5} strokeLinecap="round" />
        <path d={P.armN} {...L} />
        <path d="M 48 118 C 46 126 48 134 54 140 M 66 98 C 74 106 76 120 72 132" {...l} />
        <path d={P.fistN} {...L} fill={HOOF.base} />
        <path d="M 20 60 C 24 58 28 58 32 59 M 16 70 C 26 72 36 70 46 66 M 14 80 C 24 82 36 80 46 76" {...l} stroke={HOOF.hi} />

        <g transform="translate(0 8)">
          <path d={P.fistF} {...L} fill={HOOF.base} />
          <path d="M 172 108 C 176 106 180 106 184 107 M 164 118 C 174 120 184 118 194 114 M 166 126 C 176 128 186 126 192 122" {...l} stroke={HOOF.hi} />
        </g>

        <path d={P.earN} {...L} fill={HIDE.base} />
        <path d="M 64 66 C 58 66 52 68 49 71 C 55 73 60 72 64 69 Z" fill={SNOUT.base} />
        <path d={P.earF} {...L} fill={HIDE.base} />
        <path d={P.hornN} fill={HORN.base} />
        <path d="M 84 56 C 66 60 48 56 38 44 C 32 36 30 26 32 16 C 36 34 54 46 84 46 Z" fill={HORN.shade} />
        <path d="M 40 30 C 44 36 50 40 58 42" fill="none" stroke="#fff" strokeWidth={2.5} strokeLinecap="round" />
        <path d={P.hornN} {...L} />
        <path d="M 72 35 C 69 42 69 50 72 57 M 63 34 C 60 41 60 49 63 56" {...l} />
        <path d={P.hornF} fill={HORN.base} />
        <path d="M 126 48 C 146 50 162 44 168 34 C 172 28 174 22 172 15 C 170 28 156 40 126 40 Z" fill={HORN.shade} />
        <path d="M 150 36 C 156 34 161 31 164 27" fill="none" stroke="#fff" strokeWidth={2.5} strokeLinecap="round" />
        <path d={P.hornF} {...L} />
        <path d="M 134 34 C 136 38 136 42 134 46 M 141 33 C 143 37 143 42 141 47" {...l} />

        <path d={P.skull} fill={HIDE.base} />
        <path d="M 150 76 C 148 90 140 100 128 106 C 112 112 92 110 80 102 C 104 104 130 92 146 52 C 150 60 151 68 150 76 Z" fill={HIDE.shade} />
        <path d="M 69 80 C 68 72 70 64 75 58" fill="none" stroke={HIDE.hi} strokeWidth={4} strokeLinecap="round" />
        <path d={P.skull} {...L} />
        <path d={P.tuft} {...L} fill={HOOF.base} />
        <path d="M 100 30 C 108 26 118 26 126 28" {...l} stroke={HOOF.hi} strokeWidth={3} />
        <path d={P.muzzle} fill={SNOUT.base} />
        <path d="M 168 104 C 164 116 148 122 132 120 C 116 118 108 102 112 86 C 118 104 146 110 168 104 Z" fill={SNOUT.shade} />
        <path d="M 119 84 C 122 80 127 78 133 77" fill="none" stroke="#fff" strokeWidth={3} strokeLinecap="round" />
        <path d={P.muzzle} {...L} strokeWidth={3} />

        {open ? (
          <g>
            <path d={P.eyeN} fill="#fff" />
            <circle cx={happy ? 108 : 105} cy={happy ? 75 : 72} r="5.5" fill={IRIS} />
            <circle cx={happy ? 109 : 106} cy={happy ? 75 : 72} r="2.4" fill={INK} />
            <circle cx={happy ? 106.5 : 103.5} cy={happy ? 74 : 70} r="1.4" fill="#fff" />
            <path d={P.eyeN} {...l} />
            <path d={P.eyeF} fill="#fff" />
            <circle cx={happy ? 137 : 136} cy={happy ? 69 : 67} r="4" fill={IRIS} />
            <circle cx={happy ? 137.5 : 136.5} cy={happy ? 69 : 67} r="1.8" fill={INK} />
            <path d={P.eyeF} {...l} />
            {happy ? (
              <g>
                <path d="M 86 58 L 118 64 L 117 74 C 108 72 96 72 87 73 Z M 124 56 L 144 54 L 143 67 C 138 67 132 68 126 69 Z" fill={HIDE.base} />
                <path d="M 87 73 C 96 72 108 72 117 74 M 126 69 C 132 68 138 67 143 67" {...l} strokeWidth={3} />
              </g>
            ) : null}
            <path d="M 82 52 C 94 48 108 52 120 62 C 119 66 117 68 114 69 C 104 60 94 58 84 60 Z" fill={INK} transform={mood === "attack" ? "rotate(7 84 56)" : happy ? "rotate(-5 84 56)" : undefined} />
            <path d="M 124 64 C 130 56 138 50 150 46 C 152 50 151 54 148 55 C 140 57 134 62 130 68 Z" fill={INK} transform={mood === "attack" ? "rotate(-7 150 50)" : happy ? "translate(0 -3)" : undefined} />
          </g>
        ) : null}
        {mood === "hurt" ? (
          <g {...l} strokeWidth={3}>
            <path d="M 90 64 L 108 72 L 92 78" />
            <path d="M 142 62 L 130 68 L 140 74" />
            <path d="M 84 54 C 94 56 104 58 114 54" />
            <path d="M 128 54 C 134 52 140 50 146 52" />
          </g>
        ) : null}
        {mood === "ko" ? (
          <g {...l}>
            <circle cx="100" cy="70" r="10" fill="#fff" />
            <path d="M 100 70 m -1.5 0 a 1.5 1.5 0 1 1 3 0 a 3.5 3.5 0 1 1 -7 0 a 5.5 5.5 0 1 1 11 0 a 7.5 7.5 0 1 1 -15 0" />
            <circle cx="135" cy="66" r="7.5" fill="#fff" />
            <path d="M 135 66 m -1 0 a 1 1 0 1 1 2 0 a 2.5 2.5 0 1 1 -5 0 a 4 4 0 1 1 8 0 a 5.5 5.5 0 1 1 -11 0" />
          </g>
        ) : null}

        <ellipse cx="146" cy="90" rx="4" ry="5.5" transform="rotate(-20 146 90)" fill={INK} />
        <ellipse cx="162" cy="88" rx="3" ry="5" transform="rotate(-10 162 88)" fill={INK} />

        {mood === "ready" ? (
          <g>
            <path d="M 116 114 C 124 106 142 106 152 110 C 153 115 152 119 149 122 C 138 118 126 119 118 123 C 116 120 115 117 116 114 Z" {...l} fill="#fff" />
            <path d="M 117 118 C 128 113 142 113 151 116 M 125 111 L 125 121 M 134 109 L 134 119 M 143 109 L 143 119" {...l} strokeWidth={1.5} />
          </g>
        ) : null}
        {mood === "attack" ? (
          <g>
            <path d="M 112 100 C 108 124 118 142 133 142 C 148 142 158 130 158 112 Z" fill={SNOUT.base} />
            <path d="M 158 118 C 156 132 146 142 133 142 C 122 142 114 134 111 124 C 122 134 146 134 158 118 Z" fill={SNOUT.shade} />
            <path d="M 112 100 C 108 124 118 142 133 142 C 148 142 158 130 158 112" {...L} strokeWidth={3} />
            <path d="M 114 104 C 126 112 142 114 156 110 C 158 124 148 136 134 136 C 122 136 112 124 114 104 Z" fill="#3a1606" />
            <path d="M 124 128 C 128 122 142 122 150 127 C 144 134 130 134 124 128 Z" fill="#ff7a6b" />
            <path d="M 116 106 C 128 113 142 115 155 112 L 155 116 C 142 119 128 117 117 111 Z M 124 131 C 130 134 140 134 148 131 L 147 128 C 140 130 130 130 124 128 Z" fill="#fff" />
            <path d="M 114 104 C 126 112 142 114 156 110 C 158 124 148 136 134 136 C 122 136 112 124 114 104 Z" {...l} strokeWidth={3} />
            <g fill="none" stroke={INK} strokeWidth={4.5}>
              <circle cx="177" cy="96" r="5" /><circle cx="185" cy="91" r="6.5" /><circle cx="193" cy="96" r="4.5" /><circle cx="186" cy="100" r="4.5" />
              <circle cx="178" cy="76" r="4" /><circle cx="185" cy="71" r="5.5" /><circle cx="192" cy="75" r="4" />
            </g>
            <g fill="#fff">
              <circle cx="177" cy="96" r="5" /><circle cx="185" cy="91" r="6.5" /><circle cx="193" cy="96" r="4.5" /><circle cx="186" cy="100" r="4.5" />
              <circle cx="178" cy="76" r="4" /><circle cx="185" cy="71" r="5.5" /><circle cx="192" cy="75" r="4" />
            </g>
            <path d="M 166 92 L 171 94 M 166 84 L 172 80" {...l} />
          </g>
        ) : null}
        {mood === "hurt" ? (
          <g>
            <path d="M 116 112 C 124 108 130 110 136 108 C 142 106 148 108 152 111 C 152 116 151 119 149 121 C 142 118 136 121 130 119 C 124 118 120 121 117 121 C 115 118 115 115 116 112 Z" {...l} fill="#fff" />
            <path d="M 116 116 C 124 114 130 116 136 114 C 142 112 147 114 151 116 M 124 110 L 124 120 M 131 109 L 131 119 M 138 108 L 138 118 M 145 109 L 145 119" {...l} strokeWidth={1.5} />
            <path d="M 58 46 C 52 56 50 62 54 66 C 58 69 64 66 62 58 C 61 54 60 50 58 46 Z" {...l} fill="#bfe9ff" />
          </g>
        ) : null}
        {mood === "ko" ? (
          <g>
            <path d="M 120 110 C 130 114 140 114 148 112" {...l} strokeWidth={3} />
            <path d="M 128 112 C 128 122 132 128 138 128 C 144 128 146 122 144 113 Z" {...l} fill="#ff7a6b" />
            <Star x={70} y={22} r={8} />
            <Star x={102} y={11} r={9} />
            <Star x={134} y={13} r={8} />
          </g>
        ) : null}
        {mood === "happy" ? (
          <g>
            <path d="M 116 106 C 128 114 140 116 150 114 C 146 124 136 128 128 126 C 120 124 116 116 116 106 Z" {...l} fill="#fff" />
          </g>
        ) : null}
        <circle cx="155" cy="104" r="7" fill="none" stroke={INK} strokeWidth={7} />
        <circle cx="155" cy="104" r="7" fill="none" stroke={SPARKY} strokeWidth={3} />
        <path d="M 150 96 C 152 94 158 94 160 96 L 158 99 L 152 99 Z" fill={SNOUT.base} />
      </g>
    </svg>
  );
}

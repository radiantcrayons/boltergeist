import { INK, MINT, SPARKY, type ArtProps } from "./types";

const GREY = { base: "#b9bec6", shade: "#8e949c", light: "#e4e8ec" };
const HORN = { base: "#1d232b", light: "#4a5663" };
const MOUTH = "#7a1630";
const TONGUE = "#ff7a98";
const HT = "translate(138 104) scale(1.1) translate(-140 -96)";
const LN = { stroke: INK, strokeLinejoin: "round" as const, strokeLinecap: "round" as const };

function Part({ d, fill = MINT.base, sh, shade = MINT.shade, w = 4 }: { d: string; fill?: string; sh?: string; shade?: string; w?: number }) {
  return (
    <>
      <path d={d} fill={fill} />
      {sh && <path d={sh} fill={shade} />}
      <path d={d} fill="none" {...LN} strokeWidth={w} />
    </>
  );
}

function Ln({ d, w = 2.2, c = INK }: { d: string; w?: number; c?: string }) {
  return <path d={d} fill="none" {...LN} stroke={c} strokeWidth={w} />;
}

function Fist({ x, y, r = 0 }: { x: number; y: number; r?: number }) {
  return (
    <g transform={`translate(${x} ${y}) rotate(${r})`}>
      <Part
        d="M-14 -1C-14 -10 -7 -14 1 -14C9 -14 14 -9 14 -1C14 8 8 13 0 13C-8 13 -14 8 -14 -1Z"
        sh="M14 -1C14 8 8 13 0 13C-6 13 -11 10 -13 5C-4 9 7 6 10 -3C11 -7 11 -10 10 -11C13 -8 14 -5 14 -1Z"
      />
      <Ln d="M4 -13.5C7 -11 8 -7 7 -3M9 -11C12 -8 12 -4 11 0M1 -7C4 -5 5 -1 4 2" w={2} />
      <path d="M-11 1C-7 -2 2 -1 6 3C7 7 4 10 -1 10C-6 10 -10 7 -11 1Z" fill={MINT.base} {...LN} strokeWidth={2.2} />
      <Ln d="M-8 -9C-6 -11.5 -2 -12.5 1 -12.5" w={2.6} c={MINT.light} />
    </g>
  );
}

function Foot({ x }: { x: number }) {
  return (
    <g transform={`translate(${x} 0)`}>
      <path d="M4 224C-1 223 -5 226 -6 230C-2 230 1 229 4 228Z" fill={INK} {...LN} strokeWidth={1.5} />
      <Part
        d="M4 218C-2 221 -3 229 1 232L26 232C30 233 33 232 33 229C37 231 41 229 40 225C44 224 45 219 41 217C36 213 26 214 16 215C10 215 7 216 4 218Z"
        sh="M-1 228C8 229 18 229 30 227C33 228 33 229 33 229C37 231 41 229 40 225C41 227 39 229 36 229C34 233 30 233 26 232L1 232C0 231 -1 230 -1 228Z"
      />
      <Ln d="M33 229C31 227 29 226 27 226M40 225C38 223 36 222 33 222" w={1.8} />
      <Ln d="M10 219C16 217 24 216 30 216" w={2.2} c={MINT.light} />
      <g fill={INK} {...LN} strokeWidth={1.5}>
        <path d="M29 228.5C34 227 38 229.5 39 233C35 233 32 233 29 232.5Z" />
        <path d="M37 224.5C42 223.5 46 227 47 231.5C43 231 40 229.5 37 229Z" />
        <path d="M40 218C45 217 49 220 50 224.5C46 224 43 223.5 40 223Z" />
      </g>
      <Ln d="M32 229.6C34.5 229.2 36.3 230.2 37.2 231.6M39.6 225.6C42.2 225.4 44 226.8 45 228.6M42.4 219.2C45 219 46.8 220.2 47.8 221.8" w={1} c={HORN.light} />
    </g>
  );
}

function Zap({ x, y, r = 0, s = 1 }: { x: number; y: number; r?: number; s?: number }) {
  return <path transform={`translate(${x} ${y}) rotate(${r}) scale(${s})`} d="M-2 -9L5 -9L1 -2L6 -2L-4 10L-1 1L-6 1Z" fill={SPARKY} {...LN} strokeWidth={1.6} />;
}

function Star({ x, y, s = 1, c = SPARKY }: { x: number; y: number; s?: number; c?: string }) {
  return <path transform={`translate(${x} ${y}) scale(${s})`} d="M0 -7C1 -2 2 -1 7 0C2 1 1 2 0 7C-1 2 -2 1 -7 0C-2 -1 -1 -2 0 -7Z" fill={c} {...LN} strokeWidth={1.4} />;
}

const HEAD = "M100 90C92 82 88 66 92 54C96 42 110 34 126 36C136 37 142 42 144 48C152 50 160 52 165 56C170 59 171 66 166 69C158 72 146 73 134 74C126 75 120 77 116 80C110 84 106 88 100 90Z";
const JAW = "M110 74C130 74 150 73 162 71C166 75 164 82 157 86C146 93 124 96 108 92C100 90 98 84 100 78Z";

function Eye({ mood }: { mood: string }) {
  if (mood === "hurt") return <Ln d="M121 53L137 59L121 65" w={3.4} c="#ffffff" />;
  if (mood === "happy") return <Ln d="M120 64C123 54 135 53 139 63" w={3.4} c="#ffffff" />;
  if (mood === "ko") return <Ln d="M130 59C130 57 133 57 133 59.5C133 62 128 63 127 59C126 54 134 52 136 58C138 64 130 67 125 63C120 58 123 50 131 50" w={2.2} c="#ffffff" />;
  const atk = mood === "attack";
  return (
    <>
      <path d="M118 55C125 49 136 50 143 57C143 64 139 69 131 69C123 69 118 64 118 55Z" fill="#ffffff" />
      <ellipse cx={atk ? 133 : 134} cy={60} rx={6.4} ry={7.6} fill={MINT.deep} />
      <ellipse cx={atk ? 133 : 134} cy={62} rx={5} ry={5.4} fill={MINT.shade} />
      <ellipse cx={atk ? 133.5 : 134.6} cy={61} rx={atk ? 2.1 : 2.9} ry={atk ? 3 : 4} fill={INK} />
      <circle cx={131.2} cy={59} r={2} fill="#ffffff" />
      <circle cx={137} cy={65} r={1.1} fill={MINT.light} />
      <path d={atk ? "M112 47C124 45 136 46 143 50C146 54 147 58 146 63C139 55 126 50 112 52Z" : "M112 47C124 45 136 46 143 50C146 54 147 57 146 61C139 56 126 51 112 53Z"} fill={INK} />
    </>
  );
}

export function Bolt({ mood = "ready", className }: ArtProps) {
  const open = mood === "attack" || mood === "happy" || mood === "ko";
  const jaw = mood === "attack" ? 22 : mood === "happy" ? 16 : mood === "ko" ? 10 : mood === "hurt" ? 15 : 0;
  const a = (jaw * Math.PI) / 180;
  const fx = (108 + 54 * Math.cos(a) + 9 * Math.sin(a)).toFixed(1);
  const fy = (80 + 54 * Math.sin(a) - 9 * Math.cos(a)).toFixed(1);
  return (
    <svg viewBox="0 0 200 240" className={className} aria-hidden="true">
      <Part
        d="M78 166C72 160 66 155 60 148C60 157 61 164 63 172ZM58 177C51 173 44 168 38 162C39 171 41 179 45 186ZM41 192C33 190 25 187 17 182C20 190 24 197 30 203ZM25 204C18 202 11 199 4 194C7 201 10 205 14 208Z"
        sh="M60 148C60 157 61 164 63 172L70 168ZM38 162C39 171 41 179 45 186L51 181ZM17 182C20 190 24 197 30 203L35 197ZM4 194C7 201 10 205 14 208L19 205Z"
        w={3}
      />
      <Part
        d="M88 160C68 166 50 178 38 194C30 204 20 208 8 204C12 216 30 222 46 216C62 210 78 200 92 190Z"
        sh="M8 204C12 216 30 222 46 216C62 210 78 200 92 190L90 182C76 194 60 204 44 208C30 212 18 210 8 204Z"
      />

      <g transform={HT}>
      <Part
        d="M104 40C94 37 82 36 70 38C80 42 86 46 90 50C82 52 72 55 62 59C72 62 80 64 88 66C80 70 72 75 64 82C74 83 82 82 90 81C86 86 82 92 76 98C86 98 96 94 102 90Z"
        sh="M62 59C72 62 80 64 88 66C80 70 72 75 64 82C74 83 82 82 90 81C86 86 82 92 76 98C86 98 96 94 102 90L94 60Z"
      />
      </g>

      <Part d="M146 104C158 100 170 110 174 124C177 134 172 142 164 142C156 140 150 132 144 122Z" sh="M174 124C177 134 172 142 164 142C158 141 154 137 151 132C160 134 168 132 174 124Z" />
      <Part
        d="M158 136C164 144 178 142 182 132C185 122 186 114 184 104L168 104C168 114 166 122 158 128Z"
        sh="M184 104C186 114 185 122 182 132C179 139 172 142 166 141C174 134 177 122 177 104Z"
      />
      <Fist x={177} y={95} r={-8} />

      <Part
        d="M112 160L140 150C150 162 158 176 162 190C165 198 166 204 165 210L140 210C140 202 136 194 130 188C124 182 116 176 112 170Z"
        fill={GREY.base}
        shade={GREY.shade}
        sh="M140 150C150 162 158 176 162 190C165 198 166 204 165 210L155 210C155 198 151 184 141 166Z"
      />
      <Part
        d="M82 150C76 162 68 174 64 186C60 196 58 204 60 210L90 210C90 202 94 194 100 188C108 182 118 176 122 170C126 166 132 158 134 150Z"
        fill={GREY.base}
        shade={GREY.shade}
        sh="M134 150C132 158 126 166 122 170C118 176 108 182 100 188C94 194 90 202 90 210L82 210C82 200 88 192 98 186C110 180 120 172 124 156Z"
      />
      <Ln d="M97 189C92 189 88 191 86 195M114 172C108 176 102 178 96 178M66 203C70 201 76 201 80 204M72 196C77 194 83 194 87 197M76 168C74 176 72 182 70 186M131 186C135 186 139 188 141 192M144 201C148 199 154 199 158 202M152 172C154 178 156 184 156 188" w={2} />

      <Part d="M136 208C142 206 158 206 165 208L166 220C158 222 142 222 135 220Z" fill={GREY.base} shade={GREY.shade} w={3} sh="M166 220C158 222 142 222 135 220L135 216C142 218 158 218 166 216Z" />
      <Ln d="M141 209L141 220M147 208.5L147 221M153 208.5L153 221M159 209L159 220" w={1.4} />
      <Foot x={138} />
      <Part d="M58 208C64 206 80 206 90 208L91 220C82 222 64 222 57 220Z" fill={GREY.base} shade={GREY.shade} w={3} sh="M91 220C82 222 64 222 57 220L57 216C64 218 82 218 91 216Z" />
      <Ln d="M63 209L63 220M69 208.5L69 221M75 208.5L75 221M81 208.5L81 221M86 209L86 220" w={1.4} />
      <Foot x={60} />

      <Part
        d="M100 88C96 92 88 96 76 98C68 100 62 108 64 116C66 126 74 134 82 142L83 149L137 149L136 144C140 136 146 128 150 120C154 114 154 104 150 98C146 94 138 92 132 90L128 86Z"
        sh="M150 98C154 104 154 114 150 120C146 128 140 136 136 144L137 149L128 149C128 146 130 138 134 130C140 122 146 112 142 102ZM78 116C92 124 108 126 124 122C112 130 92 130 78 120Z"
      />
      <Ln d="M124 98C122 106 122 113 124 120M78 114C92 124 108 126 124 121C132 124 144 122 152 114M123 126L123 146M107 129C113 131 119 131 123 130C128 131 133 130 138 128M107 138C113 140 119 140 123 139C128 140 133 139 137 137M100 122C100 132 102 140 104 146" />
      <Ln d="M108 98C114 100 120 100 125 99M131 98C135 100 139 101 143 100" w={2} />
      <Ln d="M90 106C96 102 106 102 112 105" w={3} c={MINT.light} />

      <Part d="M81 142C99 146 121 147 141 142L142 153C121 158 99 157 82 153Z" fill={GREY.base} shade={GREY.shade} sh="M142 153C121 158 99 157 82 153L82 150C99 154 121 155 142 149Z" />
      <Ln d="M113 154C112 158 111 161 110 164M119 154C120 158 120 161 121 164" w={2} />
      <circle cx={110} cy={165} r={1.6} fill={GREY.light} stroke={INK} strokeWidth={1.4} />
      <circle cx={121} cy={165} r={1.6} fill={GREY.light} stroke={INK} strokeWidth={1.4} />

      <g transform={HT}>
      <path d="M118 44C114 36 110 28 102 20C114 23 124 30 130 40Z" fill={HORN.base} {...LN} strokeWidth={3.4} />
      <Ln d="M107 24C114 28 120 33 125 39" w={2.2} c={HORN.light} />
      <path d="M98 50C92 38 84 26 72 17C90 20 106 30 116 44Z" fill={HORN.base} {...LN} strokeWidth={3.6} />
      <Ln d="M80 21C92 26 102 34 109 42" w={2.6} c={HORN.light} />
      {jaw > 0 && <path d={`M104 82L168 64L${fx} ${fy}Z`} fill={mood === "hurt" ? "#ffffff" : MOUTH} {...LN} strokeWidth={3} />}
      {mood === "hurt" && <Ln d={`M112 79L${fx} 77M132 66L132 88M140 66L140 88M148 66L148 88M156 66L156 88`} w={1.6} />}
      <g transform={`rotate(${jaw} 108 80)`}>
        {open && <path d="M114 76C122 66 140 63 152 68C156 70 158 72 160 74Z" fill={TONGUE} {...LN} strokeWidth={2} />}
        {open && <Ln d="M134 68C138 70 140 72 141 75" w={1.6} />}
        <path d={JAW} fill={MINT.base} />
        <path d="M163 75L154 76L150 84L145 77L137 78L132 87L126 79L116 80L104 79C100 86 102 90 108 92C124 96 146 93 157 86C162 83 164 79 163 75Z" fill={INK} />
        <path d={JAW} fill="none" {...LN} strokeWidth={4} />
        {(mood === "attack" || mood === "happy") && <path d="M146 73.5L152 73L149.5 67Z" fill="#ffffff" {...LN} strokeWidth={1.4} />}
      </g>
      <path d={HEAD} fill={MINT.base} />
      <path d="M166 69C158 72 146 73 134 74L132 69C146 69 156 66 162 62C165 61 167 60 168 59C170 62 169 67 166 69Z" fill={MINT.shade} />
      <path d="M100 44L116 37C120 36 124 35 126 36C127 42 131 46 137 48C143 50 147 54 148 58C145 64 141 69 133 71C126 72 120 71 116 73C113 75 112 79 114 84L110 87C103 78 99 62 100 44Z" fill={INK} />
      <Eye mood={mood} />
      <path d={HEAD} fill="none" {...LN} strokeWidth={4} />
      <Ln d="M159 58C161 59 162 61 162 62" w={2.2} />
      <Ln d="M146 52C152 53 157 55 160 57M104 42C110 39 116 38 120 38" w={2.4} c={MINT.light} />
      {mood !== "hurt" && <path d="M149 72.4L155 71.8L152.4 79Z" fill="#ffffff" {...LN} strokeWidth={1.4} />}
      {mood === "ready" && <Ln d="M136 73C132 74 129 73 127 70" w={2} />}
      {mood === "hurt" && <path d="M156 28C160 34 162 38 159 41C156 44 151 42 152 37C153 34 155 31 156 28Z" fill="#bfe9ff" {...LN} strokeWidth={1.8} />}
      </g>

      <Part d="M78 97C62 93 50 105 52 119C53 129 58 138 66 143C74 147 84 143 86 135C88 126 86 116 84 108C83 102 82 99 78 97Z" sh="M84 108C86 116 88 126 86 135C84 143 74 147 66 143C64 142 62 140 61 138C72 140 78 134 80 124C81 118 81 112 84 108Z" />
      <Ln d="M58 106C61 100 66 98 72 98" w={3} c={MINT.light} />
      <Ln d="M62 116C66 122 72 124 78 122" w={2} />
      <Part d="M64 138C64 150 80 154 90 146C95 140 100 132 105 123L94 112C88 116 82 120 76 123C68 127 64 132 64 138Z" sh="M64 138C64 150 80 154 90 146C95 140 100 132 105 123L101 119C96 128 90 136 82 141C76 143 70 143 64 140Z" />
      <Ln d="M74 128C80 126 85 122 89 119" w={2} c={MINT.light} />
      <Fist x={104} y={110} r={-20} />

      {mood === "attack" && (
        <>
          <Zap x={187} y={73} r={20} />
          <Zap x={193} y={98} r={-8} s={0.75} />
          <Zap x={187} y={121} r={-30} s={0.9} />
          <Zap x={84} y={100} r={-30} s={0.9} />
          <Zap x={122} y={128} r={30} s={0.85} />
        </>
      )}
      {mood === "ko" && (
        <>
          <Star x={130} y={24} s={0.9} />
          <Star x={148} y={32} s={0.7} />
          <Star x={114} y={26} s={0.6} />
        </>
      )}
      {mood === "happy" && (
        <>
          <Star x={156} y={36} s={0.8} c="#ffffff" />
          <Star x={174} y={50} s={0.6} />
        </>
      )}
    </svg>
  );
}

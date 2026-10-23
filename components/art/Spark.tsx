import { INK, MINT, SPARKY, type ArtProps } from "./types";

const HORN = { base: "#1d232b", light: "#4a5663" };
const MOUTH = "#7a1630";
const TONGUE = "#ff7a98";
const BLUSH = "#ff9cbc";
const LN = { stroke: INK, strokeLinejoin: "round" as const, strokeLinecap: "round" as const };

function Part({ d, fill = MINT.base, sh, shade = MINT.shade, w = 3.6 }: { d: string; fill?: string; sh?: string; shade?: string; w?: number }) {
  return (
    <>
      <path d={d} fill={fill} />
      {sh && <path d={sh} fill={shade} />}
      <path d={d} fill="none" {...LN} strokeWidth={w} />
    </>
  );
}

function Ln({ d, w = 2, c = INK }: { d: string; w?: number; c?: string }) {
  return <path d={d} fill="none" {...LN} stroke={c} strokeWidth={w} />;
}

function Zap({ x, y, r = 0, s = 1 }: { x: number; y: number; r?: number; s?: number }) {
  return <path transform={`translate(${x} ${y}) rotate(${r}) scale(${s})`} d="M-2 -9L5 -9L1 -2L6 -2L-4 10L-1 1L-6 1Z" fill={SPARKY} {...LN} strokeWidth={1.6} />;
}

function Star({ x, y, s = 1, c = SPARKY }: { x: number; y: number; s?: number; c?: string }) {
  return <path transform={`translate(${x} ${y}) scale(${s})`} d="M0 -7C1 -2 2 -1 7 0C2 1 1 2 0 7C-1 2 -2 1 -7 0C-2 -1 -1 -2 0 -7Z" fill={c} {...LN} strokeWidth={1.4} />;
}

function Eye({ x, y, rx, ry, mood, far }: { x: number; y: number; rx: number; ry: number; mood: string; far?: boolean }) {
  const k = far ? -1 : 1;
  if (mood === "hurt") return <Ln d={`M${x - 5 * k} ${y - 5}L${x + 4 * k} ${y}L${x - 5 * k} ${y + 5}`} w={3} c="#ffffff" />;
  if (mood === "happy") return <Ln d={`M${x - rx + 1} ${y + 3}C${x - rx + 3} ${y - 5} ${x + rx - 3} ${y - 5} ${x + rx - 1} ${y + 3}`} w={3} c="#ffffff" />;
  if (mood === "ko")
    return <Ln d={`M${x} ${y}C${x} ${y - 2} ${x + 2.5} ${y - 2} ${x + 2.5} ${y + 0.5}C${x + 2.5} ${y + 3} ${x - 3} ${y + 4} ${x - 3.5} ${y}C${x - 4} ${y - 5} ${x + 5} ${y - 6} ${x + 5.5} ${y}C${x + 6} ${y + 6} ${x - 2} ${y + 8} ${x - 6} ${y + 3}`} w={2} c="#ffffff" />;
  const atk = mood === "attack";
  const ix = x + 1.6;
  return (
    <>
      <ellipse cx={x} cy={y} rx={rx} ry={ry} fill="#ffffff" />
      <ellipse cx={ix} cy={y + 1} rx={rx * 0.8} ry={ry * 0.86} fill={MINT.deep} />
      <ellipse cx={ix} cy={y + 3} rx={rx * 0.62} ry={ry * 0.56} fill={MINT.shade} />
      <ellipse cx={ix + 0.4} cy={y + 1.4} rx={atk ? rx * 0.24 : rx * 0.36} ry={atk ? ry * 0.3 : ry * 0.42} fill={INK} />
      <circle cx={x - rx * 0.3} cy={y - ry * 0.38} r={rx * 0.32} fill="#ffffff" />
      <circle cx={ix + rx * 0.36} cy={y + ry * 0.42} r={rx * 0.16} fill="#ffffff" />
      <circle cx={x - rx * 0.36} cy={y + ry * 0.36} r={rx * 0.1} fill={MINT.light} />
      <path
        d={
          far
            ? `M${x - rx - 1} ${y - ry + (atk ? 10 : 8)}C${x - rx} ${y - ry - 4} ${x + rx} ${y - ry - 4} ${x + rx + 1} ${y - ry + 3}C${x + 2} ${y - ry + 4} ${x - 2} ${y - ry + (atk ? 9 : 7)} ${x - rx - 1} ${y - ry + (atk ? 10 : 8)}Z`
            : `M${x - rx - 1} ${y - ry + 3}C${x - rx} ${y - ry - 4} ${x + rx} ${y - ry - 4} ${x + rx + 1} ${y - ry + (atk ? 10 : 8)}C${x + 2} ${y - ry + (atk ? 9 : 7)} ${x - 2} ${y - ry + 4} ${x - rx - 1} ${y - ry + 3}Z`
        }
        fill={INK}
      />
    </>
  );
}

const HEAD = "M78 180C68 168 70 152 84 145C98 139 118 139 130 147C135 151 138 156 139 160C145 162 149 168 147 174C146 180 141 184 133 186C121 192 94 194 82 186C80 184 79 182 78 180Z";

export function Spark({ mood = "ready", className }: ArtProps) {
  const atk = mood === "attack";
  return (
    <svg viewBox="0 0 200 240" className={className} aria-hidden="true">
      <Part d="M84 216C72 219 60 215 53 207C49 202 48 197 50 192C52 190 55 190 57 193C60 198 66 201 72 202C77 203 81 203 86 202Z" sh="M84 216C72 219 60 215 53 207C51 204 49 201 49 198C57 206 70 211 84 209Z" />
      <path transform="translate(47.4 184.1) rotate(-25) scale(1.3)" d="M-3 8L-6 -1L-1 -1L-5 -14L7 1L2 1L5 8Z" fill={SPARKY} {...LN} strokeWidth={1.9} />

      <Part
        d="M84 150C76 147 68 148 60 152C67 155 73 158 79 161C73 163 66 166 60 171C67 173 73 173 79 172C75 176 72 180 70 185C76 185 82 183 86 180Z"
        sh="M60 171C67 173 73 173 79 172C75 176 72 180 70 185C76 185 82 183 86 180L80 166Z"
        w={3}
      />

      <Part d="M114 192C120 186 130 186 134 190L136 198C128 202 120 201 115 198Z" sh="M136 198C128 202 120 201 115 198L116 195C122 197 130 197 136 194Z" />
      <Part d="M132 184C138 182 144 185 144 191C144 196 140 199 135 199C130 199 127 195 128 190C128 187 130 185 132 184Z" sh="M144 191C144 196 140 199 135 199C132 199 130 197 129 195C133 196 140 195 144 191Z" w={3} />
      <Ln d="M138 184.5C140.5 186.5 140.5 190 139 192.5" w={1.6} />

      <Part d="M106 222C102 226 103 232 108 232L124 232C130 232 131 226 127 222C122 219 112 219 106 222Z" sh="M108 232L124 232C130 232 131 226 127 222C126 225 122 228 116 228C112 228 109 229 108 232Z" w={3.2} />
      <path d="M128 225C131 225 133 227 133 230L128 229ZM126 229C129 229 131 230 131 233L125 232Z" fill={INK} {...LN} strokeWidth={1.2} />

      <Part
        d="M82 184C72 192 71 212 79 221C87 228 112 229 120 221C128 213 128 195 118 184Z"
        sh="M120 221C128 213 128 195 118 184L114 186C121 197 121 213 113 220C107 225 96 226 86 225C96 229 113 228 120 221Z"
      />
      <path d="M104 194C114 194 120 204 119 213C118 220 112 224 105 224C98 224 95 216 96 207C97 199 100 194 104 194Z" fill={MINT.light} {...LN} strokeWidth={2} />
      <Ln d="M97 205C104 203 112 203 119 205M96 214C103 212 112 212 119 214" w={1.6} />

      <Part d="M80 222C76 226 77 232 82 232L98 232C104 232 105 226 101 222C96 219 86 219 80 222Z" sh="M82 232L98 232C104 232 105 226 101 222C100 225 96 228 90 228C86 228 83 229 82 232Z" w={3.2} />
      <path d="M102 225C105 225 107 227 107 230L102 229ZM100 229C103 229 105 230 105 233L99 232Z" fill={INK} {...LN} strokeWidth={1.2} />
      <Ln d="M84 223C88 221 93 221 96 222" w={1.8} c={MINT.light} />

      <path d="M87 148C86 142 88 137 92 135C96 137 99 141 100 146Z" fill={HORN.base} {...LN} strokeWidth={2.6} />
      <path d="M108 145C108 140 110 136 114 134.5C117 137 119 141 119 146Z" fill={HORN.base} {...LN} strokeWidth={2.6} />
      <Ln d="M91 138C93 140 94 142 95 144M113 137C115 139 116 141 116.5 143" w={1.2} c={HORN.light} />
      <path d={HEAD} fill={MINT.base} />
      <path d="M147 174C146 180 141 184 133 186C121 192 94 194 82 186C80 184 79 182 78 180C92 186 116 186 130 181C138 178 144 176 147 170Z" fill={MINT.shade} />
      <path d="M80 166C82 159 85 156 90 154L103 146L108 153C118 152 130 153 140 158C143 162 142 166 138 168C130 174 118 176 104 176C96 176 89 176 84 177C82 174 80 170 80 166Z" fill={INK} />
      <Eye x={99} y={164} rx={8.6} ry={10} mood={mood} />
      <Eye x={126} y={162} rx={5.6} ry={9} mood={mood} far />
      <path d={HEAD} fill="none" {...LN} strokeWidth={3.6} />
      <Ln d="M86 150C92 146 98 144 102 144" w={2.4} c={MINT.light} />
      <Ln d="M143 165C144 166 144 167 144 168" w={1.8} />
      {mood !== "ko" && mood !== "hurt" && <ellipse cx={94} cy={182} rx={5} ry={2.4} fill={BLUSH} />}

      {mood === "ready" && (
        <>
          <Ln d="M124 180C130 184 137 183 142 178" w={2} />
          <path d="M131 182.2L135 181.6L133.4 186Z" fill="#ffffff" {...LN} strokeWidth={1.2} />
        </>
      )}
      {(atk || mood === "happy") && (
        <>
          <path d={atk ? "M120 176C128 176 138 174 145 171C147 180 142 192 132 192C124 192 119 185 120 176Z" : "M121 178C129 179 139 177 145 173C145 182 140 189 132 189C125 189 121 185 121 178Z"} fill={MOUTH} {...LN} strokeWidth={2.2} />
          <path d={atk ? "M124 188C127 184 135 183 139 187C137 191 128 192 124 188Z" : "M125 186C128 183 135 183 138 185C136 188 128 189 125 186Z"} fill={TONGUE} />
          <path d={atk ? "M130 175.6L135 175L132.8 180Z" : "M131 177.6L135.4 177L133.4 181Z"} fill="#ffffff" {...LN} strokeWidth={1.2} />
        </>
      )}
      {mood === "hurt" && (
        <>
          <path d="M122 177C130 177 138 176 144 174L143 182C136 184 128 185 123 184Z" fill="#ffffff" {...LN} strokeWidth={2} />
          <Ln d="M123 180.6C130 180.6 137 179.8 143.6 178M129 177L129 184.6M136 176.4L136 183.6" w={1.3} />
          <path d="M148 146C152 151 153 154 151 157C149 159 145 158 145 155C145 152 147 149 148 146Z" fill="#bfe9ff" {...LN} strokeWidth={1.6} />
        </>
      )}
      {mood === "ko" && (
        <>
          <path d="M126 180C129 177 134 177 138 179C140 183 137 187 132 187C128 187 125 184 126 180Z" fill={MOUTH} {...LN} strokeWidth={2} />
          <Star x={100} y={132} s={0.7} />
          <Star x={118} y={128} s={0.55} />
          <Star x={84} y={134} s={0.5} />
        </>
      )}

      <Part d="M80 197C84 190 96 189 104 192L106 201C98 205 89 205 84 203C80 202 79 200 80 197Z" sh="M106 201C98 205 89 205 84 203L84 200C90 202 98 202 105 198Z" />
      <Ln d="M84 194C88 192 92 191 96 191" w={1.8} c={MINT.light} />
      <Part d="M105 187C111 185 118 187 119 193C120 199 115 203 109 203C103 203 100 198 101 193C101 190 103 188 105 187Z" sh="M119 193C120 199 115 203 109 203C106 203 103 201 102 198C107 200 114 199 119 193Z" w={3} />
      <Ln d="M112 187.5C114.5 189.5 114.5 193 113 195.5M107 190C109 191 110 193 109.5 195" w={1.6} />

      {mood === "happy" && (
        <>
          <Star x={156} y={146} s={0.7} c="#ffffff" />
          <Star x={152} y={164} s={0.45} />
          <Star x={70} y={140} s={0.6} />
        </>
      )}
      {atk ? (
        <>
          <Zap x={60} y={162} r={-20} s={0.9} />
          <Zap x={154} y={190} r={25} s={0.9} />
          <Zap x={150} y={150} r={15} s={0.75} />
          <Zap x={66} y={222} r={-30} s={0.7} />
          <Zap x={138} y={218} r={30} s={0.6} />
        </>
      ) : (
        mood === "ready" && (
          <>
            <Zap x={150} y={156} r={20} s={0.5} />
            <Zap x={62} y={168} r={-20} s={0.45} />
          </>
        )
      )}
    </svg>
  );
}

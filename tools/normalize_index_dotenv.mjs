import fs from "fs";

const F = "index.js";
const s0 = fs.readFileSync(F, "utf8");

// 1) Quitar TODOS los headers/variantes de dotenv
let s = s0
  // comentarios repetidos “.env (forced + override) …”
  .replace(/^[ \t]*\/\/[^\n]*\.env \(forced \+ override\)[^\n]*\n/gm, "")
  // import dotenv from "dotenv";
  .replace(/^\s*import\s+dotenv\s+from\s+['"]dotenv['"];\s*$/gm, "")
  // import "dotenv/config";
  .replace(/^\s*import\s+['"]dotenv\/config['"];\s*$/gm, "")
  // import { config as _cfg } from "dotenv"; try{_cfg(...)}...
  .replace(/^\s*import\s+{[^}]*config[^}]*}\s+from\s+['"]dotenv['"];.*$/gm, "");

// 2) Insertar UN solo header al principio
const header = `// ── .env (forced + override) ─────────────────────────────────────────────
import dotenv from "dotenv";
dotenv.config({ path: process.env.DOTENV_CONFIG_PATH || ".env", override: true });
// ─────────────────────────────────────────────────────────────────────────
`;
s = header + s.replace(/^\s+/, "");

// 3) Token: aceptar BOT_TOKEN / TG_BOT_TOKEN / TELEGRAM_BOT_TOKEN
s = s.replace(
  /const\s+TOKEN\s*=\s*process\.env\.TELEGRAM_BOT_TOKEN\s*;/,
  'const TOKEN = process.env.BOT_TOKEN || process.env.TG_BOT_TOKEN || process.env.TELEGRAM_BOT_TOKEN;'
);

// 4) Escribir archivo y mostrar diff mínimo
fs.writeFileSync(F, s, "utf8");
console.log("✔ index.js normalizado: dotenv x1 + token múltiple");

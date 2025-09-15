import fs from "fs";

const F = "index.js";
let s = fs.readFileSync(F, "utf8");

// 1) borrar TODO lo relacionado a dotenv previo
s = s
  .replace(/^\s*import\s+dotenv\s+from\s+['"]dotenv['"];\s*$/gm, "")
  .replace(/^\s*import\s+['"]dotenv\/config['"];\s*$/gm, "")
  .replace(/^\s*import\s+{[^}]*config[^}]*}\s+from\s+['"]dotenv['"];.*$/gm, "")
  .replace(/^\s*dotenv\.config\([^)]*\);\s*$/gm, "");

// 2) insertar UN header al tope
const header = `// ── .env (forced + override) ─────────────────────────────────────────────
import dotenv from "dotenv";
dotenv.config({ path: process.env.DOTENV_CONFIG_PATH || ".env", override: true });
// ─────────────────────────────────────────────────────────────────────────
`;
s = header + s.replace(/^\s+/, "");

// 3) token: BOT_TOKEN || TG_BOT_TOKEN || TELEGRAM_BOT_TOKEN
s = s.replace(
  /const\s+TOKEN\s*=\s*process\.env\.[A-Z_]+;/,
  'const TOKEN = process.env.BOT_TOKEN || process.env.TG_BOT_TOKEN || process.env.TELEGRAM_BOT_TOKEN;'
);

// 4) consolidar dobles saltos locos
s = s.replace(/\n{3,}/g, "\n\n");

fs.writeFileSync(F, s, "utf8");
console.log("✔ index.js: dotenv unificado + token múltiple.");

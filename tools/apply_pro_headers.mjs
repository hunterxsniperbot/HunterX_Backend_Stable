import fs from "fs";

// Plantilla de cabecera con variables reemplazables
function header({title, id, purpose, inputs, outputs, deps, env, invariants}) {
  return `/* 
 * HUNTER X — ${title} — ${id}
 * Purpose: ${purpose}
 * Inputs:  ${inputs}
 * Outputs: ${outputs}
 * Deps:    ${deps}
 * ENV:     ${env}
 * Invariants: ${invariants}
 * Notes:   Auto-documentado; mantener esta cabecera al día.
 */\n`;
}

// Archivos objetivo + metadatos
const files = [
  {
    path: "src/commands/control.js",
    meta: {
      title: "/control | Panel visual",
      id: "HX-C01 v2025-09-14",
      purpose: "Dashboard del trader: capital libre/invertido/total, PnL live y PnL del día; accesos rápidos.",
      inputs: "API /api/wallet, Supabase (sumClosedPnL), env modo (HX_DEFAULT_MODE)",
      outputs: "Mensaje Telegram (Markdown) con botones; ediciones anti-flicker",
      deps: "services/supa.js, boot/api.js",
      env: "CONTROL_REFRESH_MS, SHEETS_TAB_MODE, GOOGLE_SHEETS_ID, HX_TZ",
      invariants: "No edita si texto igual; si API falla, muestra fallback con valores mínimos"
    }
  },
  {
    path: "src/commands/salud.js",
    meta: {
      title: "/salud | Conexiones activas",
      id: "HX-A02 v2025-09-14",
      purpose: "Resumen de proveedores/infra con score, auto-refresh y toggles.",
      inputs: "API /api/salud (si disponible), HEAD/GET locales como fallback",
      outputs: "Mensaje Telegram (Markdown) con score y notas por proveedor",
      deps: "boot/health_checks.js (formatSummary) opcional",
      env: "SALUD_REFRESH_MS, API_PORT, HX_DEFAULT_MODE",
      invariants: "Nunca crashea; ignora 'message is not modified'; no penaliza proveedores deshabilitados"
    }
  },
  {
    path: "src/commands/wallet.js",
    meta: {
      title: "/wallet | Posiciones abiertas",
      id: "HX-W01 v2025-09-14",
      purpose: "Lista abiertos (remanente), totales y (opcional) PnL live por posición.",
      inputs: "API /api/wallet",
      outputs: "Mensaje Telegram HTML/Markdown con cards y links a exploradores",
      deps: "services/trading.js (curPx opcional), boot/api.js",
      env: "WALLET_SHOW_LIVE, HX_TZ",
      invariants: "HTML seguro; si no hay curPx, no muestra live PnL"
    }
  },
  {
    path: "src/commands/registro.js",
    meta: {
      title: "/registro | Posiciones cerradas",
      id: "HX-R01 v2025-09-14",
      purpose: "Listado de cerradas con filtros (hoy/semana/mes/fecha) + resumen del día y link a Sheets.",
      inputs: "Supabase (listClosedTrades, sumClosedPnL)",
      outputs: "Mensaje Telegram HTML con anchors (DexScreener/Solscan/Sheets)",
      deps: "services/supa.js, services/sheets.js (opcional)",
      env: "SHEETS_TAB_MODE, GOOGLE_SHEETS_ID, HX_TZ",
      invariants: "Fechas en es-AR; tokens render sin romper si faltan campos"
    }
  },
  {
    path: "src/bot/inlinePnlSell.js",
    meta: {
      title: "inlinePnlSell | PnL/Sell callbacks",
      id: "HX-B01 v2025-09-14",
      purpose: "Botones 25/50/75/100% + recibos; guarda cierre en Supabase y (opcional) Sheets.",
      inputs: "callback_query, estado de trade (uid, entry, rem%), env de modo",
      outputs: "Edición de tarjeta + recibo; registro en Supabase/Sheets",
      deps: "services/supa.js, services/sheets.js",
      env: "HX_RECEIPT_MODE, HX_TZ",
      invariants: "Nunca hace 'return' top-level; evita duplicar funciones; clamp de remanentes"
    }
  },
  {
    path: "src/services/supa.js",
    meta: {
      title: "services/supa | Persistencia Supabase",
      id: "HX-S01 v2025-09-14",
      purpose: "Insert de cierres, listado de trades, sumas de PnL y utilidades de tabla por modo.",
      inputs: "fetch REST Supabase",
      outputs: "Funciones ESM reusables",
      deps: "ENV Supabase, fetch",
      env: "SUPABASE_URL, SUPABASE_SERVICE_ROLE, SUPABASE_TABLE_DEMO, SUPABASE_TABLE_REAL",
      invariants: "Siempre chequear r.ok; lanzar error con status para debugging"
    }
  },
  {
    path: "src/services/sheets.js",
    meta: {
      title: "services/sheets | Google Sheets",
      id: "HX-S02 v2025-09-14",
      purpose: "Append de filas y autocreación de pestaña mensual con encabezados canónicos.",
      inputs: "fila normalizada",
      outputs: "resultado de append (ok/tab/updates)",
      deps: "googleapis (JWT) o fetch a Sheets API",
      env: "GOOGLE_APPLICATION_CREDENTIALS, GOOGLE_SHEETS_ID, SHEETS_TAB_MODE",
      invariants: "Nunca falla duro si no hay red: retorna {ok:false,error}"
    }
  },
  {
    path: "src/boot/api.js",
    meta: {
      title: "boot/api | API local HTTP",
      id: "HX-BT01 v2025-09-14",
      purpose: "Expone /api/salud, /api/wallet, /api/sell para coordinar UI y worker.",
      inputs: "peticiones HTTP",
      outputs: "JSON estable para UI",
      deps: "http/undici, servicios internos",
      env: "API_PORT",
      invariants: "Timeouts cortos; no bloquear el loop de Telegram"
    }
  }
];

let ok=0, skip=0;
for (const f of files) {
  try{
    if (!fs.existsSync(f.path)) { skip++; continue; }
    const s = fs.readFileSync(f.path, "utf8");
    if (/HUNTER X — /.test(s.split("\n",5).join("\n"))) { skip++; continue; }
    const h = header(f.meta);
    fs.writeFileSync(f.path, h + s, "utf8");
    console.log("✓ header →", f.path);
    ok++;
  }catch(e){
    console.error("✗ header", f.path, e.message||e);
  }
}
console.log(`Hecho. Nuevos headers: ${ok}, saltados: ${skip}`);

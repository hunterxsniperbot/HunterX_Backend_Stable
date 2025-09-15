import fs from "fs";
const F = "src/commands/salud.js";
let s = fs.readFileSync(F, "utf8");

// Encontrar sección Helpers genéricos → API-first
const reBlock = /(\/\/\s*─{10,}[\s\S]*?\/\/\s*Helpers\s+gen[ée]ricos[\s\S]*?)(\/\/\s*─{10,}[\s\S]*?\/\/\s*API-first)/m;
if(!reBlock.test(s)){
  console.log("⚠️ No encontré los marcadores de sección. No toco nada.");
  process.exit(0);
}

const header = RegExp.$1.split("\n")[0]; // conserva la línea de separador superior
const before = s.replace(reBlock, "$1"); // para ubicar el offset

// Construir bloque limpio de helpers
const helpers = `
// ─────────────────────────────────────────────────────────────────────────────
// Helpers genéricos
// ─────────────────────────────────────────────────────────────────────────────
function scoreToLight(s){ return s >= 85 ? EMO.ok : s >= 60 ? EMO.warn : EMO.err; }

function tzLabel(){
  try { return process.env.TZ || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; }
  catch { return 'UTC'; }
}

function hash(s){
  let h=0; for (let i=0;i<s.length;i++) { h=((h<<5)-h)+s.charCodeAt(i); h|=0; }
  return String(h);
}

async function fetchJson(url, { timeoutMs=2000, headers={}, method='GET', body=null } = {}) {
  const ac = new AbortController();
  const t = setTimeout(()=>ac.abort('timeout'), timeoutMs);
  try{
    const r = await fetch(url, { method, headers, body, signal: ac.signal });
    let json = null, err = null;
    try { json = await r.json(); } catch(e){ err = String(e?.message||e); }
    return { ok: r.ok, status:r.status, json, error:err };
  } catch(e){
    return { ok:false, status:null, json:null, error:String(e?.message||e) };
  } finally { clearTimeout(t); }
}

function trimForTelegram(text, maxLen = 3800) {
  if (!text || text.length <= maxLen) return text;
  return text.slice(0, maxLen - 20) + '\\n\\n…(recortado)';
}

async function safeEdit(bot, chatId, messageId, text, kb){
  try{
    await bot.editMessageText(text, {
      chat_id: chatId,
      message_id: messageId,
      reply_markup: kb,
      parse_mode: 'Markdown',
      disable_web_page_preview: true
    });
    return true;
  }catch(e1){
    const msg = String(e1?.response?.body?.description || e1?.message || e1);
    if (msg.includes('message is not modified')) return false;
    try{
      await bot.editMessageText(text.replace(/\\*/g,''), {
        chat_id: chatId,
        message_id: messageId,
        reply_markup: kb,
        disable_web_page_preview: true
      });
      return true;
    }catch(e2){
      const msg2 = String(e2?.response?.body?.description || e2?.message || e2);
      if (msg2.includes('message is not modified')) return false;
      return false; // no spameamos el chat; consideramos soft-fail
    }
  }
}

async function safeSend(bot, chatId, text, kb) {
  try {
    const m = await bot.sendMessage(chatId, text, {
      reply_markup: kb,
      parse_mode: 'Markdown',
      disable_web_page_preview: true
    });
    return m?.message_id;
  } catch {
    const m = await bot.sendMessage(chatId, text.replace(/\\*/g,''), {
      reply_markup: kb,
      disable_web_page_preview: true
    });
    return m?.message_id;
  }
}
`;

// Reinyecta: [separador + helpers + separador + 'API-first'...]
s = s.replace(reBlock, (_, _a, apiFirst) => {
  return `${header}\n${helpers}\n${apiFirst}`;
});

// Endurecer el catch de render() para no spamear con alertas suaves
s = s.replace(
  /catch\s*\(\s*e\s*\)\s*{[\s\S]*?}\s*finally/g,
  `catch(e){ console.log("[/salud] soft:", e?.message||e); } finally`
);

fs.writeFileSync(F, s);
console.log("✔ /salud: helpers reconstruidos + safeEdit/safeSend sin flicker.");

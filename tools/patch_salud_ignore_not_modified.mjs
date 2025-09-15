import fs from "fs";
const F = "src/commands/salud.js";
let s = fs.readFileSync(F, "utf8");

/* Reemplaza la función safeEdit por una versión que:
   - Ignora 400 "message is not modified" (no lanza error).
   - Hace fallback a texto plano y también ignora ese mismo 400. */
const reSafeEdit = /async function safeEdit\([\s\S]*?\)\s*{[\s\S]*?}\s*\n/;
const newSafeEdit = `async function safeEdit(bot, chatId, messageId, text, kb){
  try{
    await bot.editMessageText(text, {
      chat_id: chatId,
      message_id: messageId,
      reply_markup: kb,
      parse_mode: "Markdown",
      disable_web_page_preview: true
    });
    return true;
  }catch(e1){
    const msg = String(e1?.response?.body?.description || e1?.message || e1);
    if (msg.includes("message is not modified")) return false; // nada cambió
    try{
      await bot.editMessageText(text.replace(/\\*/g,""), {
        chat_id: chatId,
        message_id: messageId,
        reply_markup: kb,
        disable_web_page_preview: true
      });
      return true;
    }catch(e2){
      const msg2 = String(e2?.response?.body?.description || e2?.message || e2);
      if (msg2.includes("message is not modified")) return false;
      throw e2; // solo si es un error real
    }
  }
}
`;

if (!reSafeEdit.test(s)) {
  console.log("⚠️ No encontré safeEdit(); no aplico reemplazo.");
} else {
  s = s.replace(reSafeEdit, newSafeEdit + "\n");
  console.log("✔ safeEdit() endurecido contra 'message is not modified'.");
}

/* En render(), no mandes el cartel rojo por excepciones suaves:
   Si tenés un catch que hace 'bot.sendMessage(chatId, \"❌ Salud: ...\")'
   lo silencíamos (solo log). */
s = s.replace(
  /catch\s*\(\s*e\s*\)\s*{\s*try\s*{[^}]*bot\.sendMessage\([^}]*\)\s*;\s*}\s*catch\s*{[^}]*}\s*}\s*finally/g,
  'catch(e){ /* silencio errores suaves de edit */ console.log("[salud] soft:", e?.message||e); } finally'
);

fs.writeFileSync(F, s);
console.log("✔ /salud parcheado sin flicker ni alerta roja por 400.");

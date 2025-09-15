import 'dotenv/config';

const TOKEN = process.env.BOT_TOKEN || process.env.TG_BOT_TOKEN;
if (!TOKEN) {
  console.error("Falta BOT_TOKEN en .env");
  process.exit(1);
}
const API = (m) => `https://api.telegram.org/bot${TOKEN}/${m}`;

/* === Menú literal pedido ===
Conexiones activas /salud
Panel visual /control
Estado del sistema /estado
Activar sniper automático /autosniper
Modo (Trading real) /real
Modo (simulación) /demo
Detener sniper /stop
Ver posiciones abiertas /wallet
Ver posiciones cerradas /registro
Configurar sniper /ajustes
Ayuda /mensaje
*/

const commands = [
  { command: "salud",      description: "Conexiones activas" },
  { command: "control",    description: "Panel visual" },
  { command: "estado",     description: "Estado del sistema" },
  { command: "autosniper", description: "Activar sniper automático" },
  { command: "real",       description: "Modo (Trading real)" },
  { command: "demo",       description: "Modo (simulación)" },
  { command: "stop",       description: "Detener sniper" },
  { command: "wallet",     description: "Ver posiciones abiertas" },
  { command: "registro",   description: "Ver posiciones cerradas" },
  { command: "ajustes",    description: "Configurar sniper" },
  { command: "mensaje",    description: "Ayuda" }
];

async function push(scope){
  const r = await fetch(API("setMyCommands"), {
    method: "POST",
    headers: {"Content-Type":"application/json"},
    body: JSON.stringify({ commands, scope })
  });
  const js = await r.json();
  if (!js.ok) throw new Error(js.description || `HTTP ${r.status}`);
  console.log(`OK setMyCommands scope=${scope?.type||'default'}`);
}

(async ()=>{
  await push(undefined);                     // todos
  await push({ type: "all_private_chats" }); // privados
  await push({ type: "all_group_chats" });   // grupos
  // Mostrar lo publicado
  const r = await fetch(API("getMyCommands"));
  const js = await r.json();
  console.log("Comandos actuales:", js.result);
})().catch(e=>{ console.error("Error:", e.message||e); process.exit(1); });

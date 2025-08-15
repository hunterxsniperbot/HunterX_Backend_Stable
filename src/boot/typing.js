export function hookTyping(bot){
  bot.on('message', (msg) => {
    try {
      const text = msg.text || '';
      if (text.startsWith('/')) bot.sendChatAction(msg.chat.id, 'typing').catch(()=>{});
    } catch {}
  });
}

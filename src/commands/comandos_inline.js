/**
 * HunterX - Comandos inline (/comandos, /help, /candidatos)
 * ARCHIVO COMPLETO - Reemplazar todo el contenido existente
 * 
 * MEJORAS INCLUIDAS:
 * - Símbolos dinámicos (múltiples fuentes de datos)
 * - Direcciones truncadas como fallback
 * - Limpieza de caracteres especiales en callbacks
 * - Mejor formato de liquidez y volumen
 */

import { findM4Candidates } from '../orchestrators/m4Candidates.js';

export default function registerComandosInline(bot) {
  
  // ============================================================================
  // /comandos - Lista completa de comandos disponibles
  // ============================================================================
  bot.onText(/^\/comandos$/i, async (msg) => {
    const chatId = msg.chat.id;
    
    const commandsList = `🤖 **HunterX Bot - Comandos Disponibles**

**🎯 Autosniper**
• \`/autosniper\` - Activar autosniper
• \`/autosniper on\` - Iniciar autosniper
• \`/autosniper off\` - Detener autosniper
• \`/autosniper status\` - Ver estado actual
• \`/stop\` - Parar todos los procesos

**💰 Demo Trading**
• \`/demo_buy <cantidad> <token>\` - Compra demo
• \`/demo_sell <cantidad> <token>\` - Venta demo
• \`/demo_state\` - Ver estado del portfolio demo
• \`/demo_reset [cash]\` - Resetear portfolio

**👛 Wallet & Registro**
• \`/wallet\` - Ver balance actual
• \`/registro_export\` - Exportar trades a Google Sheets

**📊 Información**
• \`/salud\` o \`/health\` - Estado de infraestructura
• \`/candidatos\` - Ver top candidatos M4 actuales
• \`/help\` - Mostrar esta ayuda

Usa \`/candidatos\` para ver tokens con potencial y botones de demo trading.`;

    try {
      await bot.sendMessage(chatId, commandsList, { 
        parse_mode: 'Markdown',
        reply_to_message_id: msg.message_id 
      });
    } catch (error) {
      console.error('❌ Error enviando lista de comandos:', error);
      await bot.sendMessage(chatId, '❌ Error al mostrar comandos. Intenta de nuevo.');
    }
  });

  // ============================================================================
  // /help - Alias para /comandos (redirige al mismo contenido)
  // ============================================================================
  bot.onText(/^\/help$/i, async (msg) => {
    // Simular que el usuario escribió /comandos
    const fakeMsg = { ...msg, text: '/comandos' };
    bot.emit('text', fakeMsg);
  });

  // ============================================================================
  // /candidatos - Mostrar top candidatos M4 con botones interactivos
  // ============================================================================
  bot.onText(/^\/candidatos$/i, async (msg) => {
    const chatId = msg.chat.id;

    try {
      // Mensaje de búsqueda (se actualiza después)
      await bot.sendMessage(chatId, '🔍 Buscando candidatos M4...', { 
        reply_to_message_id: msg.message_id 
      });

      // Llamar a la función que busca candidatos
      const candidates = await findM4Candidates();
      
      if (!candidates || candidates.length === 0) {
        return await bot.sendMessage(chatId, '❌ No se encontraron candidatos M4 en este momento. Intenta más tarde.');
      }

      // Tomar solo los primeros 3 candidatos
      const top3 = candidates.slice(0, 3);
      let responseText = '🎯 **Top Candidatos M4**\n\n';
      const inlineKeyboard = [];

      // Procesar cada candidato
      for (let i = 0; i < top3.length; i++) {
        const cand = top3[i];
        const num = i + 1;
        
        // ==========================================
        // MEJORADO: Extraer símbolo de múltiples fuentes
        // ==========================================
        const symbol = cand.symbol ||                           // Fuente primaria
                      cand.baseToken?.symbol ||                 // Fuente secundaria
                      cand.baseToken?.name ||                   // Nombre del token base
                      cand.token?.symbol ||                     // Token directo
                      cand.token?.name ||                       // Nombre del token
                      cand.name ||                              // Nombre general
                      (cand.address ? 
                        cand.address.slice(0, 8) + '...' :     // Dirección truncada
                        'Token');                               // Fallback final

        // Formatear precio (6 decimales max)
        const price = cand.priceUsd ? parseFloat(cand.priceUsd).toFixed(6) : 'N/A';
        
        // ==========================================
        // MEJORADO: Formatear liquidez mejor
        // ==========================================
        let liq = 'N/A';
        if (cand.liquidity?.usd) {
          const liquidityValue = parseFloat(cand.liquidity.usd);
          if (liquidityValue >= 1000000) {
            liq = `$${(liquidityValue / 1000000).toFixed(1)}M`;  // Millones
          } else if (liquidityValue >= 1000) {
            liq = `$${(liquidityValue / 1000).toFixed(1)}K`;     // Miles
          } else {
            liq = `$${liquidityValue.toFixed(0)}`;               // Unidades
          }
        }
        
        // ==========================================
        // MEJORADO: Formatear volumen mejor
        // ==========================================
        let vol1m = 'N/A';
        const volumeData = cand.volume?.m5 || cand.volume?.h1 || cand.volume?.h24;
        if (volumeData) {
          const volumeValue = parseFloat(volumeData);
          if (volumeValue >= 1000000) {
            vol1m = `$${(volumeValue / 1000000).toFixed(1)}M`;   // Millones
          } else if (volumeValue >= 1000) {
            vol1m = `$${(volumeValue / 1000).toFixed(1)}K`;      // Miles
          } else {
            vol1m = `$${volumeValue.toFixed(0)}`;                // Unidades
          }
        }
        
        // Fuente de datos
        const source = cand._source || 'gecko';

        // Construir texto del candidato
        responseText += `**${num}. ${symbol}** (\`${source}\`)\n`;
        responseText += `💵 Precio: $${price}\n`;
        responseText += `💧 Liquidez: ${liq}\n`;
        responseText += `📊 Volumen: ${vol1m}\n\n`;

        // ==========================================
        // MEJORADO: Limpiar símbolo para callback_data
        // ==========================================
        const cleanSymbol = symbol.replace(/[^A-Za-z0-9]/g, '');  // Solo letras y números
        
        // Botones inline para cada candidato
        inlineKeyboard.push([
          {
            text: `💰 Demo Buy ${symbol}`,
            callback_data: `demo_buy_${cleanSymbol}_10`           // Símbolo limpio
          },
          {
            text: `📊 Ver ${symbol}`,
            callback_data: `view_token_${cleanSymbol}`            // Símbolo limpio
          }
        ]);
      }

      // Botón de refresh al final
      inlineKeyboard.push([
        {
          text: '🔄 Actualizar Candidatos',
          callback_data: 'refresh_candidates'
        }
      ]);

      // Enviar mensaje con candidatos y botones
      await bot.sendMessage(chatId, responseText, {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: inlineKeyboard
        }
      });

    } catch (error) {
      console.error('❌ Error obteniendo candidatos:', error);
      await bot.sendMessage(chatId, `❌ Error obteniendo candidatos: ${error.message}`);
    }
  });

  // ============================================================================
  // Manejador de botones inline (callback_query)
  // ============================================================================
  bot.on('callback_query', async (query) => {
    const chatId = query.message.chat.id;
    const userId = query.from.id;
    const data = query.data;

    try {
      // ==========================================
      // Botón: Demo Buy (sugerir comando)
      // ==========================================
      if (data.startsWith('demo_buy_')) {
        const parts = data.split('_');
        const symbol = parts[2];         // Símbolo limpio
        const amount = parts[3] || '10'; // Cantidad por defecto
        
        // Responder al botón (popup)
        await bot.answerCallbackQuery(query.id, { 
          text: `💰 Demo buy sugerido: /demo_buy ${amount} ${symbol}`,
          show_alert: false  // Popup pequeño, no modal
        });
        
        // Enviar mensaje con sugerencia
        await bot.sendMessage(chatId, 
          `💡 **Sugerencia de compra demo:**\n\`/demo_buy ${amount} ${symbol}\`\n\n` +
          `Copia y pega el comando para ejecutar la compra demo.`,
          { parse_mode: 'Markdown' }
        );
      }
      
      // ==========================================
      // Botón: Ver token (placeholder por ahora)
      // ==========================================
      else if (data.startsWith('view_token_')) {
        const symbol = data.replace('view_token_', '');
        await bot.answerCallbackQuery(query.id, { 
          text: `📊 Información detallada de ${symbol} (próximamente)`,
          show_alert: true  // Modal más grande
        });
      }
      
      // ==========================================
      // Botón: Refresh candidatos
      // ==========================================
      else if (data === 'refresh_candidates') {
        await bot.answerCallbackQuery(query.id, { 
          text: '🔄 Actualizando candidatos...',
          show_alert: false 
        });
        
        // Simular que escribió /candidatos otra vez
        const fakeMsg = {
          chat: query.message.chat,
          from: query.from,
          message_id: query.message.message_id,
          text: '/candidatos'
        };
        
        bot.emit('text', fakeMsg);
      }

    } catch (error) {
      console.error('❌ Error en callback query:', error);
      await bot.answerCallbackQuery(query.id, { 
        text: '❌ Error procesando acción',
        show_alert: true 
      });
    }
  });

  // ============================================================================
  // Log de carga exitosa
  // ============================================================================
  console.log('✅ Handler cargado: comandos_inline.js (comandos, help, candidatos)');
}

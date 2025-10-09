# 🧾 CHANGELOG — HunterX_Backend_Stable

## 📌 Wallet — [Wallet & Infraestructura]

✅ Integración completa de Phantom, QuickNode y Sheets  
🔒 Guardado en tag: `Wallet`

> Fecha: 02 Aug 2025  
> Rama base: `develop`

---


## 📌 v1.1-sniper — [modulo 6 sniper automatico]

✅ Activacion y logica de sniper automatico  
🔒 Guardado en tag: `v1.1-sniper`

> Fecha: 02 Aug 2025  
> Rama base: `develop`

---


## 📌 v1.0-quicknode-phantom-ready — [trtransacciones de prueba realizada con exito]

✅ Modo prueba  
🔒 Guardado en tag: `v1.0-quicknode-phantom-ready`

> Fecha: 02 Aug 2025  
> Rama base: `develop`

---


Registro de versiones y avances del backend del bot **Hunter X**.

---

## 📌 v1.1-sheets-ready — [Módulo 7]

✅ Integración completa con Google Sheets  
✅ Lectura/envío de datos conectado con API  
✅ Validación correcta de `.env` y variables requeridas  
✅ Confirmación en test local (`npm run test:sheets`)  
🔒 Guardado en tag: `v1.1-sheets-ready`

> Fecha: 2 de agosto 2025  
> Rama base: `main`

---

## 🔜 Próximo objetivo: Módulo 8 - "Mi Cartera"
- Mostrar posiciones abiertas
- Botones de venta parcial
- Links a DexScreener y Solscan

## hx-2025-09-09_2104
**Added**
- Tarjeta única con 'Invertido' vivo y ventas parciales con recibos
- Resumen /registro + botón a Sheets mensual (DEMO_/REAL_)
- Persistencia Supabase + sumClosedPnL para hoy/semana/mes
- /wallet con libre/invertido y PnL agregada

**Changed**
- Links por token (mint) en DexScreener/Solscan
- Formato fecha AR en pushes y Sheets

**Fixed**
- Duplicados de helpers y retornos top-level
- Ediciones inline y refresco tras venta

graph TB
    %% Estilos
    classDef userClass fill:#4CAF50,stroke:#2E7D32,stroke-width:3px,color:#fff
    classDef pwaClass fill:#2196F3,stroke:#1565C0,stroke-width:3px,color:#fff
    classDef backendClass fill:#FF6B35,stroke:#D84315,stroke-width:3px,color:#fff
    classDef aiClass fill:#9C27B0,stroke:#6A1B9A,stroke-width:3px,color:#fff
    classDef storageClass fill:#FF9800,stroke:#E65100,stroke-width:3px,color:#fff
    classDef notifClass fill:#00BCD4,stroke:#006064,stroke-width:3px,color:#fff

    %% Nodos principales
    U[Usuario habla: Recordarme llamar a mama manana]:::userClass
    
    PWA[PWA React - Web Speech API - Transcribe GRATIS]:::pwaClass
    
    EDGE[Supabase Edge Function /api/procesar-voz]:::backendClass
    
    CONTROL{Validar limites - Tiene interacciones disponibles?}:::storageClass
    
    LIMITE_OK[Dentro del limite]:::userClass
    LIMITE_NO[Limite alcanzado - Ofrecer upgrade]:::notifClass
    
    GPT[GPT-4o-mini - Interpreta comando - Extrae datos]:::aiClass
    
    DB[(Supabase PostgreSQL - INSERT evento - UPDATE contador)]:::storageClass
    
    TTS[Google Cloud TTS - Genera audio - Voz argentina]:::aiClass
    
    RESP[PWA recibe Audio + JSON]:::pwaClass
    
    PLAY[Reproduce respuesta: Dale anotado! Llamar a mama manana 10:00]:::pwaClass
    
    N8N[n8n Workflow - Detecta nuevo evento - Programa recordatorio]:::backendClass
    
    CRON[Cron Job n8n - Cada 5 minutos - Chequea eventos proximos]:::backendClass
    
    DECIDE{Como recordar? Segun prioridad y plan del usuario}:::storageClass
    
    SOUND[Sonido en app - Alarma + voz - GRATIS]:::notifClass
    
    WA[WhatsApp - Evolution API - Mensaje argentino]:::notifClass
    
    PUSH[Push Notification - Web Push API - GRATIS]:::notifClass
    
    FINAL[Usuario recibe recordatorio a tiempo]:::userClass

    %% Flujo principal
    U -->|1. Habla| PWA
    PWA -->|2. Texto transcrito| EDGE
    EDGE -->|3. Valida usuario| CONTROL
    CONTROL -->|Consulta plan y contador| DB
    
    CONTROL -->|Tiene creditos| LIMITE_OK
    CONTROL -->|Sin creditos| LIMITE_NO
    
    LIMITE_NO -->|Notifica| PWA
    
    LIMITE_OK -->|4. Envia texto| GPT
    GPT -->|5. JSON estructurado| EDGE
    
    EDGE -->|6a. Guarda evento| DB
    EDGE -->|6b. Incrementa contador| DB
    EDGE -->|7. Texto respuesta| TTS
    
    TTS -->|8. Audio MP3| EDGE
    EDGE -->|9. Response completo| RESP
    
    RESP -->|10. Reproduce| PLAY
    
    %% Flujo de recordatorios
    DB -.->|Webhook nuevo evento| N8N
    N8N -->|Programa en calendario| CRON
    
    CRON -->|Query eventos proximos| DB
    CRON -->|Si evento en 15 min| DECIDE
    
    DECIDE -->|Prioridad baja/media| SOUND
    DECIDE -->|Prioridad alta| WA
    DECIDE -->|Siempre tambien| PUSH
    
    SOUND --> FINAL
    WA --> FINAL
    PUSH --> FINAL

    %% Notas
    NOTE1[Web Speech API - reconoce espanol argentino - SIN COSTO]:::pwaClass
    
    NOTE2[GPT-4o-mini - 0.0002 por 1K tokens - aprox 0.0006 por interaccion]:::aiClass
    
    NOTE3[Contador por plan: Gratis 50/mes - Basico 300/mes - Pro 1000/mes]:::storageClass

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


# Comandos del Bot

## DEMO
- `/demo_reset 1000`  → reinicia banca DEMO a $1000
- `/demo_buy 20`      → compra DEMO $20 del token que tengas seleccionado/manual
- `/demo_sell 220 SOL`→ vende todo SOL a precio simulado 220 (ejemplo)
- `/demo_state`       → muestra estado DEMO

## Sniper
- `/autosniper`       → ON (por defecto al llamar sin parámetro)
- `/autosniper on|off|status`
- `/stop`             → alias rápido de OFF

## Salud / Estado
- `/salud`            → conexiones, score, infra vs data
- `/status`           → estado general/handlers

## Candidatos (Gecko → filtros flexibles)
- `/candidatos`                       → usa filtros por defecto (.env)
- `/candidatos 8`                     → 8 ítems
- `/candidatos raw`                   → sin filtros (para ver “algo ya”)
- `/candidatos 8 liq=5000 fdv=5000000 q=SOL,USDC` → filtros ad-hoc

## Registro / Sheets
- `/registro`                         → posiciones cerradas del día
- `/registro_export`                  → exporta cierres a Google Sheets (Registros!A1…)

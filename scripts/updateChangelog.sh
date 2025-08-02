#!/data/data/com.termux/files/usr/bin/bash

# === CONFIGURACIÓN ===
CHANGELOG="CHANGELOG.md"
TAG=$(git describe --tags --abbrev=0)
DATE=$(date "+%d %b %Y")
BRANCH=$(git rev-parse --abbrev-ref HEAD)

# === INPUT DEL USUARIO ===
echo "📌 Último tag: $TAG"
read -p "📝 Ingresá un título del cambio (ej: Módulo 8: Cartera): " TITLE
read -p "✏️  Escribí un resumen breve (1 línea): " DESCRIPTION

# === BLOQUE NUEVO ===
ENTRY="
## 📌 $TAG — [$TITLE]

✅ $DESCRIPTION  
🔒 Guardado en tag: \`$TAG\`

> Fecha: $DATE  
> Rama base: \`$BRANCH\`

---
"

# === INSERTAR EN LA SEGUNDA LÍNEA DESPUÉS DEL HEADER ===
if grep -q "# 🧾 CHANGELOG" "$CHANGELOG"; then
    awk -v entry="$ENTRY" 'NR==2{print entry}1' "$CHANGELOG" > "$CHANGELOG.tmp" && mv "$CHANGELOG.tmp" "$CHANGELOG"
    echo "✅ Cambio agregado al changelog."
else
    echo "❌ Archivo CHANGELOG.md no tiene el encabezado correcto."
fi

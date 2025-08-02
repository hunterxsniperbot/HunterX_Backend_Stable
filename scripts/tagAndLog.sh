#!/data/data/com.termux/files/usr/bin/bash

# === CONFIGURACIÓN GENERAL ===
CHANGELOG="CHANGELOG.md"
BRANCH=$(git rev-parse --abbrev-ref HEAD)
DATE=$(date "+%d %b %Y")

# === INPUT DEL USUARIO ===
read -p "📦 Nombre del módulo (ej: wallet, infraestructura, sheets): " MODULE
read -p "📝 Título del cambio (ej: v1.0.8 - Wallet & Infraestructura OK): " TITLE
read -p "🧩 Descripción corta del módulo (ej: Integración completa de Phantom, QuickNode y Sheets): " DESCRIPTION

# === GENERAR TAG ===
NEW_TAG=$(echo "$TITLE" | awk '{print $1}')

# === CREAR ENTRADA EN CHANGELOG ===
ENTRY="
## 📌 $NEW_TAG — [$TITLE]

✅ $DESCRIPTION  
🔒 Guardado en tag: \`$NEW_TAG\`

> Fecha: $DATE  
> Rama base: \`$BRANCH\`

---
"

# === INSERTAR EN SEGUNDA LÍNEA DEL CHANGELOG ===
if grep -q "# 🧾 CHANGELOG" "$CHANGELOG"; then
  awk -v entry="$ENTRY" 'NR==2{print entry}1' "$CHANGELOG" > "$CHANGELOG.tmp" && mv "$CHANGELOG.tmp" "$CHANGELOG"
else
  echo -e "# 🧾 CHANGELOG\n\n$ENTRY" > "$CHANGELOG"
fi

# === COMMIT & TAG & PUSH ===
git add .
git commit -m "🔒 $TITLE"
git tag "$NEW_TAG"
git push origin "$BRANCH"
git push origin "$NEW_TAG"

echo -e "\n✅ Todo actualizado con tag $NEW_TAG y registrado en $CHANGELOG"

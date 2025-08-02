#!/data/data/com.termux/files/usr/bin/bash

# === CONFIGURACIÓN ===
CHANGELOG="CHANGELOG.md"
BRANCH=$(git rev-parse --abbrev-ref HEAD)
DATE=$(date "+%d %b %Y")

# === INPUT DEL USUARIO ===
read -p "📦 Nombre del módulo (ej: sheets, cartera, sniper): " MODULE
read -p "📝 Título completo del cambio (ej: Módulo 8: Cartera): " TITLE
read -p "✏️  Descripción breve (1 línea): " DESCRIPTION

# === GENERAR NUEVO TAG ===
LAST_TAG=$(git describe --tags --abbrev=0 2>/dev/null || echo "v1.0-initial")
BASE_VERSION=$(echo "$LAST_TAG" | cut -d'-' -f1 | sed 's/v//')
MAJOR=$(echo $BASE_VERSION | cut -d'.' -f1)
MINOR=$(echo $BASE_VERSION | cut -d'.' -f2)
NEW_MINOR=$((MINOR + 1))
NEW_TAG="v${MAJOR}.${NEW_MINOR}-${MODULE}"

# === NUEVA ENTRADA AL CHANGELOG ===
ENTRY="
## 📌 $NEW_TAG — [$TITLE]

✅ $DESCRIPTION  
🔒 Guardado en tag: \`$NEW_TAG\`

> Fecha: $DATE  
> Rama base: \`$BRANCH\`

---
"

# === INSERTAR EN LA SEGUNDA LÍNEA DEL CHANGELOG ===
if grep -q "# 🧾 CHANGELOG" "$CHANGELOG"; then
  awk -v entry="$ENTRY" 'NR==2{print entry}1' "$CHANGELOG" > "$CHANGELOG.tmp" && mv "$CHANGELOG.tmp" "$CHANGELOG"
else
  echo -e "# 🧾 CHANGELOG\n\n$ENTRY" > "$CHANGELOG"
fi

# === COMMIT Y PUSH ===
git add CHANGELOG.md
git commit -m "📝 Actualiza changelog para $NEW_TAG"
git tag "$NEW_TAG"
git push origin "$BRANCH"
git push origin "$NEW_TAG"

echo -e "\n✅ Todo actualizado en GitHub con tag $NEW_TAG"

BEGIN{skip=0; depth=0; seen=0}
# Inicio de readRowsCached o readRowsCached_old
/^export[[:space:]]+async[[:space:]]+function[[:space:]]+readRowsCached(_old)?[[:space:]]*\(/{
  skip=1; depth=0; seen=0; next
}
skip{
  # cuenta llaves para detectar fin del bloque
  open = gsub(/\{/,"{"); close = gsub(/\}/,"}")
  if (open>0) seen=1
  depth += open - close
  if (seen && depth <= 0) { skip=0; seen=0; next }
  next
}
{ print }

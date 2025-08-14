BEGIN{ins=0; state=0}
{
  if (ins==0 && $0 ~ /getPriceUSD[[:space:]]*\(/) { state=1 }   # vimos la firma
  print
  if (ins==0 && state==1 && index($0,"{")>0) {                  # primera '{' tras la firma
    print "  // ── SHORTCUT ESTABLE: USDC siempre 1.0 ─────────────────────────────────"
    print "  // Evita lecturas erróneas si el par de referencia no es USD"
    print "  const USDC_MINTS = new Set(["
    print "    '\''EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'\''"
    print "    // '\''Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB'\''  // (Opcional) tratar USDT como 1.0"
    print "  ]);"
    print "  if (USDC_MINTS.has(mint)) {"
    print "    return { source: '\''STATIC_USDC'\'', price: 1.0, cached: false };"
    print "  }"
    ins=1; state=0
  }
}
END{
  if (ins==0) {
    print "/* ⚠️ No pude insertar el atajo: no encontré la apertura de getPriceUSD(mint). */" > "/dev/stderr"
    exit 1
  }
}

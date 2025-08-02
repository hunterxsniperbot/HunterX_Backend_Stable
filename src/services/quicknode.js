// src/services/quicknode.js
export default function QuickNodeService({ rpcUrl }) {
  return {
    ping: async () => {
      // …tu ping getHealth…
      return true;
    },

    /**
     * Escanea tokens recién lanzados (stub de ejemplo).
     * Deberías reemplazarlo por la llamada real a DexScreener u otra fuente.
     */
    scanNewTokens: async () => {
      // Ejemplo de token de prueba:
      const now = Date.now();
      return [
        {
          symbol: 'SOLBOMB',
          mintAddress: 'So1aNaBoMb11111111111111111111111111111',
          launchTimestamp: now - 2 * 60 * 1000, // lanzado hace 2 minutos
          currentPrice: 0.00089,
          metrics: {
            liquidity: 200,     // SOL
            fdv: 250_000,       // USD
            holders: 150,
            volume: 2_000       // USD/min
          },
          isHoneypot: false,
          isRenounced: true,
          whaleDetected: true
        },
        // Puedes agregar más objetos de ejemplo aquí
      ];
    }
  };
}

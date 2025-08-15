(async () => {
  try {
    const { setGlobalDispatcher, Agent } = await import('undici');
    setGlobalDispatcher(new Agent({
      keepAliveTimeout: 20_000,
      keepAliveMaxTimeout: 60_000,
      pipelining: 1
    }));
    console.log('HTTP boot: undici keep-alive activado');
  } catch (e) {
    console.log('HTTP boot: undici no instalado; continúo sin keep-alive dedicado');
  }
})();

import { setGlobalDispatcher, Agent } from 'undici';
try {
  setGlobalDispatcher(new Agent({ connect: { family: 4 } }));
  // opcional: también fijamos fetch global explícito
  const { fetch } = await import('undici');
  globalThis.fetch = fetch;
  console.log('🌐 undici: IPv4 forced (family=4)');
} catch (e) {
  console.error('undici IPv4 init error:', e?.message || e);
}

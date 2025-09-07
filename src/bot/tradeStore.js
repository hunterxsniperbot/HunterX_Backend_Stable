const store = new Map();
export function putTrade(id, data){ if(!id) return; const k=String(id); store.set(k, { ...(store.get(k)||{}), ...data }); }
export function getTrade(id){ return store.get(String(id)); }
export function delTrade(id){ store.delete(String(id)); }

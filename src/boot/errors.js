process.on('unhandledRejection', (reason, p) => {
  const msg = String(reason?.message || reason || '');
  console.error('⚠️ UNHANDLED_REJECTION:', msg);
});
process.on('uncaughtException', (err) => {
  const msg = String(err?.message || err || '');
  console.error('⚠️ UNCAUGHT_EXCEPTION:', msg);
});

import fs from 'fs';

const isObj = (x) => x && typeof x === 'object' && !Array.isArray(x);

function deepMerge(a, b) {
  if (Array.isArray(a) && Array.isArray(b)) return b;
  if (isObj(a) && isObj(b)) {
    const out = { ...a };
    for (const k of Object.keys(b)) out[k] = deepMerge(a[k], b[k]);
    return out;
  }
  return b === undefined ? a : b;
}

function readJSONSafe(path) {
  try { return JSON.parse(fs.readFileSync(path, 'utf8')); }
  catch { return null; }
}

function applyEnvInjections(p) {
  // Alerts webhook
  const k = p?.alerts?.webhook_url_env;
  if (k) p.alerts.webhook_url = process.env[k] || '';

  // Inference endpoint
  const ke = p?.model_decision?.infer?.endpoint_env;
  if (ke) p.model_decision.infer.endpoint = process.env[ke] || '';
  return p;
}

function maybeApplyArtifacts(p) {
  // artifacts.json (exportado por Colab) vive junto al bot o donde prefieras
  const art = readJSONSafe('hunterx_artifacts/artifacts.json') || readJSONSafe('artifacts.json');
  if (!art) return p;
  // Sobre-escribe label/threshold/features si existen
  p.model_decision.primary_label = art.label || p.model_decision.primary_label;
  if (typeof art.threshold === 'number') p.model_decision.p_win_min = art.threshold;
  if (Array.isArray(art.features_numeric)) p.model_decision.features_numeric = art.features_numeric;
  if (Array.isArray(art.features_categorical)) p.model_decision.features_categorical = art.features_categorical;
  // tp/sl también si los exportaste
  if (typeof art.tp_pct === 'number') p.model_decision.tp_pct = art.tp_pct;
  if (typeof art.sl_pct === 'number') p.model_decision.sl_pct = art.sl_pct;
  return p;
}

function validatePolicy(p) {
  const req = [
    ['detection.entry_window_s','number'],
    ['filters.min_liq_usd','number'],
    ['validators.deadline_ms','number'],
    ['model_decision.p_win_min','number'],
    ['model_decision.edge_min','number'],
    ['execution.mode','string']
  ];
  for (const [path, typ] of req) {
    const v = path.split('.').reduce((o,k)=>o?.[k], p);
    if (typeof v !== typ) throw new Error(`policy: falta/corroto ${path}`);
  }
  return true;
}

export function loadPolicySync() {
  const file = process.env.POLICY_FILE || 'config/policies/policy.demo.json';
  const base = readJSONSafe(file);
  if (!base) throw new Error(`No pude leer POLICY_FILE=${file}`);
  let merged = base;

  if (process.env.POLICY_OVERRIDES_JSON) {
    try {
      const ov = JSON.parse(process.env.POLICY_OVERRIDES_JSON);
      merged = deepMerge(merged, ov);
    } catch (e) {
      throw new Error('POLICY_OVERRIDES_JSON inválido');
    }
  }

  merged = applyEnvInjections(merged);
  merged = maybeApplyArtifacts(merged);
  validatePolicy(merged);
  return merged;
}

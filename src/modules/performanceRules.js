// src/modules/performanceRules.js
export const PERFORMANCE_RULES = [
  { target: 1.00, trigger: 0.30 },  // +100% → si baja a +30%
  { target: 2.50, trigger: 1.25 },  // +250% → si baja a +125%
  { target: 5.00, trigger: 2.00 },  // +500% → si baja a +200%
  { target: 7.50, trigger: 3.00 },  // +750% → si baja a +300%
  { target: 10.0, trigger: 4.00 },  // +1000% → si baja a +400%
  { target: 20.0, trigger: 8.00 }   // +2000% → si baja a +800%
];

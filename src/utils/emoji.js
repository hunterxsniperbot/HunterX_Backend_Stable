// src/utils/emoji.js
// Tema: HUD Militar / Visor — todos los emojis en escapes seguros.
const E = {
  brand:    '\u{1F6F0}',        // 🛰️
  radar:    '\u{1F4E1}',        // 📡
  scope:    '\u{1F3AF}',        // 🎯
  ai:       '\u{1F9E0}',        // 🧠
  hud:      '\u{1F39B}\u{FE0F}',// 🎛️
  scan:     '\u{1F50E}',        // 🔎
  buy:      '\u{1F6D2}',        // 🛒
  sell:     '\u{1F4B8}',        // 💸
  rocket:   '\u{1F680}',        // 🚀
  chartUp:  '\u{1F4C8}',        // 📈
  chartDn:  '\u{1F4C9}',        // 📉
  warn:     '\u{26A0}\u{FE0F}', // ⚠️
  stop:     '\u{1F6D1}',        // 🛑
  ok:       '\u{2705}',         // ✅
  whale:    '\u{1F433}',        // 🐳
  settings: '\u{2699}\u{FE0F}', // ⚙️
  history:  '\u{1F5C2}\u{FE0F}',// 🗂️
  wallet:   '\u{1F4B0}',        // 💰
  ping:     '\u{1F4E1}',        // 📡
  demo:     '\u{1F9EA}',        // 🧪
  real:     '\u{1F512}',        // 🔒
  bomb:     '\u{1F4A3}',        // 💣
  loop:     '\u{1F501}',        // 🔁
  hundred:  '\u{1F4AF}',        // 💯
  link:     '\u{1F517}',        // 🔗
  clock:    '\u{23F1}\u{FE0F}', // ⏱️
  blue:     '\u{1F535}',        // 🔵
  purple:   '\u{1F7E3}',        // 🟣
  red:      '\u{1F534}',        // 🔴
};
const emj = (k) => E[k] || '';
module.exports = { emj, E };

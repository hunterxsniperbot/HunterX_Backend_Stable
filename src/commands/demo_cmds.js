import { registerDemoCommands } from '../bot/demoCommands.js';

export default function(bot){
  if (process.env.DEMO_CMDS === '1') {
    registerDemoCommands(bot);
    console.log('✅ DemoCommands: registrados (/demo_buy, /demo_sell, /demo_state, /demo_reset)');
  } else {
    console.log('ℹ️ DemoCommands: DEMO_CMDS != 1 (no registrados)');
  }
}

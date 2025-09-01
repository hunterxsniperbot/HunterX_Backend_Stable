import { registerRegistroExport } from '../commands/registro_export.js';

export default function(bot){
  registerRegistroExport(bot);
  console.log('✅ RegistroExport: registrado (/registro_export)');
}

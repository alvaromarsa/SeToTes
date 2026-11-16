// Compila el frontend para producción y arranca el backend con NODE_ENV=production, que sirve
// el build de Angular y la API desde el mismo origen. Uso: npm run start:prod (desde la raíz).
//
// Sin dependencias ni shell: funciona igual en Windows y en Linux. Las variables de entorno
// (secretos incluidos) las sigue leyendo el backend de backend/.env o del entorno del proceso;
// este script no lee ni escribe ninguna.
//
// En un contenedor o servicio gestionado conviene arrancar "node server.js" directamente (con el
// build ya hecho en la imagen), para que la señal de parada llegue sin intermediarios.
const { spawn, spawnSync } = require('node:child_process');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const ANGULAR_CLI = path.join(ROOT, 'node_modules', '@angular', 'cli', 'bin', 'ng.js');

console.log('Compilando el frontend (ng build --configuration production)…');
const build = spawnSync(process.execPath, [ANGULAR_CLI, 'build', '--configuration', 'production'], {
  cwd: ROOT,
  stdio: 'inherit',
});

if (build.status !== 0) {
  console.error('La compilación del frontend ha fallado: no se arranca el backend');
  process.exit(build.status ?? 1);
}

console.log('Arrancando el backend en producción…');
const server = spawn(process.execPath, ['server.js'], {
  cwd: path.join(ROOT, 'backend'),
  stdio: 'inherit',
  env: { ...process.env, NODE_ENV: 'production' },
});

// Ctrl+C en la terminal ya le llega al backend (mismo grupo de procesos): aquí solo se espera
// a que termine su cierre ordenado. SIGTERM (p. ej. de un gestor de procesos) se reenvía.
process.on('SIGINT', () => {});
process.on('SIGTERM', () => server.kill('SIGTERM'));

server.on('exit', (code, signal) => {
  process.exit(code ?? (signal ? 1 : 0));
});

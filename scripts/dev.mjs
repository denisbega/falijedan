// Pokreće API server (sa auto-restartom) i Vite dev server zajedno.
import { spawn } from 'node:child_process';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const procs = [
  spawn(process.execPath, ['--watch', '--disable-warning=ExperimentalWarning', 'server/index.ts'], { cwd: root, stdio: 'inherit' }),
  spawn(process.execPath, [path.join(root, 'node_modules', 'vite', 'bin', 'vite.js')], { cwd: root, stdio: 'inherit' }),
];
const stop = () => {
  for (const p of procs) p.kill();
  process.exit(0);
};
for (const p of procs) p.on('exit', (code) => code && code !== 0 && stop());
process.on('SIGINT', stop);
process.on('SIGTERM', stop);

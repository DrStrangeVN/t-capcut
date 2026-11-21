import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

const engine = spawn('pnpm', ['--filter', '@t-capcut/engine', 'dev'], {
  cwd: rootDir,
  stdio: 'inherit',
});

const studio = spawn('pnpm', ['--filter', '@t-capcut/studio', 'dev'], {
  cwd: rootDir,
  stdio: 'inherit',
});

const shutdown = () => {
  engine.kill('SIGTERM');
  studio.kill('SIGTERM');
  process.exit(0);
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

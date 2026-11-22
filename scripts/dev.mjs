import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const devToken = process.env.TCAPCUT_SESSION_TOKEN || crypto.randomBytes(16).toString('hex');

const engine = spawn('pnpm', ['--filter', '@t-capcut/engine', 'dev'], {
  cwd: rootDir,
  stdio: 'inherit',
  env: {
    ...process.env,
    TCAPCUT_SESSION_TOKEN: devToken,
  },
});

const studio = spawn('pnpm', ['--filter', '@t-capcut/studio', 'dev'], {
  cwd: rootDir,
  stdio: 'inherit',
  env: {
    ...process.env,
    VITE_TCAPCUT_TOKEN: devToken,
  },
});

const shutdown = () => {
  engine.kill('SIGTERM');
  studio.kill('SIGTERM');
  process.exit(0);
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

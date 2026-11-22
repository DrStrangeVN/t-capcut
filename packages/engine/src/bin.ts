import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { TCapCutEngineServer } from './server.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..', '..', '..');
const dataDir = process.env.TCAPCUT_DATA_DIR || path.join(projectRoot, '.tcapcut-data');
const studioDistDir = process.env.TCAPCUT_STUDIO_DIST || path.join(projectRoot, 'apps', 'studio', 'dist');
const rawPort = process.env.TCAPCUT_PORT;
const port = rawPort !== undefined ? Number(rawPort) : 47890;

const server = new TCapCutEngineServer({ projectRoot, dataDir, studioDistDir });
const info = await server.start(port);
// Machine-readable readiness line for macos-shell dynamic port IPC
console.log(`TCAPCUT_READY:${JSON.stringify({ port: info.port, url: info.url })}`);
console.log(`[tcapcut-engine] Listening on ${info.url} (dataDir=${dataDir})`);

const shutdown = async () => {
  await server.stop();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

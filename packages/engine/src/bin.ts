import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { TCapCutEngineServer } from './server.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..', '..', '..');
const dataDir = process.env.TCAPCUT_DATA_DIR || path.join(projectRoot, '.tcapcut-data');
const studioDistDir = process.env.TCAPCUT_STUDIO_DIST || path.join(projectRoot, 'apps', 'studio', 'dist');
const port = Number(process.env.TCAPCUT_PORT || 47890);

const server = new TCapCutEngineServer({ projectRoot, dataDir, studioDistDir });
const info = await server.start(port);
console.log(`[tcapcut-engine] Listening on ${info.url} (dataDir=${dataDir})`);

const shutdown = async () => {
  await server.stop();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

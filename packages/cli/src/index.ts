import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  exportToCapCutDraft,
  exportToFCPXML,
  exportToOTIO,
  importFromCapCutDraft,
  type CapCutDraftContent,
} from '@t-capcut/schema';
import { ProjectDatabase, exportProject, getAiCapabilities } from '@t-capcut/engine';

export async function runCli(argv: string[], dataDir: string, projectRoot: string): Promise<string> {
  const cmd = argv[0];
  const dbPath = path.join(dataDir, 'tcapcut.sqlite');

  if (!cmd || cmd === 'help' || cmd === '--help') {
    return [
      'tcapcut-cli — T-CapCut Headless Engine & Batch Renderer',
      'Commands:',
      '  info                                      Show engine & Apple Vision/Whisper/FFmpeg capabilities',
      '  projects                                  List projects in SQLite WAL store',
      '  render <projectId> <output.mp4> [mode]    Render project (mode: hardware | lossless-hybrid)',
      '  export-draft <projectId> <out.json>       Export CapCut draft_content.json',
      '  import-draft <draft_content.json> [name]  Import CapCut draft into T-CapCut SQLite',
      '  export-fcpxml <projectId> <out.fcpxml>    Export Final Cut Pro / Resolve XML',
      '  export-otio <projectId> <out.otio>        Export OpenTimelineIO JSON',
    ].join('\n');
  }

  if (cmd === 'info') {
    return JSON.stringify(
      {
        dataDir,
        ai: getAiCapabilities(projectRoot, path.join(dataDir, 'models')),
      },
      null,
      2
    );
  }

  const db = new ProjectDatabase(dbPath);
  try {
    if (cmd === 'projects') {
      return JSON.stringify(db.listProjects(), null, 2);
    }

    if (cmd === 'render') {
      const [, projectId, outPath, modeArg] = argv;
      if (!projectId || !outPath) throw new Error('Usage: render <projectId> <output.mp4> [hardware|lossless-hybrid]');
      const project = db.getProject(projectId);
      if (!project) throw new Error(`Project not found: ${projectId}`);
      const res = await exportProject(
        project,
        {
          mode: modeArg === 'lossless-hybrid' ? 'lossless-hybrid' : 'hardware',
          outputPath: path.resolve(outPath),
        },
        path.join(dataDir, 'tmp'),
        db
      );
      return JSON.stringify(res, null, 2);
    }

    if (cmd === 'export-draft') {
      const [, projectId, outPath] = argv;
      const project = db.getProject(projectId);
      if (!project) throw new Error(`Project not found: ${projectId}`);
      const json = JSON.stringify(exportToCapCutDraft(project), null, 2);
      fs.writeFileSync(outPath, json, 'utf8');
      return `Exported CapCut draft to ${outPath}`;
    }

    if (cmd === 'import-draft') {
      const [, draftPath, name] = argv;
      const raw = JSON.parse(fs.readFileSync(draftPath, 'utf8')) as CapCutDraftContent;
      const proj = importFromCapCutDraft(raw);
      if (name) proj.name = name;
      db.saveImportedProject(proj);
      return JSON.stringify({ importedId: proj.id, name: proj.name, clips: Object.keys(proj.clips).length });
    }

    if (cmd === 'export-fcpxml') {
      const [, projectId, outPath] = argv;
      const project = db.getProject(projectId);
      if (!project) throw new Error(`Project not found: ${projectId}`);
      fs.writeFileSync(outPath, exportToFCPXML(project), 'utf8');
      return `Exported FCPXML to ${outPath}`;
    }

    if (cmd === 'export-otio') {
      const [, projectId, outPath] = argv;
      const project = db.getProject(projectId);
      if (!project) throw new Error(`Project not found: ${projectId}`);
      fs.writeFileSync(outPath, exportToOTIO(project), 'utf8');
      return `Exported OTIO to ${outPath}`;
    }

    throw new Error(`Unknown CLI command: ${cmd}`);
  } finally {
    db.close();
  }
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const projectRoot = path.resolve(__dirname, '..', '..', '..');
  const dataDir = process.env.TCAPCUT_DATA_DIR || path.join(projectRoot, '.tcapcut-data');
  runCli(process.argv.slice(2), dataDir, projectRoot)
    .then((out) => console.log(out))
    .catch((err) => {
      console.error(err instanceof Error ? err.message : String(err));
      process.exit(1);
    });
}

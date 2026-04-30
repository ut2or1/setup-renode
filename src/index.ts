/* src/index.ts */
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import * as cp from 'child_process';

const isWin = os.platform() === 'win32';

function getInput(name: string): string {
  return process.env[`INPUT_${name.replace(/-/g, '_').toUpperCase()}`] ?? '';
}

async function setOutput(name: string, value: string) {
  const outputFile = process.env.GITHUB_OUTPUT || process.env.GITEA_OUTPUT;
  if (outputFile) {
    await fs.appendFile(outputFile, `${name}=${value}\n`);
  }
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    const stats = await fs.stat(filePath);
    return stats.isFile();
  } catch (err: any) {
    console.debug(`[debug] fileExists failed for "${filePath}": ${err.code || err.message}`);
    return false;
  }
}

async function run() {
  const version = getInput('version');
  const url = getInput('url');
  const cacheDirInput = getInput('cache-dir') || '.renode-cache';
  const cacheDir = path.resolve(cacheDirInput);
  const stripComponents = parseInt(getInput('strip-components') || '1', 10);

  if (!version || !url) {
    throw new Error('Inputs "version" and "url" are required');
  }

  console.log(`[info] cacheDir resolved to: ${cacheDir}`);
  await fs.mkdir(cacheDir, { recursive: true });

  const extractDir = path.join(cacheDir, version);
  const binName = isWin ? 'Renode.exe' : 'renode';
  const binPath = path.join(extractDir, binName);

  // Find in cache: try both ext
  const possibleArchiveNames = [
    `renode-${version}.zip`,
    `renode-${version}.tar.gz`
  ];

  let archivePath: string | null = null;
  let archiveCacheHit = false;

  console.log(`[info] Searching cache for version ${version}...`);
  for (const archiveName of possibleArchiveNames) {
    const candidatePath = path.join(cacheDir, archiveName);
    console.log(`[debug] Checking: ${candidatePath}`);
    
    if (await fileExists(candidatePath)) {
      archivePath = candidatePath;
      archiveCacheHit = true;
      console.log(`Archive cache hit: ${archivePath}`);
      break;
    } else {
      console.log(`[debug] Not found: ${candidatePath}`);
    }
  }

  // Download if miss
  if (!archiveCacheHit) {
    const isZip = url.toLowerCase().endsWith('.zip');
    const archiveExt = isZip ? 'zip' : 'tar.gz';
    archivePath = path.join(cacheDir, `renode-${version}.${archiveExt}`);

    console.log(`⬇️  Archive missing. Downloading from ${url}`);
    
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`HTTP ${res.status} ${res.statusText} for ${url}`);
    }
    
    const buf = await res.arrayBuffer();
    await fs.writeFile(archivePath, Buffer.from(buf));
    console.log(`Archive saved: ${archivePath}`);
  }

  // Check binary
  let extracted = false;
  if (await fileExists(binPath)) {
    extracted = true;
    console.log(`Binary already extracted: ${binPath}`);
  }

  // Unpack
  if (!extracted) {
    console.log(`Extracting archive to ${extractDir}...`);
    await fs.mkdir(extractDir, { recursive: true });
    
    const stripArg = `--strip-components=${stripComponents}`;
    cp.execSync(`tar -xf "${archivePath}" -C "${extractDir}" ${stripArg}`, { stdio: 'inherit' });

    if (!isWin) {
      try { await fs.chmod(binPath, 0o755); } catch (e) { console.warn(`chmod: ${e}`); }
    }
    console.log(`Extraction complete`);
  }

  await setOutput('renode-path', extractDir);
  await setOutput('cache-hit', String(archiveCacheHit));
  await setOutput('extracted', String(extracted));
  console.log(`Ready: Renode at ${extractDir}`);
}

run().catch(err => {
  console.error(`Action failed: ${err.message}`);
  process.exit(1);
});

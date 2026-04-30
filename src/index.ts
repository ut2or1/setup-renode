/* src/index.ts */
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import * as cp from 'child_process';

const isWin = os.platform() === 'win32';

/**
 * Retrieves an input variable from the CI environment.
 * Compatible with GitHub Actions and Gitea Actions (v2+ format).
 */
function getInput(name: string): string {
  return process.env[`INPUT_${name.replace(/-/g, '_').toUpperCase()}`] ?? '';
}

/**
 * Writes an output variable for the CI runner.
 * Compatible with $GITHUB_OUTPUT / $GITEA_OUTPUT protocols.
 */
async function setOutput(name: string, value: string) {
  const outputFile = process.env.GITHUB_OUTPUT || process.env.GITEA_OUTPUT;
  if (outputFile) {
    await fs.appendFile(outputFile, `${name}=${value}\n`);
  }
}

/**
 * Checks if a file exists and is accessible.
 */
async function fileExists(filePath: string): Promise<boolean> {
  try {
    const stats = await fs.stat(filePath);
    return stats.isFile();
  } catch {
    return false;
  }
}

async function run() {
  const version = getInput('version');
  const url = getInput('url');
  const cacheDir = path.resolve(getInput('cache-dir') || '.renode-cache');
  const stripComponents = parseInt(getInput('strip-components') || '1', 10);

  if (!version || !url) {
    throw new Error('Inputs "version" and "url" are required');
  }

  await fs.mkdir(cacheDir, { recursive: true });

  // Determine paths
  const extractDir = path.join(cacheDir, version);
  const binName = isWin ? 'Renode.exe' : 'renode';
  const binPath = path.join(extractDir, binName);

  // Search for archive in cache by version, NOT by URL extension
  // This allows cache hits even when the input URL has a different extension
  const possibleArchiveNames = [
    `renode-${version}.zip`,
    `renode-${version}.tar.gz`
  ];

  let archivePath: string | null = null;
  let archiveCacheHit = false;

  for (const archiveName of possibleArchiveNames) {
    const candidatePath = path.join(cacheDir, archiveName);
    if (await fileExists(candidatePath)) {
      archivePath = candidatePath;
      archiveCacheHit = true;
      console.log(`Archive cache hit: ${archivePath}`);
      break;
    }
  }

  // Download only if archive not found in cache
  if (!archiveCacheHit) {
    // Determine extension from URL for saving the downloaded file
    const isZip = url.toLowerCase().endsWith('.zip');
    const archiveExt = isZip ? 'zip' : 'tar.gz';
    archivePath = path.join(cacheDir, `renode-${version}.${archiveExt}`);

    console.log(`Archive missing. Downloading from ${url}`);
    
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`HTTP ${res.status} ${res.statusText} for ${url}`);
    }
    
    const buf = await res.arrayBuffer();
    await fs.writeFile(archivePath, Buffer.from(buf));
    console.log(`Archive saved: ${archivePath}`);
  }

  // Check if Renode is already extracted and executable
  let extracted = false;
  if (await fileExists(binPath)) {
    extracted = true;
    console.log(`Binary already extracted: ${binPath}`);
  }

  // Extract only if binary is missing
  if (!extracted) {
    console.log(`Extracting archive to ${extractDir}...`);
    await fs.mkdir(extractDir, { recursive: true });
    
    const stripArg = `--strip-components=${stripComponents}`;
    // Built-in 'tar' is available on Windows 10+, Linux, and macOS
    cp.execSync(`tar -xf "${archivePath}" -C "${extractDir}" ${stripArg}`, { stdio: 'inherit' });

    // Set executable permissions on Unix-like systems
    if (!isWin) {
      try { 
        await fs.chmod(binPath, 0o755); 
      } catch (err) {
        console.warn(`Could not set executable permissions: ${err}`);
      }
    }
    console.log(`Extraction complete`);
  }

  // Export outputs for subsequent workflow steps
  await setOutput('renode-path', extractDir);
  await setOutput('cache-hit', String(archiveCacheHit));
  await setOutput('extracted', String(extracted));
  
  console.log(`Ready: Renode at ${extractDir}`);
}

// Execute and handle fatal errors
run().catch(err => {
  console.error(`Action failed: ${err.message}`);
  process.exit(1);
});

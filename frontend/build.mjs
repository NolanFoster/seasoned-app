import { rm, mkdir, cp } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dirname, '..');
const appDir = resolve(rootDir, 'recipe-app');
const distDir = resolve(__dirname, 'dist');
const sourceDistDir = resolve(appDir, 'dist');

function run(command, args, cwd) {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(command, args, {
      cwd,
      stdio: 'inherit',
      shell: process.platform === 'win32',
    });

    child.on('exit', (code) => {
      if (code === 0) {
        resolvePromise();
        return;
      }
      rejectPromise(new Error(`${command} ${args.join(' ')} exited with code ${code}`));
    });

    child.on('error', rejectPromise);
  });
}

await run('npm', ['ci'], appDir);
await run('npm', ['run', 'build'], appDir);

await rm(distDir, { recursive: true, force: true });
await mkdir(distDir, { recursive: true });
await cp(sourceDistDir, distDir, { recursive: true });

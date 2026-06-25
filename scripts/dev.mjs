import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createServer } from 'vite';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const server = await createServer({ root });
await server.listen();

const resolved = server.resolvedUrls?.local?.[0] ?? 'http://127.0.0.1:5174/';
const viteUrl = resolved.replace(/\/$/, '');

await run('npx', ['tsc', '-p', 'tsconfig.main.json'], root);

const electronBinary = process.platform === 'win32'
  ? path.join(root, 'node_modules', '.bin', 'electron.cmd')
  : path.join(root, 'node_modules', '.bin', 'electron');

const electron = spawn(electronBinary, ['dist/main/main.js'], {
  cwd: root,
  env: {
    ...process.env,
    VITE_DEV_SERVER_URL: viteUrl,
    KICKBACKS_DEV: '1',
  },
  stdio: 'inherit',
  shell: process.platform === 'win32',
  windowsHide: false,
});

electron.on('exit', async (code) => {
  await server.close();
  process.exit(code ?? 0);
});

process.on('SIGINT', () => {
  electron.kill();
});

function run(command, args, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      stdio: 'inherit',
      shell: process.platform === 'win32',
    });
    child.on('exit', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`${command} ${args.join(' ')} exited with ${code}`));
      }
    });
  });
}

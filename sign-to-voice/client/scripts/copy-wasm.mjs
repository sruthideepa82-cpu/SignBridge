// Copies the MediaPipe WASM runtime into public/ so the app runs fully offline on localhost.
import { cpSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const source = join(root, 'node_modules', '@mediapipe', 'tasks-vision', 'wasm');
const target = join(root, 'public', 'wasm');

mkdirSync(target, { recursive: true });
cpSync(source, target, { recursive: true });
console.log(`MediaPipe WASM copied to ${target}`);

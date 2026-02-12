#!/usr/bin/env node
/**
 * Post-build script: splits .wasm files over 24MB into chunks
 * so they fit within Cloudflare Pages' 25MB per-file limit.
 * Creates .wasm.parts.json manifest files alongside the chunks.
 */
import { readdir, readFile, writeFile, stat, unlink } from 'fs/promises';
import { join } from 'path';

const DIST_ASSETS = join(import.meta.dirname, '..', 'dist', 'assets');
const MAX_SIZE = 24 * 1024 * 1024; // 24 MiB (leave margin)

const files = await readdir(DIST_ASSETS);

for (const file of files) {
    if (!file.endsWith('.wasm')) continue;

    const filePath = join(DIST_ASSETS, file);
    const info = await stat(filePath);

    if (info.size <= MAX_SIZE) {
        console.log(`  ${file}: ${(info.size / 1024 / 1024).toFixed(1)} MiB — OK`);
        continue;
    }

    console.log(`  ${file}: ${(info.size / 1024 / 1024).toFixed(1)} MiB — splitting...`);
    const buffer = await readFile(filePath);
    const chunks = [];
    let offset = 0;
    let i = 0;

    while (offset < buffer.length) {
        const end = Math.min(offset + MAX_SIZE, buffer.length);
        const chunkName = file.replace('.wasm', `.wasm.part${i}`);
        await writeFile(join(DIST_ASSETS, chunkName), buffer.subarray(offset, end));
        chunks.push(chunkName);
        console.log(`    → ${chunkName} (${((end - offset) / 1024 / 1024).toFixed(1)} MiB)`);
        offset = end;
        i++;
    }

    // Write manifest
    const manifestName = file.replace('.wasm', '.wasm.json');
    await writeFile(join(DIST_ASSETS, manifestName), JSON.stringify({ chunks }));
    console.log(`    → ${manifestName}`);

    // Remove original
    await unlink(filePath);
}

console.log('Done.');

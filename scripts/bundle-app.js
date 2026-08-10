#!/usr/bin/env node
/**
 * Bundles the Laravel app in app/ into public/app.zip.
 * Excludes unnecessary files (node_modules, .git, tests, etc.)
 * to keep the ZIP small for browser delivery.
 */
import { createWriteStream } from 'fs';
import { copyFile, mkdir, readdir, stat } from 'fs/promises';
import { join, relative } from 'path';
import archiver from 'archiver';

const ROOT = join(import.meta.dirname, '..');
const APP_DIR = join(ROOT, 'app');
const OUT_FILE = join(ROOT, 'public', 'app.zip');
const LIMINAL_SOURCE_DIR = join(ROOT, 'src', 'php', 'composer');
const LIMINAL_TARGET_DIR = join(APP_DIR, '.liminal');

const EXCLUDE_DIRS = new Set([
    'node_modules',
    '.git',
    'tests',
    'storage/logs',
]);

const EXCLUDE_FILES = new Set([
    '.gitignore',
    '.gitattributes',
    'phpunit.xml',
    'README.md',
]);

async function collectFiles(dir, base) {
    const entries = await readdir(dir, { withFileTypes: true });
    const files = [];

    for (const entry of entries) {
        const fullPath = join(dir, entry.name);
        const relPath = relative(base, fullPath);

        if (entry.isDirectory()) {
            if (EXCLUDE_DIRS.has(relPath)) continue;
            files.push(...await collectFiles(fullPath, base));
        } else {
            if (EXCLUDE_FILES.has(entry.name)) continue;
            files.push({ fullPath, relPath });
        }
    }

    return files;
}

async function stageLiminalRuntime() {
    try {
        await stat(join(APP_DIR, 'composer.json'));
    } catch {
        throw new Error('The embedded Laravel app is missing. Restore app/ before building.');
    }

    const entries = await readdir(LIMINAL_SOURCE_DIR, { withFileTypes: true });
    const runtimeFiles = entries.filter((entry) => entry.isFile());

    await mkdir(LIMINAL_TARGET_DIR, { recursive: true });
    for (const entry of runtimeFiles) {
        await copyFile(
            join(LIMINAL_SOURCE_DIR, entry.name),
            join(LIMINAL_TARGET_DIR, entry.name),
        );
    }

    console.log(`  Staged ${runtimeFiles.length} files from src/php/composer/`);
}

console.log('Staging Liminal Composer runtime...');
await stageLiminalRuntime();

console.log('Collecting files from app/...');
const files = await collectFiles(APP_DIR, APP_DIR);
console.log(`  Found ${files.length} files`);

console.log('Creating public/app.zip...');
const archive = archiver('zip', { zlib: { level: 6 } });
const output = createWriteStream(OUT_FILE);

archive.pipe(output);

for (const { fullPath, relPath } of files) {
    archive.file(fullPath, { name: relPath });
}

await archive.finalize();
await new Promise((resolve) => output.on('close', resolve));

const info = await stat(OUT_FILE);
console.log(`  Done — ${(info.size / 1024 / 1024).toFixed(2)} MB (${files.length} files)`);

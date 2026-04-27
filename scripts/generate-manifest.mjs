#!/usr/bin/env node

/**
 * Manifest Generator Script
 * 
 * Usage: node scripts/generate-manifest.mjs <pack-folder-path>
 * 
 * Scans a folder for samples, images, and a README.md to generate a 
 * manifest.json entry.
 */

import fs from 'fs';
import path from 'path';

const PACK_PATH = process.argv[2];

if (!PACK_PATH) {
    console.error('Usage: node scripts/generate-manifest.mjs <pack-folder-path>');
    process.exit(1);
}

const resolvePath = (p) => path.resolve(p);
const absolutePackPath = resolvePath(PACK_PATH);

if (!fs.existsSync(absolutePackPath) || !fs.statSync(absolutePackPath).isDirectory()) {
    console.error(`Error: Folder not found at ${absolutePackPath}`);
    process.exit(1);
}

// -----------------------------------------------------------------------------
// 1. Helper Functions
// -----------------------------------------------------------------------------

function parseREADME(content) {
    const lines = content.split(/\r?\n/);
    const metadata = {};
    const links = [];
    let isFrontmatter = false;
    let yamlLines = [];
    let inLinksSection = false;
    let currentKey = null;
    let isMultiline = false;

    for (const line of lines) {
        // Handle Frontmatter
        if (line.trim() === '---') {
            if (!isFrontmatter) {
                isFrontmatter = true;
                continue;
            } else {
                isFrontmatter = false;
                // Finalize any pending multiline
                currentKey = null;
                continue;
            }
        }

        if (isFrontmatter) {
            if (line.includes(':')) {
                const [key, ...valParts] = line.split(':');
                const keyTrimmed = key.trim();
                const valRaw = valParts.join(':').trim();
                
                if (valRaw === '|') {
                    metadata[keyTrimmed] = "";
                    currentKey = keyTrimmed;
                    isMultiline = true;
                } else {
                    metadata[keyTrimmed] = valRaw;
                    currentKey = null;
                    isMultiline = false;
                }
            } else if (currentKey && isMultiline) {
                metadata[currentKey] += (metadata[currentKey] ? '\n' : '') + line.trim();
            }
            continue;
        }

        // Handle Links Section
        if (line.startsWith('# Links')) {
            inLinksSection = true;
            continue;
        }

        if (inLinksSection) {
            if (line.startsWith('- ')) {
                const match = line.match(/- (.*?): (.*)/);
                if (match) {
                    links.push({ label: match[1].trim(), url: match[2].trim() });
                }
            } else if (line.startsWith('#')) {
                inLinksSection = false;
            }
        }
    }

    return { metadata, links };
}

function scanSamples(dir, packId, baseDir = dir) {
    const samples = [];
    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            samples.push(...scanSamples(fullPath, packId, baseDir));
        } else if (entry.isFile()) {
            const ext = path.extname(entry.name).toLowerCase();
            if (['.flac', '.wav', '.mp3', '.ogg'].includes(ext)) {
                const relativePath = path.relative(baseDir, fullPath).replace(/\\/g, '/');
                const category = path.dirname(relativePath) === '.' ? 'General' : path.dirname(relativePath);
                
                samples.push({
                    name: entry.name.replace(ext, '').replace(/[_-]/g, ' '),
                    path: `/${packId}/${relativePath}`,
                    category: category
                });
            }
        }
    }
    return samples;
}

// -----------------------------------------------------------------------------
// 2. Main Logic
// -----------------------------------------------------------------------------

async function main() {
    const packFolderName = path.basename(absolutePackPath);
    
    // Read README.md
    const readmePath = path.join(absolutePackPath, 'README.md');
    let metadata = { id: packFolderName.toLowerCase().replace(/\s+/g, '-'), name: packFolderName };
    let links = [];

    if (fs.existsSync(readmePath)) {
        const readmeContent = fs.readFileSync(readmePath, 'utf8');
        const parsed = parseREADME(readmeContent);
        metadata = { ...metadata, ...parsed.metadata };
        links = parsed.links;
    }

    // Detect Cover Image
    const files = fs.readdirSync(absolutePackPath);
    const coverImage = files.find(f => ['.jpg', '.jpeg', '.png'].includes(path.extname(f).toLowerCase()));

    // Scan Samples
    const samples = scanSamples(absolutePackPath, metadata.id);

    // Build Output
    const packEntry = {
        id: metadata.id,
        name: metadata.name,
        description: metadata.description || "",
        license: metadata.license || "",
        coverImage: coverImage ? `/${metadata.id}/${coverImage}` : undefined,
        links: links,
        samples: samples
    };

    console.log(JSON.stringify(packEntry, null, 2));
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});

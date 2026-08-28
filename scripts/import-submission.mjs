#!/usr/bin/env node

/**
 * Import a submission archive built by the app's Submit tool.
 *
 *   node scripts/import-submission.mjs <archive.zip>            inspect and check, write nothing
 *   node scripts/import-submission.mjs <archive.zip> --apply    do it
 *
 * Three phases, always in this order: read the archive, check it against the live
 * manifest, then either print the plan or carry it out. **Checking never writes**, so
 * the safe thing is also the default thing — run it bare, read the findings, run it
 * again with `--apply` when you believe them.
 *
 * What it deliberately does not do:
 *
 *   - **Normalize audio unasked.** `--normalize` runs `scripts/normalize.py` for you
 *     and checks the result against the paths the submission claims, but it rewrites
 *     the artist's master, so it stays a decision rather than a side effect.
 *   - **Upload to R2.** No credentials here, and a half-finished upload is worse than
 *     none. The plan prints what goes where.
 *
 * Flags:
 *   --apply        write the changes (default is a dry run)
 *   --normalize    with --apply, also run scripts/normalize.py over the staged audio
 *   --force        replace manifest entries whose id already exists
 *   --no-color     plain output
 */

import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..');
const MANIFEST_PATH = path.join(REPO, 'public', 'manifest.json');
const PRESETS_DIR = path.join(REPO, 'public', 'presets');
/**
 * Where the R2-bound half of an import is assembled.
 *
 * Beside the archive, not inside the repo. Two reasons: none of it is ever
 * committed, and it is easier to drag into an R2 uploader from a folder you opened
 * on purpose than from a hidden directory under a checkout. So the recommended
 * routine is a scratch folder somewhere outside the repo, the ZIP dropped into it,
 * and this script pointed at that ZIP — everything it produces lands beside it.
 *
 * `--stage <dir>` overrides, for the case where the ZIP is somewhere you would
 * rather not write to (a Downloads folder, a read-only share).
 */
const stagingRoot = zipPath => {
    const override = argv[argv.indexOf('--stage') + 1];
    if (argv.includes('--stage') && override && !override.startsWith('--')) return path.resolve(override);
    return path.dirname(path.resolve(zipPath));
};

/**
 * The layout, from the maintainer's point of view.
 *
 *   <working folder>/
 *   ├── <name>-submission.zip     the archive, as it arrived
 *   ├── originals/                the artist's masters — keep, never upload
 *   └── upload-to-R2/
 *       └── samples/…             mirrors the bucket exactly; drag it in
 *
 * `upload-to-R2/` mirroring the bucket's own path structure is the whole point:
 * there is then no step at which anyone has to work out where a file goes.
 */
const layout = (root, packId) => ({
    originals: path.join(root, 'originals'),
    upload: path.join(root, 'upload-to-R2'),
    deploy: path.join(root, 'upload-to-R2', 'samples', packId),
    packZip: path.join(root, 'upload-to-R2', 'samples', `${packId}.zip`),
});

/**
 * How a path is printed.
 *
 * Relative while that is genuinely shorter — a path inside the repo reads as a
 * location — and absolute once it starts climbing out, because six `..` segments
 * tell a reader less than the real path does. The working folder is deliberately
 * outside the repo, so that is the common case here, not the edge one.
 */
const shown = target => {
    const relative = path.relative(process.cwd(), target).replace(/\\/g, '/');
    if (!relative) return '.';
    return relative.startsWith('..') ? target.replace(/\\/g, '/') : relative;
};

const TAPE_COLORS = ['Blue', 'Green', 'Pink', 'Red', 'Turquoise', 'Yellow'];

// ─────────────────────────────────────────────────────────────────────────────
// Output
// ─────────────────────────────────────────────────────────────────────────────

const argv = process.argv.slice(2);
const useColor = process.stdout.isTTY && !argv.includes('--no-color') && !process.env.NO_COLOR;
const paint = (code, text) => (useColor ? `[${code}m${text}[0m` : text);
const dim = t => paint('2', t);
const bold = t => paint('1', t);
const green = t => paint('32', t);
const yellow = t => paint('33', t);
const red = t => paint('31', t);
const cyan = t => paint('36', t);

const heading = title => console.log(`\n${bold(title)}\n${dim('─'.repeat(title.length))}`);

/** Findings accumulate; the exit code and whether `--apply` proceeds both read them. */
const findings = [];
const ok = (message, detail) => findings.push({ level: 'ok', message, detail });
const warn = (message, detail) => findings.push({ level: 'warn', message, detail });
const fail = (message, detail) => findings.push({ level: 'fail', message, detail });

const MARK = { ok: green('  ok  '), warn: yellow(' warn '), fail: red(' FAIL ') };

const printFindings = () => {
    findings.forEach(({ level, message, detail }) => {
        console.log(`${MARK[level]} ${message}`);
        if (detail) String(detail).split('\n').forEach(line => console.log(`        ${dim(line)}`));
    });
};

const die = message => {
    console.error(`\n${red('✗')} ${message}\n`);
    process.exit(1);
};

// ─────────────────────────────────────────────────────────────────────────────
// Reading the archive
// ─────────────────────────────────────────────────────────────────────────────

const readArchive = async zipPath => {
    const JSZip = (await import('jszip')).default;
    const zip = await JSZip.loadAsync(fs.readFileSync(zipPath));

    const paths = Object.keys(zip.files).filter(p => !zip.files[p].dir);
    const text = async p => (zip.file(p) ? zip.file(p).async('string') : null);
    const json = async p => {
        const raw = await text(p);
        if (raw === null) return null;
        try {
            return JSON.parse(raw);
        } catch (e) {
            die(`${p} inside the archive is not valid JSON: ${e.message}`);
        }
    };

    if (!zip.file('submission.json')) {
        die(
            'That ZIP has no submission.json, so it was not built by the Submit tool.\n' +
            '  A settings-only project export goes in by hand — see public/presets/README.md §6.',
        );
    }

    const presetDescriptors = [];
    for (const p of paths) {
        // `presets/<id>.json`, but not `presets/<id>-cover.png`.
        if (/^presets\/[^/]+\.json$/.test(p)) {
            presetDescriptors.push({ zipPath: p, id: path.basename(p, '.json'), descriptor: await json(p) });
        }
    }

    return {
        zipPath,
        paths,
        submission: await json('submission.json'),
        letter: await text('SUBMISSION.md'),
        packEntry: await json('manifest-entry.json'),
        presetEntries: (await json('preset-entries.json')) || [],
        presetDescriptors,
        covers: paths.filter(p => /^presets\/[^/]+-cover\.[a-z0-9]+$/i.test(p)),
        packCover: paths.find(p => /^cover\.[a-z0-9]+$/i.test(p)) || null,
        audio: paths.filter(p => p.startsWith('audio/')),
        raw: zip,
    };
};

// ─────────────────────────────────────────────────────────────────────────────
// Checking
// ─────────────────────────────────────────────────────────────────────────────

const loadManifest = () => {
    if (!fs.existsSync(MANIFEST_PATH)) die(`No manifest at ${MANIFEST_PATH}. Run this from the repo.`);
    const raw = fs.readFileSync(MANIFEST_PATH, 'utf8');
    return { raw, data: JSON.parse(raw), eol: raw.includes('\r\n') ? '\r\n' : '\n' };
};

const checkArchive = (archive, manifest) => {
    const { packEntry, presetEntries, presetDescriptors, audio } = archive;
    const hasPack = !!packEntry;
    const hasPresets = presetDescriptors.length > 0;

    if (!hasPack && !hasPresets) {
        fail('Nothing to publish', 'No manifest-entry.json and no preset descriptors in the archive.');
        return;
    }

    ok(
        `Archive holds ${hasPack ? 'a sample pack' : ''}${hasPack && hasPresets ? ' and ' : ''}` +
        `${hasPresets ? `${presetDescriptors.length} preset${presetDescriptors.length === 1 ? '' : 's'}` : ''}`,
        hasPack ? `${audio.length} audio files under audio/` : 'No new audio — a layout over packs already published.',
    );

    // --- Every sample path a preset can legitimately point at ------------------
    // Includes the pack in *this* submission: a preset over a brand-new pack is
    // valid, it just cannot be verified against a manifest that has not been
    // updated yet.
    const knownPaths = new Set();
    manifest.data.packs.forEach(pack => (pack.samples || []).forEach(s => knownPaths.add(s.path)));
    const incomingPaths = new Set();
    if (hasPack) (packEntry.samples || []).forEach(s => incomingPaths.add(s.path));

    // --- Ids ------------------------------------------------------------------
    if (hasPack) {
        const clash = manifest.data.packs.find(p => p.id === packEntry.id);
        if (clash) warn(`Pack id "${packEntry.id}" already exists`, 'Publishing replaces it. Pass --force to allow.');
        else ok(`Pack id "${packEntry.id}" is free`);
        if (!packEntry.license) warn('Pack has no licence', 'The card will show nothing where the terms go.');
    }

    presetEntries.forEach(entry => {
        const clash = (manifest.data.presets || []).find(p => p.id === entry.id);
        if (clash) warn(`Preset id "${entry.id}" already exists`, 'Publishing replaces it. Pass --force to allow.');
        else ok(`Preset id "${entry.id}" is free`);
    });

    // --- Descriptors ----------------------------------------------------------
    presetDescriptors.forEach(({ id, descriptor, zipPath }) => {
        if (!descriptor || descriptor.schema !== 'spotykach-project/1.0') {
            fail(`${zipPath}: unknown schema`, `Expected spotykach-project/1.0, found ${descriptor?.schema}`);
            return;
        }

        const entry = presetEntries.find(e => e.id === id);
        if (!entry) {
            fail(`${zipPath} has no matching entry in preset-entries.json`);
            return;
        }
        if (entry.descriptorPath !== `/presets/${id}.json`) {
            fail(`${id}: descriptorPath is "${entry.descriptorPath}"`, `Expected /presets/${id}.json`);
        }

        const files = descriptor.files || {};

        // Slots resolve, and are the shape the firmware expects.
        let filled = 0;
        TAPE_COLORS.forEach(color => {
            const tape = descriptor.tapes?.[color];
            if (!tape) {
                fail(`${id}: no "${color}" tape in the descriptor`);
                return;
            }
            (tape.slots || []).forEach(slot => {
                if (slot.id < 1 || slot.id > 6) fail(`${id}: ${color} has a slot numbered ${slot.id}`, 'Slots are 1–6.');
                if (!slot.fileId) return;
                filled++;
                if (!files[slot.fileId]) fail(`${id}: ${color}${slot.id} points at a file that is not in the descriptor`);
            });
        });

        // Paths, the check that actually catches things.
        const unresolved = [];
        const deferred = [];
        const packsUsed = new Set();
        Object.entries(files).forEach(([fileId, file]) => {
            if (file.samplePath && file.blobRef) {
                fail(`${id}: "${file.originalName}" carries both samplePath and blobRef`, 'Exactly one, never both.');
            }
            if (file.blobRef) {
                fail(
                    `${id}: "${file.originalName}" carries a blobRef`,
                    'A published preset is served on its own — there is no ZIP for a blobRef to resolve into.',
                );
            }
            if (file.samplePackId) packsUsed.add(file.samplePackId);
            if (!file.samplePath) {
                fail(`${id}: "${file.originalName}" (${fileId}) has no samplePath`);
                return;
            }
            if (knownPaths.has(file.samplePath)) return;
            if (incomingPaths.has(file.samplePath)) deferred.push(file.samplePath);
            else unresolved.push(`${file.samplePath}   ${dim(`(${file.originalName})`)}`);
        });

        if (unresolved.length) {
            fail(
                `${id}: ${unresolved.length} sample path${unresolved.length === 1 ? '' : 's'} match nothing in the manifest`,
                unresolved.join('\n'),
            );
        } else {
            ok(`${id}: all ${Object.keys(files).length} sample paths resolve`, `${filled} of 36 slots filled`);
        }
        if (deferred.length) {
            ok(
                `${id}: ${deferred.length} path${deferred.length === 1 ? '' : 's'} point at the pack in this submission`,
                'Valid once that pack is deployed — publish the pack first.',
            );
        }

        // requiredPacks is derivable, so disagreeing with it is a real signal.
        const declared = new Set(entry.requiredPacks || []);
        const missing = [...packsUsed].filter(p => !declared.has(p));
        const extra = [...declared].filter(p => !packsUsed.has(p));
        if (missing.length) fail(`${id}: requiredPacks omits ${missing.join(', ')}`);
        if (extra.length) warn(`${id}: requiredPacks lists ${extra.join(', ')}, which no slot uses`);
        if (!missing.length && !extra.length && declared.size) ok(`${id}: requiredPacks matches the slots`);

        // Every declared pack has to exist somewhere by publish time.
        [...declared].forEach(packId => {
            const known = manifest.data.packs.some(p => p.id === packId) || (hasPack && packEntry.id === packId);
            if (known) return;

            // A display name where an id belongs is the one way this goes wrong that
            // is worth naming outright: the archive is otherwise perfect, and "not in
            // the manifest" sends the reader looking for a missing pack rather than a
            // mislabelled one.
            const byName = manifest.data.packs.find(p => p.name === packId);
            if (byName) {
                fail(
                    `${id}: requiredPacks says "${packId}", which is a pack *name*`,
                    `The id is "${byName.id}". The archive was built before the tool told the two apart —\n` +
                    'reopen it in the submission tool, which repairs this on load, and download it again.',
                );
                return;
            }
            fail(`${id}: requires pack "${packId}", which is not in the manifest or this archive`);
        });

        // Artwork: three legal shapes, and one that is a missing file.
        if (!entry.coverImage) {
            ok(`${id}: no cover — the Preset door draws a gradient`);
        } else if (entry.coverImage.startsWith('/presets/')) {
            const expected = `presets/${path.basename(entry.coverImage)}`;
            if (archive.paths.includes(expected)) ok(`${id}: own artwork (${path.basename(entry.coverImage)})`);
            else fail(`${id}: coverImage points at ${entry.coverImage}, which is not in the archive`);
        } else {
            const packId = entry.coverImage.split('/')[1];
            const known = manifest.data.packs.some(p => p.id === packId) || (hasPack && packEntry.id === packId);
            if (known) ok(`${id}: reuses the "${packId}" pack cover`, 'Nothing extra to deploy.');
            else fail(`${id}: coverImage points into pack "${packId}", which does not exist`);
        }
    });

    // --- Audio ----------------------------------------------------------------
    if (hasPack) {
        const declared = (packEntry.samples || []).length;
        if (!audio.length) {
            fail('manifest-entry.json describes a pack but the archive holds no audio/');
        } else if (declared !== audio.length) {
            warn(
                `manifest-entry.json lists ${declared} samples, audio/ holds ${audio.length} files`,
                'Expected when a file was left out on purpose; otherwise check before uploading.',
            );
        } else {
            ok(`${audio.length} audio files, matching the manifest entry`);
        }
        preflightAudioTools();
        warn(
            'Audio still needs normalizing',
            'Re-run with --apply --normalize and the script does it: -1 dB, FLAC, spaces to hyphens,\n' +
            'one pass per category folder, then every path in manifest-entry.json checked against\n' +
            'the files that actually came out.',
        );
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// The audio toolchain
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Run a program, without a shell.
 *
 * `shell: true` was here for Windows and was actively wrong: with a shell, Node
 * concatenates the arguments instead of escaping them, so `python -c "import pydub,
 * mutagen"` arrived as several words and failed — reporting a missing dependency on
 * a machine that had it. `python` and `ffmpeg` are real executables on every
 * platform, so no shell is needed to find them.
 */
const run = (command, args, options = {}) =>
    spawnSync(command, args, { encoding: 'utf8', ...options });

/** The first of `python3`/`python` that answers, or null. */
const findPython = () => {
    for (const candidate of ['python3', 'python']) {
        const probe = run(candidate, ['--version']);
        if (probe.status === 0) return candidate;
    }
    return null;
};

/**
 * Can this machine actually normalize?
 *
 * Checked during the *dry run*, so a maintainer learns their toolchain is missing
 * before they start rather than half-way through an import with files already
 * copied. Every failure here is a warning: the descriptor half of a submission
 * publishes perfectly well on a machine with no FFmpeg on it.
 */
const preflightAudioTools = () => {
    const python = findPython();
    if (!python) {
        warn('No Python found', 'normalize.py needs Python 3. Install it, or normalize elsewhere.');
        return null;
    }

    const ffmpeg = run('ffmpeg', ['-version']);
    if (ffmpeg.status !== 0) {
        warn('No FFmpeg on PATH', 'pydub shells out to it; without it every conversion fails.');
    }

    const deps = run(python, ['-c', 'import pydub, mutagen']);
    if (deps.status !== 0) {
        warn('Python is missing pydub or mutagen', 'pip install pydub mutagen');
        return null;
    }

    if (ffmpeg.status === 0) ok(`Audio toolchain ready (${python}, ffmpeg, pydub, mutagen)`);
    return python;
};

/**
 * Normalize the staged pack, then check the result against what was promised.
 *
 * `normalize.py` is deliberately not recursive — it globs `*.wav` and `*.flac` in one
 * directory — so a pack whose categories are folders would come out of it having
 * processed nothing at all, and say "Found 0 files" while looking like a success. It
 * is run once per folder instead, and the `normalized/` output of each is gathered
 * into a deploy tree that mirrors the categories.
 *
 * The check at the end is the part worth having: `normalize.py` renames on its way
 * through (spaces become hyphens, the extension becomes `.flac`), and the submission's
 * manifest entry was written before any of that happened. If the two disagree, the
 * pack deploys with paths pointing at files that do not exist, and the preset built
 * on it resolves to nothing.
 */
const normalizePack = async (archive, python, root) => {
    const packId = archive.packEntry.id;
    const { originals: stage, deploy, packZip } = layout(root, packId);
    const artist = archive.submission?.details?.artist || 'Unknown Artist';

    const audioIn = dir => fs.readdirSync(dir, { withFileTypes: true })
        .some(e => e.isFile() && /\.(wav|flac)$/i.test(e.name));

    // The root, then every category folder below it.
    const folders = [stage, ...fs.readdirSync(stage, { withFileTypes: true })
        .filter(e => e.isDirectory() && e.name !== 'normalized')
        .map(e => path.join(stage, e.name))].filter(audioIn);

    if (!folders.length) {
        fail('Nothing to normalize', `No .wav or .flac under ${shown(stage)}/`);
        return;
    }

    fs.rmSync(deploy, { recursive: true, force: true });

    for (const folder of folders) {
        const label = folder === stage ? '(root)' : path.basename(folder);
        console.log(`${cyan('normalize')} ${label} ${dim(`— ${path.relative(REPO, folder)}`)}`);
        const result = run(python, [path.join('scripts', 'normalize.py'), folder, artist], {
            cwd: REPO,
            stdio: 'inherit',
        });
        if (result.status !== 0) {
            fail(`normalize.py failed on ${label}`, 'Left the staged originals untouched.');
            return;
        }

        // Gather this folder's output into the deploy tree, categories preserved.
        const out = path.join(folder, 'normalized');
        if (!fs.existsSync(out)) continue;
        const target = folder === stage ? deploy : path.join(deploy, path.basename(folder));
        fs.mkdirSync(target, { recursive: true });
        for (const name of fs.readdirSync(out)) {
            fs.copyFileSync(path.join(out, name), path.join(target, name));
        }
    }

    // Anything that is not audio but belongs beside it.
    for (const name of ['README.md']) {
        const from = path.join(stage, name);
        if (fs.existsSync(from)) fs.copyFileSync(from, path.join(deploy, name));
    }
    const cover = fs.readdirSync(stage).find(n => /^cover\.[a-z0-9]+$/i.test(n));
    if (cover) fs.copyFileSync(path.join(stage, cover), path.join(deploy, cover));

    // --- The promised paths against the produced files ------------------------
    const produced = new Set();
    const walk = (dir, prefix = '') => {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
            if (entry.isDirectory()) walk(path.join(dir, entry.name), `${prefix}${entry.name}/`);
            else if (entry.name.endsWith('.flac')) produced.add(`/${packId}/${prefix}${entry.name}`);
        }
    };
    walk(deploy);

    const promised = (archive.packEntry.samples || []).map(sample => sample.path);
    const missing = promised.filter(p => !produced.has(p));
    const surplus = [...produced].filter(p => !promised.includes(p));

    if (missing.length) {
        fail(
            `${missing.length} path${missing.length === 1 ? '' : 's'} in manifest-entry.json have no file after normalizing`,
            missing.slice(0, 8).join('\n') + (missing.length > 8 ? `\n…and ${missing.length - 8} more` : ''),
        );
    } else {
        ok(`All ${promised.length} sample paths exist after normalizing`);
    }
    if (surplus.length) {
        warn(
            `${surplus.length} normalized file${surplus.length === 1 ? '' : 's'} the manifest entry does not list`,
            surplus.slice(0, 8).join('\n'),
        );
    }

    // The full-pack download, built here so it cannot drift from what was deployed.
    const JSZip = (await import('jszip')).default;
    const bundle = new JSZip();
    const addAll = (dir, prefix = '') => {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
            const full = path.join(dir, entry.name);
            if (entry.isDirectory()) addAll(full, `${prefix}${entry.name}/`);
            else bundle.file(`${prefix}${entry.name}`, fs.readFileSync(full));
        }
    };
    addAll(deploy);
    fs.writeFileSync(packZip, await bundle.generateAsync({ type: 'nodebuffer', compression: 'STORE' }));

    console.log(`${green('ready')} ${shown(path.dirname(path.dirname(deploy)))}/ ${dim('— drag samples/ into the bucket')}`);
};

// ─────────────────────────────────────────────────────────────────────────────
// The plan, and carrying it out
// ─────────────────────────────────────────────────────────────────────────────

const buildPlan = (archive, root) => {
    const steps = [];

    archive.presetDescriptors.forEach(({ id, zipPath }) => {
        steps.push({ kind: 'copy', from: zipPath, to: path.join('public', 'presets', `${id}.json`) });
    });
    archive.covers.forEach(cover => {
        steps.push({ kind: 'copy', from: cover, to: path.join('public', 'presets', path.basename(cover)) });
    });
    if (archive.presetEntries.length) {
        steps.push({ kind: 'manifest', what: `${archive.presetEntries.length} entry(s) → presets[]` });
    }
    if (archive.packEntry) {
        steps.push({ kind: 'manifest', what: `1 entry → packs[] ("${archive.packEntry.id}")` });
        const paths = layout(root, archive.packEntry.id);
        steps.push({ kind: 'stage', what: `audio/ and cover → ${shown(paths.originals)}/` });
        steps.push({
            kind: 'stage',
            what: argv.includes('--normalize')
                ? `normalize → ${shown(paths.deploy)}/, build ${path.basename(paths.packZip)}, verify every path`
                : `normalize with --normalize, or run scripts/normalize.py yourself`,
        });
    }
    return steps;
};

const mergeEntry = (list, entry, force) => {
    const at = list.findIndex(e => e.id === entry.id);
    if (at === -1) {
        list.push(entry);
        return 'added';
    }
    if (!force) return 'clash';
    list[at] = entry;
    return 'replaced';
};

const apply = async (archive, manifest, force, root) => {
    fs.mkdirSync(PRESETS_DIR, { recursive: true });

    // --- Files ----------------------------------------------------------------
    for (const { id, zipPath } of archive.presetDescriptors) {
        const target = path.join(PRESETS_DIR, `${id}.json`);
        fs.writeFileSync(target, await archive.raw.file(zipPath).async('nodebuffer'));
        console.log(`${green('wrote')} public/presets/${id}.json`);
    }
    for (const cover of archive.covers) {
        const target = path.join(PRESETS_DIR, path.basename(cover));
        fs.writeFileSync(target, await archive.raw.file(cover).async('nodebuffer'));
        console.log(`${green('wrote')} public/presets/${path.basename(cover)}`);
    }

    // --- Pack audio, staged for the steps this script will not take -----------
    if (archive.packEntry) {
        const { originals: stage } = layout(root, archive.packEntry.id);
        fs.mkdirSync(stage, { recursive: true });
        for (const entry of archive.audio) {
            const target = path.join(stage, entry.slice('audio/'.length));
            fs.mkdirSync(path.dirname(target), { recursive: true });
            fs.writeFileSync(target, await archive.raw.file(entry).async('nodebuffer'));
        }
        if (archive.packCover) {
            fs.writeFileSync(
                path.join(stage, `cover${path.extname(archive.packCover)}`),
                await archive.raw.file(archive.packCover).async('nodebuffer'),
            );
        }
        const readme = archive.raw.file('README.md');
        if (readme) fs.writeFileSync(path.join(stage, 'README.md'), await readme.async('nodebuffer'));
        console.log(`${green('staged')} ${archive.audio.length} files → ${shown(stage)}/`);
    }

    // --- The manifest ---------------------------------------------------------
    // Backed up beside itself before anything is touched. `git diff` is the real
    // safety net, but a maintainer half-way through an import should not have to
    // remember that.
    fs.writeFileSync(`${MANIFEST_PATH}.bak`, manifest.raw);

    const data = JSON.parse(manifest.raw);
    data.presets = data.presets || [];
    const results = [];

    archive.presetEntries.forEach(entry => results.push([entry.id, mergeEntry(data.presets, entry, force)]));
    if (archive.packEntry) results.push([archive.packEntry.id, mergeEntry(data.packs, archive.packEntry, force)]);

    const clashes = results.filter(([, r]) => r === 'clash');
    if (clashes.length) {
        die(
            `${clashes.map(([id]) => `"${id}"`).join(', ')} already exist in the manifest.\n` +
            '  Re-run with --force to replace them.',
        );
    }

    // Match the file's own formatting so the diff is the change and nothing else.
    const serialized = JSON.stringify(data, null, 2).replace(/\n/g, manifest.eol) + manifest.eol;
    fs.writeFileSync(MANIFEST_PATH, serialized);
    results.forEach(([id, result]) => console.log(`${green(result)} ${id} in public/manifest.json`));
    console.log(dim(`backup at public/manifest.json.bak`));
};

// ─────────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────────

const main = async () => {
    const zipPath = argv.find(a => !a.startsWith('--'));
    const shouldApply = argv.includes('--apply');
    const force = argv.includes('--force');

    if (!zipPath) {
        console.log(`
${bold('Import a Spotykach submission archive')}

  node scripts/import-submission.mjs <archive.zip>           ${dim('check only (default)')}
  node scripts/import-submission.mjs <archive.zip> --apply   ${dim('write the changes')}

  ${dim('--normalize')}   with --apply, run scripts/normalize.py over the staged audio
  ${dim('--force')}       replace manifest entries whose id already exists
  ${dim('--stage <dir>')} put the upload folder somewhere other than beside the archive
`);
        process.exit(1);
    }
    if (!fs.existsSync(zipPath)) die(`No such file: ${zipPath}`);

    const archive = await readArchive(zipPath);
    const manifest = loadManifest();
    const root = stagingRoot(zipPath);

    // --- What arrived ---------------------------------------------------------
    heading('Submission');
    const details = archive.submission?.details || {};
    console.log(`  artist    ${details.artist || dim('not given')}`);
    if (details.name) console.log(`  pack      ${details.name} ${dim(`(${details.id})`)}`);
    archive.presetEntries.forEach(entry => {
        const filled = archive.presetDescriptors
            .find(d => d.id === entry.id)?.descriptor
            ?.tapes ? Object.values(archive.presetDescriptors.find(d => d.id === entry.id).descriptor.tapes)
                .reduce((n, t) => n + (t.slots || []).filter(s => s.fileId).length, 0) : 0;
        console.log(`  preset    ${entry.name || dim('unnamed')} ${dim(`(${entry.id}, ${filled}/36 slots)`)}`);
    });
    console.log(`  licence   ${archive.submission?.license?.choice || dim('not stated')}`);
    if (archive.letter) {
        const note = archive.letter.split('## Notes from the artist')[1];
        if (note) console.log(`\n  ${cyan('Artist note:')} ${note.split('##')[0].trim().split('\n').join('\n  ')}`);
    }

    // --- Where everything lands, said before any of it does -------------------
    heading('Where this goes');
    console.log(`  repo        ${dim('public/presets/ and public/manifest.json — committed')}`);
    if (archive.packEntry) {
        const paths = layout(root, archive.packEntry.id);
        console.log(`  originals   ${shown(paths.originals)}/ ${dim('— the masters, keep, never upload')}`);
        console.log(`  to upload   ${shown(paths.upload)}/ ${dim('— mirrors the R2 bucket; drag samples/ in')}`);
    } else {
        console.log(`  ${dim('Nothing to upload — this submission adds no audio.')}`);
    }

    // --- Checks ---------------------------------------------------------------
    heading('Checks');
    checkArchive(archive, manifest);
    printFindings();

    const failures = findings.filter(f => f.level === 'fail').length;
    const warnings = findings.filter(f => f.level === 'warn').length;

    // --- Plan or apply --------------------------------------------------------
    heading(shouldApply ? 'Applying' : 'Plan (nothing written)');

    if (failures) {
        console.log(`\n${red(`${failures} check${failures === 1 ? '' : 's'} failed.`)} Nothing will be published until they pass.\n`);
        process.exit(1);
    }

    if (!shouldApply) {
        buildPlan(archive, root).forEach(step => {
            if (step.kind === 'copy') console.log(`  copy      ${step.from} ${dim('→')} ${step.to}`);
            if (step.kind === 'manifest') console.log(`  manifest  ${step.what}`);
            if (step.kind === 'stage') console.log(`  stage     ${step.what}`);
        });
        console.log(`\n${warnings ? yellow(`${warnings} warning(s).`) : green('All checks passed.')} Re-run with ${bold('--apply')} to write.\n`);
        return;
    }

    await apply(archive, manifest, force, root);

    if (archive.packEntry && argv.includes('--normalize')) {
        heading('Normalizing');
        const python = findPython();
        if (!python) die('No Python found — install Python 3, or drop --normalize and do it by hand.');

        // The findings from the check phase have been reported; what follows is about
        // the audio that now exists on disk, and is judged on its own.
        findings.length = 0;
        await normalizePack(archive, python, root);
        printFindings();

        if (findings.some(f => f.level === 'fail')) {
            console.log(
                `\n${red('Normalizing did not finish cleanly.')} The manifest is already updated —\n` +
                `${dim('  fix the audio, run it again, and check the paths before uploading anything.')}\n`,
            );
        }
    }

    heading('Next');
    if (archive.presetEntries.length) {
        console.log('  1. npm run dev, open the Preset → SD door, and load the preset.');
        console.log(`     ${dim('Watch the console for missing-asset warnings — that is the path check, for real.')}`);
    } else {
        console.log('  1. npm run dev and open Browse — the pack appears once its audio is on R2.');
    }
    if (archive.packEntry) {
        const paths = layout(root, archive.packEntry.id);
        if (argv.includes('--normalize')) {
            console.log(`  2. Open ${shown(paths.upload)}/ and drag ${bold('samples/')} into the R2 bucket root.`);
            console.log(`     ${dim("Its layout is the bucket's layout — nothing to rename or rearrange.")}`);
        } else {
            console.log(`  2. Re-run with ${bold('--normalize')} to convert the audio and build the upload folder.`);
            console.log(`     ${dim("Until then the staged files are still the artist's masters — not uploadable.")}`);
        }
        console.log('  3. git diff public/manifest.json, then commit.');
    } else {
        console.log('  2. git diff public/manifest.json, then commit that and public/presets/.');
    }
    console.log();
};

main().catch(e => die(e.stack || e.message));

/* eslint-disable @typescript-eslint/no-explicit-any -- zips, stand-in folders and globals */
/**
 * The project file out and back in, every older export through the importer,
 * project folders saved and loaded on disk (a temp folder), and project files
 * dropped on the Submit tool.
 *
 * Run through scripts/check-project-file.mjs (it bundles this file). Library
 * downloads are stand-ins: node has no AudioContext to convert them, and the tests
 * stay off the network.
 */
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import JSZip from 'jszip';
import { buildProjectFile, findProjectInZip, folderReader, librarySamplePath, loadProject, readManifest, type ProjectReader } from '../src/utils/projectFile';
import { compareProjects, describeDifference, isIdentical, type ProjectSide } from '../src/utils/projectCompare';
import { duplicateProject, exportSDStructure, loadProjectFromDirectory, saveProjectToDirectory } from '../src/utils/exportUtils';
import { externalSampleAssetBaseUrl } from '../src/utils/assetUtils';
import { getInitialState } from '../src/utils/initialState';
import { assembleWav } from '../src/lib/audio/wavHeader';
import { intakeProjectFile, type ProjectIntake } from '../src/submission/intake';
import { handoffFromAppState } from '../src/submission/handoff';
import type { SubmissionFile } from '../src/submission/draft';
import { TAPE_COLORS, type AppState, type AudioVersion, type FileRecord, type TapeColor } from '../src/types';
import { DirH } from './testFolder';

let failures = 0;
const check = (ok: boolean, label: string, detail = '') => {
    console.log(`${ok ? '  ok ' : 'FAIL '} ${label}${detail ? `  (${detail})` : ''}`);
    if (!ok) failures++;
};
(globalThis as any).window = { addEventListener() {}, removeEventListener() {} };

// JSZip reads a Blob through FileReader, which browsers have and node doesn't.
(globalThis as any).FileReader = class {
    result: ArrayBuffer | null = null;
    onload: ((e: any) => void) | null = null;
    onerror: ((e: any) => void) | null = null;
    readAsArrayBuffer(blob: Blob) {
        blob.arrayBuffer().then(r => { this.result = r; this.onload?.({ target: this }); }, error => this.onerror?.({ target: { error } }));
    }
};

// No network: a library download that isn't stubbed fails as it would offline.
(globalThis as any).fetch = async () => { throw new Error('offline'); };

// downloadBlob, for the SD card folder: keep what it would have downloaded.
const downloads: Array<{ name: string; blob: Blob }> = [];
let lastObjectUrl: Blob | null = null;
(URL as any).createObjectURL = (blob: Blob) => { lastObjectUrl = blob; return 'blob:test'; };
(URL as any).revokeObjectURL = () => {};
(globalThis as any).document = {
    createElement: () => ({ click(this: any) { downloads.push({ name: this.download, blob: lastObjectUrl! }); } }),
    body: { appendChild() {}, removeChild() {} },
};

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const wav = (seconds: number, hz: number) => {
    const frames = Math.round(seconds * 48000);
    const f = new Float32Array(frames * 2);
    for (let i = 0; i < frames; i++) { f[i * 2] = Math.sin(2 * Math.PI * hz * i / 48000) * 0.4; f[i * 2 + 1] = f[i * 2]; }
    return assembleWav(new Uint8Array(f.buffer));
};

const LIB_URL = `${externalSampleAssetBaseUrl}/samples/Hainbach/Magic Box.flac`;
const LIB_EDIT_URL = `${externalSampleAssetBaseUrl}/samples/Hainbach/Multitrack Frippertronic 2.flac`;

const version = (id: string, description: string, hz: number, processing?: AudioVersion['processing']): AudioVersion =>
    ({ id, timestamp: 1, description, blob: wav(0.05, hz), duration: 0.05, processing });

const file = (id: string, name: string, originalName: string, versions: AudioVersion[], extra: Partial<FileRecord> = {}): FileRecord =>
    ({ id, name, originalName, versions, currentVersionId: versions[versions.length - 1].id, isParked: false, ...extra });

/** Serpentinelore, as in the Nov 26 test: own files edited, one library sample as is and one edited. */
const project = (): AppState => {
    const s = getInitialState();
    s.files = {
        own: file('own', 'VINYL_CRACKLE_19', 'Vinyl Crackle 19', [
            version('own-v1', 'Original', 220),
            version('own-v2', 'Trimmed', 230, ['trimmed']),
            version('own-v3', 'Normalized (-1dB)', 240, ['normalized']),
        ], { origin: 'Jonwtr Explorations' }),
        lib: file('lib', 'MAGIC-BOX', 'Magic Box', [version('lib-v1', 'Imported Sample', 330)],
            { origin: "Hainbach's Spotykach Tapes", sourceSamplePath: LIB_URL }),
        libEdit: file('libEdit', 'MULTITRACK-FRIPPERTRONIC-2', 'Multitrack Frippertronic 2', [
            version('libEdit-v1', 'Imported Sample', 440),
            version('libEdit-v2', 'Normalized (-1dB)', 450, ['normalized']),
        ], { origin: "Hainbach's Spotykach Tapes", sourceSamplePath: LIB_EDIT_URL }),
        archive: file('archive', 'BIRDS', 'birds.ogg', [version('archive-v1', 'Imported Sample', 550)],
            { sourceSamplePath: 'https://upload.wikimedia.org/birds.ogg', isParked: true }),
    };
    s.tapes.Blue.slots[0].fileId = 'own';
    s.tapes.Green.slots[0].fileId = 'lib';
    s.tapes.Green.slots[1].fileId = 'libEdit';
    s.tapes.Blue.notes = 'Blue notes';
    s.projectNotes = 'Project notes';
    s.projectConfig = { ...s.projectConfig!, grt_mx_a: 5 };
    return s;
};

/**
 * A Project Manager zip's contents, as the app wrote them until the project file:
 * each file's current version in custom_assets/, named by its originalName.
 */
const oldDescriptor = (s: AppState, name: string) => {
    const files: Record<string, any> = {};
    const customBlobs: Record<string, Blob> = {};
    for (const [id, f] of Object.entries(s.files)) {
        const current = f.versions.find(v => v.id === f.currentVersionId)!;
        const blobRef = `custom_assets/${current.id}.wav`;
        files[id] = { originalName: f.originalName, origin: f.origin, license: f.license, blobRef };
        customBlobs[blobRef] = current.blob!;
    }
    const tapes = Object.fromEntries(TAPE_COLORS.map(c => [c, { slots: s.tapes[c].slots.map(x => ({ id: x.id, fileId: x.fileId })), notes: s.tapes[c].notes }]));
    return { descriptor: { schema: 'spotykach-project/1.0', name, tapes, files, projectNotes: s.projectNotes, projectConfig: s.projectConfig }, customBlobs };
};

const bytes = async (b: Blob | null | undefined) => b ? Buffer.from(await b.arrayBuffer()) : null;
const sameAudio = async (a: Blob | null | undefined, b: Blob | null | undefined) => {
    const [x, y] = await Promise.all([bytes(a), bytes(b)]);
    return !!x && !!y && x.equals(y);
};
const zipOf = async (blob: Blob) => JSZip.loadAsync(await blob.arrayBuffer());
const assetNames = (zip: JSZip, folder: string) =>
    Object.keys(zip.files).filter(p => p.startsWith(`${folder}Assets/`) && !zip.files[p].dir).map(p => p.slice(`${folder}Assets/`.length)).sort();
const tempDir = (label: string) => fs.mkdtempSync(path.join(os.tmpdir(), `projectfile-${label}-`));

const noDownload = async (): Promise<Blob> => { throw new Error('nothing should be downloaded'); };

// ---------------------------------------------------------------------------

const run = async () => {
    const source = project();

    console.log('\nLibrary paths');
    check(librarySamplePath(LIB_URL) === '/Hainbach/Magic Box.flac', 'a pack URL becomes its pack path', String(librarySamplePath(LIB_URL)));
    check(librarySamplePath('/Hainbach/Magic Box.flac') === '/Hainbach/Magic Box.flac', 'a preset\'s pack path stays');
    check(librarySamplePath('blob:http://localhost:5173/abc') === null, 'an object URL is not a library sample');
    check(librarySamplePath('project:other/file') === null, 'another project\'s file is not one');
    check(librarySamplePath('https://upload.wikimedia.org/birds.ogg') === null, 'an archive search result is not one');
    check(librarySamplePath(undefined) === null, 'no source, no path');

    console.log('\nProject file, with library audio');
    {
        const zip = await zipOf(await buildProjectFile(source, 'Serpentinelore', { libraryAudio: true }));
        check(!!zip.file('Serpentinelore/project.json') && !!zip.file('Serpentinelore/notes.md'), 'the project folder is zipped under its name');
        check(JSON.stringify(assetNames(zip, 'Serpentinelore/')) === JSON.stringify(['archive-v1.wav', 'lib-v1.wav', 'libEdit-v1.wav', 'libEdit-v2.wav', 'own-v1.wav', 'own-v3.wav']),
            'every original and current version is packed, the version between them isn\'t', assetNames(zip, 'Serpentinelore/').join(' '));
        check(source.files.own.versions.length === 3, 'the open project keeps its history');

        const found = await findProjectInZip(zip, 'Serpentinelore_2026-11-26 (1).zip');
        check(found?.name === 'Serpentinelore' && found.manifest.kind === 'project', 'the importer finds it and takes the name from inside', `${found?.name}/${found?.manifest.kind}`);
        const state = await loadProject(found!.manifest, found!.read, { fetchSample: noDownload });
        const own = state.files.own;
        check(own.name === 'VINYL_CRACKLE_19' && own.originalName === 'Vinyl Crackle 19', 'names come back', own.name);
        check(own.versions.map(v => v.id).join() === 'own-v1,own-v3' && own.currentVersionId === 'own-v3', 'original and current come back, current selected', own.versions.map(v => `${v.id}:${v.description}`).join());
        check(await sameAudio(own.versions[1].blob, source.files.own.versions[2].blob), 'the edit\'s audio is byte for byte the same');
        check(await sameAudio(state.files.lib.versions[0].blob, source.files.lib.versions[0].blob), 'packed library audio comes back as it was');
        check(state.tapes.Blue.slots[0].fileId === 'own' && state.tapes.Green.slots[1].fileId === 'libEdit', 'slots come back');
        check(state.projectNotes === 'Project notes' && state.tapes.Blue.notes === 'Blue notes' && state.projectConfig?.grt_mx_a === 5, 'notes and device settings come back');
        check(state.files.archive.isParked && !state.loadIssues?.missingAssets?.length, 'the pool comes back, nothing missing');
    }

    console.log('\nProject file, without library audio');
    let referenced: JSZip;
    {
        // A stored hash, which the download must not keep.
        const hashed = project();
        hashed.files.lib.versions[0].hash = 'hash-of-the-exporters-conversion';
        referenced = await zipOf(await buildProjectFile(hashed, 'Serpentinelore', { libraryAudio: false }));
        check(JSON.stringify(assetNames(referenced, 'Serpentinelore/')) === JSON.stringify(['archive-v1.wav', 'libEdit-v2.wav', 'own-v1.wav', 'own-v3.wav']),
            'unedited library audio is left out; the edit and other sources are packed', assetNames(referenced, 'Serpentinelore/').join(' '));
        const json = JSON.parse(await referenced.file('Serpentinelore/project.json')!.async('string'));
        check(json.files.lib.versions[0].samplePath === '/Hainbach/Magic Box.flac' && !json.files.lib.versions[0].blobRef, 'the left-out version stores its pack path');
        check(json.files.libEdit.versions[0].samplePath === '/Hainbach/Multitrack Frippertronic 2.flac' && json.files.libEdit.versions[1].blobRef === 'Assets/libEdit-v2.wav',
            'an edited library file: original by path, edit packed');

        const asked: string[] = [];
        const downloaded = wav(0.05, 999);
        const found = await findProjectInZip(referenced, 'Serpentinelore_2026-11-26.zip');
        const state = await loadProject(found!.manifest, found!.read, { fetchSample: async p => { asked.push(p); return downloaded; } });
        check(asked.sort().join() === '/Hainbach/Magic Box.flac,/Hainbach/Multitrack Frippertronic 2.flac', 'the import downloads exactly those two', asked.join(' | '));
        const lib = state.files.lib.versions[0];
        check(lib.blob === downloaded && lib.samplePath === undefined && lib.hash === undefined, 'a download becomes the version\'s audio; its old hash goes');
        check(await sameAudio(state.files.libEdit.versions[1].blob, source.files.libEdit.versions[1].blob), 'the edit comes from the file, not the library');
        check(!state.loadIssues?.missingAssets?.length, 'nothing missing');
    }

    console.log('\nProject file, imported offline');
    const work = new DirH('work', tempDir('work'));
    {
        const found = await findProjectInZip(referenced, 'Serpentinelore_2026-11-26.zip');
        const state = await loadProject(found!.manifest, found!.read, { fetchSample: async () => { throw new Error('Failed to fetch'); } });
        const missing = state.loadIssues?.missingAssets ?? [];
        check(missing.length === 2 && missing.every(m => m.reason.includes('sample library')), 'both downloads are listed as missing, saying why', missing.map(m => m.reason).join(' | '));
        check(state.files.lib.versions[0].blob === null && state.files.lib.versions[0].samplePath === '/Hainbach/Magic Box.flac', 'the version keeps its pack path');
        check(!!state.files.libEdit.versions[1].blob, 'the edit is there anyway');

        await saveProjectToDirectory(state, work as any, undefined, 'Offline');
        const saved = JSON.parse(fs.readFileSync(path.join(work.p, 'Projects', 'Offline', 'project.json'), 'utf8'));
        check(saved.files.lib.versions[0].samplePath === '/Hainbach/Magic Box.flac', 'saved, it still has the pack path for the next load');
        const reloaded = await loadProjectFromDirectory('Offline', work as any);
        check(reloaded.loadIssues?.missingAssets?.length === 2 && reloaded.loadIssues.missingAssets[0].reason.includes('offline'), 'loading it tries the download again', reloaded.loadIssues?.missingAssets?.[0]?.reason);
    }

    console.log('\nProject folders on disk');
    {
        await saveProjectToDirectory(source, work as any, undefined, 'Serpentinelore');
        const dir = path.join(work.p, 'Projects', 'Serpentinelore');
        check(fs.readdirSync(path.join(dir, 'Assets')).sort().join() === 'archive-v1.wav,lib-v1.wav,libEdit-v1.wav,libEdit-v2.wav,own-v1.wav,own-v3.wav', 'a save keeps every version\'s audio, library audio too');
        const loaded = await loadProjectFromDirectory('Serpentinelore', work as any);
        check(loaded.files.own.name === 'VINYL_CRACKLE_19' && loaded.files.own.versions.length === 2, 'it loads back by the same reader', `${loaded.files.own.versions.length} versions`);
        check(await sameAudio(loaded.files.own.versions[1].blob, source.files.own.versions[2].blob), 'with the same audio');
        check((await readManifest(folderReader(new DirH('x', dir) as any)))?.name === 'Serpentinelore', 'the folder names itself');
    }

    console.log('\nAn import from before the project file (descriptor beside project.json)');
    {
        // The old importer copied a Project Manager zip as it was.
        const { descriptor, customBlobs } = oldDescriptor(source, 'Imported');
        const dir = path.join(work.p, 'Projects', 'Imported');
        fs.mkdirSync(path.join(dir, 'custom_assets'), { recursive: true });
        fs.writeFileSync(path.join(dir, 'project-descriptor.json'), JSON.stringify(descriptor));
        for (const [ref, blob] of Object.entries(customBlobs)) fs.writeFileSync(path.join(dir, ref), Buffer.from(await blob.arrayBuffer()));

        const asImported = await loadProjectFromDirectory('Imported', work as any);
        check(asImported.files.own.name === 'Vinyl Crackle 19' && asImported.files.own.versions.length === 1, 'it opens from the descriptor (current versions, library names)');

        // Then saved, the way the bug went: project.json written, the descriptor older.
        const edited = { ...asImported, projectNotes: 'Saved after the import' };
        fs.writeFileSync(path.join(dir, 'project.json'), JSON.stringify({ files: {}, tapes: edited.tapes }));
        const past = new Date(Date.now() - 60_000);
        fs.utimesSync(path.join(dir, 'project.json'), past, past);
        check((await readManifest(folderReader(new DirH('x', dir) as any)))?.kind === 'descriptor', 'with both, the newer one is the project (here the descriptor)');

        await saveProjectToDirectory(edited, work as any, undefined, 'Imported');
        check(!fs.existsSync(path.join(dir, 'project-descriptor.json')), 'a save removes the descriptor');
        check(fs.existsSync(path.join(dir, 'custom_assets')), '…but not custom_assets/, which the open project may still read');
        const reopened = await loadProjectFromDirectory('Imported', work as any);
        check(reopened.projectNotes === 'Saved after the import', 'and the save is what opens next time');

        // A folder where the descriptor is older than the save, from before this fix.
        const old = path.join(work.p, 'Projects', 'Imported');
        fs.writeFileSync(path.join(old, 'project-descriptor.json'), JSON.stringify(descriptor));
        fs.utimesSync(path.join(old, 'project-descriptor.json'), past, past);
        const fixed = await loadProjectFromDirectory('Imported', work as any);
        check(fixed.projectNotes === 'Saved after the import', 'an older descriptor no longer hides a save');

        // Clone copies the manifest that loads, not both.
        fs.utimesSync(path.join(old, 'project-descriptor.json'), new Date(), new Date(Date.now() + 60_000));
        await duplicateProject(work as any, 'Imported', 'Imported-copy');
        const copy = path.join(work.p, 'Projects', 'Imported-copy');
        check(fs.existsSync(path.join(copy, 'project-descriptor.json')) && !fs.existsSync(path.join(copy, 'project.json')), 'a clone copies only the manifest that loads');
        check(JSON.parse(fs.readFileSync(path.join(copy, 'project-descriptor.json'), 'utf8')).name === 'Imported-copy', 'renamed');
    }

    console.log('\nOlder exports through the importer');
    {
        // Project Manager zip, before step 2.
        const { descriptor, customBlobs } = oldDescriptor(source, 'Serpentinelore');
        const pm = new JSZip();
        pm.file('Serpentinelore/project-descriptor.json', JSON.stringify(descriptor));
        for (const [ref, blob] of Object.entries(customBlobs)) pm.file(`Serpentinelore/${ref}`, await blob.arrayBuffer());
        const pmFound = await findProjectInZip(pm, 'Serpentinelore_2026-11-26.zip');
        const pmState = pmFound && await loadProject(pmFound.manifest, pmFound.read, { fetchSample: noDownload });
        check(pmFound?.name === 'Serpentinelore' && pmFound.manifest.kind === 'descriptor', 'a Project Manager zip', `${pmFound?.name}/${pmFound?.manifest.kind}`);
        check(!!pmState && await sameAudio(pmState.files.own.versions[0].blob, source.files.own.versions[2].blob), '…with the current audio');

        // Full Backup Bundle: project.json at the root, bare blobRefs, audio in blobs/.
        const bundle = new JSZip();
        const files: Record<string, any> = {};
        for (const [id, f] of Object.entries(source.files)) {
            files[id] = { ...f, versions: f.versions.map(v => ({ ...v, blob: null, blobRef: `${v.id}.wav` })) };
            for (const v of f.versions) bundle.file(`blobs/${v.id}.wav`, await v.blob!.arrayBuffer());
        }
        bundle.file('project.json', JSON.stringify({ files, tapes: source.tapes, projectNotes: source.projectNotes, metadata: { appName: 'Spotykach WAV Builder', exportDate: '2026-11-20T10:00:00Z' } }));
        const bundleFound = await findProjectInZip(bundle, 'Spotykach_Project_2026-11-20.zip');
        const bundleState = bundleFound && await loadProject(bundleFound.manifest, bundleFound.read, { fetchSample: noDownload });
        check(bundleFound?.name === 'Spotykach_Project', 'a Full Backup Bundle, named after its zip', bundleFound?.name);
        check(!!bundleState && bundleState.files.own.versions.length === 3 && bundleState.files.own.versions.every(v => !!v.blob) && !bundleState.loadIssues?.missingAssets?.length,
            '…with every version\'s audio from blobs/');

        // SD card folder from before step 2, with the bundle nested.
        const sk = new JSZip();
        sk.file('SK/B/1.WAV', await source.files.own.versions[2].blob!.arrayBuffer());
        sk.file('SK/PROJECT_BACKUP/project_backup.zip', await bundle.generateAsync({ type: 'arraybuffer' }));
        const skFound = await findProjectInZip(sk, 'Serpentinelore-SK_2026-11-20 (2).zip');
        check(skFound?.name === 'Serpentinelore' && skFound.manifest.kind === 'project', 'an old SD card folder, through its nested backup', skFound?.name);

        // Not a project.
        const loose = new JSZip();
        loose.file('SK/B/1.WAV', 'x');
        loose.file('SK/project.json', JSON.stringify({ metadata: { projectName: 'Card' }, tapes: source.tapes, files: { own: { name: 'x' } } }));
        check(await findProjectInZip(loose, 'card.zip') === null, 'a card\'s SK/project.json alone isn\'t a project');
    }

    console.log('\nSD card folder with the project copy');
    {
        downloads.length = 0;
        await exportSDStructure(source, {
            directWrite: false, skMode: 'clean', includeConfig: true,
            projectName: 'Serpentinelore', mirrorProjectToSD: true, workHandle: work as any,
        });
        const sk = downloads[0] && await zipOf(downloads[0].blob);
        check(!!sk?.file('SK/B/1.WAV') && !!sk.file('WAV_Builder/Projects/Serpentinelore/project.json'), 'the zip holds SK/ and the project where a card keeps it', downloads[0]?.name);
        check(!!sk && assetNames(sk, 'WAV_Builder/Projects/Serpentinelore/').length === 6, 'with the saved audio');
        sk?.file('SK/project.json', JSON.stringify({ metadata: { projectName: 'Card' }, tapes: source.tapes, files: {} }));
        const found = sk && await findProjectInZip(sk, downloads[0].name);
        check(found?.name === 'Serpentinelore' && found.manifest.kind === 'project' && Object.keys(found.manifest.data.files).length === 4, 'the importer opens the project copy, not SK/project.json');

        downloads.length = 0;
        await exportSDStructure(source, { directWrite: false, skMode: 'clean', includeConfig: true, projectName: 'Serpentinelore' });
        const plain = downloads[0] && await zipOf(downloads[0].blob);
        check(!!plain && !Object.keys(plain.files).some(p => p.startsWith('WAV_Builder/')), 'without the setting, SK/ only');
    }

    console.log('\nComparing with the project in the work folder');
    {
        // Saved from `source` under "Project folders on disk". Reads of audio are counted,
        // to see which comparisons needed the bytes.
        let audioReads = 0;
        const counted = (read: ProjectReader): ProjectReader => async (p) => { audioReads++; return read(p); };
        const folder = async (): Promise<ProjectSide> => {
            const read = folderReader(new DirH('x', path.join(work.p, 'Projects', 'Serpentinelore')) as any);
            return { manifest: (await readManifest(read))!, read: counted(read) };
        };
        const zipped = async (state: AppState, libraryAudio = true): Promise<ProjectSide> => {
            const found = (await findProjectInZip(await zipOf(await buildProjectFile(state, 'Serpentinelore', { libraryAudio })), 'Serpentinelore.zip'))!;
            return { manifest: found.manifest, read: counted(found.read) };
        };
        const compare = async (state: AppState, libraryAudio = true) => compareProjects(await folder(), await zipped(state, libraryAudio));

        audioReads = 0;
        let d = await compare(project());
        check(isIdentical(d) && audioReads === 0, 'the same project is identical, settled by version ids without reading audio', `${describeDifference(d) || 'identical'}, ${audioReads} reads`);
        d = await compare(project(), false);
        check(isIdentical(d), 'also when its library samples went by reference', describeDifference(d) || 'identical');

        const edited = project();
        edited.files.own.versions.push(version('own-v4', 'Faded', 260, ['trimmed']));
        edited.files.own.currentVersionId = 'own-v4';
        d = await compare(edited);
        check(d.slots.join() === 'B1' && !d.pool && !d.notes && !d.config, 'an edit in B1 shows as B1', describeDifference(d));

        const sameBytes = project();
        sameBytes.files.own.versions.push(version('own-v9', 'Normalized again', 240, ['normalized']));
        sameBytes.files.own.currentVersionId = 'own-v9';
        audioReads = 0;
        d = await compare(sameBytes);
        check(isIdentical(d) && audioReads > 0, 'the same audio under another version id is the same, by its hash', `${describeDifference(d) || 'identical'}, ${audioReads} reads`);

        const renamed = project();
        renamed.files.lib.name = 'MAGIC-BOX-2';
        renamed.tapes.Blue.slots[1].fileId = 'own';
        renamed.tapes.Blue.slots[0].fileId = null;
        d = await compare(renamed);
        check(d.slots.join() === 'B1,B2,G1', 'a renamed file and a moved one show by slot', describeDifference(d));

        const other = project();
        other.projectNotes = 'Changed notes';
        other.projectConfig = { ...other.projectConfig!, grt_mx_b: 7 };
        delete other.files.archive;
        other.files.extra = file('extra', 'EXTRA', 'extra.wav', [version('extra-v1', 'Original', 660)], { isParked: true });
        d = await compare(other);
        check(!d.slots.length && d.pool === 2 && d.notes && d.config, 'notes, settings and the pool', describeDifference(d));

        const { descriptor, customBlobs } = oldDescriptor(source, 'Serpentinelore');
        const old = new JSZip();
        old.file('Serpentinelore/project-descriptor.json', JSON.stringify(descriptor));
        for (const [ref, blob] of Object.entries(customBlobs)) old.file(`Serpentinelore/${ref}`, await blob.arrayBuffer());
        const oldFound = (await findProjectInZip(old, 'Serpentinelore_2026-11-26.zip'))!;
        d = await compareProjects(await folder(), oldFound);
        check(isIdentical(d), 'an old Project Manager zip of it is identical, by hashes (it has no names or version ids to go by)', describeDifference(d) || 'identical');

        check(describeDifference({ slots: ['B2', 'G5', 'P1'], pool: 0, notes: true, config: false }) === '3 slots differ: B2, G5, P1. The notes differ.', 'the summary line');
        check(describeDifference({ slots: ['B2'], pool: 1, notes: false, config: true }) === '1 slot differs: B2. 1 pool file differs. The device settings differ.', '…in the singular');
    }

    console.log('\nDropped on the Submit tool');
    {
        const fileOf = (data: BlobPart, name: string) => new File([data], name, { type: name.endsWith('.zip') ? 'application/zip' : 'application/json' });
        const slotIndex = (color: TapeColor, slot: number) => TAPE_COLORS.indexOf(color) * 6 + slot - 1;
        const row = (intake: ProjectIntake, fileName: string) => intake.files.find(f => f.fileName === fileName);

        const zipped = await buildProjectFile(source, 'Serpentinelore', { libraryAudio: false });
        const intake = await intakeProjectFile(fileOf(zipped, 'Serpentinelore_2026-11-26.zip'));
        const own = row(intake, 'Vinyl Crackle 19');
        const lib = row(intake, 'Magic Box');
        const libEdit = row(intake, 'Multitrack Frippertronic 2');
        check(intake.files.length === 4 && !intake.rejected.length, 'a project file gives a row per file, the parked one too', `${intake.files.length} rows, ${intake.rejected.length} rejected`);
        check(!!own && !own.sourceSamplePath && await sameAudio(own.blob, source.files.own.versions[2].blob), 'own audio: the current version, to send');
        check(lib?.sourceSamplePath === LIB_URL && lib.blob.size === 0, 'an unedited library sample left out of the file: a pack row without audio');
        check(libEdit?.sourceSamplePath === LIB_EDIT_URL && await sameAudio(libEdit.blob, source.files.libEdit.versions[1].blob), 'an edited one: a pack row, with its edited audio to play');
        check(intake.preset.slots[slotIndex('Blue', 1)] === own?.id && intake.preset.slots[slotIndex('Green', 1)] === lib?.id
            && intake.preset.slots[slotIndex('Green', 2)] === libEdit?.id && intake.filledSlots === 3, 'the layout', `${intake.filledSlots} slots`);
        check(intake.preset.name === 'Serpentinelore' && intake.preset.projectNotes === 'Project notes' && intake.preset.tapeNotes[TAPE_COLORS.indexOf('Blue')] === 'Blue notes', 'the name and the notes');
        check(own?.duration === 0.05, 'durations from the project', String(own?.duration));

        const studio = await handoffFromAppState(project(), 'Serpentinelore');
        const described = (rows: SubmissionFile[]) => JSON.stringify(rows.map(({ fileName, title, sourceSamplePath, origin, duration }) => ({ fileName, title, sourceSamplePath, origin, duration })));
        check(described(intake.files) === described(studio.files), 'the rows Prepare a submission makes from the same project in Studio');

        const withLibrary = await intakeProjectFile(fileOf(await buildProjectFile(source, 'Serpentinelore', { libraryAudio: true }), 'Serpentinelore.zip'));
        const libPlays = row(withLibrary, 'Magic Box');
        check(libPlays?.sourceSamplePath === LIB_URL && await sameAudio(libPlays.blob, source.files.lib.versions[0].blob), 'with library audio, still a pack row, and it plays');

        const broken = await zipOf(zipped);
        broken.remove('Serpentinelore/Assets/own-v3.wav');
        const brokenIntake = await intakeProjectFile(fileOf(await broken.generateAsync({ type: 'arraybuffer' }), 'Serpentinelore.zip'));
        check(brokenIntake.rejected.map(r => r.fileName).join() === 'Vinyl Crackle 19' && !row(brokenIntake, 'Vinyl Crackle 19') && brokenIntake.preset.slots[slotIndex('Blue', 1)] === null,
            'own audio missing from the zip: named, and its slot left empty');

        // Its audio sits in Serpentinelore/custom_assets/, which the tool used to look for at the root only.
        const { descriptor, customBlobs } = oldDescriptor(source, 'Serpentinelore');
        const pm = new JSZip();
        pm.file('Serpentinelore/project-descriptor.json', JSON.stringify(descriptor));
        for (const [ref, blob] of Object.entries(customBlobs)) pm.file(`Serpentinelore/${ref}`, await blob.arrayBuffer());
        const pmIntake = await intakeProjectFile(fileOf(await pm.generateAsync({ type: 'arraybuffer' }), 'Serpentinelore_2026-11-26.zip'));
        check(pmIntake.files.length === 4 && !pmIntake.rejected.length && await sameAudio(row(pmIntake, 'Vinyl Crackle 19')?.blob, source.files.own.versions[2].blob),
            'a Project Manager zip, with its own audio', `${pmIntake.rejected.length} rejected`);

        const settingsOnly = {
            schema: 'spotykach-project/1.0', name: 'Untitled Project',
            tapes: Object.fromEntries(TAPE_COLORS.map(c => [c, { slots: [1, 2, 3, 4, 5, 6].map(id => ({ id, fileId: c === 'Green' && id === 1 ? 'lib' : c === 'Blue' && id === 1 ? 'own' : null })) }])),
            files: {
                lib: { originalName: 'Magic Box', samplePath: '/Hainbach/Magic Box.flac', samplePackId: 'hainbach-tapes' },
                own: { originalName: 'Vinyl Crackle 19', blobRef: 'custom_assets/own.wav' },
            },
        };
        const bare = await intakeProjectFile(fileOf(JSON.stringify(settingsOnly), 'preset.json'));
        check(bare.files.length === 1 && row(bare, 'Magic Box')?.sourceSamplePath === '/Hainbach/Magic Box.flac' && bare.rejected[0]?.fileName === 'Vinyl Crackle 19'
            && bare.preset.name === '' && bare.filledSlots === 1, 'a settings-only .json: the pack sample by path, own audio named as missing');

        const json = await (await zipOf(zipped)).file('Serpentinelore/project.json')!.async('string');
        const bareProject = await intakeProjectFile(fileOf(json, 'project.json'));
        check(bareProject.preset.name === 'Serpentinelore' && row(bareProject, 'Magic Box')?.sourceSamplePath === LIB_URL && bareProject.rejected.length === 3,
            'a bare project.json: told apart by content, the rest named as missing', `${bareProject.rejected.length} rejected`);

        const audioOnly = new JSZip();
        audioOnly.file('Drums/kick.wav', await wav(0.05, 100).arrayBuffer());
        const message = await intakeProjectFile(fileOf(await audioOnly.generateAsync({ type: 'arraybuffer' }), 'drums.zip')).then(() => '', (e: Error) => e.message);
        check(message.startsWith('That ZIP holds no project.'), 'a zip of audio files says to unzip it', message);
    }

    fs.rmSync(work.p, { recursive: true, force: true });
    console.log(failures ? `\n${failures} failed` : '\nAll good');
    if (failures) process.exitCode = 1;
};

run().catch(e => { console.error(e); process.exitCode = 1; });

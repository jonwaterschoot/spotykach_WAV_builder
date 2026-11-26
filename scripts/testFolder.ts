/* eslint-disable @typescript-eslint/no-explicit-any -- stand-in folder handles */
/**
 * A FileSystemDirectoryHandle over a real folder, for the tests in scripts/: as much
 * of the File System Access API as the card reader route and the project folders use.
 * Names match case-insensitively, as on Windows and macOS.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

export class FileH {
    kind = 'file' as const;
    constructor(public name: string, private p: string) {}
    async getFile() { const b = fs.readFileSync(this.p); return new File([b], this.name, { lastModified: fs.statSync(this.p).mtimeMs }); }
    async createWritable() {
        const chunks: Uint8Array[] = []; const p = this.p;
        return {
            async write(d: any) { chunks.push(d instanceof Blob ? new Uint8Array(await d.arrayBuffer()) : typeof d === 'string' ? new TextEncoder().encode(d) : new Uint8Array(d.buffer ?? d)); },
            async close() { fs.writeFileSync(p, Buffer.concat(chunks)); }, async truncate() {}, async seek() {},
        };
    }
    async move(dir: DirH, name: string) { fs.renameSync(this.p, path.join(dir.p, name)); }
    async queryPermission() { return 'granted'; }
}

export class DirH {
    kind = 'directory' as const;
    constructor(public name: string, public p: string) { fs.mkdirSync(p, { recursive: true }); }
    private find(name: string) { return fs.readdirSync(this.p).find(n => n.toLowerCase() === name.toLowerCase()); }
    async getDirectoryHandle(name: string, o: any = {}) {
        const f = this.find(name);
        if (!f && !o.create) throw Object.assign(new Error('nf'), { name: 'NotFoundError' });
        return new DirH(f ?? name, path.join(this.p, f ?? name));
    }
    async getFileHandle(name: string, o: any = {}) {
        const f = this.find(name);
        if (!f) { if (!o.create) throw Object.assign(new Error('nf'), { name: 'NotFoundError' }); fs.writeFileSync(path.join(this.p, name), ''); }
        return new FileH(f ?? name, path.join(this.p, f ?? name));
    }
    async removeEntry(name: string) { const f = this.find(name); if (f) fs.rmSync(path.join(this.p, f), { recursive: true, force: true }); }
    async *entries(): AsyncGenerator<[string, any]> {
        for (const nm of fs.readdirSync(this.p)) { const q = path.join(this.p, nm); yield [nm, fs.statSync(q).isDirectory() ? new DirH(nm, q) : new FileH(nm, q)]; }
    }
    async *values() { for await (const [, h] of this.entries()) yield h; }
    async *keys() { for await (const [nm] of this.entries()) yield nm; }
    async queryPermission() { return 'granted'; }
    async requestPermission() { return 'granted'; }
}

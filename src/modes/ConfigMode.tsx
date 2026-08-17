import React, { useRef, useState } from 'react';
import { ChevronLeft, Download, FileDown, FolderOpen, HardDrive, Upload } from 'lucide-react';
import { ConfigForm } from '../components/ConfigForm';
import {
  canPickCard, defaultProjectConfig, downloadConfig, ensureWritable, pickCard,
  readConfigFromCard, readConfigFromFile, writeConfigToCard, type ConfigLocation,
} from '../utils/configFile';
import type { ProjectConfig } from '../types';

interface ConfigModeProps {
  onExitToHub: () => void;
}

type Status = { text: string; tone: 'ok' | 'warn' } | null;

/**
 * Device setup at `#/config` — MIDI channels and device options against a bare SD
 * card, with no project and no work folder.
 *
 * The settings live in local state for the length of the visit and are never
 * written to the global IDB slot (locked decision 5). Nothing is read or written
 * until a button is pressed, so the mode costs no permission prompt to enter
 * (locked decision 3), and a browser with no directory picker still gets the whole
 * surface through the file input and the download.
 */
export const ConfigMode: React.FC<ConfigModeProps> = ({ onExitToHub }) => {
  const [config, setConfig] = useState<ProjectConfig>(defaultProjectConfig);
  const [card, setCard] = useState<FileSystemDirectoryHandle | null>(null);
  const [readFrom, setReadFrom] = useState<ConfigLocation | null>(null);
  const [status, setStatus] = useState<Status>(null);
  const [busy, setBusy] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const hasPicker = canPickCard();

  const say = (text: string, tone: 'ok' | 'warn' = 'ok') => setStatus({ text, tone });

  /** The card, asking for it only if we don't already hold one. */
  const withCard = async (
    mode: 'read' | 'readwrite',
    run: (handle: FileSystemDirectoryHandle) => Promise<void>,
  ) => {
    setBusy(true);
    try {
      let handle = card;
      if (!handle) {
        handle = await pickCard(mode);
        if (!handle) return; // Picker dismissed — not an error.
        setCard(handle);
      }
      if (mode === 'readwrite' && !await ensureWritable(handle)) {
        say('Write permission for that card was declined.', 'warn');
        return;
      }
      await run(handle);
    } catch (e) {
      console.warn('[Config] Card operation failed:', e);
      say(e instanceof Error ? e.message : 'That card could not be read.', 'warn');
    } finally {
      setBusy(false);
    }
  };

  const handleReadFromCard = () => withCard('read', async handle => {
    const result = await readConfigFromCard(handle);
    if (!result) {
      setReadFrom(null);
      say(`No config.txt on “${handle.name}”. The settings below are the defaults, so write them to set the card up.`, 'warn');
      return;
    }
    setConfig(result.config);
    setReadFrom(result.location);
    const extra = result.config.unknown?.length
      ? `, keeping ${result.config.unknown.length} setting${result.config.unknown.length === 1 ? '' : 's'} this version doesn't know`
      : '';
    say(`Loaded from ${result.location === 'sk' ? 'SK/config.txt' : 'config.txt'} on “${handle.name}”${extra}.`);
  });

  const handleWriteToCard = () => withCard('readwrite', async handle => {
    await writeConfigToCard(handle, config);
    say(`Written to SK/config.txt on “${handle.name}”.`);
  });

  const handleChangeCard = async () => {
    const handle = await pickCard('read');
    if (!handle) return;
    setCard(handle);
    setReadFrom(null);
    say(`Card set to “${handle.name}”.`);
  };

  const handleOpenFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // So picking the same file twice still fires.
    if (!file) return;
    try {
      const parsed = await readConfigFromFile(file);
      if (!parsed) {
        say(`${file.name} could not be read as a config.txt.`, 'warn');
        return;
      }
      setConfig(parsed);
      setReadFrom(null);
      say(`Loaded ${file.name}.`);
    } catch (err) {
      console.warn('[Config] Could not read file:', err);
      say(`${file.name} could not be read.`, 'warn');
    }
  };

  const handleDownload = async () => {
    await downloadConfig(config);
    say('Downloaded config.txt. Copy it into the SK folder on your card.');
  };

  return (
    <div className="h-screen w-full flex flex-col bg-synthux-main text-white overflow-hidden">

      {/* Mode bar */}
      <div className="shrink-0 flex items-center justify-between gap-4 px-4 py-2 border-b border-white/10 bg-synthux-panel">
        <button
          onClick={onExitToHub}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-bold uppercase tracking-widest
            text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
        >
          <ChevronLeft size={14} /> Hub
        </button>

        <div className="min-w-0 text-center">
          <span className="text-xs font-bold uppercase tracking-[0.2em] text-synthux-blue">Device Config</span>
          <span className="hidden sm:inline text-[11px] text-gray-500 ml-3">
            {hasPicker
              ? 'Your card is asked for when you read or write it, not before.'
              : 'This browser can’t open a folder, so load and save config.txt as a file instead.'}
          </span>
        </div>

        <span className="text-[11px] text-gray-600 font-mono truncate max-w-[30%]">{card?.name || ''}</span>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar">
        <div className="mx-auto max-w-2xl px-4 sm:px-6 py-6 space-y-5">

          {/* Where the settings come from and go */}
          <div className="rounded-xl border border-white/10 bg-synthux-panel/80 p-4 sm:p-5 space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="text-sm font-bold tracking-tight">
                  {card ? card.name : 'No card connected'}
                </h2>
                <p className="text-[11px] text-gray-500 mt-0.5">
                  {card
                    ? readFrom
                      ? `Settings below were read from ${readFrom === 'sk' ? 'SK/config.txt' : 'config.txt at the card root'}.`
                      : 'Nothing read yet, so the settings below are whatever is on screen.'
                    : 'These settings are the device defaults until you read a card or open a file.'}
                </p>
              </div>
              {card && hasPicker && (
                <button
                  onClick={handleChangeCard}
                  disabled={busy}
                  className="shrink-0 flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[10px] font-bold uppercase
                    tracking-widest text-gray-400 hover:text-white hover:bg-white/10 transition-colors disabled:opacity-40"
                >
                  <FolderOpen size={13} /> Change
                </button>
              )}
            </div>

            <div className="grid gap-2 sm:grid-cols-2">
              {hasPicker && (
                <>
                  <button
                    onClick={handleReadFromCard}
                    disabled={busy}
                    className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border border-gray-800
                      bg-black/40 text-gray-300 hover:text-white hover:bg-white/5 transition-all
                      text-[11px] font-bold uppercase tracking-wider disabled:opacity-40"
                  >
                    <FileDown size={14} /> Read from card
                  </button>
                  <button
                    onClick={handleWriteToCard}
                    disabled={busy}
                    className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-synthux-blue text-black
                      font-bold hover:scale-[1.02] transition-all text-[11px] uppercase tracking-wider disabled:opacity-40"
                  >
                    <HardDrive size={14} strokeWidth={3} /> Write to card
                  </button>
                </>
              )}

              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={busy}
                className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border border-gray-800
                  bg-black/40 text-gray-300 hover:text-white hover:bg-white/5 transition-all
                  text-[11px] font-bold uppercase tracking-wider disabled:opacity-40"
              >
                <Upload size={14} /> Open config.txt
              </button>
              <button
                onClick={handleDownload}
                disabled={busy}
                className={`flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg transition-all
                  text-[11px] font-bold uppercase tracking-wider disabled:opacity-40 ${hasPicker
                    ? 'border border-gray-800 bg-black/40 text-gray-300 hover:text-white hover:bg-white/5'
                    : 'bg-synthux-blue text-black hover:scale-[1.02]'}`}
              >
                <Download size={14} /> Download config.txt
              </button>
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept=".txt,text/plain"
              onChange={handleOpenFile}
              className="hidden"
            />

            {status && (
              <p className={`text-[11px] leading-relaxed ${status.tone === 'warn' ? 'text-synthux-orange' : 'text-synthux-yellow'}`}>
                {status.text}
              </p>
            )}
          </div>

          {/* The settings themselves */}
          <div className="rounded-xl border border-white/10 bg-synthux-panel/80 p-4 sm:p-6">
            <ConfigForm
              config={config}
              onChange={setConfig}
              onStatus={text => say(text)}
            />
          </div>

          <p className="text-[11px] text-gray-600 leading-relaxed">
            The card is the device's truth: writing puts these settings in <span className="font-mono">SK/config.txt</span>,
            leaving everything else on the card alone. Nothing is stored on this machine, so reload and you're back to the
            defaults.
          </p>
        </div>
      </div>
    </div>
  );
};

export default ConfigMode;

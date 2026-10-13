/** Readouts shared by the mangler's panels. */

export const formatMs = (ms: number) =>
    ms >= 1000 ? `${(ms / 1000).toFixed(ms >= 10000 ? 0 : 1)} s` : `${Math.round(ms)} ms`;

export const formatSeconds = (s: number) =>
    s >= 60 ? `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}` : `${s.toFixed(1)} s`;

export const formatDb = (db: number) => `${db > 0 ? '+' : ''}${db.toFixed(db % 1 ? 1 : 0)} dB`;

export const formatSt = (st: number) => `${st > 0 ? '+' : ''}${st.toFixed(Math.abs(st) < 10 ? 1 : 0)} st`;

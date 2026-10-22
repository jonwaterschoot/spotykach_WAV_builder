import { DEFAULT_PROJECT_CONFIG } from '../types';
import type { CueSizeMode, ProjectConfig, UnknownConfigSetting } from '../types';

/**
 * The `config.txt` format: reading it, writing it, and making a stored config whole.
 *
 * Pure and dependency-free on purpose, so the config editor can render the file as
 * it is edited without pulling in `exportUtils` and everything it imports.
 */

/**
 * The keys this build understands. Also the filter that decides what counts as an
 * *unknown* pair on the way in — matched case-insensitively by prefix, because the
 * format pads every key to 8 characters.
 */
export const KNOWN_CONFIG_KEYS = [
    'MID_CH_A', 'MID_CH_B', 'MID_PS_A', 'MID_PS_B', 'PRE_LOAD', 'SLC_MN_A', 'SLC_MN_B',
    'CUE_SM_A', 'CUE_SM_B', 'GRT_MX_A', 'GRT_MX_B',
] as const;

const isKnownConfigKey = (key: string): boolean =>
    KNOWN_CONFIG_KEYS.some(known => key.trim().toUpperCase().startsWith(known));

export const generateConfigText = (config: ProjectConfig): string => {
    const lines: string[] = [];
    const appendSetting = (key: string, value: string | number | boolean | null | undefined) => {
        lines.push(key.padEnd(8, ' ').substring(0, 8));
        let valStr = '0';
        if (value === true || value === '1' || value === 1) valStr = '1';
        else if (value === false || value === '0' || value === 0) valStr = '0';
        else if (value !== undefined && value !== null) valStr = value.toString();
        lines.push(valStr);
        lines.push(''); // Empty line separator
    };
    // Use defaults if missing (for older projects). Order follows the manual's table.
    appendSetting('mid_ch_a', config?.mid_ch_a ?? DEFAULT_PROJECT_CONFIG.mid_ch_a);
    appendSetting('mid_ch_b', config?.mid_ch_b ?? DEFAULT_PROJECT_CONFIG.mid_ch_b);
    appendSetting('mid_ps_a', config?.mid_ps_a ?? DEFAULT_PROJECT_CONFIG.mid_ps_a);
    appendSetting('mid_ps_b', config?.mid_ps_b ?? DEFAULT_PROJECT_CONFIG.mid_ps_b);
    appendSetting('pre_load', config?.pre_load ?? DEFAULT_PROJECT_CONFIG.pre_load);
    appendSetting('slc_mn_a', config?.slc_mn_a ?? DEFAULT_PROJECT_CONFIG.slc_mn_a);
    appendSetting('slc_mn_b', config?.slc_mn_b ?? DEFAULT_PROJECT_CONFIG.slc_mn_b);
    // Opt-in (beta): written only when set, never filled from a default.
    if (config?.cue_sm_a !== undefined) appendSetting('cue_sm_a', config.cue_sm_a);
    if (config?.cue_sm_b !== undefined) appendSetting('cue_sm_b', config.cue_sm_b);
    appendSetting('grt_mx_a', config?.grt_mx_a ?? DEFAULT_PROJECT_CONFIG.grt_mx_a);
    appendSetting('grt_mx_b', config?.grt_mx_b ?? DEFAULT_PROJECT_CONFIG.grt_mx_b);
    // Pairs a previous read didn't recognise, written back verbatim after the known
    // ones. A key that has since *become* known is dropped rather than emitted
    // twice — the field above is the current truth for it.
    for (const setting of config?.unknown ?? []) {
        if (!setting?.key || isKnownConfigKey(setting.key)) continue;
        appendSetting(setting.key.trim(), setting.value);
    }
    return lines.join('\n');
};

/** 0, 1 or 2; anything else reads as the device default, ignore. */
const parseCueSizeMode = (val: string): CueSizeMode => {
    const n = parseInt(val);
    return n === 1 || n === 2 ? n : 0;
};

/**
 * Tenths, 0-10. The firmware clamps the mix itself but not the knob's starting
 * point, so an out-of-range value is clamped here rather than written back.
 */
const parseGritMix = (val: string): number => {
    const n = parseInt(val);
    return Number.isNaN(n) ? DEFAULT_PROJECT_CONFIG.grt_mx_a : Math.min(10, Math.max(0, n));
};

/**
 * A stored config made whole: defaults for keys an older project never saved, and
 * any pair kept in `unknown` that this build has since learned taken back as its
 * field. Without the second step, a project saved while `cue_sm_a` was still unknown
 * would lose that value — the writer drops a known key from `unknown`.
 */
export const completeProjectConfig = (stored?: Partial<ProjectConfig> | null): ProjectConfig => {
    const config = { ...DEFAULT_PROJECT_CONFIG, ...(stored || {}) } as ProjectConfig;
    if (!config.unknown?.some(s => s?.key && isKnownConfigKey(s.key))) return config;
    // The unknown pairs go last, so they win over the defaults filled in above.
    const { unknown, ...known } = config;
    const tail = unknown.flatMap(s => [s.key, s.value, '']).join('\n');
    return parseConfigText(`${generateConfigText(known)}\n${tail}`) ?? config;
};

export const parseConfigText = (text: string): ProjectConfig | null => {
    try {
        const config: ProjectConfig = { ...DEFAULT_PROJECT_CONFIG };
        // Strictly positional: blank lines drop out and what remains is walked as
        // key/value pairs. An unknown key is still a *pair*, so it consumes two
        // lines like any other — skipping it silently would shift everything after
        // it. That is also why it can be carried through rather than dropped.
        const unknown: UnknownConfigSetting[] = [];
        const lines = text.split(/\r?\n/).map(l => l.trim()).filter(l => l !== '');
        for (let i = 0; i < lines.length; i += 2) {
            const rawKey = lines[i];
            const val = lines[i + 1];
            if (!rawKey || val === undefined) continue;

            const key = rawKey.toUpperCase();
            if (key.startsWith('MID_CH_A')) config.mid_ch_a = parseInt(val) || 1;
            else if (key.startsWith('MID_CH_B')) config.mid_ch_b = parseInt(val) || 2;
            else if (key.startsWith('MID_PS_A')) config.mid_ps_a = val === '1';
            else if (key.startsWith('MID_PS_B')) config.mid_ps_b = val === '1';
            else if (key.startsWith('PRE_LOAD')) config.pre_load = val === '1';
            else if (key.startsWith('SLC_MN_A')) config.slc_mn_a = val === '1';
            else if (key.startsWith('SLC_MN_B')) config.slc_mn_b = val === '1';
            else if (key.startsWith('CUE_SM_A')) config.cue_sm_a = parseCueSizeMode(val);
            else if (key.startsWith('CUE_SM_B')) config.cue_sm_b = parseCueSizeMode(val);
            else if (key.startsWith('GRT_MX_A')) config.grt_mx_a = parseGritMix(val);
            else if (key.startsWith('GRT_MX_B')) config.grt_mx_b = parseGritMix(val);
            else unknown.push({ key: rawKey, value: val });
        }
        // Left absent when there are none, so existing projects serialize and
        // compare exactly as they did before.
        if (unknown.length > 0) config.unknown = unknown;
        return config;
    } catch (e) {
        console.warn("Failed to parse config.txt", e);
        return null;
    }
};

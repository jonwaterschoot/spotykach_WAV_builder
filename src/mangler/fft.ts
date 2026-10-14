/**
 * A plain radix-2 FFT for the hit detector: in place, on two Float64Arrays
 * (real, imaginary). The bit-reversal table and twiddles are built once per size.
 */

interface Plan {
    size: number;
    reverse: Uint32Array;
    cos: Float64Array;
    sin: Float64Array;
}

const plans = new Map<number, Plan>();

function planFor(size: number): Plan {
    const hit = plans.get(size);
    if (hit) return hit;
    if (size < 2 || (size & (size - 1)) !== 0) throw new Error(`FFT size must be a power of two, not ${size}`);
    const bits = Math.log2(size);
    const reverse = new Uint32Array(size);
    for (let i = 0; i < size; i++) {
        let r = 0;
        for (let b = 0; b < bits; b++) r |= ((i >> b) & 1) << (bits - 1 - b);
        reverse[i] = r;
    }
    const cos = new Float64Array(size / 2);
    const sin = new Float64Array(size / 2);
    for (let i = 0; i < size / 2; i++) {
        cos[i] = Math.cos((-2 * Math.PI * i) / size);
        sin[i] = Math.sin((-2 * Math.PI * i) / size);
    }
    const plan = { size, reverse, cos, sin };
    plans.set(size, plan);
    return plan;
}

/** Forward transform of `re` + i·`im`, in place. */
export function fft(re: Float64Array, im: Float64Array): void {
    const n = re.length;
    const { reverse, cos, sin } = planFor(n);
    for (let i = 0; i < n; i++) {
        const j = reverse[i];
        if (j > i) {
            let t = re[i]; re[i] = re[j]; re[j] = t;
            t = im[i]; im[i] = im[j]; im[j] = t;
        }
    }
    for (let size = 2; size <= n; size <<= 1) {
        const half = size >> 1;
        const step = n / size;
        for (let start = 0; start < n; start += size) {
            for (let k = 0; k < half; k++) {
                const wr = cos[k * step], wi = sin[k * step];
                const a = start + k, b = a + half;
                const tr = re[b] * wr - im[b] * wi;
                const ti = re[b] * wi + im[b] * wr;
                re[b] = re[a] - tr; im[b] = im[a] - ti;
                re[a] += tr; im[a] += ti;
            }
        }
    }
}

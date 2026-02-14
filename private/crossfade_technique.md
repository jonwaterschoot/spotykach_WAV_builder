# Crossfade Loop Technique

This document explains the math and technique used to create gapless, seamless loops using the "Tail-to-Head" crossfade method.

## The Technique: "Tail-to-Head" Mixing

The technique used is a **Linear Crossfade**. We take the end of the audio (the "Tail") and mix it on top of the beginning of the audio (the "Head") to create a seamless transition.

**The catch:** The final audio file becomes **shorter** by the length of the crossfade.

## The Example (2 Second Fade)

Imagine you have a **10-second** audio clip. You want a **2-second** crossfade loop.

1.  **The Tail**: We take the *last* 2 seconds of the file (from 8s to 10s).
2.  **The Head**: We take the *first* 2 seconds of the file (from 0s to 2s).
3.  **The Mix**: We overlay the Tail onto the Head.
    *   **Tail** fades out (Volume 1.0 → 0.0)
    *   **Head** fades in (Volume 0.0 → 1.0)
4.  **The Result**: The final file is now **8 seconds long**. The last 2 seconds (originally 8s-10s) are gone, because they have been "folded" into the start.

## The Math (Linear Interpolation)

For every sample `i` within the 2-second overlap (let's say 44,100 samples/sec * 2 sec = 88,200 samples):

We calculate a **Progress** value (from 0.0 to 1.0):
$$Progress = i / TotalSamples$$

Then we calculate the volume (gain) for each part:
*   **Head Gain** = $Progress$ (Starts at 0, goes to 1)
*   **Tail Gain** = $1 - Progress$ (Starts at 1, goes to 0)

The formula for the new sample value is:
$$Output[i] = (Head[i] \times HeadGain) + (Tail[i] \times TailGain)$$

### Walkthrough of values

| Time | Progress | Head Vol (Start of File) | Tail Vol (End of File) | What you hear |
| :--- | :--- | :--- | :--- | :--- |
| **0.0s** | 0.0 | 0% | 100% | Perfectly matches the **end** of the loop. |
| **1.0s** | 0.5 | 50% | 50% | An equal mix of start and end. |
| **2.0s** | 1.0 | 100% | 0% | Perfectly matches the rest of the **start** of the file. |

**Why this works:**
At the exact moment the loop restarts (Time 0.0s), the audio is mathematically identical to what was playing at the very end of the file (Time 10.0s), making the seam invisible.

## The Code Implementation

This is the exact logic from `src/lib/audio/audioProcessor.ts`:

```typescript
// crossfadeDuration: Length of the overlap in seconds
// fadeSamples: Number of samples in that duration

for (let i = 0; i < fadeSamples; i++) {
    // 1. Calculate how far through the fade we are (0.0 to 1.0)
    const gainHead = i / fadeSamples;
    
    // 2. The tail gain is the inverse
    const gainTail = 1 - gainHead;

    // 3. Mix them: Fade Head IN, Fade Tail OUT
    // newData is the start of the file, tail is the end of the file
    newData[i] = (newData[i] * gainHead) + (tail[i] * gainTail);
}
```

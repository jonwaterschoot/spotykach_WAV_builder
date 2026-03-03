import React from 'react';

interface DbScaleProps {
    width: number;
    height: number;
    vZoom: number;
}

const DB_LEVELS = [0, -6, -12, -18, -24, -36, -48];

/**
 * DbScale Component
 * Renders horizontal lines and labels representing dB levels for a waveform display.
 * The lines move dynamically based on the vertical zoom (vZoom).
 */
export const DbScale: React.FC<DbScaleProps> = ({ width, height, vZoom }) => {
    const centerY = height / 2;

    return (
        <div
            className="absolute inset-0 pointer-events-none"
            style={{ width, height, zIndex: 10 }} // On top of waveform
        >
            {/* Horizontal Lines SVG - Full Width */}
            <svg
                width="100%"
                height="100%"
                viewBox={`0 0 ${width} ${height}`}
                preserveAspectRatio="none"
                style={{
                    display: 'block',
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    mixBlendMode: 'screen', // Allow lines to pop on dark/colored background
                    opacity: 0.8
                }}
            >
                <defs>
                    <linearGradient id="db-gradient" x1="0%" y1="0%" x2="0%" y2="100%">
                        <stop offset="0%" stopColor="rgba(255, 185, 0, 0.15)" />
                        <stop offset="50%" stopColor="rgba(0, 0, 0, 0)" />
                        <stop offset="100%" stopColor="rgba(255, 185, 0, 0.15)" />
                    </linearGradient>
                </defs>

                {/* Background Gradient for Depth */}
                <rect width={width} height={height} fill="url(#db-gradient)" />

                {/* Center Line (Silence) */}
                <line
                    x1={0}
                    y1={centerY}
                    x2={width}
                    y2={centerY}
                    stroke="rgba(255, 255, 255, 0.15)"
                    strokeWidth="1"
                    strokeDasharray="4 4"
                />

                {DB_LEVELS.map((db) => {
                    const amplitude = Math.pow(10, db / 20);
                    const offset = amplitude * centerY * vZoom;

                    const topY = centerY - offset;
                    const bottomY = centerY + offset;

                    return (
                        <React.Fragment key={db}>
                            {topY >= 0 && topY <= height && (
                                <line
                                    x1={0}
                                    y1={topY}
                                    x2={width}
                                    y2={topY}
                                    stroke="rgba(255, 255, 255, 0.25)"
                                    strokeWidth="0.5"
                                />
                            )}
                            {db !== 0 && bottomY >= 0 && bottomY <= height && (
                                <line
                                    x1={0}
                                    y1={bottomY}
                                    x2={width}
                                    y2={bottomY}
                                    stroke="rgba(255, 255, 255, 0.25)"
                                    strokeWidth="0.5"
                                />
                            )}
                        </React.Fragment>
                    );
                })}
            </svg>

            <div
                className="sticky right-0 h-full w-0 ml-auto pointer-events-none z-50"
                style={{ overflow: 'visible' }} // Allow content to overflow w-0
            >
                <div className="absolute right-0 top-0 bottom-0 w-20">
                    {(() => {
                        const labelsToRender: { y: number, label: string }[] = [];

                        DB_LEVELS.forEach((db) => {
                            const amplitude = Math.pow(10, db / 20);
                            const offset = amplitude * centerY * vZoom;

                            const topY = centerY - offset;
                            const bottomY = centerY + offset;

                            if (topY >= 0 && topY <= height) {
                                labelsToRender.push({ y: topY, label: `${db} dB` });
                            }
                            if (db !== 0 && bottomY >= 0 && bottomY <= height) {
                                labelsToRender.push({ y: bottomY, label: `${db} dB` });
                            }
                        });

                        // Sort by Y position and filter out overlapping labels
                        const sorted = labelsToRender.sort((a, b) => a.y - b.y);
                        const filtered: typeof sorted = [];
                        const MIN_DIST = 16; // Minimum pixels between labels

                        for (const label of sorted) {
                            const last = filtered[filtered.length - 1];
                            if (!last || Math.abs(label.y - last.y) >= MIN_DIST) {
                                filtered.push(label);
                            }
                        }

                        return filtered.map((l, i) => (
                            <div
                                key={`${l.label}-${i}`}
                                className="absolute right-2 text-[9px] font-bold font-mono text-synthux-yellow whitespace-nowrap select-none drop-shadow-md"
                                style={{ top: l.y - 6 }}
                            >
                                {l.label}
                            </div>
                        ));
                    })()}
                </div>
            </div>
        </div>
    );
};

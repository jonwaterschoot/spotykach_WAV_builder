export interface Sample {
    name: string;
    path: string;
    category?: string;
}

export interface SamplePack {
    id: string;
    name: string;
    description: string;
    license?: string;
    links?: { label: string; url: string }[];
    coverImage?: string;
    samples: Sample[];
}

export const SAMPLE_PACKS: SamplePack[] = [
    {
        id: 'synthux-horror',
        name: 'Synthux Horror Sample Pack 2025',
        description: 'A community collection of eerie soundscapes, drones, and textures created with, or with the help of the Synthux Audrey II synths.',
        license: `CC-BY 4.0
The author keeps full ownership of the recordings.
Synthux Academy and others can share, remix, or use these sounds — including commercially — as long as they give credit.
Crediting can be done by linking to author or mentioning the name.
Nobody else can claim this work as their own.`,
        links: [
            { label: "View Full Credits & Source", url: "https://github.com/jonwaterschoot/spotykach_WAV_builder/tree/main/public/samples/horror/p1" }
        ],
        coverImage: '/samples/horror/p1/Audrey-II-Horror-Sample-Pack-2026-Synthux-Academy.png',
        samples: [
            // KHAGE
            { name: "C-Larinet Der Wal", path: "/samples/horror/p1/KG/Clarinet_Rixdorf.wav", category: "KHAGE" },

            // Machine Oil
            { name: "Acid Box Echo Fix 1", path: "/samples/horror/p1/MO/AcidBox_Echo1.wav", category: "Machine Oil" },
            { name: "Acid Box Echo Fix 2", path: "/samples/horror/p1/MO/AcidBox_Echo2.wav", category: "Machine Oil" },
            { name: "Echo Fix 1", path: "/samples/horror/p1/MO/Echo1.wav", category: "Machine Oil" },
            { name: "Echo Fix 2", path: "/samples/horror/p1/MO/Echo2.wav", category: "Machine Oil" },
            { name: "Echo Fix 3", path: "/samples/horror/p1/MO/Echo3.wav", category: "Machine Oil" },
            { name: "Echo Fix 4", path: "/samples/horror/p1/MO/Echo4.wav", category: "Machine Oil" },

            // Neuromorph
            { name: "Neuromorph CF 1", path: "/samples/horror/p1/NM/CF_1.wav", category: "Neuromorph" },
            { name: "Neuromorph CF 2", path: "/samples/horror/p1/NM/CF_2.wav", category: "Neuromorph" },
            { name: "Neuromorph CF 3", path: "/samples/horror/p1/NM/CF_3.wav", category: "Neuromorph" },
            { name: "Neuromorph CF 4", path: "/samples/horror/p1/NM/CF_4.wav", category: "Neuromorph" },
            { name: "Neuromorph CF 5", path: "/samples/horror/p1/NM/CF_5.wav", category: "Neuromorph" },
            { name: "Neuromorph CF 6", path: "/samples/horror/p1/NM/CF_6.wav", category: "Neuromorph" },
            { name: "Neuromorph CF 7", path: "/samples/horror/p1/NM/CF_7.wav", category: "Neuromorph" },
            { name: "Neuromorph CF 8", path: "/samples/horror/p1/NM/CF_8.wav", category: "Neuromorph" },
            { name: "Neuromorph CF 9", path: "/samples/horror/p1/NM/CF_9.wav", category: "Neuromorph" },
            { name: "Neuromorph CF 10", path: "/samples/horror/p1/NM/CF_10.wav", category: "Neuromorph" },
            { name: "Neuromorph CF 11", path: "/samples/horror/p1/NM/CF_11.wav", category: "Neuromorph" },
            { name: "Neuromorph CF 12", path: "/samples/horror/p1/NM/CF_12.wav", category: "Neuromorph" },
            { name: "Neuromorph CF 13", path: "/samples/horror/p1/NM/CF_13.wav", category: "Neuromorph" },

            // The Pedalboard Orchestra
            { name: "Audrey II Horrorscape Pt 1", path: "/samples/horror/p1/TPO/Horrorscape_Pt1.wav", category: "The Pedalboard Orchestra" },
            { name: "Audrey II Horrorscape Pt 2", path: "/samples/horror/p1/TPO/Horrorscape_Pt2.wav", category: "The Pedalboard Orchestra" },
            { name: "Audrey II Horrorscape Pt 3", path: "/samples/horror/p1/TPO/Horrorscape_Pt3.wav", category: "The Pedalboard Orchestra" },

            // enkaytee
            { name: "Arhythmic", path: "/samples/horror/p1/NKT/Arhythmic.wav", category: "enkaytee" },
            { name: "Cosmic Winds", path: "/samples/horror/p1/NKT/CosmicWinds.wav", category: "enkaytee" },
            { name: "Midnight Chimes", path: "/samples/horror/p1/NKT/MidnightChimes.wav", category: "enkaytee" },
            { name: "Silent Bells", path: "/samples/horror/p1/NKT/SilentBells.wav", category: "enkaytee" },

            // jonwtr
            { name: "Model Cycles Audrey Touch Pt 1", path: "/samples/horror/p1/JW/ModelCycles_Pt1.wav", category: "jonwtr" },
            { name: "Model Cycles Audrey Touch Pt 2", path: "/samples/horror/p1/JW/ModelCycles_Pt2.wav", category: "jonwtr" }
        ]
    },
    {
        id: 'jonwtr-explorations',
        name: 'Jonwtr Explorations',
        description: 'A collection of noisy textures, field recordings, and voice sounds explored during the development of Spotykach.',
        license: `DO WHAT THE FUCK YOU WANT TO PUBLIC LICENSE
Version 2, December 2004

Copyright (C) 2026 @jonwtr

Everyone is permitted to copy and distribute verbatim or modified copies of this license document, and changing it is allowed as long as the name is changed.`,
        links: [
            { label: "Read Documentation", url: "https://github.com/jonwaterschoot/spotykach_WAV_builder/blob/main/public/samples/jonwtr/README.md" },
            { label: "Instagram (@jonwtr)", url: "https://instagram.com/jonwtr" },
            { label: "YouTube (@jonwtr)", url: "https://youtube.com/@jonwtr" }
        ],
        coverImage: '/samples/jonwtr/og-image.png',
        samples: [
            // Voice
            { name: "Tractatus Logico Robovoice", path: "/samples/jonwtr/Tractatus_logico_robovoice.wav", category: "Voice" },
            { name: "Voice Glitch Raw", path: "/samples/jonwtr/voice_prrrrttttsktsk_rawCut.wav", category: "Voice" },

            // Textures & Drone
            { name: "Noise Trickle Distorted 1", path: "/samples/jonwtr/noise_trickle_distorted1.wav", category: "Textures" },
            { name: "Noise Trickle Distorted 2", path: "/samples/jonwtr/noise_trickle_distorted2.wav", category: "Textures" },
            { name: "Noise Drone", path: "/samples/jonwtr/noisedrone.wav", category: "Textures" },
            { name: "Noisy Bass Pad", path: "/samples/jonwtr/noisybasspadC2G1.wav", category: "Textures" },

            // Field Recordings
            { name: "Drainpipe UZ", path: "/samples/jonwtr/drainpipeUZ.wav", category: "Field Recordings" },
            { name: "Trickling Stones Dense", path: "/samples/jonwtr/tricklingstones_dense.wav", category: "Field Recordings" },
            { name: "Trickling Stones Sparse", path: "/samples/jonwtr/tricklingstones_lessdense.wav", category: "Field Recordings" },

            // Instruments
            { name: "Mini Kalimba Dry", path: "/samples/jonwtr/minikalimbadry-120bpm-C_E_G.wav", category: "Instruments" },
            { name: "Mini Kalimba Distorted", path: "/samples/jonwtr/minikalimbadry-120bpm-C_E_G_distorted.wav", category: "Instruments" },

            // Vinyl Crackle
            { name: "Vinyl Crackle 12 (Dense 35rpm)", path: "/samples/jonwtr/Vinyl_crackle/Vinyl_crackle12_densedirty35rpm.WAV", category: "Vinyl Crackle" },
            { name: "Vinyl Crackle 13 (Dense 35rpm)", path: "/samples/jonwtr/Vinyl_crackle/Vinyl_crackle13_densedirty35rpm.WAV", category: "Vinyl Crackle" },
            { name: "Vinyl Crackle 14 (End of Chord)", path: "/samples/jonwtr/Vinyl_crackle/Vinyl_crackle14_endofchord.WAV", category: "Vinyl Crackle" },
            { name: "Vinyl Crackle 15 (Aggressive)", path: "/samples/jonwtr/Vinyl_crackle/Vinyl_crackle15_moreagressivestereo.WAV", category: "Vinyl Crackle" },
            { name: "Vinyl Crackle 17 (Manipulating)", path: "/samples/jonwtr/Vinyl_crackle/Vinyl_crackle17_manipulatinghand.WAV", category: "Vinyl Crackle" },
            { name: "Vinyl Crackle 18", path: "/samples/jonwtr/Vinyl_crackle/Vinyl_crackle18.WAV", category: "Vinyl Crackle" },
            { name: "Vinyl Crackle 19", path: "/samples/jonwtr/Vinyl_crackle/Vinyl_crackle19.WAV", category: "Vinyl Crackle" },
            { name: "Vinyl Crackle 20", path: "/samples/jonwtr/Vinyl_crackle/Vinyl_crackle20.WAV", category: "Vinyl Crackle" },
            { name: "Vinyl Crackle 21", path: "/samples/jonwtr/Vinyl_crackle/Vinyl_crackle21.WAV", category: "Vinyl Crackle" },
            { name: "Vinyl Crackle 22", path: "/samples/jonwtr/Vinyl_crackle/Vinyl_crackle22.WAV", category: "Vinyl Crackle" },
            { name: "Vinyl Crackle 23", path: "/samples/jonwtr/Vinyl_crackle/Vinyl_crackle23.WAV", category: "Vinyl Crackle" },
            { name: "Vinyl Crackle 24", path: "/samples/jonwtr/Vinyl_crackle/Vinyl_crackle24.WAV", category: "Vinyl Crackle" },
            { name: "Vinyl Crackle 25", path: "/samples/jonwtr/Vinyl_crackle/Vinyl_crackle25.WAV", category: "Vinyl Crackle" },

            // Foley
            { name: "Dragging Branch", path: "/samples/jonwtr/foley2/draggingbranch.WAV", category: "Foley" },
            { name: "Kicking Ice 1", path: "/samples/jonwtr/foley2/kicking-ice.WAV", category: "Foley" },
            { name: "Kicking Ice 2", path: "/samples/jonwtr/foley2/kicking-ice01.wav", category: "Foley" },
            { name: "Shaker (Bad Timing)", path: "/samples/jonwtr/foley2/shaker_badtiming.wav", category: "Foley" },
            { name: "Shaker (Bad Timing Edit)", path: "/samples/jonwtr/foley2/shaker_badtiming_edit.wav", category: "Foley" }
        ]
    }
];

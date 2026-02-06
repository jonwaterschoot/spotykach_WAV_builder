export interface Sample {
    name: string;
    path: string;
    category?: string;
}

export interface SamplePack {
    id: string;
    name: string;
    description: string;
    coverImage?: string;
    samples: Sample[];
}

export const SAMPLE_PACKS: SamplePack[] = [
    {
        id: 'synthux-horror',
        name: 'Synthux Horror Sample Pack 2025',
        description: 'A community collection of eerie soundscapes, drones, and textures created with, or with the help of the Synthux Audrey II synths.',
        coverImage: '/samples/horror/Synthux_Horror_Sample_Pack_2025/Audrey-II-Horror-Sample-Pack-2026-Synthux-Academy.png',
        samples: [
            // KHAGE
            { name: "C-Larinet Der Wal", path: "/samples/horror/Synthux_Horror_Sample_Pack_2025/KHAGE/C-Larinet_Der-Wal-aus-Rixdorf_live-Cave12_Geneva-CH_2025-11-07.wav", category: "KHAGE" },

            // Machine Oil
            { name: "Acid Box Echo Fix 1", path: "/samples/horror/Synthux_Horror_Sample_Pack_2025/MachineOil/Machine_Oil_Audrey_II_Acid_Box_Echo_Fix.wav", category: "Machine Oil" },
            { name: "Acid Box Echo Fix 2", path: "/samples/horror/Synthux_Horror_Sample_Pack_2025/MachineOil/Machine_Oil_Audrey_II_Acid_Box_Echo_Fix_2.wav", category: "Machine Oil" },
            { name: "Echo Fix 1", path: "/samples/horror/Synthux_Horror_Sample_Pack_2025/MachineOil/Machine_Oil_Audrey_II_Echo_Fix.wav", category: "Machine Oil" },
            { name: "Echo Fix 2", path: "/samples/horror/Synthux_Horror_Sample_Pack_2025/MachineOil/Machine_Oil_Audrey_II_Echo_Fix_2.wav", category: "Machine Oil" },
            { name: "Echo Fix 3", path: "/samples/horror/Synthux_Horror_Sample_Pack_2025/MachineOil/Machine_Oil_Audrey_II_Echo_Fix_3.wav", category: "Machine Oil" },
            { name: "Echo Fix 4", path: "/samples/horror/Synthux_Horror_Sample_Pack_2025/MachineOil/Machine_Oil_Audrey_II_Echo_Fix_4.wav", category: "Machine Oil" },

            // Neuromorph
            { name: "Neuromorph CF 1", path: "/samples/horror/Synthux_Horror_Sample_Pack_2025/Neuromorph/Neuromorph_CF_1.wav", category: "Neuromorph" },
            { name: "Neuromorph CF 2", path: "/samples/horror/Synthux_Horror_Sample_Pack_2025/Neuromorph/Neuromorph_CF_2.wav", category: "Neuromorph" },
            { name: "Neuromorph CF 3", path: "/samples/horror/Synthux_Horror_Sample_Pack_2025/Neuromorph/Neuromorph_CF_3.wav", category: "Neuromorph" },
            { name: "Neuromorph CF 4", path: "/samples/horror/Synthux_Horror_Sample_Pack_2025/Neuromorph/Neuromorph_CF_4.wav", category: "Neuromorph" },
            { name: "Neuromorph CF 5", path: "/samples/horror/Synthux_Horror_Sample_Pack_2025/Neuromorph/Neuromorph_CF_5.wav", category: "Neuromorph" },
            { name: "Neuromorph CF 6", path: "/samples/horror/Synthux_Horror_Sample_Pack_2025/Neuromorph/Neuromorph_CF_6.wav", category: "Neuromorph" },
            { name: "Neuromorph CF 7", path: "/samples/horror/Synthux_Horror_Sample_Pack_2025/Neuromorph/Neuromorph_CF_7.wav", category: "Neuromorph" },
            { name: "Neuromorph CF 8", path: "/samples/horror/Synthux_Horror_Sample_Pack_2025/Neuromorph/Neuromorph_CF_8.wav", category: "Neuromorph" },
            { name: "Neuromorph CF 9", path: "/samples/horror/Synthux_Horror_Sample_Pack_2025/Neuromorph/Neuromorph_CF_9.wav", category: "Neuromorph" },
            { name: "Neuromorph CF 10", path: "/samples/horror/Synthux_Horror_Sample_Pack_2025/Neuromorph/Neuromorph_CF_10.wav", category: "Neuromorph" },
            { name: "Neuromorph CF 11", path: "/samples/horror/Synthux_Horror_Sample_Pack_2025/Neuromorph/Neuromorph_CF_11.wav", category: "Neuromorph" },
            { name: "Neuromorph CF 12", path: "/samples/horror/Synthux_Horror_Sample_Pack_2025/Neuromorph/Neuromorph_CF_12.wav", category: "Neuromorph" },
            { name: "Neuromorph CF 13", path: "/samples/horror/Synthux_Horror_Sample_Pack_2025/Neuromorph/Neuromorph_CF_13.wav", category: "Neuromorph" },

            // The Pedalboard Orchestra
            { name: "Audrey II Horrorscape Pt 1", path: "/samples/horror/Synthux_Horror_Sample_Pack_2025/ThePedalboardOrchestra/ThePedalboardOrchestra_Audrey-II-Horrorscape-Drone_Part1.wav", category: "The Pedalboard Orchestra" },
            { name: "Audrey II Horrorscape Pt 2", path: "/samples/horror/Synthux_Horror_Sample_Pack_2025/ThePedalboardOrchestra/ThePedalboardOrchestra_Audrey-II-Horrorscape-Drone_Part2.wav", category: "The Pedalboard Orchestra" },
            { name: "Audrey II Horrorscape Pt 3", path: "/samples/horror/Synthux_Horror_Sample_Pack_2025/ThePedalboardOrchestra/ThePedalboardOrchestra_Audrey-II-Horrorscape-Drone_Part3.wav", category: "The Pedalboard Orchestra" },

            // enkaytee
            { name: "Arhythmic", path: "/samples/horror/Synthux_Horror_Sample_Pack_2025/enkaytee/enaytee_arhythmic.wav", category: "enkaytee" },
            { name: "Cosmic Winds", path: "/samples/horror/Synthux_Horror_Sample_Pack_2025/enkaytee/enkaytee_cosmic_winds.wav", category: "enkaytee" },
            { name: "Midnight Chimes", path: "/samples/horror/Synthux_Horror_Sample_Pack_2025/enkaytee/enkaytee_midnight_chimes.wav", category: "enkaytee" },
            { name: "Silent Bells", path: "/samples/horror/Synthux_Horror_Sample_Pack_2025/enkaytee/enkaytee_silent_bells.wav", category: "enkaytee" },

            // jonwtr
            { name: "Model Cycles Audrey Touch Pt 1", path: "/samples/horror/Synthux_Horror_Sample_Pack_2025/jonwtr/jonwtr_SynthuxHorror_ModelCyclesAudreyTouchSpotykach2025-11-13_Part1.wav", category: "jonwtr" },
            { name: "Model Cycles Audrey Touch Pt 2", path: "/samples/horror/Synthux_Horror_Sample_Pack_2025/jonwtr/jonwtr_SynthuxHorror_ModelCyclesAudreyTouchSpotykach2025-11-13_Part2.wav", category: "jonwtr" }
        ]
    }
];

# Spotykach WAV Builder

[![Live Application](https://img.shields.io/badge/Live_App-Open-23E073?style=for-the-badge)](https://jonwaterschoot.github.io/spotykach_WAV_builder/)

> **⚠️ Desktop Only:** This application is optimized for **Desktop Chrome/Edge** browsers. It is **not supported on mobile devices** due to the complex audio processing and file system interactions.

A specialized tool for preparing audio files for the **Synthux Spotykach Looper playground**. It streamlines the process of converting, trimming, and organizing samples and projects to meet the strict firmware requirements (48kHz Stereo WAV).

## Features

-   **Seamless SD Card Integration**: Sync projects directly with the Spotykach hardware SD card using the File System Access API (Chrome/Edge) or export as a structured ZIP file.
-   **Automatic Audio Processing**: Drag and drop any audio format for automatic conversion to the required 48kHz 16-bit Stereo WAV format.
-   **Tape-Based Organization**: Manage samples across 6 color-coded "Tapes" that mirror the physical hardware interface.
-   **Advanced Waveform Editor**:
    -   **Precision Trimming**: Trim, normalize, and apply volume automation.
    -   **Loop Tools**: Create seamless loops with configurable crossfading and fade-in/out curves.
    -   **Hardware Constraints**: Visual indicators for the strictly enforced 42-second hardware buffer limit.
-   **Comprehensive Sample Browser**:
    -   **Curated Packs**: Browse and import community-contributed sample packs.
    -   **Library Management**: Build a persistent user library and pull samples from other local projects.
-   **Project Portability**: Save and restore work states via Project JSON or create full backups to local storage and SD cards.

## Technology Stack

This project is built using:

-   **[React](https://react.dev/)**: UI Framework.
-   **[Vite](https://vitejs.dev/)**: Build tool and dev server.
-   **[Tailwind CSS](https://tailwindcss.com/)**: Styling.
-   **[WaveSurfer.js](https://wavesurfer.xyz/)**: Audio visualization and manipulation.
-   **Google Deepmind Antigravity**: Experimental agentic AI used for development.

## Getting Started

1.  **Clone the repository**
    ```bash
    git clone https://github.com/jonwaterschoot/spotykach_WAV_builder.git
    cd spotykach_WAV_builder
    ```

2.  **Install Dependencies**
    ```bash
    npm install
    ```

3.  **Run Development Server**
    ```bash
    npm run dev
    ```

4.  **Build**
    ```bash
    npm run build
    ```

## Live Demo

Check out the live version here: [https://jonwaterschoot.github.io/spotykach_WAV_builder/](https://jonwaterschoot.github.io/spotykach_WAV_builder/)

## Multi-version GitHub Pages

This repo can now deploy a version picker at the root and host multiple app versions:

- `https://jonwaterschoot.github.io/spotykach_WAV_builder/v1/`
- `https://jonwaterschoot.github.io/spotykach_WAV_builder/v2/`

Workflow:

1. Put a built legacy v1 static site into `legacy/v1-dist/`.
2. Build the versioned site:
   ```bash
   npm run build:versioned
   ```
   To host samples outside GitHub Pages (for both `v1` and `v2`), set a base URL first:
   ```bash
   SAMPLE_ASSET_BASE_URL=https://github.com/<owner>/<repo>/releases/download/<tag> npm run build:versioned
   ```
3. Deploy to `gh-pages`:
   ```bash
   npm run deploy:versioned
   ```

Notes:
- The root version picker lives in `site/index.html`.
- v2 is built from current source with base path `/spotykach_WAV_builder/v2/`.
- When `SAMPLE_ASSET_BASE_URL` is set, the build rewrites sample URLs to that host and removes `dist/v1/samples` and `dist/v2/samples` from the Pages output.

## Roadmap

### Priority Features
- **Editor Improvements** 
    - **Audio Processor**:
        - add 3 band EQ (automated)
        - add limiter
    - **Cutting tool**:
        - Option to cut files and remove parts in the file (merge peices with fade, i'd rather not get into multiple tracks territory)
    - **Slicer tool**:
        - A slicer tool with up to 32 slices - to be implemented in furture SK firmware.
- **History & Trashcan**:
    - Dedicated trashcan for deleted files with Restore capability.
    - Undo/Redo for editor actions (Normalize, etc.).
    - cleanup of unused files in project (only keep original files, not history files)
- **Right-Click Context Menu**:
    - For quick actions (Edit, Move, Delete) on cards.

### Long Term

- **Desktop App**: Electron/PWA wrapper for offline use.
- **Cloud Sync**: Google Drive/Dropbox integration?
- **Mobile Optimization**: improved layout for tablets/phones.

## Contributing

We welcome contributions!
-   **Found a bug?** Open an issue on [GitHub](https://github.com/jonwaterschoot/spotykach_WAV_builder/issues).
-   **Have an idea?** Discuss it with us on the **Synthux Academy Discord**.
-   **Want to build locally?** Check out our [Contribution Guide](CONTRIBUTING.md).

## License

**DO WHAT THE FUCK YOU WANT TO PUBLIC LICENSE**
Version 2, December 2004

Copyright (C) 2026 @jonwaterschoot

Everyone is permitted to copy and distribute verbatim or modified copies of this license document, and changing it is allowed as long as the name is changed.

DO WHAT THE FUCK YOU WANT TO PUBLIC LICENSE
TERMS AND CONDITIONS FOR COPYING, DISTRIBUTION AND MODIFICATION

0. You just DO WHAT THE FUCK YOU WANT TO.

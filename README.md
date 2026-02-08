# Spotykach WAV Builder

[![Live Application](https://img.shields.io/badge/Live_App-Open-23E073?style=for-the-badge)](https://jonwaterschoot.github.io/spotykach_WAV_builder/)

> **⚠️ Desktop Only:** This application is optimized for **Desktop Chrome/Edge** browsers. It is **not supported on mobile devices** due to the complex audio processing and file system interactions.

A specialized tool for preparing audio files for the **Spotykach sampler**. It streamlines the process of converting, trimming, and organizing samples to meet the strict firmware requirements (48kHz Stereo WAV).

## Features

-   **Automatic Conversion**: Drag & drop any audio file; it gets converted to 48kHz 16-bit Stereo WAV automatically.
-   **Tape Management**: Organize samples into 6 color-coded "Tapes", matching the hardware interface.
-   **Waveform Editor**: 
    -   Trim and Normalize samples.
    -   Apply Fade In/Out curves.
    -   Create Seamless Loops with crossfading.
    -   **42s Limit**: Visual indicators to keep samples within the hardware's 42-second buffer limit.
-   **Export Options**:
    -   **Project JSON**: Save your work state.
    -   **SD Card ZIP**: Export the exact folder structure required by the Spotykach SD card (`SK/BLUE`, `SK/RED`, etc.).
    -   **Direct SD Write**: Write directly to a connected SD card (Chrome/Edge only).
    -   **Sample Packs**: Browse and import curated samples from the community.
-   **Touch Support**: Basic drag-and-drop support for touch devices.

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

## Roadmap

For now I'm keeping a text file with the roadmap / feature ideas, and a bugtracking: [roadmap-bugs.md](roadmap-bugs.md)

Future ideas and planned features:
-   **Multi-Project Support**: Save and load multiple projects within the app with version history.
-   **Shared Sample Pool**: A centralized pool of samples shared across different projects.
-   **Project Manager**: A dedicated interface for managing your local projects.
-   **Standalone Application**: Make the app installable (PWA or Electron wrapper) for offline/desktop use.
-   **Mobile Optimization**: Improve touch targets and layout for tablet/phone usage (Partially Implemented).
-   **Cloud Sync**: Optional integration with cloud storage (Google Drive/Dropbox) for project backup.

## Contributing

We welcome contributions!
-   **Found a bug?** Open an issue on [GitHub](https://github.com/jonwaterschoot/spotykach_WAV_builder/issues).
-   **Have an idea?** Discuss it with us on the **Synthux Academy Discord**.

## License

**DO WHAT THE FUCK YOU WANT TO PUBLIC LICENSE**
Version 2, December 2004

Copyright (C) 2026 @jonwaterschoot

Everyone is permitted to copy and distribute verbatim or modified copies of this license document, and changing it is allowed as long as the name is changed.

DO WHAT THE FUCK YOU WANT TO PUBLIC LICENSE
TERMS AND CONDITIONS FOR COPYING, DISTRIBUTION AND MODIFICATION

0. You just DO WHAT THE FUCK YOU WANT TO.

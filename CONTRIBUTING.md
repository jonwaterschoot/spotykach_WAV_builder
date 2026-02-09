# Contributing to Spotykach WAV Builder

Thank you for your interest in improving Spotykach WAV Builder! We welcome contributions from everyone, regardless of your coding background.

## Contribution Philosophy

We encourage community members to suggest and implement:
- **Features**: New functionality or improvements to existing tools.
- **Design**: Updates to icons, layout, colors, and overall aesthetics.
- **Content**: Improvements to text, documentation, and help guides.

**Note on Deployment**: The live version of the application (GitHub Pages) is managed centrally by the project maintainers. As a contributor, you do not need to worry about the deployment process—just ensure your changes work locally!

---

## � Getting Started (From Scratch)

If you are new to web development and want to run this project on your computer, follow these steps.

### 1. Install Necessary Tools
You need a few programs installed on your computer before you can run the code.

1.  **Node.js** (The Runtime):
    - **What is it?**: It allows your computer to run JavaScript code outside of a web browser. It includes `npm` (Node Package Manager) which we use to install libraries.
    - **Download**: [Node.js Official Site](https://nodejs.org/) (Download the "LTS" version).
    - **Verify**: Open your terminal (Command Prompt or PowerShell on Windows) and type `node -v`. You should see a version number.

2.  **Git** (Version Control):
    - **What is it?**: A tool for tracking changes in code and downloading projects from GitHub.
    - **Download**: [Git Official Site](https://git-scm.com/downloads).
    - **Verify**: Type `git --version` in your terminal.

3.  **VS Code** (The Editor - Recommended):
    - **What is it?**: A code editor that makes reading and writing React code much easier.
    - **Download**: [Visual Studio Code](https://code.visualstudio.com/).

### 2. Download and Run the Project

1.  **Clone the Repository**:
    Open your terminal/command prompt and run:
    ```bash
    git clone https://github.com/jonwaterschoot/spotykach_WAV_builder.git
    cd spotykach_WAV_builder
    ```

2.  **Install Dependencies**:
    This command downloads all the libraries (like React) that the project needs to run.
    ```bash
    npm install
    ```

3.  **Start the Development Server**:
    This turns on the app locally so you can see it in your browser.
    ```bash
    npm run dev
    ```

4.  **Open in Browser**:
    You should see a URL like `http://localhost:5173`. Ctrl+Click it (or copy main it) to open the app!

### 3. Testing on Mobile (Local Network)
To test the app on your phone connected to the same Wi-Fi:
1.  Ensure your computer and phone are on the **same network**.
2.  Look at the terminal output after running `npm run dev`. It will show:
    ```
    ➜  Local:   http://localhost:5173/
    ➜  Network: http://192.168.x.x:5173/
    ```
3.  Type the **Network URL** (e.g., `http://192.168.1.5:5173`) into your phone's browser.

   *Note: If you cannot connect to this IP (e.g. AP Isolation), see the [Tunneling Alternatives](#8-the-nuclear-option-tunneling-skip-local-network) section below for how to bypass network restrictions.*

---

## 🛠️ Tech Stack & Resources

This project is built using standard web technologies.

- **[React](https://react.dev/)**: The core framework for the UI. Think of components like C++ classes that handle their own logic and drawing.
- **[TypeScript](https://www.typescriptlang.org/)**: JavaScript with types. Similar to C++, it helps catch errors before running the code.
- **[Vite](https://vitejs.dev/)**: The build tool and dev server.
- **[Tailwind CSS](https://tailwindcss.com/)**: A utility-first CSS framework. We use this for styling directly in the HTML classes.
- **[Lucide Icons](https://lucide.dev/icons/)**: The icon set used throughout the app.
- **[Wavesurfer.js](https://wavesurfer-js.org/)**: Audio waveform visualization library.

---

## 🗺️ Codebase Orientation (For C++/Arduino Developers)

If you're coming from an embedded or C++ background, here is how to map your knowledge to this project:

### 1. Conceptual Mapping
| Concept | Web Equivalent | Description |
| :--- | :--- | :--- |
| **`void loop()` / Main Loop** | **`App.tsx`** | This is the main component. It holds the main state variables and coordinates child modules. |
| **Modules / Classes** | **Components** | Files in `src/components/` (e.g., `SlotCard.tsx`). They are reusable blocks of UI and logic. |
| **Global Variables** | **State / Context** | Data shared across the app. We use `useState` locally and Context (`AudioPlayerContext`) for global audio. |
| **Interrupts / Events** | **Event Handlers** | Functions like `onClick`, `onDrop`. They run when the user interacts with the interface. |

### 2. Where is everything?
- **`src/App.tsx`**: The heart of the application. It manages the list of files, the tape slots, and the global logic.
- **`src/components/`**:
    - **`SlotCard.tsx`**: Definition for a single tape slot in the main view.
    - **`FileBrowser.tsx`**: The sidebar list of files.
    - **`WaveformEditor.tsx`**: The popup modal for editing audio.
- **`src/index.css`**: Global styles and color variables.

### 3. Where is the text/content stored?
- **Button Labels & Titles**: Hardcoded inside the specific `.tsx` component files.
    - *Example*: Search `FileBrowser.tsx` for "Upload" to change that button's text.
- **Modals**: Text for modals is inside their respective component files (e.g., `DuplicateResolveModal.tsx`).

---

## Guide for Contributors

1.  **Code Standards**:
    - Ensure your code compiles: `npm run build`
    - Ensure linter passes: `npm run lint`

2.  **Submitting Changes**:
    - Push your changes to your branch/fork.
    - Open a Pull Request (PR) to the main repository.

---

## Guide for Maintainers (Deployment)

These steps are for the core maintainers responsible for updating the live GitHub Pages site.

### Deployment Workflow
1.  **Commit all changes**: Ensure the working directory is clean.
2.  **Run Deploy Script**:
    ```bash
    npm run deploy
    ```
3.  **Windows PowerShell Users**:
    If you see scripts disabled errors, use:
    ```powershell
    npm.cmd run deploy
    ```

---

## Common Issues & Troubleshooting

### 1. Build Failures (TypeScript/Lint Errors)
**Symptom**: Build fails with `error TS6133: 'variable' is declared but its value is never read.`
**Cause**: Strict type checking enforces no unused variables.
**Solution**: Remove unused variables or prefix with `_`.

### 2. Windows PowerShell "Script Disabled"
**Symptom**: `npm : File ...\npm.ps1 cannot be loaded...`
**Solution**: Use `npm.cmd` instead of `npm`.

### 3. Terminal Syntax Errors (`&&`)
**Symptom**: `The token '&&' is not a valid statement separator.`
**Solution**: Use a terminal that supports chaining (Git Bash) or run commands sequentially.

### 4. Application Not Loading on Mobile (ERR_ADDRESS_UNREACHABLE)
**Symptom**: You type the `http://192.168.x.x:5173` address on your phone, but it says "This site can't be reached".
**Cause**: **Windows Firewall** is blocking incoming connections to Node.js.
**Solution**:
1.  **Check Network Profile**:
    - Click Wi-Fi/Ethernet icon in taskbar -> Initial "Properties".
    - Ensure Network Profile is set to **Private** (Home), not Public.
2.  **Allow Node.js through Firewall**:
    - Open Windows Start Menu -> Type "Allow an app through Windows Firewall".
    - Click "Change Settings" (Admin).
    - Look for `node.exe` or `Node.js JavaScript Runtime`.
    - Ensure **Private** and **Public** checkboxes are ticked.
3.  **Temporary Test**: Turn off Windows Firewall briefly to confirm if it's the issue (Turn back on immediately after!).

### 5. Advanced Network Troubleshooting (Mobile)
If you still get `ERR_ADDRESS_UNREACHABLE`:
1.  **Check IP & Port**:
    - Ensure you are using the exact IP and **Port** shown in the terminal (e.g., `5173` vs `5176`).
    - Run `ipconfig` in a new terminal to confirm your Wireless LAN adapter's IPv4 address matches.
2.  **AP Isolation**:
    - Some routers (especially Guest Networks) enable "AP Isolation", preventing devices from talking to each other.
    - **Fix**: Connect both devices to the main, non-guest Wi-Fi network.
3.  **Network Profile (Crucial)**:
    - Windows **MUST** treat the network as **Private**. If it says "Public", it will block connections even if you think you allowed them.
    - Go to **Settings > Network & Internet > Wi-Fi > [Your Network]** and select **Private**.

### 6. Alternative: Serve Production Build
Sometimes the "Dev" server (Hot Module Replacement) has trouble with some network setups. You can try serving the **production build** instead:

1.  Stop the current server (`Ctrl+C`).
2.  Run the build and preview command:
    ```bash
    npm run build
    npm run preview
    ```
3.  Use the `Network` URL shown in the output. This serves the optimized files just like the live site.

### 7. "Preview" Shows White Screen?
If `npm run preview` shows a white screen, it's because the project expects to be hosted on GitHub Pages (`/spotykach_WAV_builder/`).
To fix this for local preview:
1.  Run the **local build command**:
    ```bash
    npm run build:local
    ```
2.  Then run preview:
    ```bash
    npm run preview
    ```
This builds the app expecting to be at the root path (`/`), which works perfectly for local testing.

### 8. The "Nuclear Option": Tunneling (Skip Local Network)
If you **still** cannot connect (likely due to router "AP Isolation" or complex network setups), use a **Tunnel**.
This creates a temporary public URL that forwards to your computer.

1.  Keep your dev server running (`npm run dev`).
2.  Open a **new** terminal.
3.  Run:
    ```bash
    npx localtunnel --port 5176
    ```
    *(If using PowerShell and it fails, try `npx.cmd localtunnel --port 5176`)*
4.  It will give you a link like `https://some-random-name.loca.lt`.
5.  Open that link on your phone.
    - **Note**: It might ask you to enter a password or click "Click to Continue" to verify you are a human. This is normal for the free version.

### 9. Tunneling Alternative: Pinggy (No Install)
If `localtunnel` is flaky (errors like 400/504), try **Pinggy**. It uses SSH, which is built into Windows 10/11.

1.  Run your dev server (`npm run dev`).
2.  Open a new terminal.
3.  Run:
    ```bash
    ssh -p 443 -R0:localhost:5176 a.pinggy.io
    ```
4.  It will show a URL (like `https://rand0m.a.pinggy.io`) in the terminal.
5.  Open that on your phone.
    *(Note: The free version has a time limit, but you can just restart the command).*

### 10. Tunneling Alternative: localhost.run (SSH, No Install)
If Pinggy asks for a password, try **localhost.run**. It is often simpler.

**Prerequisite**: You need an SSH key. If you get `Permission denied (publickey)`, run this first:
```bash
ssh-keygen -t ed25519
```
(Press Enter for all prompts to accept defaults).

1.  Run your dev server (`npm run dev`).
2.  Open a new terminal.
3.  Run:
    ```bash
    ssh -R 80:localhost:5176 localhost.run
    ```
4.  It will print a line like `your-name.localhost.run`.
5.  Open `https://your-name.localhost.run` on your phone.

**Note**: We have configured `vite.config.ts` to allow these tunnel domains (`allowedHosts: true`). If you see a "Blocked request" error, restart your dev server.

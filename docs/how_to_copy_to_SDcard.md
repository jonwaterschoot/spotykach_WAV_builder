# Spotykach WAV BUILDER EXPORT

This is an export made from the **Spotykach WAV Builder** app.

To install, you need to copy these files to the root of your SD card.

Please refer to the full manual to learn more about how to format your card and why the structure of this folder matters.

## Quick Install
1. Format your SD card as **FAT32**.
2. Copy the **content** of this folder (the `SK` folder) to the **root** of the SD card.
3. Power off Spotykach before entering or removing the SD card.

*Tip: Use `tap` + `play` to load samples into a deck, use `alt` to toggle tapes.*

---

## 1. Format your SD card

**32GB microSD cards are ideal** (holding ~21 hours of audio).
Cards larger than 32GB require special tools to format as FAT32.

### Windows
Native Windows tools limit FAT32 formatting to 32GB.
**Solution:** Use [GUIFormat](http://ridgecrop.co.uk/index.htm?guiformat.htm) (Ridgecrop Consultants). It is a simple tool that formats drives larger than 32GB to FAT32 in seconds.

### macOS
1. Open **Disk Utility**.
2. View → Show All Devices.
3. Select the physical drive.
4. Click **Erase**.
5. Format: **MS-DOS (FAT)**.
6. Scheme: **Master Boot Record** (Crucial!).

### Linux
*   **GNOME Disks**: Choose "Format Partition" → "Compatible with all systems (FAT)".
*   **GParted**: Format to `fat32`.

---

## 2. The SK Folder

Spotykach uses a specific folder structure accessed by both decks. Everything resides inside the root folder named `SK`.

**Audio Requirements:** Files must be strictly **32-bit float, 48kHz Stereo WAV** format. (The WAV Builder handles this automatically during export).

### Tapes & Navigation
Files are grouped into 6 "Tapes", corresponding to colors:
*   **B**lue → `B` Folder
*   **G**reen → `G` Folder
*   **P**ink → `P` Folder
*   **R**ed → `R` Folder
*   **T**urquoise → `T` Folder
*   **Y**ellow → `Y` Folder

### File Naming
```text
SK/
├── B/
│ ├── 1.WAV
│ ├── ...
│ └── 6.WAV
├── G/
│ └── 1.WAV
└── ...
```
> ⚠️ **Folder and File names must be UPPERCASE.**
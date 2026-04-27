Spotykach WAV BUILDER EXPORT

This is an export made from the app WAV;builder for Spotykach

To install you need to copy these files to the root of your SD card.

Please refer to the full manual to learn more about how to format your card and why the structure of this folder matters.

In short:

1. Format SD card as FAT32
2. Copy the content of this folder to the root of the SD card

Power off Spotykach before entering or removing the SD card

Use `tap` + `play` to load samples into a deck, use `alt` to toggle tapes.

---


## 1. Format your SD card

32GB microSD cards are ideal (holding ~21 hours of audio).
Cards larger than 32GB require special tools to format as FAT32.

### Windows
Native Windows tools limit FAT32 formatting to 32GB.

Solution: Use [GUIFormat](http://ridgecrop.co.uk/index.htm?guiformat.htm) (Ridgecrop Consultants).
It is a simple tool that formats drives larger than 32GB to FAT32 in seconds.

### macOS
Open Disk Utility.
View → Show All Devices.
Select the physical drive.
Click Erase.
Format: MS-DOS (FAT).
Scheme: Master Boot Record (Crucial!).

### Linux
GNOME Disks: Choose "Format Partition" → "Compatible with all systems (FAT)".
GParted: Format to fat32.


---


The SK Folder
Spotykach uses a specific folder structure accessed by both decks. Everything resides inside the root folder named SK.

Files must be in 32-bit float 48kHz Stereo WAV format.

Tapes & Navigation
Files are grouped into 6 "Tapes", corresponding to colors:

B lue → Folder
G reen → Folder
P ink → Folder
R ed → Folder
T urquoise → Folder
Y ellow → Folder

File Naming
SK/
├── B/
│ ├── 1.WAV
│ ├── ...
│ └── 6.WAV
├── G/
│ └── 1.WAV
└── ...
⚠️ Folder and File names must be UPPERCASE.
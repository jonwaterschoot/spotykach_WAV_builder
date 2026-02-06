I need a web app that I could run on github pages. 
The app should allow some basic audio trimming tasks
So upload a file, edit and preview.
We need to be able to do this for multiple files and be able to assign them to slots.
They need to be organized in folders and renamed.

When doen we should allow the user to download a .zip file that can be placed on the SD card.

Furthermore it would also be handy if a user could upload his existing folder.
I'm guessing uploading a whole folder and or just reading straight from the SD card is an idea here.

heres some more genral info and troubles we have in e.g. Windows.

Allcaps troubles in Win 11 / Audacity
saving with uppercase .WAV extension reverts to lowercase .wav
Workaround rename to a different extension, then rename to allcaps
Export audio from Audacity 
*1-6*.wav  - it might show .WAV but saves as lowercase .wav
Pick SD folder: e.g. SK\B
Stereo
Sample Rate: 48000 Hz
Encoding: 32-bit float
In file Explorer (choose show extensions in settings)
rename to a different extension: 1.wav > 1.xyz enter
rename back to allcaps: 1.xyz > 1.WAV enter

--

# SD Card

<aside>
🚧

**Please, lower volumes after loading the files!**

</aside>

<aside>
💾

To be recognized the card should be inserted **before** powering up.

**Do not** try *hot swapping* while powered on, it might influence performance.

In general it’s good practice to only change the card while powered off.

Saving / loading was tested and should work without issues with up to 32GB FAT32 formatted card. Bigger sizes might also work, however were not fully tested yet.

[Spotykach **Recommended microSD Cards**](https://www.notion.so/Spotykach-Recommended-microSD-Cards-2e96331933b880ab94e7e88996f8fd44?pvs=21)

</aside>

Spotykach’s storage is shared between decks so the sample saved on the one deck can be loaded to another. On the SD card it resides inside the folder **SK, ****which is the root folder for everything Spotykach. 

Whenever you save the deck, the audio file representing contents of the buffer is created in the corresponding folder on the card. The file is **32bit float 48kHz stereo WAV**. The size of the file is defined by the length of the recording.

### Navigating

The files are grouped in folders, which we’re calling *tapes*. There are 6 tapes. Each tape can hold up to 6 files. This makes total of 36 files.

Each tape is referenced with a color: **blue, green, pink, red, turquoise and yellow**.  Accordingly, the folders on the card use first letter of the color as a name: **B**, **G**, **P**, **R**, **T**, **Y**. 

The audio files in their turn have numeric names: 1.WAV . . . 6.WAV

<aside>
⚠️

The names of the folders and files, including extension, should be uppercased.

</aside>

![colors copy.jpg](attachment:c16caade-b5b7-41d2-a5d6-ed3bdec40c9a:colors_copy.jpg)

- To enter the SD card mode, hold `Tap` for half a second and tap `Sequence` pad of the deck you want to save/load, while still holding `Tap`. The ring going to lit up showing 6 segments in the color of one of the tapes, by default - blue.
- To switch between tapes tap `Sequence` pad. Spotykach remembers the last selected tape (until power off) so the next time you enter the SD card it’s going to start from the same tape.

The segments on the ring represent files in the corresponding tape folder. Brighter segments denote existing and not empty files, the dim ones - the opposite.

- To select a file turn `Pitch` knob. The selected segment going to lit with pulsating white.

### Saving, loading and cancelling

After selecting a segment as described above:

- tap `Alt`+`Play` to **save** the audio to the card. The ring is going to show the process in white. If you select already occupied slot, it’s going to overwrite the existing file.
- tap `Alt`+`Reverse` to **load** audio into the buffer. The ring going to show the progress in tape color.
- to **exit** SD card without saving or loading, press `Tap` button once.

<aside>
⚠️

Saving and loading is only possible when the deck is inactive, i.e. not playing, not recording and is not armed to record. Same is true opposite - no playback / recording / triggering is possible during loading / saving.

Depending on the buffer length, saving and loading might take some time. 

After the buffer is saved / loaded, the deck returns to it’s regular state.

</aside>

### Importing audio

If you name the audio file as described above and place it according to the structure pictured, Spotykach will be capable to load it to the deck. If there’re no folders on the card because you didn’t save anything yet (otherwise Spotykach creates folders automatically), you can create this structure manually.
The file should have the same format that Spotykach uses internally, i.e. **32 bit float 48KHz Stereo WAV**. 

If the file is shorter then 42 seconds, the length of the file going to be set as maximum loop size. If the file is longer - first 42 seconds will be loaded.

--

# Spotykach **Recommended microSD Cards**

While we’re testing first SD card implementation and much might still change; here’s a list of cards working or failing with version v0.0.30 alpha 2 ([go to latest Firmware](https://www.notion.so/Spotykach-Firmware-2396331933b880d89f04f61ecf0f58e6?pvs=21))

The [manual](https://www.notion.so/Spotykach-Manual-22c6331933b880c59108c0de25102bb5?pvs=21) has more info on how to use the SD card features: only loading / saving for now.

For getting cards up and running:

<aside>
💾

To be recognized the card should be inserted before powering up. 

- Saving / loading was tested and should work without issues with up to 32GB FAT32 formatted card. Bigger sizes might also work, see below
- to save a WAV file from your computer to the Spotykach SD:
    - save your audio as **32 bit float 48KHz Stereo WAV**
    - only the first 42 sec will be used
</aside>

## Formatting larger than 32GB cards in FAT32

<aside>
⏰

32GB is plenty for the purpose of Spotykach: in theory it could hold up to **21 hrs** of audio in total with the **32 bit float 48KHz Stereo WAV** file format that Spotykach uses. 
So unless it’s the only card you have at hand, anything larger is probably overkill.

</aside>

### Windows

Formatting larger than 32GB cards on Windows is standard limited to NTFS and exFat.
To format in FAT32 on Windows you’ll need more advanced tools than the standard right click > Format option.

<aside>
😣

**Win: “Computer says no.”**
cmd, diskpart, whichever option you’ll use, you will meet the roadblock: native win tools won’t allow formatting volumes larger than 32GB. 
The workaround could be to chop into partitions with one of 32GB, unalocate the rest, and even that might give problems.
👉 Use the tool [guiformat](http://ridgecrop.co.uk/index.htm?guiformat.htm), it’ll work in seconds.

</aside>

This software was shared on Discord by @**Naenyn -The download will give a warning, though it has been tested and works as expected. The tool has no real options, it is a gui that only formats to FAT32** 

[Ridgecrop Consultants Ltd](http://ridgecrop.co.uk/index.htm?guiformat.htm)

---

### macOS

To format a drive to FAT32 on macOS, **use Disk Utility, select the drive, click Erase, set the format to MS-DOS (FAT), choose Master Boot Record for the scheme (especially for drives 32GB+), and click Erase**; this process makes the drive compatible with both Mac and Windows.

**Step-by-step using Disk Utility**

1. **Insert** the USB drive or external disk.
2. **Open Disk Utility**: Find it in Applications > Utilities, or use Spotlight search (Cmd + Space).
3. **Show All Devices**: In Disk Utility, click **View** in the menu bar and select **Show All Devices** to see the physical drive.
4. **Select the Drive**: In the sidebar, select the *physical drive* you want to format (not just a volume under it).
5. **Click Erase**: Click the **Erase** button at the top of the window.
6. **Name the Drive**: Give it a new name (optional).
7. **Set Format**: Choose **MS-DOS (FAT)** from the Format dropdown menu.
8. **Set Scheme**: Crucially, select **Master Boot Record** (MBR) for the Scheme (if available/needed for compatibility).
9. **Erase**: Click **Erase** to start the formatting process.

---

### Linux

**1. GNOME (Ubuntu, Fedora, etc.)**

- **The Tool:** **GNOME Disks** (often pre-installed).
- **The Action:** Select your drive, click the menu (three dots) or the "play/cog" icon, and choose **Format Partition**.
- **FAT32 Label:** It is usually listed as **"Compatible with all systems and devices (FAT)"**.

**2. KDE Plasma (Kubuntu, SteamOS, etc.)**

- **The Tool:** [**KDE Partition Manager**](https://apps.kde.org/partitionmanager/).
- **The Action:** Right-click the partition and select **Format**.
- **FAT32 Label:** Explicitly listed as **fat32**.

**3. The Universal Choice: GParted**

- **GParted** is the standard graphical tool used across almost all distributions. It provides a clear visual map of your drive and allows you to "Format to" -> **fat32** with two clicks.

---

## List of working cards

| Brand | Size GB | Link |
| --- | --- | --- |
| SanDisk Ultra | 32 *
64
128 *
256 |  |
| SanDisk Extreme | 32*
64
128* |  |
| SanDisk Edge | 8* |  |
| Kingston SDC10 | 32* |  |
| Toshiba M203 | 16* |  |
| Samsung EVO Plus | 128 ** |  |
|  |  |  |

* cards tested by users

** card initially had errors, but seems to work fine

---

## List of failing cards

| Brand | Size GB | Link |
| --- | --- | --- |
| PNY Elite | 32* |  |
| Netac Pro | 16* |  |
| generic off brand | 2*
32* |  |
|  |  |  |
|  |  |  |
|  |  |  |
|  |  | 

 |

|  |  |
| --- | --- |

---
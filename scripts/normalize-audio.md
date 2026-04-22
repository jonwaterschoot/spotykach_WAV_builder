# Audio Normalization Script

Normalizes audio files to -1dBFS peak, converts to FLAC, and writes artist + title metadata. Output files are saved into a `normalized/` subfolder alongside the source files.

---

## Requirements

### Python
Make sure Python 3 is installed: https://www.python.org/downloads/

### FFmpeg
- **Mac:** `brew install ffmpeg`
- **Windows:** Download from https://ffmpeg.org/download.html and add to PATH

### Python dependencies
Run once to install:
```
pip install pydub mutagen
```

---

## Setup

Save the script as `normalize.py` anywhere convenient, e.g.:
```
~/scripts/normalize.py
```

---

## Usage

### Normalize a single file
```
python normalize.py "path/to/file.wav" "Artist Name"
```

### Normalize an entire folder
```
python normalize.py "path/to/folder" "Artist Name"
```

The script accepts `.wav` and `.flac` input files.

---

## Running from the same directory as your audio files

If your terminal is already in the folder containing your audio files, you can use `.` as the path:

```
cd /path/to/your/audio/files
python ~/scripts/normalize.py . "Artist Name"
```

---

## Output

- A `normalized/` subfolder is created inside the source directory
- Each output file is named after the original file (e.g. `my track.wav` → `my track.flac`)
- Metadata written:
  - **Title** — taken from the filename (without extension)
  - **Artist** — the name you pass as the second argument

---

## Example

```
python ~/scripts/normalize.py "/music/sessions" "Jon Hopkins"
```

Result:
```
/music/sessions/
    track01.wav
    track02.wav
    normalized/
        track01.flac
        track02.flac
```

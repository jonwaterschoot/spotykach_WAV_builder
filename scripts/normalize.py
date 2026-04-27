import os
import sys
import glob
from pydub import AudioSegment
from pydub.effects import normalize
from mutagen.flac import FLAC

OUTPUT_FOLDER = "normalized"

def process_file(file_path, artist_name):
    filename = os.path.basename(file_path)
    track_title = os.path.splitext(filename)[0]
    
    # Create output subfolder next to the source file
    source_dir = os.path.dirname(os.path.abspath(file_path))
    output_dir = os.path.join(source_dir, OUTPUT_FOLDER)
    os.makedirs(output_dir, exist_ok=True)
    
    # Sanitize for URL-friendly and robust filenames
    safe_title = track_title.replace(" ", "-")
    output_path = os.path.join(output_dir, safe_title + ".flac")

    # Load and normalize to -1dB peak
    audio = AudioSegment.from_file(file_path)
    normalized = normalize(audio, headroom=1.0)

    # Export as FLAC, preserving sample rate and bit depth
    normalized.export(
        output_path,
        format="flac",
        parameters=["-ar", str(audio.frame_rate), "-sample_fmt", get_sample_fmt(audio.sample_width)]
    )

    # Write metadata
    tags = FLAC(output_path)
    tags["title"] = track_title
    tags["artist"] = artist_name
    tags.save()

    print(f"v {filename} -> {OUTPUT_FOLDER}/{track_title}.flac")

def get_sample_fmt(sample_width):
    return {1: "u8", 2: "s16", 3: "s24", 4: "s32"}.get(sample_width, "s16")

if __name__ == "__main__":
    target = sys.argv[1]
    artist = sys.argv[2]

    if os.path.isdir(target):
        files = glob.glob(os.path.join(target, "*.wav")) + \
                glob.glob(os.path.join(target, "*.flac"))
        print(f"Found {len(files)} files...")
        for f in files:
            process_file(f, artist)
    else:
        process_file(target, artist)

    print("All done.")
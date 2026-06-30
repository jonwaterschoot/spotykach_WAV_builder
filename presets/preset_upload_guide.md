# How to Add a Preset to the Spotykach WAV.builder App



> [!NOTE]
> This is a guide showing how to add a preset to the Spotykach WAV.builder App.
> If you are looking for instructions on how to submit files (for both artists contributing sample packs and users sharing presets), please refer to the comprehensive [Preset & Sample Pack Submission Guide](../../docs/presets-samples/README.md).
> if you need a script for normalization, processing and compressing audio files, take a look at the info in the [scripts/normalize-audio.md](scripts/normalize-audio.md) file for reference.

You can host the preset configuration files (`manifest.json` and the `project-descriptor.json`) directly inside your GitHub repository's `public/` folder. Only the large SD-card backup `.zip` files need to be hosted on Cloudflare R2!

Follow these steps to add your preset:

## 1. Export the Project Preset (Settings-Only)
First, ensure your project uses untouched built-in samples that were imported using the `SampleBrowser`.
1. Click the **Export** button in the top right header of the app.
2. Go to the **Project Preset** tab.
3. Select **"Settings-Only Preset (JSON)"** to export only the `project-descriptor.json` file. *(Note: This file contains all of your slot assignments, project configuration settings, and tape notes!)*
4. Click **Export Preset**.

## 2. Rename and Move the JSON file
1. Locate the downloaded `project-descriptor.json` file.
2. Rename this file to something descriptive, e.g., `hainbach-tapes.json`.
3. Move this file into your local repository at `public/presets/hainbach-tapes.json`.

## 3. (Optional) Upload the Portable SK Folder ZIP to Cloudflare R2
If you want to offer a fully pre-built, hardware-ready SD card ZIP download in the app:
1. Open the **Export** menu and go to the **Portable SK Folder** tab.
2. Click **Download Portable SK Folder (ZIP)**.
3. Upload that `.zip` file to your Cloudflare R2 bucket.
4. Copy its public URL (e.g., `https://your-r2-domain.com/presets/hainbach-tapes-sd-ready.zip`).

## 4. Update the `manifest.json`
1. Open your local `public/manifest.json` file in your code editor.
2. Under the `"presets"` array, add a new entry for your project. The entry should look like this:

```json
{
    "id": "hainbach-tapes-preset",
    "name": "Hainbach's Spotykach Tapes",
    "description": "A dark ambient layout using Hainbach's roaring drones and bells.",
    "requiredPacks": ["hainbach-tapes"], 
    "descriptorPath": "/presets/hainbach-tapes.json",
    "sdExportUrl": "https://your-r2-domain.com/presets/hainbach-tapes-sd-ready.zip" // Only if you did Step 3
}
```
* **`requiredPacks`**: Make sure the IDs here exactly match the `"id"` of the sample packs your preset uses.
* **`descriptorPath`**: This points to the file you added in Step 2.

## 5. Verify and Commit
1. Since you're running the dev server locally, just refresh the app! 
2. Open the **Presets** panel, and your new project should appear. 
3. Clicking "Load" will automatically hydrate the project using the samples directly from the sample packs on R2, entirely skipping the need to package audio blobs locally.
4. Commit your changes (`public/manifest.json` and `public/presets/hainbach-tapes.json`) and push to GitHub!

---

# Processing & Deploying Sample Packs (For App Maintainers)

This section outlines the steps to ingest, process, and deploy sample packs submitted by guest artists or users.

## ⚙️ Prerequisites
Ensure you have the following installed:
* **Python 3**
* **FFmpeg** (installed and added to your system `PATH`)
* **Python dependencies**: Run `pip install pydub mutagen`

## Step 1: Normalize and Convert Audio
Maintainers must normalize and convert audio files before distributing them.
1. Place the raw submitted folder in a local staging directory.
2. Run the Python normalization script:
   ```bash
   python scripts/normalize.py "path/to/artist/folder" "Artist Name"
   ```
   *What this script does:*
   - Normalizes audio to `-1dB` peak headroom.
   - Exports the files as compressed `.flac` files (saving size and bandwidth for web streaming).
   - Sanitizes filenames (replacing spaces with hyphens) for clean URLs.
   - Writes FLAC metadata tags (`title` from the filename, `artist` from the arguments).
3. The normalized files will be saved in a new `normalized/` folder next to the source files.

## Step 2: Arrange Folder & Prepare README
Create a staging folder for the pack (using the pack ID, e.g., `my-pack-id/`).
1. Put the normalized `.flac` files inside, preserving the category subfolders.
2. Add the landscape cover image (e.g., `cover.jpg`) to the folder.
3. Write a `README.md` at the root of this folder containing the metadata frontmatter:
   ```markdown
   ---
   id: my-pack-id
   name: My Pack Name
   description: |
     This is a long description of the sample pack.
     It can span multiple lines.
   license: CC-BY 4.0
   ---
   # Links
   - Website: http://mywebsite.com
   - Instagram: https://instagram.com/myusername
   ```

## Step 3: Run the Manifest Generator
Scan the pack folder to generate the `manifest.json` snippet:
```bash
node scripts/generate-manifest.mjs "path/to/my-pack-id"
```
This script reads the YAML frontmatter, links, folder hierarchy, and samples to output a JSON block.

## Step 4: Zip, Upload, and Deploy
1. **Compress the Pack**: Zip the staging folder as `my-pack-id.zip` (for the "Download Full Pack" button in the app).
2. **Upload to Cloudflare R2**:
   - Upload the individual `.flac` files to the R2 bucket under `samples/my-pack-id/`.
   - Upload `my-pack-id.zip` to R2 as `samples/my-pack-id.zip`.
   - *Note: R2 assets resolve via `https://pub-6649b937be6b4a8c9b92904c5ac392fc.r2.dev/samples/...`*
3. **Update Manifest**:
   - Copy the generated JSON block from Step 3 and paste it into the `packs` array of `public/manifest.json`.
4. **Deploy Preset (If applicable)**:
   - Save the settings-only preset JSON file into `public/presets/<preset-name>.json`.
   - Add a preset entry to the `presets` array in `public/manifest.json`:
     ```json
     {
       "id": "my-preset",
       "name": "My Preset Name",
       "description": "Short description.",
       "coverImage": "/my-pack-id/cover.jpg",
       "requiredPacks": ["my-pack-id"],
       "descriptorPath": "/presets/my-preset.json",
       "sdExportUrl": "https://pub-6649b937be6b4a8c9b92904c5ac392fc.r2.dev/presets/my-preset-SD.zip"
     }
     ```
5. **Commit & Push**: Commit the updated `public/manifest.json` and new `public/presets/<preset-name>.json` files and push to GitHub. The app will automatically build and show the new preset/pack!

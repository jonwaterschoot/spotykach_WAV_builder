# How to Add a Preset to the Spotykach App

You can host the preset configuration files (`manifest.json` and the `project-descriptor.json`) directly inside your GitHub repository's `public/` folder. Only the large SD-card backup `.zip` files need to be hosted on Cloudflare R2!

Follow these steps to add your preset:

## 1. Export the Settings-Only ZIP
First, ensure your project uses untouched built-in samples that were imported using the newly updated `SampleBrowser`.
1. Open the **Project Manager** in the app.
2. Check the **"Settings-Only ZIP"** option.
3. Click the **Export (Download)** icon next to your project.
4. This will download a `.zip` file containing a `project-descriptor.json` file. *(Note: This single file contains all of your slot assignments, project configuration settings, and tape notes!)*

## 2. Rename and Move the JSON file
1. Extract the `.zip` file.
2. Locate the `project-descriptor.json` file inside the extracted folder.
3. Rename this file to something descriptive, e.g., `hainbach-tapes.json`.
4. Move this file into your local repository at `public/presets/hainbach-tapes.json`.

## 3. (Optional) Upload the SD Backup ZIP to Cloudflare R2
If you want to offer a fully pre-built SD-card ready ZIP download button in the app:
1. Export a standard backup ZIP using the **Export > Project Backup** feature.
2. Upload that `.zip` file to your Cloudflare R2 bucket.
3. Copy its public URL (e.g., `https://your-r2-domain.com/presets/hainbach-tapes-sd-ready.zip`).

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

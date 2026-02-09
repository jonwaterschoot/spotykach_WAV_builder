# DragDebug Component

This component is a visual debugger for drag-and-drop events. It was used to troubleshoot mobile touch interactions and ensure that drag payloads were correctly formatted.

## Purpose
- **Visualize Drop Events**: Shows exactly what data is being transferred during a drag operation (MIME types, data content).
- **Test Drop Zone**: Acts as a "receiver" that logs any item dropped onto it.
- **Isolate Issues**: Helps determine if the issue is with the *source* (not sending data) or the *destination* (not receiving data).

## How to Use
1.  Copy `DragDebug.tsx` into your `src/components/` folder.
2.  Import it in `App.tsx`:
    ```tsx
    import { DragDebug } from './components/DragDebug';
    ```
3.  Add it to your JSX, ideally in a fixed position so it's always visible:
    ```tsx
    <div className="fixed bottom-0 left-0 z-[100] w-full pointer-events-none">
        <div className="pointer-events-auto">
            <DragDebug />
        </div>
    </div>
    ```
4.  Drag items (files, slots) onto the black box. It will log the data transfer object to the console and display summary info on screen.

## Sample Output
When a valid item is dropped, the debugger (and console) will show the JSON payload extracted from `text/plain`.

**Example (Slot Drag):**
```json
{
  "id": "2ab35eb5-9df6-4870-b2b4-7281e217aa7f",
  "source": "slot",
  "slotId": 4,
  "slotColor": "Red",
  // Bulk Data (if multiple items selected)
  "bulkIds": [
    "2ab35eb5-9df6-4870-b2b4-7281e217aa7f",
    "unique-id-2..."
  ],
  "bulkSourceKeys": [
    "Red-4",
    "Red-5"
  ]
}
```

**Example (File Browser Drag):**
```json
{
  "id": "fe82...",
  "source": "browser",
  "bulkIds": ["fe82...", "a1b2..."]
}
```

## Key Learnings
## Platform Specific Notes (Touch)

Touch behavior varies significantly between operating systems:

- **Windows Touch (Tested on Asus ProArt PX13)**:
    - Works reliably.
    - Drag initiation is smooth.
    - Drop zones highlight correctly.

- **Android (Tested on OnePlus Pro 10)**:
    - **Works**, but requires precise "Hold to Drag".
    - **Issue**: File System handling on Android is aggressive; exporting to SD card often results in the OS creating unwanted nested folders (e.g., `Android/data/...`) instead of writing to root.
    - **Layout**: The current desktop-first layout is very cramped on phones.

- **iOS (iPad/iPhone)**:
    - **Untested**. Behavior with connected SD cards is unknown.
    - Safari's drag implementation often differs from Chrome/Android.


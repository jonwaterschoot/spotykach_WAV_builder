# What's next? (Roadmap)

Here's what I'm planning to build next. No promises on dates, but these are top of the list.

### for newcomers: 
Expand onboarding section with a choice to start with a blank project or a project preset. 

### 🎓 Interactive Tutorial 
Something better than a video? A live guide that walks you through the app while you use it. 
Not an easy task i think, so perhaps I'll start with some video tutorials.

### SD Card: Prepare empty project
- Erase SD card: warn the user, compare current content (show which project is on it), confirm it's safe to delete.
- Format SD card? Can we e.g. bypass the Windows 32 GB limit? (unlikely feature in browser i think)

### 🗑️ History & Undo
Undo for the audio editor and a trashcan for when you accidentally delete the perfect take.
I've already spent a lot of time trying to come up with a way to get rid of the amount of history steps created upon each audio edit.
There's a cleanup function that allows deleting all but the last step and the original state but it's not a perfect solution. And it's not the same as an undo function.
I haven't yet found a good solution to this problem, but I'm still working on it.

### ⌨️ Context Menus
Right-click support, I often find myself expecting to right click for options.
Not sure how well it'll override the browser's default right-click menu, but worth a try.

### 🖥️ Desktop App
Wrap spotykach in an electron or PWA shell to allow proper desktop integration (File -> Open Project, Save Project, etc) and enable fully offline use.

[Full Roadmap](https://github.com/jonwaterschoot/spotykach_WAV_builder/blob/main/roadmap-bugs.md)

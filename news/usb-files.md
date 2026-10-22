# USB: settings, notes and project file

With firmware **1.4.0 beta 5** or later, a build over USB writes the same files outside the slots as the card reader:

- `config.txt`, the device settings (from firmware beta 4)
- `README.md`, the card's notes
- `SK/project.json`, which records the project the card holds and what is in each slot

A card now says the same whichever way you built it. On older firmware the sync screen lists what it leaves out, and the card keeps those files from its last card-reader build. The project copy and the SK backup stay card reader only.

## The size limit

Over USB one file can be at most 32 KB, so the project file is written without indentation. Every sample in the project counts, in a slot or not. It fits up to about:

- **115 samples** with notes like the Hainbach pack (2,500 characters)
- **130 samples** without notes
- **190 samples** of your own, with short names and no source link

A bigger project gets a shorter file: only the samples in slots, at most 36. Nothing reads the rest back from the card, so nothing is lost. Only when the project and tape notes together pass about 20,000 characters (some 3,000 words) is the file left out. The build carries on and says so. The card reader has no limit.

[Full changelog](https://github.com/jonwaterschoot/spotykach_WAV_builder/blob/main/CHANGELOG.md)

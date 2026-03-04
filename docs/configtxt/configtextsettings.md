### Spotykach config file config.txt

The file name is `config.txt`, located on the root of the `SK` directory.

#### Format Specifications
- **Name/Key**: Exactly 8 characters (ASCII alphanumeric + underscores). Pad with spaces if shorter.
- **Value**: 4-byte numeric value, placed on the line immediately below the setting name.
- **Booleans**: Represented as `0` or `1`.
- **Delimiters**: Newline `\n` separates each entry.

#### Current Settings
| Name | Value Range | Description |
|---|---|---|
| `mid_ch_a` | `1...16` | MIDI Channel for Deck A (Default: 1) |
| `mid_ch_b` | `1...16` | MIDI Channel for Deck B (Default: 2) |
| `mid_ps_a` | `0/1` | Enable MIDI Start/Stop for Deck A (Default: 0) |
| `mid_ps_b` | `0/1` | Enable MIDI Start/Stop for Deck B (Default: 0) |

#### UI Integration
The WAV Builder includes a dedicated **config.txt** modal accessible from the main header (Tape icon).
- **Preset System**: Allows saving and loading configuration presets to `localStorage`.
- **Project Browser**: Load `config.txt` settings directly from other projects in your Work folder.

#### Sync & Export
- **SD Synchronization**: The `config.txt` is part of the project sync system. When pushing to an SD card, the builder will generate the file according to the strict format above.
- **Conflict Resolution**: If a `config.txt` exists on the SD with different settings, the sync modal will flag a conflict and allow you to choose which version to keep.

#### Example File
```txt  
mid_ch_a
15

mid_ch_b
16

mid_ps_a
0

mid_ps_b
1
```
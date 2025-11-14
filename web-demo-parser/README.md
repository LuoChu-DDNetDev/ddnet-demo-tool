# DDNet Demo Parser - Web Tool

A comprehensive web-based tool for parsing and analyzing DDNet demo files (`.demo`) with **player names and chat extraction**.

## Features

- 📁 **Multiple File Upload**: Upload and parse multiple demo files at once
- 📊 **Comprehensive Statistics**: View detailed information about each demo file
- 🗺️ **Map Information**: Extract map name, size, CRC, and SHA256
- ⏱️ **Timing Data**: See duration, ticks, and timeline markers
- 📌 **Timeline Markers**: View all timeline markers with timestamps
- 👥 **Player Names**: Extract player names and clan tags from snapshots
- 💬 **Chat Messages**: Extract all chat messages with timestamps
- 📥 **JSON Export**: Export complete parsed data as JSON
- 🎮 **Demo Format Support**: Supports DDNet demo file format (versions 3-6)
- 🎨 **Modern UI**: Clean and responsive interface

## Usage

1. Open `index.html` in a modern web browser
2. Drag and drop demo files or click to browse
3. View comprehensive statistics for each demo file
4. See extracted player names and chat messages
5. Click "Export as JSON" to download parsed data
6. Upload multiple files to compare

## Parsed Information

The tool extracts and displays:

### General Information
- Demo file version
- Network version
- Demo type
- Recording timestamp
- Total duration

### Map Information
- Map name
- Map size
- Map CRC checksum
- SHA256 hash (for version 6+)

### Timeline Markers
- Number of markers
- Tick position for each marker
- Timestamp for each marker

### Player Information (NEW!)
- Player ID
- Player name
- Clan tag
- Country code
- Skin name

### Chat Messages (NEW!)
- Message text
- Player name
- Timestamp (MM:SS format)
- Team chat indicator
- Client ID

### Demo Statistics
- Total chunks
- Tick markers
- Keyframes
- Snapshots
- Delta snapshots
- Messages
- First and last tick
- Total ticks

## Demo File Format

The DDNet demo file format consists of:

1. **Header** (176 bytes)
   - Marker: "TWDEMO\0"
   - Version (1 byte)
   - Network version (64 bytes)
   - Map name (64 bytes)
   - Map size (4 bytes, big-endian)
   - Map CRC (4 bytes, big-endian)
   - Type (8 bytes)
   - Length (4 bytes, big-endian)
   - Timestamp (20 bytes)

2. **Timeline Markers** (260 bytes, version > 3)
   - Number of markers (4 bytes, big-endian)
   - Markers array (64 × 4 bytes, big-endian)

3. **SHA256 Extension** (48 bytes, version >= 6)
   - Extension UUID (16 bytes)
   - SHA256 hash (32 bytes)

4. **Map Data**
   - Embedded map file (variable size)

5. **Chunks** (variable)
   - Tick markers (with optional keyframe flag)
   - Snapshots (full game state)
   - Delta snapshots (compressed changes)
   - Messages (game events)

## Technical Details

### Chunk Format

Chunks use a compact binary format:

- **Tick Marker**: Byte with 0x80 flag set
  - 0x40: Keyframe flag
  - 0x20: Tick compressed flag
  - 0x1F: Tick delta (if compressed)

- **Data Chunk**: Byte with 0x80 flag not set
  - Bits 5-6: Chunk type (1=snapshot, 2=message, 3=delta)
  - Bits 0-4: Size (30/31 = extended size follows)

### Compression

Data chunks use two-stage compression:
1. Variable integer compression (CVariableInt)
2. Network compression (CNetBase)

The parser implements a `DataUnpacker` class to decode variable-length integers and strings from the compressed data.

### Tick Rate

DDNet uses 50 ticks per second (SERVER_TICK_SPEED = 50).

## JSON Export

The tool can export all parsed data as a JSON file, including:
- Complete header information
- Map details and SHA256
- Timeline markers
- Player list with all details
- Full chat history
- Comprehensive statistics

The JSON format is compatible with other DDNet analysis tools.

## Browser Support

- Chrome/Edge 90+
- Firefox 88+
- Safari 14+

Requires modern JavaScript features:
- ArrayBuffer
- DataView
- Async/await
- ES6 classes

## Files

- `index.html` - Main HTML page
- `style.css` - Styles and layout
- `demo-parser.js` - Demo file parser logic with chat/player extraction (570 lines)
- `main.js` - UI and file handling logic with JSON export
- `README.md` - This file
- `README_zh-CN.md` - Chinese documentation

## Development

The parser is implemented in pure JavaScript with no external dependencies. It reads the binary demo file format according to the DDNet specification in `src/engine/shared/demo.cpp`.

### Enhanced Features

- **Player Name Extraction**: Parses ClientInfo objects (type 1) from snapshot chunks
- **Chat Message Extraction**: Parses Sv_Chat messages (type ~10) from message chunks
- **Variable Integer Decoding**: Implements the DDNet variable-length integer format
- **UTF-8 String Parsing**: Handles null-terminated UTF-8 strings from demo data

## Limitations

- Player name extraction is best-effort and may miss some players depending on snapshot compression
- Chat message extraction works for standard Sv_Chat messages
- Full snapshot decompression (Huffman + delta) not implemented
- Map data is skipped (not extracted or displayed)

## References

- DDNet source code: `src/engine/shared/demo.cpp`
- Demo header: `src/engine/demo.h`
- Demo player: `src/engine/shared/demo.h`

## License

This tool is part of the DDNet project. See the main project license for details.

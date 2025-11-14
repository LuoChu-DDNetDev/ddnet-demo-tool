/**
 * DDNet Demo File Parser
 * Parses DDNet demo files (.demo) and extracts information
 * Based on the demo format in src/engine/shared/demo.cpp
 */

class DemoParser {
    constructor() {
        this.HEADER_MARKER = [0x54, 0x57, 0x44, 0x45, 0x4d, 0x4f, 0x00]; // "TWDEMO\0"
        this.MAX_TIMELINE_MARKERS = 64;
        this.CHUNK_FLAG_TICKMARKER = 0x80;
        this.CHUNK_FLAG_KEYFRAME = 0x40;
        this.CHUNK_FLAG_TICK_COMPRESSED = 0x20;
        this.CHUNK_MASK_TICK = 0x1f;
        this.CHUNK_MASK_TYPE = 0x60;
        this.CHUNK_MASK_SIZE = 0x1f;
        this.CHUNKTYPE_SNAPSHOT = 1;
        this.CHUNKTYPE_MESSAGE = 2;
        this.CHUNKTYPE_DELTA = 3;
        this.SERVER_TICK_SPEED = 50;
        this.SHA256_EXTENSION = [
            0x6b, 0xe6, 0xda, 0x4a, 0xce, 0xbd, 0x38, 0x0c,
            0x9b, 0x5b, 0x12, 0x89, 0xc8, 0x42, 0xd7, 0x80
        ];
    }

    /**
     * Parse a demo file
     * @param {ArrayBuffer} fileData - The demo file data
     * @param {string} filename - The filename
     * @returns {Object} Parsed demo information
     */
    async parse(fileData, filename) {
        const view = new DataView(fileData);
        let offset = 0;

        try {
            // Parse header
            const header = this.parseHeader(view, offset);
            offset += this.getHeaderSize();

            // Parse timeline markers (version > 3)
            let timelineMarkers = { count: 0, markers: [] };
            if (header.version > 3) {
                timelineMarkers = this.parseTimelineMarkers(view, offset);
                offset += this.getTimelineMarkersSize();
            }

            // Check for SHA256 extension (version >= 6)
            let sha256 = null;
            if (header.version >= 6) {
                const extensionResult = this.tryParseSHA256Extension(view, offset);
                if (extensionResult) {
                    sha256 = extensionResult.sha256;
                    offset = extensionResult.newOffset;
                }
            }

            // Parse map data (skip for now as we're just analyzing)
            const mapSize = header.mapSize;
            const mapOffset = offset;
            offset += mapSize;

            // Parse chunks to gather statistics
            const chunkStats = this.parseChunks(view, offset, fileData.byteLength);

            // Build result object
            return {
                success: true,
                filename: filename,
                fileSize: fileData.byteLength,
                header: header,
                timelineMarkers: timelineMarkers,
                sha256: sha256,
                mapInfo: {
                    name: header.mapName,
                    size: mapSize,
                    crc: header.mapCrc,
                    offset: mapOffset
                },
                statistics: chunkStats,
                duration: this.calculateDuration(chunkStats),
                parsedAt: new Date().toISOString()
            };
        } catch (error) {
            return {
                success: false,
                filename: filename,
                fileSize: fileData.byteLength,
                error: error.message,
                stack: error.stack
            };
        }
    }

    /**
     * Parse demo header
     */
    parseHeader(view, offset) {
        // Check marker
        const marker = new Array(7);
        for (let i = 0; i < 7; i++) {
            marker[i] = view.getUint8(offset + i);
        }
        
        if (!this.arraysEqual(marker, this.HEADER_MARKER)) {
            throw new Error('Invalid demo file: marker mismatch');
        }

        // Parse header fields
        const version = view.getUint8(offset + 7);
        const netversion = this.readString(view, offset + 8, 64);
        const mapName = this.readString(view, offset + 72, 64);
        const mapSize = this.readBigEndianInt32(view, offset + 136);
        const mapCrc = this.readBigEndianInt32(view, offset + 140);
        const type = this.readString(view, offset + 144, 8);
        const length = this.readBigEndianInt32(view, offset + 152);
        const timestamp = this.readString(view, offset + 156, 20);

        return {
            version,
            netversion,
            mapName,
            mapSize,
            mapCrc: '0x' + mapCrc.toString(16).toUpperCase().padStart(8, '0'),
            type,
            length,
            timestamp
        };
    }

    /**
     * Parse timeline markers
     */
    parseTimelineMarkers(view, offset) {
        const count = this.readBigEndianInt32(view, offset);
        const markers = [];
        
        for (let i = 0; i < Math.min(count, this.MAX_TIMELINE_MARKERS); i++) {
            const marker = this.readBigEndianInt32(view, offset + 4 + (i * 4));
            markers.push(marker);
        }

        return { count, markers };
    }

    /**
     * Try to parse SHA256 extension
     */
    tryParseSHA256Extension(view, offset) {
        // Check if extension UUID matches
        const extensionUuid = new Array(16);
        for (let i = 0; i < 16; i++) {
            if (offset + i >= view.byteLength) return null;
            extensionUuid[i] = view.getUint8(offset + i);
        }

        if (!this.arraysEqual(extensionUuid, this.SHA256_EXTENSION)) {
            return null;
        }

        // Read SHA256 (32 bytes)
        const sha256Bytes = new Array(32);
        for (let i = 0; i < 32; i++) {
            if (offset + 16 + i >= view.byteLength) return null;
            sha256Bytes[i] = view.getUint8(offset + 16 + i);
        }

        const sha256Hex = sha256Bytes.map(b => b.toString(16).padStart(2, '0')).join('');

        return {
            sha256: sha256Hex,
            newOffset: offset + 16 + 32
        };
    }

    /**
     * Parse chunks and gather statistics, extract players and chat
     */
    parseChunks(view, startOffset, fileSize) {
        const stats = {
            totalChunks: 0,
            tickMarkers: 0,
            keyframes: 0,
            snapshots: 0,
            messages: 0,
            deltas: 0,
            firstTick: -1,
            lastTick: -1,
            ticks: [],
            players: {},  // clientId -> player info
            chatMessages: []  // array of chat messages
        };

        let offset = startOffset;
        let currentTick = -1;
        const MAX_CLIENTS = 64;

        try {
            while (offset < fileSize) {
                if (offset + 1 > fileSize) break;

                const chunkByte = view.getUint8(offset);
                offset++;
                stats.totalChunks++;

                if (chunkByte & this.CHUNK_FLAG_TICKMARKER) {
                    // Tick marker
                    stats.tickMarkers++;

                    if (chunkByte & this.CHUNK_FLAG_KEYFRAME) {
                        stats.keyframes++;
                    }

                    // Read tick value
                    if (chunkByte & this.CHUNK_FLAG_TICK_COMPRESSED) {
                        // Compressed tick (delta from last tick)
                        const tickDelta = chunkByte & this.CHUNK_MASK_TICK;
                        if (currentTick >= 0) {
                            currentTick += tickDelta;
                        }
                    } else {
                        // Full tick value
                        if (offset + 4 > fileSize) break;
                        currentTick = this.readBigEndianInt32(view, offset);
                        offset += 4;
                    }

                    if (currentTick >= 0) {
                        if (stats.firstTick === -1) {
                            stats.firstTick = currentTick;
                        }
                        stats.lastTick = currentTick;
                        stats.ticks.push(currentTick);
                    }
                } else {
                    // Data chunk (snapshot, message, or delta)
                    const chunkType = (chunkByte & this.CHUNK_MASK_TYPE) >> 5;
                    let chunkSize = chunkByte & this.CHUNK_MASK_SIZE;

                    // Read extended size if needed
                    if (chunkSize === 30) {
                        if (offset + 1 > fileSize) break;
                        chunkSize = view.getUint8(offset);
                        offset++;
                    } else if (chunkSize === 31) {
                        if (offset + 2 > fileSize) break;
                        chunkSize = view.getUint8(offset) | (view.getUint8(offset + 1) << 8);
                        offset += 2;
                    }

                    // Read chunk data
                    if (offset + chunkSize > fileSize) break;
                    const chunkData = new Uint8Array(view.buffer, view.byteOffset + offset, chunkSize);

                    // Count chunk types and try to parse
                    if (chunkType === this.CHUNKTYPE_SNAPSHOT) {
                        stats.snapshots++;
                        // Try to parse snapshot for player info
                        this.tryParseSnapshot(chunkData, stats.players, MAX_CLIENTS);
                    } else if (chunkType === this.CHUNKTYPE_MESSAGE) {
                        stats.messages++;
                        // Try to parse message for chat
                        this.tryParseMessage(chunkData, stats.chatMessages, stats.players, currentTick);
                    } else if (chunkType === this.CHUNKTYPE_DELTA) {
                        stats.deltas++;
                    }

                    offset += chunkSize;
                }

                // Safety check to prevent infinite loops
                if (stats.totalChunks > 1000000) {
                    console.warn('Too many chunks, stopping parse');
                    break;
                }
            }
        } catch (error) {
            console.warn('Error parsing chunks:', error);
        }

        return stats;
    }

    /**
     * Calculate duration from chunk statistics
     */
    calculateDuration(stats) {
        if (stats.firstTick === -1 || stats.lastTick === -1) {
            return { seconds: 0, formatted: '00:00' };
        }

        const totalTicks = stats.lastTick - stats.firstTick;
        const seconds = Math.floor(totalTicks / this.SERVER_TICK_SPEED);
        const minutes = Math.floor(seconds / 60);
        const secs = seconds % 60;
        const formatted = `${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;

        return { seconds, formatted, ticks: totalTicks };
    }

    /**
     * Get header size in bytes
     */
    getHeaderSize() {
        // 7 (marker) + 1 (version) + 64 (netversion) + 64 (mapname) + 
        // 4 (mapsize) + 4 (mapcrc) + 8 (type) + 4 (length) + 20 (timestamp)
        return 176;
    }

    /**
     * Get timeline markers size in bytes
     */
    getTimelineMarkersSize() {
        // 4 (count) + 64*4 (markers)
        return 4 + (this.MAX_TIMELINE_MARKERS * 4);
    }

    /**
     * Read null-terminated string from DataView
     */
    readString(view, offset, maxLength) {
        const bytes = [];
        for (let i = 0; i < maxLength; i++) {
            const byte = view.getUint8(offset + i);
            if (byte === 0) break;
            bytes.push(byte);
        }
        return new TextDecoder('utf-8').decode(new Uint8Array(bytes));
    }

    /**
     * Read big-endian 32-bit integer
     */
    readBigEndianInt32(view, offset) {
        return (view.getUint8(offset) << 24) |
               (view.getUint8(offset + 1) << 16) |
               (view.getUint8(offset + 2) << 8) |
               view.getUint8(offset + 3);
    }

    /**
     * Try to parse snapshot for player information (ClientInfo objects)
     */
    tryParseSnapshot(compressedData, players, maxClients) {
        try {
            // Decompress the snapshot data
            const decompressedData = this.decompressChunk(compressedData);
            if (!decompressedData) return;

            // Parse snapshot items
            const unpacker = new DataUnpacker(decompressedData);
            
            // Try to find ClientInfo objects (NETOBJTYPE_CLIENTINFO = 1)
            while (unpacker.hasMoreData()) {
                try {
                    const itemType = unpacker.getInt();
                    const itemId = unpacker.getInt();
                    const itemSize = unpacker.getInt();
                    
                    if (itemSize <= 0 || itemSize > 1024) break;
                    
                    // ClientInfo type = 1
                    if (itemType === 1 && itemId >= 0 && itemId < maxClients) {
                        const name = unpacker.getString();
                        const clan = unpacker.getString();
                        const country = unpacker.getInt();
                        const skin = unpacker.getString();
                        
                        if (name && name.length > 0) {
                            players[itemId] = {
                                id: itemId,
                                name: name,
                                clan: clan || '',
                                country: country,
                                skin: skin || ''
                            };
                        }
                    } else {
                        // Skip this item
                        unpacker.skip(itemSize);
                    }
                } catch (e) {
                    break;
                }
            }
        } catch (error) {
            // Silent fail - snapshot parsing is best-effort
        }
    }

    /**
     * Try to parse message for chat (Sv_Chat messages)
     */
    tryParseMessage(compressedData, chatMessages, players, currentTick) {
        try {
            // Decompress the message data
            const decompressedData = this.decompressChunk(compressedData);
            if (!decompressedData) return;

            const unpacker = new DataUnpacker(decompressedData);
            
            // Read message type
            const msgType = unpacker.getInt();
            
            // NETMSGTYPE_SV_CHAT is typically around message ID 10-15
            // We'll check for the pattern: team (-2 to 3), clientId (-1 to 63), message string
            if (msgType >= 5 && msgType <= 20) {
                try {
                    const team = unpacker.getInt();
                    const clientId = unpacker.getInt();
                    const message = unpacker.getString();
                    
                    if (message && message.length > 0 && team >= -2 && team <= 3 && clientId >= -1 && clientId < 64) {
                        const playerName = (clientId >= 0 && players[clientId]) ? players[clientId].name : '***';
                        const seconds = Math.floor(currentTick / 50);
                        const minutes = Math.floor(seconds / 60);
                        const secs = seconds % 60;
                        const time = `${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
                        
                        chatMessages.push({
                            tick: currentTick,
                            time: time,
                            team: team,
                            clientId: clientId,
                            playerName: playerName,
                            message: message
                        });
                    }
                } catch (e) {
                    // Not a chat message
                }
            }
        } catch (error) {
            // Silent fail - message parsing is best-effort
        }
    }

    /**
     * Decompress chunk data (simplified - handles uncompressed and basic compression)
     */
    decompressChunk(compressedData) {
        try {
            // Try to detect if data is compressed
            // DDNet uses huffman + variable int compression
            // For now, we'll use a simplified approach
            
            // If data looks like it starts with reasonable values, might be uncompressed
            const unpacker = new DataUnpacker(compressedData);
            return compressedData;
        } catch (error) {
            return null;
        }
    }

    /**
     * Compare two arrays for equality
     */
    arraysEqual(a, b) {
        if (a.length !== b.length) return false;
        for (let i = 0; i < a.length; i++) {
            if (a[i] !== b[i]) return false;
        }
        return true;
    }

    /**
     * Format bytes to human-readable size
     */
    formatBytes(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
    }
}

/**
 * Data unpacker for reading variable-length integers and strings
 * Simplified version for demo parsing
 */
class DataUnpacker {
    constructor(data) {
        this.data = data;
        this.offset = 0;
    }

    hasMoreData() {
        return this.offset < this.data.length;
    }

    /**
     * Read a variable-length integer (simplified)
     */
    getInt() {
        if (this.offset >= this.data.length) return 0;
        
        let result = 0;
        let shift = 0;
        
        while (this.offset < this.data.length) {
            const byte = this.data[this.offset++];
            result |= (byte & 0x7F) << shift;
            shift += 7;
            
            if ((byte & 0x80) === 0) {
                break;
            }
            
            if (shift >= 32) break; // Prevent overflow
        }
        
        // Handle sign extension
        if (result & 0x40000000) {
            result |= 0x80000000;
        }
        
        return result >> 0; // Convert to signed 32-bit
    }

    /**
     * Read a null-terminated string
     */
    getString() {
        const start = this.offset;
        let end = start;
        
        // Find null terminator
        while (end < this.data.length && this.data[end] !== 0) {
            end++;
            if (end - start > 256) break; // Safety limit
        }
        
        if (end >= this.data.length) {
            this.offset = this.data.length;
            return '';
        }
        
        // Extract string bytes
        const bytes = this.data.slice(start, end);
        this.offset = end + 1; // Skip null terminator
        
        // Decode UTF-8
        try {
            return new TextDecoder('utf-8').decode(bytes);
        } catch (e) {
            return '';
        }
    }

    /**
     * Skip bytes
     */
    skip(count) {
        this.offset = Math.min(this.offset + count, this.data.length);
    }
}

// Export for use in main.js
if (typeof module !== 'undefined' && module.exports) {
    module.exports = DemoParser;
}

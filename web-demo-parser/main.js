/**
 * Main application logic for DDNet Demo Parser
 * Handles file uploads, UI interactions, and result display
 */

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    const uploadArea = document.getElementById('uploadArea');
    const fileInput = document.getElementById('fileInput');
    const resultsSection = document.getElementById('resultsSection');
    const resultsContainer = document.getElementById('results');
    const clearButton = document.getElementById('clearButton');

    const parser = new DemoParser();
    const parsedDemos = [];

    // Click to upload
    uploadArea.addEventListener('click', () => {
        fileInput.click();
    });

    // File selection
    fileInput.addEventListener('change', (e) => {
        handleFiles(e.target.files);
    });

    // Drag and drop
    uploadArea.addEventListener('dragover', (e) => {
        e.preventDefault();
        uploadArea.classList.add('dragover');
    });

    uploadArea.addEventListener('dragleave', () => {
        uploadArea.classList.remove('dragover');
    });

    uploadArea.addEventListener('drop', (e) => {
        e.preventDefault();
        uploadArea.classList.remove('dragover');
        handleFiles(e.dataTransfer.files);
    });

    // Clear button
    clearButton.addEventListener('click', () => {
        parsedDemos.length = 0;
        resultsContainer.innerHTML = '';
        resultsSection.style.display = 'none';
        clearButton.style.display = 'none';
    });

    /**
     * Handle uploaded files
     */
    async function handleFiles(files) {
        if (files.length === 0) return;

        resultsSection.style.display = 'block';
        clearButton.style.display = 'block';

        for (const file of files) {
            // Check file extension
            if (!file.name.toLowerCase().endsWith('.demo')) {
                showError(file.name, 'Invalid file type. Only .demo files are supported.');
                continue;
            }

            // Show loading
            const loadingId = showLoading(file.name);

            try {
                // Read file
                const fileData = await readFileAsArrayBuffer(file);
                
                // Parse demo
                const result = await parser.parse(fileData, file.name);
                
                // Remove loading
                removeLoading(loadingId);

                // Add to parsed demos
                parsedDemos.push(result);

                // Display result
                displayResult(result);
            } catch (error) {
                removeLoading(loadingId);
                showError(file.name, error.message);
            }
        }
    }

    /**
     * Read file as ArrayBuffer
     */
    function readFileAsArrayBuffer(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => resolve(e.target.result);
            reader.onerror = () => reject(new Error('Failed to read file'));
            reader.readAsArrayBuffer(file);
        });
    }

    /**
     * Show loading indicator
     */
    function showLoading(filename) {
        const id = 'loading-' + Date.now();
        const loadingDiv = document.createElement('div');
        loadingDiv.id = id;
        loadingDiv.className = 'demo-result';
        loadingDiv.innerHTML = `
            <div class="demo-header">
                <div class="demo-filename">${escapeHtml(filename)}</div>
                <div class="loading"></div>
            </div>
            <p>Parsing demo file...</p>
        `;
        resultsContainer.appendChild(loadingDiv);
        return id;
    }

    /**
     * Remove loading indicator
     */
    function removeLoading(id) {
        const element = document.getElementById(id);
        if (element) {
            element.remove();
        }
    }

    /**
     * Display parse error
     */
    function showError(filename, errorMessage) {
        const errorDiv = document.createElement('div');
        errorDiv.className = 'demo-result';
        errorDiv.innerHTML = `
            <div class="demo-header">
                <div class="demo-filename">${escapeHtml(filename)}</div>
                <div class="demo-size">Error</div>
            </div>
            <div class="error-message">
                <strong>❌ Error parsing demo file:</strong><br>
                ${escapeHtml(errorMessage)}
            </div>
        `;
        resultsContainer.appendChild(errorDiv);
    }

    /**
     * Display parsed demo result
     */
    function displayResult(result) {
        if (!result.success) {
            showError(result.filename, result.error);
            return;
        }

        const resultDiv = document.createElement('div');
        resultDiv.className = 'demo-result';

        // Build HTML content
        let html = `
            <div class="demo-header">
                <div class="demo-filename">📄 ${escapeHtml(result.filename)}</div>
                <div class="demo-size">${parser.formatBytes(result.fileSize)}</div>
            </div>
        `;

        // Basic information grid
        html += `
            <div class="info-grid">
                <div class="info-card">
                    <h3>📋 General Information</h3>
                    <div class="info-item">
                        <span class="info-label">Version:</span>
                        <span class="info-value">${result.header.version}</span>
                    </div>
                    <div class="info-item">
                        <span class="info-label">Net Version:</span>
                        <span class="info-value">${escapeHtml(result.header.netversion)}</span>
                    </div>
                    <div class="info-item">
                        <span class="info-label">Type:</span>
                        <span class="info-value">${escapeHtml(result.header.type)}</span>
                    </div>
                    <div class="info-item">
                        <span class="info-label">Timestamp:</span>
                        <span class="info-value">${escapeHtml(result.header.timestamp)}</span>
                    </div>
                    <div class="info-item">
                        <span class="info-label">Duration:</span>
                        <span class="info-value">${result.duration.formatted} (${result.duration.seconds}s)</span>
                    </div>
                </div>

                <div class="info-card">
                    <h3>🗺️ Map Information</h3>
                    <div class="info-item">
                        <span class="info-label">Map Name:</span>
                        <span class="info-value">${escapeHtml(result.mapInfo.name)}</span>
                    </div>
                    <div class="info-item">
                        <span class="info-label">Map Size:</span>
                        <span class="info-value">${parser.formatBytes(result.mapInfo.size)}</span>
                    </div>
                    <div class="info-item">
                        <span class="info-label">Map CRC:</span>
                        <span class="info-value">${result.header.mapCrc}</span>
                    </div>
                    ${result.sha256 ? `
                    <div class="info-item">
                        <span class="info-label">SHA256:</span>
                        <span class="info-value" style="font-size: 0.75em;">${result.sha256}</span>
                    </div>
                    ` : ''}
                </div>
            </div>
        `;

        // Timeline markers
        if (result.timelineMarkers.count > 0) {
            html += `
                <div class="timeline-markers">
                    <h3>📌 Timeline Markers (${result.timelineMarkers.count})</h3>
                    <div class="marker-list">
                        ${result.timelineMarkers.markers.map(marker => {
                            const seconds = Math.floor(marker / 50);
                            const minutes = Math.floor(seconds / 60);
                            const secs = seconds % 60;
                            const time = `${minutes}:${secs.toString().padStart(2, '0')}`;
                            return `<div class="marker">Tick ${marker} (${time})</div>`;
                        }).join('')}
                    </div>
                </div>
            `;
        }

        // Statistics
        html += `
            <div class="stats-section">
                <h3>📊 Demo Statistics</h3>
                <div class="stat-grid">
                    <div class="stat-item">
                        <span class="stat-value">${result.statistics.totalChunks}</span>
                        <span class="stat-label">Total Chunks</span>
                    </div>
                    <div class="stat-item">
                        <span class="stat-value">${result.statistics.tickMarkers}</span>
                        <span class="stat-label">Tick Markers</span>
                    </div>
                    <div class="stat-item">
                        <span class="stat-value">${result.statistics.keyframes}</span>
                        <span class="stat-label">Keyframes</span>
                    </div>
                    <div class="stat-item">
                        <span class="stat-value">${result.statistics.snapshots}</span>
                        <span class="stat-label">Snapshots</span>
                    </div>
                    <div class="stat-item">
                        <span class="stat-value">${result.statistics.deltas}</span>
                        <span class="stat-label">Delta Snapshots</span>
                    </div>
                    <div class="stat-item">
                        <span class="stat-value">${result.statistics.messages}</span>
                        <span class="stat-label">Messages</span>
                    </div>
                </div>
            </div>
        `;

        // Tick information
        if (result.statistics.firstTick !== -1) {
            html += `
                <div class="info-card">
                    <h3>⏱️ Tick Information</h3>
                    <div class="info-item">
                        <span class="info-label">First Tick:</span>
                        <span class="info-value">${result.statistics.firstTick}</span>
                    </div>
                    <div class="info-item">
                        <span class="info-label">Last Tick:</span>
                        <span class="info-value">${result.statistics.lastTick}</span>
                    </div>
                    <div class="info-item">
                        <span class="info-label">Total Ticks:</span>
                        <span class="info-value">${result.duration.ticks || 0}</span>
                    </div>
                    <div class="info-item">
                        <span class="info-label">Unique Ticks:</span>
                        <span class="info-value">${result.statistics.ticks.length}</span>
                    </div>
                </div>
            `;
        }

        // Players information
        const playerCount = Object.keys(result.statistics.players || {}).length;
        if (playerCount > 0) {
            html += `
                <div class="info-card" style="border-left-color: #2196F3;">
                    <h3 style="color: #2196F3;">👥 Players (${playerCount})</h3>
                    <div style="max-height: 300px; overflow-y: auto;">
                        ${Object.values(result.statistics.players).map(player => `
                            <div class="info-item">
                                <span class="info-label">${player.id}:</span>
                                <span class="info-value">${escapeHtml(player.name)}${player.clan ? ' [' + escapeHtml(player.clan) + ']' : ''}</span>
                            </div>
                        `).join('')}
                    </div>
                </div>
            `;
        }

        // Chat messages
        const chatCount = (result.statistics.chatMessages || []).length;
        if (chatCount > 0) {
            html += `
                <div class="chat-messages">
                    <h3>💬 Chat Messages (${chatCount})</h3>
                    <div style="max-height: 400px; overflow-y: auto;">
                        ${result.statistics.chatMessages.slice(0, 100).map(msg => `
                            <div class="message">
                                <span class="message-time">[${msg.time}]</span>
                                <span class="message-player">${escapeHtml(msg.playerName)}:</span>
                                <span class="message-text">${escapeHtml(msg.message)}</span>
                            </div>
                        `).join('')}
                        ${chatCount > 100 ? `<div class="info-item"><em>Showing first 100 of ${chatCount} messages</em></div>` : ''}
                    </div>
                </div>
            `;
        }

        // JSON Export button
        html += `
            <div style="margin-top: 20px; text-align: center;">
                <button class="export-button" onclick="exportDemoJSON('${escapeHtml(result.filename)}')">
                    📥 Export as JSON
                </button>
            </div>
        `;

        resultDiv.innerHTML = html;
        resultsContainer.appendChild(resultDiv);
        
        // Store result for export
        window.demoResults = window.demoResults || {};
        window.demoResults[result.filename] = result;
    }

    /**
     * Export demo data as JSON
     */
    window.exportDemoJSON = function(filename) {
        const result = window.demoResults[filename];
        if (!result) return;

        const jsonStr = JSON.stringify(result, null, 2);
        const blob = new Blob([jsonStr], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename.replace('.demo', '') + '_parsed.json';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    /**
     * Escape HTML to prevent XSS
     */
    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
});

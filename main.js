function haversine(lat1, lon1, lat2, lon2) {
    const R = 6371; // km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        math_cos(lat1 * Math.PI / 180) * math_cos(lat2 * Math.PI / 180) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

// Fix for math_cos
function math_cos(rad) { return Math.cos(rad); }

function formatDate(dateObj) {
    if (!dateObj || isNaN(dateObj.getTime())) return 'N/A';
    const d = dateObj.getDate().toString().padStart(2, '0');
    const m = (dateObj.getMonth() + 1).toString().padStart(2, '0');
    const y = dateObj.getFullYear();
    const h = dateObj.getHours().toString().padStart(2, '0');
    const min = dateObj.getMinutes().toString().padStart(2, '0');
    const s = dateObj.getSeconds().toString().padStart(2, '0');
    return `${d}-${m}-${y} ${h}:${min}:${s} IST`;
}

function parseIndianDate(str) {
    if (!str) return null;
    // Handle DD-MM-YYYY or YYYY-MM-DD
    const parts = str.split(/[ \-T:/]/);
    if (parts.length >= 3) {
        if (parts[0].length === 4) { // YYYY-MM-DD
            return new Date(str.replace(' ', 'T')).getTime();
        } else if (parts[2].length === 4) { // DD-MM-YYYY
            const d = parseInt(parts[0]);
            const m = parseInt(parts[1]) - 1;
            const y = parseInt(parts[2]);
            const h = parseInt(parts[3] || 0);
            const min = parseInt(parts[4] || 0);
            const s = parseInt(parts[5] || 0);
            return new Date(y, m, d, h, min, s).getTime();
        }
    }
    return Date.parse(str.replace(' ', 'T')) || null;
}

document.addEventListener('DOMContentLoaded', () => {
    const dropZone = document.getElementById('drop-zone');
    const fileInput = document.getElementById('file-input');
    const resultsSection = document.getElementById('results-section');
    const rawDistEl = document.getElementById('raw-dist');
    const rawPointsEl = document.getElementById('raw-points');
    const cleanedDistEl = document.getElementById('cleaned-dist');
    const verdictTextEl = document.getElementById('verdict-summary');
    const startTimeEl = document.getElementById('start-time');
    const endTimeEl = document.getElementById('end-time');
    const applyFilterBtn = document.getElementById('apply-filter');
    const versionTag = document.createElement('span');
    versionTag.style.cssText = 'font-size: 0.7rem; opacity: 0.5; position: fixed; bottom: 10px; right: 10px;';
    versionTag.innerText = 'Engine: v3.0';
    document.body.appendChild(versionTag);

    let currentData = null;
    let map = null;
    let pathLayer = null;
    let markerLayer = null;
    let vehicleMarker = null;
    let pointsForReplay = [];

    function initMap() {
        if (map) return;
        map = L.map('map').setView([19.0760, 72.8777], 12); // Default to Mumbai
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap contributors'
        }).addTo(map);
        
        pathLayer = L.polyline([], { color: '#3b82f6', weight: 4, opacity: 0.7 }).addTo(map);
        markerLayer = L.layerGroup().addTo(map);
        
        // Custom Vehicle Marker
        const vehicleIcon = L.divIcon({
            className: 'vehicle-marker',
            html: '<div style="width: 14px; height: 14px; background: #60a5fa; border: 2px solid white; border-radius: 50%; box-shadow: 0 0 10px #60a5fa;"></div>',
            iconSize: [14, 14],
            iconAnchor: [7, 7]
        });
        vehicleMarker = L.marker([0, 0], { icon: vehicleIcon }).addTo(map);
    }

    dropZone.addEventListener('click', () => fileInput.click());
    
    applyFilterBtn.addEventListener('click', () => {
        if (currentData) analyze(currentData);
        else alert('Please upload a file first.');
    });

    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        dropZone.addEventListener(eventName, e => {
            e.preventDefault();
            e.stopPropagation();
        }, false);
    });

    ['dragenter', 'dragover'].forEach(eventName => {
        dropZone.addEventListener(eventName, () => dropZone.classList.add('active'), false);
    });

    ['dragleave', 'drop'].forEach(eventName => {
        dropZone.addEventListener(eventName, () => dropZone.classList.remove('active'), false);
    });

    dropZone.addEventListener('drop', e => {
        const dt = e.dataTransfer;
        const files = dt.files;
        handleFile(files[0]);
    });

    fileInput.addEventListener('change', e => {
        handleFile(e.target.files[0]);
    });

    function handleFile(file) {
        if (!file || !file.name.endsWith('.csv')) {
            alert('Please upload a valid CSV file.');
            return;
        }

        Papa.parse(file, {
            header: true,
            complete: results => {
                currentData = results.data;
                analyze(currentData);
            }
        });
    }

    function analyze(data) {
        const rawPoints = [];
        console.log('Analyzing data...', data.length, 'rows found');
        
        data.forEach((row, index) => {
            try {
                const payloadKey = Object.keys(row).find(k => k.toLowerCase() === 'vendor_payload');
                if (!payloadKey || !row[payloadKey]) return;

                const payload = JSON.parse(row[payloadKey]);
                const lat = parseFloat(payload.latitude || payload.lat);
                const lon = parseFloat(payload.longitude || payload.lon || payload.lng);
                const acc = parseFloat(payload.mAccuracy || payload.accuracy || payload.acc || 0);
                const rawTime = payload.time || row.Action_Date || row.time;
                let time;
                if (typeof rawTime === 'number') time = rawTime;
                else if (typeof rawTime === 'string') {
                    time = parseIndianDate(rawTime) || index;
                } else {
                    time = index;
                }
                const date = formatDate(new Date(time));

                if (!isNaN(lat) && !isNaN(lon)) {
                    rawPoints.push({ lat, lon, acc, time, date });
                }
            } catch (e) {
                if (index < 5) console.error('Error parsing row', index, e);
            }
        });

        if (rawPoints.length < 2) {
            alert('Not enough valid tracking data found.');
            return;
        }

        // 1. Total File Raw Distance (Original file order baseline)
        let totalFileRawDist = 0;
        for (let i = 1; i < rawPoints.length; i++) {
            totalFileRawDist += haversine(rawPoints[i-1].lat, rawPoints[i-1].lon, rawPoints[i].lat, rawPoints[i].lon);
        }

        rawPoints.sort((a, b) => a.time - b.time);

        // Time Range Filter
        const startWindow = parseIndianDate(startTimeEl.value) || 0;
        const endWindow = parseIndianDate(endTimeEl.value) || Infinity;
        
        const filteredByTime = rawPoints.filter(p => p.time >= startWindow && p.time <= endWindow);
        const pointsToAnalyze = filteredByTime.length >= 2 ? filteredByTime : rawPoints;

        if (filteredByTime.length < 2 && (startTimeEl.value || endTimeEl.value)) {
            console.warn('Selected time range contains less than 2 points. Falling back to full data.');
        }

        // 2. Window Raw Distance (After chronological sorting)
        let windowRawDist = 0;
        for (let i = 1; i < pointsToAnalyze.length; i++) {
            windowRawDist += haversine(pointsToAnalyze[i-1].lat, pointsToAnalyze[i-1].lon, pointsToAnalyze[i].lat, pointsToAnalyze[i].lon);
        }

        // 3. Ping-Pong and Gap Detection (Run on ALL sorted raw points)
        const cleanedRawPoints = [];
        const anomalies = [];
        let pingPongDistRemoved = 0;
        
        if (pointsToAnalyze.length > 0) {
            cleanedRawPoints.push(pointsToAnalyze[0]);
            let i = 1;
            while (i < pointsToAnalyze.length) {
                const pLast = cleanedRawPoints[cleanedRawPoints.length - 1];
                const pCurr = pointsToAnalyze[i];
                const distOut = haversine(pLast.lat, pLast.lon, pCurr.lat, pCurr.lon);
                const timeGap = (pCurr.time - pLast.time) / 1000 / 60; // minutes
                
                // Gap Detection
                if (timeGap > 30 || distOut > 10) {
                    anomalies.push({
                        type: timeGap > 30 ? 'TIME GAP' : 'DIST GAP',
                        severity: timeGap > 60 || distOut > 50 ? 'critical' : 'warning',
                        date: pCurr.date,
                        detail: `${timeGap.toFixed(0)} min, ${distOut.toFixed(1)} km jump`
                    });
                }

                // Speed Anomaly Detection (> 180 km/h)
                if (timeGap > 0.01) {
                    const speed = distOut / (timeGap / 60);
                    if (speed > 180) {
                        anomalies.push({
                            type: 'SPEED JUMP',
                            severity: 'critical',
                            date: pCurr.date,
                            detail: `Impossible speed: ${speed.toFixed(0)} km/h detected`
                        });
                    }
                }

                // 3. Ping-Pong and Spike detection
                if (distOut > 2) { // Ultra-sensitive for systematic drift
                    let reboundIndex = -1;
                    
                    // Strategy A: Rebound check (Look for return to origin)
                    const lookahead = Math.min(i + 150, pointsToAnalyze.length);
                    for (let j = i + 1; j < lookahead; j++) {
                        const distReturn = haversine(pLast.lat, pLast.lon, pointsToAnalyze[j].lat, pointsToAnalyze[j].lon);
                        if (distReturn < 5) { // Broad return threshold to catch drift
                            reboundIndex = j;
                            break;
                        }
                    }

                    // Strategy B: Spike check (Single point outlier)
                    let isSpike = false;
                    if (reboundIndex === -1 && i < pointsToAnalyze.length - 1) {
                        const pNext = pointsToAnalyze[i+1];
                        const distNext = haversine(pCurr.lat, pCurr.lon, pNext.lat, pNext.lon);
                        const distBridge = haversine(pLast.lat, pLast.lon, pNext.lat, pNext.lon);
                        if (distOut > 10 && distNext > 10 && distBridge < 2) {
                            isSpike = true;
                        }
                    }

                    if (reboundIndex !== -1 || isSpike) {
                        const anomalyType = isSpike ? 'SPIKE' : 'PING-PONG';
                        
                        // Calculate net savings (Detour distance vs the bridge we'll create)
                        let detourDist = distOut;
                        let bridgeDist = 0;
                        if (reboundIndex !== -1) {
                            for(let k = i; k < reboundIndex; k++) {
                                detourDist += haversine(pointsToAnalyze[k].lat, pointsToAnalyze[k].lon, pointsToAnalyze[k+1].lat, pointsToAnalyze[k+1].lon);
                            }
                            bridgeDist = haversine(pLast.lat, pLast.lon, pointsToAnalyze[reboundIndex].lat, pointsToAnalyze[reboundIndex].lon);
                        } else {
                            // Single point spike
                            detourDist += haversine(pCurr.lat, pCurr.lon, pointsToAnalyze[i+1].lat, pointsToAnalyze[i+1].lon);
                            bridgeDist = haversine(pLast.lat, pLast.lon, pointsToAnalyze[i+1].lat, pointsToAnalyze[i+1].lon);
                        }
                        pingPongDistRemoved += (detourDist - bridgeDist);

                        anomalies.push({
                            type: anomalyType,
                            severity: 'critical',
                            date: pCurr.date,
                            detail: `Detected ${distOut.toFixed(1)}km ${anomalyType.toLowerCase()} jump`
                        });
                        console.log(`${anomalyType} Found:`, pCurr.date, distOut.toFixed(2), 'km');
                        
                        if (reboundIndex !== -1) i = reboundIndex;
                        // For spikes, we just skip this one point (index remains i+1 in next loop)
                        else i++; 
                        
                        continue;
                    }
                }
                cleanedRawPoints.push(pCurr);
                i++;
            }
        }

        // 4. Accuracy Filter (<30m) - Applied on already cleaned points
        const finalPoints = cleanedRawPoints.filter(p => !p.acc || p.acc < 30);
        const qualityRate = pointsToAnalyze.length > 0 ? ((finalPoints.length / pointsToAnalyze.length) * 100).toFixed(1) : 0;

        // Calculate Acc-Filter removal dist
        let distBeforeAcc = 0;
        for (let i = 1; i < cleanedRawPoints.length; i++){
            distBeforeAcc += haversine(cleanedRawPoints[i-1].lat, cleanedRawPoints[i-1].lon, cleanedRawPoints[i].lat, cleanedRawPoints[i].lon);
        }
        
        // 5. Final Verified Distance
        let cleanedDist = 0;
        for (let i = 1; i < finalPoints.length; i++) {
            cleanedDist += haversine(finalPoints[i-1].lat, finalPoints[i-1].lon, finalPoints[i].lat, finalPoints[i].lon);
        }
        const accDistRemoved = distBeforeAcc - cleanedDist;

        const isFiltered = !!(startTimeEl.value || endTimeEl.value);
        const rawToDisplay = isFiltered ? windowRawDist : totalFileRawDist;
        const countToDisplay = isFiltered ? pointsToAnalyze.length : rawPoints.length;
        const excludedCount = rawPoints.length - pointsToAnalyze.length;
        const timeRangeStr = isFiltered ? `${startTimeEl.value || 'Start'} to ${endTimeEl.value || 'End'}` : '';
        
        // Update label
        document.querySelector('.analysis-raw h3').innerText = isFiltered ? 'Raw Data (Window)' : 'Raw Data (Total)';

        // Initialize Map and Draw Path
        initMap();
        pointsForReplay = pointsToAnalyze;
        drawTripOnMap(pointsToAnalyze, anomalies);

        displayResults(rawToDisplay, countToDisplay, cleanedDist, finalPoints.length, qualityRate, pointsToAnalyze.length - finalPoints.length, anomalies, isFiltered, timeRangeStr, excludedCount, pingPongDistRemoved, accDistRemoved);
    }

    function displayResults(rawDist, rawCount, cleanedDist, cleanedCount, qualityRate, lowAccCount, anomalies, isFiltered, timeRangeStr, excludedCount, ppDist, accDist) {
        document.getElementById('results-section').classList.remove('hidden');
        document.getElementById('map-section').classList.remove('hidden');
        
        // Force Leaflet to recalculate size now that it's visible
        if (map) {
            setTimeout(() => {
                map.invalidateSize();
                if (pathLayer && pathLayer.getLatLngs().length > 0) {
                    map.fitBounds(pathLayer.getBounds(), { padding: [40, 40] });
                }
            }, 100);
        }

        document.getElementById('raw-dist').innerText = rawDist.toFixed(2);
        document.getElementById('raw-points').innerText = rawCount;
        document.getElementById('cleaned-dist').innerText = cleanedDist.toFixed(2);
        document.getElementById('cleaned-points').innerText = cleanedCount;
        document.getElementById('quality-rate').innerText = qualityRate;
        document.getElementById('low-acc-points').innerText = lowAccCount;

        const anomalyList = document.getElementById('anomaly-list');
        anomalyList.innerHTML = anomalies.length ? '' : '<p class="placeholder">No issues detected.</p>';
        anomalies.forEach(a => {
            const div = document.createElement('div');
            let badgeClass = a.severity === 'critical' ? 'badge-red' : 'badge-orange';
            if (a.type === 'SPEED JUMP') badgeClass = 'badge-purple';
            if (a.type === 'PING-PONG' || a.type === 'SPIKE') badgeClass = 'badge-red';
            
            div.className = `anomaly-item ${a.severity}`;
            div.innerHTML = `
                <span class="timestamp">${a.date} <span class="badge ${badgeClass}">${a.type}</span></span>
                <span class="detail">${a.detail}</span>
            `;
            anomalyList.appendChild(div);
        });

        const inflation = rawDist > 0 ? ((rawDist - cleanedDist) / cleanedDist * 100).toFixed(1) : 0;
        const verdictSummary = document.getElementById('verdict-summary');
        
        let filterHtml = isFiltered ? 
            `<div class="filter-status">
                <span class="badge badge-purple">ACTIVE FILTER</span> 
                <span>Analyzing ${timeRangeStr}</span>
                <p style="font-size:0.8rem; opacity:0.7;">Time filter excluded ${excludedCount} points from assessment.</p>
            </div>` : '';

        verdictSummary.innerHTML = `
            ${filterHtml}
            <p style="margin-top:1rem;">Analysis of <strong>${rawCount}</strong> points finished with <strong>${anomalies.length}</strong> major anomalies.</p>
            <p>Total Distance Inflation: <strong>${inflation}%</strong></p>
            
            <div style="margin: 1.5rem 0; padding: 1rem; background: rgba(255,255,255,0.03); border-radius: 8px; border: 1px solid rgba(255,255,255,0.05);">
                <h4 style="font-size:0.8rem; color:var(--text-secondary); margin-bottom:0.5rem;">NET DEDUCTIONS (SAVINGS)</h4>
                <div style="display:flex; justify-content:space-between; margin-bottom:0.4rem;">
                    <span>Eliminated GPS Jumps:</span>
                    <span style="color:#f87171; font-weight:700;">- ${ppDist.toFixed(2)} KM</span>
                </div>
                <div style="display:flex; justify-content:space-between;">
                    <span>Accuracy Filter (Jitter):</span>
                    <span style="color:#fbbf24; font-weight:700;">- ${accDist.toFixed(2)} KM</span>
                </div>
            </div>

            <p>The system reported ${rawDist.toFixed(2)} KM, but the verified business distance is <strong>${cleanedDist.toFixed(2)} KM</strong>.</p>
            <p style="margin-top:20px; color:var(--text-secondary); font-size:0.9rem;">Cleaned data excludes all GPS ping-pongs and verified accuracy-based noise.</p>
        `;

        document.getElementById('results-section').scrollIntoView({ behavior: 'smooth' });
    }

    function drawTripOnMap(points, anomalies) {
        if (!map) initMap();
        
        // Clear previous
        markerLayer.clearLayers();
        pathLayer.setLatLngs([]);

        if (points.length === 0) return;

        const latLngs = points.map(p => [p.lat, p.lon]);
        pathLayer.setLatLngs(latLngs);
        
        // Fit bounds
        map.fitBounds(pathLayer.getBounds(), { padding: [40, 40] });

        // Add Anomaly Markers (Ping-Pongs)
        anomalies.forEach(a => {
            if (a.type === 'PING-PONG' || a.type === 'SPIKE') {
                const point = points.find(p => p.date === a.date);
                if (point) {
                    L.circleMarker([point.lat, point.lon], {
                        radius: 8,
                        fillColor: '#ef4444',
                        color: '#fff',
                        weight: 2,
                        opacity: 1,
                        fillOpacity: 0.8
                    }).addTo(markerLayer).bindPopup(`<b>${a.type}</b><br>${a.detail}`);
                }
            }
        });

        // Setup Slider
        const slider = document.getElementById('replaySlider');
        slider.disabled = false;
        slider.max = points.length - 1;
        slider.value = 0;
        
        updateReplay(0);
    }

    const replaySlider = document.getElementById('replaySlider');
    const replayTime = document.getElementById('replayTime');
    const replayMetrics = document.getElementById('replayMetrics');

    replaySlider.addEventListener('input', (e) => {
        updateReplay(parseInt(e.target.value));
    });

    function updateReplay(index) {
        const point = pointsForReplay[index];
        if (!point) return;

        vehicleMarker.setLatLng([point.lat, point.lon]);
        replayTime.innerText = point.date.split(' ')[1] || point.date;
        replayMetrics.innerText = `Points: ${index + 1}/${pointsForReplay.length} | Acc: ${point.acc}m`;
        
        document.querySelector('.replay-status').innerText = `At: ${point.date}`;
    }

    // Playback logic
    let playInterval = null;
    const playBtn = document.getElementById('playBtn');
    
    playBtn.disabled = false;
    playBtn.addEventListener('click', () => {
        if (playInterval) {
            clearInterval(playInterval);
            playInterval = null;
            playBtn.innerText = 'Play';
            document.querySelector('.replay-status').innerText = 'Paused';
        } else {
            playBtn.innerText = 'Pause';
            playInterval = setInterval(() => {
                let current = parseInt(replaySlider.value);
                if (current < pointsForReplay.length - 1) {
                    replaySlider.value = current + 1;
                    updateReplay(current + 1);
                } else {
                    clearInterval(playInterval);
                    playInterval = null;
                    playBtn.innerText = 'Play';
                }
            }, 100);
        }
    });
});

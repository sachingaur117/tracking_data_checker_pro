function haversine(lat1, lon1, lat2, lon2) {
    const R = 6371; // km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

function formatDate(dateObj) {
    if (!dateObj || isNaN(dateObj.getTime())) return 'N/A';
    const d = dateObj.getDate().toString().padStart(2, '0');
    const m = (dateObj.getMonth() + 1).toString().padStart(2, '0');
    const y = dateObj.getFullYear();
    const h = dateObj.getHours().toString().padStart(2, '0');
    const min = dateObj.getMinutes().toString().padStart(2, '0');
    const s = dateObj.getSeconds().toString().padStart(2, '0');
    return `${d}-${m}-${y} ${h}:${min}:${s}`;
}

function parseIndianDate(str) {
    if (!str) return null;
    try {
        const sStr = str.toString().trim();
        // Handle ISO
        if (sStr.includes('T')) return new Date(sStr).getTime();
        
        // Handle YYYY-MM-DD or DD-MM-YYYY
        const parts = sStr.split(/[ \-T:/.]/).map(Number);
        if (parts.length < 3) return null;

        let y, m, d, h = 0, min = 0, s = 0;
        if (parts[0] > 1000) { // YYYY-MM-DD
            y = parts[0]; m = parts[1]; d = parts[2];
            h = parts[3] || 0; min = parts[4] || 0; s = parts[5] || 0;
        } else { // DD-MM-YYYY
            d = parts[0]; m = parts[1]; y = parts[2];
            h = parts[3] || 0; min = parts[4] || 0; s = parts[5] || 0;
        }
        
        const date = new Date(y, m - 1, d, h, min, s);
        return isNaN(date.getTime()) ? null : date.getTime();
    } catch (e) {
        return null;
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const dropZone = document.getElementById('drop-zone');
    const fileInput = document.getElementById('file-input');
    const resultsSection = document.getElementById('results-section');
    const startTimeEl = document.getElementById('start-time');
    const endTimeEl = document.getElementById('end-time');
    const applyFilterBtn = document.getElementById('apply-filter');
    const auditSummaryEl = document.getElementById('audit-summary');
    const realityLogEl = document.getElementById('speed-violations-log');
    const jittersLogEl = document.getElementById('jitter-violations-log');
    const gapsLogEl = document.getElementById('gap-violations-log');
    const accuracyLogEl = document.getElementById('accuracy-score');

    let currentData = null;
    let map = null;
    let pathLayer = null;
    let markerLayer = null;
    let vehicleMarker = null;
    let pointsForReplay = [];

    function initMap() {
        if (map) return;
        map = L.map('map').setView([19.0760, 72.8777], 12); // Default to Mumbai
        L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
            attribution: '© OpenStreetMap contributors © CARTO'
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

        document.getElementById('file-status').innerHTML = `Active File: <strong>${file.name}</strong>`;

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
        data.forEach((row, index) => {
            try {
                const payloadKey = Object.keys(row).find(k => k.toLowerCase() === 'vendor_payload');
                let lat, lon, acc, time;
                if (payloadKey && row[payloadKey]) {
                    const payload = JSON.parse(row[payloadKey]);
                    lat = parseFloat(payload.latitude || payload.lat);
                    lon = parseFloat(payload.longitude || payload.lon || payload.lng);
                    acc = parseFloat(payload.mAccuracy || payload.accuracy || payload.acc || 0);
                    const rawTime = payload.time || row.Action_Date || row.time;
                    time = (typeof rawTime === 'number') ? rawTime : (parseIndianDate(rawTime) || index);
                } else {
                    lat = parseFloat(row.latitude || row.Lat);
                    lon = parseFloat(row.longitude || row.Lon);
                    acc = parseFloat(row.accuracy || row.Accuracy || 0);
                    time = parseIndianDate(row.time || row.Timestamp || row.Action_Date) || index;
                }
                if (!isNaN(lat) && !isNaN(lon)) {
                    rawPoints.push({ lat, lon, acc, time, date: formatDate(new Date(time)) });
                }
            } catch (e) {}
        });

        if (rawPoints.length < 2) return alert('No valid data found.');
        rawPoints.sort((a, b) => a.time - b.time);

        const auditReality = []; // Speed
        const auditJitters = []; // GPS Jitters
        const auditGaps = [];    // Continuity
        const cleanedPoints = [rawPoints[0]];
        
        let jitterStartIdx = 0;
        let jitterAccumulatedDist = 0;

        for (let i = 1; i < rawPoints.length; i++) {
            const pPrev = rawPoints[i - 1];
            const pCurr = rawPoints[i];
            const dist = haversine(pPrev.lat, pPrev.lon, pCurr.lat, pCurr.lon);
            const timeDiff = (pCurr.time - pPrev.time) / 1000 / 60; // minutes

            // 1. Physical Reality (>120km/h)
            if (timeDiff > 0.01) {
                const speed = dist / (timeDiff / 60);
                if (speed > 120) {
                    auditReality.push({
                        time: pCurr.date,
                        speed: speed.toFixed(1),
                        extra: dist.toFixed(2)
                    });
                }
            }

            // 2. Continuity (>5 mins)
            if (timeDiff > 5) {
                auditGaps.push({
                    start: pPrev.date,
                    duration: timeDiff.toFixed(1)
                });
            }

            // 3. GPS Jitters (Stationary Drift + Spikes)
            
            // Spike / Rebound Detection (Jump and come back)
            // Even a 50m jump that rebounds quickly should be caught as Jitter
            if (dist > 0.05) { 
                let reboundIdx = -1;
                const lookahead = Math.min(i + 10, rawPoints.length); // Quick rebounds
                for (let j = i + 1; j < lookahead; j++) {
                    const distBack = haversine(pPrev.lat, pPrev.lon, rawPoints[j].lat, rawPoints[j].lon);
                    // If it returns to within 30m of the starting point
                    if (distBack < 0.03) { 
                        reboundIdx = j;
                        break;
                    }
                }
                if (reboundIdx !== -1) {
                    let driftInJump = 0;
                    for (let k = i; k <= reboundIdx; k++) {
                        driftInJump += haversine(rawPoints[k-1].lat, rawPoints[k-1].lon, rawPoints[k].lat, rawPoints[k].lon);
                    }
                    if (driftInJump > 0.05) { // Only log if it adds > 50m
                        auditJitters.push({
                            start: pCurr.date,
                            type: 'Spike Rebound',
                            drift: driftInJump.toFixed(2)
                        });
                        i = reboundIdx; 
                        continue;
                    }
                }
            }

            // Stationary Drift Detection (Radius of 50m)
            const displacement = haversine(rawPoints[jitterStartIdx].lat, rawPoints[jitterStartIdx].lon, pCurr.lat, pCurr.lon);
            if (displacement < 0.05) { // 50 meters radius
                jitterAccumulatedDist += dist;
            } else {
                // Log even small drifts (10m+) if they accumulate while stationary
                if (jitterAccumulatedDist > 0.01) { 
                    auditJitters.push({
                        start: rawPoints[jitterStartIdx].date,
                        type: 'Stationary Drift',
                        drift: jitterAccumulatedDist.toFixed(3) // Higher precision for small jitters
                    });
                }
                jitterStartIdx = i;
                jitterAccumulatedDist = 0;
            }

            // 4. Quality Filter (Exclude > 30m accuracy)
            if (pCurr.acc < 30) {
                cleanedPoints.push(pCurr);
            }
        }

        // RPM Milestone Logic
        const milestoneRpm = [];
        const segmentSize = Math.max(1, Math.floor(rawPoints.length / 6)); // 6 milestones
        
        for (let m = 0; m < rawPoints.length; m += segmentSize) {
            const segment = rawPoints.slice(m, m + segmentSize);
            if (segment.length < 2) continue;
            
            const startT = segment[0].time;
            const endT = segment[segment.length - 1].time;
            const durationMin = (endT - startT) / 60000; // Corrected to 1 min = 60000ms
            
            const rpm = (segment.length / Math.max(1, durationMin)).toFixed(1);
            const rpmNum = parseFloat(rpm);
            const status = (rpmNum >= 1.0 && rpmNum <= 20.0) ? 'Optimal' : 'Sub-optimal';
            
            milestoneRpm.push({
                name: `Milestone ${Math.floor(m / segmentSize) + 1}`,
                time: segment[0].date.split(' ')[1],
                rpm: rpm,
                status: status
            });
        }

        const totalDurationMin = (rawPoints[rawPoints.length - 1].time - rawPoints[0].time) / 60000;
        const totalRpm = (rawPoints.length / Math.max(1, totalDurationMin)).toFixed(1);

        displayResults(rawPoints, { reality: auditReality, jitters: auditJitters, gaps: auditGaps }, milestoneRpm, totalRpm);
    }

    function displayResults(rawPoints, audit, milestones, totalRpm) {
        document.getElementById('results-section').classList.remove('hidden');
        document.getElementById('report-timestamp').innerText = `Generated on: ${new Date().toLocaleString()}`;
        
        // Calculate Total Distance Suppressed
        const totalExtraReality = audit.reality.reduce((sum, d) => sum + parseFloat(d.extra), 0);
        const totalDriftJitter = audit.jitters.reduce((sum, d) => sum + parseFloat(d.drift), 0);
        const totalSuppressed = (totalExtraReality + totalDriftJitter).toFixed(2);

        // Update Count Header
        document.getElementById('speed-count').innerText = audit.reality.length;
        document.getElementById('jitter-count').innerText = audit.jitters.length;
        document.getElementById('gap-count').innerText = audit.gaps.length;
        document.getElementById('accuracy-score-report').innerText = totalRpm + ' RPM';

        const populate = (id, data, tpl) => {
            const el = document.getElementById(id);
            if (el) {
                el.innerHTML = data.length ? data.map(tpl).join('') : '<tr><td colspan="4" class="placeholder">Compliance verified. No issues detected.</td></tr>';
            }
        };

        // Populate Milestone RPM
        populate('milestone-rpm-log', milestones, d => `
            <tr>
                <td>${d.name}</td>
                <td>${d.time}</td>
                <td><span class="badge ${d.status === 'Optimal' ? 'badge-green' : 'badge-orange'}">${d.status}</span></td>
                <td><strong>${d.rpm} RPM</strong></td>
            </tr>
        `);

        populate('speed-violations-log', audit.reality, d => `<tr><td>${d.time.split(' ')[1]}</td><td>Speed Spike</td></tr>`);
        populate('jitter-violations-log', audit.jitters, d => `<tr><td>${d.start.split(' ')[1]}</td><td>${d.type}</td></tr>`);
        populate('gap-violations-log', audit.gaps, d => `<tr><td>${d.start.split(' ')[1]}</td><td>${d.duration} m</td></tr>`);

        initMap();
        pointsForReplay = rawPoints;
        drawTripOnMap(rawPoints, []);
    }

    function drawTripOnMap(points, anomalies) {
        if (!map) initMap();
        markerLayer.clearLayers();
        pathLayer.setLatLngs([]);
        if (points.length === 0) return;
        const latLngs = points.map(p => [p.lat, p.lon]);
        pathLayer.setLatLngs(latLngs);
        map.fitBounds(pathLayer.getBounds(), { padding: [40, 40] });
        
        const slider = document.getElementById('replaySlider');
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
        replayMetrics.innerText = `Point: ${index + 1}/${pointsForReplay.length} | Acc: ${point.acc}m`;
    }

    let playInterval = null;
    const playBtn = document.getElementById('playBtn');
    playBtn.onclick = () => {
        if (playInterval) {
            clearInterval(playInterval);
            playInterval = null;
            playBtn.innerText = 'Play Replay';
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
                    playBtn.innerText = 'Play Replay';
                }
            }, 100);
        }
    };
});

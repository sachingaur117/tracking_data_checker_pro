# Compliance Audit Dashboard

A professional, anomaly-centric GPS tracking audit report designed for vendor compliance and dispute resolution.

## Features
- **50m Jitter Sensitivity**: High-precision detection of spikes and stationary drift.
- **RPM Milestone Analytics**: Identifies signal pulse frequency health (1.0 - 20.0 RPM).
- **Speed Anomaly Detection**: Flags unrealistic movements exceeding 120 km/h.
- **Static Map**: Uses CartoDB Positron for clean, reliable trip visualization.

## Deployment on Vercel

This project is a static web application and is ready for Vercel deployment.

### 1. Via GitHub (Best)
1. Push this directory to a GitHub repository.
2. Import the repository into Vercel.
3. No build settings are required; it will use the provided `vercel.json`.

### 2. Via CLI
1. Run `npx vercel` in this directory.
2. Follow the on-screen instructions.

## Local Development
Run a local server:
```bash
python3 -m http.server 8000
```
Open `http://localhost:8000` in your browser.
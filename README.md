# Vivian Vaidhya Fest 2026 - Concert Entry System

A premium, realtime concert ticket scanning and operations dashboard built for live high-throughput event entry. Features a cinematic dark-glassmorphism aesthetic, instant QR verification, hardware-accelerated sound synthesis for access control, and live multi-device syncing.

## 🌟 Key Features

* **Realtime Sync Engine:** Instant database synchronization using Supabase Realtime across all connected scanner units and the main display.
* **Luxury UI/UX:** Coachella-inspired dark concert theme featuring CSS grid layouts, dynamic accent coloring (Purple, Pink, Cyan, Gold), glassmorphism cards, and Framer Motion micro-animations.
* **Live Camera Scanning:** Integrated hardware camera streams (using `html5-qrcode`) with real-time decoding, zoom adjustments, and hardware torch/flashlight toggles.
* **Instant Audio Feedback:** Utilizes the Web Audio API for zero-latency, high-fidelity security tones (Ascending Sine for Approved, Double-Buzzer for Duplicate).
* **On-Screen Log Management:** Display-only wipe capabilities, robust stats tracking, and a dynamic stream feed showing exact time entries.

## 💻 Tech Stack

* **Framework:** Next.js 15 (React 19)
* **Styling:** Tailwind CSS + Vanilla CSS variables
* **Animations:** Framer Motion
* **Database / Backend:** Supabase (PostgreSQL)
* **Scanner Core:** `html5-qrcode`

## 🚀 Getting Started

### 1. Install Dependencies
```bash
npm install
```

### 2. Environment Setup
Create a `.env.local` file in the root directory with your Supabase credentials:
```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
```

### 3. Start Development Server
```bash
npm run dev
```
Open `http://localhost:3000` to view the landing page, `http://localhost:3000/scanner` for the entry system, and `http://localhost:3000/display` for the public display screen.

## 📱 Testing Scanner on Mobile (Important!)

Because the `navigator.mediaDevices.getUserMedia` API (Camera) requires a strict secure context (`https://`), accessing the scanner over your local IP on a mobile phone will block the camera. 

**To test the camera on your phone locally:**
1. Keep `npm run dev` running.
2. In a new terminal, run:
   ```bash
   npx localtunnel --port 3000
   ```
3. Open the generated `https://[random].loca.lt/scanner` link on your mobile browser.

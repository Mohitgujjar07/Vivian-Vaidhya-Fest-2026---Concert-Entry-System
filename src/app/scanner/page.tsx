'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Html5Qrcode, Html5QrcodeScannerState } from 'html5-qrcode';
import { supabase, Student, ScanLog } from '@/lib/supabase';
import { 
  Zap, Users, ShieldAlert, Clock as ClockIcon, TrendingUp, Scan, 
  CheckCircle2, RefreshCw, Maximize, Volume2, VolumeX, Trash2, Power,
  Wifi, AlertTriangle, Activity, Settings, Search
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

// Web Audio API Helpers
const safeFormatTime = (dateStr: string | null | undefined, options: Intl.DateTimeFormatOptions) => {
  if (!dateStr) return '--:--';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '--:--';
  return d.toLocaleTimeString('en-US', options);
};

const playSuccessSound = () => {
  if (typeof window === 'undefined') return;
  const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
  if (!AudioContext) return;
  const ctx = new AudioContext();
  const playNote = (freq: number, startTime: number, duration: number) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(startTime);
    gain.gain.setValueAtTime(0.4, startTime);
    gain.gain.linearRampToValueAtTime(0.4, startTime + duration - 0.08);
    gain.gain.linearRampToValueAtTime(0.001, startTime + duration);
    osc.stop(startTime + duration);
  };
  const now = ctx.currentTime;
  playNote(523.25, now, 0.12);
  playNote(659.25, now + 0.12, 0.12);
  playNote(783.99, now + 0.24, 0.12);
};

const playDuplicateSound = () => {
  if (typeof window === 'undefined') return;
  const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
  if (!AudioContext) return;
  const ctx = new AudioContext();
  
  [0, 1, 2].forEach((startTime) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    
    osc.connect(gain);
    gain.connect(ctx.destination);
    
    osc.type = 'sine';
    osc.frequency.setValueAtTime(900, ctx.currentTime + startTime);
    osc.frequency.exponentialRampToValueAtTime(
      400,
      ctx.currentTime + startTime + 0.5
    );
    
    gain.gain.setValueAtTime(0, ctx.currentTime + startTime);
    gain.gain.linearRampToValueAtTime(0.45, ctx.currentTime + startTime + 0.03);
    gain.gain.setValueAtTime(0.45, ctx.currentTime + startTime + 0.35);
    gain.gain.linearRampToValueAtTime(0, ctx.currentTime + startTime + 0.5);
    
    osc.start(ctx.currentTime + startTime);
    osc.stop(ctx.currentTime + startTime + 0.55);
  });
};

const AnimatedCounter = ({ value }: { value: number | string }) => {
  return (
    <motion.span
      key={value}
      initial={{ opacity: 0, y: -5 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
    >
      {value}
    </motion.span>
  );
};

export default function NexusScannerTerminal() {
  const [hasMounted, setHasMounted] = useState(false);
  const [status, setStatus] = useState<'idle' | 'scanning' | 'processing' | 'success' | 'duplicate' | 'error'>('idle');
  const [showOverlay, setShowOverlay] = useState(false);
  const [currentStudent, setCurrentStudent] = useState<Student | null>(null);
  const [recentLogs, setRecentLogs] = useState<ScanLog[]>([]);
  const [stats, setStats] = useState({ total: 0, success: 0, duplicates: 0 });
  const [isMuted, setIsMuted] = useState(false);
  const [isRealtimeConnected, setIsRealtimeConnected] = useState(false);
  const [currentTime, setCurrentTime] = useState<string>('');
  
  const [zoomLevel, setZoomLevel] = useState(1);
  const [torchOn, setTorchOn] = useState(false);
  const [clearedUntil, setClearedUntil] = useState<number | null>(null);
  const [resetConfirmStatus, setResetConfirmStatus] = useState(false);
  const [localStatsOffset, setLocalStatsOffset] = useState<{ total: number, success: number, duplicates: number } | null>(null);
  
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const isProcessing = useRef(false);
  const isInitializing = useRef(false);

  const handleResetStats = () => {
    if (window.confirm('Reset displayed stats to zero? This only resets the display — no Supabase data is changed.')) {
      setLocalStatsOffset({ total: stats.total, success: stats.success, duplicates: stats.duplicates });
      setResetConfirmStatus(true);
      setTimeout(() => setResetConfirmStatus(false), 1500);
    }
  };

  const displayStats = {
    total: localStatsOffset ? Math.max(0, stats.total - localStatsOffset.total) : stats.total,
    success: localStatsOffset ? Math.max(0, stats.success - localStatsOffset.success) : stats.success,
    duplicates: localStatsOffset ? Math.max(0, stats.duplicates - localStatsOffset.duplicates) : stats.duplicates,
  };

  // --- DATA ENGINE ---
  const fetchData = useCallback(async () => {
    const { data: logs } = await supabase.from('scan_logs').select('*, student:students(*)').order('scan_time', { ascending: false }).limit(50);
    if (logs) setRecentLogs(logs as ScanLog[]);

    const { count: sCount } = await supabase.from('students').select('*', { count: 'exact', head: true }).eq('is_used', true);
    const { count: tCount } = await supabase.from('students').select('*', { count: 'exact', head: true });
    const { count: dCount } = await supabase.from('scan_logs').select('*', { count: 'exact', head: true }).eq('status', 'already_used');
    
    setStats({ 
        total: tCount || 0, 
        success: sCount || 0, 
        duplicates: dCount || 0 
    });
  }, []);

  const clearLogs = async () => {
    await supabase.from('scan_logs').delete().neq('id', 0);
    await supabase.from('students').update({ is_used: false, entry_time: null }).neq('receipt_id', '');
    fetchData();
  };

  // --- SCAN HANDLER ---
  const onScanSuccess = useCallback(async (decodedText: string) => {
    if (isProcessing.current) return;
    isProcessing.current = true;
    setStatus('processing');
    setShowOverlay(true);
    setTimeout(() => setShowOverlay(false), 300);

    try {
        const { data: student, error } = await supabase.from('students').select('*').eq('receipt_id', decodedText).single();

        if (error || !student) {
            const now = new Date().toISOString();
            await supabase.from("scan_logs").insert({ receipt_id: decodedText, scan_time: now, status: 'not_found' });
            setStatus('error');
            fetchData();
            setTimeout(() => {
              setStatus('scanning');
              isProcessing.current = false;
            }, 3000);
            return;
        }

        const isDuplicate = student.is_used;
        const now = new Date().toISOString();
        if (!isDuplicate) await supabase.from('students').update({ is_used: true, entry_time: now }).eq('receipt_id', student.receipt_id);
        await supabase.from("scan_logs").insert({ receipt_id: student.receipt_id, scan_time: now, status: isDuplicate ? 'already_used' : 'success' });
        
        setCurrentStudent(student);
        setStatus(isDuplicate ? 'duplicate' : 'success');
        
        if (!isMuted) {
          if (isDuplicate) playDuplicateSound();
          else playSuccessSound();
        }
        
        fetchData();
    } catch (e) {
        console.error(e);
        const now = new Date().toISOString();
        await supabase.from("scan_logs").insert({ receipt_id: decodedText, scan_time: now, status: 'not_found' });
        setStatus('error');
        fetchData();
        setTimeout(() => {
          setStatus('scanning');
          isProcessing.current = false;
        }, 3000);
    }
  }, [fetchData, isMuted]);

  const resetScanner = () => {
    setStatus('scanning');
    isProcessing.current = false;
    setCurrentStudent(null);
  };

  // --- CAMERA BUTTON HANDLERS ---
  const restartCamera = () => {
    const videoEl = document.querySelector('video') as HTMLVideoElement;
    const stream = (window as any).localStream || videoEl?.srcObject as MediaStream;
    if (stream) {
        stream.getTracks().forEach((t: MediaStreamTrack) => t.stop());
    }
    navigator.mediaDevices.getUserMedia({video:{facingMode:'environment'}}).then(s => { 
        if(videoEl) videoEl.srcObject = s; 
    });
  };

  const toggleZoom = () => {
      const nextZoom = zoomLevel === 1 ? 1.5 : zoomLevel === 1.5 ? 2 : 1;
      setZoomLevel(nextZoom);
      const videoEl = document.querySelector('video') as HTMLVideoElement;
      if(videoEl) videoEl.style.transform = `scale(${nextZoom})`;
  };

  const toggleTorch = () => {
      const videoEl = document.querySelector('video') as HTMLVideoElement;
      const stream = videoEl?.srcObject as MediaStream;
      if (stream && stream.getVideoTracks().length > 0) {
          const track = stream.getVideoTracks()[0];
          const newTorch = !torchOn;
          try {
              track.applyConstraints({advanced: [{torch: newTorch} as any]}).then(() => setTorchOn(newTorch)).catch(() => {
                  const el = document.createElement('div');
                  el.className = 'fixed top-4 left-1/2 -translate-x-1/2 bg-white/10 text-white px-4 py-2 rounded-full backdrop-blur-md z-50';
                  el.innerText = 'Torch not supported';
                  document.body.appendChild(el);
                  setTimeout(() => el.remove(), 2000);
              });
          } catch(e) {
              // ignore
          }
      }
  };

  // --- LIFECYCLE ---
  useEffect(() => {
    setHasMounted(true);
    const timer = setInterval(() => {
        const now = new Date();
        setCurrentTime(now.toLocaleTimeString('en-US', { hour12: true, hour: '2-digit', minute: '2-digit', second: '2-digit' }));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!hasMounted || isInitializing.current) return;
    isInitializing.current = true;

    const scanner = new Html5Qrcode("reader");
    scannerRef.current = scanner;
    
    scanner.start({ facingMode: "environment" }, { fps: 60, qrbox: { width: 300, height: 300 } }, onScanSuccess, () => {})
      .then(() => { setStatus('scanning'); isInitializing.current = false; })
      .catch(() => { setStatus('idle'); isInitializing.current = false; });

    fetchData();
    const sub = supabase.channel('nexus_sync').on('postgres_changes', { event: '*', table: 'scan_logs', schema: 'public' }, fetchData).subscribe((s) => setIsRealtimeConnected(s === 'SUBSCRIBED'));

    return () => { 
        if (scannerRef.current) {
            const cur = scannerRef.current;
            if (cur.getState() === Html5QrcodeScannerState.SCANNING) cur.stop().catch(() => {});
            scannerRef.current = null;
        }
        supabase.removeChannel(sub);
    };
  }, [hasMounted, onScanSuccess, fetchData]);

  if (!hasMounted) return null;

  return (
    <div className="relative min-h-screen w-full font-outfit text-[#f0e8ff] selection:bg-[#ff0066]/20">
      <div className="bg-mesh-concert" />
      <div className="fixed top-0 left-0 right-0 h-1 animated-gradient-ribbon z-50" />

      <main className="relative z-10 w-full max-w-[1440px] mx-auto pt-6 pb-12 px-4 md:px-5 flex flex-col gap-5">
        
        {/* HEADER CARD */}
        <header className="glass-card animate-fade-in-up-concert w-full p-4 sm:p-5 flex flex-col md:flex-row items-center justify-between gap-4 bg-white/[0.05]" style={{ animationDelay: '0ms' }}>
          <div className="flex items-center gap-4 w-full md:w-auto">
            <div className="w-[44px] h-[44px] rounded-xl flex items-center justify-center shadow-md flex-shrink-0" style={{ background: 'linear-gradient(135deg, #8b00ff, #ff0066)' }}>
              <Zap className="text-white w-6 h-6" />
            </div>
            <div className="flex flex-col">
              <h1 className="font-syne font-bold text-[22px] leading-tight text-[#f0e8ff]">VIVIAN VAIVIDHYA 2026</h1>
              <div className="flex flex-col sm:flex-row sm:items-center gap-2 mt-0.5">
                <span className="text-[13px] text-white/55 font-normal">Raghu Dixit Live Concert</span>
                <span className="hidden sm:block text-white/40">•</span>
                <span className="text-[11px] font-semibold text-[#8b00ff] bg-[#8b00ff]/10 border border-[#8b00ff]/25 px-2 py-0.5 rounded-full uppercase tracking-wider w-fit">
                  ● LIVE ENTRY SCANNER
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-6 w-full md:w-auto justify-between md:justify-end border-t md:border-0 border-white/5 pt-4 md:pt-0">
            {/* EQ Bars */}
            <div className="flex items-end gap-[4px] h-5">
              <div className="eq-bar-concert" /><div className="eq-bar-concert" /><div className="eq-bar-concert" /><div className="eq-bar-concert" /><div className="eq-bar-concert" />
            </div>
            
            <div className="flex flex-col items-end">
              <div className="flex items-center gap-2 mb-1">
                <div className={`w-2 h-2 rounded-full ${isRealtimeConnected ? 'bg-[#00b374] shadow-[0_0_8px_#00b374]' : 'bg-[#e0003c]'}`} />
                <span className={`text-[12px] font-semibold tracking-wider ${isRealtimeConnected ? 'text-[#00b374]' : 'text-[#e0003c]'}`}>
                  {isRealtimeConnected ? 'CONNECTED' : 'DISCONNECTED'}
                </span>
              </div>
              <div className="text-[#8b00ff] font-semibold text-[18px] tracking-wide leading-none mb-1">{currentTime}</div>
              <div className="text-white/55 text-[13px] font-medium">Total Entries: <strong className="text-[#f0e8ff]">{displayStats.success}</strong></div>
            </div>
          </div>
        </header>

        {/* CSS GRID LAYOUT */}
        <div className="flex flex-col md:grid md:grid-cols-[58fr_42fr] gap-5">
          
          {/* LEFT COLUMN */}
          <div className="flex flex-col gap-5">
            
            {/* STATS SECTION */}
            <div className="flex flex-col gap-3">
              <div className="flex justify-end">
                <button 
                  onClick={handleResetStats}
                  className={`border rounded-[20px] px-3.5 py-1 text-[11px] font-outfit cursor-pointer transition-all duration-200 flex items-center gap-1.5 ${
                    resetConfirmStatus 
                      ? 'bg-[rgba(0,179,116,0.15)] border-[rgba(0,179,116,0.4)] text-[#00b374]' 
                      : 'bg-[rgba(255,255,255,0.06)] border-[rgba(255,255,255,0.15)] text-[rgba(255,255,255,0.5)] hover:bg-[rgba(255,255,255,0.1)] hover:border-[rgba(255,255,255,0.25)] hover:text-[rgba(255,255,255,0.8)]'
                  }`}
                >
                  {resetConfirmStatus ? '✓ Reset' : '↺ Reset Stats'}
                </button>
              </div>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <StatCard label="Total Entries" value={displayStats.success} accent="#8b00ff" sub="/ 1008 capacity" icon={<Users size={20}/>} delay="100ms" />
                <StatCard label="Duplicates" value={displayStats.duplicates} accent="#ff0066" sub="access denied" icon={<ShieldAlert size={20}/>} delay="150ms" />
                <StatCard label="Scan Speed" value="0.4s" accent="#00c8e0" sub="avg response" icon={<ClockIcon size={20}/>} delay="200ms" />
                <StatCard label="Success Rate" value={`${displayStats.total ? Math.round((displayStats.success/displayStats.total)*100) : 0}%`} accent="#e6a800" sub="intake flow" icon={<TrendingUp size={20}/>} delay="250ms" />
              </div>
            </div>

            {/* SCANNER CARD */}
            <div className="glass-card flex flex-col overflow-hidden animate-fade-in-up-concert bg-white/[0.06]" style={{ animationDelay: '300ms' }}>
              <div className="p-4 border-b border-white/5 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Scan className="w-5 h-5 text-[#8b00ff]" />
                  <h2 className="font-semibold text-lg text-[#f0e8ff] tracking-wide">SCANNER</h2>
                </div>
                
                <div className={`px-3 py-1 rounded-full flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider ${
                    status === 'idle' ? 'bg-[#00c8e0]/12 text-[#00c8e0] border border-[#00c8e0]/30' : 
                    status === 'scanning' ? 'bg-[#e6a800]/12 text-[#e6a800] border border-[#e6a800]/30' : 
                    status === 'processing' ? 'bg-[#8b00ff]/12 text-[#8b00ff] border border-[#8b00ff]/30' : 
                    'bg-[#00b374]/12 text-[#00b374] border border-[#00b374]/30'
                  }`}>
                  <span className="text-[14px] leading-none mb-0.5">
                    {status === 'idle' ? '●' : status === 'scanning' ? '◉' : status === 'processing' ? '⟳' : '✓'}
                  </span>
                  {status === 'idle' ? 'Ready' : status === 'scanning' ? 'Scanning' : status === 'processing' ? 'Processing' : 'Complete'}
                </div>
              </div>

              <div className="p-4 sm:p-5">
                <div className="relative w-full aspect-square sm:aspect-video lg:aspect-[4/3] bg-[#0d0020] rounded-[16px] overflow-hidden shadow-inner border border-white/5">
                  <div className="absolute inset-0 bg-[radial-gradient(circle,rgba(139,0,255,0.12)_0%,transparent_70%)] pointer-events-none" />
                  <div id="reader" className="w-full h-full object-cover [&>video]:object-cover" />
                  
                  {/* HUD Overlays */}
                  <div className="absolute inset-0 pointer-events-none z-10 flex flex-col">
                    {/* Faint grid */}
                    <div className="absolute inset-0 bg-[linear-gradient(rgba(139,0,255,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(139,0,255,0.05)_1px,transparent_1px)] bg-[size:28px_28px]" />
                    
                    {/* Brackets */}
                    <div className="absolute top-6 left-6 w-[22px] h-[22px] border-t-[2.5px] border-l-[2.5px] border-[#ff0066] corner-bracket-concert rounded-tl-md" />
                    <div className="absolute top-6 right-6 w-[22px] h-[22px] border-t-[2.5px] border-r-[2.5px] border-[#ff0066] corner-bracket-concert rounded-tr-md" />
                    <div className="absolute bottom-6 left-6 w-[22px] h-[22px] border-b-[2.5px] border-l-[2.5px] border-[#ff0066] corner-bracket-concert rounded-bl-md" />
                    <div className="absolute bottom-6 right-6 w-[22px] h-[22px] border-b-[2.5px] border-r-[2.5px] border-[#ff0066] corner-bracket-concert rounded-br-md" />
                    
                    {/* Laser line */}
                    {(status === 'scanning' || status === 'idle') && <div className="scanner-laser-concert" />}

                    {/* Top-left LIVE badge */}
                    <div className="absolute top-4 left-4 bg-white px-2 py-1 rounded-md flex items-center gap-1.5 shadow-sm">
                      <div className="w-1.5 h-1.5 rounded-full bg-[#ff0066] animate-pulse" />
                      <span className="font-bold text-[10px] text-[#ff0066] uppercase tracking-wider">LIVE</span>
                    </div>

                    {/* Bottom center instruction */}
                    <div className="absolute bottom-8 w-full text-center">
                      <span className="font-outfit text-[10px] text-white uppercase tracking-[3px] font-bold" style={{ animation: 'pulse 1.5s infinite', textShadow: '0 0 8px rgba(255,0,102,0.8)' }}>ALIGN QR CODE HERE</span>
                    </div>
                  </div>

                  {/* Processing Overlay */}
                  <AnimatePresence>
                    {showOverlay && (
                      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 z-20 bg-[rgba(13,0,32,0.92)] backdrop-blur-sm flex flex-col items-center justify-center gap-4">
                        <div className="w-10 h-10 border-[3px] border-[#8b00ff]/20 border-t-[#8b00ff] rounded-full animate-spin" />
                        <span className="font-semibold text-[#8b00ff] tracking-[0.1em]">PROCESSING...</span>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {/* Paused Overlay for Success/Duplicate */}
                  {(status === 'success' || status === 'duplicate') && (
                    <div className="absolute inset-0 bg-[#0d0020]/95 backdrop-blur-sm flex flex-col items-center justify-center z-20">
                      <span className="font-bold text-white/55 tracking-widest text-sm uppercase">SCANNER PAUSED</span>
                    </div>
                  )}
                </div>

                {/* Below Camera Row */}
                <div className="flex flex-col items-center mt-4">
                  {/* Action Buttons */}
                  <div className="flex gap-2.5 items-center justify-center mb-4">
                    <button onClick={restartCamera} className="bg-white/[0.08] border border-[#8b00ff]/30 rounded-[20px] px-3.5 py-1.5 flex items-center gap-1.5 hover:bg-white/10 transition-colors">
                      <RefreshCw size={14} className="text-[#8b00ff]" />
                      <span className="font-outfit font-medium text-[12px] text-[#f0e8ff]">Refresh</span>
                    </button>
                    <button onClick={toggleZoom} className="bg-white/[0.08] border border-[#00c8e0]/30 rounded-[20px] px-3.5 py-1.5 flex items-center gap-1.5 hover:bg-white/10 transition-colors">
                      <Search size={14} className="text-[#00c8e0]" />
                      <span className="font-outfit font-medium text-[12px] text-[#f0e8ff]">Zoom</span>
                    </button>
                    <button onClick={toggleTorch} className={`bg-white/[0.08] border border-[#e6a800]/30 rounded-[20px] px-3.5 py-1.5 flex items-center gap-1.5 hover:bg-white/10 transition-colors ${torchOn ? 'shadow-[0_0_10px_rgba(230,168,0,0.5)] bg-white/[0.15]' : ''}`}>
                      <Zap size={14} className={torchOn ? "text-[#e6a800] fill-[#e6a800]" : "text-[#e6a800]"} />
                      <span className="font-outfit font-medium text-[12px] text-[#f0e8ff]">Torch</span>
                    </button>
                  </div>

                  <div className="flex flex-col sm:flex-row justify-between items-center w-full gap-3 border-t border-white/5 pt-3">
                    <div className="flex items-center gap-4">
                      <span className="font-semibold text-[#f0e8ff] text-sm">
                        Status: {status === 'scanning' ? 'Ready' : status === 'processing' ? 'Processing' : status === 'success' ? 'Approved' : status === 'duplicate' ? 'Duplicate' : 'Standby'}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="bg-[#8b00ff]/[0.07] border border-[#8b00ff]/20 px-2 py-1 rounded-md font-semibold text-[11px] text-[#8b00ff]">⚡ 0.4s avg</div>
                      <div className="bg-[#8b00ff]/[0.07] border border-[#8b00ff]/20 px-2 py-1 rounded-md font-semibold text-[11px] text-[#8b00ff]">📋 {displayStats.success} today</div>
                      <div className="bg-[#8b00ff]/[0.07] border border-[#8b00ff]/20 px-2 py-1 rounded-md font-semibold text-[11px] text-[#8b00ff]">⏱ 99% uptime</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* RESULT CARDS */}
            <AnimatePresence mode="wait">
              {/* ENTRY APPROVED */}
              {status === 'success' && currentStudent && (
                <motion.div 
                  key="success"
                  initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95 }} transition={{ duration: 0.5 }}
                  className="glass-card overflow-hidden p-6 relative flex flex-col items-center justify-center text-center"
                  style={{ borderLeft: '3px solid #00b374', backgroundColor: 'rgba(0,179,116,0.08)' }}
                >
                  <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(0,179,116,0.06),transparent_70%)] pointer-events-none" />
                  
                  {/* Confetti */}
                  <div className="absolute inset-0 pointer-events-none">
                    {[...Array(12)].map((_, i) => (
                      <div 
                        key={i} className="confetti-dot-concert" 
                        style={{ 
                          '--tx': `${(Math.random()-0.5)*200}px`, 
                          '--ty': `${(Math.random()-0.5)*200}px`,
                          backgroundColor: ['#8b00ff', '#ff0066', '#e6a800', '#00c8e0', '#00b374'][Math.floor(Math.random()*5)]
                        } as any} 
                      />
                    ))}
                  </div>

                  <div className="relative w-[72px] h-[72px] rounded-full bg-[#00b374]/10 flex items-center justify-center mb-4">
                    <svg className="w-10 h-10 text-[#00b374]" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path className="draw-check-path" d="M20 6L9 17l-5-5" />
                    </svg>
                  </div>

                  <h2 className="font-bold text-[26px] text-[#00b374] tracking-[4px] leading-none mb-2">ENTRY APPROVED</h2>
                  <p className="text-white/55 text-[14px] font-normal mb-5">Welcome to the concert! 🎵</p>
                  
                  <div className="bg-white/[0.08] border border-[#00b374]/50 rounded-[12px] px-6 py-2.5 mb-2">
                    <span className="font-bold text-[20px] text-[#f0e8ff] uppercase">{currentStudent.name}</span>
                  </div>
                  
                  <p className="text-white/55 text-[12px] font-medium mb-6">
                    {currentStudent.department} • {currentStudent.section}
                  </p>

                  <button 
                    onClick={resetScanner}
                    className="w-full p-[14px] rounded-[12px] font-bold text-[15px] text-white transition-all shadow-[0_4px_16px_rgba(0,179,116,0.3)] hover:-translate-y-0.5 active:scale-95"
                    style={{ background: 'linear-gradient(135deg, #00b374, #008f5d)' }}
                  >
                    → NEXT SCAN
                  </button>
                </motion.div>
              )}

              {/* DUPLICATE */}
              {status === 'duplicate' && currentStudent && (
                <motion.div 
                  key="duplicate"
                  initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95 }} transition={{ duration: 0.5 }}
                  className="glass-card overflow-hidden p-6 relative flex flex-col items-center justify-center text-center shake-concert"
                  style={{ borderLeft: '3px solid #ff0066', backgroundColor: 'rgba(255,0,102,0.08)' }}
                >
                  <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(255,0,102,0.06),transparent_70%)] pointer-events-none" />
                  
                  <div className="relative w-[72px] h-[72px] rounded-full bg-[#ff0066]/10 flex items-center justify-center mb-4 text-[#ff0066]">
                    <ShieldAlert size={36} strokeWidth={2.5} />
                  </div>

                  <h2 className="font-bold text-[26px] text-[#ff0066] tracking-[4px] leading-none mb-2">ALREADY USED</h2>
                  <p className="text-[#ff0066]/80 text-[13px] font-medium mb-5">This ticket has already been scanned</p>
                  
                  <div className="bg-white/[0.08] border border-[#ff0066]/50 rounded-[12px] px-6 py-2.5 mb-2">
                    <span className="font-bold text-[20px] text-[#f0e8ff] uppercase">{currentStudent.name}</span>
                  </div>
                  
                  <p className="text-white/55 text-[11px] font-medium mb-1">
                    First entry: {safeFormatTime(currentStudent.entry_time, { hour: '2-digit', minute: '2-digit' })}
                  </p>
                  <p className="text-white/55 text-[12px] font-medium mb-6">
                    {currentStudent.department} • {currentStudent.section}
                  </p>

                  <button 
                    onClick={resetScanner}
                    className="w-full p-[14px] rounded-[12px] font-bold text-[15px] text-white transition-all shadow-[0_4px_16px_rgba(255,0,102,0.3)] hover:-translate-y-0.5 active:scale-95"
                    style={{ background: 'linear-gradient(135deg, #ff0066, #cc0044)' }}
                  >
                    → NEXT SCAN
                  </button>
                </motion.div>
              )}
            </AnimatePresence>

          </div>

          {/* RIGHT COLUMN */}
          <div className="flex flex-col gap-5">
            
            {/* LOG FEED CARD */}
            <div className="glass-card animate-fade-in-up-concert flex flex-col overflow-hidden shadow-sm h-[340px] bg-white/[0.06]" style={{ animationDelay: '400ms' }}>
              <div className="p-4 border-b border-white/5 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Activity className="w-5 h-5 text-[#ff0066]" />
                  <h3 className="font-semibold text-lg text-[#f0e8ff] tracking-wide">INTAKE STREAM</h3>
                </div>
                <div className="flex items-center gap-3">
                  <button 
                    onClick={() => {
                      if (window.confirm('Clear all scan logs? This only clears the display — Supabase data is untouched.')) {
                        setClearedUntil(Date.now());
                      }
                    }}
                    className="bg-[rgba(255,0,102,0.1)] border border-[rgba(255,0,102,0.25)] rounded-[20px] px-3 py-1 text-[11px] font-outfit text-[#ff0066] cursor-pointer transition-all duration-200 hover:bg-[rgba(255,0,102,0.2)] hover:border-[rgba(255,0,102,0.5)]"
                  >
                    🗑 Clear
                  </button>
                  <div className="w-2 h-2 rounded-full bg-[#ff0066] animate-pulse" />
                </div>
              </div>
              
              <div className="flex-1 overflow-y-auto p-0 custom-scrollbar relative">
                {(() => {
                  const visibleLogs = recentLogs.filter(log => !clearedUntil || new Date(log.scan_time).getTime() > clearedUntil);
                  if (visibleLogs.length === 0) {
                    return (
                      <div className="absolute inset-0 flex flex-col items-center justify-center text-white/40 text-[13px] font-medium gap-3">
                        <div className="w-2 h-2 rounded-full bg-[#8b00ff] opacity-80" style={{ animation: 'pulse 1.5s infinite' }} />
                        Logs cleared — waiting for next scan...
                      </div>
                    );
                  }
                  return (
                    <div className="flex flex-col">
                      <AnimatePresence>
                        {visibleLogs.map((log) => (
                          <motion.div 
                            key={log.id} 
                            initial={{ opacity: 0, y: -10 }} 
                            animate={{ opacity: 1, y: 0 }} 
                            exit={{ opacity: 0 }}
                            className="border-b border-[#8b00ff]/[0.07] p-3 px-4 flex items-center gap-3 hover:bg-[#8b00ff]/[0.05] transition-colors"
                          >
                            <span className="font-mono text-[11px] text-[#00c8e0] font-medium w-[60px] flex-shrink-0">
                              {safeFormatTime(log.scan_time, { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                            </span>
                            <span className="font-medium text-[13px] text-[#f0e8ff] flex-1 truncate">
                              {log.student?.name || log.receipt_id || 'Unknown'}
                            </span>
                            <div className="flex-shrink-0">
                              {log.status === 'success' ? (
                                <span className="px-2 py-0.5 rounded-[20px] text-[11px] bg-[rgba(0,179,116,0.1)] border border-[rgba(0,179,116,0.3)] text-[#00b374] whitespace-nowrap">✓ Approved</span>
                              ) : log.status === 'already_used' ? (
                                <span className="px-2 py-0.5 rounded-[20px] text-[11px] bg-[rgba(255,0,102,0.1)] border border-[rgba(255,0,102,0.3)] text-[#ff0066] whitespace-nowrap">✗ Duplicate</span>
                              ) : (
                                <span className="px-2 py-0.5 rounded-[20px] text-[11px] bg-[rgba(230,168,0,0.1)] border border-[rgba(230,168,0,0.3)] text-[#e6a800] whitespace-nowrap">⚠ Not Found</span>
                              )}
                            </div>
                          </motion.div>
                        ))}
                      </AnimatePresence>
                    </div>
                  );
                })()}
              </div>
            </div>

            {/* COMMANDS CARD */}
            <div className="glass-card animate-fade-in-up-concert p-4 sm:p-5 bg-white/[0.06]" style={{ animationDelay: '500ms' }}>
              <div className="flex items-center gap-2 mb-4">
                <Settings className="w-5 h-5 text-white/55" />
                <h3 className="font-semibold text-[13px] text-white/55 tracking-widest uppercase">Terminal Commands</h3>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <CommandButton icon={<RefreshCw size={22}/>} label="Restart" onClick={() => window.location.reload()} accent="#8b00ff" />
                <CommandButton icon={<Maximize size={22}/>} label="Fullscreen" onClick={() => document.documentElement.requestFullscreen()} accent="#00c8e0" />
                <CommandButton 
                  icon={isMuted ? <VolumeX size={22}/> : <Volume2 size={22}/>} 
                  label={isMuted ? "Sound OFF" : "Sound ON"} 
                  onClick={() => setIsMuted(!isMuted)} 
                  accent="#00b374" 
                />
                <CommandButton icon={<RefreshCw size={22}/>} label="Sync" onClick={fetchData} accent="#0088aa" />
                <HoldCommandButton icon={<Trash2 size={22} />} label="Wipe" onConfirm={clearLogs} accent="#e6a800" />
                <HoldCommandButton icon={<Power size={22} />} label="Power" onConfirm={() => window.close()} accent="#ff0066" />
              </div>
            </div>

            {/* SYSTEM STATUS CARD */}
            <div className="glass-card animate-fade-in-up-concert p-4 flex gap-4 mt-auto bg-white/[0.06]" style={{ animationDelay: '600ms' }}>
              <div className="flex-1 bg-white/5 border border-white/10 rounded-[12px] p-2.5 flex items-center justify-center gap-2 shadow-sm">
                <div className="w-2 h-2 rounded-full bg-[#00b374] animate-pulse" />
                <span className="font-bold text-[11px] tracking-widest text-[#f0e8ff] uppercase">SYSTEM READY</span>
              </div>
              <div className="flex-1 bg-white/5 border border-white/10 rounded-[12px] p-2.5 flex items-center justify-center gap-2 shadow-sm">
                <Wifi size={14} className={isRealtimeConnected ? 'text-[#00b374]' : 'text-[#e0003c]'} />
                <span className={`font-bold text-[11px] tracking-widest uppercase ${isRealtimeConnected ? 'text-[#00b374]' : 'text-[#e0003c]'}`}>
                  {isRealtimeConnected ? 'SECURED' : 'DISCONNECTED'}
                </span>
              </div>
            </div>

          </div>
        </div>
      </main>
    </div>
  );
}

// Subcomponents

function StatCard({ label, value, accent, sub, icon, delay }: any) {
  return (
    <div className="glass-card p-4 flex flex-col justify-between animate-fade-in-up-concert relative overflow-hidden group bg-white/[0.04]" style={{ borderLeft: `3px solid ${accent}`, animationDelay: delay }}>
      <div className="absolute inset-0 opacity-[0.05] transition-opacity duration-300 group-hover:opacity-10" style={{ backgroundColor: accent }} />
      <div className="flex items-center gap-2 mb-2 relative z-10">
        <div style={{ color: accent }}>{icon}</div>
      </div>
      <span className="font-semibold text-[11px] uppercase text-white/55 tracking-[1px] mb-1 relative z-10">{label}</span>
      <div className="font-bold text-[32px] leading-none mb-1 relative z-10" style={{ color: accent }}>
        <AnimatedCounter value={value} />
      </div>
      <span className="font-medium text-[11px] text-white/40 relative z-10">{sub}</span>
    </div>
  );
}

function CommandButton({ icon, label, onClick, accent }: any) {
  return (
    <button
      onClick={onClick}
      className="bg-white/[0.06] rounded-[14px] p-[14px_8px] flex flex-col items-center justify-center gap-2 cursor-pointer transition-all duration-200 hover:scale-[1.02] active:scale-[0.96] group"
      style={{ border: `1px solid rgba(255,255,255,0.1)` }}
      onMouseEnter={(e) => {
        e.currentTarget.style.backgroundColor = `${accent}14`;
        e.currentTarget.style.borderColor = `${accent}66`;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.backgroundColor = `rgba(255,255,255,0.06)`;
        e.currentTarget.style.borderColor = `rgba(255,255,255,0.1)`;
      }}
    >
      <div className="transition-transform duration-200 group-active:scale-90" style={{ color: accent }}>{icon}</div>
      <span className="font-medium text-[11px] text-[#f0e8ff]">{label}</span>
    </button>
  );
}

function HoldCommandButton({ icon, label, onConfirm, accent }: any) {
  const [holding, setHolding] = useState(false);
  const [progress, setProgress] = useState(0);
  const timerRef = useRef<any>(null);

  const startHold = () => {
    setHolding(true);
    let p = 0;
    timerRef.current = setInterval(() => {
      p += 5; // 5% every 100ms = 2s total
      setProgress(p);
      if (p >= 100) {
        clearInterval(timerRef.current);
        onConfirm();
        setHolding(false);
        setProgress(0);
      }
    }, 100);
  };

  const endHold = () => {
    setHolding(false);
    setProgress(0);
    clearInterval(timerRef.current);
  };

  const radius = 20;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (progress / 100) * circumference;

  return (
    <button
      onPointerDown={startHold}
      onPointerUp={endHold}
      onPointerLeave={endHold}
      onContextMenu={(e) => e.preventDefault()}
      className="bg-white/[0.06] rounded-[14px] p-[14px_8px] flex flex-col items-center justify-center gap-2 cursor-pointer transition-all duration-200 hover:scale-[1.02] active:scale-[0.96] group relative overflow-hidden"
      style={{ border: `1px solid rgba(255,255,255,0.1)` }}
      onMouseEnter={(e) => {
        e.currentTarget.style.backgroundColor = `${accent}14`;
        e.currentTarget.style.borderColor = `${accent}66`;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.backgroundColor = `rgba(255,255,255,0.06)`;
        e.currentTarget.style.borderColor = `rgba(255,255,255,0.1)`;
      }}
    >
      {holding && (
        <svg className="absolute inset-0 w-full h-full -rotate-90 opacity-30" viewBox="0 0 100 100">
          <circle cx="50" cy="50" r={radius} fill="none" stroke={accent} strokeWidth="50" strokeDasharray={circumference} strokeDashoffset={strokeDashoffset} className="transition-all duration-100 ease-linear" />
        </svg>
      )}
      <div className={`transition-transform duration-200 z-10 ${holding ? 'scale-110' : ''}`} style={{ color: accent }}>{icon}</div>
      <span className="font-medium text-[11px] text-[#f0e8ff] z-10">{holding ? 'HOLD...' : label}</span>
    </button>
  );
}

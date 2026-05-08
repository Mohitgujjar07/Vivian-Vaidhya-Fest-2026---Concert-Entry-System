'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase, Student } from '@/lib/supabase';
import confetti from 'canvas-confetti';
import Image from 'next/image';
import { Settings, ChevronUp, ChevronDown, ChevronLeft, ChevronRight, Copy, Check, Play } from 'lucide-react';

const POSTER_SRC = "/poster.png/3f094aad-d739-4e6d-8515-33edbe8b3d16.png";

export default function DisplayPage() {
  const [currentStudent, setCurrentStudent] = useState<Student | null>(null);
  const [animateKey, setAnimateKey] = useState<number>(0);
  const [status, setStatus] = useState<'connecting' | 'connected' | 'error'>('connecting');
  const [showAdmin, setShowAdmin] = useState(false);
  const [copied, setCopied] = useState(false);
  
  const [config, setConfig] = useState({
    photoTop: 13, photoRight: 3, photoWidth: 26,
    nameBottom: 28, nameRight: 3, nameWidth: 28
  });

  const lastProcessedLogId = useRef<number | null>(null);

  const updateConfig = (key: keyof typeof config, delta: number) => {
    setConfig(prev => ({ ...prev, [key]: Number((prev[key] + delta).toFixed(1)) }));
  };

  // --- CORE WELCOME LOGIC ---
  const handleNewScan = useCallback(async (receiptId: string, logId: number) => {
    if (logId === lastProcessedLogId.current) return;
    lastProcessedLogId.current = logId;

    console.log("Processing Scan:", receiptId);

    const { data: student } = await supabase
      .from("students")
      .select("*")
      .eq('receipt_id', receiptId)
      .single();

    if (student) {
      setCurrentStudent(student);
      setAnimateKey(Date.now());
      confetti({ particleCount: 150, spread: 90, origin: { x: 0.78, y: 0.35 }, colors: ['#D946EF', '#ffffff', '#FBBF24'], scalar: 1.2, zIndex: 1000 });
      new Audio('https://assets.mixkit.co/active_storage/sfx/2013/2013-preview.mp3').play().catch(() => {});
    }
  }, []);

  // --- REALTIME + POLLING HYBRID (Ensures it works even if Realtime is disabled) ---
  useEffect(() => {
    // 1. Initial Fetch
    const fetchLatest = async () => {
        const { data } = await supabase.from('scan_logs').select('*').order('scan_time', { ascending: false }).limit(1).single();
        if (data) handleNewScan(data.receipt_id, data.id);
    };
    fetchLatest();

    // 2. Realtime Subscription
    let channel: ReturnType<typeof supabase.channel> | null = null;
    const subscribeChannel = () => {
      if (channel) {
        supabase.removeChannel(channel);
      }
      channel = supabase.channel("display_hybrid_v1")
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "scan_logs" }, (payload) => {
          console.log("Realtime Event Received");
          handleNewScan(payload.new.receipt_id, payload.new.id);
        })
        .subscribe(async (subStatus) => {
          console.log("Sub Status:", subStatus);
          if (subStatus === 'SUBSCRIBED') {
            setStatus('connected');
            const { data } = await supabase.from('scan_logs').select('*').order('scan_time', { ascending: false }).limit(1).single();
            if (data && data.id !== lastProcessedLogId.current) {
                handleNewScan(data.receipt_id, data.id);
            }
          } else if (subStatus === 'CLOSED' || subStatus === 'CHANNEL_ERROR') {
            setStatus('error');
            setTimeout(subscribeChannel, 2000);
          }
        });
    };
    subscribeChannel();

    // 3. Polling Fallback (Every 2.5 seconds) - The Safety Net
    const pollInterval = setInterval(async () => {
        const { data } = await supabase.from('scan_logs').select('*').order('scan_time', { ascending: false }).limit(1).single();
        if (data && data.id !== lastProcessedLogId.current) {
            console.log("Polling detected new scan");
            handleNewScan(data.receipt_id, data.id);
        }
    }, 2500);

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === 'a') setShowAdmin(prev => !prev);
    };
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      if (channel) supabase.removeChannel(channel);
      clearInterval(pollInterval);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [handleNewScan]);

  const testAnimation = () => {
    setAnimateKey(Date.now());
    confetti({ particleCount: 100, spread: 70, origin: { x: 0.78, y: 0.35 } });
  };

  return (
    <div className="relative h-screen w-screen bg-[#050505] overflow-hidden select-none cursor-none flex items-center justify-center">
      
      {/* BACKGROUND */}
      <div className="absolute inset-0 z-0">
        <Image src={POSTER_SRC} alt="" fill className="object-cover blur-[120px] opacity-20 scale-110" priority />
      </div>

      {/* POSTER & OVERLAYS */}
      <div className="relative h-full flex items-center justify-center">
        <div className="relative h-full flex flex-col justify-center">
            <img src={POSTER_SRC} alt="Poster" className="h-full w-auto object-contain z-10 block" />

            <AnimatePresence mode="popLayout">
                {currentStudent && (
                    <motion.div key={animateKey} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 z-20 pointer-events-none">
                        
                        {/* PHOTO */}
                        <div style={{ top: `${config.photoTop}%`, right: `${config.photoRight}%`, width: `${config.photoWidth}vw`, aspectRatio: '1/1' }} className="absolute flex items-center justify-center">
                            <motion.div initial={{ scale: 0.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="relative w-full h-full">
                                <div className="absolute -inset-8 bg-fuchsia-600/30 blur-[40px] rounded-full animate-pulse" />
                                <div className="relative w-full h-full rounded-full overflow-hidden border-[6px] border-fuchsia-500 shadow-[0_0_80px_rgba(217,70,239,0.8)]">
                                    {currentStudent?.image_url && (
                                        <img src={currentStudent.image_url} alt={currentStudent?.name ?? "Attendee"} className="w-full h-full object-cover" />
                                    )}
                                </div>
                            </motion.div>
                        </div>

                        {/* NAME */}
                        <div style={{ bottom: `${config.nameBottom}%`, right: `${config.nameRight}%`, width: `${config.nameWidth}vw`, height: '8vh' }} className="absolute flex items-center justify-center">
                            <motion.h1 initial={{ y: 30, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="text-white font-black italic tracking-tighter uppercase text-center truncate px-4" style={{ fontSize: 'clamp(14px, 2.5vw, 40px)', textShadow: '0 0 15px rgba(255,255,255,0.6)' }}>
                                {currentStudent.name}
                            </motion.h1>
                        </div>

                        {/* Sweep */}
                        <motion.div initial={{ x: '-100%', opacity: 0 }} animate={{ x: '250%', opacity: [0, 0.4, 0] }} transition={{ duration: 1.2, ease: "easeOut" }} className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent skew-x-12 z-50 pointer-events-none" />
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
      </div>

      {/* ADMIN PANEL */}
      {showAdmin && (
        <div className="fixed top-20 right-8 z-[200] w-72 bg-black/80 backdrop-blur-xl border border-white/10 rounded-3xl p-6 shadow-2xl select-auto cursor-auto">
            <div className="flex items-center justify-between mb-6">
                <h3 className="text-xs font-black uppercase tracking-widest text-white/60">Alignment Tool</h3>
                <div className="flex gap-2">
                    <button onClick={testAnimation} className="p-2 hover:bg-white/5 rounded-lg transition-colors text-fuchsia-500"><Play className="w-4 h-4" /></button>
                    <button onClick={() => { navigator.clipboard.writeText(JSON.stringify(config)); setCopied(true); setTimeout(()=>setCopied(false),2000); }} className="p-2 hover:bg-white/5 rounded-lg transition-colors">
                        {copied ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4 text-white/40" />}
                    </button>
                </div>
            </div>

            <div className="space-y-6">
                <div>
                    <p className="text-[10px] font-bold text-fuchsia-400 uppercase mb-3">Attendee Photo</p>
                    <div className="grid grid-cols-2 gap-2">
                        <ControlGroup label="Top" value={config.photoTop} onUp={() => updateConfig('photoTop', -0.5)} onDown={() => updateConfig('photoTop', 0.5)} />
                        <ControlGroup label="Right" value={config.photoRight} onUp={() => updateConfig('photoRight', 0.5)} onDown={() => updateConfig('photoRight', -0.5)} />
                        <ControlGroup label="Width" value={config.photoWidth} onUp={() => updateConfig('photoWidth', 0.5)} onDown={() => updateConfig('photoWidth', -0.5)} />
                    </div>
                </div>
                <div>
                    <p className="text-[10px] font-bold text-amber-500 uppercase mb-3">Attendee Name</p>
                    <div className="grid grid-cols-2 gap-2">
                        <ControlGroup label="Bottom" value={config.nameBottom} onUp={() => updateConfig('nameBottom', 0.5)} onDown={() => updateConfig('nameBottom', -0.5)} />
                        <ControlGroup label="Right" value={config.nameRight} onUp={() => updateConfig('nameRight', 0.5)} onDown={() => updateConfig('nameRight', -0.5)} />
                        <ControlGroup label="Width" value={config.nameWidth} onUp={() => updateConfig('nameWidth', 0.5)} onDown={() => updateConfig('nameWidth', -0.5)} />
                    </div>
                </div>
            </div>
        </div>
      )}

      {/* Status */}
      <div className="fixed top-4 left-4 z-[100] flex items-center gap-2 bg-black/40 px-3 py-1.5 rounded-full border border-white/5 opacity-40">
        <div className={`w-1.5 h-1.5 rounded-full ${status === 'connected' ? 'bg-fuchsia-500' : 'bg-red-500'} animate-pulse`} />
        <span className="text-[8px] font-black text-white/40 tracking-widest uppercase">Hybrid Sync</span>
      </div>

      <style jsx global>{`
        body { background: #050505; margin: 0; cursor: none; }
      `}</style>
    </div>
  );
}

function ControlGroup({ label, value, onUp, onDown }: any) {
    return (
        <div className="bg-white/5 rounded-xl p-2 border border-white/5 text-center">
            <p className="text-[8px] text-white/30 uppercase font-black mb-1">{label}</p>
            <div className="flex items-center justify-between">
                <button onClick={onDown} className="p-1 hover:text-white"><ChevronDown className="w-3 h-3" /></button>
                <span className="text-[10px] font-mono text-white/80">{value}%</span>
                <button onClick={onUp} className="p-1 hover:text-white"><ChevronUp className="w-3 h-3" /></button>
            </div>
        </div>
    );
}

import Link from 'next/link';

export default function Home() {
  return (
    <main className="min-h-screen bg-concert-dark flex flex-col items-center justify-center p-8 text-center">
      <h1 className="text-5xl font-black text-concert-gold mb-4 text-glow-gold">CONCERT ENTRY SYSTEM</h1>
      <p className="text-gray-400 mb-12 max-w-md">Premium realtime welcome and verification system for college fest concerts.</p>
      
      <div className="flex flex-col sm:flex-row gap-6">
        <Link 
          href="/scanner" 
          className="px-8 py-4 bg-concert-purple text-white font-bold rounded-2xl hover:scale-105 transition-transform shadow-[0_0_20px_rgba(139,92,246,0.4)]"
        >
          OPEN GATE SCANNER
        </Link>
        <Link 
          href="/display" 
          className="px-8 py-4 bg-white/10 text-white font-bold rounded-2xl border border-white/20 hover:bg-white/20 transition-all"
        >
          OPEN WELCOME DISPLAY
        </Link>
      </div>
    </main>
  );
}

import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Zap, Copy, Check, Terminal, Cpu, ShieldAlert, Settings, X, Key } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { transmuteVibeToSpec, fetchAvailableModels } from './lib/gemini';

const App = () => {
  const [vibe, setVibe] = useState('');
  const [spec, setSpec] = useState('');
  const [status, setStatus] = useState('idle'); // idle, processing, success, error
  const [activeModel, setActiveModel] = useState('OFFLINE');
  const [copied, setCopied] = useState(false);
  const [apiKey, setApiKey] = useState(localStorage.getItem('gemini_api_key') || '');
  const [isSettingsOpen, setIsSettingsOpen] = useState(!localStorage.getItem('gemini_api_key'));
  const [tempKey, setTempKey] = useState('');
  const textareaRef = useRef(null);

  // Auto-expanding textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  }, [vibe]);

  // Initial Neural Sync
  useEffect(() => {
    if (apiKey) {
      syncNeuralLink(apiKey);
    }
  }, [apiKey]);

  const syncNeuralLink = async (key) => {
    setActiveModel('SYNCING...');
    try {
      const models = await fetchAvailableModels(key);
      if (models && models.length > 0) {
        setActiveModel(models[0].toUpperCase());
      }
    } catch (err) {
      setActiveModel('LINK FAILURE');
    }
  };

  const handleSaveKey = () => {
    if (tempKey.trim()) {
      localStorage.setItem('gemini_api_key', tempKey.trim());
      setApiKey(tempKey.trim());
      setIsSettingsOpen(false);
      setTempKey('');
    }
  };

  const handleTransmute = async () => {
    if (!vibe.trim()) return;
    if (!apiKey) {
      setIsSettingsOpen(true);
      return;
    }

    setStatus('processing');
    try {
      const { content, model } = await transmuteVibeToSpec(vibe, apiKey);
      setSpec(content);
      setActiveModel(model.toUpperCase());
      setStatus('success');
    } catch (error) {
      console.error(error);
      setStatus('error');
      setActiveModel('LINK FAILURE');
    }
  };

  const handleCopy = () => {
    if (!spec) return;
    navigator.clipboard.writeText(spec);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <main className="min-h-screen bg-cyber-black flex flex-col items-center justify-start p-4 md:p-8 font-mono text-gray-300">
      {/* Header */}
      <header className="w-full max-w-4xl mb-12 flex items-center justify-between border-b border-cyber-cyan-dim pb-4">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-cyber-cyan-dim rounded-sm">
            <Cpu className="w-6 h-6 text-cyber-cyan shadow-[0_0_10px_rgba(0,240,255,0.5)]" />
          </div>
          <h1 className="text-xl md:text-2xl font-bold tracking-tighter text-cyber-cyan uppercase">
            Vibe-to-Spec Transmuter
          </h1>
        </div>
        <div className="flex items-center gap-4">
          <div className="hidden md:flex items-center gap-2 text-[10px] text-cyber-cyan-bright opacity-50 border-r border-cyber-cyan-dim pr-4 mr-2">
            <Terminal className="w-3 h-3" />
            <span>NEURAL LINK: {activeModel}</span>
          </div>
          <button
            onClick={() => setIsSettingsOpen(true)}
            className="p-2 hover:bg-cyber-cyan-dim rounded-sm transition-colors text-cyber-cyan"
          >
            <Settings className="w-5 h-5" />
          </button>
        </div>
      </header>

      <section className="w-full max-w-4xl space-y-8">
        {/* Input Area */}
        <div className="relative group">
          <div className="absolute -inset-0.5 bg-cyber-cyan opacity-20 group-focus-within:opacity-40 transition-opacity rounded-sm blur-sm"></div>
          <div className="relative bg-[#0a0a0a] border border-cyber-cyan-dim rounded-sm overflow-hidden">
            <div className="px-4 py-2 border-b border-cyber-cyan-dim flex justify-between items-center text-[10px] uppercase text-cyber-cyan-bright">
              <span>Input_Vibe.stream</span>
              <div className="flex gap-1.5">
                <div className="w-2 h-2 rounded-full bg-red-500/50"></div>
                <div className="w-2 h-2 rounded-full bg-yellow-500/50"></div>
                <div className="w-2 h-2 rounded-full bg-green-500/50"></div>
              </div>
            </div>

            <div className="relative">
              <textarea
                ref={textareaRef}
                value={vibe}
                onChange={(e) => setVibe(e.target.value)}
                placeholder="어떤 멋진 것을 만들고 싶으신가요? 분위기나 아이디어를 자유롭게 입력하세요..."
                className="w-full bg-transparent p-6 outline-none resize-none min-h-[160px] text-cyber-cyan placeholder:text-cyber-cyan/30 text-lg leading-relaxed transition-all duration-300 focus:shadow-[inset_0_0_20px_rgba(0,240,255,0.05)]"
                disabled={status === 'processing' || !apiKey}
              />

              {!apiKey && (
                <div className="absolute inset-0 bg-cyber-black/80 backdrop-blur-sm flex items-center justify-center p-6 text-center">
                  <div className="flex flex-col items-center gap-4 max-w-xs">
                    <ShieldAlert className="w-12 h-12 text-yellow-500 animate-pulse" />
                    <p className="text-cyber-cyan font-bold uppercase tracking-widest text-sm">
                      Neural Link Offline
                    </p>
                    <p className="text-gray-400 text-xs leading-relaxed">
                      시스템을 가동하려면 우측 상단 설정을 통해 API 키를 입력해 주세요.
                    </p>
                  </div>
                </div>
              )}

              {/* Mechanical Scan Overlay */}
              <AnimatePresence>
                {status === 'processing' && (
                  <>
                    <motion.div
                      initial={{ top: 0 }}
                      animate={{ top: '100%' }}
                      transition={{ duration: 1.5, repeat: Infinity, ease: "linear" }}
                      className="scan-line"
                    />
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="absolute inset-0 bg-cyber-cyan/5 backdrop-blur-[1px] pointer-events-none flex items-center justify-center"
                    >
                      <div className="flex flex-col items-center gap-4">
                        <motion.div
                          animate={{ rotate: 360 }}
                          transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                        >
                          <Zap className="w-8 h-8 text-cyber-cyan" />
                        </motion.div>
                        <span className="text-cyber-cyan text-xs tracking-[0.2em] font-bold animate-pulse">
                          PROCESSING VIBE...
                        </span>
                      </div>
                    </motion.div>
                  </>
                )}
              </AnimatePresence>
            </div>
          </div>
        </div>

        {/* Action Button */}
        <div className="flex justify-center md:justify-end">
          <button
            onClick={handleTransmute}
            disabled={status === 'processing' || !vibe.trim() || !apiKey}
            className={`
              relative px-12 py-4 bg-cyber-cyan text-cyber-black font-extrabold uppercase tracking-[0.15em] transition-all duration-200 
              disabled:opacity-30 disabled:cursor-not-allowed glitch-hover
              ${(vibe.trim() && apiKey) ? 'hover:shadow-[0_0_25px_rgba(0,240,255,0.6)] cursor-pointer' : ''}
            `}
          >
            {status === 'processing' ? 'Transmuting...' : 'Transmute Now'}
            <div className="absolute top-0 left-0 w-2 h-2 border-t-2 border-l-2 border-white"></div>
            <div className="absolute bottom-0 right-0 w-2 h-2 border-b-2 border-r-2 border-white"></div>
          </button>
        </div>

        {/* Error State */}
        <AnimatePresence>
          {status === 'error' && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="bg-red-500/10 border border-red-500/50 p-4 text-red-500 flex items-center gap-3 text-sm"
            >
              <ShieldAlert className="w-5 h-5" />
              <div className="flex flex-col">
                <span className="font-bold">연결 실패: 신경망 링크가 불안정합니다.</span>
                <span className="text-[10px] opacity-70 italic">입력된 API 키가 유효하지 않거나 할당량이 초과되었을 수 있습니다. 설정을 확인해 주세요.</span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Result Area */}
        <AnimatePresence>
          {status === 'success' && spec && (
            <motion.div
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              className="relative bg-[#0f0f0f] border border-cyber-cyan-dim rounded-sm"
            >
              <div className="px-4 py-3 border-b border-cyber-cyan-dim flex justify-between items-center">
                <span className="text-[10px] uppercase text-cyber-cyan tracking-widest font-bold">
                  Generated_Spec.md
                </span>
                <button
                  onClick={handleCopy}
                  className="flex items-center gap-2 text-[10px] uppercase text-cyber-cyan-bright hover:text-white transition-colors"
                >
                  {copied ? (
                    <>
                      <Check className="w-3 h-3" />
                      COPIED
                    </>
                  ) : (
                    <>
                      <Copy className="w-3 h-3" />
                      COPY SPEC
                    </>
                  )}
                </button>
              </div>
              <div className="p-6 md:p-8 prose prose-invert prose-cyber max-w-none prose-p:text-gray-400 prose-headings:text-cyber-cyan prose-headings:tracking-tighter prose-code:text-cyber-cyan-bright prose-pre:bg-cyber-black/50 prose-pre:border prose-pre:border-cyber-cyan-dim">
                <ReactMarkdown>{spec}</ReactMarkdown>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </section>

      {/* Settings Modal */}
      <AnimatePresence>
        {isSettingsOpen && (
          <div className="fixed inset-0 z-100 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => apiKey && setIsSettingsOpen(false)}
              className="absolute inset-0 bg-cyber-black/90 backdrop-blur-md"
            />
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="relative w-full max-w-md bg-[#0a0a0a] border border-cyber-cyan rounded-sm p-8 shadow-[0_0_50px_rgba(0,240,255,0.1)]"
            >
              <div className="flex flex-col gap-6">
                <div className="flex items-center justify-between border-b border-cyber-cyan-dim pb-4">
                  <div className="flex items-center gap-2">
                    <Key className="w-5 h-5 text-cyber-cyan" />
                    <h2 className="text-lg font-bold text-cyber-cyan tracking-widest uppercase">Neural Settings</h2>
                  </div>
                  {apiKey && (
                    <button onClick={() => setIsSettingsOpen(false)} className="text-gray-500 hover:text-white transition-colors">
                      <X className="w-5 h-5" />
                    </button>
                  )}
                </div>

                <div className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-[10px] text-cyber-cyan uppercase font-bold tracking-widest opacity-70">
                      Gemini API Key
                    </label>
                    <input
                      type="password"
                      value={tempKey}
                      onChange={(e) => setTempKey(e.target.value)}
                      placeholder={apiKey ? "개인용 API 키가 이미 등록되어 있습니다..." : "발급받은 개인용 API 키를 입력하세요..."}
                      className="w-full bg-cyber-black/50 border border-cyber-cyan-dim p-4 outline-none focus:border-cyber-cyan text-cyber-cyan transition-all font-mono"
                    />
                    <p className="text-[10px] text-gray-500 leading-relaxed italic">
                      * 입력하신 기는 브라우저의 로컬 저장소에만 보관되며 서버로 전송되지 않습니다.
                    </p>
                  </div>

                  <button
                    onClick={handleSaveKey}
                    disabled={!tempKey.trim()}
                    className="w-full py-4 bg-cyber-cyan-dim hover:bg-cyber-cyan text-cyber-cyan hover:text-cyber-black font-bold uppercase tracking-widest transition-all duration-300 border border-cyber-cyan disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    Save & Synchronize
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <footer className="mt-20 w-full max-w-4xl border-t border-cyber-cyan-dim/20 pt-8 flex flex-col md:flex-row justify-between items-center text-[10px] text-cyber-cyan/30 gap-4">
        <p>© 2026 ANTIGRAVITY SYSTEMS. ALL RIGHTS RESERVED.</p>
        <div className="flex gap-6">
          <span>ENCRYPTION: AES-256</span>
          <span>PROTOCOL: GEMINI-CLIENT-DIRECT</span>
        </div>
      </footer>
    </main>
  );
};

export default App;

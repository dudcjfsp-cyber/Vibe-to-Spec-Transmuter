import React, { useEffect, useMemo, useRef, useState } from 'react';
import { motion as Motion, AnimatePresence } from 'framer-motion';
import { Zap, Copy, Check, Terminal, Cpu, ShieldAlert, Settings, X, Key, Brain, BookOpen, Code, User } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { transmuteVibeToSpec, fetchAvailableModels } from './lib/gemini';

const API_KEY_STORAGE_KEY = 'gemini_api_key';
const CLIPBOARD_RESET_MS = 2000;

const TABS = [
  { id: 'nondev', label: '비전공자', icon: User },
  { id: 'dev', label: '개발자', icon: Code },
  { id: 'thinking', label: '사고', icon: Brain },
  { id: 'glossary', label: '용어', icon: BookOpen },
];

function getStoredApiKey() {
  return sessionStorage.getItem(API_KEY_STORAGE_KEY) || localStorage.getItem(API_KEY_STORAGE_KEY) || '';
}

function buildThinkingMarkdown(thinking) {
  if (!thinking) return '';

  const assumptions = (thinking.assumptions || []).map((item) => `- ${item}`).join('\n');
  const uncertainties = (thinking.uncertainties || []).map((item) => `- ${item}`).join('\n');
  const alternatives = (thinking.alternatives || [])
    .map((alt, idx) => {
      const pros = (alt.pros || []).map((item) => `  - 장점: ${item}`).join('\n');
      const cons = (alt.cons || []).map((item) => `  - 단점: ${item}`).join('\n');
      const decision = alt.decision ? `  - 판단: ${alt.decision}` : '';
      const reason = alt.reason ? `  - 이유: ${alt.reason}` : '';
      return `### 대안 ${idx + 1} (${alt.name || 'N/A'})\n${pros}\n${cons}\n${decision}\n${reason}`;
    })
    .join('\n\n');

  return `## 문제 재진술\n${thinking.interpretation || ''}\n\n## 가정\n${assumptions || '- 없음'}\n\n## 불확실 / 질문\n${uncertainties || '- 없음'}\n\n## 대안 비교\n${alternatives || '- 없음'}`;
}

function buildGlossaryMarkdown(glossary) {
  if (!glossary?.length) return '';

  return glossary
    .map((item, idx) => `### ${idx + 1}. ${item.term || '용어'}\n- 쉬운 설명: ${item.simple || ''}\n- 비유: ${item.analogy || ''}\n- 왜 중요한가: ${item.why || ''}`)
    .join('\n\n');
}

const App = () => {
  const [vibe, setVibe] = useState('');
  const [result, setResult] = useState(null);
  const [status, setStatus] = useState('idle'); // idle, processing, success, error
  const [activeModel, setActiveModel] = useState('OFFLINE');
  const [copied, setCopied] = useState(false);
  const [copiedMaster, setCopiedMaster] = useState(false);
  const [activeTab, setActiveTab] = useState('nondev');
  const [showThinking, setShowThinking] = useState(true);

  const [apiKey, setApiKey] = useState(getStoredApiKey);
  const [isSettingsOpen, setIsSettingsOpen] = useState(!getStoredApiKey());
  const [rememberThisDevice, setRememberThisDevice] = useState(Boolean(localStorage.getItem(API_KEY_STORAGE_KEY)));
  const [tempKey, setTempKey] = useState('');
  const textareaRef = useRef(null);

  useEffect(() => {
    if (!textareaRef.current) return;

    textareaRef.current.style.height = 'auto';
    textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
  }, [vibe]);

  useEffect(() => {
    if (!apiKey) return;

    let cancelled = false;

    fetchAvailableModels(apiKey)
      .then((models) => {
        if (!cancelled && models && models.length > 0) {
          setActiveModel(models[0].toUpperCase());
        }
      })
      .catch(() => {
        if (!cancelled) {
          setActiveModel('LINK FAILURE');
        }
      });

    if (!sessionStorage.getItem(API_KEY_STORAGE_KEY)) {
      sessionStorage.setItem(API_KEY_STORAGE_KEY, apiKey);
    }

    return () => {
      cancelled = true;
    };
  }, [apiKey]);

  const handleSaveKey = () => {
    const key = tempKey.trim();
    if (!key) return;

    sessionStorage.setItem(API_KEY_STORAGE_KEY, key);
    if (rememberThisDevice) {
      localStorage.setItem(API_KEY_STORAGE_KEY, key);
    } else {
      localStorage.removeItem(API_KEY_STORAGE_KEY);
    }

    setApiKey(key);
    setIsSettingsOpen(false);
    setTempKey('');
  };

  const handleTransmute = async () => {
    if (!vibe.trim()) return;
    if (!apiKey) {
      setIsSettingsOpen(true);
      return;
    }

    setStatus('processing');
    setResult(null);

    try {
      const generated = await transmuteVibeToSpec(vibe, apiKey, { showThinking });
      setResult(generated);
      setActiveModel((generated.model || activeModel).toUpperCase());
      setActiveTab('nondev');
      setStatus('success');
    } catch {
      console.error('Transmutation failed: Neural link disruption detected.');
      setStatus('error');
      setActiveModel('LINK FAILURE');
    }
  };

  const thinkingMd = useMemo(() => buildThinkingMarkdown(result?.layers?.L1_thinking), [result]);
  const glossaryMd = useMemo(() => buildGlossaryMarkdown(result?.glossary), [result]);

  const currentTabMarkdown = useMemo(() => {
    if (!result) return '';

    if (activeTab === 'nondev') return result.artifacts?.nondev_spec_md || '';
    if (activeTab === 'dev') return result.artifacts?.dev_spec_md || '';
    if (activeTab === 'thinking') return showThinking ? thinkingMd : '학습 모드가 OFF 상태입니다.';
    if (activeTab === 'glossary') return glossaryMd || '용어사전이 비어 있습니다.';
    return '';
  }, [activeTab, glossaryMd, result, showThinking, thinkingMd]);

  const copyToClipboardWithFeedback = (text, setFlag) => {
    if (!text) return;

    navigator.clipboard.writeText(text);
    setFlag(true);
    setTimeout(() => setFlag(false), CLIPBOARD_RESET_MS);
  };

  const handleCopyDevSpec = () => {
    copyToClipboardWithFeedback(result?.artifacts?.dev_spec_md, setCopied);
  };

  const handleCopyMasterPrompt = () => {
    copyToClipboardWithFeedback(result?.artifacts?.master_prompt, setCopiedMaster);
  };

  return (
    <main className="min-h-screen bg-cyber-black flex flex-col items-center justify-start p-4 md:p-8 font-mono text-gray-300">
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
            onClick={() => setShowThinking((v) => !v)}
            className={`px-3 py-2 text-[10px] uppercase border rounded-sm transition-colors ${showThinking
              ? 'border-cyber-cyan text-cyber-cyan hover:bg-cyber-cyan-dim'
              : 'border-gray-600 text-gray-400 hover:text-white'
              }`}
          >
            학습 모드: {showThinking ? 'ON' : 'OFF'}
          </button>
          <button
            onClick={() => setIsSettingsOpen(true)}
            className="p-2 hover:bg-cyber-cyan-dim rounded-sm transition-colors text-cyber-cyan"
          >
            <Settings className="w-5 h-5" />
          </button>
        </div>
      </header>

      <section className="w-full max-w-4xl space-y-8">
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
                placeholder="만들고 싶은 기능/분위기/제약을 자유롭게 입력하세요."
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
                      API 키를 설정하면 변환을 시작할 수 있습니다.
                    </p>
                  </div>
                </div>
              )}

              <AnimatePresence>
                {status === 'processing' && (
                  <>
                    <Motion.div
                      initial={{ top: 0 }}
                      animate={{ top: '100%' }}
                      transition={{ duration: 1.5, repeat: Infinity, ease: 'linear' }}
                      className="scan-line"
                    />
                    <Motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="absolute inset-0 bg-cyber-cyan/5 backdrop-blur-[1px] pointer-events-none flex items-center justify-center"
                    >
                      <div className="flex flex-col items-center gap-4">
                        <Motion.div
                          animate={{ rotate: 360 }}
                          transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
                        >
                          <Zap className="w-8 h-8 text-cyber-cyan" />
                        </Motion.div>
                        <span className="text-cyber-cyan text-xs tracking-[0.2em] font-bold animate-pulse">
                          PROCESSING VIBE...
                        </span>
                      </div>
                    </Motion.div>
                  </>
                )}
              </AnimatePresence>
            </div>
          </div>
        </div>

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

        <AnimatePresence>
          {status === 'error' && (
            <Motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="bg-red-500/10 border border-red-500/50 p-4 text-red-500 flex items-center gap-3 text-sm"
            >
              <ShieldAlert className="w-5 h-5" />
              <div className="flex flex-col">
                <span className="font-bold">생성 실패: 모델 응답 또는 JSON 파싱 오류</span>
                <span className="text-[10px] opacity-70 italic">API 키/쿼터/입력 내용을 확인해주세요.</span>
              </div>
            </Motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {status === 'success' && result && (
            <Motion.div
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              className="relative bg-[#0f0f0f] border border-cyber-cyan-dim rounded-sm"
            >
              <div className="px-4 py-3 border-b border-cyber-cyan-dim flex justify-between items-center gap-4 flex-wrap">
                <div className="flex items-center gap-2">
                  {TABS.map((tab) => {
                    const Icon = tab.icon;
                    const selected = activeTab === tab.id;
                    return (
                      <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id)}
                        className={`flex items-center gap-1.5 px-2 py-1 text-[10px] uppercase border rounded-sm transition-colors ${selected
                          ? 'text-cyber-cyan border-cyber-cyan bg-cyber-cyan-dim/20'
                          : 'text-gray-400 border-gray-700 hover:text-white'
                          }`}
                      >
                        <Icon className="w-3 h-3" />
                        {tab.label}
                      </button>
                    );
                  })}
                </div>

                <div className="flex gap-4">
                  <button
                    onClick={handleCopyMasterPrompt}
                    className="flex items-center gap-2 text-[10px] uppercase text-yellow-500 hover:text-white transition-colors"
                  >
                    {copiedMaster ? (
                      <>
                        <Check className="w-3 h-3" />
                        PROMPT COPIED
                      </>
                    ) : (
                      <>
                        <Zap className="w-3 h-3" />
                        COPY MASTER PROMPT
                      </>
                    )}
                  </button>
                  <button
                    onClick={handleCopyDevSpec}
                    className="flex items-center gap-2 text-[10px] uppercase text-cyber-cyan-bright hover:text-white transition-colors"
                  >
                    {copied ? (
                      <>
                        <Check className="w-3 h-3" />
                        DEV SPEC COPIED
                      </>
                    ) : (
                      <>
                        <Copy className="w-3 h-3" />
                        COPY DEV SPEC
                      </>
                    )}
                  </button>
                </div>
              </div>

              <div className="p-6 md:p-8 prose prose-invert prose-cyber max-w-none prose-p:text-gray-400 prose-headings:text-cyber-cyan prose-headings:tracking-tighter prose-code:text-cyber-cyan-bright prose-pre:bg-cyber-black/50 prose-pre:border prose-pre:border-cyber-cyan-dim">
                <ReactMarkdown>{currentTabMarkdown}</ReactMarkdown>
              </div>
            </Motion.div>
          )}
        </AnimatePresence>
      </section>

      <AnimatePresence>
        {isSettingsOpen && (
          <div className="fixed inset-0 z-100 flex items-center justify-center p-4">
            <Motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => apiKey && setIsSettingsOpen(false)}
              className="absolute inset-0 bg-cyber-black/90 backdrop-blur-md"
            />
            <Motion.div
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
                      placeholder={apiKey ? '기존 키가 저장되어 있습니다...' : '발급받은 API 키를 입력하세요...'}
                      className="w-full bg-cyber-black/50 border border-cyber-cyan-dim p-4 outline-none focus:border-cyber-cyan text-cyber-cyan transition-all font-mono"
                    />
                    <p className="text-[10px] text-gray-500 leading-relaxed italic">
                      * 기본 저장은 세션(sessionStorage)입니다. 탭을 닫으면 키가 사라집니다.
                    </p>
                  </div>

                  <label className="flex items-center gap-2 text-xs text-gray-400">
                    <input
                      type="checkbox"
                      checked={rememberThisDevice}
                      onChange={(e) => {
                        const next = e.target.checked;
                        setRememberThisDevice(next);
                        if (!next) {
                          localStorage.removeItem(API_KEY_STORAGE_KEY);
                        } else if (apiKey) {
                          localStorage.setItem(API_KEY_STORAGE_KEY, apiKey);
                        }
                      }}
                      className="accent-cyan-400"
                    />
                    이 기기에서 기억하기 (localStorage)
                  </label>

                  <button
                    onClick={handleSaveKey}
                    disabled={!tempKey.trim()}
                    className="w-full py-4 bg-cyber-cyan-dim hover:bg-cyber-cyan text-cyber-cyan hover:text-cyber-black font-bold uppercase tracking-widest transition-all duration-300 border border-cyber-cyan disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    Save & Synchronize
                  </button>
                </div>
              </div>
            </Motion.div>
          </div>
        )}
      </AnimatePresence>

      <footer className="mt-20 w-full max-w-4xl border-t border-cyber-cyan-dim/20 pt-8 flex flex-col md:flex-row justify-between items-center text-[10px] text-cyber-cyan/30 gap-4">
        <p>ⓒ 2026 ANTIGRAVITY SYSTEMS. ALL RIGHTS RESERVED.</p>
        <div className="flex gap-6">
          <span>ENCRYPTION: AES-256</span>
          <span>PROTOCOL: GEMINI-CLIENT-DIRECT</span>
        </div>
      </footer>
    </main>
  );
};

export default App;

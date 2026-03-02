import React, { useState, useRef, useEffect, useCallback } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { Upload, Languages, ChevronLeft, ChevronRight, Loader2, X, BookOpen, Shield } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { translateText } from './services/geminiService';
import { statsService } from './services/statsService';
import AdminPanel from './components/AdminPanel';

// Set up PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;

const LANGUAGES = [
  { label: 'চলমান বাংলা ভাষার', value: 'Natural Bangla' },
  { label: 'English', value: 'English' },
  { label: 'Spanish', value: 'Spanish' },
  { label: 'French', value: 'French' },
  { label: 'German', value: 'German' },
  { label: 'Hindi', value: 'Hindi' },
];

export default function App() {
  const [view, setView] = useState<'app' | 'admin'>('app');
  const [isAdminAuthenticated, setIsAdminAuthenticated] = useState(false);
  const [adminPassword, setAdminPassword] = useState('');
  const [showPasswordPrompt, setShowPasswordPrompt] = useState(false);

  const [file, setFile] = useState<File | null>(null);
  const [pdf, setPdf] = useState<pdfjsLib.PDFDocumentProxy | null>(null);
  const [numPages, setNumPages] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [targetLanguage, setTargetLanguage] = useState(LANGUAGES[0].value);
  const [selectedText, setSelectedText] = useState('');
  const [translation, setTranslation] = useState('');
  const [isTranslating, setIsTranslating] = useState(false);
  const [selectionCoords, setSelectionCoords] = useState<{ x: number, y: number } | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    const initApp = async () => {
      const data = await statsService.init();
      if (data?.config?.currentFile) {
        loadPdfFromServer(data.config.currentFile);
      }
    };
    initApp();

    const unsubscribePdf = statsService.onPdfUpdate((fileName) => {
      loadPdfFromServer(fileName);
    });

    return () => {
      unsubscribePdf();
    };
  }, []);

  const loadPdfFromServer = async (fileName: string) => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/current-pdf');
      if (!res.ok) throw new Error("Failed to fetch PDF");
      
      const blob = await res.blob();
      const arrayBuffer = await blob.arrayBuffer();
      const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
      const pdfDoc = await loadingTask.promise;
      
      setFile({ name: fileName } as File);
      setPdf(pdfDoc);
      setNumPages(pdfDoc.numPages);
      setCurrentPage(1);
    } catch (error) {
      console.error('Error loading PDF from server:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const handleAdminAccess = () => {
    if (isAdminAuthenticated) {
      setView('admin');
    } else {
      setShowPasswordPrompt(true);
    }
  };

  const verifyAdminPassword = (e: React.FormEvent) => {
    e.preventDefault();
    if (adminPassword === 'admin123') { // Simple mock password
      setIsAdminAuthenticated(true);
      setShowPasswordPrompt(false);
      setView('admin');
      setAdminPassword('');
    } else {
      alert('Incorrect password');
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const uploadedFile = e.target.files?.[0];
    if (uploadedFile && uploadedFile.type === 'application/pdf') {
      setIsLoading(true);
      setFile(uploadedFile);
      try {
        const arrayBuffer = await uploadedFile.arrayBuffer();
        
        // Save to server for sharing
        await fetch('/api/upload-pdf', {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/pdf',
            'x-file-name': uploadedFile.name
          },
          body: arrayBuffer
        });

        const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
        const pdfDoc = await loadingTask.promise;
        setPdf(pdfDoc);
        setNumPages(pdfDoc.numPages);
        setCurrentPage(1);
        statsService.trackUpload(uploadedFile.name);
      } catch (error) {
        console.error('Error loading PDF:', error);
        alert('Failed to load PDF. Please try another file.');
      } finally {
        setIsLoading(false);
      }
    }
  };

  const renderPage = useCallback(async (pageNum: number) => {
    if (!pdf || !canvasRef.current) return;

    const page = await pdf.getPage(pageNum);
    const viewport = page.getViewport({ scale: 1.5 });
    const canvas = canvasRef.current;
    const context = canvas.getContext('2d');

    if (!context) return;

    canvas.height = viewport.height;
    canvas.width = viewport.width;

    const renderContext: any = {
      canvasContext: context,
      viewport: viewport,
    };

    await page.render(renderContext).promise;

    // Render text layer for selection
    const textContent = await page.getTextContent();
    const textLayerDiv = document.getElementById('text-layer');
    if (textLayerDiv) {
      textLayerDiv.innerHTML = '';
      textLayerDiv.style.height = `${viewport.height}px`;
      textLayerDiv.style.width = `${viewport.width}px`;
      
      const textLayer = new pdfjsLib.TextLayer({
        textContentSource: textContent,
        container: textLayerDiv,
        viewport: viewport,
      });
      await textLayer.render();
    }
  }, [pdf]);

  useEffect(() => {
    if (pdf) {
      renderPage(currentPage);
    }
  }, [pdf, currentPage, renderPage]);

  const handleTextSelection = () => {
    const selection = window.getSelection();
    const text = selection?.toString().trim();

    if (text && text.length > 0) {
      setSelectedText(text);
      
      // Get coordinates for the translation popup
      const range = selection?.getRangeAt(0);
      const rect = range?.getBoundingClientRect();

      if (rect) {
        setSelectionCoords({
          x: rect.left + rect.width / 2,
          y: rect.top
        });
      }
      
      performTranslation(text);
    } else {
      // Don't clear immediately to allow clicking the popup
    }
  };

  const performTranslation = async (text: string) => {
    setIsTranslating(true);
    const result = await translateText(text, targetLanguage);
    setTranslation(result);
    setIsTranslating(false);
    if (result && !result.startsWith("Translation failed") && !result.startsWith("API Key")) {
      statsService.trackTranslation(text, targetLanguage);
    }
  };

  const closeTranslation = () => {
    setTranslation('');
    setSelectedText('');
    setSelectionCoords(null);
  };

  if (view === 'admin') {
    return <AdminPanel onBack={() => setView('app')} />;
  }

  if (!file) {
    return (
      <div className="min-h-screen bg-stone-50 overflow-x-hidden">
        {/* Navigation */}
        <nav className="px-6 py-6 flex justify-between items-center max-w-7xl mx-auto">
          <div className="flex items-center space-x-2">
            <div className="p-2 bg-amber-600 rounded-lg">
              <BookOpen className="w-6 h-6 text-white" />
            </div>
            <span className="font-serif font-bold text-xl tracking-tight">Unika Nobel Translator</span>
          </div>
          <div className="hidden md:flex items-center space-x-8 text-sm font-medium text-stone-500">
            <a href="#features" className="hover:text-stone-900 transition-colors">Features</a>
            <a href="#how-it-works" className="hover:text-stone-900 transition-colors">How it Works</a>
            <button 
              onClick={() => document.getElementById('upload-section')?.scrollIntoView({ behavior: 'smooth' })}
              className="px-4 py-2 bg-stone-900 text-white rounded-full hover:bg-stone-800 transition-all"
            >
              Start Reading
            </button>
          </div>
        </nav>

        {/* Hero Section */}
        <section className="px-6 pt-12 pb-24 max-w-7xl mx-auto grid lg:grid-cols-2 gap-12 items-center">
          <motion.div 
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6 }}
            className="space-y-8"
          >
            <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-amber-100 text-amber-700 text-xs font-bold uppercase tracking-wider">
              <Languages className="w-3 h-3" />
              <span>Natural Bangla Translation</span>
            </div>
            <h1 className="text-6xl md:text-7xl font-serif font-bold text-stone-900 leading-[0.9] tracking-tighter">
              Read any novel in <span className="text-amber-600 italic">your</span> language.
            </h1>
            <p className="text-stone-500 text-xl leading-relaxed max-w-lg">
              Upload your PDF novels and translate them instantly. Experience literature with natural phrasing while keeping character names in their original form.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 pt-4">
              <button 
                onClick={() => document.getElementById('upload-section')?.scrollIntoView({ behavior: 'smooth' })}
                className="px-8 py-4 bg-stone-900 text-white rounded-xl font-bold text-lg hover:shadow-xl hover:-translate-y-1 transition-all"
              >
                Upload Novel
              </button>
              <div className="flex items-center space-x-3 px-6 py-4">
                <div className="flex -space-x-2">
                  {[1, 2, 3].map(i => (
                    <img 
                      key={i}
                      src={`https://picsum.photos/seed/${i + 10}/100/100`} 
                      className="w-10 h-10 rounded-full border-2 border-white object-cover"
                      referrerPolicy="no-referrer"
                    />
                  ))}
                </div>
                <span className="text-stone-400 text-sm font-medium">Joined by 2k+ readers</span>
              </div>
            </div>
          </motion.div>

          <motion.div 
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.8, delay: 0.2 }}
            className="relative"
          >
            <div className="aspect-[4/5] bg-stone-200 rounded-3xl overflow-hidden shadow-2xl relative group">
              <img 
                src="https://picsum.photos/seed/novel/800/1000" 
                className="w-full h-full object-cover opacity-80 grayscale group-hover:grayscale-0 transition-all duration-700"
                referrerPolicy="no-referrer"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-stone-900/80 via-transparent to-transparent" />
              <div className="absolute bottom-8 left-8 right-8 text-white">
                <p className="font-serif italic text-2xl mb-2">"The only thing you absolutely have to know, is the location of the library."</p>
                <p className="text-stone-300 text-sm uppercase tracking-widest">— Albert Einstein</p>
              </div>
            </div>
            {/* Floating UI Elements */}
            <motion.div 
              animate={{ y: [0, -10, 0] }}
              transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
              className="absolute -top-6 -right-6 bg-white p-4 rounded-2xl shadow-xl border border-stone-100 hidden md:block"
            >
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center">
                  <Languages className="w-5 h-5 text-green-600" />
                </div>
                <div>
                  <p className="text-[10px] font-bold text-stone-400 uppercase">Translation Mode</p>
                  <p className="text-sm font-bold text-stone-800">Natural Bangla</p>
                </div>
              </div>
            </motion.div>
          </motion.div>
        </section>

        {/* Features Section */}
        <section id="features" className="bg-white py-24 px-6">
          <div className="max-w-7xl mx-auto space-y-16">
            <div className="text-center space-y-4">
              <h2 className="text-4xl font-serif font-bold text-stone-900">Crafted for Readers</h2>
              <p className="text-stone-500 max-w-2xl mx-auto">We've focused on the details that matter when reading long-form literature.</p>
            </div>

            <div className="grid md:grid-cols-3 gap-8">
              {[
                {
                  icon: <Languages className="w-6 h-6" />,
                  title: "Natural Phrasing",
                  desc: "We don't just translate words; we translate meaning. Optimized for 'চলমান বাংলা ভাষার' (Natural Bangla)."
                },
                {
                  icon: <X className="w-6 h-6" />,
                  title: "Name Preservation",
                  desc: "Character and place names stay in English, maintaining the original context of the novel."
                },
                {
                  icon: <Upload className="w-6 h-6" />,
                  title: "PDF Support",
                  desc: "Upload any PDF novel. Our engine handles large files with ease and maintains layout."
                }
              ].map((feature, i) => (
                <div key={i} className="p-8 rounded-3xl bg-stone-50 border border-stone-100 hover:shadow-lg transition-all group">
                  <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center shadow-sm mb-6 group-hover:bg-amber-600 group-hover:text-white transition-colors">
                    {feature.icon}
                  </div>
                  <h3 className="text-xl font-bold text-stone-900 mb-3">{feature.title}</h3>
                  <p className="text-stone-500 leading-relaxed">{feature.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Upload Section */}
        <section id="upload-section" className="py-24 px-6 bg-stone-50">
          <div className="max-w-3xl mx-auto text-center space-y-12">
            <div className="space-y-4">
              <h2 className="text-4xl font-serif font-bold text-stone-900">Ready to start?</h2>
              <p className="text-stone-500">Drop your PDF below and begin your journey.</p>
            </div>

            <div className="relative group">
              <input
                type="file"
                accept=".pdf"
                onChange={handleFileUpload}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
              />
              <div className="border-2 border-dashed border-stone-300 rounded-3xl p-16 transition-all group-hover:border-amber-500 group-hover:bg-amber-50/50 bg-white shadow-sm">
                {isLoading ? (
                  <div className="flex flex-col items-center space-y-4">
                    <Loader2 className="w-12 h-12 text-amber-600 animate-spin" />
                    <p className="text-stone-600 font-bold text-lg">Preparing your novel...</p>
                  </div>
                ) : (
                  <div className="flex flex-col items-center space-y-6">
                    <div className="p-5 bg-stone-100 rounded-2xl group-hover:bg-amber-100 transition-colors">
                      <Upload className="w-10 h-10 text-stone-600 group-hover:text-amber-600" />
                    </div>
                    <div className="space-y-2">
                      <p className="text-stone-900 font-bold text-2xl tracking-tight">Click or drag PDF here</p>
                      <p className="text-stone-400 font-medium">Maximum file size: 50MB</p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>

        {/* Footer */}
        <footer className="bg-stone-900 text-stone-400 py-12 px-6">
          <div className="max-w-7xl mx-auto flex flex-col md:row justify-between items-center gap-8">
            <div className="flex items-center space-x-2 text-white">
              <BookOpen className="w-6 h-6" />
              <span className="font-serif font-bold text-xl">Unika Nobel Translator</span>
            </div>
            <div className="flex space-x-8 text-sm">
              <a href="#" className="hover:text-white transition-colors">Privacy</a>
              <a href="#" className="hover:text-white transition-colors">Terms</a>
              <button 
                onClick={handleAdminAccess}
                className="flex items-center space-x-1 hover:text-amber-500 transition-colors"
              >
                <Shield className="w-3 h-3" />
                <span>Admin</span>
              </button>
            </div>
            <p className="text-xs uppercase tracking-widest">© 2026 Crafted for Readers</p>
          </div>
        </footer>

        {/* Password Prompt Modal */}
        <AnimatePresence>
          {showPasswordPrompt && (
            <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setShowPasswordPrompt(false)}
                className="absolute inset-0 bg-stone-900/60 backdrop-blur-sm"
              />
              <motion.div 
                initial={{ opacity: 0, scale: 0.9, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9, y: 20 }}
                className="relative bg-white rounded-3xl p-8 shadow-2xl w-full max-w-md border border-stone-100"
              >
                <div className="flex justify-between items-center mb-6">
                  <div className="flex items-center space-x-3">
                    <div className="p-2 bg-amber-100 rounded-lg">
                      <Shield className="w-5 h-5 text-amber-600" />
                    </div>
                    <h3 className="text-xl font-bold text-stone-900">Admin Access</h3>
                  </div>
                  <button onClick={() => setShowPasswordPrompt(false)} className="p-2 hover:bg-stone-100 rounded-full transition-colors">
                    <X className="w-5 h-5 text-stone-400" />
                  </button>
                </div>
                <form onSubmit={verifyAdminPassword} className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-sm font-bold text-stone-500 uppercase tracking-wider">Password</label>
                    <input 
                      type="password" 
                      value={adminPassword}
                      onChange={(e) => setAdminPassword(e.target.value)}
                      placeholder="Enter admin password"
                      className="w-full p-4 bg-stone-50 border border-stone-200 rounded-2xl outline-none focus:ring-2 focus:ring-amber-500 transition-all"
                      autoFocus
                    />
                  </div>
                  <button 
                    type="submit"
                    className="w-full py-4 bg-stone-900 text-white rounded-2xl font-bold hover:bg-stone-800 transition-all shadow-lg shadow-stone-900/20"
                  >
                    Authenticate
                  </button>
                  <p className="text-center text-xs text-stone-400">
                    Hint: Use <code className="bg-stone-100 px-1 rounded">admin123</code> for demo
                  </p>
                </form>
              </motion.div>
            </div>
          )}
        </AnimatePresence>
      </div>
    );
  }


  return (
    <div className="min-h-screen bg-stone-200 flex flex-col">
      {/* Header */}
      <header className="bg-white/80 backdrop-blur-md border-b border-stone-200 sticky top-0 z-50 px-6 py-3 flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <button 
            onClick={() => { setFile(null); setPdf(null); }}
            className="p-2 hover:bg-stone-100 rounded-lg transition-colors text-stone-600"
          >
            <X className="w-5 h-5" />
          </button>
          <div className="h-6 w-px bg-stone-200" />
          <h2 className="font-serif font-bold text-stone-800 truncate max-w-[200px] md:max-w-md">
            {file.name}
          </h2>
        </div>

        <div className="flex items-center space-x-4">
          <div className="flex items-center bg-stone-100 rounded-lg p-1">
            <button 
              disabled={currentPage <= 1}
              onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
              className="p-1.5 hover:bg-white hover:shadow-sm rounded-md disabled:opacity-30 disabled:hover:bg-transparent transition-all"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="px-3 text-sm font-medium text-stone-600">
              {currentPage} / {numPages}
            </span>
            <button 
              disabled={currentPage >= numPages}
              onClick={() => setCurrentPage(prev => Math.min(numPages, prev + 1))}
              className="p-1.5 hover:bg-white hover:shadow-sm rounded-md disabled:opacity-30 disabled:hover:bg-transparent transition-all"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          <select 
            value={targetLanguage}
            onChange={(e) => setTargetLanguage(e.target.value)}
            className="bg-stone-100 border-none rounded-lg px-3 py-2 text-sm font-medium text-stone-700 focus:ring-2 focus:ring-amber-500 outline-none cursor-pointer"
          >
            {LANGUAGES.map(lang => (
              <option key={lang.value} value={lang.value}>{lang.label}</option>
            ))}
          </select>
        </div>
      </header>

      {/* PDF Viewer */}
      <main 
        ref={containerRef}
        className="flex-1 overflow-auto p-8 flex justify-center relative"
        onMouseUp={handleTextSelection}
      >
        <div className="relative shadow-2xl bg-white">
          <canvas ref={canvasRef} className="block" />
          <div 
            id="text-layer" 
            className="text-layer"
          />
        </div>

        {/* Translation Popup */}
        <AnimatePresence>
          {selectionCoords && (selectedText || translation) && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 10 }}
              style={{
                position: 'fixed',
                left: selectionCoords.x,
                top: selectionCoords.y - 10,
                transform: 'translateX(-50%) translateY(-100%)',
                zIndex: 100
              }}
              className="w-80 bg-white rounded-2xl shadow-2xl border border-stone-200 overflow-hidden"
            >
              <div className="p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-stone-400">Translation</span>
                  <button onClick={closeTranslation} className="p-1 hover:bg-stone-100 rounded-full transition-colors">
                    <X className="w-3 h-3 text-stone-400" />
                  </button>
                </div>
                
                <div className="space-y-2">
                  <p className="text-xs text-stone-500 italic line-clamp-2 border-l-2 border-stone-200 pl-2">
                    "{selectedText}"
                  </p>
                  
                  <div className="min-h-[60px] flex items-center justify-center bg-stone-50 rounded-xl p-3">
                    {isTranslating ? (
                      <div className="flex items-center space-x-2 text-amber-600">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span className="text-sm font-medium">Translating...</span>
                      </div>
                    ) : (
                      <p className="text-stone-900 text-sm leading-relaxed font-medium w-full">
                        {translation}
                      </p>
                    )}
                  </div>
                </div>
              </div>
              <div className="bg-amber-50 px-4 py-2 flex items-center justify-between">
                <span className="text-[10px] font-semibold text-amber-700 uppercase tracking-tighter">
                  {LANGUAGES.find(l => l.value === targetLanguage)?.label}
                </span>
                <div className="flex space-x-1">
                  <div className="w-1 h-1 rounded-full bg-amber-300" />
                  <div className="w-1 h-1 rounded-full bg-amber-400" />
                  <div className="w-1 h-1 rounded-full bg-amber-500" />
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Footer / Status */}
      <footer className="bg-white border-t border-stone-200 px-6 py-2 flex items-center justify-between text-[10px] text-stone-400 font-medium uppercase tracking-widest">
        <span>Unika Nobel Translator v1.0</span>
        <div className="flex items-center space-x-4">
          <span>Names stay in English</span>
          <div className="w-1 h-1 rounded-full bg-stone-300" />
          <span>Natural {targetLanguage}</span>
        </div>
      </footer>
    </div>
  );
}

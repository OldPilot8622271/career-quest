'use client';

import { useState } from 'react';
import { motion, Variants, AnimatePresence } from 'framer-motion';
import { FileSearch, UploadCloud, Loader2, Sparkles, HelpCircle, FileText, X, AlertCircle } from 'lucide-react';

interface AnalyzedQuestion {
  questionText: string;
  topic: string;
  difficulty: 'Easy' | 'Medium' | 'Hard';
  hint: string;
}

interface PaperAnalysis {
  paperSummary: string;
  questions: AnalyzedQuestion[];
}

export default function PaperAnalyzerPage() {
  const [previews, setPreviews] = useState<string[]>([]);
  const [base64Images, setBase64Images] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [analysis, setAnalysis] = useState<PaperAnalysis | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // 🔥 THE FIX: Compress high-res images to prevent API Payload crashes
  const compressImage = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = (event) => {
        const img = new Image();
        img.src = event.target?.result as string;
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const MAX_WIDTH = 1200; // Safe resolution for AI OCR
          const scaleSize = MAX_WIDTH / img.width;
          canvas.width = MAX_WIDTH;
          canvas.height = img.height * scaleSize;
          
          const ctx = canvas.getContext('2d');
          ctx?.drawImage(img, 0, 0, canvas.width, canvas.height);
          resolve(canvas.toDataURL('image/jpeg', 0.7)); // Compress to 70% quality
        };
        img.onerror = (error) => reject(error);
      };
    });
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    setErrorMsg(null);
    const newPreviews: string[] = [...previews];
    const newBase64s: string[] = [...base64Images];

    for (const file of files) {
      // 🔥 THE FIX: Catch PDFs and Word docs to explain Vision requirements
      if (file.type.includes('pdf') || file.type.includes('word') || file.name.endsWith('.docx') || file.name.endsWith('.pdf')) {
        setErrorMsg("To process PDFs or Word documents, please take screenshots of the pages and upload them as images. Vision AI natively requires JPG/PNG formats!");
        continue;
      }

      if (file.type.startsWith('image/')) {
        const compressedBase64 = await compressImage(file);
        newPreviews.push(URL.createObjectURL(file));
        newBase64s.push(compressedBase64);
      }
    }

    setPreviews(newPreviews);
    setBase64Images(newBase64s);
  };

  const removeImage = (index: number) => {
    setPreviews(prev => prev.filter((_, i) => i !== index));
    setBase64Images(prev => prev.filter((_, i) => i !== index));
  };

  const clearAll = () => {
    setPreviews([]);
    setBase64Images([]);
    setAnalysis(null);
    setErrorMsg(null);
  };

  const analyzePaper = async () => {
    if (base64Images.length === 0 || loading) return;

    setLoading(true);
    setAnalysis(null);
    setErrorMsg(null);

    try {
      const res = await fetch('/api/analyze-paper', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ images: base64Images }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to analyze paper");
      
      if (data.analysis) {
        setAnalysis(data.analysis);
      } else {
        throw new Error("No analysis returned");
      }
    } catch (err: any) {
      console.error("Failed to analyze paper:", err);
      setErrorMsg(err.message || "Failed to analyze the images. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const containerVariants: Variants = {
    hidden: { opacity: 0 },
    show: { opacity: 1, transition: { staggerChildren: 0.15 } }
  };

  const itemVariants: Variants = {
    hidden: { opacity: 0, y: 20 },
    show: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 120, damping: 15 } }
  };

  return (
    <motion.div className="max-w-6xl mx-auto space-y-8 pb-12 font-sans text-black" variants={containerVariants} initial="hidden" animate="show">
      
      {/* HEADER BANNER */}
      <motion.div variants={itemVariants} className="bg-[#FCA5A5] border-4 border-black p-8 rounded-3xl shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <span className="text-sm font-black uppercase tracking-wider bg-white border-2 border-black px-3 py-1 rounded-full shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] text-black">Vision AI</span>
          <h1 className="text-3xl sm:text-4xl font-black mt-4 text-black flex items-center gap-2">
            Paper Analyzer <FileSearch className="w-8 h-8 text-black" />
          </h1>
          <p className="font-bold text-lg mt-2 text-gray-900">Upload snapshots of your past paper. AI will extract questions, identify topics, and generate hints.</p>
        </div>
      </motion.div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* UPLOAD SECTION (LEFT) */}
        <motion.div variants={itemVariants} className="lg:col-span-1 space-y-6">
          <div className="bg-white border-4 border-black p-6 rounded-3xl shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] space-y-4 flex flex-col">
            
            <div className="flex items-center justify-between">
              <h3 className="font-black text-lg uppercase">Pages ({previews.length})</h3>
              {previews.length > 0 && (
                <button onClick={clearAll} className="text-xs font-black uppercase bg-red-200 border-2 border-black px-2 py-1 rounded hover:bg-red-300 transition-colors">
                  Clear All
                </button>
              )}
            </div>

            {/* MULTI-IMAGE PREVIEW GRID */}
            {previews.length > 0 && (
              <div className="grid grid-cols-2 gap-3 max-h-64 overflow-y-auto pr-1">
                <AnimatePresence>
                  {previews.map((src, idx) => (
                    <motion.div key={idx} initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.8 }} className="relative border-4 border-black rounded-xl overflow-hidden aspect-[3/4]">
                      <img src={src} alt={`Page ${idx + 1}`} className="w-full h-full object-cover" />
                      <button onClick={() => removeImage(idx)} className="absolute top-1 right-1 bg-white border-2 border-black rounded-full p-1 hover:bg-red-200">
                        <X className="w-3 h-3" />
                      </button>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            )}

            <label className="w-full h-24 border-4 border-black border-dashed rounded-2xl flex flex-col items-center justify-center cursor-pointer bg-[#FAF8F5] hover:bg-[#BFDBFE] transition-colors group mt-2">
              <UploadCloud className="w-6 h-6 text-gray-400 group-hover:text-black mb-1" />
              <span className="font-black text-sm uppercase">Add Pages / Docs</span>
              <input type="file" accept="image/*,application/pdf,.doc,.docx" multiple className="hidden" onChange={handleFileUpload} />
            </label>

            {errorMsg && (
              <div className="bg-red-100 border-2 border-red-400 p-3 rounded-xl flex gap-2 text-red-800 text-sm font-bold mt-2">
                <AlertCircle className="w-5 h-5 shrink-0" />
                <p>{errorMsg}</p>
              </div>
            )}

            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={analyzePaper}
              disabled={base64Images.length === 0 || loading}
              className="w-full bg-[#A7F3D0] border-4 border-black py-4 rounded-2xl font-black text-lg flex items-center justify-center gap-2 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] disabled:opacity-50 cursor-pointer transition-all hover:shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] text-black mt-4"
            >
              {loading ? <Loader2 className="w-6 h-6 animate-spin" /> : <Sparkles className="w-6 h-6" />}
              {loading ? 'SCANNING...' : 'ANALYZE'}
            </motion.button>
          </div>
        </motion.div>

        {/* RESULTS SECTION (RIGHT) */}
        <motion.div variants={itemVariants} className="lg:col-span-2 space-y-6">
          {!analysis && !loading && (
             <div className="bg-white border-4 border-black p-12 rounded-3xl text-center space-y-4 shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] h-full flex flex-col items-center justify-center opacity-70">
               <FileText className="w-16 h-16 text-gray-300" />
               <h2 className="text-2xl font-black">Awaiting Document</h2>
               <p className="font-bold text-gray-500 max-w-sm">Upload one or more images of your exam paper on the left to see the AI breakdown here.</p>
             </div>
          )}

          {loading && (
             <div className="bg-[#FAF8F5] border-4 border-black p-12 rounded-3xl text-center space-y-4 shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] h-full flex flex-col items-center justify-center">
               <Loader2 className="w-16 h-16 text-black animate-spin" />
               <h2 className="text-2xl font-black animate-pulse">Vision AI is reading...</h2>
             </div>
          )}

          {analysis && !loading && (
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
              <div className="bg-black text-white border-4 border-black p-4 rounded-2xl shadow-[4px_4px_0px_0px_rgba(0,0,0,0.5)]">
                <span className="text-[10px] font-black uppercase text-gray-400">Document Summary</span>
                <p className="font-bold text-sm mt-1">{analysis.paperSummary}</p>
              </div>

              <div className="space-y-4">
                {analysis.questions.map((q, idx) => (
                  <div key={idx} className="bg-white border-4 border-black p-5 rounded-2xl shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b-2 border-black pb-3 mb-3">
                      <div className="flex items-center gap-2">
                        <span className="bg-[#BFDBFE] border-2 border-black text-xs font-black px-2 py-0.5 rounded shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] text-black">Q{idx + 1}</span>
                        <span className="font-black text-sm uppercase bg-[#FAF8F5] border-2 border-black px-2 py-0.5 rounded text-black">{q.topic}</span>
                      </div>
                      <span className={`text-[10px] font-black uppercase px-2 py-1 border-2 border-black rounded shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] text-black ${
                        q.difficulty === 'Hard' ? 'bg-[#FCA5A5]' : q.difficulty === 'Medium' ? 'bg-[#FDE047]' : 'bg-[#A7F3D0]'
                      }`}>
                        {q.difficulty}
                      </span>
                    </div>
                    
                    <p className="font-bold text-base leading-relaxed text-black mb-4">
                      {q.questionText}
                    </p>

                    <div className="bg-[#FAF8F5] border-2 border-black p-3 rounded-xl flex items-start gap-3">
                      <HelpCircle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
                      <div>
                        <span className="block text-[10px] font-black uppercase text-gray-500 mb-0.5">AI Hint</span>
                        <p className="text-sm font-bold text-gray-800">{q.hint}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          )}
        </motion.div>
      </div>
    </motion.div>
  );
}
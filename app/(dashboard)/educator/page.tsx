'use client';

import { useState, useEffect, useRef } from 'react';
import { auth, db } from '@/lib/firebase';
import { doc, onSnapshot, getDoc } from 'firebase/firestore';
import { Sparkles, Send, Layers, ArrowRight, Camera, X, Image as ImageIcon, Mic, MicOff } from 'lucide-react';
import Link from 'next/link';

// Formatting tools for math and beautiful text
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';

// 🌟 IMPORT FRAMER MOTION
import { motion, AnimatePresence, Variants } from 'framer-motion';

interface SyllabusTopic {
  id: string;
  subject: string;
  chapter: string;
  topic: string;
  exams: string[];
}

interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  image?: string; // Optional base64 image data
}

export default function AIEducatorPage() {
  const [dynamicTopics, setDynamicTopics] = useState<SyllabusTopic[]>([]);
  const [selectedTopic, setSelectedTopic] = useState<string>('');
  
  const [isCustomTopic, setIsCustomTopic] = useState<boolean>(false);
  const [customTopicInput, setCustomTopicInput] = useState<string>('');

  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: 'assistant',
      content: `Hello! I am your dedicated AI Educator.\n\nSelect any topic from your Syllabus Tracker below, type a custom concept, or **upload an image of a question** you are stuck on!`
    }
  ]);
  
  const [inputQuery, setInputQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingTopics, setLoadingTopics] = useState(true);
  
  // Image Upload State
  const [attachedImage, setAttachedImage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 🔥 Voice State & Refs
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef<any>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const user = auth.currentUser;
    if (!user) return;

    const unsub = onSnapshot(doc(db, 'student_syllabus_tracker', user.uid), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        if (data.topics && data.topics.length > 0) {
          setDynamicTopics(data.topics);
          if (!selectedTopic && !isCustomTopic) {
            setSelectedTopic(data.topics[0].topic);
          }
        }
      }
      setLoadingTopics(false);
    });

    return () => unsub();
  }, [selectedTopic, isCustomTopic]);

  // 🔥 Initialize Speech Recognition Safely
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (SpeechRecognition) {
        try {
          const recognition = new SpeechRecognition();
          recognition.continuous = true;
          recognition.interimResults = true;
          recognition.lang = 'en-US';

          recognition.onresult = (event: any) => {
            const transcript = Array.from(event.results)
              .map((result: any) => result[0].transcript)
              .join('');
            setInputQuery(transcript);
          };

          recognition.onerror = (event: any) => {
            console.warn('Speech recognition warning:', event.error);
            if (event.error === 'no-speech') {
               return; // Ignore silence timeouts!
            }
            setIsListening(false);
            if (event.error === 'not-allowed') {
               alert("Microphone access blocked. Please allow mic permissions in your browser.");
            }
          };

          recognition.onend = () => {
            setIsListening(false);
          };

          recognitionRef.current = recognition;
        } catch (e) {
          console.warn("Speech recognition initialization skipped.");
        }
      }
    }
  }, []);

  // 🔥 Toggle Listening Function (With Abort Fix)
  const toggleListening = () => {
    if (!recognitionRef.current) {
      inputRef.current?.focus();
      alert("Voice dictation is unavailable in this browser. Please use Chrome or Edge.");
      return;
    }

    if (isListening) {
      // User clicked mic to STOP talking
      try {
        recognitionRef.current.abort(); // Instantly kill engine to prevent ghost typing
      } catch (err) {}
      setIsListening(false);
    } else {
      // User clicked mic to START talking
      setInputQuery('');
      try {
        recognitionRef.current.start();
        setIsListening(true);
        inputRef.current?.focus();
      } catch (err: any) {
        setIsListening(false);
        inputRef.current?.focus();
      }
    }
  };

  // Handle Image Selection and Base64 Conversion
  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onloadend = () => {
      setAttachedImage(reader.result as string);
    };
    reader.readAsDataURL(file);
    
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removeAttachedImage = () => {
    setAttachedImage(null);
  };

  const formatMath = (text: string) => {
    if (!text) return text;
    return text.replace(/\\\(/g, '$').replace(/\\\)/g, '$').replace(/\\\[/g, () => '$$').replace(/\\\]/g, () => '$$');
  };

  const handleSendMessage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();

    // Turn off mic if they submit while talking
    if (isListening && recognitionRef.current) {
      try { recognitionRef.current.abort(); } catch(err){}
      setIsListening(false);
    }

    if ((!inputQuery.trim() && !attachedImage) || loading) return;

    const user = auth.currentUser;
    if (!user) {
      alert("You must be logged in to chat.");
      return;
    }

    const userMsg = inputQuery.trim() || (attachedImage ? "Please explain the question in this image." : "");
    const imgData = attachedImage;
    
    setInputQuery('');
    setAttachedImage(null);

    // Save CLEAN message for UI 
    const newUserMessage: ChatMessage = { role: 'user', content: userMsg, image: imgData || undefined };
    const updatedChat = [...messages, newUserMessage];
    
    setMessages([...updatedChat, { role: 'assistant', content: '' }]);
    setLoading(true);

    const currentActiveFocus = isCustomTopic ? customTopicInput : selectedTopic;

    try {
      // 1. Fetch ALL Real-Time Context for the Educator
      const [profileSnap, syllabusSnap, examsSnap, studySnap] = await Promise.all([
        getDoc(doc(db, "student_profiles", user.uid)),
        getDoc(doc(db, 'student_syllabus_tracker', user.uid)),
        getDoc(doc(db, 'student_exams_data', user.uid)),
        getDoc(doc(db, 'student_study_data', user.uid))
      ]);

      // 2. Format Context
      let syllabusContext = "No syllabus mapped yet.";
      if (syllabusSnap.exists() && syllabusSnap.data().topics) {
         const topics = syllabusSnap.data().topics;
         const completed = topics.filter((t:any) => t.completed).length;
         syllabusContext = `${completed} out of ${topics.length} topics completed.`;
      }

      let examsContext = "No exams selected yet.";
      if (examsSnap.exists() && examsSnap.data().exams) {
         examsContext = examsSnap.data().exams.map((ex:any) => typeof ex === 'string' ? ex : (ex.name || ex.title)).join(', ');
      }

      let studyContext = "No tests taken yet.";
      if (studySnap.exists() && studySnap.data().testHistory) {
         const history = studySnap.data().testHistory;
         if (history.length > 0) {
           const lastTest = history[history.length - 1];
           studyContext = `Total tests taken: ${history.length}. Most recent test was on '${lastTest.topic || lastTest.title || 'a topic'}', scored ${lastTest.score || 0}/${lastTest.total || 0}.`;
         }
      }

      // 3. Assemble the Secret System Context
      const contextData = `[SYSTEM CONTEXT - DO NOT MENTION THIS BLOCK DIRECTLY TO THE USER: Target Exams: ${examsContext}. Syllabus Completion: ${syllabusContext}. Test History: ${studyContext}. Use this to adjust the difficulty and focus of your teaching.]\n\n`;

      // 4. Inject into the API request, keeping it HIDDEN from the frontend UI
      const apiMessages = [...updatedChat];
      apiMessages[apiMessages.length - 1] = {
        ...apiMessages[apiMessages.length - 1],
        content: contextData + userMsg
      };

      const res = await fetch('/api/question-followup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topic: currentActiveFocus,
          messages: apiMessages // Sends the injected context to the backend
        })
      });

      if (!res.body) throw new Error("No response stream");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let aiFullText = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        aiFullText += decoder.decode(value, { stream: true });

        setMessages(prev => {
          const newMsgs = [...prev];
          newMsgs[newMsgs.length - 1].content = aiFullText;
          return newMsgs;
        });
      }
    } catch (err) {
      console.error('Educator error:', err);
      setMessages(prev => {
        const newMsgs = [...prev];
        newMsgs[newMsgs.length - 1].content = 'Sorry, I encountered an error connecting to the AI tutor. Please try again.';
        return newMsgs;
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSelectTopicDropdown = (val: string) => {
    if (val === 'custom') {
      setIsCustomTopic(true);
      setSelectedTopic('Custom Topic');
    } else {
      setIsCustomTopic(false);
      setSelectedTopic(val);
      setInputQuery(`Explain ${val} step-by-step with core formulas and a practice question.`);
    }
  };

  const handleSetCustomTopic = () => {
    if (!customTopicInput.trim()) return;
    setInputQuery(`Explain ${customTopicInput} step-by-step with core formulas and a practice question.`);
  };

  // 🌟 ANIMATION VARIANTS
  const containerVariants: Variants = {
    hidden: { opacity: 0 },
    show: { opacity: 1, transition: { staggerChildren: 0.15 } }
  };

  const itemVariants: Variants = {
    hidden: { opacity: 0, y: 20 },
    show: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 120, damping: 15 } }
  };

  return (
    <motion.div 
      className="max-w-5xl mx-auto space-y-6 pb-12"
      variants={containerVariants}
      initial="hidden"
      animate="show"
    >
      
      {/* 🌟 ANIMATED Banner */}
      <motion.div variants={itemVariants} className="bg-[#A7F3D0] border-4 border-black p-8 rounded-3xl shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <span className="text-xs font-black uppercase tracking-wider bg-white border-2 border-black px-3 py-1 rounded-full shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]">
            Fully Dynamic Guided Learning
          </span>
          <h1 className="text-3xl sm:text-4xl font-black mt-4">
            AI Educator 🧠✨
          </h1>
          <p className="font-bold text-base mt-2 text-gray-800">
            Topic-by-topic mastery sessions dynamically synced to your active Syllabus Tracker.
          </p>
        </div>

        <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
          <Link
            href="/syllabus"
            className="bg-white border-4 border-black px-5 py-3 rounded-2xl font-black text-sm shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] flex items-center gap-2 shrink-0 cursor-pointer"
          >
            <Layers className="w-4 h-4" /> Go to Syllabus <ArrowRight className="w-4 h-4" />
          </Link>
        </motion.div>
      </motion.div>

      {/* 🌟 ANIMATED Topic Selector */}
      <motion.div variants={itemVariants} className="bg-white border-4 border-black p-4 rounded-2xl shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2 font-black text-xs uppercase shrink-0">
          <Sparkles className="w-4 h-4 text-amber-500 fill-amber-300" /> Lesson Focus:
        </div>
        
        <div className="flex items-center gap-2 flex-1 w-full sm:w-auto">
          <select
            value={isCustomTopic ? 'custom' : selectedTopic}
            onChange={(e) => handleSelectTopicDropdown(e.target.value)}
            className="bg-[#FAF8F5] border-2 border-black rounded-xl px-3 py-2 font-bold text-xs focus:outline-none shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] cursor-pointer max-w-md truncate outline-none"
          >
            {loadingTopics ? (
              <option>Loading your dynamic topics...</option>
            ) : (
              dynamicTopics.map((t) => (
                <option key={t.id} value={t.topic}>
                  {t.subject} &gt; {t.topic}
                </option>
              ))
            )}
            <option value="custom">✨ Enter Custom Topic...</option>
          </select>

          {isCustomTopic && (
            <form onSubmit={(e) => { e.preventDefault(); handleSetCustomTopic(); }} className="flex items-center gap-2 flex-1">
              <input
                type="text"
                value={customTopicInput}
                onChange={(e) => setCustomTopicInput(e.target.value)}
                placeholder="Type any custom concept..."
                className="flex-1 bg-[#FAF8F5] border-2 border-black rounded-xl px-3 py-2 font-bold text-xs focus:outline-none shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]"
              />
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                type="submit"
                disabled={!customTopicInput.trim()}
                className="bg-[#A7F3D0] border-2 border-black px-4 py-2 rounded-xl font-black text-xs shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] cursor-pointer disabled:opacity-50"
              >
                Set
              </motion.button>
            </form>
          )}
        </div>
      </motion.div>

      {/* 🌟 ANIMATED Main Chat Interface */}
      <motion.div variants={itemVariants} className="bg-white border-4 border-black rounded-3xl shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] flex flex-col h-[75vh] overflow-hidden relative">
        
        <div className="bg-[#BFDBFE] border-b-4 border-black p-4 flex items-center justify-between">
          <div className="flex items-center gap-2 min-w-0">
            <Sparkles className="w-5 h-5 fill-black shrink-0" />
            <span className="font-black text-sm shrink-0">Active Lesson:</span>
            <span className="bg-white border-2 border-black px-3 py-1 rounded-xl font-bold text-xs shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] truncate">
              {isCustomTopic ? customTopicInput || 'Custom Topic' : selectedTopic}
            </span>
          </div>
          <span className="text-xs font-black uppercase bg-white border-2 border-black px-2.5 py-1 rounded-full hidden sm:inline-block shrink-0">
            AI Vision Enabled
          </span>
        </div>

        {/* Message History */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 bg-[#FAF8F5]">
          <AnimatePresence initial={false}>
            {messages.map((msg, idx) => (
              <motion.div 
                key={idx} 
                initial={{ opacity: 0, y: 15, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ type: "spring", stiffness: 200, damping: 20 }}
                className={`p-4 rounded-2xl border-2 border-black text-sm ${msg.role === 'user' ? 'bg-[#BFDBFE] ml-auto max-w-[85%]' : 'bg-white mr-auto max-w-[95%]'}`}
              >
                <span className="block text-[10px] font-black uppercase text-gray-500 mb-1.5">
                  {msg.role === 'user' ? 'You:' : 'AI Educator:'}
                </span>
                
                {/* Render Attached Image in History */}
                {msg.image && (
                  <img src={msg.image} alt="User upload" className="max-w-[200px] sm:max-w-xs rounded-lg border-2 border-black mb-3 object-cover shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]" />
                )}

                {/* Render Text with Math/Markdown Formatting */}
                {msg.role === 'user' ? (
                  <p className="whitespace-pre-wrap leading-snug font-bold text-gray-900">{msg.content}</p>
                ) : (
                  <div className="font-medium leading-relaxed text-black prose prose-sm prose-black max-w-none prose-p:leading-snug prose-headings:font-black prose-a:text-blue-600 prose-ul:list-disc prose-ol:list-decimal">
                    <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath] as any} rehypePlugins={[rehypeKatex] as any}>
                      {formatMath(msg.content)}
                    </ReactMarkdown>
                  </div>
                )}
              </motion.div>
            ))}
          </AnimatePresence>

          {loading && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex items-center gap-2 font-bold text-gray-500 pl-4 py-2">
              <span className="w-2 h-2 bg-black rounded-full animate-bounce"></span>
              <span className="w-2 h-2 bg-black rounded-full animate-bounce [animation-delay:0.2s]"></span>
              <span className="w-2 h-2 bg-black rounded-full animate-bounce [animation-delay:0.4s]"></span>
              <span className="ml-1 uppercase text-xs">Analyzing...</span>
            </motion.div>
          )}
        </div>

        {/* Input Bar with Voice & Image Attachments */}
        <div className="p-4 border-t-4 border-black bg-white flex flex-col gap-3">
          
          {/* Image Preview Box */}
          <AnimatePresence>
            {attachedImage && (
              <motion.div 
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                className="relative inline-block w-max"
              >
                <img src={attachedImage} alt="Preview" className="h-20 rounded-lg border-2 border-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]" />
                <button onClick={removeAttachedImage} className="absolute -top-2 -right-2 bg-red-400 border-2 border-black rounded-full p-1 hover:bg-red-500 transition-colors cursor-pointer shadow-[1px_1px_0px_0px_rgba(0,0,0,1)]">
                  <X className="w-3 h-3 text-white font-bold" />
                </button>
              </motion.div>
            )}
          </AnimatePresence>

          <form onSubmit={handleSendMessage} className="flex gap-2 items-center">
            <input 
              type="file" 
              accept="image/*" 
              capture="environment"
              ref={fileInputRef}
              onChange={handleImageUpload}
              className="hidden" 
            />
            
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="bg-[#A7F3D0] border-2 border-black p-3 rounded-xl shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] cursor-pointer flex items-center justify-center text-black shrink-0"
              title="Upload Question Photo"
            >
              <Camera className="w-5 h-5" />
            </motion.button>

            {/* 🔥 NEW: Microphone Toggle Button */}
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              type="button"
              onClick={toggleListening}
              className={`p-3 rounded-xl border-2 border-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] cursor-pointer flex items-center justify-center shrink-0 transition-colors ${
                isListening ? 'bg-red-400 animate-pulse' : 'bg-[#A7F3D0]'
              }`}
              title={isListening ? "Listening... click to stop" : "Click to speak"}
            >
              {isListening ? <MicOff className="w-5 h-5 text-black" /> : <Mic className="w-5 h-5 text-black" />}
            </motion.button>

            <input
              ref={inputRef}
              type="text"
              value={inputQuery}
              onChange={(e) => setInputQuery(e.target.value)}
              placeholder={isListening ? "Listening to your voice..." : "Ask a question or snap a photo..."}
              className={`flex-1 bg-[#FAF8F5] border-2 border-black rounded-xl px-4 py-3 font-bold text-sm focus:outline-none shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] transition-colors ${
                isListening ? 'border-red-400 placeholder:text-red-500' : ''
              }`}
            />
            
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              type="submit"
              disabled={loading || (!inputQuery.trim() && !attachedImage)}
              className="bg-[#FF8A65] border-2 border-black px-6 py-3 rounded-xl font-black text-sm shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] cursor-pointer disabled:opacity-50 flex items-center gap-1.5 shrink-0"
            >
              <Send className="w-4 h-4" /> Send
            </motion.button>
          </form>
        </div>

      </motion.div>
    </motion.div>
  );
}
'use client';

import { useEffect, useRef, useState, Suspense } from "react";
import { auth, db } from "@/lib/firebase";
import { onAuthStateChanged, User } from "firebase/auth";
import { collection, doc, setDoc, getDocs, getDoc, query, deleteDoc } from "firebase/firestore";
import { useRouter, useSearchParams } from "next/navigation";
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Send, Plus, Trash2, Bot, Mic, MicOff, Volume2, VolumeX } from 'lucide-react';

import { motion, AnimatePresence } from 'framer-motion';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
}

interface ChatSession {
  id: string;
  title: string;
  messages: Message[];
  updatedAt?: any;
}

function CounsellorChatContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const autoInsight = searchParams.get('insight');
  const hasTriggeredInsight = useRef(false);

  const [user, setUser] = useState<User | null>(null);
  const [authChecking, setAuthChecking] = useState(true);
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string>('');
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Voice States
  const [isListening, setIsListening] = useState(false);
  const [speakingMessageId, setSpeakingMessageId] = useState<string | null>(null);
  const recognitionRef = useRef<any>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        await fetchUserSessions(currentUser.uid);
      } else {
        setSessions([]);
        setActiveSessionId('');
      }
      setAuthChecking(false);
    });
    return () => unsubscribe();
  }, []);

  // Initialize Speech Recognition Safely
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (SpeechRecognition) {
        try {
          const recognition = new SpeechRecognition();
          recognition.continuous = false;
          recognition.interimResults = true;
          recognition.lang = 'en-US';

          recognition.onresult = (event: any) => {
            const transcript = Array.from(event.results)
              .map((result: any) => result[0].transcript)
              .join('');
            setText(transcript);
          };

          recognition.onerror = (event: any) => {
            console.warn('Speech recognition network/permission warning:', event.error);
            setIsListening(false);
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

    return () => {
      if (typeof window !== 'undefined' && window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  const toggleListening = () => {
    if (!recognitionRef.current) {
      inputRef.current?.focus();
      setError("Voice dictation unavailable in this browser environment. You can type directly below!");
      setTimeout(() => setError(null), 4000);
      return;
    }

    if (isListening) {
      try {
        recognitionRef.current.stop();
      } catch (err) {}
      setIsListening(false);
    } else {
      setText('');
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

  const cleanTextForSpeech = (rawText: string) => {
    return rawText
      .replace(/\[.*?\]\(.*?\)/g, '') 
      .replace(/[*_~`#>]/g, '')        
      .replace(/\$\$[\s\S]*?\$\$/g, ' mathematical equation ')
      .replace(/\$.*?\$/g, ' math formula ')
      .trim();
  };

  const handleSpeak = (msgId: string, content: string) => {
    if (typeof window === 'undefined' || !window.speechSynthesis) return;

    if (speakingMessageId === msgId) {
      window.speechSynthesis.cancel();
      setSpeakingMessageId(null);
      return;
    }

    window.speechSynthesis.cancel();

    const clean = cleanTextForSpeech(content);
    const utterance = new SpeechSynthesisUtterance(clean);
    utterance.rate = 1.0;
    utterance.pitch = 1.0;

    utterance.onend = () => setSpeakingMessageId(null);
    utterance.onerror = () => setSpeakingMessageId(null);

    setSpeakingMessageId(msgId);
    window.speechSynthesis.speak(utterance);
  };

  const fetchUserSessions = async (userId: string) => {
    try {
      const q = query(collection(db, "users", userId, "chats"));
      const querySnapshot = await getDocs(q);
      const loadedSessions: ChatSession[] = [];
      querySnapshot.forEach((docSnap) => {
        loadedSessions.push({ id: docSnap.id, ...docSnap.data() } as ChatSession);
      });

      if (loadedSessions.length > 0) {
        loadedSessions.sort((a, b) => (b.updatedAt?.seconds || 0) - (a.updatedAt?.seconds || 0));
        setSessions(loadedSessions);
        setActiveSessionId(loadedSessions[0].id);
      } else {
        await createNewSession(userId);
      }
    } catch (err: any) {
      console.error("Error fetching chats:", err);
      await createNewSession(userId);
    }
  };

  const createNewSession = async (userId: string) => {
    const newId = Date.now().toString();
    const newSession: ChatSession = {
      id: newId,
      title: 'New Session',
      messages: []
    };

    try {
      await setDoc(doc(db, "users", userId, "chats", newId), {
        title: newSession.title,
        messages: [],
        updatedAt: new Date()
      });
      setSessions(prev => [newSession, ...prev]);
      setActiveSessionId(newId);
    } catch (err: any) {
      console.error("Error creating chat:", err);
    }
  };

  const deleteSession = async (e: React.MouseEvent, sessionId: string) => {
    e.stopPropagation();
    if (!user) return;
    const currentUserId = user.uid;

    try {
      await deleteDoc(doc(db, "users", currentUserId, "chats", sessionId));
      const filtered = sessions.filter(s => s.id !== sessionId);
      setSessions(filtered);

      if (activeSessionId === sessionId) {
        if (filtered.length > 0) {
          setActiveSessionId(filtered[0].id);
        } else {
          await createNewSession(currentUserId);
        }
      }
    } catch (err: any) {
      console.error("Error deleting chat:", err);
    }
  };

  const activeSession = sessions.find(s => s.id === activeSessionId) || sessions[0];
  const messages = activeSession?.messages || [];

  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [messages, loading]);

  const forceSubmit = async (e?: React.FormEvent | null, overrideMessage?: string) => {
    if (e) e.preventDefault();
    
    if (isListening && recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch (err) {}
      setIsListening(false);
    }

    const userMessageText = overrideMessage || text.trim();
    if (!userMessageText || loading) return;
    
    if (!user) {
      setError("You must be logged in to chat.");
      return;
    }
    
    const currentUserId = user.uid;

    let currentSessionId = activeSessionId;
    if (!currentSessionId) {
      const newId = Date.now().toString();
      const newSession: ChatSession = { id: newId, title: userMessageText.slice(0, 25) + '...', messages: [] };
      await setDoc(doc(db, "users", currentUserId, "chats", newId), {
        title: newSession.title,
        messages: [],
        updatedAt: new Date()
      });
      setSessions([newSession]);
      setActiveSessionId(newId);
      currentSessionId = newId;
    }

    setText("");
    setError(null);

    const newUserMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: userMessageText,
    };

    const updatedMessages = [...messages, newUserMessage];
    const currentActiveSession = sessions.find(s => s.id === currentSessionId);
    const newTitle = (currentActiveSession?.messages.length || 0) === 0 ? userMessageText.slice(0, 25) + '...' : (currentActiveSession?.title || 'Session');

    const aiPlaceholder: Message = {
      id: (Date.now() + 1).toString(),
      role: 'assistant',
      content: '',
    };
    
    setSessions(prev => prev.map(session => {
      if (session.id === currentSessionId) {
        return { ...session, title: newTitle, messages: [...updatedMessages, aiPlaceholder] };
      }
      return session;
    }));

    setLoading(true); 

    try {
      const [profileSnap, syllabusSnap, examsSnap, studySnap, opportunitiesSnap] = await Promise.all([
        getDoc(doc(db, "student_profiles", currentUserId)),
        getDoc(doc(db, 'student_syllabus_tracker', currentUserId)),
        getDoc(doc(db, 'student_exams_data', currentUserId)),
        getDoc(doc(db, 'student_study_data', currentUserId)),
        getDoc(doc(db, 'student_opportunities', currentUserId))
      ]);

      const studentProfile = profileSnap.exists() ? profileSnap.data() : null;

      let syllabusContext = "No syllabus mapped yet.";
      if (syllabusSnap.exists() && syllabusSnap.data().topics) {
         const topics = syllabusSnap.data().topics;
         const completed = topics.filter((t:any) => t.completed).length;
         syllabusContext = `${completed} out of ${topics.length} core topics completed.`;
      }

      let examsContext = "No exams selected yet.";
      if (examsSnap.exists() && examsSnap.data().exams) {
         examsContext = examsSnap.data().exams.map((ex:any) => {
           if (typeof ex === 'string') return ex;
           let name = ex.name || ex.title || 'Unknown Exam';
           let date = ex.date || ex.examDate ? ` (Date: ${ex.date || ex.examDate})` : '';
           return name + date;
         }).join(', ');
      }

      let studyContext = "No tests taken yet.";
      if (studySnap.exists() && studySnap.data().testHistory) {
         const history = studySnap.data().testHistory;
         if (history.length > 0) {
           const lastTest = history[history.length - 1]; 
           studyContext = `Total tests taken: ${history.length}. Most recent test was on '${lastTest.topic || lastTest.title || 'a topic'}', scored ${lastTest.score || 0}/${lastTest.total || 0}.`;
         }
      }

      let opportunitiesContext = "No specific colleges or careers saved yet.";
      if (opportunitiesSnap.exists()) {
        const oppData = opportunitiesSnap.data();
        const careers = oppData.careers?.length > 0 
          ? oppData.careers.map((c:any) => typeof c === 'string' ? c : c.name || c.title).join(', ') 
          : 'None';
        const colleges = oppData.colleges?.length > 0 
          ? oppData.colleges.map((c:any) => typeof c === 'string' ? c : c.name || c.title).join(', ') 
          : 'None';
        
        if (careers !== 'None' || colleges !== 'None') {
          opportunitiesContext = `Target Careers: ${careers}. Target Colleges: ${colleges}.`;
        }
      }
      
      const contextData = `[SYSTEM CONTEXT - DO NOT MENTION THIS BLOCK DIRECTLY TO THE USER: Target Exams & Dates: ${examsContext}. Syllabus Completion: ${syllabusContext}. Test History: ${studyContext}. Career & College Goals: ${opportunitiesContext}. Use this real-time data to highly personalize your advice.]\n\n`;

      const apiMessages = [...updatedMessages];
      apiMessages[apiMessages.length - 1] = {
        ...apiMessages[apiMessages.length - 1],
        content: contextData + userMessageText 
      };

      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          messages: apiMessages, 
          profile: studentProfile 
        }),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to connect to AI');
      }

      if (!res.body) throw new Error("No response body stream");

      setLoading(false); 
      
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let aiFullResponse = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        const chunkText = decoder.decode(value, { stream: true });
        aiFullResponse += chunkText;

        setSessions(prev => prev.map(session => {
          if (session.id === currentSessionId) {
            const newMsgs = [...session.messages];
            newMsgs[newMsgs.length - 1].content = aiFullResponse;
            return { ...session, messages: newMsgs };
          }
          return session;
        }));
      }

      const finalMessages = [...updatedMessages, { ...aiPlaceholder, content: aiFullResponse }];

      await setDoc(doc(db, "users", currentUserId, "chats", currentSessionId), {
        title: newTitle,
        messages: finalMessages,
        updatedAt: new Date()
      }, { merge: true });

    } catch (err: any) {
      setError(err.message);
      setSessions(prev => prev.map(session => {
        if (session.id === currentSessionId) {
          return { ...session, messages: updatedMessages };
        }
        return session;
      }));
      setLoading(false);
    }
  };

  // 🔥 THE MAGIC FIX: Moved below forceSubmit so it has access to it safely.
  // Using history.replaceState clears the URL without killing the fetch request!
  useEffect(() => {
    if (!authChecking && user && autoInsight === 'true' && !hasTriggeredInsight.current) {
      hasTriggeredInsight.current = true;
      
      // Clear the URL parameter cleanly
      if (typeof window !== 'undefined') {
        window.history.replaceState(null, '', '/counsellor');
      }
      
      // Auto-trigger the Final Boss strategic prompt!
      const prompt = "Please analyze my progress towards my Final Boss dream college and give me a strategic, actionable study plan based on my actual data.";
      forceSubmit(null, prompt);
    }
  }, [authChecking, user, autoInsight]);

  if (authChecking) {
    return (
      <div className="flex h-[calc(100vh-6rem)] items-center justify-center font-black text-xl bg-white border-4 border-black rounded-3xl shadow-[8px_8px_0px_0px_rgba(0,0,0,1)]">
        <motion.div animate={{ scale: [1, 1.1, 1], rotate: [0, 5, -5, 0] }} transition={{ repeat: Infinity, duration: 1.5 }}>
          AUTHENTICATING SESSION...
        </motion.div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex flex-col h-[calc(100vh-6rem)] items-center justify-center font-black text-xl bg-white border-4 border-black rounded-3xl shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] p-6 text-center space-y-4">
        <p>ACCESS DENIED</p>
        <p className="text-sm font-bold text-gray-600">Please sign in or log back into your account to access the AI Counsellor.</p>
        <button 
          onClick={() => router.push('/')}
          className="bg-[#FF8A65] border-4 border-black px-6 py-3 rounded-xl shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] text-black font-black cursor-pointer hover:translate-x-1 hover:translate-y-1 transition-all"
        >
          GO TO HOME / LOGIN
        </button>
      </div>
    );
  }

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }} 
      animate={{ opacity: 1, y: 0 }} 
      transition={{ duration: 0.4 }}
      className="flex h-[calc(100vh-6rem)] bg-white border-4 border-black rounded-3xl shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] overflow-hidden relative z-10"
    >
      
      {/* 🌟 ANIMATED Sessions Sidebar */}
      <motion.div 
        initial={{ x: -100, opacity: 0 }} 
        animate={{ x: 0, opacity: 1 }} 
        transition={{ type: "spring", stiffness: 100, damping: 20, delay: 0.1 }}
        className="w-72 border-r-4 border-black p-4 flex flex-col bg-[#FAF8F5] hidden sm:flex z-10"
      >
        <motion.button
          whileHover={{ scale: 1.02, translateY: -2 }}
          whileTap={{ scale: 0.98 }}
          onClick={() => user && createNewSession(user.uid)}
          className="w-full flex items-center justify-center gap-2 bg-[#FF8A65] text-black font-black py-3 px-4 rounded-xl border-4 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] transition-all mb-6 cursor-pointer"
        >
          <Plus className="w-5 h-5 font-black" /> NEW ADVENTURE
        </motion.button>

        <div className="text-xs font-black uppercase tracking-widest text-gray-500 mb-3 px-1">
          Saved Sessions
        </div>

        <div className="flex-1 overflow-y-auto space-y-3 pr-2">
          <AnimatePresence>
            {sessions.map((s) => (
              <motion.div
                key={s.id}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, scale: 0.9 }}
                transition={{ duration: 0.2 }}
                onClick={() => setActiveSessionId(s.id)}
                className={`p-3 rounded-xl font-bold text-sm cursor-pointer border-4 border-black transition-all flex items-center justify-between group ${
                  s.id === activeSessionId
                    ? 'bg-[#BFDBFE] shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] translate-x-1'
                    : 'bg-white shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:bg-gray-100'
                }`}
              >
                <span className="truncate flex-1 pr-2">{s.title}</span>
                <button
                  onClick={(e) => deleteSession(e, s.id)}
                  className="opacity-0 group-hover:opacity-100 hover:text-red-600 transition-opacity p-1 bg-white border-2 border-black rounded-md"
                  title="Delete"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      </motion.div>

      {/* Main Conversation Stream */}
      <div className="flex-1 flex flex-col h-full bg-[#FAF8F5] relative overflow-hidden">
        
        {/* 🌟 ANIMATED Header */}
        <motion.div 
          initial={{ y: -50, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ type: "spring", stiffness: 100, damping: 20, delay: 0.2 }}
          className="px-4 sm:px-6 py-4 border-b-4 border-black flex flex-wrap items-center justify-between bg-white shrink-0 gap-2"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full border-4 border-black bg-[#A7F3D0] flex items-center justify-center text-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]">
              <Bot className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-black uppercase">AI Counsellor</h2>
            </div>
          </div>
          <span className="inline-flex items-center gap-2 text-[10px] sm:text-xs font-black text-black bg-[#BFDBFE] border-2 border-black px-3 py-1 rounded-full shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]">
            Voice & Memory Active
          </span>
        </motion.div>

        {error && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} className="bg-red-400 border-b-4 border-black p-3 text-black font-black text-sm text-center">
            Notice: {error}
          </motion.div>
        )}

        {/* Chat Messages */}
        <div ref={listRef} className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
          {messages.length === 0 && !loading && (
            <motion.div 
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: "spring", stiffness: 150, damping: 20, delay: 0.3 }}
              className="flex justify-start w-full"
            >
              <div className="bg-white border-4 border-black rounded-3xl rounded-tl-none p-6 shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] relative max-w-xl">
                  <div className="absolute -left-3 -top-3 bg-[#A7F3D0] border-2 border-black text-xs font-black px-2 py-1 rounded-full transform -rotate-6 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]">AI GUIDE</div>
                  <p className="font-bold text-lg mt-2">Namaste! Your profile, test history, and exam calendar are synced.</p>
                  <p className="font-medium text-base mt-2 text-gray-700">Type your query or click the mic to speak with me!</p>
              </div>
            </motion.div>
          )}

          <AnimatePresence initial={false}>
            {messages.map((m) => (
              <motion.div
                key={m.id}
                initial={{ opacity: 0, y: 20, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ type: "spring", stiffness: 250, damping: 20 }}
                className={`flex w-full ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`border-4 border-black p-4 sm:p-5 max-w-[85%] sm:max-w-2xl break-words shadow-[5px_5px_0px_0px_rgba(0,0,0,1)] relative ${
                    m.role === 'user'
                      ? 'bg-[#BFDBFE] rounded-3xl rounded-tr-none'
                      : 'bg-white rounded-3xl rounded-tl-none'
                  }`}
                >
                   {m.role !== 'user' && (
                     <div className="flex items-center justify-between mb-2">
                       <span className="bg-[#A7F3D0] border-2 border-black text-xs font-black px-2 py-0.5 rounded-full shadow-[1px_1px_0px_0px_rgba(0,0,0,1)]">AI GUIDE</span>
                       {m.content && (
                         <button
                           onClick={() => handleSpeak(m.id, m.content)}
                           className={`p-1.5 rounded-lg border-2 border-black cursor-pointer transition-colors shadow-[1px_1px_0px_0px_rgba(0,0,0,1)] ${
                             speakingMessageId === m.id ? 'bg-red-300 hover:bg-red-400' : 'bg-[#FAF8F5] hover:bg-gray-200'
                           }`}
                           title={speakingMessageId === m.id ? "Stop voice" : "Read aloud"}
                         >
                           {speakingMessageId === m.id ? <VolumeX className="w-4 h-4 text-black" /> : <Volume2 className="w-4 h-4 text-black" />}
                         </button>
                       )}
                     </div>
                   )}
                  {m.role === 'user' ? (
                    <p className="font-bold text-base sm:text-lg whitespace-pre-wrap leading-snug">{m.content}</p>
                  ) : (
                    <div className="font-medium text-sm sm:text-base leading-relaxed text-black prose prose-black max-w-none prose-p:leading-snug prose-headings:font-black prose-a:text-blue-600">
                      <div className="overflow-x-auto max-w-full my-2">
                        <ReactMarkdown remarkPlugins={[remarkGfm] as any}>
                          {m.content}
                        </ReactMarkdown>
                      </div>
                      {m.content.length > 0 && m.content === messages[messages.length - 1].content && loading === false && (
                          <span className="inline-block w-1.5 h-4 ml-1 bg-black animate-pulse opacity-50"></span>
                      )}
                    </div>
                  )}
                </div>
              </motion.div>
            ))}
          </AnimatePresence>

          {loading && (
            <motion.div 
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex justify-start w-full"
            >
                <div className="bg-white border-4 border-black rounded-3xl rounded-tl-none px-5 py-4 shadow-[5px_5px_0px_0px_rgba(0,0,0,1)] font-black flex items-center gap-2">
                    <span className="w-2 h-2 bg-black rounded-full animate-bounce"></span>
                    <span className="w-2 h-2 bg-black rounded-full animate-bounce [animation-delay:0.2s]"></span>
                    <span className="w-2 h-2 bg-black rounded-full animate-bounce [animation-delay:0.4s]"></span>
                    <span className="ml-2 text-sm text-gray-600 uppercase tracking-widest text-[10px]">Thinking...</span>
                </div>
            </motion.div>
          )}
        </div>

        {/* 🌟 ANIMATED Input Bar with Voice & Manual Typing Active */}
        <motion.div 
          initial={{ y: 50, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ type: "spring", stiffness: 100, damping: 20, delay: 0.4 }}
          className="p-3 sm:p-4 border-t-4 border-black bg-white shrink-0"
        >
          <form onSubmit={forceSubmit} className="max-w-4xl mx-auto flex gap-2 sm:gap-3 items-center">
            
            {/* Microphone Toggle Button */}
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.9 }}
              type="button"
              onClick={toggleListening}
              className={`p-3 sm:p-4 rounded-2xl border-4 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] transition-colors cursor-pointer flex items-center justify-center shrink-0 ${
                isListening 
                  ? 'bg-red-400 animate-pulse' 
                  : 'bg-[#A7F3D0]'
              }`}
              title={isListening ? "Listening... click to stop" : "Click to speak"}
            >
              {isListening ? <MicOff className="w-5 h-5 sm:w-6 sm:h-6 text-black" /> : <Mic className="w-5 h-5 sm:w-6 sm:h-6 text-black" />}
            </motion.button>

            {/* Manual Text Box */}
            <input
              ref={inputRef}
              type="text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={isListening ? "Listening to your voice..." : "Type your query or click the mic to speak..."}
              className={`flex-1 bg-[#FAF8F5] border-4 border-black rounded-2xl px-4 py-3 sm:py-4 font-bold text-sm sm:text-base focus:outline-none shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] text-black transition-colors ${
                isListening ? 'border-red-400 placeholder:text-red-500' : ''
              }`}
            />

            {/* Manual Send / Enter Button */}
            <motion.button
              whileHover={{ scale: 1.05, translateY: -2 }}
              whileTap={{ scale: 0.95 }}
              type="submit"
              disabled={loading || (!text.trim() && !loading)} 
              className="bg-[#FF8A65] text-black px-4 sm:px-6 py-3 sm:py-4 rounded-2xl border-4 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] transition-shadow disabled:opacity-50 flex items-center justify-center shrink-0 cursor-pointer"
            >
              <Send className="w-5 h-5 sm:w-6 sm:h-6" />
            </motion.button>
          </form>
        </motion.div>

      </div>
    </motion.div>
  );
}

export default function CounsellorChatPage() {
  return (
    <Suspense fallback={
      <div className="flex h-[calc(100vh-6rem)] items-center justify-center font-black text-xl bg-white border-4 border-black rounded-3xl shadow-[8px_8px_0px_0px_rgba(0,0,0,1)]">
        LOADING COUNSELLOR...
      </div>
    }>
      <CounsellorChatContent />
    </Suspense>
  );
}
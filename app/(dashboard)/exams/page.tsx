'use client';

import { useState, useEffect } from 'react';
import { auth, db } from '@/lib/firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { Target, Calendar, CheckCircle2, Clock, ExternalLink, AlertCircle, Sparkles, Plus, Trash2, Bot, Send, MessageSquare } from 'lucide-react';

// Imports for beautiful AI text formatting
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

// 🌟 IMPORT FRAMER MOTION
import { motion, AnimatePresence, Variants } from 'framer-motion';

interface Exam {
  id: string;
  title: string;
  stream: string;
  examDate: string;
  applicationDeadline: string;
  eligibility: string;
  status: 'Planning' | 'Applied' | 'Registered' | 'Completed';
  officialWebsite: string;
}

interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

interface ExamChatState {
  isOpen: boolean;
  messages: ChatMessage[];
  inputValue: string;
  loading: boolean;
}

const DEFAULT_EXAMS: Exam[] = [
  {
    id: '1',
    title: 'JEE Main (Session 1)',
    stream: 'Science (PCM)',
    examDate: 'January 2027',
    applicationDeadline: 'November 30, 2026',
    eligibility: 'Class 12 Passed/Appearing with Physics, Chemistry, Math',
    status: 'Planning',
    officialWebsite: 'https://jeemain.nta.nic.in'
  },
  {
    id: '2',
    title: 'NEET-UG',
    stream: 'Science (PCB)',
    examDate: 'May 2027',
    applicationDeadline: 'March 15, 2027',
    eligibility: 'Class 12 Passed/Appearing with Physics, Chemistry, Biology',
    status: 'Planning',
    officialWebsite: 'https://neet.nta.nic.in'
  },
  {
    id: '3',
    title: 'CUET UG',
    stream: 'General / Universal',
    examDate: 'May - June 2027',
    applicationDeadline: 'April 05, 2027',
    eligibility: 'Class 12 Passed/Appearing from any recognized board',
    status: 'Planning',
    officialWebsite: 'https://cuet.samarth.ac.in'
  },
  {
    id: '4',
    title: 'SAT (Scholastic Assessment Test)',
    stream: 'Global Admissions',
    examDate: 'March 2027',
    applicationDeadline: 'February 10, 2027',
    eligibility: 'High School Students aiming for global undergraduate programs',
    status: 'Planning',
    officialWebsite: 'https://satsuite.collegeboard.org'
  }
];

export default function ExamsPage() {
  const [exams, setExams] = useState<Exam[]>(DEFAULT_EXAMS);
  const [loading, setLoading] = useState(true);

  const [examQuery, setExamQuery] = useState('');
  const [addingExam, setAddingExam] = useState(false);

  const [examChats, setExamChats] = useState<Record<string, ExamChatState>>({});

  useEffect(() => {
    const fetchExams = async () => {
      const user = auth.currentUser;
      if (!user) return;

      try {
        const docRef = doc(db, 'student_exams_data', user.uid);
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
          const data = docSnap.data();
          if (data.exams) setExams(data.exams);
        } else {
          await setDoc(docRef, { exams: DEFAULT_EXAMS });
        }
      } catch (err) {
        console.error('Error fetching exams:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchExams();
  }, []);

  const saveToFirestore = async (updatedExams: Exam[]) => {
    const user = auth.currentUser;
    if (!user) return;

    try {
      const docRef = doc(db, 'student_exams_data', user.uid);
      await setDoc(docRef, { exams: updatedExams }, { merge: true });
    } catch (err) {
      console.error('Error saving exams:', err);
    }
  };

  const updateExamStatus = async (id: string, newStatus: Exam['status']) => {
    const updated = exams.map(ex => ex.id === id ? { ...ex, status: newStatus } : ex);
    setExams(updated);
    await saveToFirestore(updated);
  };

  const deleteExam = async (id: string) => {
    const updated = exams.filter(ex => ex.id !== id);
    setExams(updated);
    await saveToFirestore(updated);
  };

  const handleAddExamWithAI = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!examQuery.trim() || addingExam) return;

    setAddingExam(true);
    try {
      const res = await fetch('/api/generate-exam', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ examName: examQuery })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Failed to generate exam');

      // 🔥 THE FIX: Bulletproof property extraction using optional chaining
      const newExam: Exam = {
        id: 'exam-' + Date.now(),
        title: data?.exam?.title || data?.title || examQuery,
        stream: data?.exam?.stream || data?.stream || 'General',
        examDate: data?.exam?.examDate || data?.examDate || 'Check official bulletin',
        applicationDeadline: data?.exam?.applicationDeadline || data?.applicationDeadline || 'Check official bulletin',
        eligibility: data?.exam?.eligibility || data?.eligibility || 'Check official bulletin',
        status: 'Planning',
        officialWebsite: data?.exam?.officialWebsite || data?.officialWebsite || 'https://google.com'
      };

      const updatedExams = [newExam, ...exams];
      setExams(updatedExams);
      setExamQuery('');
      await saveToFirestore(updatedExams);
    } catch (err) {
      console.error('Error adding AI exam:', err);
      alert('Failed to generate exam details. Check console for error.');
    } finally {
      setAddingExam(false);
    }
  };

  const toggleChat = (examId: string) => {
    setExamChats(prev => ({
      ...prev,
      [examId]: {
        isOpen: !prev[examId]?.isOpen,
        messages: prev[examId]?.messages || [],
        inputValue: prev[examId]?.inputValue || '',
        loading: prev[examId]?.loading || false
      }
    }));
  };

  const updateChatInput = (examId: string, text: string) => {
    setExamChats(prev => ({
      ...prev,
      [examId]: { ...prev[examId], inputValue: text }
    }));
  };

  const handleSendChatMessage = async (e: React.FormEvent, exam: Exam) => {
    e.preventDefault();
    const chatState = examChats[exam.id];
    if (!chatState?.inputValue.trim() || chatState.loading) return;

    const userMessage: ChatMessage = { role: 'user', content: chatState.inputValue };
    let initialMessages: ChatMessage[] = [];

    if (chatState.messages.length === 0) {
      initialMessages = [
        {
          role: 'system',
          content: `You are an AI Academic Advisor helping a student. 
The student is asking about the following exam:
- Name: ${exam.title}
- Stream: ${exam.stream}
- Exam Date: ${exam.examDate}
- Eligibility: ${exam.eligibility}
Keep your answers highly concise, structured, and helpful.`
        },
        userMessage
      ];
    } else {
      initialMessages = [...chatState.messages, userMessage];
    }

    const messagesToRender = [...(chatState.messages.length === 0 ? initialMessages : chatState.messages.concat(userMessage))];

    setExamChats(prev => ({
      ...prev,
      [exam.id]: {
        ...prev[exam.id],
        messages: [...messagesToRender, { role: 'assistant', content: '' }],
        inputValue: '',
        loading: true,
      }
    }));

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: messagesToRender }),
      });

      if (!res.body) throw new Error("No response stream");

      setExamChats(prev => ({
        ...prev,
        [exam.id]: { ...prev[exam.id], loading: false }
      }));

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let aiFullText = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        aiFullText += decoder.decode(value, { stream: true });

        setExamChats(prev => {
          const curr = prev[exam.id];
          const msgs = [...curr.messages];
          msgs[msgs.length - 1].content = aiFullText;
          return { ...prev, [exam.id]: { ...curr, messages: msgs } };
        });
      }
    } catch (err) {
      console.error("Chat error:", err);
      setExamChats(prev => {
        const curr = prev[exam.id];
        const msgs = [...curr.messages];
        msgs[msgs.length - 1].content = 'Sorry, I encountered an error answering your question.';
        return { ...prev, [exam.id]: { ...curr, messages: msgs, loading: false } };
      });
    }
  };

  if (loading) {
    return (
      <div className="flex h-96 items-center justify-center font-black text-xl">
        <motion.div animate={{ scale: [1, 1.1, 1], rotate: [0, 5, -5, 0] }} transition={{ repeat: Infinity, duration: 1.5 }}>
          LOADING ENTRANCE EXAMS...
        </motion.div>
      </div>
    );
  }

  // 🌟 ANIMATION VARIANTS
  const containerVariants: Variants = {
    hidden: { opacity: 0 },
    show: { opacity: 1, transition: { staggerChildren: 0.1 } }
  };

  const itemVariants: Variants = {
    hidden: { opacity: 0, y: 20 },
    show: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 120, damping: 15 } }
  };

  return (
    <motion.div 
      className="max-w-6xl mx-auto space-y-8 pb-12"
      variants={containerVariants}
      initial="hidden"
      animate="show"
    >
      
      {/* 🌟 ANIMATED Banner */}
      <motion.div variants={itemVariants} className="bg-[#BFDBFE] border-4 border-black p-8 rounded-3xl shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <span className="text-sm font-black uppercase tracking-wider bg-white border-2 border-black px-3 py-1 rounded-full shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]">
            Admissions & Trackers
          </span>
          <h1 className="text-3xl sm:text-4xl font-black mt-4">
            Entrance Exams Hub 🎯
          </h1>
          <p className="font-bold text-lg mt-2 text-gray-800">
            Monitor target exam dates, application deadlines, and official requirements synced securely to your cloud profile.
          </p>
        </div>

        <motion.div whileHover={{ scale: 1.05 }} className="bg-white border-4 border-black p-4 rounded-2xl shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] flex items-center gap-4 shrink-0">
          <Target className="w-10 h-10 text-black fill-[#FF8A65]" />
          <div>
            <div className="text-xs font-black uppercase text-gray-500">Tracked Exams</div>
            <div className="text-2xl font-black">{exams.length} Active</div>
          </div>
        </motion.div>
      </motion.div>

      {/* 🌟 ANIMATED Finder Box */}
      <motion.div variants={itemVariants} className="bg-white border-4 border-black p-6 rounded-3xl shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] space-y-4">
        <h3 className="font-black text-base uppercase tracking-wider flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-amber-500 fill-amber-300" /> AI Exam Bulletin Finder
        </h3>
        <p className="text-xs font-bold text-gray-600">
          Type any exam name (e.g., BITSAT, CLAT, NIFT, JEE Advanced) to automatically pull its timeline and deadlines.
        </p>
        <form onSubmit={handleAddExamWithAI} className="flex gap-2">
          <input
            type="text"
            value={examQuery}
            onChange={(e) => setExamQuery(e.target.value)}
            placeholder="Enter exam name..."
            className="flex-1 bg-[#FAF8F5] border-2 border-black rounded-xl px-4 py-2.5 font-bold text-sm focus:outline-none shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]"
          />
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.95 }}
            type="submit"
            disabled={addingExam || !examQuery.trim()}
            className="bg-[#FF8A65] border-2 border-black px-6 py-2.5 rounded-xl font-black text-sm shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] transition-all cursor-pointer disabled:opacity-50 flex items-center gap-2 shrink-0"
          >
            <Plus className={`w-4 h-4 ${addingExam ? 'animate-spin' : ''}`} /> {addingExam ? 'SEARCHING...' : 'ADD EXAM'}
          </motion.button>
        </form>
      </motion.div>

      {/* 🌟 ANIMATED Exams Grid */}
      <motion.div variants={itemVariants} className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <AnimatePresence mode="popLayout">
          {exams.map((exam) => {
            const chatState = examChats[exam.id];

            return (
              <motion.div 
                layout
                key={exam.id} 
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8, transition: { duration: 0.2 } }}
                transition={{ type: "spring", stiffness: 200, damping: 20 }}
                className="bg-white border-4 border-black p-6 rounded-3xl shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] flex flex-col justify-between space-y-4"
              >
                
                <div className="space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <span className="text-xs font-black uppercase bg-[#FAF8F5] border-2 border-black px-2.5 py-1 rounded-md">
                        {exam.stream}
                      </span>
                      <h3 className="text-xl font-black mt-2">{exam.title}</h3>
                    </div>

                    <div className="flex items-center gap-2">
                      <select
                        value={exam.status}
                        onChange={(e) => updateExamStatus(exam.id, e.target.value as Exam['status'])}
                        className={`text-xs font-black px-3 py-1.5 border-2 border-black rounded-xl shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] cursor-pointer outline-none transition-colors ${
                          exam.status === 'Applied' || exam.status === 'Registered' 
                            ? 'bg-emerald-300' 
                            : exam.status === 'Completed' 
                            ? 'bg-gray-300' 
                            : 'bg-amber-200'
                        }`}
                      >
                        <option value="Planning">Planning</option>
                        <option value="Applied">Applied</option>
                        <option value="Registered">Registered</option>
                        <option value="Completed">Completed</option>
                      </select>

                      <motion.button
                        whileHover={{ scale: 1.1, rotate: 10 }}
                        whileTap={{ scale: 0.9 }}
                        onClick={() => deleteExam(exam.id)}
                        className="p-2 rounded-xl border-2 border-black bg-red-300 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] cursor-pointer hover:bg-red-400 transition-colors"
                        title="Delete Exam"
                      >
                        <Trash2 className="w-4 h-4 text-black" />
                      </motion.button>
                    </div>
                  </div>

                  <p className="text-sm font-bold text-gray-700 bg-[#FAF8F5] p-3 border-2 border-black rounded-xl">
                    <span className="block text-xs uppercase font-black text-gray-500 mb-1">Eligibility:</span>
                    {exam.eligibility}
                  </p>
                </div>

                <div className="space-y-3 pt-4 border-t-2 border-black">
                  <div className="grid grid-cols-2 gap-2 text-xs font-bold">
                    <div className="bg-blue-50 border-2 border-black p-2.5 rounded-xl">
                      <span className="block uppercase text-[10px] text-gray-500 font-black">Exam Date</span>
                      <span className="text-black font-black text-sm">{exam.examDate}</span>
                    </div>
                    <div className="bg-red-50 border-2 border-black p-2.5 rounded-xl">
                      <span className="block uppercase text-[10px] text-gray-500 font-black">Deadline</span>
                      <span className="text-black font-black text-sm">{exam.applicationDeadline}</span>
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <motion.a
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      href={exam.officialWebsite}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex-1 bg-[#FAF8F5] border-2 border-black py-2.5 rounded-xl font-black text-sm shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] transition-all flex items-center justify-center gap-2 cursor-pointer"
                    >
                      Bulletin <ExternalLink className="w-4 h-4" />
                    </motion.a>
                    
                    <motion.button
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => toggleChat(exam.id)}
                      className={`flex-1 border-2 border-black py-2.5 rounded-xl font-black text-sm shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] transition-colors flex items-center justify-center gap-2 cursor-pointer ${chatState?.isOpen ? 'bg-[#FF8A65]' : 'bg-[#A7F3D0]'}`}
                    >
                      <MessageSquare className="w-4 h-4" /> {chatState?.isOpen ? 'Close AI' : 'Ask AI'}
                    </motion.button>
                  </div>
                </div>

                {/* 🌟 ANIMATED Expandable AI Chat Section */}
                <AnimatePresence>
                  {chatState?.isOpen && (
                    <motion.div 
                      initial={{ height: 0, opacity: 0 }} 
                      animate={{ height: 'auto', opacity: 1 }} 
                      exit={{ height: 0, opacity: 0 }} 
                      transition={{ duration: 0.3, ease: "easeInOut" }}
                      className="overflow-hidden"
                    >
                      <div className="mt-4 pt-4 border-t-2 border-black border-dashed flex flex-col gap-3">
                        <div className="max-h-56 overflow-y-auto pr-1 space-y-3">
                          {chatState.messages.length === 0 ? (
                            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center text-sm font-bold text-gray-500 py-4">
                              <Bot className="w-8 h-8 mx-auto mb-2 text-gray-400" />
                              Ask me about syllabus, cutoffs, or preparation strategy for {exam.title}!
                            </motion.div>
                          ) : (
                            chatState.messages.filter(m => m.role !== 'system').map((msg, i) => (
                              <motion.div 
                                initial={{ opacity: 0, y: 10, scale: 0.95 }}
                                animate={{ opacity: 1, y: 0, scale: 1 }}
                                key={i} 
                                className={`p-3 rounded-xl border-2 border-black text-sm ${
                                  msg.role === 'user' 
                                    ? 'bg-[#BFDBFE] ml-auto w-11/12 font-bold' 
                                    : 'bg-[#FAF8F5] mr-auto w-11/12 font-medium prose prose-sm prose-black leading-snug break-words'
                                }`}
                              >
                                {msg.role === 'user' ? (
                                  msg.content
                                ) : (
                                  <div className="overflow-x-auto max-w-full my-1">
                                    <ReactMarkdown remarkPlugins={[remarkGfm] as any}>{msg.content}</ReactMarkdown>
                                  </div>
                                )}
                              </motion.div>
                            ))
                          )}
                          
                          {chatState.loading && (
                            <div className="flex items-center gap-2 font-bold text-gray-500 pl-2">
                              <span className="w-2 h-2 bg-black rounded-full animate-bounce"></span>
                              <span className="w-2 h-2 bg-black rounded-full animate-bounce [animation-delay:0.2s]"></span>
                              <span className="w-2 h-2 bg-black rounded-full animate-bounce [animation-delay:0.4s]"></span>
                            </div>
                          )}
                        </div>

                        <form onSubmit={(e) => handleSendChatMessage(e, exam)} className="flex gap-2">
                          <input 
                            type="text" 
                            value={chatState.inputValue}
                            onChange={(e) => updateChatInput(exam.id, e.target.value)}
                            placeholder="Ask a question..." 
                            className="flex-1 bg-white border-2 border-black rounded-xl px-3 py-2 font-bold text-sm outline-none text-black"
                          />
                          <motion.button 
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.95 }}
                            type="submit" 
                            disabled={chatState.loading || !chatState.inputValue.trim()}
                            className="bg-black text-white border-2 border-black px-3 rounded-xl font-black transition-all disabled:opacity-50 flex items-center justify-center cursor-pointer"
                          >
                            <Send className="w-4 h-4" />
                          </motion.button>
                        </form>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

              </motion.div>
            );
          })}
        </AnimatePresence>
      </motion.div>

      {/* 🌟 ANIMATED Advisory Notice */}
      <motion.div variants={itemVariants} className="bg-[#A7F3D0] border-4 border-black p-6 rounded-3xl shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] flex items-start gap-4">
        <AlertCircle className="w-6 h-6 shrink-0 mt-1" />
        <div className="space-y-1">
          <h4 className="font-black text-base">Counsellor Advisory Notice</h4>
          <p className="text-sm font-bold text-gray-800">
            Entrance exam dates and bulletin patterns are subject to official board notifications. Always cross-verify final application windows directly on official portals before submission.
          </p>
        </div>
      </motion.div>

    </motion.div>
  );
}
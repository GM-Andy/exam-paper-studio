import { useState, useEffect } from 'react';
import { 
  FileText, Upload, Download, Eye, Sparkles, 
  RotateCw, Edit3, BookOpen, FileArchive, X,
  Check, Zap, Trash2, CheckSquare, 
  Square, History, Layers
} from 'lucide-react';
import Lenis from 'lenis';
import confetti from 'canvas-confetti';

interface Question {
  id: string;
  section: string;
  number: number;
  marks: number;
  en: string;
  hi?: string;
  topic?: string;
  difficulty?: string;
}

interface ExamPaper {
  id: string;
  set_name: string;
  program_name: string;
  course_code: string;
  subject_name: string;
  semester: string;
  max_marks: number;
  is_bilingual: boolean;
  overlap_with_partner?: number;
  page_count: number;
  total_questions: number;
  docx_url: string;
  pdf_url: string;
  download_name?: string;
  preview_images: string[];
  section_a: Question[];
  section_b: Question[];
  section_c: Question[];
}

interface NoteItem {
  id: string;
  file_name: string;
  total_pages: number;
  units: string[];
  selected: boolean;
  uploaded_at: number;
  program_name: string;
  semester: string;
  subject_name: string;
  subject_code: string;
}

interface HistoryBatch {
  batch_id: string;
  timestamp: string;
  instruction: string;
  total_papers: number;
  papers: ExamPaper[];
}

interface SessionState {
  authenticated: boolean;
  notes: NoteItem[];
  guidelines: {
    title: string;
    marks_format: number;
    is_bilingual: boolean;
    max_pages: number;
    template_name: string;
    difference_rule: string;
    sections: Array<{
      section: string;
      label: string;
      questions: number;
      attempt: number;
      marks_each: number;
      total_marks: number;
    }>;
  } | null;
  interpretation: string;
  marks_format: number;
  is_bilingual: boolean;
  total_active_notes: number;
  total_notes: number;
  total_active_papers: number;
  history_count: number;
}

export default function App() {
  const [activeTab, setActiveTab] = useState<'studio' | 'history'>('studio');
  const [session, setSession] = useState<SessionState | null>(null);
  const [papers, setPapers] = useState<ExamPaper[]>([]);
  const [history, setHistory] = useState<HistoryBatch[]>([]);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [progress, setProgress] = useState<{ percent: number; stage: string; message: string }>({
    percent: 0,
    stage: 'idle',
    message: ''
  });
  const [promptText, setPromptText] = useState('');
  
  // Card filter
  const [filterSet, setFilterSet] = useState<'ALL' | 'A' | 'B'>('ALL');
  const [selectedSubject, setSelectedSubject] = useState<string>('ALL');

  // Preview Modal
  const [previewPaper, setPreviewPaper] = useState<ExamPaper | null>(null);
  const [activePreviewPage, setActivePreviewPage] = useState<number>(0);

  // Question Editor Drawer
  const [inspectPaper, setInspectPaper] = useState<ExamPaper | null>(null);
  const [editingQuestion, setEditingQuestion] = useState<Question | null>(null);
  const [editInstruction, setEditInstruction] = useState('');
  const [manualEn, setManualEn] = useState('');
  const [manualHi, setManualHi] = useState('');
  const [editingLoading, setEditingLoading] = useState(false);

  // Initialize Lenis smooth scroll
  useEffect(() => {
    const lenis = new Lenis({
      duration: 1.1,
      easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      orientation: 'vertical',
      smoothWheel: true,
    });

    function raf(time: number) {
      lenis.raf(time);
      requestAnimationFrame(raf);
    }
    requestAnimationFrame(raf);

    return () => {
      lenis.destroy();
    };
  }, []);

  // Fetch initial session, papers, history
  useEffect(() => {
    fetchSession();
    fetchPapers();
    fetchHistory();
  }, []);

  const fetchSession = async () => {
    try {
      const res = await fetch('/api/session-state');
      if (res.ok) {
        const data = await res.json();
        setSession(data);
      }
    } catch (err) {
      console.error('Failed to load session:', err);
    }
  };

  const fetchPapers = async () => {
    try {
      const res = await fetch('/api/papers');
      if (res.ok) {
        const data = await res.json();
        setPapers(data);
      }
    } catch (err) {
      console.error('Failed to load papers:', err);
    }
  };

  const fetchHistory = async () => {
    try {
      const res = await fetch('/api/history');
      if (res.ok) {
        const data = await res.json();
        setHistory(data);
      }
    } catch (err) {
      console.error('Failed to load history:', err);
    }
  };

  // Poll progress during generation
  useEffect(() => {
    let interval: any;
    if (generating) {
      interval = setInterval(async () => {
        try {
          const res = await fetch('/api/progress');
          const data = await res.json();
          setProgress(data);
          if (data.stage === 'completed' || data.stage === 'error') {
            setGenerating(false);
            clearInterval(interval);
            fetchPapers();
            fetchSession();
            fetchHistory();
            if (data.stage === 'completed') {
              triggerConfetti();
            }
          }
        } catch (e) {
          console.error(e);
        }
      }, 2000);
    }
    return () => clearInterval(interval);
  }, [generating]);

  const triggerConfetti = () => {
    confetti({
      particleCount: 80,
      spread: 70,
      origin: { y: 0.6 },
      colors: ['#FFA69E', '#B8F2E6', '#AED9E0', '#5E6472']
    });
  };

  const handleToggleNote = async (noteId: string, currentSelected: boolean) => {
    try {
      const res = await fetch('/api/notes/toggle-select', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ note_id: noteId, selected: !currentSelected })
      });
      if (res.ok) {
        const data = await res.json();
        setSession(data);
      }
    } catch (e) {
      console.error('Error toggling note:', e);
    }
  };

  const handleSelectAllNotes = async (select: boolean) => {
    try {
      const res = await fetch(`/api/notes/select-all?select=${select}`, { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        setSession(data);
      }
    } catch (e) {
      console.error('Error selecting all notes:', e);
    }
  };

  const handleDeleteNote = async (noteId: string) => {
    try {
      const res = await fetch(`/api/notes/${noteId}`, { method: 'DELETE' });
      if (res.ok) {
        const data = await res.json();
        setSession(data);
      }
    } catch (e) {
      console.error('Error deleting note:', e);
    }
  };

  const handleClearAllNotes = async () => {
    if (!confirm('Clear all uploaded notes from the active studio?')) return;
    try {
      const res = await fetch('/api/notes/clear', { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        setSession(data);
      }
    } catch (e) {
      console.error('Error clearing notes:', e);
    }
  };

  const handleResetWorkspace = async () => {
    if (!confirm('Start fresh? This clears the active workspace while keeping previous generations in the History tab.')) return;
    try {
      const res = await fetch('/api/session/reset', { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        setSession(data);
        setPapers([]);
      }
    } catch (e) {
      console.error('Error resetting session:', e);
    }
  };

  const handleLoadSample = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/load-sample-data', { method: 'POST' });
      if (res.ok) {
        await fetchSession();
        await fetchPapers();
      }
    } finally {
      setLoading(false);
    }
  };

  const handleGenerate = async () => {
    if (!session || session.total_active_notes === 0) {
      alert('Please select at least one note to generate examination papers.');
      return;
    }
    setGenerating(true);
    setProgress({ percent: 5, stage: 'starting', message: 'Analyzing selected notes and university format...' });
    try {
      await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          instruction: promptText,
          marks_format: session.marks_format || 70,
          is_bilingual: true
        })
      });
    } catch (err) {
      console.error('Generation launch error:', err);
      setGenerating(false);
    }
  };

  const handleEditQuestion = async () => {
    if (!inspectPaper || !editingQuestion) return;
    setEditingLoading(true);
    try {
      const payload: any = { question_id: editingQuestion.id };
      if (editInstruction.trim()) {
        payload.instruction = editInstruction.trim();
      } else {
        payload.en = manualEn;
        payload.hi = manualHi;
      }

      const res = await fetch(`/api/papers/${inspectPaper.id}/edit-question`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        const data = await res.json();
        const updateList = (list: Question[]) => 
          list.map(q => q.id === data.question.id ? { ...q, ...data.question } : q);

        const updated = {
          ...inspectPaper,
          page_count: data.page_count,
          section_a: updateList(inspectPaper.section_a),
          section_b: updateList(inspectPaper.section_b),
          section_c: updateList(inspectPaper.section_c),
        };
        setInspectPaper(updated);
        setPapers(prev => prev.map(p => p.id === updated.id ? updated : p));
        setEditingQuestion(null);
        setEditInstruction('');
      }
    } finally {
      setEditingLoading(false);
    }
  };

  // Filter active papers
  const filteredPapers = papers.filter(p => {
    if (filterSet !== 'ALL' && p.set_name !== filterSet) return false;
    if (selectedSubject !== 'ALL' && p.course_code !== selectedSubject) return false;
    return true;
  });

  const uniqueSubjects = Array.from(new Set(papers.map(p => p.course_code))).map(code => {
    const match = papers.find(p => p.course_code === code);
    return { code, name: match?.subject_name || code };
  });

  const activeNotesCount = session?.total_active_notes || 0;
  const totalNotesCount = session?.total_notes || 0;

  return (
    <div className="min-h-screen bg-palette-cream text-palette-slate-dark bg-dot-pattern flex flex-col font-sans">
      
      {/* 1. Header Navigation Dock */}
      <header className="sticky top-0 z-40 bg-palette-cream/90 backdrop-blur-md border-b-1.5 border-palette-slate px-4 lg:px-8 py-3 transition-all">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
          
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-palette-coral border-1.5 border-palette-slate flex items-center justify-center shadow-tactile-sm">
              <BookOpen className="w-5 h-5 text-palette-slate-dark" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-serif font-bold text-xl tracking-tight text-palette-slate-dark">
                  Exam Paper Studio
                </span>
                <span className="text-[11px] font-mono uppercase tracking-wider bg-palette-mint text-palette-slate-dark px-2 py-0.5 rounded-full border border-palette-slate font-semibold">
                  v2.5
                </span>
              </div>
              <p className="text-xs text-palette-slate font-medium hidden sm:block">
                Academic Document Automation & Layout Engine
              </p>
            </div>
          </div>

          {/* Tab Switcher & Actions */}
          <div className="flex items-center gap-2 sm:gap-3">
            
            {/* Top Workspace Tabs */}
            <div className="flex items-center bg-palette-cream-card rounded-xl border-1.5 border-palette-slate p-0.5 shadow-tactile-sm">
              <button
                onClick={() => setActiveTab('studio')}
                className={`flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg transition-all ${
                  activeTab === 'studio' 
                    ? 'bg-palette-slate-dark text-white' 
                    : 'text-palette-slate hover:text-palette-slate-dark'
                }`}
              >
                <Layers className="w-3.5 h-3.5" />
                <span>Active Studio</span>
                {activeNotesCount > 0 && (
                  <span className="ml-1 text-[10px] font-mono bg-palette-mint text-palette-slate-dark px-1.5 py-0.2 rounded-full font-bold">
                    {activeNotesCount}
                  </span>
                )}
              </button>

              <button
                onClick={() => setActiveTab('history')}
                className={`flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg transition-all ${
                  activeTab === 'history' 
                    ? 'bg-palette-slate-dark text-white' 
                    : 'text-palette-slate hover:text-palette-slate-dark'
                }`}
              >
                <History className="w-3.5 h-3.5" />
                <span>Previous Generations</span>
                {history.length > 0 && (
                  <span className="ml-1 text-[10px] font-mono bg-palette-ice text-palette-slate-dark px-1.5 py-0.2 rounded-full font-bold">
                    {history.length}
                  </span>
                )}
              </button>
            </div>

            {/* Quick Demo Loader */}
            <button
              onClick={handleLoadSample}
              disabled={loading}
              title="Loads sample MA Sociology notes and university guidelines"
              className="tactile-btn text-xs font-semibold px-2.5 py-1.5 rounded-xl bg-palette-ice hover:bg-palette-ice-dark text-palette-slate-dark hidden md:flex items-center gap-1 cursor-pointer disabled:opacity-50"
            >
              <RotateCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              <span>Load Sample</span>
            </button>

            {/* Reset Workspace */}
            <button
              onClick={handleResetWorkspace}
              title="Clears the current active workspace"
              className="tactile-btn text-xs font-semibold px-2.5 py-1.5 rounded-xl bg-palette-cream-card hover:bg-white text-palette-slate hover:text-red-600 border-1.5 border-palette-slate flex items-center gap-1 cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Start Fresh</span>
            </button>

            {/* Download Zip */}
            {papers.length > 0 && (
              <a
                href="/api/download-all"
                onClick={triggerConfetti}
                className="tactile-btn text-xs font-bold px-3 py-1.5 rounded-xl bg-palette-coral hover:bg-palette-coral-hover text-palette-slate-dark flex items-center gap-1.5 cursor-pointer"
              >
                <FileArchive className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Download All (ZIP)</span>
                <span className="sm:hidden">ZIP</span>
              </a>
            )}

          </div>

        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 lg:px-8 py-6 space-y-6">

        {/* ================= TAB 1: ACTIVE STUDIO ================= */}
        {activeTab === 'studio' && (
          <>
            {/* Minimal Punchy Hero */}
            <div className="text-center max-w-3xl mx-auto space-y-2 pt-2 pb-1">
              <h1 className="text-3xl sm:text-4xl font-serif font-bold text-palette-slate-dark tracking-tight leading-tight">
                Your exam papers, <span className="italic font-normal text-palette-slate">ready in minutes.</span>
              </h1>
              <p className="text-xs sm:text-sm text-palette-slate max-w-xl mx-auto">
                Upload notes and guidelines. Select which files to include. Generate official Word & PDF papers with strict 2-page verification.
              </p>
            </div>

            {/* 3-Zone Tactile Bento Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
              
              {/* Zone 1: Active Notes & Selection */}
              <div className="tactile-card bg-palette-cream-card rounded-2xl p-5 flex flex-col justify-between border-1.5 border-palette-slate space-y-4">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-lg bg-palette-ice border border-palette-slate flex items-center justify-center font-bold text-xs">
                        1
                      </div>
                      <h3 className="font-serif font-bold text-base text-palette-slate-dark">
                        Notes & Syllabus
                      </h3>
                    </div>

                    {/* Selection Controls */}
                    {totalNotesCount > 0 && (
                      <div className="flex items-center gap-1.5 text-[11px]">
                        <button
                          onClick={() => handleSelectAllNotes(true)}
                          className="text-palette-slate hover:text-palette-slate-dark font-medium underline cursor-pointer"
                        >
                          All
                        </button>
                        <span className="text-palette-slate/40">·</span>
                        <button
                          onClick={() => handleSelectAllNotes(false)}
                          className="text-palette-slate hover:text-palette-slate-dark font-medium underline cursor-pointer"
                        >
                          None
                        </button>
                        <span className="text-palette-slate/40">·</span>
                        <button
                          onClick={handleClearAllNotes}
                          className="text-red-500 hover:text-red-700 font-medium cursor-pointer"
                          title="Remove all uploaded notes"
                        >
                          Clear
                        </button>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center justify-between mb-3 text-xs">
                    <span className="font-medium text-palette-slate">
                      {activeNotesCount} of {totalNotesCount} notes selected for generation
                    </span>
                    {totalNotesCount > 0 && (
                      <span className="font-mono text-[10px] bg-palette-mint text-palette-slate-dark px-1.5 py-0.5 rounded font-bold border border-palette-slate/30">
                        {activeNotesCount > 0 ? 'READY' : 'SELECT NOTES'}
                      </span>
                    )}
                  </div>

                  {/* Upload Dropzone */}
                  <label className="border-2 border-dashed border-palette-slate/40 hover:border-palette-slate rounded-xl p-3 flex flex-col items-center justify-center text-center cursor-pointer transition-colors bg-palette-cream/40 mb-3">
                    <Upload className="w-5 h-5 text-palette-slate mb-1" />
                    <span className="text-xs font-semibold text-palette-slate-dark">Upload notes (PDF/DOCX)</span>
                    <span className="text-[10px] text-palette-slate/70">Recently uploaded appears on top</span>
                    <input 
                      type="file" 
                      multiple 
                      accept=".pdf,.docx,.txt"
                      className="hidden"
                      onChange={async (e) => {
                        if (!e.target.files?.length) return;
                        const fd = new FormData();
                        Array.from(e.target.files).forEach(f => fd.append('files', f));
                        setLoading(true);
                        await fetch('/api/upload-notes', { method: 'POST', body: fd });
                        await fetchSession();
                        setLoading(false);
                      }}
                    />
                  </label>

                  {/* Notes List with Checkboxes (sorted newest first) */}
                  {session?.notes && session.notes.length > 0 ? (
                    <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                      {session.notes.map((n, i) => (
                        <div 
                          key={n.id || i}
                          className={`p-2.5 rounded-xl border transition-all flex items-start justify-between gap-2.5 ${
                            n.selected 
                              ? 'bg-palette-mint-light/40 border-palette-mint-dark shadow-sm' 
                              : 'bg-palette-cream/40 border-palette-slate/30 opacity-70'
                          }`}
                        >
                          <div className="flex items-start gap-2.5 flex-1 min-w-0">
                            {/* Checkbox */}
                            <button
                              type="button"
                              onClick={() => handleToggleNote(n.id, n.selected)}
                              className="mt-0.5 text-palette-slate-dark cursor-pointer shrink-0"
                            >
                              {n.selected ? (
                                <CheckSquare className="w-4 h-4 text-emerald-700" />
                              ) : (
                                <Square className="w-4 h-4 text-palette-slate" />
                              )}
                            </button>

                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1.5 mb-0.5">
                                <span className="font-semibold text-xs text-palette-slate-dark truncate block max-w-[150px]" title={n.file_name}>
                                  {n.file_name}
                                </span>
                                {i === 0 && (
                                  <span className="text-[9px] font-mono uppercase bg-palette-coral text-palette-slate-dark px-1 py-0.2 rounded font-bold border border-palette-slate/30">
                                    NEW
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-2 text-[10px] text-palette-slate font-medium">
                                <span className="font-mono bg-palette-cream px-1 py-0.2 rounded border border-palette-slate/20">
                                  {n.program_name} • Sem {n.semester}
                                </span>
                                <span>{n.total_pages}p</span>
                              </div>
                            </div>
                          </div>

                          {/* Delete Action */}
                          <button
                            type="button"
                            onClick={() => handleDeleteNote(n.id)}
                            className="text-palette-slate/50 hover:text-red-600 p-1 rounded transition-colors cursor-pointer shrink-0"
                            title="Remove file"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-5 text-xs text-palette-slate/60 bg-palette-cream/30 rounded-xl border border-dashed border-palette-slate/30">
                      No notes uploaded yet. Drop notes above or click "Load Sample".
                    </div>
                  )}

                </div>
              </div>

              {/* Zone 2: Active Exam Guidelines */}
              <div className="tactile-card bg-palette-cream-card rounded-2xl p-5 flex flex-col justify-between border-1.5 border-palette-slate space-y-4">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-lg bg-palette-mint border border-palette-slate flex items-center justify-center font-bold text-xs">
                        2
                      </div>
                      <h3 className="font-serif font-bold text-base text-palette-slate-dark">
                        Exam Guidelines in Use
                      </h3>
                    </div>
                    <span className="text-[10px] font-mono uppercase tracking-wider text-palette-slate bg-palette-slate-subtle px-1.5 py-0.5 rounded border border-palette-slate/30">
                      Active Rules
                    </span>
                  </div>

                  <p className="text-xs text-palette-slate mb-3">
                    University marking format, bilingual translation, and Word template specifications.
                  </p>

                  {/* Prominent Guidelines Summary Card */}
                  {session?.guidelines ? (
                    <div className="bg-palette-cream/70 rounded-xl p-3 border border-palette-slate/40 space-y-2.5">
                      
                      <div className="flex items-center justify-between pb-2 border-b border-palette-slate/20">
                        <div>
                          <span className="text-[10px] font-mono uppercase tracking-wider text-palette-slate block">
                            Document Template
                          </span>
                          <span className="text-xs font-bold text-palette-slate-dark flex items-center gap-1">
                            <FileText className="w-3.5 h-3.5 text-palette-slate" />
                            {session.guidelines.template_name}
                          </span>
                        </div>
                        <span className="text-xs font-mono font-bold bg-palette-coral px-2 py-0.5 rounded border border-palette-slate text-palette-slate-dark">
                          {session.guidelines.marks_format} Marks
                        </span>
                      </div>

                      {/* Constraints Grid */}
                      <div className="grid grid-cols-2 gap-2 text-[11px]">
                        <div className="bg-white/80 p-2 rounded-lg border border-palette-slate/20">
                          <span className="text-palette-slate block text-[10px]">Difference Rule</span>
                          <span className="font-semibold text-emerald-800">≥75% Difference</span>
                          <span className="text-[9px] text-palette-slate/80 block">≤25% common questions</span>
                        </div>
                        <div className="bg-white/80 p-2 rounded-lg border border-palette-slate/20">
                          <span className="text-palette-slate block text-[10px]">Page Limit</span>
                          <span className="font-semibold text-emerald-800">Strictly 2 Pages</span>
                          <span className="text-[9px] text-palette-slate/80 block">Verified on PDF</span>
                        </div>
                      </div>

                      {/* Section Structure Chips */}
                      <div className="space-y-1 pt-1">
                        <span className="text-[10px] font-mono text-palette-slate uppercase tracking-wider block">
                          Sections Breakdown
                        </span>
                        <div className="space-y-1">
                          {session.guidelines.sections.map((sec, i) => (
                            <div key={i} className="flex items-center justify-between text-[11px] bg-palette-cream px-2 py-1 rounded border border-palette-slate/20 font-medium">
                              <span>Sec {sec.section}: {sec.label}</span>
                              <span className="font-mono text-[10px] text-palette-slate">
                                {sec.questions} Qs (Att. {sec.attempt}) = {sec.total_marks}m
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>

                    </div>
                  ) : (
                    <div className="p-3 bg-palette-cream/40 rounded-xl border border-palette-slate/30 text-xs text-palette-slate">
                      Standard 70-Mark University Format active.
                    </div>
                  )}

                  {/* Upload Custom Guidelines */}
                  <div className="pt-2">
                    <label className="text-[11px] font-medium text-palette-slate hover:text-palette-slate-dark flex items-center gap-1.5 cursor-pointer underline">
                      <Upload className="w-3.5 h-3.5" />
                      <span>Upload different circular or DOCX template</span>
                      <input 
                        type="file" 
                        accept=".docx,.pdf"
                        className="hidden"
                        onChange={async (e) => {
                          if (!e.target.files?.[0]) return;
                          const fd = new FormData();
                          fd.append('files', e.target.files[0]);
                          setLoading(true);
                          await fetch('/api/upload-guidelines', { method: 'POST', body: fd });
                          await fetchSession();
                          setLoading(false);
                        }}
                      />
                    </label>
                  </div>

                </div>
              </div>

              {/* Zone 3: Natural Language Director */}
              <div className="tactile-card bg-palette-cream-card rounded-2xl p-5 flex flex-col justify-between border-1.5 border-palette-slate space-y-4">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-lg bg-palette-coral border border-palette-slate flex items-center justify-center font-bold text-xs">
                        3
                      </div>
                      <h3 className="font-serif font-bold text-base text-palette-slate-dark">
                        Specific Instructions
                      </h3>
                    </div>
                    <span className="text-[10px] font-mono uppercase tracking-wider text-palette-slate bg-palette-slate-subtle px-1.5 py-0.5 rounded border border-palette-slate/30">
                      Optional
                    </span>
                  </div>

                  <p className="text-xs text-palette-slate mb-2">
                    Direct the model to prioritize specific units, course codes, or focus areas.
                  </p>

                  <textarea
                    value={promptText}
                    onChange={(e) => setPromptText(e.target.value)}
                    rows={3}
                    className="w-full text-xs p-3 rounded-xl border border-palette-slate bg-palette-cream/60 focus:bg-white focus:outline-none focus:ring-2 focus:ring-palette-coral resize-none mb-2"
                    placeholder="e.g. Generate Set A and Set B for the selected notes. Focus Section C on Indian context..."
                  />

                  {/* Quick Pill Templates */}
                  <div className="flex flex-wrap gap-1.5 mb-3">
                    <button
                      type="button"
                      onClick={() => setPromptText('Prepare Set A and Set B for B.Com Semester 1 following the guidelines.')}
                      className="text-[10px] font-medium bg-palette-ice hover:bg-palette-ice-dark px-2 py-0.5 rounded-full border border-palette-slate/30 cursor-pointer text-palette-slate-dark"
                    >
                      B.Com Sem 1
                    </button>
                    <button
                      type="button"
                      onClick={() => setPromptText('Prepare Set A and Set B for MA Sociology with high analytical rigor in Section B.')}
                      className="text-[10px] font-medium bg-palette-mint hover:bg-palette-mint-dark px-2 py-0.5 rounded-full border border-palette-slate/30 cursor-pointer text-palette-slate-dark"
                    >
                      MA Sociology Bilingual
                    </button>
                    <button
                      type="button"
                      onClick={() => setPromptText('Ensure 75% difference between Set A and Set B. Double check Hindi translations.')}
                      className="text-[10px] font-medium bg-palette-coral-light hover:bg-palette-coral px-2 py-0.5 rounded-full border border-palette-slate/30 cursor-pointer text-palette-slate-dark"
                    >
                      Strict 75% Difference
                    </button>
                  </div>

                </div>

                {/* Primary Action Button */}
                <button
                  onClick={handleGenerate}
                  disabled={generating || activeNotesCount === 0}
                  className={`tactile-btn w-full py-3 px-4 rounded-xl font-bold text-xs sm:text-sm flex items-center justify-center gap-2 cursor-pointer transition-all ${
                    activeNotesCount > 0 
                      ? 'bg-palette-coral hover:bg-palette-coral-hover text-palette-slate-dark shadow-tactile' 
                      : 'bg-palette-slate/20 text-palette-slate cursor-not-allowed border-palette-slate/40'
                  }`}
                >
                  {generating ? (
                    <>
                      <RotateCw className="w-4 h-4 animate-spin" />
                      <span>Generating Examination Papers...</span>
                    </>
                  ) : (
                    <>
                      <Zap className="w-4 h-4" />
                      <span>
                        {activeNotesCount > 0 
                          ? `Create Papers for ${activeNotesCount} Selected Subject${activeNotesCount > 1 ? 's' : ''}`
                          : 'Select At Least 1 Note to Generate'}
                      </span>
                    </>
                  )}
                </button>
              </div>

            </div>

            {/* Live Progress Bar (if generating) */}
            {generating && (
              <div className="tactile-card bg-white rounded-2xl p-4 border-1.5 border-palette-slate space-y-2 animate-fade-in shadow-tactile">
                <div className="flex items-center justify-between text-xs font-semibold">
                  <span className="flex items-center gap-2 text-palette-slate-dark">
                    <RotateCw className="w-4 h-4 animate-spin text-palette-coral" />
                    {progress.message || 'Processing syllabus & guidelines...'}
                  </span>
                  <span className="font-mono text-xs">{progress.percent}%</span>
                </div>
                <div className="w-full bg-palette-slate-subtle rounded-full h-2.5 overflow-hidden border border-palette-slate">
                  <div 
                    className="bg-palette-coral h-full transition-all duration-300"
                    style={{ width: `${progress.percent}%` }}
                  ></div>
                </div>
              </div>
            )}

            {/* Generated Papers Gallery (Current Active Batch) */}
            <section className="space-y-4 pt-2">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-palette-slate/20 pb-3">
                <div>
                  <h2 className="font-serif font-bold text-xl text-palette-slate-dark tracking-tight">
                    Active Examination Papers ({papers.length})
                  </h2>
                  <p className="text-xs text-palette-slate">
                    Strictly 2-page verified documents ready for direct download or targeted editing.
                  </p>
                </div>

                {/* Filter Pills */}
                {papers.length > 0 && (
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="flex items-center bg-palette-cream-card rounded-xl border border-palette-slate p-0.5 shadow-tactile-sm">
                      {(['ALL', 'A', 'B'] as const).map(set => (
                        <button
                          key={set}
                          onClick={() => setFilterSet(set)}
                          className={`text-xs px-2.5 py-1 rounded-lg font-medium transition-all ${
                            filterSet === set 
                              ? 'bg-palette-slate-dark text-white font-bold' 
                              : 'text-palette-slate hover:text-palette-slate-dark'
                          }`}
                        >
                          {set === 'ALL' ? 'All Sets' : `Set ${set}`}
                        </button>
                      ))}
                    </div>

                    {uniqueSubjects.length > 1 && (
                      <select
                        value={selectedSubject}
                        onChange={(e) => setSelectedSubject(e.target.value)}
                        className="text-xs p-1 rounded-xl border border-palette-slate bg-palette-cream-card font-medium text-palette-slate-dark focus:outline-none shadow-tactile-sm"
                      >
                        <option value="ALL">All Subjects ({uniqueSubjects.length})</option>
                        {uniqueSubjects.map(s => (
                          <option key={s.code} value={s.code}>
                            {s.code} — {s.name}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                )}
              </div>

              {filteredPapers.length === 0 ? (
                <div className="tactile-card bg-palette-cream-card rounded-2xl p-8 text-center border-1.5 border-palette-slate space-y-2">
                  <BookOpen className="w-8 h-8 text-palette-slate mx-auto opacity-40" />
                  <h3 className="font-serif font-bold text-base text-palette-slate-dark">
                    {papers.length === 0 ? 'No papers generated in this active session' : 'No papers match your filter'}
                  </h3>
                  <p className="text-xs text-palette-slate max-w-md mx-auto">
                    {papers.length === 0 
                      ? 'Upload your notes and click "Create Papers", or click "Load Sample" to see the verified MA Sociology papers.' 
                      : 'Adjust your set or subject filter above to view papers.'}
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  {filteredPapers.map(paper => (
                    <div 
                      key={paper.id}
                      className="tactile-card bg-palette-cream-card rounded-2xl border-1.5 border-palette-slate p-4 flex flex-col justify-between space-y-3 relative overflow-hidden group shadow-tactile"
                    >
                      {/* Top Badges */}
                      <div className="flex items-start justify-between gap-3">
                        <div className="space-y-1">
                          <div className="flex items-center gap-1.5">
                            <span className={`text-xs font-mono font-bold px-2 py-0.5 rounded-md border border-palette-slate ${
                              paper.set_name === 'A' ? 'bg-palette-coral text-palette-slate-dark' : 'bg-palette-ice text-palette-slate-dark'
                            }`}>
                              SET {paper.set_name}
                            </span>
                            <span className="text-xs font-mono font-semibold text-palette-slate bg-palette-slate-subtle px-1.5 py-0.5 rounded border border-palette-slate/30">
                              {paper.course_code}
                            </span>
                          </div>
                          <h3 className="font-serif font-bold text-base text-palette-slate-dark leading-snug">
                            {paper.subject_name}
                          </h3>
                          <p className="text-[11px] text-palette-slate font-medium">
                            {paper.program_name} • Semester {paper.semester}
                          </p>
                        </div>

                        <div className="flex flex-col items-end gap-1">
                          <span className="text-xs font-mono font-bold bg-palette-mint px-2 py-0.5 rounded-md border border-palette-slate text-palette-slate-dark">
                            {paper.max_marks} Marks
                          </span>
                          <span className="text-[10px] font-mono text-emerald-800 bg-emerald-50 px-1.5 py-0.2 rounded border border-emerald-300 font-semibold flex items-center gap-1">
                            <Check className="w-3 h-3" /> {paper.page_count} Pages Strict
                          </span>
                        </div>
                      </div>

                      {/* Interactive Page Thumbnail Preview */}
                      <div className="bg-palette-cream/60 rounded-xl p-2.5 border border-palette-slate/30 space-y-1.5">
                        <div className="flex items-center justify-between text-[11px] text-palette-slate font-medium">
                          <span>Document Preview</span>
                          <span className="text-emerald-800 font-semibold text-[10px]">
                            Overlap with partner: {paper.overlap_with_partner ? `${paper.overlap_with_partner.toFixed(1)}%` : '≤15%'}
                          </span>
                        </div>

                        <div className="grid grid-cols-2 gap-2">
                          {[0, 1].map(pageIdx => {
                            const imgUrl = paper.preview_images[pageIdx];
                            return (
                              <div
                                key={pageIdx}
                                onClick={() => {
                                  setPreviewPaper(paper);
                                  setActivePreviewPage(pageIdx);
                                }}
                                className="aspect-[1/1.41] bg-white rounded-lg border border-palette-slate/40 overflow-hidden relative group/page cursor-pointer shadow-sm hover:shadow transition-all"
                              >
                                {imgUrl ? (
                                  <img 
                                    src={imgUrl} 
                                    alt={`Page ${pageIdx + 1}`}
                                    className="w-full h-full object-cover object-top"
                                    loading="lazy"
                                  />
                                ) : (
                                  <div className="w-full h-full flex flex-col items-center justify-center p-2 text-center bg-palette-cream/20">
                                    <FileText className="w-5 h-5 text-palette-slate/40 mb-1" />
                                    <span className="text-[9px] font-mono text-palette-slate/70">Page {pageIdx + 1}</span>
                                  </div>
                                )}
                                <div className="absolute inset-0 bg-palette-slate-dark/60 opacity-0 group-hover/page:opacity-100 flex items-center justify-center transition-opacity text-white text-xs font-semibold gap-1">
                                  <Eye className="w-3.5 h-3.5" />
                                  <span>View Page {pageIdx + 1}</span>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      {/* Paper Actions */}
                      <div className="flex items-center justify-between gap-2 pt-1 border-t border-palette-slate/20">
                        <button
                          onClick={() => setInspectPaper(paper)}
                          className="tactile-btn text-xs font-semibold px-2.5 py-1.5 rounded-xl bg-palette-ice hover:bg-palette-ice-dark text-palette-slate-dark flex items-center gap-1 cursor-pointer"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                          <span>Refine Questions</span>
                        </button>

                        <div className="flex items-center gap-1.5">
                          <a
                            href={paper.docx_url}
                            className="tactile-btn text-xs font-semibold px-2.5 py-1.5 rounded-xl bg-palette-cream hover:bg-white text-palette-slate-dark border border-palette-slate flex items-center gap-1 cursor-pointer"
                            title="Download official Word document"
                          >
                            <Download className="w-3.5 h-3.5" />
                            <span>DOCX</span>
                          </a>

                          <a
                            href={paper.pdf_url}
                            className="tactile-btn text-xs font-semibold px-2.5 py-1.5 rounded-xl bg-palette-mint hover:bg-palette-mint-dark text-palette-slate-dark flex items-center gap-1 cursor-pointer"
                            title="Download verified 2-page PDF"
                          >
                            <Download className="w-3.5 h-3.5" />
                            <span>PDF</span>
                          </a>
                        </div>
                      </div>

                    </div>
                  ))}
                </div>
              )}
            </section>
          </>
        )}

        {/* ================= TAB 2: PREVIOUS GENERATIONS (MEMORY & ARCHIVE) ================= */}
        {activeTab === 'history' && (
          <div className="space-y-6 pt-2">
            <div>
              <h2 className="font-serif font-bold text-2xl text-palette-slate-dark tracking-tight">
                Previous Generations Archive
              </h2>
              <p className="text-xs text-palette-slate">
                All generated examination paper batches are stored here. When you start fresh, this archive remains intact.
              </p>
            </div>

            {history.length === 0 ? (
              <div className="tactile-card bg-palette-cream-card rounded-2xl p-12 text-center border-1.5 border-palette-slate space-y-2">
                <History className="w-8 h-8 text-palette-slate mx-auto opacity-40" />
                <h3 className="font-serif font-bold text-lg text-palette-slate-dark">No generation batches in archive</h3>
                <p className="text-xs text-palette-slate">Generate papers or click "Load Sample" to populate the archive.</p>
              </div>
            ) : (
              <div className="space-y-6">
                {history.map((batch) => (
                  <div 
                    key={batch.batch_id}
                    className="tactile-card bg-palette-cream-card rounded-2xl border-1.5 border-palette-slate p-5 space-y-4 shadow-tactile"
                  >
                    {/* Batch Header */}
                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-3 border-b border-palette-slate/20">
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-xs font-mono font-bold bg-palette-ice text-palette-slate-dark px-2 py-0.5 rounded border border-palette-slate/40">
                            {batch.timestamp}
                          </span>
                          <span className="text-xs font-mono font-semibold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-300">
                            {batch.total_papers || batch.papers.length} Papers
                          </span>
                        </div>
                        <p className="text-xs text-palette-slate font-medium">
                          {batch.instruction}
                        </p>
                      </div>

                      <a
                        href="/api/download-all"
                        className="tactile-btn text-xs font-bold px-3 py-1.5 rounded-xl bg-palette-coral hover:bg-palette-coral-hover text-palette-slate-dark flex items-center gap-1.5 cursor-pointer shrink-0"
                      >
                        <FileArchive className="w-3.5 h-3.5" />
                        <span>Download Batch ZIP</span>
                      </a>
                    </div>

                    {/* Batch Papers Grid */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                      {batch.papers.map((p) => (
                        <div 
                          key={p.id}
                          className="bg-palette-cream p-3 rounded-xl border border-palette-slate/30 space-y-2 flex flex-col justify-between"
                        >
                          <div>
                            <div className="flex items-center justify-between text-[11px] font-mono mb-1">
                              <span className={`px-1.5 py-0.2 rounded font-bold border border-palette-slate ${
                                p.set_name === 'A' ? 'bg-palette-coral' : 'bg-palette-ice'
                              }`}>
                                SET {p.set_name}
                              </span>
                              <span className="text-palette-slate font-semibold">{p.course_code}</span>
                            </div>
                            <h4 className="text-xs font-serif font-bold text-palette-slate-dark line-clamp-2 leading-snug">
                              {p.subject_name}
                            </h4>
                            <p className="text-[10px] text-palette-slate mt-0.5">
                              {p.program_name} • Sem {p.semester}
                            </p>
                          </div>

                          <div className="flex items-center justify-between gap-1 pt-2 border-t border-palette-slate/20">
                            <span className="text-[10px] font-mono text-emerald-800 font-semibold">
                              {p.page_count} Pages
                            </span>
                            <div className="flex items-center gap-1">
                              <a
                                href={p.docx_url}
                                className="text-[10px] font-bold px-1.5 py-0.5 bg-white hover:bg-palette-ice rounded border border-palette-slate"
                                title="Download DOCX"
                              >
                                DOCX
                              </a>
                              <a
                                href={p.pdf_url}
                                className="text-[10px] font-bold px-1.5 py-0.5 bg-palette-mint hover:bg-palette-mint-dark rounded border border-palette-slate"
                                title="Download PDF"
                              >
                                PDF
                              </a>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>

                  </div>
                ))}
              </div>
            )}
          </div>
        )}

      </main>

      {/* ================= MODAL: FULLSCREEN DOCUMENT PREVIEW ================= */}
      {previewPaper && (
        <div className="fixed inset-0 z-50 bg-palette-slate-dark/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-palette-cream-card rounded-2xl border-2 border-palette-slate max-w-4xl w-full max-h-[92vh] flex flex-col overflow-hidden shadow-2xl">
            
            <div className="flex items-center justify-between px-5 py-3 border-b-1.5 border-palette-slate bg-palette-cream">
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs font-bold px-2 py-0.5 rounded bg-palette-coral border border-palette-slate">
                  SET {previewPaper.set_name}
                </span>
                <span className="font-serif font-bold text-sm text-palette-slate-dark">
                  {previewPaper.subject_name} ({previewPaper.course_code})
                </span>
                <span className="text-xs font-mono text-emerald-700 font-semibold hidden sm:inline">
                  • {previewPaper.page_count} Pages Verified
                </span>
              </div>
              <button
                onClick={() => setPreviewPaper(null)}
                className="p-1 rounded-lg hover:bg-palette-slate/10 text-palette-slate cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 flex flex-col items-center bg-palette-slate-subtle/30">
              {previewPaper.preview_images[activePreviewPage] ? (
                <img 
                  src={previewPaper.preview_images[activePreviewPage]} 
                  alt={`Page ${activePreviewPage + 1}`}
                  className="max-w-2xl w-full bg-white shadow-xl rounded border border-palette-slate/40"
                />
              ) : (
                <div className="p-12 text-center text-sm text-palette-slate">
                  Preview render not generated yet. Download DOCX/PDF to view.
                </div>
              )}
            </div>

            {/* Modal Footer with Page Switcher */}
            <div className="flex items-center justify-between px-5 py-3 border-t-1.5 border-palette-slate bg-palette-cream">
              <div className="flex items-center gap-1">
                {[0, 1].map(idx => (
                  <button
                    key={idx}
                    onClick={() => setActivePreviewPage(idx)}
                    className={`text-xs px-3 py-1 rounded-lg font-mono font-bold transition-all ${
                      activePreviewPage === idx 
                        ? 'bg-palette-slate-dark text-white' 
                        : 'bg-palette-cream border border-palette-slate text-palette-slate'
                    }`}
                  >
                    Page {idx + 1}
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-2">
                <a
                  href={previewPaper.docx_url}
                  className="tactile-btn text-xs font-semibold px-3 py-1.5 rounded-xl bg-palette-cream hover:bg-white text-palette-slate-dark border border-palette-slate flex items-center gap-1"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download DOCX</span>
                </a>
                <a
                  href={previewPaper.pdf_url}
                  className="tactile-btn text-xs font-semibold px-3 py-1.5 rounded-xl bg-palette-mint hover:bg-palette-mint-dark text-palette-slate-dark flex items-center gap-1"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download PDF</span>
                </a>
              </div>
            </div>

          </div>
        </div>
      )}

      {/* ================= DRAWER: TARGETED QUESTION EDITOR ================= */}
      {inspectPaper && (
        <div className="fixed inset-0 z-50 bg-palette-slate-dark/60 backdrop-blur-xs flex justify-end">
          <div className="w-full max-w-xl bg-palette-cream-card h-full border-l-2 border-palette-slate flex flex-col shadow-2xl animate-slide-left">
            
            <div className="flex items-center justify-between px-5 py-3.5 border-b-1.5 border-palette-slate bg-palette-cream">
              <div>
                <span className="text-[10px] font-mono uppercase text-palette-slate block">Question Studio</span>
                <h3 className="font-serif font-bold text-base text-palette-slate-dark">
                  {inspectPaper.subject_name} (Set {inspectPaper.set_name})
                </h3>
              </div>
              <button
                onClick={() => {
                  setInspectPaper(null);
                  setEditingQuestion(null);
                }}
                className="p-1 rounded-lg hover:bg-palette-slate/10 text-palette-slate cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              
              {/* Question list for targeted refinement */}
              {['section_a', 'section_b', 'section_c'].map(secKey => {
                const secList: Question[] = (inspectPaper as any)[secKey] || [];
                const secTitle = secKey === 'section_a' ? 'Section A (2 Marks)' : secKey === 'section_b' ? 'Section B (6/7 Marks)' : 'Section C (20 Marks)';
                
                return (
                  <div key={secKey} className="space-y-2">
                    <h4 className="text-xs font-mono font-bold text-palette-slate uppercase tracking-wider">
                      {secTitle}
                    </h4>

                    <div className="space-y-2">
                      {secList.map((q) => (
                        <div 
                          key={q.id}
                          onClick={() => {
                            setEditingQuestion(q);
                            setManualEn(q.en);
                            setManualHi(q.hi || '');
                            setEditInstruction('');
                          }}
                          className={`p-3 rounded-xl border transition-all cursor-pointer ${
                            editingQuestion?.id === q.id 
                              ? 'bg-palette-mint-light/60 border-palette-mint-dark shadow-tactile-sm' 
                              : 'bg-palette-cream/40 border-palette-slate/30 hover:bg-white hover:border-palette-slate'
                          }`}
                        >
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs font-mono font-bold text-palette-slate-dark">
                              Q{q.number}. [{q.marks} Marks]
                            </span>
                            <span className="text-[10px] text-palette-slate flex items-center gap-1">
                              <Edit3 className="w-3 h-3" /> Click to refine
                            </span>
                          </div>

                          <p className="text-xs text-palette-slate-dark font-medium leading-relaxed mb-1">
                            {q.en}
                          </p>
                          {q.hi && (
                            <p className="text-xs text-palette-slate font-serif leading-relaxed">
                              {q.hi}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}

            </div>

            {/* Targeted Edit Form when a question is selected */}
            {editingQuestion && (
              <div className="p-4 border-t-1.5 border-palette-slate bg-palette-cream space-y-3">
                <div className="flex items-center justify-between text-xs font-bold text-palette-slate-dark">
                  <span>Refining Question {editingQuestion.number} ({editingQuestion.marks} Marks)</span>
                  <button 
                    onClick={() => setEditingQuestion(null)}
                    className="text-palette-slate hover:text-palette-slate-dark text-[11px] underline"
                  >
                    Cancel
                  </button>
                </div>

                {/* Natural language instruction input */}
                <div>
                  <label className="text-[11px] font-medium text-palette-slate block mb-1">
                    Direct AI instruction for this question:
                  </label>
                  <input
                    type="text"
                    value={editInstruction}
                    onChange={(e) => setEditInstruction(e.target.value)}
                    placeholder="e.g. Make more analytical, or replace with Parsons question..."
                    className="w-full text-xs p-2.5 rounded-xl border border-palette-slate bg-white focus:outline-none focus:ring-2 focus:ring-palette-coral"
                  />
                </div>

                {/* Quick directives */}
                <div className="flex flex-wrap gap-1">
                  {['Make more analytical', 'Focus on Indian context', 'Improve Hindi translation', 'Make slightly harder'].map((dir, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => setEditInstruction(dir)}
                      className="text-[10px] bg-palette-cream-card hover:bg-palette-ice px-2 py-0.5 rounded border border-palette-slate/40 text-palette-slate-dark font-medium cursor-pointer"
                    >
                      {dir}
                    </button>
                  ))}
                </div>

                <button
                  onClick={handleEditQuestion}
                  disabled={editingLoading}
                  className="tactile-btn w-full py-2 rounded-xl bg-palette-coral hover:bg-palette-coral-hover text-palette-slate-dark font-bold text-xs flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  {editingLoading ? (
                    <>
                      <RotateCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Regenerating Question & Updating Document...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>Apply AI Refinement</span>
                    </>
                  )}
                </button>
              </div>
            )}

          </div>
        </div>
      )}

    </div>
  );
}

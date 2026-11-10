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
  code_missing?: boolean;
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
  has_missing_codes?: boolean;
  missing_codes_count?: number;
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
      colors: ['#F6440E', '#2E2A14', '#777972', '#FAF4F0']
    });
  };

  const handleSaveCourseCode = async (noteId: string, newCode: string) => {
    if (!newCode.trim()) return;
    try {
      const res = await fetch(`/api/notes/${noteId}/update-code`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subject_code: newCode.trim().toUpperCase() })
      });
      if (res.ok) {
        const data = await res.json();
        setSession(data);
      }
    } catch (e) {
      console.error('Error saving course code:', e);
    }
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
    if (session.has_missing_codes) {
      const confirmContinue = confirm(
        `Notice: ${session.missing_codes_count} selected note(s) are missing official course codes.\n\n` +
        'Please enter the codes on the note card(s) or click OK to generate with auto-generated placeholder codes.'
      );
      if (!confirmContinue) return;
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
    <div className="min-h-screen bg-[#FCF9F5] text-[#2E2A14] flex flex-col font-sans selection:bg-[#F6440E]/20 selection:text-[#2E2A14]">
      
      {/* 1. Header Navigation Dock — Framer Tomasfolio Style */}
      <header className="sticky top-0 z-40 bg-[#FCF9F5]/90 backdrop-blur-md border-b border-[rgba(46,42,20,0.1)] px-4 lg:px-8 py-3.5 transition-all">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
          
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-[#2E2A14] flex items-center justify-center text-white shadow-sm">
              <BookOpen className="w-4 h-4 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-semibold text-lg tracking-[-0.03em] text-[#2E2A14]">
                  Exam Paper Studio
                </span>
                <span className="text-[10px] font-mono uppercase tracking-wider bg-[rgba(46,42,20,0.06)] text-[#777972] px-2 py-0.5 rounded-full border border-[rgba(46,42,20,0.12)] font-semibold">
                  v2.5
                </span>
              </div>
              <p className="text-xs text-[#777972] font-normal hidden sm:block">
                Academic Document Automation & Layout Engine
              </p>
            </div>
          </div>

          {/* Tab Switcher & Actions */}
          <div className="flex items-center gap-2 sm:gap-3">
            
            {/* Top Workspace Tabs — Framer Pill Style */}
            <div className="flex items-center bg-[rgba(46,42,20,0.04)] rounded-full border border-[rgba(46,42,20,0.1)] p-0.5">
              <button
                onClick={() => setActiveTab('studio')}
                className={`flex items-center gap-1.5 text-xs font-semibold px-3.5 py-1.5 rounded-full transition-all cursor-pointer ${
                  activeTab === 'studio' 
                    ? 'bg-[#2E2A14] text-white shadow-sm' 
                    : 'text-[#777972] hover:text-[#2E2A14]'
                }`}
              >
                <Layers className="w-3.5 h-3.5" />
                <span>Active Studio</span>
                {activeNotesCount > 0 && (
                  <span className={`ml-1 text-[10px] font-mono px-1.5 py-0.2 rounded-full font-bold ${
                    activeTab === 'studio' ? 'bg-[#F6440E] text-white' : 'bg-[rgba(46,42,20,0.1)] text-[#2E2A14]'
                  }`}>
                    {activeNotesCount}
                  </span>
                )}
              </button>

              <button
                onClick={() => setActiveTab('history')}
                className={`flex items-center gap-1.5 text-xs font-semibold px-3.5 py-1.5 rounded-full transition-all cursor-pointer ${
                  activeTab === 'history' 
                    ? 'bg-[#2E2A14] text-white shadow-sm' 
                    : 'text-[#777972] hover:text-[#2E2A14]'
                }`}
              >
                <History className="w-3.5 h-3.5" />
                <span>Previous Generations</span>
                {history.length > 0 && (
                  <span className={`ml-1 text-[10px] font-mono px-1.5 py-0.2 rounded-full font-bold ${
                    activeTab === 'history' ? 'bg-[#F6440E] text-white' : 'bg-[rgba(46,42,20,0.1)] text-[#2E2A14]'
                  }`}>
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
              className="tomas-btn-secondary text-xs px-3 py-1.5 rounded-full hidden md:flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              <RotateCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              <span>Load Sample</span>
            </button>

            {/* Reset Workspace */}
            <button
              onClick={handleResetWorkspace}
              title="Clears the current active workspace"
              className="tomas-btn-secondary text-xs px-3 py-1.5 rounded-full hover:text-[#F6440E] hover:border-[#F6440E]/40 flex items-center gap-1.5 cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Start Fresh</span>
            </button>

            {/* Download Zip */}
            {papers.length > 0 && (
              <a
                href="/api/download-all"
                onClick={triggerConfetti}
                className="tomas-btn-primary text-xs px-4 py-1.5 rounded-full flex items-center gap-1.5 cursor-pointer"
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
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 lg:px-8 py-8 space-y-8">

        {/* ================= TAB 1: ACTIVE STUDIO ================= */}
        {activeTab === 'studio' && (
          <>
            {/* Minimal Punchy Hero — Editorial Two-Tone Statement */}
            <div className="text-center max-w-3xl mx-auto space-y-3 pt-2 pb-2">
              <h1 className="text-3xl sm:text-5xl font-semibold text-[#2E2A14] tracking-[-0.035em] leading-[1.05]">
                Your exam papers, <span className="text-[#F6440E]">ready in minutes.</span>
              </h1>
              <p className="text-xs sm:text-sm text-[#777972] max-w-xl mx-auto leading-relaxed">
                Upload notes and guidelines. Select which files to include. Generate official Word & PDF papers with strict 2-page verification.
              </p>
            </div>

            {/* 3-Zone Bento Grid — Tomasfolio Refined Cards */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              
              {/* Zone 1: Active Notes & Selection */}
              <div className="tomas-card p-6 flex flex-col justify-between space-y-5">
                <div>
                  <div className="flex items-center justify-between mb-2.5">
                    <div className="flex items-center gap-2.5">
                      <div className="w-7 h-7 rounded-full bg-[#2E2A14] text-white flex items-center justify-center font-mono text-xs font-semibold">
                        1
                      </div>
                      <h3 className="font-semibold text-lg tracking-[-0.02em] text-[#2E2A14]">
                        Notes & Syllabus
                      </h3>
                    </div>

                    {/* Selection Controls */}
                    {totalNotesCount > 0 && (
                      <div className="flex items-center gap-2 text-[11px]">
                        <button
                          onClick={() => handleSelectAllNotes(true)}
                          className="text-[#777972] hover:text-[#2E2A14] font-medium transition-colors cursor-pointer"
                        >
                          All
                        </button>
                        <span className="text-[rgba(46,42,20,0.2)]">/</span>
                        <button
                          onClick={() => handleSelectAllNotes(false)}
                          className="text-[#777972] hover:text-[#2E2A14] font-medium transition-colors cursor-pointer"
                        >
                          None
                        </button>
                        <span className="text-[rgba(46,42,20,0.2)]">/</span>
                        <button
                          onClick={handleClearAllNotes}
                          className="text-[#777972] hover:text-[#F6440E] font-medium transition-colors cursor-pointer"
                          title="Remove all uploaded notes"
                        >
                          Clear
                        </button>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center justify-between mb-3.5 text-xs">
                    <span className="text-[#777972]">
                      {activeNotesCount} of {totalNotesCount} notes selected for generation
                    </span>
                    {totalNotesCount > 0 && (
                      <span className="font-mono text-[10px] bg-[rgba(46,42,20,0.06)] text-[#2E2A14] px-2 py-0.5 rounded-full font-semibold border border-[rgba(46,42,20,0.1)]">
                        {activeNotesCount > 0 ? 'READY' : 'SELECT NOTES'}
                      </span>
                    )}
                  </div>

                  {/* Upload Dropzone */}
                  <label className="border border-dashed border-[rgba(46,42,20,0.2)] hover:border-[#F6440E] rounded-xl p-4 flex flex-col items-center justify-center text-center cursor-pointer transition-all bg-[rgba(46,42,20,0.015)] hover:bg-[rgba(246,68,14,0.02)] mb-4">
                    <Upload className="w-5 h-5 text-[#777972] mb-1.5" />
                    <span className="text-xs font-semibold text-[#2E2A14]">Upload notes (PDF/DOCX)</span>
                    <span className="text-[10px] text-[#777972] mt-0.5">Recently uploaded appears on top</span>
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
                          className={`p-3 rounded-xl border transition-all flex items-start justify-between gap-3 ${
                            n.selected 
                              ? 'bg-[#FAF4F0]/80 border-[rgba(46,42,20,0.2)] shadow-xs' 
                              : 'bg-white border-[rgba(46,42,20,0.08)] opacity-60'
                          }`}
                        >
                          <div className="flex items-start gap-2.5 flex-1 min-w-0">
                            {/* Checkbox */}
                            <button
                              type="button"
                              onClick={() => handleToggleNote(n.id, n.selected)}
                              className="mt-0.5 text-[#2E2A14] cursor-pointer shrink-0"
                            >
                              {n.selected ? (
                                <CheckSquare className="w-4 h-4 text-[#F6440E]" />
                              ) : (
                                <Square className="w-4 h-4 text-[#777972]" />
                              )}
                            </button>

                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1.5 mb-1">
                                <span className="font-semibold text-xs text-[#2E2A14] truncate block max-w-[150px]" title={n.file_name}>
                                  {n.file_name}
                                </span>
                                {i === 0 && (
                                  <span className="text-[9px] font-mono uppercase bg-[#F6440E] text-white px-1.5 py-0.2 rounded font-bold">
                                    NEW
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-2 text-[10px] text-[#777972] font-medium mb-1.5">
                                <span className="font-mono bg-[rgba(46,42,20,0.05)] text-[#2E2A14] px-1.5 py-0.5 rounded border border-[rgba(46,42,20,0.1)]">
                                  {n.program_name} • Sem {n.semester}
                                </span>
                                <span>{n.total_pages}p</span>
                              </div>

                              {/* Course Code Input / Missing Warning */}
                              {n.code_missing || !n.subject_code ? (
                                <div className="mt-1.5 flex items-center gap-1.5 p-1.5 bg-[#FFF6ED] rounded-lg border border-[#F6440E]/30">
                                  <span className="text-[10px] font-mono font-bold text-[#F6440E]">
                                    ⚠️ Code:
                                  </span>
                                  <input
                                    type="text"
                                    placeholder="Enter Code (e.g. BC101)"
                                    defaultValue=""
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter') {
                                        handleSaveCourseCode(n.id, (e.target as HTMLInputElement).value);
                                      }
                                    }}
                                    onBlur={(e) => {
                                      if (e.target.value.trim()) {
                                        handleSaveCourseCode(n.id, e.target.value);
                                      }
                                    }}
                                    className="w-full text-[10px] font-mono font-bold uppercase px-2 py-0.5 bg-white border border-[#F6440E]/40 rounded focus:outline-none focus:border-[#F6440E]"
                                  />
                                </div>
                              ) : (
                                <div className="mt-1 flex items-center gap-1.5 text-[10px] font-mono">
                                  <span className="text-[#777972]">Code:</span>
                                  <input
                                    type="text"
                                    defaultValue={n.subject_code}
                                    onBlur={(e) => {
                                      if (e.target.value.trim() && e.target.value.trim() !== n.subject_code) {
                                        handleSaveCourseCode(n.id, e.target.value);
                                      }
                                    }}
                                    className="w-24 text-[10px] font-mono font-bold uppercase px-1.5 py-0.5 bg-white border border-[rgba(46,42,20,0.15)] focus:border-[#2E2A14] rounded"
                                    title="Click to edit course code"
                                  />
                                </div>
                              )}
                            </div>
                          </div>

                          {/* Delete Action */}
                          <button
                            type="button"
                            onClick={() => handleDeleteNote(n.id)}
                            className="text-[#777972] hover:text-[#F6440E] p-1 rounded transition-colors cursor-pointer shrink-0"
                            title="Remove file"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-6 text-xs text-[#777972] bg-[rgba(46,42,20,0.02)] rounded-xl border border-dashed border-[rgba(46,42,20,0.15)]">
                      No notes uploaded yet. Drop notes above or click "Load Sample".
                    </div>
                  )}

                </div>
              </div>

              {/* Zone 2: Active Exam Guidelines */}
              <div className="tomas-card p-6 flex flex-col justify-between space-y-5">
                <div>
                  <div className="flex items-center justify-between mb-2.5">
                    <div className="flex items-center gap-2.5">
                      <div className="w-7 h-7 rounded-full bg-[#2E2A14] text-white flex items-center justify-center font-mono text-xs font-semibold">
                        2
                      </div>
                      <h3 className="font-semibold text-lg tracking-[-0.02em] text-[#2E2A14]">
                        Exam Guidelines in Use
                      </h3>
                    </div>
                    <span className="text-[10px] font-mono uppercase tracking-wider text-[#777972] bg-[rgba(46,42,20,0.06)] px-2 py-0.5 rounded-full border border-[rgba(46,42,20,0.1)]">
                      Active Rules
                    </span>
                  </div>

                  <p className="text-xs text-[#777972] mb-3.5 leading-relaxed">
                    University marking format, bilingual translation, and Word template specifications.
                  </p>

                  {/* Prominent Guidelines Summary Card */}
                  {session?.guidelines ? (
                    <div className="bg-[#FAF4F0]/80 rounded-xl p-4 border border-[rgba(46,42,20,0.14)] space-y-3">
                      
                      <div className="flex items-center justify-between pb-2.5 border-b border-[rgba(46,42,20,0.1)]">
                        <div>
                          <span className="text-[10px] font-mono uppercase tracking-wider text-[#777972] block">
                            Document Template
                          </span>
                          <span className="text-xs font-bold text-[#2E2A14] flex items-center gap-1.5 mt-0.5">
                            <FileText className="w-3.5 h-3.5 text-[#F6440E]" />
                            {session.guidelines.template_name}
                          </span>
                        </div>
                        <span className="text-xs font-mono font-bold bg-[#2E2A14] text-white px-2.5 py-0.5 rounded-full">
                          {session.guidelines.marks_format} Marks
                        </span>
                      </div>

                      {/* Constraints Grid */}
                      <div className="grid grid-cols-2 gap-2.5 text-[11px]">
                        <div className="bg-white p-2.5 rounded-lg border border-[rgba(46,42,20,0.1)]">
                          <span className="text-[#777972] block text-[10px]">Difference Rule</span>
                          <span className="font-semibold text-[#2E2A14]">≥75% Difference</span>
                          <span className="text-[9px] text-[#777972] block mt-0.5">≤25% common questions</span>
                        </div>
                        <div className="bg-white p-2.5 rounded-lg border border-[rgba(46,42,20,0.1)]">
                          <span className="text-[#777972] block text-[10px]">Page Limit</span>
                          <span className="font-semibold text-[#2E2A14]">Strictly 2 Pages</span>
                          <span className="text-[9px] text-[#777972] block mt-0.5">Verified on PDF</span>
                        </div>
                      </div>

                      {/* Section Structure Chips */}
                      <div className="space-y-1.5 pt-1">
                        <span className="text-[10px] font-mono text-[#777972] uppercase tracking-wider block">
                          Sections Breakdown
                        </span>
                        <div className="space-y-1">
                          {session.guidelines.sections.map((sec, i) => (
                            <div key={i} className="flex items-center justify-between text-[11px] bg-white px-2.5 py-1.5 rounded-lg border border-[rgba(46,42,20,0.08)] font-medium">
                              <span className="text-[#2E2A14]">Sec {sec.section}: {sec.label}</span>
                              <span className="font-mono text-[10px] text-[#777972]">
                                {sec.questions} Qs (Att. {sec.attempt}) = {sec.total_marks}m
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>

                    </div>
                  ) : (
                    <div className="p-4 bg-[rgba(46,42,20,0.02)] rounded-xl border border-[rgba(46,42,20,0.1)] text-xs text-[#777972]">
                      Standard 70-Mark University Format active.
                    </div>
                  )}

                  {/* Upload Custom Guidelines */}
                  <div className="pt-2.5">
                    <label className="text-[11px] font-medium text-[#777972] hover:text-[#F6440E] flex items-center gap-1.5 cursor-pointer underline transition-colors">
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
              <div className="tomas-card p-6 flex flex-col justify-between space-y-5">
                <div>
                  <div className="flex items-center justify-between mb-2.5">
                    <div className="flex items-center gap-2.5">
                      <div className="w-7 h-7 rounded-full bg-[#F6440E] text-white flex items-center justify-center font-mono text-xs font-semibold">
                        3
                      </div>
                      <h3 className="font-semibold text-lg tracking-[-0.02em] text-[#2E2A14]">
                        Specific Instructions
                      </h3>
                    </div>
                    <span className="text-[10px] font-mono uppercase tracking-wider text-[#777972] bg-[rgba(46,42,20,0.06)] px-2 py-0.5 rounded-full border border-[rgba(46,42,20,0.1)]">
                      Optional
                    </span>
                  </div>

                  <p className="text-xs text-[#777972] mb-2.5 leading-relaxed">
                    Direct the model to prioritize specific units, course codes, or focus areas.
                  </p>

                  {/* Explicit Scope Filter */}
                  <div className="flex items-center justify-between text-[11px] mb-2.5 bg-[#FAF4F0] px-3 py-1.5 rounded-xl border border-[rgba(46,42,20,0.1)]">
                    <span className="font-semibold text-[#2E2A14]">Target Subject:</span>
                    <select
                      onChange={(e) => {
                        const val = e.target.value;
                        if (val === 'ALL') {
                          setPromptText('Generate Set A and Set B for all selected notes.');
                        } else {
                          setPromptText(`Only generate examination papers for ${val}. Exclude all other notes from this run.`);
                        }
                      }}
                      className="text-[10px] font-mono bg-white border border-[rgba(46,42,20,0.15)] rounded-lg px-2 py-0.5 max-w-[170px] truncate text-[#2E2A14] focus:outline-none focus:border-[#2E2A14]"
                    >
                      <option value="ALL">All Selected Notes ({activeNotesCount})</option>
                      {session?.notes?.filter(n => n.selected).map(n => (
                        <option key={n.id} value={n.subject_code ? `${n.subject_code} (${n.subject_name})` : n.subject_name}>
                          Only: {n.subject_code ? `${n.subject_code} - ` : ''}{n.subject_name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <textarea
                    value={promptText}
                    onChange={(e) => setPromptText(e.target.value)}
                    rows={3}
                    className="w-full text-xs p-3 rounded-xl border border-[rgba(46,42,20,0.15)] bg-white focus:outline-none focus:border-[#2E2A14] focus:ring-1 focus:ring-[#2E2A14] resize-none mb-2.5 text-[#2E2A14] placeholder-[#777972]/60"
                    placeholder="e.g. Only generate for course code BC101... or Focus questions on Units 1 and 2..."
                  />

                  {/* Explicit Default Prompt Presets — Tomasfolio Pill Buttons */}
                  <div className="space-y-1.5 mb-4">
                    <span className="text-[10px] font-mono text-[#777972] block uppercase tracking-wider">Quick Presets:</span>
                    <div className="flex flex-wrap gap-1.5">
                      <button
                        type="button"
                        onClick={() => {
                          const firstCode = session?.notes?.find(n => n.selected && n.subject_code)?.subject_code || 'BC101';
                          setPromptText(`Only generate examination papers for course code: ${firstCode}. Ignore all other subjects.`);
                        }}
                        className="tomas-pill text-[10px] font-medium px-2.5 py-1 cursor-pointer"
                      >
                        🎯 Only Specific Code
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const firstSubj = session?.notes?.find(n => n.selected)?.subject_name || 'Business Law';
                          setPromptText(`Only prepare Set A and Set B for subject: ${firstSubj}.`);
                        }}
                        className="tomas-pill text-[10px] font-medium px-2.5 py-1 cursor-pointer"
                      >
                        🎯 Specific Subject
                      </button>
                      <button
                        type="button"
                        onClick={() => setPromptText('Focus all questions in Section A, B, and C strictly on Units 1 and 2.')}
                        className="tomas-pill text-[10px] font-medium px-2.5 py-1 cursor-pointer"
                      >
                        🎯 Units 1 & 2 Only
                      </button>
                      <button
                        type="button"
                        onClick={() => setPromptText('Ensure 75% difference between Set A and Set B. Verify Devanagari Hindi translations.')}
                        className="tomas-pill text-[10px] font-medium px-2.5 py-1 cursor-pointer"
                      >
                        Strict 75% Difference
                      </button>
                    </div>
                  </div>

                </div>

                {/* Primary Action Button — Electric Tomasfolio Accent */}
                <button
                  onClick={handleGenerate}
                  disabled={generating || activeNotesCount === 0}
                  className={`w-full py-3.5 px-4 rounded-xl font-semibold text-xs sm:text-sm flex items-center justify-center gap-2 transition-all cursor-pointer ${
                    activeNotesCount > 0 
                      ? 'tomas-btn-primary shadow-sm' 
                      : 'bg-[rgba(46,42,20,0.08)] text-[#777972] cursor-not-allowed border border-[rgba(46,42,20,0.1)]'
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
              <div className="tomas-card p-4 space-y-2.5 animate-fade-in">
                <div className="flex items-center justify-between text-xs font-semibold">
                  <span className="flex items-center gap-2 text-[#2E2A14]">
                    <RotateCw className="w-4 h-4 animate-spin text-[#F6440E]" />
                    {progress.message || 'Processing syllabus & guidelines...'}
                  </span>
                  <span className="font-mono text-xs text-[#2E2A14]">{progress.percent}%</span>
                </div>
                <div className="w-full bg-[rgba(46,42,20,0.06)] rounded-full h-2 overflow-hidden border border-[rgba(46,42,20,0.1)]">
                  <div 
                    className="bg-[#F6440E] h-full transition-all duration-300"
                    style={{ width: `${progress.percent}%` }}
                  ></div>
                </div>
              </div>
            )}

            {/* Generated Papers Gallery (Current Active Batch) */}
            <section className="space-y-5 pt-2">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-[rgba(46,42,20,0.1)] pb-3.5">
                <div>
                  <h2 className="font-semibold text-xl sm:text-2xl text-[#2E2A14] tracking-[-0.03em]">
                    Active Examination Papers ({papers.length})
                  </h2>
                  <p className="text-xs text-[#777972] mt-0.5">
                    Strictly 2-page verified documents ready for direct download or targeted editing.
                  </p>
                </div>

                {/* Filter Pills */}
                {papers.length > 0 && (
                  <div className="flex flex-wrap items-center gap-2.5">
                    <div className="flex items-center bg-[rgba(46,42,20,0.04)] rounded-full border border-[rgba(46,42,20,0.1)] p-0.5">
                      {(['ALL', 'A', 'B'] as const).map(set => (
                        <button
                          key={set}
                          onClick={() => setFilterSet(set)}
                          className={`text-xs px-3 py-1 rounded-full font-semibold transition-all cursor-pointer ${
                            filterSet === set 
                              ? 'bg-[#2E2A14] text-white shadow-xs' 
                              : 'text-[#777972] hover:text-[#2E2A14]'
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
                        className="text-xs py-1 px-3 rounded-full border border-[rgba(46,42,20,0.15)] bg-white font-medium text-[#2E2A14] focus:outline-none focus:border-[#2E2A14]"
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
                <div className="tomas-card p-12 text-center space-y-2.5">
                  <BookOpen className="w-8 h-8 text-[#777972] mx-auto opacity-30" />
                  <h3 className="font-semibold text-base text-[#2E2A14]">
                    {papers.length === 0 ? 'No papers generated in this active session' : 'No papers match your filter'}
                  </h3>
                  <p className="text-xs text-[#777972] max-w-md mx-auto leading-relaxed">
                    {papers.length === 0 
                      ? 'Upload your notes and click "Create Papers", or click "Load Sample" to see the verified MA Sociology papers.' 
                      : 'Adjust your set or subject filter above to view papers.'}
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {filteredPapers.map(paper => (
                    <div 
                      key={paper.id}
                      className="tomas-card p-5 flex flex-col justify-between space-y-4 relative overflow-hidden group"
                    >
                      {/* Top Badges */}
                      <div className="flex items-start justify-between gap-3">
                        <div className="space-y-1">
                          <div className="flex items-center gap-1.5">
                            <span className={`text-xs font-mono font-bold px-2.5 py-0.5 rounded-full ${
                              paper.set_name === 'A' ? 'bg-[#2E2A14] text-white' : 'bg-[#F6440E] text-white'
                            }`}>
                              SET {paper.set_name}
                            </span>
                            <span className="text-xs font-mono font-semibold text-[#777972] bg-[rgba(46,42,20,0.05)] px-2 py-0.5 rounded-full border border-[rgba(46,42,20,0.1)]">
                              {paper.course_code}
                            </span>
                          </div>
                          <h3 className="font-semibold text-base text-[#2E2A14] leading-snug pt-0.5">
                            {paper.subject_name}
                          </h3>
                          <p className="text-[11px] text-[#777972] font-medium">
                            {paper.program_name} • Semester {paper.semester}
                          </p>
                        </div>

                        <div className="flex flex-col items-end gap-1.5">
                          <span className="text-xs font-mono font-bold bg-[#FAF4F0] border border-[rgba(46,42,20,0.15)] px-2.5 py-0.5 rounded-full text-[#2E2A14]">
                            {paper.max_marks} Marks
                          </span>
                          <span className="text-[10px] font-mono text-[#2E2A14] bg-[#FAF4F0] px-2 py-0.5 rounded-full border border-[rgba(46,42,20,0.12)] font-semibold flex items-center gap-1">
                            <Check className="w-3 h-3 text-[#F6440E]" /> {paper.page_count} Pages Strict
                          </span>
                        </div>
                      </div>

                      {/* Interactive Page Thumbnail Preview */}
                      <div className="bg-[#FAF4F0] rounded-xl p-3 border border-[rgba(46,42,20,0.1)] space-y-2">
                        <div className="flex items-center justify-between text-[11px] text-[#777972] font-medium">
                          <span>Document Preview</span>
                          <span className="text-[#2E2A14] font-semibold text-[10px]">
                            Overlap with partner: {paper.overlap_with_partner ? `${paper.overlap_with_partner.toFixed(1)}%` : '≤15%'}
                          </span>
                        </div>

                        <div className="grid grid-cols-2 gap-2.5">
                          {[0, 1].map(pageIdx => {
                            const imgUrl = paper.preview_images[pageIdx];
                            return (
                              <div
                                key={pageIdx}
                                onClick={() => {
                                  setPreviewPaper(paper);
                                  setActivePreviewPage(pageIdx);
                                }}
                                className="aspect-[1/1.41] bg-white rounded-lg border border-[rgba(46,42,20,0.15)] overflow-hidden relative group/page cursor-pointer shadow-xs hover:border-[#F6440E] transition-all"
                              >
                                {imgUrl ? (
                                  <img 
                                    src={imgUrl} 
                                    alt={`Page ${pageIdx + 1}`}
                                    className="w-full h-full object-cover object-top"
                                    loading="lazy"
                                  />
                                ) : (
                                  <div className="w-full h-full flex flex-col items-center justify-center p-2 text-center bg-white">
                                    <FileText className="w-5 h-5 text-[#777972]/40 mb-1" />
                                    <span className="text-[9px] font-mono text-[#777972]">Page {pageIdx + 1}</span>
                                  </div>
                                )}
                                <div className="absolute inset-0 bg-[#2E2A14]/75 opacity-0 group-hover/page:opacity-100 flex items-center justify-center transition-opacity text-white text-xs font-semibold gap-1">
                                  <Eye className="w-3.5 h-3.5 text-[#F6440E]" />
                                  <span>View Page {pageIdx + 1}</span>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      {/* Paper Actions */}
                      <div className="flex items-center justify-between gap-2 pt-1 border-t border-[rgba(46,42,20,0.1)]">
                        <button
                          onClick={() => setInspectPaper(paper)}
                          className="tomas-btn-secondary text-xs px-3 py-1.5 rounded-lg flex items-center gap-1.5 cursor-pointer"
                        >
                          <Edit3 className="w-3.5 h-3.5 text-[#F6440E]" />
                          <span>Refine Questions</span>
                        </button>

                        <div className="flex items-center gap-2">
                          <a
                            href={paper.docx_url}
                            className="tomas-btn-secondary text-xs px-3 py-1.5 rounded-lg flex items-center gap-1 cursor-pointer"
                            title="Download official Word document"
                          >
                            <Download className="w-3.5 h-3.5" />
                            <span>DOCX</span>
                          </a>

                          <a
                            href={paper.pdf_url}
                            className="tomas-btn-primary text-xs px-3 py-1.5 rounded-lg flex items-center gap-1 cursor-pointer"
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
              <h2 className="font-semibold text-2xl text-[#2E2A14] tracking-[-0.03em]">
                Previous Generations Archive
              </h2>
              <p className="text-xs text-[#777972] mt-0.5">
                All generated examination paper batches are stored here. When you start fresh, this archive remains intact.
              </p>
            </div>

            {history.length === 0 ? (
              <div className="tomas-card p-14 text-center space-y-2.5">
                <History className="w-8 h-8 text-[#777972] mx-auto opacity-30" />
                <h3 className="font-semibold text-lg text-[#2E2A14]">No generation batches in archive</h3>
                <p className="text-xs text-[#777972]">Generate papers or click "Load Sample" to populate the archive.</p>
              </div>
            ) : (
              <div className="space-y-6">
                {history.map((batch) => (
                  <div 
                    key={batch.batch_id}
                    className="tomas-card p-6 space-y-5"
                  >
                    {/* Batch Header */}
                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-3.5 border-b border-[rgba(46,42,20,0.1)]">
                      <div>
                        <div className="flex items-center gap-2 mb-1.5">
                          <span className="text-xs font-mono font-bold bg-[#FAF4F0] text-[#2E2A14] px-2.5 py-0.5 rounded-full border border-[rgba(46,42,20,0.15)]">
                            {batch.timestamp}
                          </span>
                          <span className="text-xs font-mono font-semibold text-[#2E2A14] bg-[rgba(46,42,20,0.06)] px-2.5 py-0.5 rounded-full border border-[rgba(46,42,20,0.1)]">
                            {batch.total_papers || batch.papers.length} Papers
                          </span>
                        </div>
                        <p className="text-xs text-[#777972] font-medium">
                          {batch.instruction}
                        </p>
                      </div>

                      <a
                        href="/api/download-all"
                        className="tomas-btn-primary text-xs px-3.5 py-1.5 rounded-lg flex items-center gap-1.5 cursor-pointer shrink-0"
                      >
                        <FileArchive className="w-3.5 h-3.5" />
                        <span>Download Batch ZIP</span>
                      </a>
                    </div>

                    {/* Batch Papers Grid */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
                      {batch.papers.map((p) => (
                        <div 
                          key={p.id}
                          className="bg-[#FAF4F0] p-3.5 rounded-xl border border-[rgba(46,42,20,0.12)] space-y-2.5 flex flex-col justify-between"
                        >
                          <div>
                            <div className="flex items-center justify-between text-[11px] font-mono mb-1.5">
                              <span className={`px-2 py-0.2 rounded-full font-bold text-white ${
                                p.set_name === 'A' ? 'bg-[#2E2A14]' : 'bg-[#F6440E]'
                              }`}>
                                SET {p.set_name}
                              </span>
                              <span className="text-[#777972] font-semibold">{p.course_code}</span>
                            </div>
                            <h4 className="text-xs font-semibold text-[#2E2A14] line-clamp-2 leading-snug">
                              {p.subject_name}
                            </h4>
                            <p className="text-[10px] text-[#777972] mt-0.5">
                              {p.program_name} • Sem {p.semester}
                            </p>
                          </div>

                          <div className="flex items-center justify-between gap-1 pt-2 border-t border-[rgba(46,42,20,0.1)]">
                            <span className="text-[10px] font-mono text-[#2E2A14] font-semibold">
                              {p.page_count} Pages
                            </span>
                            <div className="flex items-center gap-1.5">
                              <a
                                href={p.docx_url}
                                className="text-[10px] font-bold px-2 py-0.5 bg-white hover:bg-[#2E2A14] hover:text-white rounded border border-[rgba(46,42,20,0.15)] text-[#2E2A14] transition-colors"
                                title="Download DOCX"
                              >
                                DOCX
                              </a>
                              <a
                                href={p.pdf_url}
                                className="text-[10px] font-bold px-2 py-0.5 bg-[#2E2A14] text-white hover:bg-[#F6440E] rounded transition-colors"
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
        <div className="fixed inset-0 z-50 bg-[#2E2A14]/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#FCF9F5] rounded-2xl border border-[rgba(46,42,20,0.2)] max-w-4xl w-full max-h-[92vh] flex flex-col overflow-hidden shadow-tomas-modal">
            
            <div className="flex items-center justify-between px-6 py-3.5 border-b border-[rgba(46,42,20,0.1)] bg-white">
              <div className="flex items-center gap-2.5">
                <span className="font-mono text-xs font-bold px-2.5 py-0.5 rounded-full bg-[#2E2A14] text-white">
                  SET {previewPaper.set_name}
                </span>
                <span className="font-semibold text-sm text-[#2E2A14]">
                  {previewPaper.subject_name} ({previewPaper.course_code})
                </span>
                <span className="text-xs font-mono text-[#777972] font-semibold hidden sm:inline">
                  • {previewPaper.page_count} Pages Verified
                </span>
              </div>
              <button
                onClick={() => setPreviewPaper(null)}
                className="p-1 rounded-lg hover:bg-[rgba(46,42,20,0.06)] text-[#777972] hover:text-[#2E2A14] cursor-pointer transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-5 flex flex-col items-center bg-[#FAF4F0]">
              {previewPaper.preview_images[activePreviewPage] ? (
                <img 
                  src={previewPaper.preview_images[activePreviewPage]} 
                  alt={`Page ${activePreviewPage + 1}`}
                  className="max-w-2xl w-full bg-white shadow-xl rounded-lg border border-[rgba(46,42,20,0.15)]"
                />
              ) : (
                <div className="p-12 text-center text-sm text-[#777972]">
                  Preview render not generated yet. Download DOCX/PDF to view.
                </div>
              )}
            </div>

            {/* Modal Footer with Page Switcher */}
            <div className="flex items-center justify-between px-6 py-3.5 border-t border-[rgba(46,42,20,0.1)] bg-white">
              <div className="flex items-center gap-1.5">
                {[0, 1].map(idx => (
                  <button
                    key={idx}
                    onClick={() => setActivePreviewPage(idx)}
                    className={`text-xs px-3.5 py-1 rounded-full font-mono font-bold transition-all cursor-pointer ${
                      activePreviewPage === idx 
                        ? 'bg-[#2E2A14] text-white' 
                        : 'bg-[#FAF4F0] border border-[rgba(46,42,20,0.14)] text-[#777972] hover:text-[#2E2A14]'
                    }`}
                  >
                    Page {idx + 1}
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-2">
                <a
                  href={previewPaper.docx_url}
                  className="tomas-btn-secondary text-xs px-3.5 py-1.5 rounded-lg flex items-center gap-1"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download DOCX</span>
                </a>
                <a
                  href={previewPaper.pdf_url}
                  className="tomas-btn-primary text-xs px-3.5 py-1.5 rounded-lg flex items-center gap-1"
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
        <div className="fixed inset-0 z-50 bg-[#2E2A14]/60 backdrop-blur-xs flex justify-end">
          <div className="w-full max-w-xl bg-white h-full border-l border-[rgba(46,42,20,0.2)] flex flex-col shadow-2xl animate-slide-left">
            
            <div className="flex items-center justify-between px-6 py-4 border-b border-[rgba(46,42,20,0.1)] bg-[#FCF9F5]">
              <div>
                <span className="text-[10px] font-mono uppercase text-[#777972] block tracking-wider">Question Studio</span>
                <h3 className="font-semibold text-base text-[#2E2A14]">
                  {inspectPaper.subject_name} (Set {inspectPaper.set_name})
                </h3>
              </div>
              <button
                onClick={() => {
                  setInspectPaper(null);
                  setEditingQuestion(null);
                }}
                className="p-1 rounded-lg hover:bg-[rgba(46,42,20,0.06)] text-[#777972] hover:text-[#2E2A14] cursor-pointer transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-5">
              
              {/* Question list for targeted refinement */}
              {['section_a', 'section_b', 'section_c'].map(secKey => {
                const secList: Question[] = (inspectPaper as any)[secKey] || [];
                const secTitle = secKey === 'section_a' ? 'Section A (2 Marks)' : secKey === 'section_b' ? 'Section B (6/7 Marks)' : 'Section C (20 Marks)';
                
                return (
                  <div key={secKey} className="space-y-2.5">
                    <h4 className="text-xs font-mono font-bold text-[#777972] uppercase tracking-wider">
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
                          className={`p-3.5 rounded-xl border transition-all cursor-pointer ${
                            editingQuestion?.id === q.id 
                              ? 'bg-[#FAF4F0] border-[#F6440E] shadow-sm' 
                              : 'bg-white border-[rgba(46,42,20,0.1)] hover:border-[rgba(46,42,20,0.25)]'
                          }`}
                        >
                          <div className="flex items-center justify-between mb-1.5">
                            <span className="text-xs font-mono font-bold text-[#2E2A14]">
                              Q{q.number}. [{q.marks} Marks]
                            </span>
                            <span className="text-[10px] text-[#777972] flex items-center gap-1">
                              <Edit3 className="w-3 h-3 text-[#F6440E]" /> Click to refine
                            </span>
                          </div>

                          <p className="text-xs text-[#2E2A14] font-medium leading-relaxed mb-1">
                            {q.en}
                          </p>
                          {q.hi && (
                            <p className="text-xs text-[#777972] leading-relaxed">
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
              <div className="p-5 border-t border-[rgba(46,42,20,0.1)] bg-[#FCF9F5] space-y-3.5">
                <div className="flex items-center justify-between text-xs font-bold text-[#2E2A14]">
                  <span>Refining Question {editingQuestion.number} ({editingQuestion.marks} Marks)</span>
                  <button 
                    onClick={() => setEditingQuestion(null)}
                    className="text-[#777972] hover:text-[#2E2A14] text-[11px] underline cursor-pointer"
                  >
                    Cancel
                  </button>
                </div>

                {/* Natural language instruction input */}
                <div>
                  <label className="text-[11px] font-medium text-[#777972] block mb-1">
                    Direct AI instruction for this question:
                  </label>
                  <input
                    type="text"
                    value={editInstruction}
                    onChange={(e) => setEditInstruction(e.target.value)}
                    placeholder="e.g. Make more analytical, or replace with Parsons question..."
                    className="w-full text-xs p-3 rounded-xl border border-[rgba(46,42,20,0.18)] bg-white focus:outline-none focus:border-[#2E2A14] text-[#2E2A14]"
                  />
                </div>

                {/* Quick directives */}
                <div className="flex flex-wrap gap-1.5">
                  {['Make more analytical', 'Focus on Indian context', 'Improve Hindi translation', 'Make slightly harder'].map((dir, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => setEditInstruction(dir)}
                      className="tomas-pill text-[10px] px-2.5 py-1 text-[#2E2A14] font-medium cursor-pointer"
                    >
                      {dir}
                    </button>
                  ))}
                </div>

                <button
                  onClick={handleEditQuestion}
                  disabled={editingLoading}
                  className="tomas-btn-primary w-full py-2.5 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
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

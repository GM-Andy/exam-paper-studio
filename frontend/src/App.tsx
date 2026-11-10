import { useState, useEffect } from 'react';
import { 
  FileText, Upload, Download, Eye, Sparkles, 
  RotateCw, Edit3, BookOpen, FileArchive, X,
  Check, ShieldCheck, Zap
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
  preview_images: string[];
  section_a: Question[];
  section_b: Question[];
  section_c: Question[];
}

interface SessionState {
  authenticated: boolean;
  notes: Array<{ file_name: string; total_pages: number; units: string[] }>;
  guidelines: any;
  subjects: Array<{ code: string; name: string }>;
  interpretation: string;
  marks_format: number;
  is_bilingual: boolean;
  total_papers_generated: number;
}

export default function App() {
  const [session, setSession] = useState<SessionState | null>(null);
  const [papers, setPapers] = useState<ExamPaper[]>([]);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [progress, setProgress] = useState<{ percent: number; stage: string; message: string }>({
    percent: 0,
    stage: 'idle',
    message: ''
  });
  const [promptText, setPromptText] = useState(
    'Prepare Set A and Set B for all four MA Sociology subjects, in English and Hindi, following the university guidelines.'
  );
  
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

  // Fetch initial session and papers
  useEffect(() => {
    fetchSession();
    fetchPapers();
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
    setGenerating(true);
    setProgress({ percent: 5, stage: 'starting', message: 'Analyzing notes and formatting guidelines...' });
    try {
      await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          instruction: promptText,
          marks_format: 70,
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
        // Update local paper state
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

  // Filter papers
  const filteredPapers = papers.filter(p => {
    if (filterSet !== 'ALL' && p.set_name !== filterSet) return false;
    if (selectedSubject !== 'ALL' && p.course_code !== selectedSubject) return false;
    return true;
  });

  const uniqueSubjects = Array.from(new Set(papers.map(p => p.course_code))).map(code => {
    const match = papers.find(p => p.course_code === code);
    return { code, name: match?.subject_name || code };
  });

  return (
    <div className="min-h-screen bg-palette-cream text-palette-slate-dark bg-dot-pattern flex flex-col font-sans">
      
      {/* 1. Header Navigation Dock */}
      <header className="sticky top-0 z-40 bg-palette-cream/85 backdrop-blur-md border-b-1.5 border-palette-slate px-4 lg:px-8 py-3.5 transition-all">
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
                  Academic v2.4
                </span>
              </div>
              <p className="text-xs text-palette-slate font-medium hidden sm:block">
                University Examination Document Generator & Layout Engine
              </p>
            </div>
          </div>

          {/* Quick Metrics & Actions */}
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="hidden md:flex items-center gap-2 bg-palette-cream-card px-3 py-1.5 rounded-xl border-1.5 border-palette-slate shadow-tactile-sm">
              <span className="flex items-center gap-1.5 text-xs font-semibold text-palette-slate-dark">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                {papers.length} Papers Active
              </span>
              <span className="text-palette-slate/40">|</span>
              <span className="text-xs text-palette-slate font-medium flex items-center gap-1">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" /> Strict 2-Page Verified
              </span>
            </div>

            <button
              onClick={handleLoadSample}
              disabled={loading}
              className="tactile-btn text-xs font-semibold px-3 py-2 rounded-xl bg-palette-ice hover:bg-palette-ice-dark text-palette-slate-dark flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              <RotateCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">Load University Sample</span>
              <span className="sm:hidden">Sample</span>
            </button>

            <a
              href="/api/download-all"
              onClick={triggerConfetti}
              className="tactile-btn text-xs font-bold px-3.5 py-2 rounded-xl bg-palette-coral hover:bg-palette-coral-hover text-palette-slate-dark flex items-center gap-1.5 cursor-pointer"
            >
              <FileArchive className="w-4 h-4" />
              <span>Download All (ZIP)</span>
            </a>
          </div>

        </div>
      </header>

      {/* 2. Hero Section & Creation Console */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 lg:px-8 py-8 space-y-8">
        
        <div className="text-center max-w-3xl mx-auto space-y-3 pt-4">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-palette-mint/70 border border-palette-slate text-xs font-mono font-medium text-palette-slate-dark">
            <Sparkles className="w-3.5 h-3.5 text-palette-slate-dark" />
            Zero Formatting Friction • 100% University Template Compliance
          </div>
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-serif font-bold text-palette-slate-dark tracking-tight leading-tight">
            Your exam papers,<br />
            <span className="text-palette-slate italic">ready in minutes.</span>
          </h1>
          <p className="text-sm sm:text-base text-palette-slate max-w-2xl mx-auto leading-relaxed">
            Upload teaching notes and guidelines. The studio extracts unit concepts, balances difficulty, ensures English–Hindi bilingual parity, enforces strict 2-page limits, and populates official Word templates.
          </p>
        </div>

        {/* 3-Zone Tactile Bento Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          
          {/* Zone 1: Notes & Syllabus */}
          <div className="tactile-card bg-palette-cream-card rounded-2xl p-5 flex flex-col justify-between border-1.5 border-palette-slate space-y-4">
            <div>
              <div className="flex items-center justify-between mb-3">
                <div className="w-9 h-9 rounded-lg bg-palette-ice border border-palette-slate flex items-center justify-center font-bold text-sm">
                  1
                </div>
                <span className="text-[11px] font-mono uppercase tracking-wider text-palette-slate bg-palette-slate-subtle px-2 py-0.5 rounded border border-palette-slate/30">
                  PDF / DOCX
                </span>
              </div>
              <h3 className="font-serif font-bold text-lg text-palette-slate-dark mb-1">
                Upload Notes or Syllabus
              </h3>
              <p className="text-xs text-palette-slate leading-relaxed">
                Provide semester lecture slides, course units, or reference materials.
              </p>
            </div>

            <div className="space-y-2">
              <label className="border-2 border-dashed border-palette-slate/40 hover:border-palette-slate rounded-xl p-4 flex flex-col items-center justify-center text-center cursor-pointer transition-colors bg-palette-cream/40">
                <Upload className="w-6 h-6 text-palette-slate mb-1.5" />
                <span className="text-xs font-semibold text-palette-slate-dark">Drop notes files here</span>
                <span className="text-[10px] text-palette-slate/70">or click to browse multiple files</span>
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

              {session?.notes && session.notes.length > 0 && (
                <div className="space-y-1.5 max-h-32 overflow-y-auto pr-1">
                  {session.notes.map((n, i) => (
                    <div key={i} className="flex items-center justify-between text-xs bg-palette-cream px-2.5 py-1.5 rounded-lg border border-palette-slate/30">
                      <span className="truncate max-w-[180px] font-medium text-palette-slate-dark" title={n.file_name}>
                        {n.file_name}
                      </span>
                      <span className="text-[10px] font-mono text-palette-slate font-semibold">
                        {n.total_pages}p
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Zone 2: Guidelines & Formats */}
          <div className="tactile-card bg-palette-cream-card rounded-2xl p-5 flex flex-col justify-between border-1.5 border-palette-slate space-y-4">
            <div>
              <div className="flex items-center justify-between mb-3">
                <div className="w-9 h-9 rounded-lg bg-palette-mint border border-palette-slate flex items-center justify-center font-bold text-sm">
                  2
                </div>
                <span className="text-[11px] font-mono uppercase tracking-wider text-palette-slate bg-palette-slate-subtle px-2 py-0.5 rounded border border-palette-slate/30">
                  Format Rules
                </span>
              </div>
              <h3 className="font-serif font-bold text-lg text-palette-slate-dark mb-1">
                Upload Exam Guidelines
              </h3>
              <p className="text-xs text-palette-slate leading-relaxed">
                University circulars, marking rules (70 or 75 marks), and sample Word templates.
              </p>
            </div>

            <div className="space-y-2">
              <label className="border-2 border-dashed border-palette-slate/40 hover:border-palette-slate rounded-xl p-4 flex flex-col items-center justify-center text-center cursor-pointer transition-colors bg-palette-cream/40">
                <FileText className="w-6 h-6 text-palette-slate mb-1.5" />
                <span className="text-xs font-semibold text-palette-slate-dark">Upload official Word template</span>
                <span className="text-[10px] text-palette-slate/70">DOCX preserving tables & logos</span>
                <input 
                  type="file" 
                  accept=".docx,.pdf"
                  className="hidden"
                  onChange={async (e) => {
                    if (!e.target.files?.[0]) return;
                    const fd = new FormData();
                    fd.append('file', e.target.files[0]);
                    setLoading(true);
                    await fetch('/api/upload-guidelines', { method: 'POST', body: fd });
                    await fetchSession();
                    setLoading(false);
                  }}
                />
              </label>

              {session?.guidelines && (
                <div className="p-2.5 bg-palette-mint-light/60 border border-palette-mint-dark rounded-xl text-xs space-y-1">
                  <div className="flex items-center justify-between font-semibold text-palette-slate-dark">
                    <span>Format Detected:</span>
                    <span className="font-mono bg-palette-mint px-1.5 py-0.5 rounded border border-palette-slate/30">
                      {session.guidelines.marks_format || 70} Marks
                    </span>
                  </div>
                  <div className="text-[11px] text-palette-slate flex items-center justify-between">
                    <span>Difference Constraint:</span>
                    <span className="font-mono font-medium">≥75% Difference (≤25% Overlap)</span>
                  </div>
                  <div className="text-[11px] text-palette-slate flex items-center justify-between">
                    <span>Page Limit:</span>
                    <span className="font-mono font-medium">Strictly 2 Pages Max</span>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Zone 3: Natural Language Director */}
          <div className="tactile-card bg-palette-cream-card rounded-2xl p-5 flex flex-col justify-between border-1.5 border-palette-slate space-y-4">
            <div>
              <div className="flex items-center justify-between mb-3">
                <div className="w-9 h-9 rounded-lg bg-palette-coral border border-palette-slate flex items-center justify-center font-bold text-sm">
                  3
                </div>
                <span className="text-[11px] font-mono uppercase tracking-wider text-palette-slate bg-palette-slate-subtle px-2 py-0.5 rounded border border-palette-slate/30">
                  Instruction
                </span>
              </div>
              <h3 className="font-serif font-bold text-lg text-palette-slate-dark mb-1">
                Tell us what you need
              </h3>
              <p className="text-xs text-palette-slate leading-relaxed">
                One natural-language instruction box for subjects, sets, or specific emphasis.
              </p>
            </div>

            <div className="space-y-3">
              <textarea
                value={promptText}
                onChange={(e) => setPromptText(e.target.value)}
                rows={3}
                className="w-full text-xs p-3 rounded-xl border border-palette-slate bg-palette-cream/60 focus:bg-white focus:outline-none focus:ring-2 focus:ring-palette-coral resize-none"
                placeholder="e.g. Prepare Set A and Set B for all four MA Sociology subjects in English and Hindi..."
              />

              <button
                onClick={handleGenerate}
                disabled={generating}
                className="tactile-btn w-full py-2.5 px-4 rounded-xl bg-palette-coral hover:bg-palette-coral-hover text-palette-slate-dark font-bold text-sm flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
              >
                {generating ? (
                  <>
                    <RotateCw className="w-4 h-4 animate-spin" />
                    <span>Generating Examination Papers...</span>
                  </>
                ) : (
                  <>
                    <Zap className="w-4 h-4" />
                    <span>Create My Papers</span>
                  </>
                )}
              </button>
            </div>
          </div>

        </div>

        {/* Intelligent Clarification Card */}
        {session?.interpretation && (
          <div className="tactile-card bg-palette-ice-light rounded-2xl p-5 border-1.5 border-palette-slate flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-xl bg-palette-ice border border-palette-slate shrink-0">
                <Sparkles className="w-5 h-5 text-palette-slate-dark" />
              </div>
              <div className="space-y-1">
                <h4 className="text-sm font-serif font-bold text-palette-slate-dark">
                  Autonomous Document Interpretation
                </h4>
                <p className="text-xs text-palette-slate leading-relaxed whitespace-pre-line max-w-3xl">
                  {session.interpretation}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0 w-full sm:w-auto">
              <button
                onClick={handleGenerate}
                disabled={generating}
                className="tactile-btn text-xs font-bold px-4 py-2 rounded-xl bg-palette-mint hover:bg-palette-mint-dark text-palette-slate-dark w-full sm:w-auto text-center"
              >
                Confirm & Generate All
              </button>
            </div>
          </div>
        )}

        {/* Live Progress Bar (if generating) */}
        {generating && (
          <div className="tactile-card bg-white rounded-2xl p-5 border-1.5 border-palette-slate space-y-3 animate-fade-in">
            <div className="flex items-center justify-between text-xs font-semibold">
              <span className="flex items-center gap-2 text-palette-slate-dark">
                <RotateCw className="w-4 h-4 animate-spin text-palette-coral" />
                {progress.message || 'Processing syllabus & guidelines...'}
              </span>
              <span className="font-mono text-sm">{progress.percent}%</span>
            </div>
            <div className="w-full bg-palette-slate-subtle rounded-full h-3 overflow-hidden border border-palette-slate">
              <div 
                className="bg-palette-coral h-full transition-all duration-300"
                style={{ width: `${progress.percent}%` }}
              ></div>
            </div>
          </div>
        )}

        {/* 4. Generated Papers Gallery (Savee-inspired Aesthetic) */}
        <section className="space-y-5 pt-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-palette-slate/20 pb-4">
            <div>
              <h2 className="font-serif font-bold text-2xl text-palette-slate-dark tracking-tight">
                Generated Examination Papers
              </h2>
              <p className="text-xs text-palette-slate">
                Formatted into official university Word templates with strict 2-page verification and bilingual layout.
              </p>
            </div>

            {/* Filter Pills */}
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center bg-palette-cream-card rounded-xl border border-palette-slate p-0.5 shadow-tactile-sm">
                {(['ALL', 'A', 'B'] as const).map(set => (
                  <button
                    key={set}
                    onClick={() => setFilterSet(set)}
                    className={`text-xs px-3 py-1 rounded-lg font-medium transition-all ${
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
                  className="text-xs p-1.5 rounded-xl border border-palette-slate bg-palette-cream-card font-medium text-palette-slate-dark focus:outline-none shadow-tactile-sm"
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
          </div>

          {filteredPapers.length === 0 ? (
            <div className="tactile-card bg-palette-cream-card rounded-2xl p-12 text-center border-1.5 border-palette-slate space-y-3">
              <BookOpen className="w-10 h-10 text-palette-slate mx-auto opacity-50" />
              <h3 className="font-serif font-bold text-lg text-palette-slate-dark">No papers match your filter</h3>
              <p className="text-xs text-palette-slate">Click "Load University Sample" or "Create My Papers" to generate.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 gap-6">
              {filteredPapers.map(paper => (
                <div 
                  key={paper.id}
                  className="tactile-card bg-palette-cream-card rounded-2xl border-1.5 border-palette-slate p-5 flex flex-col justify-between space-y-4 relative overflow-hidden group"
                >
                  {/* Top Badges */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className={`text-xs font-mono font-bold px-2 py-0.5 rounded-lg border border-palette-slate ${
                          paper.set_name === 'A' ? 'bg-palette-coral text-palette-slate-dark' : 'bg-palette-ice text-palette-slate-dark'
                        }`}>
                          SET {paper.set_name}
                        </span>
                        <span className="text-xs font-mono font-semibold text-palette-slate bg-palette-slate-subtle px-2 py-0.5 rounded border border-palette-slate/30">
                          {paper.course_code}
                        </span>
                      </div>
                      <h3 className="font-serif font-bold text-lg text-palette-slate-dark leading-snug">
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
                      <span className="text-[10px] font-mono text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-300 font-semibold flex items-center gap-1">
                        <Check className="w-3 h-3" /> {paper.page_count} Pages Strict
                      </span>
                    </div>
                  </div>

                  {/* Interactive Page Thumbnail Preview */}
                  <div className="bg-palette-cream/60 rounded-xl p-3 border border-palette-slate/30 space-y-2">
                    <div className="flex items-center justify-between text-[11px] text-palette-slate font-medium">
                      <span>Document Layout Preview</span>
                      <span className="text-emerald-700 font-semibold">
                        Overlap with sibling: {paper.overlap_with_partner || 10}%
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      {paper.preview_images && paper.preview_images.length > 0 ? (
                        paper.preview_images.slice(0, 2).map((img, idx) => (
                          <div 
                            key={idx}
                            onClick={() => {
                              setPreviewPaper(paper);
                              setActivePreviewPage(idx);
                            }}
                            className="group/img relative bg-white rounded-lg border border-palette-slate/40 overflow-hidden aspect-[1/1.3] cursor-pointer hover:border-palette-slate transition-all shadow-sm"
                          >
                            <img 
                              src={img} 
                              alt={`Page ${idx + 1}`}
                              className="w-full h-full object-cover object-top transition-transform group-hover/img:scale-105"
                            />
                            <div className="absolute inset-0 bg-palette-slate-dark/0 group-hover/img:bg-palette-slate-dark/20 transition-all flex items-center justify-center">
                              <span className="opacity-0 group-hover/img:opacity-100 bg-white/90 text-palette-slate-dark font-mono text-[10px] font-bold px-2 py-0.5 rounded-md shadow border border-palette-slate flex items-center gap-1">
                                <Eye className="w-3 h-3" /> Page {idx + 1}
                              </span>
                            </div>
                          </div>
                        ))
                      ) : (
                        <div className="col-span-2 py-6 text-center text-xs text-palette-slate">
                          DOCX assembled • PDF preview ready
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Question Stats Chips */}
                  <div className="flex items-center justify-between text-xs font-mono text-palette-slate border-t border-palette-slate/15 pt-3">
                    <span>Sec A: 12 Qs (2m)</span>
                    <span>•</span>
                    <span>Sec B: 6 Qs (6m)</span>
                    <span>•</span>
                    <span>Sec C: 2 Qs (20m)</span>
                  </div>

                  {/* Card Actions */}
                  <div className="grid grid-cols-3 gap-2 pt-1">
                    <button
                      onClick={() => setInspectPaper(paper)}
                      className="tactile-btn text-xs font-bold py-2 px-2.5 rounded-xl bg-palette-ice hover:bg-palette-ice-dark text-palette-slate-dark flex items-center justify-center gap-1 cursor-pointer"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                      <span>Review Qs</span>
                    </button>

                    <a
                      href={paper.docx_url}
                      className="tactile-btn text-xs font-bold py-2 px-2.5 rounded-xl bg-palette-cream hover:bg-palette-cream-dark text-palette-slate-dark flex items-center justify-center gap-1 cursor-pointer text-center"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>DOCX</span>
                    </a>

                    <a
                      href={paper.pdf_url}
                      className="tactile-btn text-xs font-bold py-2 px-2.5 rounded-xl bg-palette-coral hover:bg-palette-coral-hover text-palette-slate-dark flex items-center justify-center gap-1 cursor-pointer text-center"
                    >
                      <FileText className="w-3.5 h-3.5" />
                      <span>PDF</span>
                    </a>
                  </div>

                </div>
              ))}
            </div>
          )}
        </section>

      </main>

      {/* 5. Fullscreen High-Resolution Preview Modal */}
      {previewPaper && (
        <div className="fixed inset-0 z-50 bg-palette-slate-dark/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-palette-cream-card rounded-2xl border-2 border-palette-slate max-w-4xl w-full max-h-[92vh] flex flex-col shadow-2xl overflow-hidden animate-fade-in">
            <div className="p-4 border-b border-palette-slate flex items-center justify-between bg-palette-cream">
              <div>
                <span className="font-mono text-xs font-bold px-2 py-0.5 rounded bg-palette-coral border border-palette-slate mr-2">
                  SET {previewPaper.set_name}
                </span>
                <span className="font-serif font-bold text-base text-palette-slate-dark">
                  {previewPaper.subject_name} ({previewPaper.course_code})
                </span>
              </div>
              <button
                onClick={() => setPreviewPaper(null)}
                className="w-8 h-8 rounded-lg bg-palette-cream hover:bg-palette-slate-subtle border border-palette-slate flex items-center justify-center cursor-pointer"
              >
                <X className="w-4 h-4 text-palette-slate-dark" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 bg-stone-100 flex flex-col items-center gap-4">
              {previewPaper.preview_images && previewPaper.preview_images[activePreviewPage] ? (
                <img 
                  src={previewPaper.preview_images[activePreviewPage]} 
                  alt="Exam Paper Full Preview" 
                  className="max-w-2xl w-full rounded-md shadow-xl border border-stone-300"
                />
              ) : (
                <div className="py-20 text-palette-slate">No preview available</div>
              )}
            </div>

            <div className="p-3 bg-palette-cream border-t border-palette-slate flex items-center justify-between">
              <div className="flex items-center gap-2">
                {previewPaper.preview_images.map((_, idx) => (
                  <button
                    key={idx}
                    onClick={() => setActivePreviewPage(idx)}
                    className={`text-xs px-3 py-1 rounded-lg font-mono font-bold border transition-all ${
                      activePreviewPage === idx
                        ? 'bg-palette-slate-dark text-white border-palette-slate'
                        : 'bg-white text-palette-slate border-palette-slate/40'
                    }`}
                  >
                    Page {idx + 1}
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-2">
                <a
                  href={previewPaper.docx_url}
                  className="tactile-btn text-xs font-bold px-3 py-1.5 rounded-lg bg-palette-mint text-palette-slate-dark flex items-center gap-1"
                >
                  <Download className="w-3.5 h-3.5" /> Download DOCX
                </a>
                <a
                  href={previewPaper.pdf_url}
                  className="tactile-btn text-xs font-bold px-3 py-1.5 rounded-lg bg-palette-coral text-palette-slate-dark flex items-center gap-1"
                >
                  <Download className="w-3.5 h-3.5" /> Download PDF
                </a>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 6. Question Refinement & Targeted AI Editor Drawer */}
      {inspectPaper && (
        <div className="fixed inset-0 z-50 bg-palette-slate-dark/60 backdrop-blur-sm flex justify-end">
          <div className="bg-palette-cream-card w-full max-w-2xl h-full border-l-2 border-palette-slate flex flex-col shadow-2xl animate-slide-left">
            
            {/* Drawer Header */}
            <div className="p-5 border-b border-palette-slate bg-palette-cream flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-mono text-xs font-bold px-2 py-0.5 rounded bg-palette-ice border border-palette-slate">
                    SET {inspectPaper.set_name}
                  </span>
                  <span className="font-mono text-xs text-palette-slate">
                    {inspectPaper.course_code}
                  </span>
                </div>
                <h3 className="font-serif font-bold text-xl text-palette-slate-dark">
                  {inspectPaper.subject_name}
                </h3>
              </div>
              <button
                onClick={() => {
                  setInspectPaper(null);
                  setEditingQuestion(null);
                }}
                className="w-8 h-8 rounded-lg bg-palette-cream hover:bg-palette-slate-subtle border border-palette-slate flex items-center justify-center cursor-pointer"
              >
                <X className="w-4 h-4 text-palette-slate-dark" />
              </button>
            </div>

            {/* Questions List */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              
              {/* Section A */}
              <div className="space-y-3">
                <div className="flex items-center justify-between border-b border-palette-slate/20 pb-1.5">
                  <h4 className="font-serif font-bold text-sm text-palette-slate-dark">
                    Section A — 12 Short Questions (2 Marks Each • Attempt 10)
                  </h4>
                  <span className="text-[11px] font-mono text-palette-slate font-semibold">20 Marks</span>
                </div>
                <div className="space-y-2">
                  {inspectPaper.section_a.map((q) => (
                    <QuestionRow 
                      key={q.id} 
                      q={q} 
                      onSelect={() => {
                        setEditingQuestion(q);
                        setManualEn(q.en);
                        setManualHi(q.hi || '');
                        setEditInstruction('');
                      }} 
                    />
                  ))}
                </div>
              </div>

              {/* Section B */}
              <div className="space-y-3">
                <div className="flex items-center justify-between border-b border-palette-slate/20 pb-1.5">
                  <h4 className="font-serif font-bold text-sm text-palette-slate-dark">
                    Section B — 6 Analytical Questions (6 Marks Each • Attempt 5)
                  </h4>
                  <span className="text-[11px] font-mono text-palette-slate font-semibold">30 Marks</span>
                </div>
                <div className="space-y-2">
                  {inspectPaper.section_b.map((q) => (
                    <QuestionRow 
                      key={q.id} 
                      q={q} 
                      onSelect={() => {
                        setEditingQuestion(q);
                        setManualEn(q.en);
                        setManualHi(q.hi || '');
                        setEditInstruction('');
                      }} 
                    />
                  ))}
                </div>
              </div>

              {/* Section C */}
              <div className="space-y-3">
                <div className="flex items-center justify-between border-b border-palette-slate/20 pb-1.5">
                  <h4 className="font-serif font-bold text-sm text-palette-slate-dark">
                    Section C — 2 Essay Questions (20 Marks Each • Attempt 1)
                  </h4>
                  <span className="text-[11px] font-mono text-palette-slate font-semibold">20 Marks</span>
                </div>
                <div className="space-y-2">
                  {inspectPaper.section_c.map((q) => (
                    <QuestionRow 
                      key={q.id} 
                      q={q} 
                      onSelect={() => {
                        setEditingQuestion(q);
                        setManualEn(q.en);
                        setManualHi(q.hi || '');
                        setEditInstruction('');
                      }} 
                    />
                  ))}
                </div>
              </div>

            </div>

            {/* In-Place Question Editor Footer */}
            {editingQuestion && (
              <div className="p-5 border-t-2 border-palette-slate bg-palette-cream space-y-3 shadow-lg">
                <div className="flex items-center justify-between">
                  <span className="font-serif font-bold text-sm text-palette-slate-dark flex items-center gap-1.5">
                    <Edit3 className="w-4 h-4 text-palette-coral" />
                    Editing Question {editingQuestion.section}-{editingQuestion.number} ({editingQuestion.marks} Marks)
                  </span>
                  <button 
                    onClick={() => setEditingQuestion(null)}
                    className="text-xs text-palette-slate hover:text-palette-slate-dark underline"
                  >
                    Cancel
                  </button>
                </div>

                {/* Quick Directive Pills */}
                <div className="flex flex-wrap gap-1.5">
                  {[
                    "Make more analytical",
                    "Replace Parsons question",
                    "Improve Hindi translation",
                    "Focus on Indian context",
                    "Make slightly harder"
                  ].map((directive, idx) => (
                    <button
                      key={idx}
                      onClick={() => setEditInstruction(directive)}
                      className="text-[11px] font-medium px-2 py-0.5 rounded-md bg-white border border-palette-slate/30 hover:border-palette-slate hover:bg-palette-coral-light text-palette-slate-dark cursor-pointer transition-colors"
                    >
                      {directive}
                    </button>
                  ))}
                </div>

                <div className="space-y-2">
                  <input
                    type="text"
                    value={editInstruction}
                    onChange={(e) => setEditInstruction(e.target.value)}
                    placeholder="AI directive (e.g. 'Emphasize Gramsci's cultural hegemony')..."
                    className="w-full text-xs p-2.5 rounded-xl border border-palette-slate bg-white focus:outline-none focus:ring-2 focus:ring-palette-coral"
                  />
                  
                  {!editInstruction && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <textarea
                        value={manualEn}
                        onChange={(e) => setManualEn(e.target.value)}
                        placeholder="Manual English question..."
                        rows={2}
                        className="text-xs p-2 rounded-lg border border-palette-slate/40 bg-white resize-none"
                      />
                      <textarea
                        value={manualHi}
                        onChange={(e) => setManualHi(e.target.value)}
                        placeholder="Manual Hindi translation..."
                        rows={2}
                        className="text-xs p-2 rounded-lg border border-palette-slate/40 bg-white resize-none"
                      />
                    </div>
                  )}
                </div>

                <button
                  onClick={handleEditQuestion}
                  disabled={editingLoading}
                  className="tactile-btn w-full py-2.5 rounded-xl bg-palette-coral hover:bg-palette-coral-hover text-palette-slate-dark font-bold text-xs flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  {editingLoading ? (
                    <>
                      <RotateCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Refining question & updating Word/PDF layout...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>Apply Edit & Rebuild Document</span>
                    </>
                  )}
                </button>
              </div>
            )}

          </div>
        </div>
      )}

      {/* Footer */}
      <footer className="border-t border-palette-slate/20 py-6 px-4 text-center text-xs text-palette-slate font-medium">
        <p>Exam Paper Studio • Preserving Academic Word Templates • English & Hindi Typography</p>
      </footer>

    </div>
  );
}

function QuestionRow({ q, onSelect }: { q: Question; onSelect: () => void }) {
  return (
    <div 
      onClick={onSelect}
      className="p-3 bg-palette-cream/40 hover:bg-white rounded-xl border border-palette-slate/30 hover:border-palette-slate transition-all cursor-pointer group space-y-1"
    >
      <div className="flex items-start justify-between gap-2">
        <span className="font-mono text-[11px] font-bold text-palette-slate-dark">
          Q{q.number}.
        </span>
        <button className="opacity-0 group-hover:opacity-100 text-palette-slate hover:text-palette-coral transition-opacity">
          <Edit3 className="w-3.5 h-3.5" />
        </button>
      </div>
      <p className="text-xs text-palette-slate-dark leading-relaxed font-medium">
        {q.en}
      </p>
      {q.hi && (
        <p className="text-xs text-palette-slate leading-relaxed font-sans pt-0.5">
          {q.hi}
        </p>
      )}
    </div>
  );
}

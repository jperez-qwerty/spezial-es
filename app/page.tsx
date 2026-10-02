"use client";

import React, { useState, useEffect } from "react";
import confetti from "canvas-confetti";
import { 
  Share2, 
  Sparkles, 
  Clock, 
  ArrowRight, 
  CornerDownLeft, 
  Loader2, 
  Check, 
  Shuffle, 
  User, 
  Flame, 
  BarChart3, 
  X,
  Volume2,
  VolumeX
} from "lucide-react";
import { supabase } from "./lib/supabase";

interface AnswerOption {
  text: string;
  defaultRarity: number;
}

interface Question {
  id: number;
  prompt: string;
  category: string;
  difficulty: number;
  valid_answers: AnswerOption[];
}

interface GameResult {
  question: string;
  category: string;
  answer: string;
  canonicalAnswer: string;
  rarity: number;
  score: number;
  success: boolean;
  difficulty: number;
}

interface LeaderboardEntry {
  id: string;
  nickname: string;
  score: number;
  created_at: string;
}

interface UserStats {
  played: number;
  currentStreak: number;
  maxStreak: number;
  bestScore: number;
  totalScoreSum: number;
  lastPlayedDate: string | null;
}

const ROUND_TIME_SECONDS = 25;
const GAME_EPOCH = new Date("2026-10-01T00:00:00Z").getTime();
const IS_DEV = process.env.NODE_ENV === "development";

class SoundManager {
  private ctx: AudioContext | null = null;
  public enabled: boolean = true;

  private initCtx() {
    if (!this.ctx && typeof window !== "undefined") {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AudioCtx();
    }
    if (this.ctx && this.ctx.state === "suspended") {
      this.ctx.resume();
    }
  }

  playTick() {
    if (!this.enabled) return;
    this.initCtx();
    if (!this.ctx) return;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(800, this.ctx.currentTime);

    gain.gain.setValueAtTime(0.04, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, this.ctx.currentTime + 0.04);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start();
    osc.stop(this.ctx.currentTime + 0.04);
  }

  playSuccess() {
    if (!this.enabled) return;
    this.initCtx();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    
    const osc1 = this.ctx.createOscillator();
    const gain1 = this.ctx.createGain();
    osc1.type = "sine";
    osc1.frequency.setValueAtTime(523.25, now);
    gain1.gain.setValueAtTime(0.08, now);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
    osc1.connect(gain1);
    gain1.connect(this.ctx.destination);
    osc1.start(now);
    osc1.stop(now + 0.18);

    const osc2 = this.ctx.createOscillator();
    const gain2 = this.ctx.createGain();
    osc2.type = "sine";
    osc2.frequency.setValueAtTime(783.99, now + 0.08);
    gain2.gain.setValueAtTime(0.09, now + 0.08);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.32);
    osc2.connect(gain2);
    gain2.connect(this.ctx.destination);
    osc2.start(now + 0.08);
    osc2.stop(now + 0.32);
  }

  playError() {
    if (!this.enabled) return;
    this.initCtx();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(160, now);
    osc.frequency.linearRampToValueAtTime(110, now + 0.18);

    gain.gain.setValueAtTime(0.12, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(now);
    osc.stop(now + 0.18);
  }

  playVictory() {
    if (!this.enabled) return;
    this.initCtx();
    if (!this.ctx) return;

    const notes = [261.63, 329.63, 392.00, 523.25];
    notes.forEach((freq, idx) => {
      if (!this.ctx) return;
      const now = this.ctx.currentTime + idx * 0.08;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(freq, now);
      gain.gain.setValueAtTime(0.06, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.7);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(now);
      osc.stop(now + 0.7);
    });
  }
}

const sounds = new SoundManager();

function getDayNumber(): number {
  const now = new Date();
  const todayUtc = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  const diffDays = Math.floor((todayUtc - GAME_EPOCH) / (1000 * 60 * 60 * 24));
  return Math.max(0, diffDays);
}

function getTodayKey(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getYesterdayKey(): string {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const year = yesterday.getFullYear();
  const month = String(yesterday.getMonth() + 1).padStart(2, "0");
  const day = String(yesterday.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getTimeUntilMidnight(): string {
  const now = new Date();
  const midnight = new Date(now);
  midnight.setHours(24, 0, 0, 0);

  const diffMs = midnight.getTime() - now.getTime();
  const hours = Math.floor(diffMs / (1000 * 60 * 60));
  const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
  const seconds = Math.floor((diffMs % (1000 * 60)) / 1000);

  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function normalize(str: string): string {
  return str
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function levenshteinDistance(a: string, b: string): number {
  const matrix: number[][] = [];
  for (let i = 0; i <= b.length; i++) matrix[i] = [i];
  for (let j = 0; j <= a.length; j++) matrix[0][j] = j;

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }
  return matrix[b.length][a.length];
}

function findFuzzyMatch(userInput: string, validAnswers: AnswerOption[]): AnswerOption | null {
  const cleanInput = normalize(userInput);
  const exact = validAnswers.find((ans) => normalize(ans.text) === cleanInput);
  if (exact) return exact;

  let bestMatch: AnswerOption | null = null;
  let minDistance = Infinity;

  for (const item of validAnswers) {
    const target = normalize(item.text);
    const dist = levenshteinDistance(cleanInput, target);

    let maxAllowed = 0;
    if (target.length >= 7) {
      maxAllowed = 2;
    } else if (target.length >= 4) {
      maxAllowed = 1;
    }

    if (dist <= maxAllowed && dist < minDistance) {
      minDistance = dist;
      bestMatch = item;
    }
  }

  return bestMatch;
}

const DIFFICULTY_LABELS: Record<number, string> = {
  1: "Ronda 1 · Océano",
  2: "Ronda 2 · Enfoque",
  3: "Ronda 3 · Filtro",
  4: "Ronda 4 · Estrecho",
  5: "Ronda 5 · Abismo",
};

export default function Home() {
  const [allQuestionsPool, setAllQuestionsPool] = useState<Question[]>([]);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [isLoadingQuestions, setIsLoadingQuestions] = useState(true);
  const [gameState, setGameState] = useState<"intro" | "playing" | "summary">("intro");
  const [currentIndex, setCurrentIndex] = useState(0);
  const [timeLeft, setTimeLeft] = useState(ROUND_TIME_SECONDS);
  const [inputVal, setInputVal] = useState("");
  const [feedback, setFeedback] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [alreadyPlayedToday, setAlreadyPlayedToday] = useState(false);
  const [isDevSession, setIsDevSession] = useState(false);
  const [timeToNext, setTimeToNext] = useState<string>("");
  const [copied, setCopied] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);

  const [results, setResults] = useState<GameResult[]>([]);

  // Leaderboard states
  const [nicknameInput, setNicknameInput] = useState("");
  const [submittedNickname, setSubmittedNickname] = useState<string | null>(null);
  const [isSubmittingScore, setIsSubmittingScore] = useState(false);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [isLoadingLeaderboard, setIsLoadingLeaderboard] = useState(false);

  // Stats states
  const [stats, setStats] = useState<UserStats>({
    played: 0,
    currentStreak: 0,
    maxStreak: 0,
    bestScore: 0,
    totalScoreSum: 0,
    lastPlayedDate: null
  });
  const [showStatsModal, setShowStatsModal] = useState(false);

  const buildQuestionSet = (pool: Question[], dayIndex: number) => {
    const dailySelection: Question[] = [];
    for (let d = 1; d <= 5; d++) {
      const poolForDiff = pool.filter((q) => q.difficulty === d).sort((a, b) => a.id - b.id);
      if (poolForDiff.length > 0) {
        const selectedIndex = dayIndex % poolForDiff.length;
        dailySelection.push(poolForDiff[selectedIndex]);
      }
    }
    return dailySelection;
  };

  const fetchLeaderboard = async () => {
    setIsLoadingLeaderboard(true);
    try {
      const today = getTodayKey();
      const { data, error } = await supabase
        .from("daily_scores")
        .select("id, nickname, score, created_at")
        .eq("date_key", today)
        .order("score", { ascending: false })
        .limit(10);

      if (error) throw error;
      setLeaderboard((data as LeaderboardEntry[]) || []);
    } catch (err) {
      console.error("Error al cargar ranking:", err);
    } finally {
      setIsLoadingLeaderboard(false);
    }
  };

  useEffect(() => {
    async function init() {
      try {
        const today = getTodayKey();
        const dayIndex = getDayNumber();

        const savedSound = localStorage.getItem("spezial_sound_enabled");
        if (savedSound !== null) {
          const val = savedSound === "true";
          setSoundEnabled(val);
          sounds.enabled = val;
        }

        const rememberedNick = localStorage.getItem("spezial_saved_nickname");
        if (rememberedNick) {
          setNicknameInput(rememberedNick);
        }

        const savedStats = localStorage.getItem("spezial_user_stats");
        if (savedStats) {
          try {
            setStats(JSON.parse(savedStats));
          } catch (e) {
            console.error("Error parseando stats", e);
          }
        }

        const { data, error } = await supabase
          .from("questions")
          .select("id, prompt, category, difficulty, valid_answers");

        if (error) throw error;

        if (data && data.length > 0) {
          const pool = data as Question[];
          setAllQuestionsPool(pool);
          setQuestions(buildQuestionSet(pool, dayIndex));
        }

        const savedData = localStorage.getItem(`spezial_${today}`);
        if (savedData) {
          const parsed = JSON.parse(savedData);
          setResults(parsed.results || []);
          setAlreadyPlayedToday(true);
          if (parsed.submittedNickname) {
            setSubmittedNickname(parsed.submittedNickname);
          }
          setGameState("summary");
          fetchLeaderboard();
        }
      } catch (err) {
        console.error("Error al inicializar:", err);
      } finally {
        setIsLoadingQuestions(false);
      }
    }

    init();
  }, []);

  const toggleSound = () => {
    const nextVal = !soundEnabled;
    setSoundEnabled(nextVal);
    sounds.enabled = nextVal;
    localStorage.setItem("spezial_sound_enabled", String(nextVal));
    if (nextVal) {
      sounds.playSuccess();
    }
  };

  useEffect(() => {
    setTimeToNext(getTimeUntilMidnight());
    const interval = setInterval(() => {
      setTimeToNext(getTimeUntilMidnight());
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (gameState !== "playing") return;

    if (timeLeft === 0) {
      sounds.playError();
      handleTimeout();
      return;
    }

    if (timeLeft <= 5 && timeLeft > 0) {
      sounds.playTick();
    }

    const timer = setInterval(() => {
      setTimeLeft((prev) => prev - 1);
    }, 1000);

    return () => clearInterval(timer);
  }, [gameState, timeLeft]);

  const updateStatsOnCompletion = (finalScore: number) => {
    const today = getTodayKey();
    const yesterday = getYesterdayKey();

    setStats((prev) => {
      let newStreak = 1;
      if (prev.lastPlayedDate === yesterday) {
        newStreak = prev.currentStreak + 1;
      } else if (prev.lastPlayedDate === today) {
        newStreak = prev.currentStreak;
      }

      const updated: UserStats = {
        played: prev.played + 1,
        currentStreak: newStreak,
        maxStreak: Math.max(prev.maxStreak, newStreak),
        bestScore: Math.max(prev.bestScore, finalScore),
        totalScoreSum: prev.totalScoreSum + finalScore,
        lastPlayedDate: today
      };

      localStorage.setItem("spezial_user_stats", JSON.stringify(updated));
      return updated;
    });
  };

  const shuffleQuestionsForTesting = () => {
    if (allQuestionsPool.length === 0) return;
    const randomDayOffset = Math.floor(Math.random() * 50);
    setQuestions(buildQuestionSet(allQuestionsPool, randomDayOffset));
    setIsDevSession(true);
    setAlreadyPlayedToday(false);
    setResults([]);
    setSubmittedNickname(null);
    setCurrentIndex(0);
    setTimeLeft(ROUND_TIME_SECONDS);
    setGameState("playing");
  };

  const startGame = () => {
    if (questions.length === 0 || alreadyPlayedToday) return;
    setGameState("playing");
    setCurrentIndex(0);
    setTimeLeft(ROUND_TIME_SECONDS);
    setResults([]);
    setFeedback(null);
    setInputVal("");
    sounds.playTick();
  };

  const handleTimeout = () => {
    const currentQ = questions[currentIndex];
    const newResults: GameResult[] = [
      ...results,
      {
        question: currentQ.prompt,
        category: currentQ.category,
        difficulty: currentQ.difficulty,
        answer: "Sin tiempo",
        canonicalAnswer: "-",
        rarity: 100,
        score: 0,
        success: false
      }
    ];
    setResults(newResults);
    advanceQuestion(newResults);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputVal.trim() || gameState !== "playing" || isSubmitting) return;

    const currentQ = questions[currentIndex];
    const match = findFuzzyMatch(inputVal, currentQ.valid_answers || []);

    if (match) {
      sounds.playSuccess();
      setIsSubmitting(true);
      const canonical = normalize(match.text);
      let calculatedRarity = match.defaultRarity;

      try {
        await supabase.from("answers").insert([
          {
            question_id: currentQ.id,
            raw_answer: inputVal.trim(),
            normalized_answer: canonical
          }
        ]);

        const { count: totalVotes } = await supabase
          .from("answers")
          .select("*", { count: "exact", head: true })
          .eq("question_id", currentQ.id);

        const { count: thisAnswerVotes } = await supabase
          .from("answers")
          .select("*", { count: "exact", head: true })
          .eq("question_id", currentQ.id)
          .eq("normalized_answer", canonical);

        if (totalVotes && totalVotes > 5 && thisAnswerVotes) {
          calculatedRarity = Math.max(1, Math.round((thisAnswerVotes / totalVotes) * 100));
        }
      } catch (err) {
        console.error("Error conectando con Supabase:", err);
      } finally {
        setIsSubmitting(false);
      }

      const points = 100 - calculatedRarity;
      const newResults: GameResult[] = [
        ...results,
        {
          question: currentQ.prompt,
          category: currentQ.category,
          difficulty: currentQ.difficulty,
          answer: inputVal,
          canonicalAnswer: match.text,
          rarity: calculatedRarity,
          score: points,
          success: true
        }
      ];
      setResults(newResults);
      advanceQuestion(newResults);
    } else {
      sounds.playError();
      setFeedback("No figura en el registro oficial");
      setTimeout(() => setFeedback(null), 1600);
    }
  };

  const advanceQuestion = (currentResultsList: GameResult[]) => {
    setInputVal("");
    setFeedback(null);
    if (currentIndex + 1 < questions.length) {
      setCurrentIndex((prev) => prev + 1);
      setTimeLeft(ROUND_TIME_SECONDS);
    } else {
      const finalScore = currentResultsList.reduce((acc, r) => acc + r.score, 0);

      if (!isDevSession) {
        const today = getTodayKey();
        localStorage.setItem(
          `spezial_${today}`,
          JSON.stringify({
            date: today,
            results: currentResultsList,
            completedAt: new Date().toISOString()
          })
        );
        setAlreadyPlayedToday(true);
        updateStatsOnCompletion(finalScore);
      }
      setGameState("summary");
      sounds.playVictory();
      fetchLeaderboard();
      confetti({
        particleCount: 80,
        spread: 60,
        origin: { y: 0.7 },
        colors: ["#ffffff", "#d4d4d8", "#e4e4e7"]
      });
    }
  };

  const totalScore = results.reduce((acc, r) => acc + r.score, 0);

  const handleScoreSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanNick = nicknameInput.trim().slice(0, 12);
    if (!cleanNick || isSubmittingScore) return;

    setIsSubmittingScore(true);
    const today = getTodayKey();

    try {
      const { error } = await supabase.from("daily_scores").insert([
        {
          date_key: today,
          nickname: cleanNick,
          score: totalScore
        }
      ]);

      if (error) throw error;

      setSubmittedNickname(cleanNick);
      localStorage.setItem("spezial_saved_nickname", cleanNick);
      sounds.playSuccess();

      if (!isDevSession) {
        const savedData = localStorage.getItem(`spezial_${today}`);
        if (savedData) {
          const parsed = JSON.parse(savedData);
          parsed.submittedNickname = cleanNick;
          localStorage.setItem(`spezial_${today}`, JSON.stringify(parsed));
        }
      }

      await fetchLeaderboard();
    } catch (err) {
      console.error("Error enviando puntuación:", err);
    } finally {
      setIsSubmittingScore(false);
    }
  };

  const resetDailyProgressForDev = () => {
    const today = getTodayKey();
    localStorage.removeItem(`spezial_${today}`);
    setAlreadyPlayedToday(false);
    setIsDevSession(false);
    setResults([]);
    setSubmittedNickname(null);
    setGameState("intro");
  };

  const copyShareText = () => {
    const today = getTodayKey();
    const shareText = `SPEZIAL · Embudo Diario (${today})\n` +
      `Puntuación de Singularidad: ${totalScore} pts\n` +
      `Racha: ${stats.currentStreak} 🔥\n` +
      results
        .map((r) => (r.success ? (r.rarity <= 15 ? "⬛" : r.rarity <= 50 ? "◽" : "▫") : "✕"))
        .join("") +
      `\n\n¿Eres capaz de llegar al Abismo?: https://spezial-es.vercel.app`;

    navigator.clipboard.writeText(shareText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const averageScore = stats.played > 0 ? Math.round(stats.totalScoreSum / stats.played) : 0;

  return (
    <main className="min-h-screen bg-black text-zinc-100 flex flex-col justify-between selection:bg-zinc-800 selection:text-white px-4 py-8 antialiased font-sans">
      
      {/* HEADER */}
      <header className="w-full max-w-lg mx-auto flex items-center justify-between border-b border-zinc-900 pb-4">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
            <span className="font-mono text-xs uppercase tracking-[0.25em] text-zinc-400">
              SPEZIAL {isDevSession && <span className="text-amber-400 text-[10px] tracking-normal">[TEST RUN]</span>}
            </span>
          </div>

          <span className="h-3 w-px bg-zinc-800" />

          <button
            onClick={toggleSound}
            className="p-1 rounded-md border border-zinc-800/80 hover:border-zinc-700 text-zinc-400 hover:text-white transition"
            title={soundEnabled ? "Silenciar audio" : "Activar audio"}
          >
            {soundEnabled ? <Volume2 className="w-3.5 h-3.5 text-zinc-300" /> : <VolumeX className="w-3.5 h-3.5 text-zinc-600" />}
          </button>
        </div>

        <div className="flex items-center gap-2">
          {stats.currentStreak > 0 && (
            <div 
              className="flex items-center gap-1 px-2 py-1 rounded-md bg-amber-500/10 border border-amber-500/20 font-mono text-xs text-amber-400" 
              title={`Racha de ${stats.currentStreak} días`}
            >
              <Flame className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
              <span>{stats.currentStreak}</span>
            </div>
          )}

          <button
            onClick={() => setShowStatsModal(true)}
            className="p-1.5 rounded-md border border-zinc-800 hover:border-zinc-600 text-zinc-400 hover:text-white transition"
            title="Estadísticas e Historial"
          >
            <BarChart3 className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* MODAL DE ESTADÍSTICAS */}
      {showStatsModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-zinc-950 border border-zinc-800 rounded-2xl max-w-sm w-full p-6 space-y-6 shadow-2xl relative">
            <div className="flex items-center justify-between border-b border-zinc-900 pb-3">
              <span className="font-mono text-xs uppercase tracking-[0.2em] text-zinc-400">
                Estadísticas del Jugador
              </span>
              <button
                onClick={() => setShowStatsModal(false)}
                className="text-zinc-500 hover:text-white transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3 text-center font-mono">
              <div className="border border-zinc-900 rounded-xl p-3.5 bg-zinc-900/40">
                <span className="text-2xl font-light text-white">{stats.played}</span>
                <p className="text-[10px] text-zinc-500 uppercase tracking-widest mt-1">Partidas</p>
              </div>
              <div className="border border-zinc-900 rounded-xl p-3.5 bg-zinc-900/40">
                <span className="text-2xl font-light text-amber-400 flex items-center justify-center gap-1">
                  <Flame className="w-5 h-5 fill-amber-400" /> {stats.currentStreak}
                </span>
                <p className="text-[10px] text-zinc-500 uppercase tracking-widest mt-1">Racha Actual</p>
              </div>
              <div className="border border-zinc-900 rounded-xl p-3.5 bg-zinc-900/40">
                <span className="text-2xl font-light text-white">{stats.maxStreak}</span>
                <p className="text-[10px] text-zinc-500 uppercase tracking-widest mt-1">Racha Máxima</p>
              </div>
              <div className="border border-zinc-900 rounded-xl p-3.5 bg-zinc-900/40">
                <span className="text-2xl font-light text-white">{stats.bestScore}</span>
                <p className="text-[10px] text-zinc-500 uppercase tracking-widest mt-1">Récord Pts</p>
              </div>
            </div>

            <div className="border border-zinc-900 rounded-xl p-3.5 bg-zinc-900/40 flex justify-between items-center text-xs font-mono">
              <span className="text-zinc-400 uppercase tracking-wider">Media de Singularidad:</span>
              <span className="text-white font-medium">{averageScore} pts</span>
            </div>

            <button
              onClick={() => setShowStatsModal(false)}
              className="w-full py-2.5 bg-white text-black font-medium font-mono text-xs rounded-lg uppercase tracking-wider hover:bg-zinc-200 transition"
            >
              Cerrar
            </button>
          </div>
        </div>
      )}

      {/* CONTENEDOR CENTRAL */}
      <div className="w-full max-w-lg mx-auto my-auto py-8">
        
        {/* CARGANDO */}
        {isLoadingQuestions && (
          <div className="flex flex-col items-center justify-center py-20 space-y-4">
            <Loader2 className="w-5 h-5 text-zinc-500 animate-spin" />
            <span className="font-mono text-xs text-zinc-500 tracking-widest uppercase">
              Configurando el embudo diario
            </span>
          </div>
        )}

        {/* 1. INTRO */}
        {!isLoadingQuestions && gameState === "intro" && (
          <div className="space-y-8 animate-in fade-in duration-500">
            <div className="space-y-3">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full border border-zinc-800 bg-zinc-900/60 font-mono text-[11px] text-zinc-400 uppercase tracking-wider">
                <Sparkles className="w-3 h-3 text-zinc-300" /> Curva de Contracción
              </span>
              <h1 className="text-4xl sm:text-5xl font-light tracking-tight text-white">
                5 Rondas. <br />
                <span className="font-serif italic font-normal text-zinc-400">Cada vez más estrecho.</span>
              </h1>
              <p className="text-zinc-400 text-sm leading-relaxed max-w-md pt-2">
                Empiezas en un océano de respuestas posibles donde debes evitar lo evidente, y terminas en un abismo de solo un puñado de opciones válidas.
              </p>
            </div>

            <div className="border-t border-b border-zinc-900 py-4 grid grid-cols-3 gap-4 text-center font-mono">
              <div>
                <p className="text-lg text-white font-medium">5</p>
                <p className="text-[10px] text-zinc-500 uppercase tracking-widest mt-0.5">Rondas</p>
              </div>
              <div className="border-x border-zinc-900">
                <p className="text-lg text-white font-medium">{ROUND_TIME_SECONDS}s</p>
                <p className="text-[10px] text-zinc-500 uppercase tracking-widest mt-0.5">Tiempo</p>
              </div>
              <div>
                <p className="text-lg text-white font-medium">1 / día</p>
                <p className="text-[10px] text-zinc-500 uppercase tracking-widest mt-0.5">Intento</p>
              </div>
            </div>

            <div className="border border-zinc-900 rounded-xl p-4 bg-zinc-950/40 space-y-2.5 font-mono text-xs">
              <div className="flex justify-between items-center text-zinc-400">
                <span>Ronda 1 · Océano</span>
                <span className="text-zinc-500">Cientos de opciones</span>
              </div>
              <div className="flex justify-between items-center text-zinc-400">
                <span>Ronda 2-3 · Enfoque</span>
                <span className="text-zinc-500">~30-50 opciones</span>
              </div>
              <div className="flex justify-between items-center text-zinc-300 font-medium">
                <span>Ronda 5 · Abismo</span>
                <span className="text-amber-400/90">&lt; 10 opciones</span>
              </div>
            </div>

            <div className="space-y-3">
              <button
                onClick={startGame}
                disabled={questions.length === 0}
                className="w-full group flex items-center justify-between px-6 py-4 bg-white hover:bg-zinc-200 text-black font-medium text-sm rounded-lg transition duration-200 disabled:opacity-50"
              >
                <span>Jugar Reto Oficial de Hoy</span>
                <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
              </button>

              {/* Botón solo visible en local (desarrollo) */}
              {IS_DEV && (
                <button
                  onClick={shuffleQuestionsForTesting}
                  className="w-full flex items-center justify-center gap-2 py-3 border border-dashed border-zinc-800 hover:border-zinc-600 text-zinc-400 hover:text-white font-mono text-xs rounded-lg transition"
                >
                  <Shuffle className="w-3.5 h-3.5" />
                  <span>Generar combinación aleatoria (Dev)</span>
                </button>
              )}
            </div>
          </div>
        )}

        {/* 2. JUEGO ACTIVO */}
        {!isLoadingQuestions && gameState === "playing" && questions.length > 0 && (
          <div className="space-y-8 animate-in fade-in duration-300">
            <div className="flex justify-between items-end border-b border-zinc-900 pb-3">
              <div>
                <span className="font-mono text-[11px] uppercase tracking-widest text-zinc-500">
                  {DIFFICULTY_LABELS[questions[currentIndex].difficulty]}
                </span>
                <p className="text-xs text-zinc-300 font-medium">
                  {questions[currentIndex].category}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <span className="font-mono text-xs text-zinc-500">
                  {currentIndex + 1} / {questions.length}
                </span>
                <span className={`font-mono text-sm font-semibold tabular-nums px-2 py-0.5 rounded border ${
                  timeLeft <= 5 
                    ? "border-red-900/60 bg-red-950/30 text-red-400 animate-pulse" 
                    : "border-zinc-800 bg-zinc-900/60 text-zinc-300"
                }`}>
                  {timeLeft}s
                </span>
              </div>
            </div>

            <div className="w-full bg-zinc-900 h-1 rounded-full overflow-hidden">
              <div 
                className="bg-white h-full transition-all duration-300"
                style={{ width: `${((currentIndex + 1) / questions.length) * 100}%` }}
              />
            </div>

            <div className="min-h-[90px] flex items-center">
              <h2 className="text-2xl sm:text-3xl font-light tracking-tight text-white leading-snug">
                {questions[currentIndex].prompt}
              </h2>
            </div>

            <form onSubmit={handleSubmit} className="space-y-3">
              <div className="relative">
                <input
                  type="text"
                  autoFocus
                  disabled={isSubmitting}
                  placeholder="Tu respuesta única..."
                  value={inputVal}
                  onChange={(e) => setInputVal(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 hover:border-zinc-700 focus:border-white focus:outline-none rounded-lg px-4 py-3.5 text-white placeholder-zinc-600 text-sm transition-all duration-200"
                />
                <button
                  type="submit"
                  disabled={isSubmitting || !inputVal.trim()}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1.5 rounded-md text-zinc-400 hover:text-white disabled:opacity-30 transition"
                  title="Enviar"
                >
                  <CornerDownLeft className="w-4 h-4" />
                </button>
              </div>

              {feedback && (
                <p className="text-xs font-mono text-red-400 text-center animate-in fade-in duration-200">
                  {feedback}
                </p>
              )}
            </form>
          </div>
        )}

        {/* 3. RESUMEN Y LEADERBOARD */}
        {!isLoadingQuestions && gameState === "summary" && (
          <div className="space-y-8 animate-in fade-in duration-500">
            <div className="border border-zinc-900 rounded-xl p-6 bg-zinc-950/60 backdrop-blur space-y-4">
              <div className="flex justify-between items-center text-xs font-mono text-zinc-500">
                <span className="uppercase tracking-widest">
                  {isDevSession ? "Partida de Prueba" : "Embudo Completado"}
                </span>
                <div className="flex items-center gap-2">
                  {stats.currentStreak > 0 && (
                    <span className="text-amber-400 flex items-center gap-1 font-semibold">
                      <Flame className="w-3.5 h-3.5 fill-amber-400" /> {stats.currentStreak} días
                    </span>
                  )}
                  <span className="text-zinc-600">·</span>
                  <span className="text-zinc-400">{getTodayKey()}</span>
                </div>
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-6xl font-light tracking-tighter text-white tabular-nums">
                  {totalScore}
                </span>
                <span className="text-sm font-mono text-zinc-500 uppercase">pts / 500</span>
              </div>
              <p className="text-xs text-zinc-400 border-t border-zinc-900 pt-3">
                {totalScore > 400
                  ? "Insuperable. Has navegado el embudo hasta el fondo esquivando la norma."
                  : totalScore > 260
                  ? "Sólido. Has mantenido la compostura a medida que el embudo se cerraba."
                  : "El cuello de botella te ha forzado a respuestas demasiado comunes."}
              </p>
            </div>

            {/* SECCIÓN REGISTRO DE ALIAS */}
            {!submittedNickname ? (
              <div className="border border-zinc-900 rounded-xl p-5 bg-zinc-950/40 space-y-3">
                <div className="flex items-center justify-between text-xs font-mono text-zinc-400">
                  <span className="flex items-center gap-2 uppercase tracking-wider">
                    <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                    Entrar al club
                  </span>
                  <span className="text-[10px] text-zinc-600 uppercase tracking-widest">The Spezial Ones</span>
                </div>
                <form onSubmit={handleScoreSubmit} className="flex gap-2">
                  <input
                    type="text"
                    maxLength={12}
                    placeholder="Tu alias (ej: MOURINHO_04)"
                    value={nicknameInput}
                    onChange={(e) => setNicknameInput(e.target.value)}
                    className="flex-1 bg-zinc-900 border border-zinc-800 focus:border-zinc-500 focus:outline-none rounded-lg px-3 py-2 text-xs text-white placeholder-zinc-600 font-mono uppercase"
                  />
                  <button
                    type="submit"
                    disabled={isSubmittingScore || !nicknameInput.trim()}
                    className="px-4 py-2 bg-white hover:bg-zinc-200 text-black text-xs font-mono font-medium rounded-lg uppercase tracking-wider disabled:opacity-40 transition"
                  >
                    {isSubmittingScore ? "..." : "Reclamar"}
                  </button>
                </form>
              </div>
            ) : (
              <div className="flex items-center justify-between px-4 py-3 border border-zinc-900 rounded-lg bg-zinc-950/20 text-xs font-mono text-zinc-400">
                <span className="flex items-center gap-1.5">
                  <User className="w-3.5 h-3.5 text-zinc-500" /> Registrado como:
                </span>
                <span className="text-white font-medium">{submittedNickname}</span>
              </div>
            )}

            {/* TABLA: THE SPEZIAL ONES */}
            <div className="space-y-3 border-t border-zinc-900 pt-5">
              <div className="flex justify-between items-center text-xs font-mono">
                <div className="flex items-center gap-2">
                  <span className="uppercase tracking-[0.2em] text-zinc-300 font-medium">The Spezial Ones</span>
                  <span className="text-[10px] text-zinc-600">· HOY</span>
                </div>
                {isLoadingLeaderboard && (
                  <span className="text-[10px] text-zinc-600 animate-pulse">Actualizando...</span>
                )}
              </div>

              <div className="border border-zinc-900 rounded-xl overflow-hidden bg-zinc-950/30 divide-y divide-zinc-900/60 font-mono text-xs">
                {leaderboard.length === 0 ? (
                  <p className="p-4 text-center text-zinc-600 text-[11px]">
                    Nadie ha reclamado su puesto todavía. Sé el primer Special One del día.
                  </p>
                ) : (
                  leaderboard.map((entry, index) => {
                    const isFirst = index === 0;
                    const isPodium = index < 3;
                    const isCurrentUser = submittedNickname && entry.nickname === submittedNickname;
                    return (
                      <div
                        key={entry.id}
                        className={`flex items-center justify-between px-3.5 py-2.5 transition ${
                          isCurrentUser ? "bg-zinc-900/50 text-white" : "text-zinc-400"
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <span className={`w-4 text-center font-semibold text-[11px] ${
                            isFirst
                              ? "text-amber-400"
                              : index === 1
                              ? "text-zinc-300"
                              : index === 2
                              ? "text-amber-700"
                              : "text-zinc-600"
                          }`}>
                            {index + 1}
                          </span>
                          <span className={`truncate max-w-[150px] ${isPodium ? "text-zinc-200" : ""}`}>
                            {entry.nickname} {isFirst && <span className="text-[10px] text-amber-400/90 ml-1">✦</span>}
                          </span>
                        </div>
                        <span className="text-right text-zinc-300 font-semibold tabular-nums">
                          {entry.score} <span className="text-[10px] text-zinc-600 font-normal">pts</span>
                        </span>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* Desglose */}
            <div className="space-y-2 border-t border-zinc-900 pt-4">
              <p className="font-mono text-[11px] uppercase tracking-widest text-zinc-500 mb-3">
                Desglose de tus respuestas
              </p>
              {results.map((r, i) => {
                const isSpecial = r.success && r.rarity <= 20;
                return (
                  <div
                    key={i}
                    className="flex justify-between items-center py-2.5 px-3 border border-zinc-900 rounded-lg bg-zinc-950/30 text-xs"
                  >
                    <div className="truncate pr-2">
                      <div className="flex items-center gap-1.5 text-[10px] text-zinc-500 font-mono">
                        <span>R{i + 1}</span>
                        <span>·</span>
                        <span className="truncate">{r.category}</span>
                      </div>
                      <p className="text-zinc-300 font-normal truncate mt-0.5">{r.question}</p>
                      <p className="text-[11px] text-zinc-500 mt-0.5">
                        <span className="text-zinc-200">{r.answer}</span>
                        {r.success && normalize(r.answer) !== normalize(r.canonicalAnswer) && (
                          <span className="text-zinc-500 ml-1">({r.canonicalAnswer})</span>
                        )}
                      </p>
                    </div>
                    <div className="text-right pl-3 font-mono shrink-0">
                      {r.success ? (
                        <div>
                          <span className={`font-semibold ${isSpecial ? "text-amber-300" : "text-zinc-200"}`}>
                            +{r.score}
                          </span>
                          <p className="text-[10px] text-zinc-500">
                            {r.rarity}% {isSpecial && "✦"}
                          </p>
                        </div>
                      ) : (
                        <span className="text-zinc-600 font-semibold">0 pts</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Acciones */}
            <div className="space-y-3">
              <div className="flex items-center justify-between text-xs font-mono text-zinc-500 py-2 border-b border-zinc-900">
                <span className="flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5" /> Próximo reto
                </span>
                <span className="text-white tracking-widest tabular-nums">{timeToNext}</span>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={copyShareText}
                  className="flex-1 flex items-center justify-center gap-2 px-6 py-3.5 bg-white hover:bg-zinc-200 text-black font-medium text-xs rounded-lg uppercase tracking-wider transition"
                >
                  {copied ? <Check className="w-4 h-4 text-emerald-600" /> : <Share2 className="w-4 h-4" />}
                  <span>{copied ? "Copiado" : "Compartir"}</span>
                </button>

                {IS_DEV && (
                  <button
                    onClick={shuffleQuestionsForTesting}
                    className="px-4 py-3.5 border border-zinc-800 hover:border-zinc-600 text-zinc-400 hover:text-white rounded-lg transition"
                    title="Probar otra combinación aleatoria (Dev)"
                  >
                    <Shuffle className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>

            {/* Reset en dev */}
            {IS_DEV && (
              <div className="text-center pt-2">
                <button
                  onClick={resetDailyProgressForDev}
                  className="text-[10px] font-mono text-zinc-600 hover:text-zinc-400 uppercase tracking-widest transition"
                >
                  [Reset reto diario (Dev)]
                </button>
              </div>
            )}
          </div>
        )}

      </div>

      {/* FOOTER */}
      <footer className="w-full max-w-lg mx-auto text-center border-t border-zinc-900 pt-4">
        <p className="font-mono text-[11px] text-zinc-600 tracking-wider">
          SPEZIAL — DISEÑADO PARA LOS QUE NO SIGUEN LA NORMA
        </p>
      </footer>

    </main>
  );
}
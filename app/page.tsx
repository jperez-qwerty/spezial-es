"use client";

import React, { useState, useEffect } from "react";
import confetti from "canvas-confetti";
import { Timer, Trophy, Share2, RefreshCw, AlertCircle, Loader2 } from "lucide-react";
import { supabase } from "./lib/supabase";

interface AnswerOption {
  text: string;
  defaultRarity: number;
}

interface Question {
  id: number;
  prompt: string;
  category: string;
  valid_answers: AnswerOption[];
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

  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }

  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }

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

export default function Home() {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [isLoadingQuestions, setIsLoadingQuestions] = useState(true);
  const [gameState, setGameState] = useState<"intro" | "playing" | "summary">("intro");
  const [currentIndex, setCurrentIndex] = useState(0);
  const [timeLeft, setTimeLeft] = useState(15);
  const [inputVal, setInputVal] = useState("");
  const [feedback, setFeedback] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [results, setResults] = useState<
    Array<{
      question: string;
      answer: string;
      canonicalAnswer: string;
      rarity: number;
      score: number;
      success: boolean;
    }>
  >([]);

  // 1. Cargar preguntas directamente desde Supabase al inicio
  useEffect(() => {
    async function fetchQuestions() {
      try {
        const { data, error } = await supabase
          .from("questions")
          .select("id, prompt, category, valid_answers")
          .order("id", { ascending: true });

        if (error) throw error;
        if (data && data.length > 0) {
          setQuestions(data as Question[]);
        }
      } catch (err) {
        console.error("Error al cargar preguntas de Supabase:", err);
      } finally {
        setIsLoadingQuestions(false);
      }
    }

    fetchQuestions();
  }, []);

  // 2. Temporizador
  useEffect(() => {
    if (gameState !== "playing") return;

    if (timeLeft === 0) {
      handleTimeout();
      return;
    }

    const timer = setInterval(() => {
      setTimeLeft((prev) => prev - 1);
    }, 1000);

    return () => clearInterval(timer);
  }, [gameState, timeLeft]);

  const startGame = () => {
    if (questions.length === 0) return;
    setGameState("playing");
    setCurrentIndex(0);
    setTimeLeft(15);
    setResults([]);
    setFeedback(null);
    setInputVal("");
  };

  const handleTimeout = () => {
    const currentQ = questions[currentIndex];
    setResults((prev) => [
      ...prev,
      {
        question: currentQ.prompt,
        answer: "Tiempo agotado",
        canonicalAnswer: "-",
        rarity: 100,
        score: 0,
        success: false
      }
    ]);
    advanceQuestion();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputVal.trim() || gameState !== "playing" || isSubmitting) return;

    const currentQ = questions[currentIndex];
    const match = findFuzzyMatch(inputVal, currentQ.valid_answers || []);

    if (match) {
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
      setResults((prev) => [
        ...prev,
        {
          question: currentQ.prompt,
          answer: inputVal,
          canonicalAnswer: match.text,
          rarity: calculatedRarity,
          score: points,
          success: true
        }
      ]);
      advanceQuestion();
    } else {
      setFeedback("Respuesta no válida para esta categoría");
      setTimeout(() => setFeedback(null), 1800);
    }
  };

  const advanceQuestion = () => {
    setInputVal("");
    setFeedback(null);
    if (currentIndex + 1 < questions.length) {
      setCurrentIndex((prev) => prev + 1);
      setTimeLeft(15);
    } else {
      setGameState("summary");
      confetti({ particleCount: 120, spread: 70, origin: { y: 0.6 } });
    }
  };

  const totalScore = results.reduce((acc, r) => acc + r.score, 0);

  const copyShareText = () => {
    const shareText = `🌊 Krillion Español - Reto Diario\n` +
      `Puntuación total: ${totalScore} pts\n` +
      results
        .map((r) => (r.success ? (r.rarity < 20 ? "🪸" : "🐟") : "❌"))
        .join("") +
      `\n\nJuega aquí: https://spezial-es.vercel.app`;

    navigator.clipboard.writeText(shareText);
    alert("¡Resultado copiado al portapapeles!");
  };

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center p-4">
      <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl">
        
        {/* PANTALLA DE CARGA */}
        {isLoadingQuestions && (
          <div className="text-center py-12 space-y-4">
            <Loader2 className="w-8 h-8 text-teal-400 animate-spin mx-auto" />
            <p className="text-slate-400 text-sm">Cargando preguntas de la base de datos...</p>
          </div>
        )}

        {/* PANTALLA 1: INTRO */}
        {!isLoadingQuestions && gameState === "intro" && (
          <div className="text-center space-y-6">
            <div className="inline-block p-4 bg-teal-500/10 rounded-full text-teal-400">
              <Trophy className="w-12 h-12" />
            </div>
            <div>
              <h1 className="text-3xl font-extrabold tracking-tight text-teal-400">
                Krillion Español
              </h1>
              <p className="text-slate-400 mt-2 text-sm leading-relaxed">
                El objetivo no es solo acertar, sino dar la respuesta correcta <b>más rara</b> según la comunidad.
              </p>
            </div>
            <div className="bg-slate-800/50 p-4 rounded-xl text-left text-xs text-slate-300 space-y-2 border border-slate-800">
              <p>⏱️ <b>15 segundos</b> por pregunta.</p>
              <p>🪸 Respuestas raras otorgan mayor puntuación.</p>
              <p>✨ Preguntas dinámicas sincronizadas en tiempo real.</p>
            </div>
            <button
              onClick={startGame}
              disabled={questions.length === 0}
              className="w-full py-3 bg-teal-500 hover:bg-teal-400 text-slate-950 font-bold rounded-xl transition duration-200 disabled:opacity-50"
            >
              Comenzar Inmersión
            </button>
          </div>
        )}

        {/* PANTALLA 2: JUEGO ACTIVO */}
        {!isLoadingQuestions && gameState === "playing" && questions.length > 0 && (
          <div className="space-y-6">
            <div className="flex justify-between items-center text-sm font-medium">
              <span className="text-teal-400">
                Pregunta {currentIndex + 1} de {questions.length}
              </span>
              <div className="flex items-center gap-1.5 text-amber-400 font-mono text-base">
                <Timer className="w-5 h-5 animate-pulse" />
                <span>{timeLeft}s</span>
              </div>
            </div>

            <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
              <div
                className={`h-full transition-all duration-1000 ${
                  timeLeft <= 5 ? "bg-rose-500" : "bg-teal-500"
                }`}
                style={{ width: `${(timeLeft / 15) * 100}%` }}
              />
            </div>

            <div className="py-4">
              <span className="text-xs uppercase tracking-wider text-slate-400 font-semibold">
                {questions[currentIndex].category}
              </span>
              <h2 className="text-2xl font-bold mt-1">
                {questions[currentIndex].prompt}
              </h2>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <input
                type="text"
                autoFocus
                disabled={isSubmitting}
                placeholder="Escribe tu respuesta..."
                value={inputVal}
                onChange={(e) => setInputVal(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500 disabled:opacity-50"
              />
              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full py-3 bg-teal-500 hover:bg-teal-400 text-slate-950 font-bold rounded-xl transition duration-200 disabled:opacity-50"
              >
                {isSubmitting ? "Guardando..." : "Enviar Respuesta"}
              </button>
            </form>

            {feedback && (
              <div className="flex items-center gap-2 text-rose-400 text-sm justify-center bg-rose-500/10 p-2.5 rounded-lg border border-rose-500/20">
                <AlertCircle className="w-4 h-4" />
                <span>{feedback}</span>
              </div>
            )}
          </div>
        )}

        {/* PANTALLA 3: RESULTADOS */}
        {!isLoadingQuestions && gameState === "summary" && (
          <div className="text-center space-y-6">
            <h2 className="text-2xl font-bold text-teal-400">Inmersión Completada</h2>
            <div className="bg-slate-950 p-4 rounded-xl border border-slate-800">
              <span className="text-xs text-slate-400 uppercase tracking-wide">Puntuación Total</span>
              <p className="text-4xl font-black text-white mt-1">{totalScore} <span className="text-base font-normal text-slate-400">pts</span></p>
            </div>

            <div className="space-y-2 text-left">
              {results.map((r, i) => (
                <div
                  key={i}
                  className="flex justify-between items-center p-3 bg-slate-800/40 rounded-lg text-sm border border-slate-800/60"
                >
                  <div className="truncate pr-2">
                    <p className="font-semibold text-slate-200 truncate">{r.question}</p>
                    <p className="text-xs text-slate-400">
                      Tu respuesta: <span className="text-slate-200 font-medium">{r.answer}</span>
                      {r.success && normalize(r.answer) !== normalize(r.canonicalAnswer) && (
                        <span className="text-teal-400 text-[11px] ml-1">
                          (corregido a {r.canonicalAnswer})
                        </span>
                      )}
                    </p>
                  </div>
                  <div className="text-right">
                    {r.success ? (
                      <div>
                        <span className="text-emerald-400 font-mono font-bold">+{r.score}</span>
                        <p className="text-[10px] text-slate-500">Popularidad: {r.rarity}%</p>
                      </div>
                    ) : (
                      <span className="text-rose-400 font-bold">0 pts</span>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <div className="flex gap-3">
              <button
                onClick={copyShareText}
                className="flex-1 flex items-center justify-center gap-2 py-3 bg-teal-500 hover:bg-teal-400 text-slate-950 font-bold rounded-xl transition duration-200"
              >
                <Share2 className="w-4 h-4" />
                Compartir
              </button>
              <button
                onClick={startGame}
                className="px-4 py-3 bg-slate-800 hover:bg-slate-700 text-white rounded-xl transition duration-200"
                title="Jugar de nuevo"
              >
                <RefreshCw className="w-5 h-5" />
              </button>
            </div>
          </div>
        )}

      </div>
    </main>
  );
}
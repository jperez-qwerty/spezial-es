"use client";

import React, { useState, useEffect } from "react";
import confetti from "canvas-confetti";
import { Timer, Trophy, Share2, RefreshCw, AlertCircle } from "lucide-react";
import { supabase } from "./lib/supabase";

interface AnswerOption {
  text: string;
  defaultRarity: number; // Porcentaje base por si aún hay pocos votos
}

interface Question {
  id: number;
  prompt: string;
  category: string;
  validAnswers: AnswerOption[];
}

const QUESTIONS: Question[] = [
  {
    id: 1,
    prompt: "Un país de América del Sur",
    category: "Geografía",
    validAnswers: [
      { text: "surinam", defaultRarity: 4 },
      { text: "guyana", defaultRarity: 6 },
      { text: "paraguay", defaultRarity: 15 },
      { text: "uruguay", defaultRarity: 22 },
      { text: "bolivia", defaultRarity: 30 },
      { text: "peru", defaultRarity: 55 },
      { text: "chile", defaultRarity: 60 },
      { text: "colombia", defaultRarity: 75 },
      { text: "argentina", defaultRarity: 92 },
      { text: "brasil", defaultRarity: 95 }
    ]
  },
  {
    id: 2,
    prompt: "Una fruta que empiece por la letra M",
    category: "Alimentos",
    validAnswers: [
      { text: "maracuya", defaultRarity: 12 },
      { text: "mora", defaultRarity: 28 },
      { text: "mango", defaultRarity: 58 },
      { text: "melocoton", defaultRarity: 72 },
      { text: "manzana", defaultRarity: 96 }
    ]
  },
  {
    id: 3,
    prompt: "Un color del arcoíris",
    category: "Naturaleza",
    validAnswers: [
      { text: "anil", defaultRarity: 5 },
      { text: "indigo", defaultRarity: 8 },
      { text: "violeta", defaultRarity: 24 },
      { text: "naranja", defaultRarity: 42 },
      { text: "amarillo", defaultRarity: 68 },
      { text: "verde", defaultRarity: 78 },
      { text: "rojo", defaultRarity: 94 },
      { text: "azul", defaultRarity: 95 }
    ]
  },
  {
    id: 4,
    prompt: "Un instrumento musical de viento",
    category: "Música",
    validAnswers: [
      { text: "fagot", defaultRarity: 7 },
      { text: "oboe", defaultRarity: 14 },
      { text: "tuba", defaultRarity: 22 },
      { text: "clarinete", defaultRarity: 48 },
      { text: "trompeta", defaultRarity: 74 },
      { text: "flauta", defaultRarity: 89 }
    ]
  },
  {
    id: 5,
    prompt: "Un elemento de la tabla periódica",
    category: "Ciencia",
    validAnswers: [
      { text: "xenon", defaultRarity: 6 },
      { text: "tungsteno", defaultRarity: 10 },
      { text: "mercurio", defaultRarity: 32 },
      { text: "plata", defaultRarity: 52 },
      { text: "oro", defaultRarity: 78 },
      { text: "oxigeno", defaultRarity: 91 },
      { text: "hidrogeno", defaultRarity: 96 }
    ]
  }
];

function normalize(str: string): string {
  return str
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

export default function Home() {
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
      rarity: number;
      score: number;
      success: boolean;
    }>
  >([]);

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
    setGameState("playing");
    setCurrentIndex(0);
    setTimeLeft(15);
    setResults([]);
    setFeedback(null);
    setInputVal("");
  };

  const handleTimeout = () => {
    const currentQ = QUESTIONS[currentIndex];
    setResults((prev) => [
      ...prev,
      {
        question: currentQ.prompt,
        answer: "Tiempo agotado",
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

    const currentQ = QUESTIONS[currentIndex];
    const cleanInput = normalize(inputVal);

    const match = currentQ.validAnswers.find((ans) => normalize(ans.text) === cleanInput);

    if (match) {
      setIsSubmitting(true);
      let calculatedRarity = match.defaultRarity;

      try {
        // 1. Guardar la respuesta en Supabase
        await supabase.from("answers").insert([
          {
            question_id: currentQ.id,
            raw_answer: inputVal.trim(),
            normalized_answer: cleanInput
          }
        ]);

        // 2. Consultar el total de respuestas de esta pregunta para calcular el porcentaje real
        const { count: totalVotes } = await supabase
          .from("answers")
          .select("*", { count: "exact", head: true })
          .eq("question_id", currentQ.id);

        const { count: thisAnswerVotes } = await supabase
          .from("answers")
          .select("*", { count: "exact", head: true })
          .eq("question_id", currentQ.id)
          .eq("normalized_answer", cleanInput);

        if (totalVotes && totalVotes > 5 && thisAnswerVotes) {
          // Si ya hay más de 5 respuestas registradas, usamos la popularidad real de la comunidad
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
    if (currentIndex + 1 < QUESTIONS.length) {
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
        
        {/* PANTALLA 1: INTRO */}
        {gameState === "intro" && (
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
              <p>🪸 Las respuestas menos elegidas por otros jugadores dan más puntos.</p>
              <p>🎯 Sin tildes ni mayúsculas.</p>
            </div>
            <button
              onClick={startGame}
              className="w-full py-3 bg-teal-500 hover:bg-teal-400 text-slate-950 font-bold rounded-xl transition duration-200"
            >
              Comenzar Inmersión
            </button>
          </div>
        )}

        {/* PANTALLA 2: JUEGO ACTIVO */}
        {gameState === "playing" && (
          <div className="space-y-6">
            <div className="flex justify-between items-center text-sm font-medium">
              <span className="text-teal-400">
                Pregunta {currentIndex + 1} de {QUESTIONS.length}
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
                {QUESTIONS[currentIndex].category}
              </span>
              <h2 className="text-2xl font-bold mt-1">
                {QUESTIONS[currentIndex].prompt}
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

        {/* PANTALLA 3: RESUMEN / RESULTADOS */}
        {gameState === "summary" && (
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
                    <p className="text-xs text-slate-400">Tu respuesta: <span className="text-slate-200">{r.answer}</span></p>
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
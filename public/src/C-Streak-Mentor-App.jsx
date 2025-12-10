import React, { useState, useEffect } from 'react';
import { 
  Terminal, 
  Send, 
  Flame, 
  Code2, 
  Cpu, 
  BookOpen, 
  RotateCcw,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  Wrench,
  Lightbulb,
  ShieldCheck,
  Globe
} from 'lucide-react';

// --- System Prompt Configuration ---

// 1. Main Mentor Prompt
const MENTOR_SYSTEM_PROMPT = `
You are an assistant embedded inside a web app called “C‑Streak Mentor”.  
Users paste C programs into the app once per day to maintain a coding streak and get help understanding their code.  

Your job is to:
- Predict what the given C program will print when compiled and run with no input (unless the user clearly specifies input).  
- Briefly explain the program’s behavior and any important C concepts involved.  
- Point out compilation errors, undefined behavior, or logical bugs if they exist.  
- Always encourage the user to understand and modify the code, not just copy answers.

### Rules about code and output

1. **When the user sends a C program, always do these steps in order:**
   - Check if the code is likely to compile (missing headers, main function, syntax errors).  
   - If it should compile, mentally “execute” it and write the exact text that would appear on stdout (including newlines and spaces) as clearly as possible.  
   - If it will not compile, describe the errors and show how to fix them.  
   - If it has undefined behavior, explain why and what could happen.

2. **Output format (Strict Markdown):**
   - Use a level 3 header for sections (###).
   - Section 1: ### Predicted Output
     - If it runs, show the exact output in a code block.
     - If it doesn’t compile, say "No output (does not compile)" and explain.
   - Section 2: ### Explanation
     - 3–8 short sentences or bullet points explaining how the code works, important lines, and any tricky parts.
   - Section 3: ### Improvements or Variations
     - Suggest 1–3 small improvements, refactors, or variations the user could try.

3. **Never claim to have actually executed the code.** - Use language like “This code will likely print:” or “The expected output is:”.  
   - If you are not sure about the exact output, say you are unsure.

4. **Do not write entire new solutions unless explicitly asked.** ### Streak app context
- Always respond in a way that **teaches** something new.
- Tone: friendly, concise, and technically correct.  
- Audience: beginner–intermediate C learners (engineering students).  
- Focus on control flow, data types, memory basics, and common pitfalls.
`;

// 2. Challenge Generator Prompt
const CHALLENGE_SYSTEM_PROMPT = `
You are a creative C programming instructor. 
Generate a single, fun, and concise coding challenge for a beginner/intermediate C student.
The challenge should be described in 1-2 sentences max.
Do NOT provide code, only the problem description.
Example: "Write a program that takes a user's birth year and calculates their age on other planets."
`;

// 3. Auto-Fix Prompt
const AUTOFIX_SYSTEM_PROMPT = `
You are an expert C code formatter and debugger.
Your task is to take the provided C code and fix any syntax errors, logical bugs, or bad formatting.
Return ONLY the corrected C code. 
Do NOT use Markdown code blocks (no backticks).
Do NOT include any explanations or conversational text.
Just the raw C code string.
`;

// 4. Anti-Cheat Time Check Prompt
const TIME_CHECK_SYSTEM_PROMPT = `
You are a precise time-keeping server. 
Use the Google Search tool to find the current date in UTC.
Return the date in strict JSON format: { "current_utc_date": "YYYY-MM-DD" }.
Do not explain. Only return JSON.
`;

const INITIAL_CODE = `#include <stdio.h>

int main() {
    int i;
    for (i = 0; i < 5; i++) {
        printf("Streak day: %d\\n", i + 1);
    }
    return 0;
}`;

export default function TechchatApp() {
  const [code, setCode] = useState(INITIAL_CODE);
  const [response, setResponse] = useState(null);
  const [loading, setLoading] = useState(false);
  const [streak, setStreak] = useState(0);
  const [lastSubmissionDate, setLastSubmissionDate] = useState(null);
  const [error, setError] = useState(null);
  
  // New States for Features
  const [challenge, setChallenge] = useState(null);
  const [loadingChallenge, setLoadingChallenge] = useState(false);
  const [loadingFix, setLoadingFix] = useState(false);
  const [timeVerified, setTimeVerified] = useState(false);

  // Load streak from local storage on mount
  useEffect(() => {
    const storedStreak = localStorage.getItem('techchat_streak');
    const storedDate = localStorage.getItem('techchat_last_date');
    
    if (storedStreak) setStreak(parseInt(storedStreak, 10));
    if (storedDate) setLastSubmissionDate(storedDate);
  }, []);

  // --- API Helper ---
  const callGeminiAPI = async (userText, systemPrompt, useSearch = false, jsonMode = false) => {
    const apiKey = ""; // API Key injected by environment
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`;

    const payload = {
      contents: [{ parts: [{ text: userText }] }],
      systemInstruction: { parts: [{ text: systemPrompt }] }
    };

    // Add tools for search grounding (used for time check)
    if (useSearch) {
      payload.tools = [{ google_search: {} }];
    }

    // Add JSON schema for structured output (used for time check)
    if (jsonMode) {
      payload.generationConfig = {
        responseMimeType: "application/json",
        responseSchema: {
          type: "OBJECT",
          properties: {
            current_utc_date: { type: "STRING" }
          }
        }
      };
    }

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!res.ok) throw new Error(`API Error: ${res.status}`);
    const data = await res.json();
    const resultText = data.candidates?.[0]?.content?.parts?.[0]?.text;
    
    if (!resultText) throw new Error("No response generated.");
    return resultText;
  };

  // --- Core Logic: Streak Update with Anti-Cheat ---
  const handleStreakUpdate = (verifiedDateString) => {
    // verifiedDateString should be "YYYY-MM-DD" from Gemini
    
    // Convert current stored date to comparable string if it exists
    // We assume lastSubmissionDate is stored as "YYYY-MM-DD" or "Date String"
    // To be safe, we normalize comparisons using the string from Gemini.

    if (lastSubmissionDate === verifiedDateString) {
      return; // Already submitted today (verified by server)
    }

    let newStreak = streak;
    
    if (lastSubmissionDate) {
      // Calculate difference between dates
      const lastDate = new Date(lastSubmissionDate);
      const todayDate = new Date(verifiedDateString);
      
      const diffTime = Math.abs(todayDate - lastDate);
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 

      if (diffDays === 1) {
        // Consecutive day
        newStreak += 1;
      } else if (diffDays > 1) {
        // Streak broken
        newStreak = 1;
      }
      // If diffDays === 0, caught by the first if check
    } else {
      // First ever submission
      newStreak = 1;
    }

    setStreak(newStreak);
    setLastSubmissionDate(verifiedDateString);
    localStorage.setItem('techchat_streak', newStreak.toString());
    localStorage.setItem('techchat_last_date', verifiedDateString);
    setTimeVerified(true);
  };

  // --- Main Submission Handler ---
  const handleSubmit = async () => {
    if (!code.trim()) return;
    
    setLoading(true);
    setError(null);
    setResponse(null);
    setTimeVerified(false);

    try {
      // Execute tasks in parallel for speed
      // 1. Get Code Review
      const reviewPromise = callGeminiAPI(code, MENTOR_SYSTEM_PROMPT);
      
      // 2. Get Real Time (Anti-Cheat)
      // We ask specifically for the date to prevent system clock manipulation
      const timePromise = callGeminiAPI(
        "What is the current UTC date?", 
        TIME_CHECK_SYSTEM_PROMPT, 
        true, // Enable Search
        true  // JSON Mode
      );

      const [reviewText, timeJsonString] = await Promise.all([reviewPromise, timePromise]);
      
      // Process Review
      setResponse(reviewText);

      // Process Time
      try {
        const timeData = JSON.parse(timeJsonString);
        if (timeData.current_utc_date) {
          handleStreakUpdate(timeData.current_utc_date);
        } else {
          console.warn("Date format unexpected", timeData);
          // Fallback if AI fails format: don't break app, just use local but warn console
          handleStreakUpdate(new Date().toISOString().split('T')[0]);
        }
      } catch (e) {
        console.error("Failed to parse verified time", e);
        // Fallback for robustness
        handleStreakUpdate(new Date().toISOString().split('T')[0]);
      }

    } catch (err) {
      console.error(err);
      setError("Connection failed. Please check your internet and try again.");
    } finally {
      setLoading(false);
    }
  };

  // --- Feature: Daily Challenge ---
  const generateChallenge = async () => {
    setLoadingChallenge(true);
    setChallenge(null);
    try {
      const challengeText = await callGeminiAPI("Give me a challenge", CHALLENGE_SYSTEM_PROMPT);
      setChallenge(challengeText);
    } catch (err) {
      console.error(err);
      setError("Could not generate a challenge.");
    } finally {
      setLoadingChallenge(false);
    }
  };

  // --- Feature: Auto-Fix ---
  const autoFixCode = async () => {
    if (!code.trim()) return;
    setLoadingFix(true);
    try {
      const fixedCode = await callGeminiAPI(code, AUTOFIX_SYSTEM_PROMPT);
      const cleanCode = fixedCode.replace(/```c/g, '').replace(/```/g, '').trim();
      setCode(cleanCode);
    } catch (err) {
      console.error(err);
      setError("Failed to auto-fix code.");
    } finally {
      setLoadingFix(false);
    }
  };

  // Helper to parse the Markdown output simply for rendering
  const renderResponseSection = (text) => {
    const parts = text.split('###');
    return parts.map((part, index) => {
      if (!part.trim()) return null;
      
      const lines = part.trim().split('\n');
      const title = lines[0].trim();
      const content = lines.slice(1).join('\n').trim();
      
      let icon = <BookOpen className="w-5 h-5 text-blue-400" />;
      if (title.includes("Predicted")) icon = <Terminal className="w-5 h-5 text-green-400" />;
      if (title.includes("Explanation")) icon = <Cpu className="w-5 h-5 text-purple-400" />;
      if (title.includes("Improvements")) icon = <Sparkles className="w-5 h-5 text-yellow-400" />;

      return (
        <div key={index} className="mb-6 bg-slate-800/50 rounded-lg p-4 border border-slate-700">
          <h3 className="flex items-center gap-2 text-lg font-semibold text-slate-200 mb-3">
            {icon}
            {title}
          </h3>
          <div className="prose prose-invert max-w-none text-slate-300 text-sm leading-relaxed whitespace-pre-wrap">
            {content}
          </div>
        </div>
      );
    });
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans selection:bg-blue-500/30">
      {/* Header */}
      <header className="border-b border-slate-800 bg-slate-900/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="bg-blue-600 p-2 rounded-lg">
              <Code2 className="w-5 h-5 text-white" />
            </div>
            <h1 className="text-xl font-bold bg-gradient-to-r from-blue-400 to-cyan-300 bg-clip-text text-transparent">
              Techchat
            </h1>
            <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 border border-slate-700 ml-2 hidden sm:inline-block">
              C-Streak Mentor
            </span>
          </div>
          
          <div className="flex items-center gap-4">
            <button 
              onClick={generateChallenge}
              disabled={loadingChallenge}
              className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-800 hover:bg-slate-700 border border-slate-700 transition-all text-xs font-semibold text-purple-300 hover:text-purple-200 disabled:opacity-50"
            >
              {loadingChallenge ? (
                <div className="w-3 h-3 border-2 border-purple-400 border-t-transparent rounded-full animate-spin"></div>
              ) : (
                <Sparkles className="w-3 h-3" />
              )}
              {loadingChallenge ? "Generating..." : "Get Daily Challenge"}
            </button>

            <div className={`
              flex items-center gap-2 px-3 py-1.5 rounded-full border shadow-sm transition-colors duration-500
              ${timeVerified ? 'bg-blue-900/30 border-blue-700/50' : 'bg-slate-900 border-slate-800'}
            `}>
              <Flame className={`w-4 h-4 ${streak > 0 ? 'text-orange-500 fill-orange-500' : 'text-slate-600'}`} />
              <span className="font-bold text-slate-200">{streak}</span>
              <span className="text-xs text-slate-500 uppercase tracking-wider font-semibold mr-1">Day Streak</span>
              {timeVerified && (
                <ShieldCheck className="w-3 h-3 text-blue-400 ml-1" title="Time verified by Gemini Server" />
              )}
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6 grid lg:grid-cols-2 gap-6 h-[calc(100vh-4rem)]">
        
        {/* Left Column: Code Editor */}
        <div className="flex flex-col gap-4 min-h-[500px]">
          
          {/* Editor Header */}
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-blue-500"></span>
              Daily Submission
            </h2>
            <div className="flex items-center gap-3">
              <button 
                onClick={autoFixCode}
                disabled={loadingFix || !code.trim()}
                className="text-xs text-emerald-400 hover:text-emerald-300 flex items-center gap-1 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                title="Automatically fix syntax and logical errors"
              >
                {loadingFix ? (
                  <div className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin"></div>
                ) : (
                  <Wrench className="w-3 h-3" /> 
                )}
                ✨ Auto-Fix
              </button>
              <button 
                onClick={() => setCode(INITIAL_CODE)}
                className="text-xs text-slate-500 hover:text-blue-400 flex items-center gap-1 transition-colors"
              >
                <RotateCcw className="w-3 h-3" /> Reset
              </button>
            </div>
          </div>

          {/* Editor Area */}
          <div className="flex-1 relative group">
            <div className="absolute inset-0 bg-gradient-to-br from-blue-500/10 to-purple-500/5 rounded-xl blur-xl opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
            <textarea
              value={code}
              onChange={(e) => setCode(e.target.value)}
              className="relative w-full h-full bg-slate-900 p-6 rounded-xl border border-slate-800 text-sm font-mono text-blue-100 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 resize-none shadow-inner custom-scrollbar leading-6"
              spellCheck="false"
              placeholder="// Paste your C code here for your daily review..."
            />
          </div>

          {/* Submit Action */}
          <div className="flex justify-end pt-2">
            <button
              onClick={handleSubmit}
              disabled={loading || !code.trim()}
              className={`
                flex items-center gap-2 px-6 py-3 rounded-lg font-semibold text-sm transition-all duration-200
                ${loading 
                  ? 'bg-slate-800 text-slate-500 cursor-not-allowed' 
                  : 'bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-900/20 hover:shadow-blue-900/40 active:transform active:scale-95'
                }
              `}
            >
              {loading ? (
                <>
                  <div className="w-4 h-4 border-2 border-slate-400 border-t-transparent rounded-full animate-spin"></div>
                  Verifying & Analyzing...
                </>
              ) : (
                <>
                  <Send className="w-4 h-4" />
                  Submit for Review
                </>
              )}
            </button>
          </div>
        </div>

        {/* Right Column: Mentor Feedback */}
        <div className="flex flex-col gap-4 h-full overflow-hidden">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-purple-500"></span>
              Mentor Feedback
            </h2>
            
            {/* Mobile-only Challenge Button */}
            <button 
              onClick={generateChallenge}
              disabled={loadingChallenge}
              className="md:hidden flex items-center gap-1 text-xs text-purple-400"
            >
              <Sparkles className="w-3 h-3" />
              {loadingChallenge ? "..." : "Challenge"}
            </button>
          </div>

          <div className="flex-1 bg-slate-900 rounded-xl border border-slate-800 shadow-sm overflow-y-auto custom-scrollbar p-6 relative">
            
            {/* Challenge Card (if active) */}
            {challenge && (
              <div className="mb-6 p-4 rounded-lg bg-gradient-to-r from-purple-900/20 to-blue-900/20 border border-purple-500/30 animate-in fade-in slide-in-from-top-2">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h3 className="text-purple-300 font-semibold text-sm flex items-center gap-2 mb-2">
                      <Lightbulb className="w-4 h-4" />
                      Daily Challenge
                    </h3>
                    <p className="text-slate-300 text-sm leading-relaxed">
                      {challenge}
                    </p>
                  </div>
                  <button 
                    onClick={() => setChallenge(null)}
                    className="text-slate-500 hover:text-slate-400"
                  >
                    <span className="sr-only">Dismiss</span>
                    &times;
                  </button>
                </div>
              </div>
            )}

            {/* Empty State */}
            {!response && !loading && !error && !challenge && (
              <div className="h-full flex flex-col items-center justify-center text-center text-slate-500 space-y-4">
                <div className="p-4 bg-slate-800/50 rounded-full">
                  <Cpu className="w-8 h-8 text-slate-600" />
                </div>
                <div className="max-w-xs">
                  <p className="font-medium text-slate-300">Ready to Mentor</p>
                  <p className="text-sm mt-1">Submit your C code to maintain your streak and get feedback on logic and output.</p>
                  
                  <div className="mt-6 p-4 border border-slate-800 bg-slate-950/50 rounded-lg text-xs text-slate-500">
                    <p className="font-semibold text-slate-400 mb-2">Features:</p>
                    <div className="grid grid-cols-1 gap-2 text-left px-2">
                      <p className="flex items-center gap-2">
                        <Sparkles className="w-3 h-3 text-purple-400" /> Daily Challenges
                      </p>
                      <p className="flex items-center gap-2">
                        <Wrench className="w-3 h-3 text-emerald-400" /> Auto-Fix Code
                      </p>
                      <p className="flex items-center gap-2">
                        <ShieldCheck className="w-3 h-3 text-blue-400" /> Anti-Cheat Time Verification
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Error State */}
            {error && (
              <div className="p-4 bg-red-900/20 border border-red-900/50 rounded-lg flex items-start gap-3 text-red-200">
                <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
                <p className="text-sm">{error}</p>
              </div>
            )}

            {/* Loading State */}
            {loading && (
              <div className="space-y-6 animate-pulse">
                <div className="flex items-center gap-2 text-xs text-blue-400 mb-4">
                  <Globe className="w-3 h-3 animate-spin" />
                  Verifying date with Google Servers...
                </div>
                <div className="h-4 bg-slate-800 rounded w-1/3"></div>
                <div className="space-y-2">
                  <div className="h-32 bg-slate-800 rounded-lg"></div>
                </div>
                <div className="h-4 bg-slate-800 rounded w-1/4"></div>
              </div>
            )}

            {/* Success State - AI Response */}
            {response && !loading && (
              <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                {/* Success Banner */}
                <div className="mb-6 flex items-center justify-between text-green-400 bg-green-900/20 px-4 py-2 rounded-lg border border-green-900/30">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4" />
                    <span className="text-xs font-bold tracking-wide uppercase">Submission Reviewed</span>
                  </div>
                  {timeVerified && (
                    <div className="flex items-center gap-1 text-xs text-blue-400/80 border-l border-green-900/30 pl-3">
                      <ShieldCheck className="w-3 h-3" />
                      Verified
                    </div>
                  )}
                </div>
                
                {/* Parsed Content */}
                {renderResponseSection(response)}
              </div>
            )}

          </div>
        </div>

      </main>

      <style jsx global>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 8px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: #0f172a; 
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #334155; 
          border-radius: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: #475569; 
        }
      `}</style>
    </div>
  );
}

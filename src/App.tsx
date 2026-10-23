import React, { useState, useEffect, useRef, useMemo } from "react";
import {
  Play,
  Square,
  RotateCcw,
  Volume2,
  Trophy,
  CheckCircle2,
  XCircle,
  Plus,
  Minus,
  Music,
  Users,
  ArrowLeft,
  HelpCircle,
  Upload,
  Sliders,
  Disc3,
  Clock,
  FastForward,
  Search,
  RefreshCw,
} from "lucide-react";
import {
  SONGS_DATABASE,
  SongTrack,
  SongCategory,
  CATEGORY_LABELS,
  generateFourChoices,
} from "./data/songsDatabase";
import { soundEngine } from "./services/soundEngine";

const INITIAL_SNIPPET_SECONDS = 5;
const EXTRA_TIME_STEP_SECONDS = 5;
const MAX_SNIPPET_SECONDS = 25;
const PLAYED_SONGS_STORAGE_KEY = "beatquiz_played_song_ids_v2";
const CUSTOM_SONGS_STORAGE_KEY = "beatquiz_custom_songs_v2";
const HERO_STAGE_IMAGE =
  "/src/assets/images/music_quiz_stage_turntable_1792785344829.jpg";

export interface Team {
  id: string;
  name: string;
  score: number;
  correctCount: number;
  wrongCount: number;
  accentHex: string;
}

export interface RoundHistoryItem {
  turnId: number;
  roundNumber: number;
  teamName: string;
  songTitle: string;
  songArtist: string;
  selectedTitle: string;
  isCorrect: boolean;
  pointsAwarded: number;
}

type GameState = "TITLE_MENU" | "PLAYING" | "ROUND_SUMMARY" | "GAME_OVER";
type ActiveTab = "arena" | "setup" | "library" | "rules";

const DEFAULT_TEAM_PRESETS: { name: string; accentHex: string }[] = [
  { name: "קבוצת האריות", accentHex: "#F59E0B" },
  { name: "קבוצת הברק", accentHex: "#38BDF8" },
  { name: "קבוצת הקצב", accentHex: "#10B981" },
  { name: "קבוצת הסופות", accentHex: "#F43F5E" },
  { name: "קבוצת הכוכבים", accentHex: "#A855F7" },
  { name: "קבוצת הלהבה", accentHex: "#FB923C" },
];

const QUICK_IMPORT_ARTISTS = [
  "עומר אדם",
  "אייל גולן",
  "שלמה ארצי",
  "פאר טסי",
  "עדן חסון",
  "אושר כהן",
  "נועה קירל",
  "חנן בן ארי",
  "משינה",
  "כוורת",
  "עידן רייכל",
  "שרית חדד",
  "רביד פלוטניק",
  "טונה",
  "ליאור נרקיס",
  "דנה אינטרנשיונל",
  "Queen",
  "Coldplay",
  "ABBA",
  "Bruno Mars",
];

export default function App() {
  // Navigation & Game State Machine
  const [activeTab, setActiveTab] = useState<ActiveTab>("arena");
  const [gameState, setGameState] = useState<GameState>("TITLE_MENU");

  // Pre-defined Teams Configuration
  const [teams, setTeams] = useState<Team[]>(() =>
    DEFAULT_TEAM_PRESETS.slice(0, 3).map((preset, index) => ({
      id: `team-${index + 1}`,
      name: preset.name,
      score: 0,
      correctCount: 0,
      wrongCount: 0,
      accentHex: preset.accentHex,
    }))
  );

  // Configurable Game Rules & Scoring Settings
  const [totalRounds, setTotalRounds] = useState<number>(5);
  const [pointsPerCorrect, setPointsPerCorrect] = useState<number>(10);
  const [extraTimeCost, setExtraTimeCost] = useState<number>(5);
  const [hintCost, setHintCost] = useState<number>(2);

  // Time-Decay Scoring Mode Settings
  const [isTimeDecayMode, setIsTimeDecayMode] = useState<boolean>(false);
  const [guessTimeLimitSeconds, setGuessTimeLimitSeconds] =
    useState<number>(10);

  // Song Pool & Persistent Anti-Repetition History
  const [customSongs, setCustomSongs] = useState<SongTrack[]>(() => {
    try {
      const saved = localStorage.getItem(CUSTOM_SONGS_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch {
      // ignore storage errors
    }
    return [];
  });

  const [usedSongIds, setUsedSongIds] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem(PLAYED_SONGS_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch {
      // ignore
    }
    return [];
  });

  const [recentDistractorIds, setRecentDistractorIds] = useState<string[]>([]);

  const [selectedCategory, setSelectedCategory] = useState<
    "all" | SongCategory
  >("all");
  const [preferRealAudio, setPreferRealAudio] = useState<boolean>(true);

  // Live iTunes Batch Importer State
  const [discoverQuery, setDiscoverQuery] = useState<string>("");
  const [isImportingBatch, setIsImportingBatch] = useState<boolean>(false);
  const [importStatusMsg, setImportStatusMsg] = useState<string | null>(null);

  // Active Turn & Round State
  const [currentTeamIndex, setCurrentTeamIndex] = useState<number>(0);
  const [currentRound, setCurrentRound] = useState<number>(1);
  const [turnCounter, setTurnCounter] = useState<number>(1);
  const [currentSong, setCurrentSong] = useState<SongTrack | null>(null);
  const [currentChoices, setCurrentChoices] = useState<SongTrack[]>([]);
  const [selectedChoiceId, setSelectedChoiceId] = useState<string | null>(null);
  const [isAnswerCorrect, setIsAnswerCorrect] = useState<boolean | null>(null);
  const [lastAwardedPoints, setLastAwardedPoints] = useState<number>(0);
  const [winnerTeam, setWinnerTeam] = useState<Team | null>(null);
  const [roundHistory, setRoundHistory] = useState<RoundHistoryItem[]>([]);

  // Per-Turn Extras (Extra 5s purchases & Hint purchases)
  const [unlockedSeconds, setUnlockedSeconds] = useState<number>(
    INITIAL_SNIPPET_SECONDS
  );
  const [extraSecondsCount, setExtraSecondsCount] = useState<number>(0);
  const [showHint, setShowHint] = useState<boolean>(false);
  const [pointsSpentThisTurn, setPointsSpentThisTurn] = useState<number>(0);

  // Time-Decay Guess Timer State
  const [elapsedGuessTime, setElapsedGuessTime] = useState<number>(0);
  const guessTimerIntervalRef = useRef<number | null>(null);

  // Audio Playback & Continuation State
  const [isPlayingSnippet, setIsPlayingSnippet] = useState<boolean>(false);
  const [isPlayingContinuation, setIsPlayingContinuation] =
    useState<boolean>(false);
  const [playbackPositionSec, setPlaybackPositionSec] = useState<number>(0);
  const [spectrumBars, setSpectrumBars] = useState<number[]>(() =>
    new Array(24).fill(0.1)
  );
  const [audioSourceMode, setAudioSourceMode] = useState<
    "real_audio" | "studio_synth"
  >("real_audio");
  const [currentArtworkUrl, setCurrentArtworkUrl] = useState<
    string | undefined
  >(undefined);

  // Independent SoundEngine Volume Controls (Original Song Pre-Amp Boost vs. Accompaniment)
  const [originalSongVolume, setOriginalSongVolume] = useState<number>(() =>
    soundEngine.getOriginalSongVolume()
  );
  const [accompanimentVolume, setAccompanimentVolume] = useState<number>(() =>
    soundEngine.getAccompanimentVolume()
  );

  function handleOriginalSongVolumeChange(newVal: number) {
    const clamped = Math.max(0.1, Math.min(2.5, newVal));
    setOriginalSongVolume(clamped);
    soundEngine.setOriginalSongVolume(clamped);
  }

  function handleAccompanimentVolumeChange(newVal: number) {
    const clamped = Math.max(0.0, Math.min(1.5, newVal));
    setAccompanimentVolume(clamped);
    soundEngine.setAccompanimentVolume(clamped);
  }

  // Image fallback state
  const [heroImgBroken, setHeroImgBroken] = useState<boolean>(false);

  // Custom song form state in Library
  const [newSongTitle, setNewSongTitle] = useState("");
  const [newSongArtist, setNewSongArtist] = useState("");
  const [newSongHint, setNewSongHint] = useState("");
  const [newSongAudioUrl, setNewSongAudioUrl] = useState<string | undefined>(
    undefined
  );
  const [newSongFileName, setNewSongFileName] = useState<string>("");
  const [libraryFilterText, setLibraryFilterText] = useState<string>("");
  const audioFileInputRef = useRef<HTMLInputElement | null>(null);

  // Persist usedSongIds so songs don't repeat across games
  useEffect(() => {
    try {
      localStorage.setItem(
        PLAYED_SONGS_STORAGE_KEY,
        JSON.stringify(usedSongIds)
      );
    } catch {
      // ignore quota error
    }
  }, [usedSongIds]);

  // Persist custom / imported songs
  useEffect(() => {
    try {
      // Only persist non-blob URLs
      const serializable = customSongs.filter(
        (s) => !s.customAudioUrl?.startsWith("blob:")
      );
      localStorage.setItem(
        CUSTOM_SONGS_STORAGE_KEY,
        JSON.stringify(serializable)
      );
    } catch {
      // ignore
    }
  }, [customSongs]);

  const allSongs = useMemo(() => {
    const map = new Map<string, SongTrack>();
    for (const s of [...customSongs, ...SONGS_DATABASE]) {
      const key = `${s.title.toLowerCase().trim()}::${s.artist
        .toLowerCase()
        .trim()}`;
      if (!map.has(key)) {
        map.set(key, s);
      }
    }
    return Array.from(map.values());
  }, [customSongs]);

  const filteredSongPool = useMemo(() => {
    if (selectedCategory === "all") return allSongs;
    const filtered = allSongs.filter((s) => s.category === selectedCategory);
    return filtered.length >= 4 ? filtered : allSongs;
  }, [allSongs, selectedCategory]);

  const unplayedInPoolCount = useMemo(() => {
    return filteredSongPool.filter((s) => !usedSongIds.includes(s.id)).length;
  }, [filteredSongPool, usedSongIds]);

  const filteredLibrarySongs = useMemo(() => {
    if (!libraryFilterText.trim()) return allSongs;
    const q = libraryFilterText.toLowerCase();
    return allSongs.filter(
      (s) =>
        s.title.toLowerCase().includes(q) ||
        s.artist.toLowerCase().includes(q) ||
        s.categoryLabel.toLowerCase().includes(q)
    );
  }, [allSongs, libraryFilterText]);

  // Cleanup audio and timers on unmount, and ensure document title & clean storage on mount
  useEffect(() => {
    document.title = "BeatQuiz — משחק זיהוי שירים לקבוצות";
    try {
      localStorage.removeItem("doculens_il_records_v2");
      localStorage.removeItem("doculens_il_saved_emails_v1");
    } catch {
      // ignore
    }
    return () => {
      soundEngine.stopSongPlayback();
      if (guessTimerIntervalRef.current !== null) {
        window.clearInterval(guessTimerIntervalRef.current);
      }
    };
  }, []);

  // Calculate current potential points for a correct answer right now
  const currentPotentialPoints = useMemo(() => {
    let base = pointsPerCorrect;
    if (isTimeDecayMode && guessTimeLimitSeconds > 0) {
      const remainingRatio = Math.max(
        0,
        (guessTimeLimitSeconds - elapsedGuessTime) / guessTimeLimitSeconds
      );
      base = Math.round(pointsPerCorrect * remainingRatio);
    }
    return Math.max(0, base - pointsSpentThisTurn);
  }, [
    pointsPerCorrect,
    isTimeDecayMode,
    guessTimeLimitSeconds,
    elapsedGuessTime,
    pointsSpentThisTurn,
  ]);

  // Manage real-time Time-Decay countdown timer during PLAYING state
  useEffect(() => {
    if (guessTimerIntervalRef.current !== null) {
      window.clearInterval(guessTimerIntervalRef.current);
      guessTimerIntervalRef.current = null;
    }

    if (gameState !== "PLAYING" || !isTimeDecayMode) {
      return;
    }

    const startTimestamp = performance.now() - elapsedGuessTime * 1000;
    guessTimerIntervalRef.current = window.setInterval(() => {
      const nextElapsed = (performance.now() - startTimestamp) / 1000;
      if (nextElapsed >= guessTimeLimitSeconds) {
        setElapsedGuessTime(guessTimeLimitSeconds);
        if (guessTimerIntervalRef.current !== null) {
          window.clearInterval(guessTimerIntervalRef.current);
          guessTimerIntervalRef.current = null;
        }
        handleTimeoutFailure();
      } else {
        setElapsedGuessTime(nextElapsed);
      }
    }, 100);

    return () => {
      if (guessTimerIntervalRef.current !== null) {
        window.clearInterval(guessTimerIntervalRef.current);
        guessTimerIntervalRef.current = null;
      }
    };
  }, [gameState, isTimeDecayMode, guessTimeLimitSeconds, turnCounter]);

  function stopGuessTimer() {
    if (guessTimerIntervalRef.current !== null) {
      window.clearInterval(guessTimerIntervalRef.current);
      guessTimerIntervalRef.current = null;
    }
  }

  // Team Count Management (2 to 6 teams)
  function setTeamCount(count: number) {
    const clamped = Math.max(2, Math.min(6, count));
    setTeams((prev) => {
      if (clamped === prev.length) return prev;
      if (clamped < prev.length) {
        return prev.slice(0, clamped);
      }
      const next = [...prev];
      for (let i = prev.length; i < clamped; i++) {
        const preset = DEFAULT_TEAM_PRESETS[i] || {
          name: `קבוצה ${i + 1}`,
          accentHex: "#F59E0B",
        };
        next.push({
          id: `team-${i + 1}-${Date.now()}`,
          name: preset.name,
          score: 0,
          correctCount: 0,
          wrongCount: 0,
          accentHex: preset.accentHex,
        });
      }
      return next;
    });
  }

  function updateTeamName(index: number, newName: string) {
    setTeams((prev) =>
      prev.map((t, idx) => (idx === index ? { ...t, name: newName } : t))
    );
  }

  function pickNextSong(alreadyUsedIds: string[]): {
    song: SongTrack;
    updatedUsedIds: string[];
  } {
    let available = filteredSongPool.filter(
      (s) => !alreadyUsedIds.includes(s.id)
    );
    let nextUsedIds = [...alreadyUsedIds];

    // Only reset the pool's used IDs if every single song in this category has been played!
    if (available.length === 0) {
      const poolIds = new Set(filteredSongPool.map((s) => s.id));
      nextUsedIds = alreadyUsedIds.filter((id) => !poolIds.has(id));
      available = [...filteredSongPool];
    }

    // True random pick from unplayed songs, also preferring a different artist than the current song
    const diffArtistAvailable = currentSong
      ? available.filter((s) => s.artist !== currentSong.artist)
      : available;
    const candidateList =
      diffArtistAvailable.length > 0 ? diffArtistAvailable : available;

    const randomIndex = Math.floor(Math.random() * candidateList.length);
    const chosen = candidateList[randomIndex];
    nextUsedIds.push(chosen.id);

    // Pre-fetch 3 random unplayed songs in background for instant next turns
    const remaining = candidateList.filter((s) => s.id !== chosen.id);
    for (let i = 0; i < Math.min(3, remaining.length); i++) {
      const rnd = remaining[Math.floor(Math.random() * remaining.length)];
      soundEngine.prefetchSongPreview(rnd);
    }

    return { song: chosen, updatedUsedIds: nextUsedIds };
  }

  function playSongSnippetRange(
    song: SongTrack,
    startSec: number,
    durationSec: number
  ) {
    setIsPlayingSnippet(true);
    setIsPlayingContinuation(false);
    setPlaybackPositionSec(startSec);

    soundEngine.playSongSegment(song, {
      startSec,
      durationSec,
      preferRealAudio,
      onSourceResolved: (mode, artwork) => {
        setAudioSourceMode(mode);
        if (artwork) setCurrentArtworkUrl(artwork);
      },
      onProgress: (currentSec, bars) => {
        setPlaybackPositionSec(currentSec);
        setSpectrumBars(bars);
      },
      onComplete: () => {
        setIsPlayingSnippet(false);
        setPlaybackPositionSec(startSec + durationSec);
        setSpectrumBars(new Array(24).fill(0.1));
      },
    });
  }

  function playContinuationAfterAnswer(song: SongTrack, startFromSec: number) {
    setIsPlayingSnippet(false);
    soundEngine.scheduleContinuationAfterGuess(song, {
      startFromSec,
      continuationDurationSec: 18,
      delayMs: 750,
      preferRealAudio,
      onStart: () => {
        setIsPlayingContinuation(true);
      },
      onProgress: (currentSec, bars) => {
        setPlaybackPositionSec(currentSec);
        setSpectrumBars(bars);
      },
      onComplete: () => {
        setIsPlayingContinuation(false);
        setSpectrumBars(new Array(24).fill(0.1));
      },
    });
  }

  function startNewGame() {
    soundEngine.stopSongPlayback();
    stopGuessTimer();

    const sanitizedTeams = teams.map((t, idx) => ({
      ...t,
      name: t.name.trim() || `קבוצה ${idx + 1}`,
      score: 0,
      correctCount: 0,
      wrongCount: 0,
    }));

    setTeams(sanitizedTeams);
    setCurrentTeamIndex(0);
    setCurrentRound(1);
    setTurnCounter(1);
    setWinnerTeam(null);
    setRoundHistory([]);
    setSelectedChoiceId(null);
    setIsAnswerCorrect(null);
    setLastAwardedPoints(0);

    // Reset per-turn state
    setUnlockedSeconds(INITIAL_SNIPPET_SECONDS);
    setExtraSecondsCount(0);
    setShowHint(false);
    setPointsSpentThisTurn(0);
    setElapsedGuessTime(0);
    setCurrentArtworkUrl(undefined);

    // Keep usedSongIds from previous games so songs NEVER repeat!
    const { song, updatedUsedIds } = pickNextSong(usedSongIds);
    const choices = generateFourChoices(
      song,
      filteredSongPool,
      recentDistractorIds
    );
    const newDistractors = choices
      .filter((c) => c.id !== song.id)
      .map((c) => c.id);

    setUsedSongIds(updatedUsedIds);
    setRecentDistractorIds((prev) => [...newDistractors, ...prev].slice(0, 18));
    setCurrentSong(song);
    setCurrentChoices(choices);
    setGameState("PLAYING");
    setActiveTab("arena");

    // Immediately play the first 5 seconds of the original song
    playSongSnippetRange(song, 0, INITIAL_SNIPPET_SECONDS);
  }

  function handleBuyExtraFiveSeconds() {
    if (
      gameState !== "PLAYING" ||
      !currentSong ||
      unlockedSeconds >= MAX_SNIPPET_SECONDS
    ) {
      return;
    }

    const prevUnlocked = unlockedSeconds;
    const nextUnlocked = Math.min(
      MAX_SNIPPET_SECONDS,
      prevUnlocked + EXTRA_TIME_STEP_SECONDS
    );

    setUnlockedSeconds(nextUnlocked);
    setExtraSecondsCount((prev) => prev + 1);
    setPointsSpentThisTurn((prev) => prev + extraTimeCost);

    // Immediately play the newly unlocked 5 seconds of the original song!
    playSongSnippetRange(currentSong, prevUnlocked, EXTRA_TIME_STEP_SECONDS);
  }

  function handleBuyHint() {
    if (gameState !== "PLAYING" || showHint) return;
    setShowHint(true);
    setPointsSpentThisTurn((prev) => prev + hintCost);
  }

  function handleTimeoutFailure() {
    if (gameState !== "PLAYING" || !currentSong) return;

    soundEngine.stopSongPlayback();
    setIsPlayingSnippet(false);
    setSelectedChoiceId("TIMEOUT");
    setIsAnswerCorrect(false);
    setLastAwardedPoints(0);

    const activeTeam = teams[currentTeamIndex];
    setTeams((prev) =>
      prev.map((team, idx) =>
        idx === currentTeamIndex
          ? { ...team, wrongCount: team.wrongCount + 1 }
          : team
      )
    );

    setRoundHistory((prev) => [
      {
        turnId: turnCounter,
        roundNumber: currentRound,
        teamName: activeTeam.name,
        songTitle: currentSong.title,
        songArtist: currentSong.artist,
        selectedTitle: "נגמר הזמן לניחוש",
        isCorrect: false,
        pointsAwarded: 0,
      },
      ...prev,
    ]);

    soundEngine.playFailureSound();
    setGameState("ROUND_SUMMARY");
    playContinuationAfterAnswer(currentSong, unlockedSeconds);
  }

  function handleSelectOption(choice: SongTrack) {
    if (gameState !== "PLAYING" || !currentSong) return;

    stopGuessTimer();
    soundEngine.stopSongPlayback();
    setIsPlayingSnippet(false);

    const isCorrect = choice.id === currentSong.id;
    const awarded = isCorrect ? currentPotentialPoints : 0;

    setSelectedChoiceId(choice.id);
    setIsAnswerCorrect(isCorrect);
    setLastAwardedPoints(awarded);

    const activeTeam = teams[currentTeamIndex];
    const updatedTeams = teams.map((team, idx) => {
      if (idx !== currentTeamIndex) return team;
      return {
        ...team,
        score: team.score + awarded,
        correctCount: isCorrect ? team.correctCount + 1 : team.correctCount,
        wrongCount: !isCorrect ? team.wrongCount + 1 : team.wrongCount,
      };
    });

    setTeams(updatedTeams);

    setRoundHistory((prev) => [
      {
        turnId: turnCounter,
        roundNumber: currentRound,
        teamName: activeTeam.name,
        songTitle: currentSong.title,
        songArtist: currentSong.artist,
        selectedTitle: `${choice.title} — ${choice.artist}`,
        isCorrect,
        pointsAwarded: awarded,
      },
      ...prev,
    ]);

    if (isCorrect) {
      soundEngine.playSuccessSound();
    } else {
      soundEngine.playFailureSound();
    }

    setGameState("ROUND_SUMMARY");

    // After success or failure in guessing, automatically play more of the original song!
    playContinuationAfterAnswer(currentSong, unlockedSeconds);
  }

  function advanceToNextTeamTurn() {
    soundEngine.stopSongPlayback();
    stopGuessTimer();
    setIsPlayingSnippet(false);
    setIsPlayingContinuation(false);

    const isLastTeamInRound = currentTeamIndex === teams.length - 1;
    const isFinalRoundCompleted =
      isLastTeamInRound && currentRound >= totalRounds;

    if (isFinalRoundCompleted) {
      const sorted = [...teams].sort((a, b) => b.score - a.score);
      setWinnerTeam(sorted[0]);
      setGameState("GAME_OVER");
      soundEngine.playVictorySound();
      return;
    }

    const nextTeamIdx = (currentTeamIndex + 1) % teams.length;
    const nextRound = isLastTeamInRound ? currentRound + 1 : currentRound;

    const { song, updatedUsedIds } = pickNextSong(usedSongIds);
    const choices = generateFourChoices(
      song,
      filteredSongPool,
      recentDistractorIds
    );
    const newDistractors = choices
      .filter((c) => c.id !== song.id)
      .map((c) => c.id);

    setCurrentTeamIndex(nextTeamIdx);
    setCurrentRound(nextRound);
    setTurnCounter((prev) => prev + 1);
    setUsedSongIds(updatedUsedIds);
    setRecentDistractorIds((prev) => [...newDistractors, ...prev].slice(0, 18));
    setCurrentSong(song);
    setCurrentChoices(choices);
    setSelectedChoiceId(null);
    setIsAnswerCorrect(null);
    setLastAwardedPoints(0);

    // Reset per-turn state
    setUnlockedSeconds(INITIAL_SNIPPET_SECONDS);
    setExtraSecondsCount(0);
    setShowHint(false);
    setPointsSpentThisTurn(0);
    setElapsedGuessTime(0);
    setCurrentArtworkUrl(undefined);

    setGameState("PLAYING");
    playSongSnippetRange(song, 0, INITIAL_SNIPPET_SECONDS);
  }

  async function handleImportSongsFromItunes(termToSearch?: string) {
    const q = (termToSearch ?? discoverQuery).trim();
    if (!q || isImportingBatch) return;

    setIsImportingBatch(true);
    setImportStatusMsg(null);
    try {
      const res = await fetch(
        `/api/itunes-discover?term=${encodeURIComponent(q)}&limit=20`
      );
      if (!res.ok) {
        throw new Error("שגיאה בחיפוש שירים");
      }
      const data = await res.json();
      const tracks: any[] = Array.isArray(data?.tracks) ? data.tracks : [];
      if (tracks.length === 0) {
        setImportStatusMsg(`לא נמצאו שירים עבור "${q}". נסה שם אמן אחר.`);
        return;
      }

      const template = SONGS_DATABASE[0];
      const imported: SongTrack[] = tracks.map((t) => {
        const hasHebrew =
          /[\u0590-\u05FF]/.test(String(t.title)) ||
          /[\u0590-\u05FF]/.test(String(t.artist));
        const assignedCategory: SongCategory = !hasHebrew
          ? "international"
          : selectedCategory === "all" || selectedCategory === "international"
          ? "israeli_hits"
          : selectedCategory;

        return {
          id: `itunes-${t.trackId}`,
          title: t.title,
          artist: t.artist,
          year: t.year || 2024,
          category: assignedCategory,
          categoryLabel: CATEGORY_LABELS[assignedCategory],
          hint: `שיר של ${t.artist} (יצא בשנת ${t.year || 2024})`,
          itunesQuery: `${t.title} ${t.artist}`,
          customAudioUrl: t.previewUrl,
          bpm: 120,
          instrument: "synth_lead",
          melody: template.melody,
          bass: template.bass,
        };
      });

      setCustomSongs((prev) => {
        const existingIds = new Set(prev.map((s) => s.id));
        const fresh = imported.filter((s) => !existingIds.has(s.id));
        return [...fresh, ...prev];
      });
      setImportStatusMsg(
        `נוספו בהצלחה ${imported.length} שירים מקוריים של "${q}" למאגר המשחק!`
      );
      if (!termToSearch) setDiscoverQuery("");
    } catch {
      setImportStatusMsg("אירעה שגיאה בטעינת השירים מהקטלוג.");
    } finally {
      setIsImportingBatch(false);
    }
  }

  function handleCustomAudioUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const objectUrl = URL.createObjectURL(file);
    setNewSongAudioUrl(objectUrl);
    setNewSongFileName(file.name);
    if (!newSongTitle.trim()) {
      const cleanName = file.name.replace(/\.[^/.]+$/, "");
      setNewSongTitle(cleanName);
    }
  }

  function handleAddCustomSong(e: React.FormEvent) {
    e.preventDefault();
    if (!newSongTitle.trim() || !newSongArtist.trim()) return;

    const template = SONGS_DATABASE[0];
    const customTrack: SongTrack = {
      id: `custom-${Date.now()}`,
      title: newSongTitle.trim(),
      artist: newSongArtist.trim(),
      year: new Date().getFullYear(),
      category: "israeli_hits",
      categoryLabel: "שיר מותאם אישית",
      hint: newSongHint.trim() || "שיר שנוסף על ידי מנחה המשחק",
      itunesQuery: `${newSongTitle.trim()} ${newSongArtist.trim()}`,
      customAudioUrl: newSongAudioUrl,
      bpm: 124,
      instrument: "synth_lead",
      melody: template.melody,
      bass: template.bass,
    };

    setCustomSongs((prev) => [customTrack, ...prev]);
    setNewSongTitle("");
    setNewSongArtist("");
    setNewSongHint("");
    setNewSongAudioUrl(undefined);
    setNewSongFileName("");
  }

  const activeTeam = teams[currentTeamIndex] || teams[0];
  const nextTeam = teams[(currentTeamIndex + 1) % teams.length] || teams[0];
  const isLastTurnOfGame =
    currentTeamIndex === teams.length - 1 && currentRound >= totalRounds;

  const optionLetters = ["א", "ב", "ג", "ד"];

  return (
    <div
      dir="rtl"
      className="min-h-screen flex flex-col bg-[#0B1120] text-[#F8FAFC] selection:bg-amber-500 selection:text-slate-950"
    >
      {/* Top Bar Contract: Strictly 1 row, 3 zones separated by gap-8 */}
      <header className="flex items-center justify-between gap-8 px-6 py-4 bg-[#0F172A] border-b border-slate-800 sticky top-0 z-30">
        {/* Zone 1: Single text element wordmark */}
        <a
          href="#arena"
          onClick={(e) => {
            e.preventDefault();
            setActiveTab("arena");
          }}
          className="text-lg font-bold tracking-tight text-white font-display whitespace-nowrap shrink-0"
        >
          BeatQuiz · זהה את השיר המקורי
        </a>

        {/* Zone 2: 4 concise single-line navigation links */}
        <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-300">
          <button
            type="button"
            onClick={() => setActiveTab("arena")}
            className={`hover:text-white transition-colors whitespace-nowrap shrink-0 pb-0.5 cursor-pointer ${
              activeTab === "arena"
                ? "text-amber-400 border-b-2 border-amber-400 font-semibold"
                : ""
            }`}
          >
            זירת המשחק
          </button>
          <button
            type="button"
            onClick={() => {
              soundEngine.stopSongPlayback();
              stopGuessTimer();
              setIsPlayingSnippet(false);
              setIsPlayingContinuation(false);
              setActiveTab("setup");
            }}
            className={`hover:text-white transition-colors whitespace-nowrap shrink-0 pb-0.5 cursor-pointer ${
              activeTab === "setup"
                ? "text-amber-400 border-b-2 border-amber-400 font-semibold"
                : ""
            }`}
          >
            הגדרות וניקוד
          </button>
          <button
            type="button"
            onClick={() => {
              soundEngine.stopSongPlayback();
              stopGuessTimer();
              setIsPlayingSnippet(false);
              setIsPlayingContinuation(false);
              setActiveTab("library");
            }}
            className={`hover:text-white transition-colors whitespace-nowrap shrink-0 pb-0.5 cursor-pointer ${
              activeTab === "library"
                ? "text-amber-400 border-b-2 border-amber-400 font-semibold"
                : ""
            }`}
          >
            מאגר שירים ({allSongs.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("rules")}
            className={`hover:text-white transition-colors whitespace-nowrap shrink-0 pb-0.5 cursor-pointer ${
              activeTab === "rules"
                ? "text-amber-400 border-b-2 border-amber-400 font-semibold"
                : ""
            }`}
          >
            חוקים ובדיקת סאונד
          </button>
        </nav>

        {/* Zone 3: 1 primary action */}
        <div className="flex items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={() => {
              soundEngine.stopSongPlayback();
              stopGuessTimer();
              setIsPlayingSnippet(false);
              setIsPlayingContinuation(false);
              setGameState("TITLE_MENU");
              setActiveTab("arena");
            }}
            className="px-4 py-2 text-xs font-semibold text-slate-950 bg-amber-400 rounded-lg hover:bg-amber-300 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            הגדרת משחק חדש
          </button>
        </div>
      </header>

      {/* Main Content Container */}
      <main className="flex-1 w-full max-w-[1360px] mx-auto px-4 sm:px-6 py-6 sm:py-8">
        {/* TAB: LIBRARY (107+ Built-in Songs + One-Click iTunes Importer + Custom Upload) */}
        {activeTab === "library" && (
          <div className="space-y-8">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-5">
              <div>
                <h1 className="text-2xl sm:text-3xl font-bold font-display text-white">
                  מאגר השירים המקוריים ({allSongs.length} שירים במאגר)
                </h1>
                <p className="text-sm text-slate-400 mt-1">
                  שירים שכבר הושמעו במשחקים קודמים מסומנים ולא יחזרו על עצמם עד שכל המאגר יושמע · ניתן לייבא עשרות שירים נוספים בלחיצה
                </p>
              </div>
              <div className="flex items-center gap-3 self-start">
                {usedSongIds.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setUsedSongIds([])}
                    className="px-3.5 py-2 text-xs font-semibold text-slate-300 bg-[#1E293B] border border-slate-700 rounded-lg hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    איפוס שירים שהושמעו ({usedSongIds.length})
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setActiveTab("arena")}
                  className="px-4 py-2 text-sm font-semibold bg-amber-400 text-slate-950 rounded-lg hover:bg-amber-300 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  חזרה לזירת המשחק
                </button>
              </div>
            </div>

            {/* Live iTunes Batch Song Importer */}
            <div className="bg-[#1E293B] border border-slate-800 rounded-xl p-6 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <h2 className="text-lg font-bold text-white font-display">
                    הרחבת המאגר אונליין — ייבוא 20 שירים מקוריים לפי אמן או ז&apos;אנר
                  </h2>
                  <p className="text-xs text-slate-400 mt-0.5">
                    הקלידו שם של זמר/ת או להקה (או לחצו על אחד האמנים המהירים) כדי להוסיף מיד עד 20 להיטים מקוריים שלהם למאגר
                  </p>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row gap-3">
                <div className="relative flex-1">
                  <Search className="w-4 h-4 text-slate-400 absolute right-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={discoverQuery}
                    onChange={(e) => setDiscoverQuery(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        handleImportSongsFromItunes();
                      }
                    }}
                    placeholder="חפש אמן או להקה להוספת שירים (למשל: אייל גולן, שלמה ארצי, נועה קירל, Coldplay)..."
                    className="w-full pr-10 pl-4 py-2.5 text-sm bg-[#0F172A] border border-slate-700 rounded-lg text-white focus:outline-none focus:border-amber-400"
                  />
                </div>
                <button
                  type="button"
                  disabled={isImportingBatch || !discoverQuery.trim()}
                  onClick={() => handleImportSongsFromItunes()}
                  className="px-5 py-2.5 text-sm font-bold text-slate-950 bg-amber-400 hover:bg-amber-300 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50"
                >
                  {isImportingBatch ? "מייבא שירים..." : "ייבא 20 שירים למאגר"}
                </button>
              </div>

              {/* Quick Artist One-Click Import Buttons */}
              <div className="space-y-2">
                <div className="text-xs text-slate-400">
                  ייבוא מהיר בלחיצה אחת:
                </div>
                <div className="flex flex-wrap gap-2">
                  {QUICK_IMPORT_ARTISTS.map((artistName) => (
                    <button
                      key={artistName}
                      type="button"
                      disabled={isImportingBatch}
                      onClick={() => handleImportSongsFromItunes(artistName)}
                      className="px-3 py-1.5 text-xs font-medium text-slate-200 bg-[#0F172A] border border-slate-700 hover:border-amber-400 hover:text-amber-300 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50"
                    >
                      + {artistName}
                    </button>
                  ))}
                </div>
              </div>

              {importStatusMsg && (
                <div className="text-xs font-semibold text-emerald-400 bg-[#0F172A] border border-emerald-800/60 rounded-lg px-4 py-2.5">
                  {importStatusMsg}
                </div>
              )}
            </div>

            {/* Add Single Custom Song Form */}
            <form
              onSubmit={handleAddCustomSong}
              className="bg-[#1E293B] border border-slate-800 rounded-xl p-6 space-y-4"
            >
              <h2 className="text-lg font-bold text-white font-display">
                הוספת שיר בודד או העלאת קובץ MP3 מהמכשיר
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs text-slate-300 mb-1.5">
                    שם השיר
                  </label>
                  <input
                    type="text"
                    required
                    value={newSongTitle}
                    onChange={(e) => setNewSongTitle(e.target.value)}
                    placeholder="למשל: יוניקורן"
                    className="w-full px-3.5 py-2.5 text-sm bg-[#0F172A] border border-slate-700 rounded-lg text-white focus:outline-none focus:border-amber-400"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-300 mb-1.5">
                    שם האמן / להקה
                  </label>
                  <input
                    type="text"
                    required
                    value={newSongArtist}
                    onChange={(e) => setNewSongArtist(e.target.value)}
                    placeholder="למשל: נועה קירל"
                    className="w-full px-3.5 py-2.5 text-sm bg-[#0F172A] border border-slate-700 rounded-lg text-white focus:outline-none focus:border-amber-400"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-300 mb-1.5">
                    רמז לקבוצה (אופציונלי)
                  </label>
                  <input
                    type="text"
                    value={newSongHint}
                    onChange={(e) => setNewSongHint(e.target.value)}
                    placeholder="למשל: להיט מתוך האירוויזיון"
                    className="w-full px-3.5 py-2.5 text-sm bg-[#0F172A] border border-slate-700 rounded-lg text-white focus:outline-none focus:border-amber-400"
                  />
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-4 pt-2">
                <div className="flex items-center gap-3">
                  <input
                    ref={audioFileInputRef}
                    type="file"
                    accept="audio/*"
                    onChange={handleCustomAudioUpload}
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={() => audioFileInputRef.current?.click()}
                    className="flex items-center gap-2 px-4 py-2 text-xs font-semibold text-slate-200 bg-[#0F172A] border border-slate-700 rounded-lg hover:border-slate-500 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    <Upload className="w-4 h-4 text-amber-400" />
                    <span>
                      {newSongFileName
                        ? `קובץ נבחר: ${newSongFileName}`
                        : "העלאת קובץ MP3 / שמע (אופציונלי)"}
                    </span>
                  </button>
                </div>

                <button
                  type="submit"
                  className="px-5 py-2.5 text-sm font-semibold text-slate-950 bg-amber-400 rounded-lg hover:bg-amber-300 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  הוסף שיר למשחק
                </button>
              </div>
            </form>

            {/* Song List Table with Search */}
            <div className="bg-[#1E293B] border border-slate-800 rounded-xl overflow-hidden">
              <div className="p-4 border-b border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="text-sm font-bold text-white">
                  רשימת כל השירים במאגר ({filteredLibrarySongs.length})
                </div>
                <input
                  type="text"
                  value={libraryFilterText}
                  onChange={(e) => setLibraryFilterText(e.target.value)}
                  placeholder="סינון לפי שם שיר, אמן או קטגוריה..."
                  className="w-full sm:w-72 px-3.5 py-1.5 text-xs bg-[#0F172A] border border-slate-700 rounded-lg text-white focus:outline-none focus:border-amber-400"
                />
              </div>

              <div className="overflow-x-auto max-h-[540px] overflow-y-auto">
                <table className="w-full text-right text-sm">
                  <thead className="bg-[#0F172A] text-slate-400 text-xs border-b border-slate-800 sticky top-0">
                    <tr>
                      <th className="py-3.5 px-4 font-medium">#</th>
                      <th className="py-3.5 px-4 font-medium">שם השיר</th>
                      <th className="py-3.5 px-4 font-medium">אמן מבצע</th>
                      <th className="py-3.5 px-4 font-medium">קטגוריה ושנה</th>
                      <th className="py-3.5 px-4 font-medium">סטטוס</th>
                      <th className="py-3.5 px-4 font-medium">בדיקת שיר מקורי</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/80">
                    {filteredLibrarySongs.map((song, idx) => {
                      const alreadyPlayed = usedSongIds.includes(song.id);
                      return (
                        <tr
                          key={song.id}
                          className="hover:bg-slate-800/40 transition-colors"
                        >
                          <td className="py-3 px-4 font-mono-tabular text-slate-400">
                            {idx + 1}
                          </td>
                          <td className="py-3 px-4 font-semibold text-white">
                            {song.title}
                          </td>
                          <td className="py-3 px-4 text-slate-300">
                            {song.artist}
                          </td>
                          <td className="py-3 px-4 text-xs text-slate-400 tabular-nums">
                            {song.categoryLabel} · {song.year}
                          </td>
                          <td className="py-3 px-4 text-xs">
                            {alreadyPlayed ? (
                              <span className="text-slate-500">
                                הושמע לאחרונה
                              </span>
                            ) : (
                              <span className="text-emerald-400">
                                זמין להגרלה
                              </span>
                            )}
                          </td>
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() =>
                                  playSongSnippetRange(
                                    song,
                                    0,
                                    INITIAL_SNIPPET_SECONDS
                                  )
                                }
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-amber-300 bg-[#0F172A] border border-slate-700 rounded-lg hover:border-amber-400 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                              >
                                <Play className="w-3.5 h-3.5" />
                                <span>5 שניות ראשונות</span>
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  playSongSnippetRange(song, 5, 15)
                                }
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-300 bg-[#0F172A] border border-slate-700 rounded-lg hover:border-slate-500 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                              >
                                <FastForward className="w-3.5 h-3.5" />
                                <span>המשך השיר</span>
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* TAB: RULES & SOUND CHECK */}
        {activeTab === "rules" && (
          <div className="max-w-3xl mx-auto space-y-6">
            <div className="bg-[#1E293B] border border-slate-800 rounded-xl p-6 sm:p-8 space-y-6">
              <h1 className="text-2xl sm:text-3xl font-bold font-display text-white">
                חוקי המשחק, שיטת הניקוד ובדיקת סאונד
              </h1>

              <div className="space-y-4 text-slate-300 text-base leading-relaxed">
                <p>
                  <strong className="text-white">
                    01. הגדרת קבוצות, מספר סיבובים וניקוד:
                  </strong>{" "}
                  לפני תחילת המשחק מגדירים את הקבוצות, מספר הסיבובים למשחק, כמה
                  נקודות שווה ניחוש נכון (ברירת מחדל:{" "}
                  <strong className="text-amber-400">10 נקודות</strong>), כמה
                  עולה תוספת של 5 שניות מהשיר (ברירת מחדל:{" "}
                  <strong className="text-amber-400">5 נקודות</strong>) וכמה עולה
                  רמז.
                </p>
                <p>
                  <strong className="text-white">
                    02. מאגר עצום של מעל 107 שירים ללא חזרות:
                  </strong>{" "}
                  המשחק זוכר אילו שירים כבר הושמעו גם בין משחקים שונים, כך
                  שהשירים לא חוזרים על עצמם. בנוסף ניתן לייבא בלחיצה אחת עשרות
                  שירים נוספים של כל אמן מ-Apple Music / iTunes.
                </p>
                <p>
                  <strong className="text-white">
                    03. השמעת המשך השיר אחרי הצלחה או כישלון:
                  </strong>{" "}
                  מיד לאחר בחירת התשובה יושמע צליל הצלחה או צליל כישלון צורם,
                  ולאחריו{" "}
                  <strong className="text-amber-400">
                    יתנגן המשך השיר המקורי
                  </strong>{" "}
                  כדי שכל הקבוצות יוכלו לשמוע ולהכיר את השיר.
                </p>
                <p>
                  <strong className="text-white">
                    04. מוד ניקוד יורד לפי זמן (Time-Decay):
                  </strong>{" "}
                  ניתן להפעיל מוד שבו הניקוד יורד ככל שהשניות חולפות — לדוגמה, אם
                  נקבעו 10 שניות לניחוש ו-10 נקודות לתשובה נכונה, ניחוש אחרי 5
                  שניות יעניק לקבוצה 5 נקודות.
                </p>
              </div>

              <div className="pt-4 border-t border-slate-800 space-y-3">
                <h2 className="text-sm font-semibold text-slate-300">
                  בדיקת אפקטים קוליים:
                </h2>
                <div className="flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={() => soundEngine.playSuccessSound()}
                    className="flex items-center gap-2 px-4 py-2.5 text-xs font-semibold text-emerald-300 bg-[#0F172A] border border-emerald-800/70 rounded-lg hover:bg-emerald-950/50 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    <span>השמע צליל הצלחה</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => soundEngine.playFailureSound()}
                    className="flex items-center gap-2 px-4 py-2.5 text-xs font-semibold text-rose-300 bg-[#0F172A] border border-rose-800/70 rounded-lg hover:bg-rose-950/50 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    <XCircle className="w-4 h-4 text-rose-400" />
                    <span>השמע צליל כישלון צורם</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => soundEngine.playVictorySound()}
                    className="flex items-center gap-2 px-4 py-2.5 text-xs font-semibold text-amber-300 bg-[#0F172A] border border-amber-700/70 rounded-lg hover:bg-amber-950/50 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    <Trophy className="w-4 h-4 text-amber-400" />
                    <span>השמע צליל ניצחון לזוכה</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB: SETUP OR ARENA IN TITLE_MENU */}
        {(activeTab === "setup" ||
          (activeTab === "arena" && gameState === "TITLE_MENU")) && (
          <div className="space-y-8">
            {/* Hero Split Banner */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch bg-[#1E293B] border border-slate-800 rounded-2xl p-6 sm:p-8">
              <div className="lg:col-span-7 flex flex-col justify-between space-y-6">
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-amber-400 font-medium tabular-nums">
                    <span>{allSongs.length} שירים מקוריים במאגר</span>
                    <span aria-hidden="true">·</span>
                    <span>{totalRounds} סיבובים</span>
                    <span aria-hidden="true">·</span>
                    <span>{pointsPerCorrect} נק&apos; לניחוש נכון</span>
                    <span aria-hidden="true">·</span>
                    <span>{extraTimeCost} נק&apos; ל-5 שניות נוספות</span>
                  </div>

                  <h1
                    className="text-3xl sm:text-4xl lg:text-5xl font-extrabold font-display text-white tracking-tight leading-tight"
                    style={{ textWrap: "balance" }}
                  >
                    מזהים את השיר המקורי ב-5 שניות?
                  </h1>

                  <p className="text-slate-300 text-base sm:text-lg max-w-2xl leading-relaxed">
                    מאגר מורחב של מעל {allSongs.length} להיטים ישראליים,
                    ים-תיכוניים, רוק, קלאסיקות, אירוויזיון ובינלאומיים ללא חזרה
                    על שירים! בתור של כל קבוצה תושמע ההתחלה של השיר המקורי, ומיד
                    אחרי הניחוש יתנגן המשך השיר.
                  </p>
                </div>

                {/* Quick Sound Effects Test Bar */}
                <div className="pt-2 space-y-2.5">
                  <div className="text-xs text-slate-400">
                    בדיקת צלילי המשחק לפני שמתחילים:
                  </div>
                  <div className="flex flex-wrap items-center gap-2.5">
                    <button
                      type="button"
                      onClick={() => soundEngine.playSuccessSound()}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-emerald-300 bg-[#0F172A] border border-slate-700 hover:border-emerald-500 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      <Volume2 className="w-3.5 h-3.5 text-emerald-400" />
                      <span>צליל הצלחה</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => soundEngine.playFailureSound()}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-rose-300 bg-[#0F172A] border border-slate-700 hover:border-rose-500 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      <Volume2 className="w-3.5 h-3.5 text-rose-400" />
                      <span>צליל כישלון צורם</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => soundEngine.playVictorySound()}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-amber-300 bg-[#0F172A] border border-slate-700 hover:border-amber-400 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      <Trophy className="w-3.5 h-3.5 text-amber-400" />
                      <span>צליל ניצחון לזוכה</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* Right Visual Stage Card with Resilient Fallback */}
              <div className="lg:col-span-5 relative rounded-xl overflow-hidden bg-[#0F172A] border border-slate-800 min-h-[220px] flex items-center justify-center">
                {!heroImgBroken ? (
                  <>
                    <img
                      src={HERO_STAGE_IMAGE}
                      alt="אולפן הקלטות ופטיפון למשחק זיהוי שירים"
                      referrerPolicy="no-referrer"
                      onError={() => setHeroImgBroken(true)}
                      className="w-full h-full object-cover min-h-[220px]"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/35 to-transparent flex flex-col justify-end p-5">
                      <div className="text-xs text-amber-300 font-medium tabular-nums">
                        {unplayedInPoolCount} שירים טרם הושמעו בקטגוריה זו
                      </div>
                      <div className="text-lg font-bold text-white font-display mt-0.5">
                        {teams.length} קבוצות · {totalRounds} סיבובים
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="p-8 text-center space-y-3">
                    <Disc3 className="w-12 h-12 text-amber-400 mx-auto" />
                    <div className="text-lg font-bold text-white font-display">
                      אולפן זיהוי שירים מקוריים
                    </div>
                    <div className="text-xs text-slate-400">
                      {allSongs.length} שירים במאגר · ללא חזרות
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Pre-Game Team & Scoring Rules Setup Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
              {/* Left/Main Column: Teams & Scoring Configuration */}
              <div className="lg:col-span-8 space-y-6">
                {/* 1. Team Count & Names */}
                <div className="bg-[#1E293B] border border-slate-800 rounded-2xl p-6 sm:p-8 space-y-6">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-5">
                    <div>
                      <h2 className="text-xl font-bold font-display text-white flex items-center gap-2">
                        <Users className="w-5 h-5 text-amber-400" />
                        <span>1. הגדרת הקבוצות המשתתפות</span>
                      </h2>
                      <p className="text-xs text-slate-400 mt-1">
                        בחרו את מספר הקבוצות (2 עד 6) והגדירו שם לכל קבוצה
                      </p>
                    </div>

                    <div className="flex items-center gap-1.5 bg-[#0F172A] p-1.5 rounded-lg border border-slate-800 self-start">
                      <button
                        type="button"
                        onClick={() => setTeamCount(teams.length - 1)}
                        disabled={teams.length <= 2}
                        aria-label="הפחת קבוצה"
                        className="p-1.5 text-slate-300 hover:text-white disabled:opacity-40 cursor-pointer"
                      >
                        <Minus className="w-4 h-4" />
                      </button>
                      {[2, 3, 4, 5, 6].map((num) => (
                        <button
                          key={num}
                          type="button"
                          onClick={() => setTeamCount(num)}
                          className={`px-3 py-1 text-xs font-bold rounded-md transition-colors tabular-nums whitespace-nowrap shrink-0 cursor-pointer ${
                            teams.length === num
                              ? "bg-amber-400 text-slate-950"
                              : "text-slate-300 hover:text-white"
                          }`}
                        >
                          {num}
                        </button>
                      ))}
                      <button
                        type="button"
                        onClick={() => setTeamCount(teams.length + 1)}
                        disabled={teams.length >= 6}
                        aria-label="הוסף קבוצה"
                        className="p-1.5 text-slate-300 hover:text-white disabled:opacity-40 cursor-pointer"
                      >
                        <Plus className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {teams.map((team, idx) => (
                      <div
                        key={team.id}
                        className="bg-[#0F172A] border border-slate-800 rounded-xl p-4 flex items-center gap-3.5"
                      >
                        <div
                          className="w-9 h-9 rounded-lg flex items-center justify-center font-bold text-sm text-slate-950 shrink-0 tabular-nums"
                          style={{ backgroundColor: team.accentHex }}
                        >
                          {idx + 1}
                        </div>
                        <div className="flex-1 min-w-0">
                          <label
                            htmlFor={`team-input-${idx}`}
                            className="block text-xs text-slate-400 mb-1"
                          >
                            שם קבוצה {idx + 1} · תור #{idx + 1}
                          </label>
                          <input
                            id={`team-input-${idx}`}
                            type="text"
                            value={team.name}
                            onChange={(e) =>
                              updateTeamName(idx, e.target.value)
                            }
                            placeholder={`קבוצה ${idx + 1}`}
                            className="w-full bg-transparent text-white font-semibold text-base border-b border-slate-700 focus:border-amber-400 focus:outline-none pb-1"
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* 2. Configurable Rounds, Points, Extra 5s Cost, Hint Cost & Time-Decay Mode */}
                <div className="bg-[#1E293B] border border-slate-800 rounded-2xl p-6 sm:p-8 space-y-6">
                  <div className="border-b border-slate-800 pb-4">
                    <h2 className="text-xl font-bold font-display text-white flex items-center gap-2">
                      <Sliders className="w-5 h-5 text-amber-400" />
                      <span>2. הגדרת סיבובים, ניקוד ומוד זמן</span>
                    </h2>
                    <p className="text-xs text-slate-400 mt-1">
                      קבעו כמה סיבובים יכלול המשחק, כמה נקודות שווה תשובה נכונה וכמה יעלו 5 שניות נוספות או רמז
                    </p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    {/* Number of Rounds */}
                    <div className="bg-[#0F172A] border border-slate-800 rounded-xl p-4 space-y-2">
                      <label
                        htmlFor="rounds-input"
                        className="block text-xs font-semibold text-slate-300"
                      >
                        מספר סיבובים למשחק
                      </label>
                      <div className="flex items-center justify-between gap-2">
                        <button
                          type="button"
                          onClick={() =>
                            setTotalRounds((r) => Math.max(1, r - 1))
                          }
                          className="p-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg cursor-pointer"
                        >
                          <Minus className="w-4 h-4" />
                        </button>
                        <input
                          id="rounds-input"
                          type="number"
                          min={1}
                          max={30}
                          value={totalRounds}
                          onChange={(e) =>
                            setTotalRounds(
                              Math.max(
                                1,
                                Math.min(30, Number(e.target.value) || 1)
                              )
                            )
                          }
                          className="w-full text-center font-mono-tabular font-bold text-lg text-amber-400 bg-transparent focus:outline-none"
                        />
                        <button
                          type="button"
                          onClick={() =>
                            setTotalRounds((r) => Math.min(30, r + 1))
                          }
                          className="p-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg cursor-pointer"
                        >
                          <Plus className="w-4 h-4" />
                        </button>
                      </div>
                      <div className="text-[11px] text-slate-400 tabular-nums">
                        סה&quot;כ {totalRounds * teams.length} תורות במשחק
                      </div>
                    </div>

                    {/* Points for Correct Answer */}
                    <div className="bg-[#0F172A] border border-slate-800 rounded-xl p-4 space-y-2">
                      <label
                        htmlFor="correct-pts-input"
                        className="block text-xs font-semibold text-slate-300"
                      >
                        נקודות לניחוש נכון
                      </label>
                      <div className="flex items-center justify-between gap-2">
                        <button
                          type="button"
                          onClick={() =>
                            setPointsPerCorrect((p) => Math.max(1, p - 1))
                          }
                          className="p-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg cursor-pointer"
                        >
                          <Minus className="w-4 h-4" />
                        </button>
                        <input
                          id="correct-pts-input"
                          type="number"
                          min={1}
                          max={100}
                          value={pointsPerCorrect}
                          onChange={(e) =>
                            setPointsPerCorrect(
                              Math.max(
                                1,
                                Math.min(100, Number(e.target.value) || 10)
                              )
                            )
                          }
                          className="w-full text-center font-mono-tabular font-bold text-lg text-emerald-400 bg-transparent focus:outline-none"
                        />
                        <button
                          type="button"
                          onClick={() =>
                            setPointsPerCorrect((p) => Math.min(100, p + 1))
                          }
                          className="p-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg cursor-pointer"
                        >
                          <Plus className="w-4 h-4" />
                        </button>
                      </div>
                      <div className="text-[11px] text-slate-400">
                        ברירת מחדל: 10 נקודות
                      </div>
                    </div>

                    {/* Cost per Extra 5 Seconds */}
                    <div className="bg-[#0F172A] border border-slate-800 rounded-xl p-4 space-y-2">
                      <label
                        htmlFor="extra-sec-cost-input"
                        className="block text-xs font-semibold text-slate-300"
                      >
                        עלות 5 שניות נוספות
                      </label>
                      <div className="flex items-center justify-between gap-2">
                        <button
                          type="button"
                          onClick={() =>
                            setExtraTimeCost((c) => Math.max(0, c - 1))
                          }
                          className="p-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg cursor-pointer"
                        >
                          <Minus className="w-4 h-4" />
                        </button>
                        <input
                          id="extra-sec-cost-input"
                          type="number"
                          min={0}
                          max={50}
                          value={extraTimeCost}
                          onChange={(e) =>
                            setExtraTimeCost(
                              Math.max(
                                0,
                                Math.min(50, Number(e.target.value) || 0)
                              )
                            )
                          }
                          className="w-full text-center font-mono-tabular font-bold text-lg text-amber-400 bg-transparent focus:outline-none"
                        />
                        <button
                          type="button"
                          onClick={() =>
                            setExtraTimeCost((c) => Math.min(50, c + 1))
                          }
                          className="p-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg cursor-pointer"
                        >
                          <Plus className="w-4 h-4" />
                        </button>
                      </div>
                      <div className="text-[11px] text-slate-400">
                        ברירת מחדל: 5 נקודות
                      </div>
                    </div>

                    {/* Cost for Hint */}
                    <div className="bg-[#0F172A] border border-slate-800 rounded-xl p-4 space-y-2">
                      <label
                        htmlFor="hint-cost-input"
                        className="block text-xs font-semibold text-slate-300"
                      >
                        עלות רמז לשיר
                      </label>
                      <div className="flex items-center justify-between gap-2">
                        <button
                          type="button"
                          onClick={() =>
                            setHintCost((c) => Math.max(0, c - 1))
                          }
                          className="p-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg cursor-pointer"
                        >
                          <Minus className="w-4 h-4" />
                        </button>
                        <input
                          id="hint-cost-input"
                          type="number"
                          min={0}
                          max={50}
                          value={hintCost}
                          onChange={(e) =>
                            setHintCost(
                              Math.max(
                                0,
                                Math.min(50, Number(e.target.value) || 0)
                              )
                            )
                          }
                          className="w-full text-center font-mono-tabular font-bold text-lg text-sky-400 bg-transparent focus:outline-none"
                        />
                        <button
                          type="button"
                          onClick={() =>
                            setHintCost((c) => Math.min(50, c + 1))
                          }
                          className="p-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg cursor-pointer"
                        >
                          <Plus className="w-4 h-4" />
                        </button>
                      </div>
                      <div className="text-[11px] text-slate-400">
                        יורד מניקוד השאלה
                      </div>
                    </div>
                  </div>

                  {/* Time-Decay Scoring Mode Configuration */}
                  <div className="bg-[#0F172A] border border-slate-800 rounded-xl p-5 space-y-4">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 font-bold text-white text-base">
                          <Clock className="w-4 h-4 text-amber-400" />
                          <span>
                            מוד הורדת נקודות ככל שהזמן עובר (ניקוד תלוי-זמן)
                          </span>
                        </div>
                        <p className="text-xs text-slate-400">
                          ככל שהקבוצה עונה מהר יותר היא מקבלת יותר נקודות. לדוגמה: אם יש{" "}
                          {guessTimeLimitSeconds} שניות לניחוש ועברו{" "}
                          {Math.round(guessTimeLimitSeconds / 2)} שניות מתוך{" "}
                          {pointsPerCorrect} נקודות, הקבוצה תקבל{" "}
                          {Math.round(pointsPerCorrect / 2)} נקודות.
                        </p>
                      </div>

                      <div className="flex items-center gap-1.5 bg-[#1E293B] p-1 rounded-lg border border-slate-700 shrink-0 self-start">
                        <button
                          type="button"
                          onClick={() => setIsTimeDecayMode(false)}
                          className={`px-3.5 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                            !isTimeDecayMode
                              ? "bg-amber-400 text-slate-950"
                              : "text-slate-300 hover:text-white"
                          }`}
                        >
                          ניקוד קבוע
                        </button>
                        <button
                          type="button"
                          onClick={() => setIsTimeDecayMode(true)}
                          className={`px-3.5 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                            isTimeDecayMode
                              ? "bg-amber-400 text-slate-950"
                              : "text-slate-300 hover:text-white"
                          }`}
                        >
                          ניקוד יורד לפי זמן
                        </button>
                      </div>
                    </div>

                    {isTimeDecayMode && (
                      <div className="pt-3 border-t border-slate-800 flex flex-wrap items-center justify-between gap-4">
                        <span className="text-xs text-slate-300 font-medium">
                          זמן מוקצב לניחוש בכל תור (בשניות):
                        </span>
                        <div className="flex items-center gap-2">
                          {[6, 10, 15, 20, 30].map((sec) => (
                            <button
                              key={sec}
                              type="button"
                              onClick={() => setGuessTimeLimitSeconds(sec)}
                              className={`px-3 py-1.5 text-xs font-bold rounded-lg border transition-colors tabular-nums cursor-pointer ${
                                guessTimeLimitSeconds === sec
                                  ? "bg-amber-400 text-slate-950 border-amber-400"
                                  : "bg-[#1E293B] text-slate-300 border-slate-700 hover:text-white"
                              }`}
                            >
                              {sec} שניות
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* SoundEngine Independent Volume & Boost Mixer */}
                  <div className="bg-[#0F172A] border border-slate-800 rounded-xl p-5 space-y-4">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2 font-bold text-white text-base">
                          <Volume2 className="w-4 h-4 text-amber-400" />
                          <span>
                            הגברת עוצמת השיר המקורי בנפרד מהליווי (SoundEngine Mixer)
                          </span>
                        </div>
                        <p className="text-xs text-slate-400 mt-0.5">
                          הגבירו את השיר המקורי עד 250% (Pre-Amp Boost) והנמיכו את הליווי כדי להבדיל בצורה חדה וברורה בין השיר לליווי
                        </p>
                      </div>

                      <div className="flex items-center gap-2 shrink-0 self-start">
                        <button
                          type="button"
                          onClick={() => {
                            handleOriginalSongVolumeChange(2.0);
                            handleAccompanimentVolumeChange(0.3);
                          }}
                          className="px-3 py-1.5 text-xs font-bold text-slate-950 bg-amber-400 hover:bg-amber-300 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
                        >
                          הדגשת שיר מקסימלית (200%)
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            handleOriginalSongVolumeChange(1.5);
                            handleAccompanimentVolumeChange(0.55);
                          }}
                          className="px-3 py-1.5 text-xs font-semibold text-slate-300 bg-[#1E293B] border border-slate-700 hover:text-white rounded-lg transition-colors whitespace-nowrap cursor-pointer"
                        >
                          ברירת מחדל
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-slate-800/80">
                      {/* Original Song Boost Slider */}
                      <div className="bg-[#1E293B] border border-slate-700/80 rounded-lg p-3.5 space-y-2">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-semibold text-white">
                            עוצמת השיר המקורי / מלודיה (Boost):
                          </span>
                          <span className="font-mono-tabular font-bold text-amber-400">
                            {Math.round(originalSongVolume * 100)}%
                          </span>
                        </div>
                        <input
                          type="range"
                          min={0.2}
                          max={2.5}
                          step={0.05}
                          value={originalSongVolume}
                          onChange={(e) =>
                            handleOriginalSongVolumeChange(
                              Number(e.target.value)
                            )
                          }
                          aria-label="עוצמת השיר המקורי"
                          className="w-full accent-amber-400 cursor-pointer"
                        />
                        <div className="flex justify-between text-[11px] text-slate-400 tabular-nums">
                          <span>20%</span>
                          <span>100% (רגיל)</span>
                          <span>250% (הגברה חזקה)</span>
                        </div>
                      </div>

                      {/* Accompaniment Volume Slider */}
                      <div className="bg-[#1E293B] border border-slate-700/80 rounded-lg p-3.5 space-y-2">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-semibold text-slate-200">
                            עוצמת הליווי והקצב ברקע:
                          </span>
                          <span className="font-mono-tabular font-bold text-sky-400">
                            {Math.round(accompanimentVolume * 100)}%
                          </span>
                        </div>
                        <input
                          type="range"
                          min={0}
                          max={1.5}
                          step={0.05}
                          value={accompanimentVolume}
                          onChange={(e) =>
                            handleAccompanimentVolumeChange(
                              Number(e.target.value)
                            )
                          }
                          aria-label="עוצמת הליווי"
                          className="w-full accent-sky-400 cursor-pointer"
                        />
                        <div className="flex justify-between text-[11px] text-slate-400 tabular-nums">
                          <span>0% (ללא ליווי)</span>
                          <span>55% (מומלץ)</span>
                          <span>150%</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Right Column: Playlist Category & Start Game CTA */}
              <div className="lg:col-span-4 bg-[#1E293B] border border-slate-800 rounded-2xl p-6 sm:p-8 space-y-6">
                <div>
                  <h2 className="text-xl font-bold font-display text-white flex items-center gap-2">
                    <Music className="w-5 h-5 text-amber-400" />
                    <span>3. סגנון מוזיקלי ({allSongs.length} שירים)</span>
                  </h2>
                  <p className="text-xs text-slate-400 mt-1">
                    בחרו קטגוריה או שחקו עם כל השירים ללא חזרות
                  </p>
                </div>

                {/* Category Filter Buttons */}
                <div className="space-y-2">
                  {[
                    {
                      id: "all",
                      label: `הכל מכל (${allSongs.length} שירים במאגר)`,
                    },
                    ...(
                      Object.keys(CATEGORY_LABELS) as SongCategory[]
                    ).map((catKey) => ({
                      id: catKey,
                      label: `${CATEGORY_LABELS[catKey]} (${
                        allSongs.filter((s) => s.category === catKey).length
                      })`,
                    })),
                  ].map((cat) => (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() =>
                        setSelectedCategory(cat.id as "all" | SongCategory)
                      }
                      className={`w-full text-right px-4 py-2.5 rounded-lg text-xs font-semibold transition-colors flex items-center justify-between cursor-pointer ${
                        selectedCategory === cat.id
                          ? "bg-amber-400 text-slate-950"
                          : "bg-[#0F172A] text-slate-300 hover:text-white border border-slate-800"
                      }`}
                    >
                      <span className="truncate">{cat.label}</span>
                      {selectedCategory === cat.id && (
                        <CheckCircle2 className="w-4 h-4 shrink-0" />
                      )}
                    </button>
                  ))}
                </div>

                {/* Anti-Repetition Status & Quick Expand */}
                <div className="bg-[#0F172A] border border-slate-800 rounded-xl p-4 space-y-3 text-xs text-slate-300">
                  <div className="flex items-center justify-between">
                    <span>שירים זמינים שטרם הושמעו:</span>
                    <span className="font-bold text-emerald-400 tabular-nums">
                      {unplayedInPoolCount} מתוך {filteredSongPool.length}
                    </span>
                  </div>

                  {usedSongIds.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setUsedSongIds([])}
                      className="w-full py-1.5 px-3 text-xs font-semibold text-slate-300 bg-[#1E293B] hover:text-white rounded-lg border border-slate-700 flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                      <span>איפוס היסטוריית שירים שהושמעו</span>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => setActiveTab("library")}
                    className="w-full py-2 px-3 text-xs font-semibold text-amber-300 bg-[#1E293B] hover:border-amber-400 rounded-lg border border-slate-700 flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>ייבוא עוד שירים ואמנים למאגר</span>
                  </button>
                </div>

                {/* Start Game Primary Action Button */}
                <button
                  type="button"
                  onClick={startNewGame}
                  className="w-full py-4 px-6 bg-amber-400 hover:bg-amber-300 text-slate-950 font-extrabold text-base rounded-xl transition-transform active:scale-[0.99] flex items-center justify-center gap-2 shadow-lg cursor-pointer whitespace-nowrap"
                >
                  <Play className="w-5 h-5 fill-current" />
                  <span>
                    התחל משחק ({teams.length} קבוצות · {totalRounds} סיבובים)
                  </span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* TAB: ARENA — ACTIVE GAMEPLAY (PLAYING & ROUND_SUMMARY) */}
        {activeTab === "arena" &&
          (gameState === "PLAYING" || gameState === "ROUND_SUMMARY") &&
          currentSong && (
            <div className="space-y-6">
              {/* Top Live Scoreboard HUD */}
              <section
                aria-label="לוח תוצאות הקבוצות"
                className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3"
              >
                {teams.map((team, idx) => {
                  const isCurrentTurn = idx === currentTeamIndex;
                  return (
                    <div
                      key={team.id}
                      className={`rounded-xl p-4 transition-all border ${
                        isCurrentTurn
                          ? "bg-[#1E293B] border-amber-400 shadow-md"
                          : "bg-[#0F172A] border-slate-800 opacity-85"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2 mb-1.5">
                        <span className="text-xs font-medium text-slate-400 truncate">
                          {isCurrentTurn ? "בתור כעת" : `קבוצה ${idx + 1}`}
                        </span>
                        <span className="font-mono-tabular text-sm font-extrabold text-amber-400">
                          {team.score} נק&apos;
                        </span>
                      </div>

                      <div className="font-bold text-white text-base truncate mb-2">
                        {team.name}
                      </div>

                      <div className="text-[11px] text-slate-400 tabular-nums">
                        {team.correctCount} נכונות · {team.wrongCount} שגויות
                      </div>
                    </div>
                  );
                })}
              </section>

              {/* Main Game Arena Stage */}
              <div className="bg-[#1E293B] border border-slate-800 rounded-2xl p-6 sm:p-8 space-y-6">
                {/* Active Team Turn & Potential Points Header */}
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-800 pb-5">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400 tabular-nums">
                      <span>
                        סיבוב {currentRound} מתוך {totalRounds}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span>{currentSong.categoryLabel}</span>
                      <span aria-hidden="true">·</span>
                      <span>
                        אורך קטע פתוח: {unlockedSeconds} שניות ראשונות
                      </span>
                    </div>
                    <h1 className="text-2xl sm:text-3xl font-extrabold font-display text-white flex items-center gap-3">
                      <span>התור של:</span>
                      <span style={{ color: activeTeam.accentHex }}>
                        {activeTeam.name}
                      </span>
                    </h1>
                  </div>

                  {/* Live Potential Points & Extra 5s / Hint Purchase Controls */}
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="bg-[#0F172A] border border-slate-700 rounded-xl px-4 py-2.5 flex items-center gap-3">
                      <div>
                        <div className="text-[11px] text-slate-400">
                          ניקוד לניחוש נכון כעת
                        </div>
                        <div className="font-mono-tabular text-lg font-extrabold text-emerald-400">
                          +{currentPotentialPoints} נקודות
                        </div>
                      </div>
                      {isTimeDecayMode && gameState === "PLAYING" && (
                        <div className="border-r border-slate-700 pr-3">
                          <div className="text-[11px] text-slate-400">
                            זמן שנותר
                          </div>
                          <div className="font-mono-tabular text-lg font-extrabold text-amber-400">
                            {Math.max(
                              0,
                              guessTimeLimitSeconds - elapsedGuessTime
                            ).toFixed(1)}
                            s
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Buy +5 Extra Seconds Button */}
                    <button
                      type="button"
                      disabled={
                        gameState !== "PLAYING" ||
                        unlockedSeconds >= MAX_SNIPPET_SECONDS
                      }
                      onClick={handleBuyExtraFiveSeconds}
                      className="inline-flex items-center gap-2 px-4 py-3 text-xs font-bold text-amber-300 bg-[#0F172A] border border-amber-500/60 rounded-xl hover:bg-amber-950/40 transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-40 disabled:cursor-default"
                    >
                      <FastForward className="w-4 h-4 text-amber-400" />
                      <span>
                        +5 שניות נוספות מהשיר (
                        {extraTimeCost > 0 ? `-${extraTimeCost} נק'` : "חינם"})
                      </span>
                    </button>

                    {/* Buy Hint Button */}
                    <button
                      type="button"
                      disabled={gameState !== "PLAYING" || showHint}
                      onClick={handleBuyHint}
                      className="inline-flex items-center gap-1.5 px-4 py-3 text-xs font-semibold text-sky-300 bg-[#0F172A] border border-slate-700 rounded-xl hover:border-sky-400 transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-40 disabled:cursor-default"
                    >
                      <HelpCircle className="w-4 h-4 text-sky-400" />
                      <span>
                        {showHint
                          ? "רמז הוצג"
                          : `רמז (${hintCost > 0 ? `-${hintCost} נק'` : "חינם"})`}
                      </span>
                    </button>
                  </div>
                </div>

                {/* Time-Decay Progress Bar (if enabled) */}
                {isTimeDecayMode && gameState === "PLAYING" && (
                  <div className="bg-[#0F172A] border border-slate-800 rounded-xl p-4 space-y-2">
                    <div className="flex items-center justify-between text-xs tabular-nums">
                      <span className="text-amber-300 font-semibold flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5" />
                        <span>
                          שעון עצר ניקוד יורד: עברו {elapsedGuessTime.toFixed(1)}{" "}
                          שניות מתוך {guessTimeLimitSeconds} שניות
                        </span>
                      </span>
                      <span className="font-bold text-emerald-400">
                        שווי תשובה נכונה ברגע זה: {currentPotentialPoints} נק&apos;
                      </span>
                    </div>
                    <div className="w-full h-2.5 bg-slate-800 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-emerald-400 transition-transform duration-100 origin-right"
                        style={{
                          width: `${Math.max(
                            0,
                            Math.min(
                              100,
                              ((guessTimeLimitSeconds - elapsedGuessTime) /
                                guessTimeLimitSeconds) *
                                100
                            )
                          )}%`,
                        }}
                      />
                    </div>
                  </div>
                )}

                {/* Optional Hint Reveal */}
                {showHint && (
                  <div className="bg-[#0F172A] border border-sky-800/70 rounded-xl px-4 py-3 text-sm text-sky-200 flex items-center justify-between">
                    <span>
                      <strong>רמז לקבוצה:</strong> {currentSong.hint} (שנת יציאה:{" "}
                      {currentSong.year})
                    </span>
                    <span className="text-xs text-sky-400 tabular-nums">
                      עלות רמז: -{hintCost} נק&apos;
                    </span>
                  </div>
                )}

                {/* Original Song Audio Player Deck */}
                <div className="bg-[#0F172A] border border-slate-800 rounded-xl p-6 space-y-5">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="space-y-1">
                      <div className="text-xs text-slate-400">
                        {gameState === "ROUND_SUMMARY"
                          ? "אחרי הניחוש — מושמע כעת המשך השיר המקורי:"
                          : `האזינו ל-${unlockedSeconds} השניות הראשונות של השיר המקורי:`}
                      </div>
                      <div className="text-lg font-bold text-white font-display flex items-center gap-2">
                        <Volume2
                          className={`w-5 h-5 ${
                            isPlayingSnippet || isPlayingContinuation
                              ? "text-amber-400"
                              : "text-slate-400"
                          }`}
                        />
                        <span>
                          {isPlayingContinuation
                            ? `מנגן את המשך השיר המקורי: ${currentSong.title} — ${currentSong.artist}`
                            : isPlayingSnippet
                            ? `משמיע כעת את השיר המקורי (${unlockedSeconds} שניות פתוחות)...`
                            : `מוכן להשמעה (${unlockedSeconds} שניות ראשונות פתוחות)`}
                        </span>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2.5">
                      <div className="font-mono-tabular text-sm font-bold text-amber-400 bg-[#1E293B] px-3.5 py-2 rounded-lg border border-slate-800">
                        {playbackPositionSec.toFixed(1)}s /{" "}
                        {gameState === "ROUND_SUMMARY"
                          ? "המשך השיר"
                          : `${unlockedSeconds.toFixed(1)}s`}
                      </div>

                      {gameState === "PLAYING" ? (
                        <>
                          <button
                            type="button"
                            onClick={() =>
                              playSongSnippetRange(
                                currentSong,
                                0,
                                unlockedSeconds
                              )
                            }
                            className="inline-flex items-center gap-2 px-4 py-2.5 text-xs sm:text-sm font-bold text-slate-950 bg-amber-400 hover:bg-amber-300 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                          >
                            <Play className="w-4 h-4 fill-current" />
                            <span>
                              השמע מההתחלה (0 - {unlockedSeconds} שנ&apos;)
                            </span>
                          </button>

                          {extraSecondsCount > 0 && (
                            <button
                              type="button"
                              onClick={() =>
                                playSongSnippetRange(
                                  currentSong,
                                  unlockedSeconds - EXTRA_TIME_STEP_SECONDS,
                                  EXTRA_TIME_STEP_SECONDS
                                )
                              }
                              className="inline-flex items-center gap-1.5 px-3.5 py-2.5 text-xs font-semibold text-amber-300 bg-[#1E293B] border border-slate-700 hover:border-amber-400 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                            >
                              <FastForward className="w-3.5 h-3.5" />
                              <span>
                                השמע רק 5 שנ&apos; אחרונות (
                                {unlockedSeconds - 5} - {unlockedSeconds})
                              </span>
                            </button>
                          )}
                        </>
                      ) : (
                        <div className="flex items-center gap-2">
                          {isPlayingContinuation ? (
                            <button
                              type="button"
                              onClick={() => {
                                soundEngine.stopSongPlayback();
                                setIsPlayingContinuation(false);
                                setSpectrumBars(new Array(24).fill(0.1));
                              }}
                              className="inline-flex items-center gap-1.5 px-4 py-2.5 text-xs font-semibold text-rose-300 bg-[#1E293B] border border-slate-700 hover:border-rose-400 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                            >
                              <Square className="w-3.5 h-3.5 fill-current" />
                              <span>עצור השמעת המשך השיר</span>
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() =>
                                playContinuationAfterAnswer(
                                  currentSong,
                                  unlockedSeconds
                                )
                              }
                              className="inline-flex items-center gap-1.5 px-4 py-2.5 text-xs font-semibold text-amber-300 bg-[#1E293B] border border-slate-700 hover:border-amber-400 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                            >
                              <Play className="w-3.5 h-3.5 fill-current" />
                              <span>נגן שוב את המשך השיר המקורי</span>
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* 24-Bar Live Equalizer Visualizer */}
                  <div
                    aria-hidden="true"
                    className="h-16 flex items-end justify-between gap-1.5 pt-2 px-2"
                  >
                    {spectrumBars.map((val, i) => {
                      const active =
                        isPlayingSnippet || isPlayingContinuation;
                      return (
                        <div
                          key={i}
                          className={`flex-1 rounded-t transition-transform duration-75 origin-bottom ${
                            isPlayingContinuation
                              ? "bg-emerald-400"
                              : "bg-amber-400"
                          }`}
                          style={{
                            height: "100%",
                            transform: `scaleY(${active ? val : 0.12})`,
                            opacity: active ? 0.9 : 0.25,
                          }}
                        />
                      );
                    })}
                  </div>

                  {/* Progress Bar */}
                  <div className="w-full h-2.5 bg-slate-800 rounded-full overflow-hidden">
                    <div
                      className={`h-full transition-transform duration-75 origin-right ${
                        isPlayingContinuation
                          ? "bg-emerald-400"
                          : "bg-amber-400"
                      }`}
                      style={{
                        width: `${Math.min(
                          100,
                          (playbackPositionSec /
                            (gameState === "ROUND_SUMMARY"
                              ? unlockedSeconds + 18
                              : unlockedSeconds)) *
                            100
                        )}%`,
                      }}
                    />
                  </div>

                  <div className="flex items-center justify-between text-xs text-slate-400 tabular-nums">
                    <span>0.0 שניות (תחילת השיר המקורי)</span>
                    <span>
                      {audioSourceMode === "real_audio"
                        ? "מקור: הקלטת השיר המקורי (Original Master Preview)"
                        : "מקור: עיבוד אולפן מובנה"}
                    </span>
                    <span>
                      {gameState === "ROUND_SUMMARY"
                        ? "משמיע את המשך השיר המקורי"
                        : `${unlockedSeconds.toFixed(1)} שניות פתוחות`}
                    </span>
                  </div>

                  {/* Live In-Game SoundEngine Mixer: Boost Original Song vs. Accompaniment */}
                  <div className="pt-4 border-t border-slate-800/90 grid grid-cols-1 md:grid-cols-12 gap-4 items-center">
                    <div className="md:col-span-5 bg-[#1E293B] border border-slate-800 rounded-lg px-3.5 py-2.5 space-y-1.5">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-semibold text-white flex items-center gap-1.5">
                          <Volume2 className="w-3.5 h-3.5 text-amber-400" />
                          <span>הגברת השיר המקורי (Boost):</span>
                        </span>
                        <span className="font-mono-tabular font-bold text-amber-400">
                          {Math.round(originalSongVolume * 100)}%
                        </span>
                      </div>
                      <input
                        type="range"
                        min={0.2}
                        max={2.5}
                        step={0.05}
                        value={originalSongVolume}
                        onChange={(e) =>
                          handleOriginalSongVolumeChange(Number(e.target.value))
                        }
                        aria-label="הגברת השיר המקורי"
                        className="w-full accent-amber-400 cursor-pointer"
                      />
                    </div>

                    <div className="md:col-span-4 bg-[#1E293B] border border-slate-800 rounded-lg px-3.5 py-2.5 space-y-1.5">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-semibold text-slate-300">
                          עוצמת הליווי ברקע:
                        </span>
                        <span className="font-mono-tabular font-bold text-sky-400">
                          {Math.round(accompanimentVolume * 100)}%
                        </span>
                      </div>
                      <input
                        type="range"
                        min={0}
                        max={1.5}
                        step={0.05}
                        value={accompanimentVolume}
                        onChange={(e) =>
                          handleAccompanimentVolumeChange(
                            Number(e.target.value)
                          )
                        }
                        aria-label="עוצמת הליווי ברקע"
                        className="w-full accent-sky-400 cursor-pointer"
                      />
                    </div>

                    <div className="md:col-span-3 flex items-center justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          handleOriginalSongVolumeChange(2.2);
                          handleAccompanimentVolumeChange(0.25);
                        }}
                        className="w-full py-2.5 px-3 text-xs font-bold text-amber-300 bg-[#1E293B] border border-amber-500/60 hover:bg-amber-950/40 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
                      >
                        הדגש שיר מקורי (+220%)
                      </button>
                    </div>
                  </div>
                </div>

                {/* 4 Multiple-Choice Options Grid */}
                <div className="space-y-3">
                  <div className="text-xs font-semibold text-slate-400">
                    בחרו את השיר הנכון מתוך 4 האפשרויות:
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {currentChoices.map((option, idx) => {
                      const isSelected = selectedChoiceId === option.id;
                      const isCorrectOption = option.id === currentSong.id;
                      const showResult = gameState === "ROUND_SUMMARY";

                      let cardStyle =
                        "bg-[#0F172A] border-slate-800 hover:border-amber-400/80 text-white";
                      if (showResult) {
                        if (isCorrectOption) {
                          cardStyle =
                            "bg-emerald-950/60 border-emerald-500 text-emerald-100";
                        } else if (isSelected && !isCorrectOption) {
                          cardStyle =
                            "bg-rose-950/60 border-rose-500 text-rose-100";
                        } else {
                          cardStyle =
                            "bg-[#0F172A] border-slate-800 opacity-50 text-slate-400";
                        }
                      }

                      return (
                        <button
                          key={option.id}
                          type="button"
                          disabled={gameState !== "PLAYING"}
                          onClick={() => handleSelectOption(option)}
                          className={`w-full text-right p-5 rounded-xl border-2 transition-all flex items-center justify-between gap-4 cursor-pointer disabled:cursor-default ${cardStyle}`}
                        >
                          <div className="flex items-center gap-4 min-w-0">
                            <span className="w-10 h-10 rounded-lg bg-[#1E293B] border border-slate-700 flex items-center justify-center font-bold text-base text-amber-400 shrink-0">
                              {optionLetters[idx]}
                            </span>
                            <div className="min-w-0">
                              <div className="font-bold text-lg truncate">
                                {option.title}
                              </div>
                              <div className="text-sm text-slate-400 truncate">
                                {option.artist}
                              </div>
                            </div>
                          </div>

                          {showResult && isCorrectOption && (
                            <div className="flex items-center gap-1.5 text-emerald-400 font-bold text-xs shrink-0">
                              <CheckCircle2 className="w-5 h-5" />
                              <span>תשובה נכונה</span>
                            </div>
                          )}

                          {showResult && isSelected && !isCorrectOption && (
                            <div className="flex items-center gap-1.5 text-rose-400 font-bold text-xs shrink-0">
                              <XCircle className="w-5 h-5" />
                              <span>תשובה שגויה</span>
                            </div>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Round Result Feedback + Song Continuation Banner & Next Turn CTA */}
                {gameState === "ROUND_SUMMARY" && (
                  <div
                    className={`rounded-xl p-5 border flex flex-col lg:flex-row lg:items-center justify-between gap-4 ${
                      isAnswerCorrect
                        ? "bg-emerald-950/40 border-emerald-700/80"
                        : "bg-rose-950/40 border-rose-700/80"
                    }`}
                  >
                    <div className="flex items-start sm:items-center gap-4">
                      {currentArtworkUrl && (
                        <img
                          src={currentArtworkUrl}
                          alt={currentSong.title}
                          referrerPolicy="no-referrer"
                          className="w-16 h-16 rounded-lg object-cover border border-slate-700 shrink-0 hidden sm:block"
                        />
                      )}
                      {isAnswerCorrect ? (
                        <CheckCircle2 className="w-7 h-7 text-emerald-400 shrink-0" />
                      ) : (
                        <XCircle className="w-7 h-7 text-rose-400 shrink-0" />
                      )}
                      <div>
                        <div className="font-bold text-lg text-white">
                          {isAnswerCorrect
                            ? `כל הכבוד ${activeTeam.name}! זיהוי מדויק (+${lastAwardedPoints} נקודות)`
                            : selectedChoiceId === "TIMEOUT"
                            ? `נגמר הזמן לניחוש עבור ${activeTeam.name}! (0 נקודות)`
                            : `טעות של ${activeTeam.name}! לא נוספו נקודות בתור זה`}
                        </div>
                        <div className="text-sm text-slate-300 mt-0.5">
                          השיר המקורי מתנגן כעת:{" "}
                          <strong className="text-white">
                            {currentSong.title} — {currentSong.artist}
                          </strong>{" "}
                          · סה&quot;כ ניקוד {activeTeam.name}:{" "}
                          <strong className="text-amber-400 tabular-nums">
                            {activeTeam.score} נק&apos;
                          </strong>
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-3 self-end lg:self-center">
                      <button
                        type="button"
                        onClick={advanceToNextTeamTurn}
                        className="inline-flex items-center gap-2 px-6 py-3 text-sm font-extrabold text-slate-950 bg-amber-400 hover:bg-amber-300 rounded-xl transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                      >
                        <span>
                          {isLastTurnOfGame
                            ? "לסיום המשחק והכרזת המנצחת!"
                            : `לתור הבא: ${nextTeam.name}`}
                        </span>
                        <ArrowLeft className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

        {/* TAB: ARENA — GAME OVER / VICTORY SCREEN */}
        {activeTab === "arena" && gameState === "GAME_OVER" && winnerTeam && (
          <div className="space-y-8">
            <div className="bg-[#1E293B] border-2 border-amber-400 rounded-2xl p-8 sm:p-10 text-center space-y-6">
              <div className="w-16 h-16 rounded-2xl bg-amber-400/20 border border-amber-400/50 flex items-center justify-center mx-auto">
                <Trophy className="w-9 h-9 text-amber-400" />
              </div>

              <div className="space-y-2">
                <div className="text-xs font-semibold text-amber-400 tabular-nums">
                  סיום {totalRounds} סיבובים · המשחק הוכרע!
                </div>
                <h1 className="text-3xl sm:text-5xl font-extrabold font-display text-white">
                  המנצחת הגדולה: {winnerTeam.name}!
                </h1>
                <p className="text-slate-300 text-base sm:text-lg max-w-xl mx-auto">
                  {winnerTeam.name} סיימה במקום הראשון עם{" "}
                  <strong className="text-amber-400 tabular-nums">
                    {winnerTeam.score} נקודות
                  </strong>{" "}
                  ו-{winnerTeam.correctCount} זיהויים נכונים!
                </p>
              </div>

              <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => soundEngine.playVictorySound()}
                  className="inline-flex items-center gap-2 px-5 py-3 text-sm font-bold text-amber-300 bg-[#0F172A] border border-amber-500/60 rounded-xl hover:bg-amber-950/40 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <Volume2 className="w-4 h-4 text-amber-400" />
                  <span>השמע שוב צליל ניצחון לזוכה</span>
                </button>

                <button
                  type="button"
                  onClick={startNewGame}
                  className="inline-flex items-center gap-2 px-6 py-3 text-sm font-extrabold text-slate-950 bg-amber-400 hover:bg-amber-300 rounded-xl transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <RotateCcw className="w-4 h-4" />
                  <span>משחק חדש עם שירים חדשים</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    soundEngine.stopSongPlayback();
                    setGameState("TITLE_MENU");
                  }}
                  className="inline-flex items-center gap-2 px-5 py-3 text-sm font-semibold text-slate-200 bg-[#0F172A] border border-slate-700 rounded-xl hover:border-slate-500 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <Users className="w-4 h-4" />
                  <span>שינוי הגדרות וקבוצות</span>
                </button>
              </div>
            </div>

            {/* Final Standings & Round History Breakdown */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              <div className="lg:col-span-5 bg-[#1E293B] border border-slate-800 rounded-xl p-6 space-y-4">
                <h2 className="text-lg font-bold font-display text-white">
                  טבלת דירוג סופית
                </h2>
                <div className="space-y-3">
                  {[...teams]
                    .sort((a, b) => b.score - a.score)
                    .map((team, rankIdx) => (
                      <div
                        key={team.id}
                        className="flex items-center justify-between p-3.5 rounded-lg bg-[#0F172A] border border-slate-800"
                      >
                        <div className="flex items-center gap-3">
                          <span className="w-7 h-7 rounded-md bg-slate-800 text-amber-400 font-mono-tabular font-bold text-xs flex items-center justify-center">
                            #{rankIdx + 1}
                          </span>
                          <div>
                            <div className="font-bold text-white text-sm">
                              {team.name}
                            </div>
                            <div className="text-xs text-slate-400 tabular-nums">
                              {team.correctCount} תשובות נכונות ·{" "}
                              {team.wrongCount} שגויות
                            </div>
                          </div>
                        </div>

                        <div className="font-mono-tabular font-extrabold text-lg text-amber-400">
                          {team.score} נק&apos;
                        </div>
                      </div>
                    ))}
                </div>
              </div>

              <div className="lg:col-span-7 bg-[#1E293B] border border-slate-800 rounded-xl p-6 space-y-4">
                <h2 className="text-lg font-bold font-display text-white">
                  סיכום התורות והשירים שהושמעו
                </h2>
                <div className="space-y-2.5 max-h-[340px] overflow-y-auto pl-1">
                  {roundHistory.map((item) => (
                    <div
                      key={item.turnId}
                      className="flex items-center justify-between gap-4 p-3 rounded-lg bg-[#0F172A] border border-slate-800 text-xs"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        {item.isCorrect ? (
                          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                        ) : (
                          <XCircle className="w-4 h-4 text-rose-400 shrink-0" />
                        )}
                        <div className="truncate">
                          <span className="font-bold text-white">
                            סיבוב {item.roundNumber} ({item.teamName}):
                          </span>{" "}
                          <span className="text-slate-300">
                            {item.songTitle} — {item.songArtist}
                          </span>
                        </div>
                      </div>
                      <span
                        className={`font-semibold shrink-0 tabular-nums ${
                          item.isCorrect ? "text-emerald-400" : "text-rose-400"
                        }`}
                      >
                        {item.isCorrect
                          ? `+${item.pointsAwarded} נקודות`
                          : "0 נקודות"}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

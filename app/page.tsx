"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";

type Color = "red" | "yellow" | "green" | "blue" | "purple" | "cyan";
type Special = "lineH" | "lineV" | "bomb" | "wrapped" | null;
type Blocker = "ice" | "chain" | null;
type Screen = "home" | "map" | "game" | "result";
type ToastTone = "info" | "good" | "bad";

type Cell = {
  id: number;
  color: Color;
  special: Special;
  blocker: Blocker;
};

type LevelConfig = {
  level: number;
  moves: number;
  target: number;
  ice: number;
  chains: number;
  specialGoal: number;
  colors: number;
  difficulty: string;
  world: string;
  seed: number;
  daily?: boolean;
};

type MatchGroup = {
  cells: number[];
  dir: "h" | "v";
  len: number;
  color: Color;
};

type Popup = {
  id: number;
  x: number;
  y: number;
  text: string;
};

const COLORS: Color[] = ["red", "yellow", "green", "blue", "purple", "cyan"];
const SIZE = 8;
const CELL_COUNT = SIZE * SIZE;
const LEVEL_COUNT = 100;
const MAX_WRONG_SWAPS = 3;
const SAVE_KEY = "chromatic-shift-next-v1";

const COLOR_LABEL: Record<Color, string> = {
  red: "Ruby",
  yellow: "Sun",
  green: "Emerald",
  blue: "Sapphire",
  purple: "Amethyst",
  cyan: "Aqua"
};

const WORLD_NAMES = [
  "Prism Gardens",
  "Neon Lagoon",
  "Crystal Dunes",
  "Moonlit Caverns",
  "Aurora Valley",
  "Starlight Peaks",
  "Royal Reactor",
  "Dream Circuit",
  "Celestial Vault",
  "Chromatic Core"
];

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function seededRandom(seed: number) {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let x = t;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

function todayKey() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function dailySeed() {
  const key = todayKey().replaceAll("-", "");
  let hash = 2166136261;
  for (const char of key) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function createLevelConfig(level: number): LevelConfig {
  const worldIndex = Math.min(9, Math.floor((level - 1) / 10));
  const within = ((level - 1) % 10) + 1;
  const tier = worldIndex;
  const colors = tier === 0 ? 4 : tier === 1 ? 5 : 6;
  const moves = Math.max(23, 33 - Math.floor(tier * 1.1) - Math.floor(within / 5));
  const target = 86 + worldIndex * 12 + within * 3;
  const ice = level <= 4 ? 0 : Math.min(18, Math.floor((level - 2) * 0.65));
  const chains = level < 16 ? 0 : Math.min(12, Math.floor((level - 12) * 0.22));
  const specialGoal = level < 12 ? 0 : Math.min(6, 1 + Math.floor((level - 12) / 17));
  const difficulty =
    level <= 10 ? "Warm-up" :
    level <= 25 ? "Flow" :
    level <= 45 ? "Tactical" :
    level <= 65 ? "Expert" :
    level <= 85 ? "Master" : "Nightmare";
  return {
    level,
    moves,
    target,
    ice,
    chains,
    specialGoal,
    colors,
    difficulty,
    world: WORLD_NAMES[worldIndex],
    seed: (0x9e3779b9 ^ Math.imul(level, 2654435761)) >>> 0
  };
}

function createDailyConfig(): LevelConfig {
  return {
    level: 0,
    moves: 28,
    target: 150,
    ice: 10,
    chains: 8,
    specialGoal: 4,
    colors: 6,
    difficulty: "Daily",
    world: "Daily Trial",
    seed: dailySeed(),
    daily: true
  };
}

function hasDirectMatch(board: (Cell | null)[], index: number, color: Color) {
  const x = index % SIZE;
  const y = Math.floor(index / SIZE);
  const left1 = index - 1;
  const left2 = index - 2;
  const up1 = index - SIZE;
  const up2 = index - SIZE * 2;
  return (
    (x >= 2 && board[left1]?.color === color && board[left2]?.color === color) ||
    (y >= 2 && board[up1]?.color === color && board[up2]?.color === color)
  );
}

function makeBoard(config: LevelConfig, nextIdStart = 1): { board: Cell[]; nextId: number } {
  const random = seededRandom(config.seed);
  const board: (Cell | null)[] = [];
  let nextId = nextIdStart;
  for (let i = 0; i < CELL_COUNT; i++) {
    let color: Color = COLORS[0];
    let guard = 0;
    do {
      color = COLORS[Math.floor(random() * config.colors)];
      guard++;
    } while (guard < 30 && hasDirectMatch(board, i, color));
    board.push({ id: nextId++, color, special: null, blocker: null });
  }

  const blockers: Blocker[] = new Array(CELL_COUNT).fill(null);
  const used = new Set<number>();
  const place = (count: number, type: Blocker, offset: number) => {
    let attempts = 0;
    const r = seededRandom((config.seed ^ offset) >>> 0);
    while (used.size < CELL_COUNT && attempts < 500 && count > 0) {
      const index = Math.floor(r() * CELL_COUNT);
      attempts++;
      if (used.has(index)) continue;
      used.add(index);
      blockers[index] = type;
      count--;
    }
  };

  place(config.ice, "ice", 0x51f15e);
  place(config.chains, "chain", 0xa71ce);

  return {
    board: board.map((cell, index) => ({ ...cell!, blocker: blockers[index] })),
    nextId
  };
}

function findMatches(board: (Cell | null)[]): { groups: MatchGroup[]; cells: Set<number> } {
  const groups: MatchGroup[] = [];
  const cells = new Set<number>();

  for (let y = 0; y < SIZE; y++) {
    let x = 0;
    while (x < SIZE) {
      const start = x;
      const color = board[y * SIZE + x]?.color;
      if (!color) {
        x++;
        continue;
      }
      x++;
      while (x < SIZE && board[y * SIZE + x]?.color === color) x++;
      const len = x - start;
      if (len >= 3) {
        const run = Array.from({ length: len }, (_, offset) => y * SIZE + start + offset);
        groups.push({ cells: run, dir: "h", len, color });
        run.forEach((index) => cells.add(index));
      }
    }
  }

  for (let x = 0; x < SIZE; x++) {
    let y = 0;
    while (y < SIZE) {
      const start = y;
      const color = board[y * SIZE + x]?.color;
      if (!color) {
        y++;
        continue;
      }
      y++;
      while (y < SIZE && board[y * SIZE + x]?.color === color) y++;
      const len = y - start;
      if (len >= 3) {
        const run = Array.from({ length: len }, (_, offset) => (start + offset) * SIZE + x);
        groups.push({ cells: run, dir: "v", len, color });
        run.forEach((index) => cells.add(index));
      }
    }
  }

  return { groups, cells };
}

function areAdjacent(a: number, b: number) {
  return Math.abs((a % SIZE) - (b % SIZE)) + Math.abs(Math.floor(a / SIZE) - Math.floor(b / SIZE)) === 1;
}

function cloneBoard(board: Cell[]) {
  return board.map((cell) => ({ ...cell }));
}

function chooseCreatedSpecial(groups: MatchGroup[], moveTo: number): { index: number; special: Special } | null {
  const intersection = groups.length > 1
    ? groups[0].cells.find((index) => groups.every((group) => group.cells.includes(index)))
    : undefined;

  if (intersection !== undefined) {
    return { index: intersection, special: "wrapped" };
  }

  const five = groups.find((group) => group.len >= 5);
  if (five) {
    const index = five.cells.includes(moveTo) ? moveTo : five.cells[Math.floor(five.cells.length / 2)];
    return { index, special: "bomb" };
  }

  const four = groups.find((group) => group.len === 4);
  if (four) {
    const index = four.cells.includes(moveTo) ? moveTo : four.cells[Math.floor(four.cells.length / 2)];
    return { index, special: four.dir === "h" ? "lineH" : "lineV" };
  }

  return null;
}

function addBlastForSpecial(
  board: (Cell | null)[],
  index: number,
  queue: Set<number>,
  mode: "normal" | "mega" = "normal"
) {
  const cell = board[index];
  if (!cell) return;
  if (cell.special === "lineH") {
    for (let x = 0; x < SIZE; x++) queue.add(Math.floor(index / SIZE) * SIZE + x);
  } else if (cell.special === "lineV") {
    for (let y = 0; y < SIZE; y++) queue.add(y * SIZE + (index % SIZE));
  } else if (cell.special === "wrapped") {
    const cx = index % SIZE;
    const cy = Math.floor(index / SIZE);
    const radius = mode === "mega" ? 2 : 1;
    for (let y = Math.max(0, cy - radius); y <= Math.min(7, cy + radius); y++) {
      for (let x = Math.max(0, cx - radius); x <= Math.min(7, cx + radius); x++) {
        queue.add(y * SIZE + x);
      }
    }
  } else if (cell.special === "bomb") {
    const color = cell.color;
    for (let i = 0; i < CELL_COUNT; i++) {
      if (board[i]?.color === color) queue.add(i);
    }
  }
}

function specialComboBlast(
  board: (Cell | null)[],
  a: number,
  b: number,
  queue: Set<number>
) {
  const sa = board[a]?.special;
  const sb = board[b]?.special;
  if (!sa || !sb) return false;

  if (sa === "bomb" && sb === "bomb") {
    for (let i = 0; i < CELL_COUNT; i++) queue.add(i);
    return true;
  }

  if ((sa === "bomb" && sb === "wrapped") || (sa === "wrapped" && sb === "bomb")) {
    const bombIndex = sa === "bomb" ? a : b;
    const wrappedIndex = sa === "wrapped" ? a : b;
    const bombColor = board[bombIndex]?.color;
    if (bombColor) {
      for (let i = 0; i < CELL_COUNT; i++) if (board[i]?.color === bombColor) queue.add(i);
    }
    addBlastForSpecial(board, wrappedIndex, queue, "mega");
    return true;
  }

  if (sa === "wrapped" || sb === "wrapped") {
    addBlastForSpecial(board, a, queue, "mega");
    addBlastForSpecial(board, b, queue, "mega");
    return true;
  }

  if ((sa === "bomb" && (sb === "lineH" || sb === "lineV")) || (sb === "bomb" && (sa === "lineH" || sa === "lineV"))) {
    const bombIndex = sa === "bomb" ? a : b;
    const lineIndex = sa === "bomb" ? b : a;
    const color = board[lineIndex]?.color;
    if (color) for (let i = 0; i < CELL_COUNT; i++) if (board[i]?.color === color) queue.add(i);
    for (let y = Math.max(0, Math.floor(lineIndex / SIZE) - 1); y <= Math.min(7, Math.floor(lineIndex / SIZE) + 1); y++) {
      for (let x = 0; x < SIZE; x++) queue.add(y * SIZE + x);
    }
    for (let x = Math.max(0, lineIndex % SIZE - 1); x <= Math.min(7, lineIndex % SIZE + 1); x++) {
      for (let y = 0; y < SIZE; y++) queue.add(y * SIZE + x);
    }
    return true;
  }

  addBlastForSpecial(board, a, queue);
  addBlastForSpecial(board, b, queue);
  return true;
}

function scoreForClear(count: number, combo: number) {
  return count * 110 * Math.max(1, combo);
}

export default function Home() {
  const [screen, setScreen] = useState<Screen>("home");
  const [unlocked, setUnlocked] = useState(1);
  const [stars, setStars] = useState<Record<number, number>>({});
  const [best, setBest] = useState<Record<number, number>>({});
  const [dailyCompleted, setDailyCompleted] = useState<Record<string, boolean>>({});
  const [dailyBest, setDailyBest] = useState<Record<string, number>>({});
  const [coins, setCoins] = useState(50);
  const [boosters, setBoosters] = useState({ shuffle: 2, hammer: 1, bomb: 1 });
  const [currentLevel, setCurrentLevel] = useState(1);
  const [levelConfig, setLevelConfig] = useState<LevelConfig>(createLevelConfig(1));
  const [board, setBoard] = useState<Cell[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [moves, setMoves] = useState(0);
  const [score, setScore] = useState(0);
  const [cleared, setCleared] = useState(0);
  const [goodMoves, setGoodMoves] = useState(0);
  const [iceBroken, setIceBroken] = useState(0);
  const [chainsBroken, setChainsBroken] = useState(0);
  const [specialsCreated, setSpecialsCreated] = useState(0);
  const [wrongSwaps, setWrongSwaps] = useState(0);
  const [combo, setCombo] = useState(0);
  const [dailyMode, setDailyMode] = useState(false);
  const [busy, setBusy] = useState(false);
  const [burstCells, setBurstCells] = useState<number[]>([]);
  const [fallingIds, setFallingIds] = useState<number[]>([]);
  const [popups, setPopups] = useState<Popup[]>([]);
  const [toastMessage, setToastMessage] = useState("");
  const [toastTone, setToastTone] = useState<ToastTone>("info");
  const [boosterMode, setBoosterMode] = useState<"hammer" | "bomb" | null>(null);
  const [boosterDialog, setBoosterDialog] = useState<"shuffle" | "hammer" | "bomb" | null>(null);
  const [showTutorial, setShowTutorial] = useState(false);
  const [swapAnim, setSwapAnim] = useState<{ from: number; to: number } | null>(null);

  const nextIdRef = useRef(1);
  const audioRef = useRef<AudioContext | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(SAVE_KEY) || "null");
      if (saved) {
        setUnlocked(saved.unlocked || 1);
        setStars(saved.stars || {});
        setBest(saved.best || {});
        setDailyCompleted(saved.dailyCompleted || {});
        setDailyBest(saved.dailyBest || {});
        setCoins(Number.isFinite(saved.coins) ? saved.coins : 50);
        setBoosters(saved.boosters || { shuffle: 2, hammer: 1, bomb: 1 });
        if (!saved.tutorialSeen) setShowTutorial(true);
      } else {
        setShowTutorial(true);
      }
    } catch {
      setShowTutorial(true);
    }
  }, []);

  useEffect(() => {
    if (toastMessage) {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
      toastTimerRef.current = setTimeout(() => setToastMessage(""), 1600);
    }
    return () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    };
  }, [toastMessage]);

  const totalStars = useMemo(() => Object.values(stars).reduce((sum, value) => sum + value, 0), [stars]);
  const completedCount = useMemo(() => Object.keys(stars).length, [stars]);
  const currentBest = dailyMode ? dailyBest[todayKey()] || 0 : best[currentLevel] || 0;

  function persist(next: Partial<{
    unlocked: number;
    stars: Record<number, number>;
    best: Record<number, number>;
    dailyCompleted: Record<string, boolean>;
    dailyBest: Record<string, number>;
    coins: number;
    boosters: { shuffle: number; hammer: number; bomb: number };
    tutorialSeen: boolean;
  }> = {}) {
    try {
      const payload = {
        unlocked,
        stars,
        best,
        dailyCompleted,
        dailyBest,
        coins,
        boosters,
        tutorialSeen: !showTutorial,
        ...next
      };
      localStorage.setItem(SAVE_KEY, JSON.stringify(payload));
    } catch {}
  }

  function showToast(message: string, tone: ToastTone = "info") {
    setToastMessage(message);
    setToastTone(tone);
  }

  function playSound(type: "tap" | "swap" | "match" | "combo" | "special" | "win" | "fail" | "booster") {
    if (typeof window === "undefined") return;
    const AudioCtor = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtor) return;
    try {
      const ctx = audioRef.current || new AudioCtor();
      audioRef.current = ctx;
      if (ctx.state === "suspended") void ctx.resume();
      const master = ctx.createGain();
      master.gain.value = 0.16;
      master.connect(ctx.destination);
      const presets: Record<string, Array<[number, number, OscillatorType, number]>> = {
        tap: [[420, 0.05, "sine", 0]],
        swap: [[250, 0.08, "triangle", 0], [380, 0.07, "sine", 0.02]],
        match: [[520, 0.09, "sine", 0], [780, 0.11, "sine", 0.035]],
        combo: [[620, 0.08, "triangle", 0], [900, 0.12, "sine", 0.05], [1220, 0.15, "sine", 0.1]],
        special: [[660, 0.08, "square", 0], [980, 0.12, "triangle", 0.05], [1320, 0.18, "sine", 0.11]],
        win: [[523, 0.13, "sine", 0], [659, 0.15, "sine", 0.09], [784, 0.2, "triangle", 0.19], [1047, 0.28, "sine", 0.34]],
        fail: [[220, 0.12, "sawtooth", 0], [145, 0.2, "triangle", 0.07]],
        booster: [[700, 0.08, "square", 0], [980, 0.12, "triangle", 0.06]]
      };
      const now = ctx.currentTime;
      (presets[type] || presets.tap).forEach(([frequency, duration, wave, delay]) => {
        const oscillator = ctx.createOscillator();
        const gain = ctx.createGain();
        const time = now + delay;
        oscillator.type = wave;
        oscillator.frequency.setValueAtTime(frequency, time);
        oscillator.frequency.exponentialRampToValueAtTime(frequency * 1.35, time + duration);
        gain.gain.setValueAtTime(0.0001, time);
        gain.gain.exponentialRampToValueAtTime(0.85, time + 0.008);
        gain.gain.exponentialRampToValueAtTime(0.0001, time + duration);
        oscillator.connect(gain);
        gain.connect(master);
        oscillator.start(time);
        oscillator.stop(time + duration + 0.03);
      });
      if (navigator.vibrate) {
        navigator.vibrate(
          type === "combo" ? [10, 18, 12] :
          type === "special" ? [14, 24, 18] :
          type === "win" ? [16, 35, 25] :
          type === "fail" ? 35 : 6
        );
      }
    } catch {}
  }

  function startGame(config: LevelConfig) {
    const { board: created, nextId } = makeBoard(config, nextIdRef.current);
    nextIdRef.current = nextId;
    setLevelConfig(config);
    setCurrentLevel(config.level || 0);
    setDailyMode(Boolean(config.daily));
    setBoard(created);
    setSelected(null);
    setMoves(config.moves);
    setScore(0);
    setCleared(0);
    setGoodMoves(0);
    setIceBroken(0);
    setChainsBroken(0);
    setSpecialsCreated(0);
    setWrongSwaps(0);
    setCombo(0);
    setBusy(false);
    setBurstCells([]);
    setFallingIds([]);
    setPopups([]);
    setSwapAnim(null);
    setBoosterMode(null);
    setScreen("game");
  }

  function startCampaignLevel(level: number) {
    if (level < 1 || level > LEVEL_COUNT || level > unlocked) return;
    startGame(createLevelConfig(level));
  }

  function startDaily() {
    const key = todayKey();
    if (dailyCompleted[key]) {
      showToast("Today's challenge is already complete.", "good");
      return;
    }
    startGame(createDailyConfig());
  }

  function navigateBack() {
    if (screen === "game" || screen === "result") setScreen("map");
    else setScreen("home");
  }

  function shakeDevice() {
    if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(8);
  }

  function addPopup(text: string, index: number) {
    const id = Date.now() + Math.floor(Math.random() * 1000);
    setPopups((current) => [...current, {
      id,
      x: (index % SIZE) * 12.5 + 6.25,
      y: Math.floor(index / SIZE) * 12.5 + 6.25,
      text
    }]);
    setTimeout(() => setPopups((current) => current.filter((popup) => popup.id !== id)), 900);
  }

  function getSwapTransform(index: number) {
    if (!swapAnim || (index !== swapAnim.from && index !== swapAnim.to)) return undefined;
    const fromX = swapAnim.from % SIZE;
    const fromY = Math.floor(swapAnim.from / SIZE);
    const toX = swapAnim.to % SIZE;
    const toY = Math.floor(swapAnim.to / SIZE);
    const dx = toX - fromX;
    const dy = toY - fromY;
    const multiplier = index === swapAnim.from ? 1 : -1;
    return { "--swap-x": `${dx * 100 * multiplier}%`, "--swap-y": `${dy * 100 * multiplier}%` } as CSSProperties;
  }

  async function performSwap(from: number, to: number) {
    if (busy || boosterMode || !areAdjacent(from, to)) return;
    if (board[from]?.blocker === "chain" || board[to]?.blocker === "chain") {
      showToast("Chains must be broken before that gem can move.", "bad");
      playSound("fail");
      shakeDevice();
      setSelected(null);
      return;
    }

    setBusy(true);
    setSelected(null);
    setSwapAnim({ from, to });
    playSound("swap");
    await sleep(180);

    let working = cloneBoard(board);
    [working[from], working[to]] = [working[to], working[from]];
    const fromSpecial = working[from]?.special;
    const toSpecial = working[to]?.special;
    const specialQueue = new Set<number>();
    const specialMove = fromSpecial && toSpecial ? specialComboBlast(working, from, to, specialQueue) : false;
    const found = findMatches(working);

    if (!specialMove && found.cells.size === 0) {
      setSwapAnim({ from: to, to: from });
      await sleep(160);
      setSwapAnim(null);
      setWrongSwaps((value) => value + 1);
      playSound("fail");
      shakeDevice();
      const nextWrong = wrongSwaps + 1;
      if (nextWrong >= MAX_WRONG_SWAPS) {
        setBusy(false);
        finishLevel(false);
        return;
      }
      showToast(`No match. ${MAX_WRONG_SWAPS - nextWrong} clean swaps left.`, "bad");
      setBusy(false);
      return;
    }

    setSwapAnim(null);
    setBoard(working);
    setMoves((value) => value - 1);
    setGoodMoves((value) => value + 1);
    setCombo(0);

    let current = working;
    let cascade = 0;
    let localCleared = cleared;
    let localIce = iceBroken;
    let localChains = chainsBroken;
    let localSpecials = specialsCreated;
    let localScore = score;

    while (true) {
      cascade++;
      const matches = findMatches(current);
      const clearSet = new Set<number>();
      matches.cells.forEach((index) => clearSet.add(index));

      let specialCreated: { index: number; special: Special } | null = null;
      if (cascade === 1 && !specialMove) {
        specialCreated = chooseCreatedSpecial(matches.groups, to);
        if (specialCreated) {
          clearSet.delete(specialCreated.index);
          const specialCell = current[specialCreated.index];
          if (specialCell) {
            specialCell.special = specialCreated.special;
            localSpecials++;
          }
        }
      }

      if (specialMove) {
        specialQueue.forEach((index) => clearSet.add(index));
        specialQueue.clear();
      }

      const pending = [...clearSet];
      for (let cursor = 0; cursor < pending.length; cursor++) {
        const index = pending[cursor];
        const special = current[index]?.special;
        if (special) {
          const before = clearSet.size;
          addBlastForSpecial(current, index, clearSet, "normal");
          if (clearSet.size > before) {
            for (const item of clearSet) if (!pending.includes(item)) pending.push(item);
          }
        }
      }

      if (!clearSet.size) break;

      const clearedCount = clearSet.size;
      localCleared += clearedCount;
      localScore += scoreForClear(clearedCount, cascade);
      let message = cascade >= 4 ? "UNSTOPPABLE!" : cascade === 3 ? "SUPER COMBO!" : cascade === 2 ? "COMBO!" : `+${scoreForClear(clearedCount, cascade)}`;
      addPopup(message, [...clearSet][Math.floor(clearSet.size / 2)] ?? 0);
      setBurstCells([...clearSet]);
      setCombo(cascade);
      setScore(localScore);
      playSound(cascade >= 2 ? "combo" : "match");
      if (specialCreated) playSound("special");

      await sleep(300);

      const next = current.map((cell, index) => {
        if (!cell || !clearSet.has(index)) return cell;
        if (cell.blocker === "ice") localIce++;
        if (cell.blocker === "chain") localChains++;
        return null;
      });

      setBurstCells([]);
      const random = seededRandom((levelConfig.seed ^ localScore ^ cascade) >>> 0);
      const falling: number[] = [];

      for (let x = 0; x < SIZE; x++) {
        const column: Cell[] = [];
        for (let y = SIZE - 1; y >= 0; y--) {
          const cell = next[y * SIZE + x];
          if (cell) column.push(cell);
        }
        while (column.length < SIZE) {
          const newCell: Cell = {
            id: nextIdRef.current++,
            color: COLORS[Math.floor(random() * levelConfig.colors)],
            special: null,
            blocker: null
          };
          column.push(newCell);
        }
        for (let y = SIZE - 1; y >= 0; y--) {
          const cell = column[SIZE - 1 - y];
          next[y * SIZE + x] = cell;
          if (!current.includes(cell)) falling.push(cell.id);
        }
      }

      current = next as Cell[];
      setBoard(current);
      setFallingIds(falling);
      await sleep(360);
      setFallingIds([]);
      if (cascade >= 10) break;
    }

    setBoard(current);
    setCleared(localCleared);
    setIceBroken(localIce);
    setChainsBroken(localChains);
    setSpecialsCreated(localSpecials);
    setScore(localScore);
    setBusy(false);

    const afterMoves = moves - 1;
    const won =
      localCleared >= levelConfig.target &&
      localIce >= levelConfig.ice &&
      localChains >= levelConfig.chains &&
      localSpecials >= levelConfig.specialGoal;

    if (won) {
      finishLevel(true, afterMoves, localScore, localCleared, localIce, localChains, localSpecials);
    } else if (afterMoves <= 0) {
      finishLevel(false, afterMoves, localScore, localCleared, localIce, localChains, localSpecials);
    }
  }

  function finishLevel(
    won: boolean,
    finalMoves = moves,
    finalScore = score,
    finalCleared = cleared,
    finalIce = iceBroken,
    finalChains = chainsBroken,
    finalSpecials = specialsCreated
  ) {
    setBusy(true);
    if (won) {
      playSound("win");
      const totalMoves = levelConfig.moves;
      const starCount = finalMoves >= Math.ceil(totalMoves * 0.45) ? 3 : finalMoves >= Math.ceil(totalMoves * 0.2) ? 2 : 1;
      const reward = 20 + starCount * 15 + Math.min(45, combo * 4) + (dailyMode ? 20 : 0);
      const nextStars = { ...stars };
      const nextBest = { ...best };
      const nextDailyBest = { ...dailyBest };
      const nextDailyCompleted = { ...dailyCompleted };
      let nextUnlocked = unlocked;

      if (dailyMode) {
        const key = todayKey();
        nextDailyCompleted[key] = true;
        nextDailyBest[key] = Math.max(nextDailyBest[key] || 0, finalScore);
        setDailyCompleted(nextDailyCompleted);
        setDailyBest(nextDailyBest);
      } else {
        nextStars[currentLevel] = Math.max(nextStars[currentLevel] || 0, starCount);
        nextBest[currentLevel] = Math.max(nextBest[currentLevel] || 0, finalScore);
        nextUnlocked = Math.max(nextUnlocked, Math.min(LEVEL_COUNT, currentLevel + 1));
        setStars(nextStars);
        setBest(nextBest);
        setUnlocked(nextUnlocked);
      }

      const nextCoins = coins + reward;
      setCoins(nextCoins);
      persist({
        stars: nextStars,
        best: nextBest,
        dailyCompleted: nextDailyCompleted,
        dailyBest: nextDailyBest,
        unlocked: nextUnlocked,
        coins: nextCoins
      });

      setTimeout(() => {
        setBusy(false);
        setScreen("result");
        shakeDevice();
        setScore(finalScore);
      }, 500);
    } else {
      playSound("fail");
      setTimeout(() => {
        setBusy(false);
        setScreen("result");
      }, 450);
    }

    void finalCleared;
    void finalIce;
    void finalChains;
    void finalSpecials;
  }

  function applyBooster(type: "shuffle" | "hammer" | "bomb") {
    if (!boosters[type] || busy) return;
    const nextBoosters = { ...boosters, [type]: boosters[type] - 1 };
    setBoosters(nextBoosters);
    persist({ boosters: nextBoosters });
    setBoosterDialog(null);
    playSound("booster");

    if (type === "shuffle") {
      const random = seededRandom(Date.now() ^ score);
      let next = [...board];
      for (let attempt = 0; attempt < 20; attempt++) {
        next = [...board].sort(() => random() - 0.5);
        if (findMatches(next).cells.size === 0) break;
      }
      setBoard(next);
      setSelected(null);
      showToast("Board reshuffled.", "good");
      return;
    }

    setBoosterMode(type);
    showToast(type === "hammer" ? "Tap a gem to smash it." : "Tap a gem to trigger its color bomb.", "good");
  }

  function useBoosterAt(index: number) {
    if (!boosterMode || busy) return;
    const type = boosterMode;
    setBoosterMode(null);
    const next = cloneBoard(board) as (Cell | null)[];

    if (type === "hammer") {
      next[index] = {
        ...next[index],
        color: COLORS[Math.floor(Math.random() * levelConfig.colors)],
        special: null,
        blocker: null
      };
      if (board[index]?.blocker === "ice") setIceBroken((value) => value + 1);
      if (board[index]?.blocker === "chain") setChainsBroken((value) => value + 1);
      setBoard(next);
      showToast("Hammer smash!", "good");
      return;
    }

    const targetColor = board[index]?.color;
    if (!targetColor) return;
    const removed = board.reduce((count, cell) => count + (cell.color === targetColor ? 1 : 0), 0);
    for (let i = 0; i < CELL_COUNT; i++) {
      if (next[i]?.color === targetColor) next[i] = null;
    }
    const random = seededRandom(Date.now() ^ removed);
    for (let x = 0; x < SIZE; x++) {
      const column: Cell[] = [];
      for (let y = SIZE - 1; y >= 0; y--) if (next[y * SIZE + x]) column.push(next[y * SIZE + x]!);
      while (column.length < SIZE) {
        column.push({
          id: nextIdRef.current++,
          color: COLORS[Math.floor(random() * levelConfig.colors)],
          special: null,
          blocker: null
        });
      }
      for (let y = SIZE - 1; y >= 0; y--) next[y * SIZE + x] = column[SIZE - 1 - y];
    }
    setBurstCells(Array.from({ length: CELL_COUNT }, (_, i) => i).filter((i) => board[i]?.color === targetColor));
    setTimeout(() => setBurstCells([]), 320);
    setBoard(next);
    const nextCleared = cleared + removed;
    setCleared(nextCleared);
    setScore((value) => value + removed * 100);
    showToast(`${removed} ${COLOR_LABEL[targetColor]} gems cleared.`, "good");
    if (
      nextCleared >= levelConfig.target &&
      iceBroken >= levelConfig.ice &&
      chainsBroken >= levelConfig.chains &&
      specialsCreated >= levelConfig.specialGoal
    ) {
      finishLevel(true, moves, score + removed * 100, nextCleared, iceBroken, chainsBroken, specialsCreated);
    }
  }

  function mapNextLevel() {
    if (currentLevel < LEVEL_COUNT && unlocked > currentLevel) {
      startCampaignLevel(currentLevel + 1);
    } else {
      setScreen("map");
    }
  }

  function renderGemIcon(special: Special) {
    if (special === "lineH") return <span className="special-icon line-h" aria-hidden="true"><i /></span>;
    if (special === "lineV") return <span className="special-icon line-v" aria-hidden="true"><i /></span>;
    if (special === "wrapped") return <span className="special-icon wrapped" aria-hidden="true"><b>✦</b></span>;
    if (special === "bomb") return <span className="special-icon bomb" aria-hidden="true"><b>✦</b></span>;
    return null;
  }

  function renderTopbar(showBack: boolean) {
    return (
      <header className="game-topbar">
        <div className="brand-lockup">
          {showBack && (
            <button className="top-icon" onClick={navigateBack} aria-label="Back">
              <span>‹</span>
            </button>
          )}
          <div className="brand-gemmark" aria-hidden="true">
            <i /><i /><i /><i />
          </div>
          <div>
            <div className="brand-title">CHROMATIC <strong>SHIFT</strong></div>
            <div className="brand-caption">COLOR PUZZLE ADVENTURE</div>
          </div>
        </div>
        <div className="coin-pill"><span>◆</span>{coins}</div>
      </header>
    );
  }

  if (screen === "home") {
    return (
      <main className="game-app home-stage">
        {renderTopbar(false)}
        <section className="home-hero">
          <div className="hero-copy">
            <span className="eyebrow">COLOR PUZZLE ADVENTURE</span>
            <h1>Make a move.<br /><em>Change the board.</em></h1>
            <p>Swap glossy gems, trigger chain reactions, break blockers and chase three-star clears across 100 levels.</p>
            <div className="home-actions">
              <button className="hero-play" onClick={() => setScreen("map")} type="button">
                <span>PLAY</span>
                <b>▶</b>
              </button>
              <div className="home-mini-stat"><strong>100</strong><span>LEVELS</span></div>
              <div className="home-mini-stat"><strong>{completedCount}</strong><span>COMPLETE</span></div>
            </div>
          </div>
          <div className="hero-showcase" aria-hidden="true">
            <div className="showcase-orbit orbit-one" />
            <div className="showcase-orbit orbit-two" />
            <div className="showcase-board">
              {Array.from({ length: 36 }).map((_, index) => (
                <span key={index} className={`showcase-gem color-${COLORS[index % 6]}`} />
              ))}
            </div>
            <div className="showcase-burst"><span>+1200</span><small>COMBO</small></div>
          </div>
          <div className="home-milestones">
            <div><strong>{unlocked}</strong><span>LEVEL UNLOCKED</span></div>
            <div><strong>{totalStars}</strong><span>STARS EARNED</span></div>
            <div><strong>{Math.max(0, ...Object.values(best), 0).toLocaleString()}</strong><span>BEST SCORE</span></div>
          </div>
        </section>
        <section className="home-feature-row">
          <div><div className="feature-icon">✦</div><strong>Special Gems</strong><span>4-match, 5-match & combo blasts</span></div>
          <div><div className="feature-icon">❄</div><strong>Blocker Levels</strong><span>Ice and chain objectives</span></div>
          <div><div className="feature-icon">★</div><strong>Daily Trial</strong><span>A fresh challenge every day</span></div>
        </section>
        <button className="daily-home-card" onClick={startDaily} type="button">
          <span className="daily-badge">★</span>
          <span className="daily-copy"><b>DAILY CHROMATIC TRIAL</b><strong>Today's special board</strong><small>{dailyCompleted[todayKey()] ? "COMPLETED TODAY" : "PLAY FOR EXTRA COINS"}</small></span>
          <span className="daily-arrow">›</span>
        </button>
        {showTutorial && (
          <div className="modal-backdrop">
            <div className="modal-card tutorial-modal">
              <div className="modal-gem">◆</div>
              <span className="eyebrow">HOW TO PLAY</span>
              <h2>Think ahead. Build cascades.</h2>
              <p>Swipe a gem into a neighbor. Match three or more. Four makes a line gem, five makes a color bomb, and L/T shapes create a wrapped gem.</p>
              <div className="tutorial-grid">
                <div><b>01</b><span>SWAP</span></div>
                <div><b>02</b><span>CREATE</span></div>
                <div><b>03</b><span>CHAIN</span></div>
              </div>
              <button className="modal-primary" onClick={() => { setShowTutorial(false); persist({ tutorialSeen: true }); }}>LET'S PLAY <span>▶</span></button>
            </div>
          </div>
        )}
      </main>
    );
  }

  if (screen === "map") {
    return (
      <main className="game-app map-stage">
        {renderTopbar(true)}
        <section className="map-header">
          <div><span className="eyebrow">ADVENTURE MAP</span><h1>Choose your level</h1><p>Unlock the next chapter and chase better stars.</p></div>
          <div className="map-progress"><strong>{completedCount}</strong><span>/ {LEVEL_COUNT}</span><small>COMPLETE</small></div>
        </section>
        <div className="world-tabs">
          {WORLD_NAMES.map((world, index) => (
            <span key={world} className={unlocked > index * 10 ? "world-tab active" : "world-tab"}>{String(index + 1).padStart(2, "0")} {world}</span>
          ))}
        </div>
        <section className="level-grid">
          {Array.from({ length: LEVEL_COUNT }, (_, offset) => offset + 1).map((level) => {
            const isUnlocked = level <= unlocked;
            const starCount = stars[level] || 0;
            const config = createLevelConfig(level);
            return (
              <button
                type="button"
                key={level}
                className={`level-card ${isUnlocked ? "available" : "locked"} ${level === unlocked ? "current" : ""} ${starCount ? "completed" : ""}`}
                disabled={!isUnlocked}
                onClick={() => startCampaignLevel(level)}
              >
                {isUnlocked ? <><span className="level-number">{level}</span><span className="level-stars">{starCount ? "★".repeat(starCount) + "☆".repeat(3 - starCount) : "—"}</span><small>{config.difficulty}</small></> : <><span className="lock-symbol">⌁</span><span className="level-number">{level}</span></>}
              </button>
            );
          })}
        </section>
      </main>
    );
  }

  if (screen === "result") {
    const starCount = dailyMode ? 0 : stars[currentLevel] || 0;
    const won = cleared >= levelConfig.target && iceBroken >= levelConfig.ice && chainsBroken >= levelConfig.chains && specialsCreated >= levelConfig.specialGoal;
    const reward = won ? (dailyMode ? 20 : 20 + starCount * 15) : 0;
    return (
      <main className="game-app result-stage">
        {renderTopbar(true)}
        <section className={`result-card ${won ? "win" : "loss"}`}>
          <div className="result-glow" />
          <span className="result-ribbon">{won ? (dailyMode ? "DAILY COMPLETE" : "LEVEL COMPLETE") : "LEVEL FAILED"}</span>
          <span className="eyebrow">{won ? "YOU DID IT" : "ONE MORE TRY"}</span>
          <h1>{won ? (starCount === 3 ? "Perfect shift." : "Board cleared.") : "So close."}</h1>
          <div className="result-stars">{won && !dailyMode ? "★".repeat(starCount) + "☆".repeat(3 - starCount) : won ? "★" : "☆☆☆"}</div>
          <div className="result-score"><span>SCORE</span><strong>{score.toLocaleString()}</strong><small>BEST {currentBest.toLocaleString()}</small></div>
          <div className="result-stats"><div><b>{cleared}</b><span>GEMS</span></div><div><b>{moves}</b><span>MOVES LEFT</span></div><div><b>+{reward}</b><span>COINS</span></div></div>
          <div className="result-actions">
            <button className="hero-play" type="button" onClick={mapNextLevel}>{won && !dailyMode && currentLevel < LEVEL_COUNT ? "NEXT LEVEL" : "LEVEL MAP"} <span>▶</span></button>
            <button className="secondary-action" type="button" onClick={() => startGame(levelConfig)}>REPLAY</button>
          </div>
        </section>
      </main>
    );
  }

  const progress = Math.min(1, (cleared / Math.max(1, levelConfig.target)) * 0.62 + (iceBroken / Math.max(1, levelConfig.ice)) * 0.13 + (chainsBroken / Math.max(1, levelConfig.chains)) * 0.13 + (specialsCreated / Math.max(1, levelConfig.specialGoal)) * 0.12);
  const displayLevel = dailyMode ? "★" : currentLevel;
  const objectiveText = [
    `Clear ${levelConfig.target}`,
    levelConfig.ice ? `Break ${levelConfig.ice} ice` : "",
    levelConfig.chains ? `Break ${levelConfig.chains} chains` : "",
    levelConfig.specialGoal ? `Create ${levelConfig.specialGoal} specials` : ""
  ].filter(Boolean).join("  •  ");

  return (
    <main className="game-app play-stage">
      {renderTopbar(true)}
      <section className="play-head">
        <div className="level-chip"><span>LEVEL</span><strong>{displayLevel}</strong><em>{levelConfig.difficulty}</em></div>
        <div className="combo-chip ${combo >= 2 ? "hot" : ""}">COMBO ×<b>{Math.max(1, combo)}</b></div>
        <div className="score-display"><small>SCORE</small><strong>{score.toLocaleString()}</strong></div>
      </section>
      <section className="mission-panel">
        <div className="mission-copy"><span>MISSION</span><strong>{objectiveText}</strong></div>
        <div className="progress-track"><i style={{ width: `${progress * 100}%` }} /></div>
        <div className="mission-values"><span>MOVES <b>{moves}</b></span><span className="wrong">WRONG <b>{wrongSwaps}/{MAX_WRONG_SWAPS}</b></span></div>
      </section>
      <div className="goal-pills">
        <span>❄ <b>{iceBroken}</b>/{levelConfig.ice}</span>
        <span>⛓ <b>{chainsBroken}</b>/{levelConfig.chains}</span>
        <span>✦ <b>{specialsCreated}</b>/{levelConfig.specialGoal}</span>
      </div>

      <section className="board-shell">
        <div className="board-frame">
          <div className="board">
            {board.map((cell, index) => {
              const selectedCell = selected === index;
              const transform = getSwapTransform(index);
              const bursting = burstCells.includes(index);
              const falling = fallingIds.includes(cell.id);
              return (
                <button
                  key={cell.id}
                  type="button"
                  className={`gem-cell color-${cell.color} ${cell.special ? `special-${cell.special}` : ""} ${cell.blocker ? `blocker-${cell.blocker}` : ""} ${selectedCell ? "selected" : ""} ${bursting ? "bursting" : ""} ${falling ? "falling" : ""} ${swapAnim && (swapAnim.from === index || swapAnim.to === index) ? "swapping" : ""}`}
                  style={transform}
                  onClick={() => {
                    if (boosterMode) {
                      useBoosterAt(index);
                      return;
                    }
                    if (busy) return;
                    if (selected === null) {
                      setSelected(index);
                      playSound("tap");
                    } else if (selected === index) {
                      setSelected(null);
                    } else if (areAdjacent(selected, index)) {
                      void performSwap(selected, index);
                    } else {
                      setSelected(index);
                    }
                  }}
                  aria-label={`${COLOR_LABEL[cell.color]} gem`}
                >
                  <span className="gem-sheen" />
                  <span className="gem-core" />
                  {renderGemIcon(cell.special)}
                  {cell.blocker === "ice" && <span className="blocker-icon ice-icon">❄</span>}
                  {cell.blocker === "chain" && <span className="blocker-icon chain-icon">⛓</span>}
                </button>
              );
            })}
            <div className="fx-layer">
              {popups.map((popup) => (
                <span
                  key={popup.id}
                  className="score-popup"
                  style={{ left: `${popup.x}%`, top: `${popup.y}%` }}
                >{popup.text}</span>
              ))}
            </div>
          </div>
          <div className="board-shine" />
        </div>
      </section>

      <section className="booster-dock">
        {(["shuffle", "hammer", "bomb"] as const).map((type) => (
          <button key={type} type="button" className={`booster-button ${boosterMode === type ? "armed" : ""}`} onClick={() => {
            if (!boosters[type] || busy) return;
            setBoosterDialog(type);
          }}>
            <span className={`booster-icon ${type}`}>{type === "shuffle" ? "↻" : type === "hammer" ? "◆" : "✦"}</span>
            <small>{type === "bomb" ? "COLOR BOMB" : type.toUpperCase()}</small>
            <b>{boosters[type]}</b>
          </button>
        ))}
      </section>

      {boosterDialog && (
        <div className="modal-backdrop">
          <div className="modal-card small">
            <div className="modal-gem">✦</div>
            <span className="eyebrow">POWER-UP</span>
            <h2>{boosterDialog === "shuffle" ? "Shuffle the board?" : boosterDialog === "hammer" ? "Hammer a gem?" : "Arm color bomb?"}</h2>
            <p>{boosterDialog === "shuffle" ? "Rearrange the board without spending a move." : boosterDialog === "hammer" ? "Tap one gem to replace it and break any blocker on it." : "Tap one gem to clear every gem of that color."}</p>
            <div className="modal-actions"><button className="modal-primary" onClick={() => applyBooster(boosterDialog)}>USE NOW</button><button className="secondary-action" onClick={() => setBoosterDialog(null)}>CANCEL</button></div>
          </div>
        </div>
      )}

      {boosterMode && <div className="booster-target-banner">SELECT A GEM • <button onClick={() => setBoosterMode(null)}>CANCEL</button></div>}
      {toastMessage && <div className={`game-toast ${toastTone}`}>{toastMessage}</div>}
    </main>
  );
}

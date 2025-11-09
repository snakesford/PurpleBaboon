const GRID_SIZE = 4;

const BASE_ACTIVE_DURATION = 1500;
const MIN_ACTIVE_DURATION = 650;
const ACTIVE_DURATION_STEP = 75;

const BASE_MIN_DELAY = 500;
const BASE_MAX_DELAY = 1500;
const MIN_DELAY_FLOOR = 230;
const MAX_DELAY_FLOOR = 600;
const DELAY_STEP = 60;

const SPEEDUP_INTERVAL = 5;
const MAX_DIFFICULTY_STAGE = 10;

const BLUE_CHANCE = 0.2;
const RED_GRACE_DURATION = 200;

const DIFFICULTY_SETTINGS = {
    easy: {
        speedMultiplier: 1,
        maxConcurrent: 1,
        label: "Easy",
    },
    medium: {
        speedMultiplier: 0.5,
        maxConcurrent: 2,
        label: "Medium",
    },
    hard: {
        speedMultiplier: 1 / 3,
        maxConcurrent: 3,
        label: "Hard",
    },
};

const grid = document.getElementById("grid");
const scoreEl = document.getElementById("score");
const statusEl = document.getElementById("status");
const startBtn = document.getElementById("startBtn");
const pauseBtn = document.getElementById("pauseBtn");
const resetBtn = document.getElementById("resetBtn");
const difficultyButtons = document.querySelectorAll(".difficulty-btn");

let tiles = [];
let score = 0;
let gameActive = false;
let gamePaused = false;
let pendingActivationTimeout = null;
let currentDifficulty = "easy";
const activeTiles = new Map();

function setupGrid() {
    for (let i = 0; i < GRID_SIZE * GRID_SIZE; i += 1) {
        const button = document.createElement("button");
        button.className = "tile";
        button.type = "button";
        button.dataset.state = "idle";
        button.addEventListener("click", () => handleTileClick(button));
        grid.appendChild(button);
        tiles.push(button);
    }
}

function randomDelay() {
    const { min, max } = getDelayBounds();
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

function getDifficultyConfig() {
    return DIFFICULTY_SETTINGS[currentDifficulty] ?? DIFFICULTY_SETTINGS.easy;
}

function getDifficultyStage() {
    if (score <= 0) {
        return 0;
    }
    return Math.min(MAX_DIFFICULTY_STAGE, Math.floor(score / SPEEDUP_INTERVAL));
}

function getActiveDuration() {
    const stage = getDifficultyStage();
    const baseDuration = Math.max(
        BASE_ACTIVE_DURATION - stage * ACTIVE_DURATION_STEP,
        MIN_ACTIVE_DURATION
    );
    const scaled = Math.round(baseDuration * getDifficultyConfig().speedMultiplier);
    return Math.max(scaled, 180);
}

function getDelayBounds() {
    const stage = getDifficultyStage();
    const minDelay = Math.max(BASE_MIN_DELAY - stage * DELAY_STEP, MIN_DELAY_FLOOR);
    const maxDelayCandidate =
        BASE_MAX_DELAY - stage * DELAY_STEP * 2;
    const maxDelay = Math.max(maxDelayCandidate, MAX_DELAY_FLOOR, minDelay + 120);
    const scale = getDifficultyConfig().speedMultiplier;
    const scaledMin = Math.max(Math.round(minDelay * scale), 150);
    const scaledMax = Math.max(Math.round(maxDelay * scale), scaledMin + 80);
    return { min: scaledMin, max: scaledMax };
}

function updateScore(delta) {
    score += delta;
    scoreEl.textContent = score;
}

function setStatus(message, tone = "neutral") {
    statusEl.textContent = message;
    switch (tone) {
        case "positive":
            statusEl.style.color = "#2cb1bc";
            break;
        case "negative":
            statusEl.style.color = "#ef4565";
            break;
        default:
            statusEl.style.color = "var(--neutral)";
    }
}

function clearTileActivation(tile) {
    if (!activeTiles.has(tile)) return;

    const { timeoutId, graceTimeoutId } = activeTiles.get(tile);
    clearTimeout(timeoutId);
    if (graceTimeoutId) {
        clearTimeout(graceTimeoutId);
    }
    tile.dataset.state = "idle";
    tile.classList.remove("active-red", "active-blue");
    activeTiles.delete(tile);
}

function clearAllActivations() {
    Array.from(activeTiles.keys()).forEach((tile) => {
        clearTileActivation(tile);
    });
}

function updateDifficultyButtons() {
    difficultyButtons.forEach((button) => {
        const isActive = button.dataset.difficulty === currentDifficulty;
        button.classList.toggle("is-active", isActive);
        button.disabled = isActive;
        button.setAttribute("aria-pressed", String(isActive));
    });
}

function setDifficulty(level) {
    if (!DIFFICULTY_SETTINGS[level] || currentDifficulty === level) {
        return;
    }
    currentDifficulty = level;
    updateDifficultyButtons();
    const label = DIFFICULTY_SETTINGS[level].label;
    if (gameActive) {
        if (pendingActivationTimeout) {
            clearTimeout(pendingActivationTimeout);
            pendingActivationTimeout = null;
        }
        clearAllActivations();
        scheduleNextActivation();
        setStatus(`${label} mode engaged!`, "neutral");
    } else {
        setStatus(`${label} difficulty selected.`, "neutral");
    }
}

function handleTileClick(tile) {
    if (!gameActive || gamePaused) return;

    const state = tile.dataset.state;

    if (state === "red" || state === "red-grace") {
        updateScore(1);
        setStatus("Nice! You caught the red.", "positive");
        clearTileActivation(tile);
        scheduleNextActivation();
    } else if (state === "blue") {
        updateScore(-1);
        setStatus("Oops! Avoid the blue.", "negative");
        clearTileActivation(tile);
        scheduleNextActivation();
    } else if (state === "idle") {
        updateScore(-1);
        setStatus("Careful! That one wasn't active.", "negative");
    }
}

function getConcurrentActiveCount() {
    return Array.from(activeTiles.values()).reduce((count, info) => {
        return info.state === "red-grace" ? count : count + 1;
    }, 0);
}

function beginRedGrace(tile) {
    const info = activeTiles.get(tile);
    if (!info || info.state !== "red") {
        return;
    }

    info.timeoutId = null;
    tile.dataset.state = "red-grace";

    const graceTimeoutId = setTimeout(() => {
        const currentInfo = activeTiles.get(tile);
        if (!currentInfo || tile.dataset.state !== "red-grace") {
            return;
        }
        updateScore(-1);
        setStatus("Missed a red!", "negative");
        clearTileActivation(tile);
        if (gameActive && !gamePaused) {
            scheduleNextActivation();
        }
    }, RED_GRACE_DURATION);

    activeTiles.set(tile, {
        ...info,
        state: "red-grace",
        graceTimeoutId,
    });

    if (gameActive && !gamePaused) {
        scheduleNextActivation();
    }
}

function activateTile() {
    if (!gameActive || gamePaused) {
        return;
    }

    if (getConcurrentActiveCount() >= getDifficultyConfig().maxConcurrent) {
        scheduleNextActivation();
        return;
    }

    const idleTiles = tiles.filter((tile) => tile.dataset.state === "idle");
    if (idleTiles.length === 0) {
        scheduleNextActivation();
        return;
    }

    const tile =
        idleTiles[Math.floor(Math.random() * idleTiles.length)];

    const isBlue = Math.random() < BLUE_CHANCE;
    const newState = isBlue ? "blue" : "red";
    tile.dataset.state = newState;
    tile.classList.add(isBlue ? "active-blue" : "active-red");

    const activeDuration = getActiveDuration();
    const timeoutId = setTimeout(() => {
        const info = activeTiles.get(tile);
        if (!info || info.state !== newState) {
            return;
        }
        if (newState === "red") {
            beginRedGrace(tile);
            return;
        }
        if (tile.dataset.state === newState) {
            updateScore(1);
            setStatus("Good job avoiding blue.", "positive");
            clearTileActivation(tile);
            if (gameActive && !gamePaused) {
                scheduleNextActivation();
            }
        }
    }, activeDuration);

    activeTiles.set(tile, { timeoutId, state: newState, graceTimeoutId: null });
    if (gameActive && !gamePaused) {
        scheduleNextActivation();
    }
}

function scheduleNextActivation() {
    if (pendingActivationTimeout) {
        clearTimeout(pendingActivationTimeout);
    }
    if (!gameActive || gamePaused) {
        pendingActivationTimeout = null;
        return;
    }
    pendingActivationTimeout = setTimeout(() => {
        pendingActivationTimeout = null;
        activateTile();
    }, randomDelay());
}

function startGame() {
    if (gameActive) return;
    gameActive = true;
    gamePaused = false;
    clearAllActivations();
    pauseBtn.disabled = false;
    pauseBtn.textContent = "Pause";
    setStatus("Game on! Tap reds, dodge blues.");
    scheduleNextActivation();
}

function togglePauseGame() {
    if (!gameActive) return;
    gamePaused = !gamePaused;

    if (gamePaused) {
        if (pendingActivationTimeout) {
            clearTimeout(pendingActivationTimeout);
            pendingActivationTimeout = null;
        }
        clearAllActivations();
        pauseBtn.textContent = "Resume";
        setStatus("Paused. Press resume when ready.", "neutral");
    } else {
        pauseBtn.textContent = "Pause";
        setStatus("Back in the action!", "positive");
        scheduleNextActivation();
    }
}

function resetGame() {
    gameActive = false;
    gamePaused = false;
    if (pendingActivationTimeout) {
        clearTimeout(pendingActivationTimeout);
        pendingActivationTimeout = null;
    }
    clearAllActivations();
    tiles.forEach((tile) => {
        tile.dataset.state = "idle";
        tile.classList.remove("active-red", "active-blue");
    });
    score = 0;
    scoreEl.textContent = score;
    setStatus("Click red, avoid blue!");
    pauseBtn.disabled = true;
    pauseBtn.textContent = "Pause";
}

startBtn.addEventListener("click", startGame);
pauseBtn.addEventListener("click", togglePauseGame);
resetBtn.addEventListener("click", resetGame);
difficultyButtons.forEach((button) => {
    button.addEventListener("click", () => {
        setDifficulty(button.dataset.difficulty);
    });
});

setupGrid();
updateDifficultyButtons();
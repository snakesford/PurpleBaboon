const root = document.documentElement;
const playfield = document.getElementById("playfield");
const scoreValueEl = document.getElementById("scoreValue");
const startBtn = document.getElementById("startBtn");
const pauseBtn = document.getElementById("pauseBtn");
const resetBtn = document.getElementById("resetBtn");
const hud = document.querySelector(".hud");

const SPAWN_INTERVAL_MS = 900;
const MIN_SPAWN_INTERVAL_MS = 450;
const SPAWN_ACCELERATION = 12;
const BALLOON_LIFETIME = 2200;
const SCORE_GAIN = 2;
const SCORE_LOSS = 1;

let score = 0;
let gameActive = false;
let gamePaused = false;
let spawnTimeoutId = null;
let activeBalloons = new Map();
let scoreFlashTimeout = null;
let roundCount = 0;

if (!root || !playfield || !scoreValueEl || !startBtn || !pauseBtn || !resetBtn || !hud) {
    throw new Error("Balloon Dash: required DOM elements are missing.");
}

function updatePlayfieldSize() {
    if (!playfield) {
        return;
    }
    const hudHeight = hud.offsetHeight;
    const width = window.innerWidth;
    const height = Math.max(window.innerHeight - hudHeight, 260);
    root.style.setProperty("--playfield-width", `${width}px`);
    root.style.setProperty("--playfield-height", `${height}px`);
}

function createBalloonId() {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
        return crypto.randomUUID();
    }
    return `balloon-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function updateScore(delta) {
    score += delta;
    if (score < 0) {
        score = 0;
    }
    scoreValueEl.textContent = score;

    if (scoreFlashTimeout) {
        clearTimeout(scoreFlashTimeout);
    }

    scoreValueEl.classList.remove("score-gain", "score-loss");
    void scoreValueEl.offsetWidth;
    if (delta > 0) {
        scoreValueEl.classList.add("score-gain");
    } else if (delta < 0) {
        scoreValueEl.classList.add("score-loss");
    }

    scoreFlashTimeout = setTimeout(() => {
        scoreValueEl.classList.remove("score-gain", "score-loss");
        scoreFlashTimeout = null;
    }, 260);
}

function resetScoreFlash() {
    scoreValueEl.classList.remove("score-gain", "score-loss");
    if (scoreFlashTimeout) {
        clearTimeout(scoreFlashTimeout);
        scoreFlashTimeout = null;
    }
}

function getSpawnInterval() {
    const speedup = Math.floor(roundCount / 10) * SPAWN_ACCELERATION;
    return Math.max(MIN_SPAWN_INTERVAL_MS, SPAWN_INTERVAL_MS - speedup);
}

function randomPosition() {
    const fieldWidth = playfield.clientWidth;
    const fieldHeight = playfield.clientHeight;
    const balloonWidth = Math.min(Math.max(fieldWidth * 0.06, 40), 72);
    const balloonHeight = balloonWidth * 1.5;

    const maxLeft = Math.max(fieldWidth - balloonWidth, 0);
    const maxTop = Math.max(fieldHeight - balloonHeight, 0);

    return {
        left: Math.random() * maxLeft,
        top: Math.random() * maxTop,
    };
}

function removeBalloon(balloonId, reason) {
    if (!activeBalloons.has(balloonId)) {
        return;
    }
    const { element, timeoutId } = activeBalloons.get(balloonId);
    clearTimeout(timeoutId);

    if (reason === "pop") {
        element.classList.add("pop");
    } else {
        element.classList.add("miss");
    }

    setTimeout(() => {
        element.remove();
    }, 240);

    activeBalloons.delete(balloonId);
}

function handleBalloonClick(balloonId) {
    if (!gameActive || gamePaused) {
        return;
    }
    if (!activeBalloons.has(balloonId)) {
        return;
    }

    updateScore(SCORE_GAIN);
    removeBalloon(balloonId, "pop");
}

function spawnBalloon() {
    if (!gameActive || gamePaused) {
        return;
    }

    updatePlayfieldSize();
    const balloonId = createBalloonId();
    const balloon = document.createElement("button");
    balloon.type = "button";
    balloon.className = "balloon";
    balloon.setAttribute("aria-label", "Pop balloon");
    balloon.addEventListener("click", () => handleBalloonClick(balloonId));

    const { left, top } = randomPosition();
    balloon.style.left = `${left}px`;
    balloon.style.top = `${top}px`;

    playfield.appendChild(balloon);
    roundCount += 1;

    const timeoutId = setTimeout(() => {
        if (!activeBalloons.has(balloonId)) {
            return;
        }

        updateScore(-SCORE_LOSS);
        removeBalloon(balloonId, "miss");
    }, BALLOON_LIFETIME);

    activeBalloons.set(balloonId, { element: balloon, timeoutId });

    scheduleNextSpawn();
}

function scheduleNextSpawn() {
    if (spawnTimeoutId) {
        clearTimeout(spawnTimeoutId);
    }
    if (!gameActive || gamePaused) {
        spawnTimeoutId = null;
        return;
    }

    spawnTimeoutId = setTimeout(spawnBalloon, getSpawnInterval());
}

function clearBalloons() {
    activeBalloons.forEach(({ element, timeoutId }) => {
        clearTimeout(timeoutId);
        element.remove();
    });
    activeBalloons.clear();
}

function startGame() {
    if (gameActive) {
        return;
    }
    gameActive = true;
    gamePaused = false;
    pauseBtn.disabled = false;
    pauseBtn.textContent = "Pause";
    roundCount = 0;
    score = 0;
    scoreValueEl.textContent = score;
    clearBalloons();
    if (spawnTimeoutId) {
        clearTimeout(spawnTimeoutId);
        spawnTimeoutId = null;
    }
    resetScoreFlash();
    updatePlayfieldSize();
    scheduleNextSpawn();
}

function togglePause() {
    if (!gameActive) {
        return;
    }

    gamePaused = !gamePaused;

    if (gamePaused) {
        pauseBtn.textContent = "Resume";
        if (spawnTimeoutId) {
            clearTimeout(spawnTimeoutId);
            spawnTimeoutId = null;
        }
    activeBalloons.forEach((balloonInfo, balloonId) => {
        clearTimeout(balloonInfo.timeoutId);
        activeBalloons.set(balloonId, { ...balloonInfo, timeoutId: null });
    });
    } else {
        pauseBtn.textContent = "Pause";
        activeBalloons.forEach((balloonInfo, balloonId) => {
            const timeoutId = setTimeout(() => {
                if (!activeBalloons.has(balloonId)) {
                    return;
                }
                updateScore(-SCORE_LOSS);
                removeBalloon(balloonId, "miss");
            }, BALLOON_LIFETIME);
            activeBalloons.set(balloonId, { ...balloonInfo, timeoutId });
        });
        scheduleNextSpawn();
    }
}

function resetGame() {
    gameActive = false;
    gamePaused = false;
    roundCount = 0;
    if (spawnTimeoutId) {
        clearTimeout(spawnTimeoutId);
        spawnTimeoutId = null;
    }
    clearBalloons();
    score = 0;
    scoreValueEl.textContent = score;
    resetScoreFlash();
    pauseBtn.textContent = "Pause";
    pauseBtn.disabled = true;
    updatePlayfieldSize();
}

function handleVisibilityChange() {
    if (document.hidden && gameActive && !gamePaused) {
        togglePause();
    }
}

startBtn.addEventListener("click", startGame);
pauseBtn.addEventListener("click", togglePause);
resetBtn.addEventListener("click", resetGame);
document.addEventListener("visibilitychange", handleVisibilityChange);

window.addEventListener("resize", () => {
    updatePlayfieldSize();
    activeBalloons.forEach(({ element }) => {
        const { left, top } = randomPosition();
        element.style.left = `${left}px`;
        element.style.top = `${top}px`;
    });
});

updatePlayfieldSize();


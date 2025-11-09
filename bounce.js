const root = document.documentElement;
const playfield = document.getElementById("playfield");
const startBtn = document.getElementById("startBtn");
const pauseBtn = document.getElementById("pauseBtn");
const resetBtn = document.getElementById("resetBtn");
const scoreValueEl = document.getElementById("scoreValue");
const hud = document.querySelector(".hud");

const INITIAL_BALLS = 4;
const BALL_INCREMENT_INTERVAL = 6000;
const MAX_BALLS = 30;
const MIN_SPEED = 110;
const MAX_SPEED = 180;
const CLICK_SCORE = 1;

let animationFrameId = null;
let balls = [];
let gameActive = false;
let gamePaused = false;
let score = 0;
let incrementTimeout = null;
let lastTimestamp = null;

if (!root || !playfield || !startBtn || !pauseBtn || !resetBtn || !scoreValueEl || !hud) {
    throw new Error("Hyper Bounce: required DOM elements are missing.");
}

function updateLayoutMetrics() {
    const hudHeight = hud.offsetHeight;
    root.style.setProperty("--hud-height", `${hudHeight}px`);
    const playfieldHeight = Math.max(window.innerHeight - hudHeight, 260);
    root.style.setProperty("--playfield-height", `${playfieldHeight}px`);
    root.style.setProperty("--playfield-width", `${window.innerWidth}px`);
}

function randomBetween(min, max) {
    return Math.random() * (max - min) + min;
}

function createBall(index) {
    const ball = document.createElement("div");
    ball.className = "ball";
    ball.style.setProperty("--ball-index", index);
    ball.dataset.index = String(index);
    playfield.appendChild(ball);

    const bounds = playfield.getBoundingClientRect();
    const size = ball.offsetWidth || 56;

    const position = {
        x: randomBetween(0, Math.max(bounds.width - size, 0)),
        y: randomBetween(0, Math.max(bounds.height - size, 0)),
    };

    const angle = randomBetween(0, Math.PI * 2);
    const speed = randomBetween(MIN_SPEED, MAX_SPEED);

    const velocity = {
        x: Math.cos(angle) * speed,
        y: Math.sin(angle) * speed,
    };

    const id = crypto.randomUUID();

    const ballData = {
        id,
        element: ball,
        size,
        position,
        velocity,
    };

    ball.addEventListener("click", () => handleBallClick(ballData));
    return ballData;
}

function addBall() {
    const nextIndex = balls.length;
    const newBall = createBall(nextIndex);
    balls.push(newBall);
    return newBall;
}

function scheduleBallIncrement(immediate = false) {
    if (incrementTimeout) {
        clearTimeout(incrementTimeout);
    }
    if (!gameActive || gamePaused) {
        incrementTimeout = null;
        return;
    }
    if (balls.length >= MAX_BALLS) {
        incrementTimeout = null;
        return;
    }

    const delay = immediate ? 400 : BALL_INCREMENT_INTERVAL;
    incrementTimeout = setTimeout(() => {
        if (!gameActive || gamePaused) {
            incrementTimeout = null;
            return;
        }
        addBall();
        scheduleBallIncrement();
    }, delay);
}

function initializeBalls() {
    for (let i = 0; i < INITIAL_BALLS; i += 1) {
        addBall();
    }
}

function clearBalls() {
    balls.forEach((ball) => {
        ball.element.remove();
    });
    balls = [];
}

function clampPosition(value, min, max) {
    return Math.min(Math.max(value, min), max);
}

function updateBall(ball, delta) {
    const bounds = playfield.getBoundingClientRect();
    const maxX = bounds.width - ball.size;
    const maxY = bounds.height - ball.size;

    ball.position.x += ball.velocity.x * delta;
    ball.position.y += ball.velocity.y * delta;

    if (ball.position.x <= 0 || ball.position.x >= maxX) {
        ball.velocity.x *= -1;
        ball.position.x = clampPosition(ball.position.x, 0, maxX);
    }

    if (ball.position.y <= 0 || ball.position.y >= maxY) {
        ball.velocity.y *= -1;
        ball.position.y = clampPosition(ball.position.y, 0, maxY);
    }

    ball.element.style.transform = `translate(${ball.position.x}px, ${ball.position.y}px)`;
}

function animationLoop(timestamp) {
    if (!gameActive || gamePaused) {
        return;
    }
    if (lastTimestamp === null) {
        lastTimestamp = timestamp;
    }
    const delta = (timestamp - lastTimestamp) / 1000;
    lastTimestamp = timestamp;

    balls.forEach((ball) => updateBall(ball, delta));
    animationFrameId = requestAnimationFrame(animationLoop);
}

function startGame() {
    if (gameActive) {
        return;
    }

    updateLayoutMetrics();

    if (balls.length === 0) {
        initializeBalls();
    }

    gameActive = true;
    gamePaused = false;
    lastTimestamp = null;
    startBtn.disabled = true;
    pauseBtn.disabled = false;
    resetBtn.disabled = false;
    pauseBtn.textContent = "Pause";
    pauseBtn.classList.remove("control-btn--resume");
    pauseBtn.classList.add("control-btn--pause");
    scheduleBallIncrement();
    animationFrameId = requestAnimationFrame(animationLoop);
}

function pauseGame() {
    if (!gameActive || gamePaused) {
        return;
    }
    gamePaused = true;
    pauseBtn.textContent = "Resume";
    pauseBtn.classList.remove("control-btn--pause");
    pauseBtn.classList.add("control-btn--resume");
    if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
        animationFrameId = null;
    }
    if (incrementTimeout) {
        clearTimeout(incrementTimeout);
        incrementTimeout = null;
    }
}

function resumeGame() {
    if (!gameActive || !gamePaused) {
        return;
    }
    gamePaused = false;
    pauseBtn.textContent = "Pause";
    pauseBtn.classList.remove("control-btn--resume");
    pauseBtn.classList.add("control-btn--pause");
    lastTimestamp = null;
    scheduleBallIncrement();
    animationFrameId = requestAnimationFrame(animationLoop);
}

function togglePauseGame() {
    if (!gameActive) {
        return;
    }
    if (gamePaused) {
        resumeGame();
    } else {
        pauseGame();
    }
}

function resetGame() {
    gameActive = false;
    gamePaused = false;
    updateLayoutMetrics();
    if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
        animationFrameId = null;
    }
    if (incrementTimeout) {
        clearTimeout(incrementTimeout);
        incrementTimeout = null;
    }
    clearBalls();
    startBtn.disabled = false;
    pauseBtn.disabled = true;
    pauseBtn.textContent = "Pause";
    pauseBtn.classList.remove("control-btn--resume");
    pauseBtn.classList.add("control-btn--pause");
    resetBtn.disabled = true;
    score = 0;
    scoreValueEl.textContent = score;
    lastTimestamp = null;
}

startBtn.addEventListener("click", startGame);
pauseBtn.addEventListener("click", togglePauseGame);
resetBtn.addEventListener("click", resetGame);

function handleBallClick(ball) {
    if (!gameActive || gamePaused) {
        return;
    }
    if (!ball.element.isConnected) {
        return;
    }

    score += CLICK_SCORE;
    scoreValueEl.textContent = score;

    ball.element.classList.add("ball-pop");
    ball.element.style.pointerEvents = "none";

    setTimeout(() => {
        ball.element.remove();
    }, 160);

    balls = balls.filter((existing) => existing.id !== ball.id);
    scheduleBallIncrement(true);
}

updateLayoutMetrics();
window.addEventListener("resize", () => {
    updateLayoutMetrics();
    balls.forEach((ball) => {
        const bounds = playfield.getBoundingClientRect();
        const maxX = Math.max(bounds.width - ball.size, 0);
        const maxY = Math.max(bounds.height - ball.size, 0);
        ball.position.x = clampPosition(ball.position.x, 0, maxX);
        ball.position.y = clampPosition(ball.position.y, 0, maxY);
        ball.element.style.transform = `translate(${ball.position.x}px, ${ball.position.y}px)`;
    });
});

resetGame();


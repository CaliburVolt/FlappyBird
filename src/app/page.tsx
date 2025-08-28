"use client";
import React, { useEffect, useRef, useState } from "react";

type Pipe = {
  x: number;
  top: number; // height of top pipe
  gap: number;
  passed?: boolean; // for scoring
};

export default function FlappyBirdPage() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // UI state only (game uses refs for performance)
  const [score, setScore] = useState(0);
  const [gameOver, setGameOver] = useState(false);
  const [started, setStarted] = useState(false);
  const [dims, setDims] = useState({ w: 480, h: 640 });

  // Game state refs
  const birdRef = useRef({ x: 90, y: 320, vy: 0, size: 22 });
  const pipesRef = useRef<Pipe[]>([]);
  const scoreRef = useRef(0);
  const overRef = useRef(false);
  const startedRef = useRef(false);
  const lastTimeRef = useRef<number | null>(null);
  const timeRef = useRef(0);
  const groundOffsetRef = useRef(0);
  const cloudsRef = useRef<{
    x: number;
    y: number;
    scale: number;
    speed: number;
  }[]>([]);

  // Constants
  const gravity = 1800; // px/s^2
  const jumpVelocity = -420; // px/s
  const pipeWidth = 64;
  const minGap = 150;
  const maxGap = 190;
  const pipeSpacing = 220; // distance between pipe starts in px
  const scrollSpeed = 180; // px/s

  // Resize handling for responsiveness
  useEffect(() => {
    const computeDims = () => {
      // Make it wider and a bit shorter using a 16:9 aspect ratio
      const margin = 24;
      const w = Math.min(960, Math.max(420, Math.floor(window.innerWidth - margin * 2)));
      const h = Math.max(300, Math.min(600, Math.floor((w * 9) / 16))); // 16:9 ratio, lower height
      setDims({ w, h });
      // Keep bird within new bounds
      birdRef.current.y = Math.min(birdRef.current.y, h - birdRef.current.size - 1);
      // Seed clouds for parallax
      const cloudCount = Math.floor(w / 160) + 3;
      cloudsRef.current = Array.from({ length: cloudCount }).map(() => ({
        x: Math.random() * w,
        y: Math.random() * (h * 0.45),
        scale: 0.6 + Math.random() * 0.8,
        speed: 10 + Math.random() * 25,
      }));
    };
    computeDims();
    window.addEventListener("resize", computeDims);
    return () => window.removeEventListener("resize", computeDims);
  }, []);

  // Input handlers
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === "Space" || e.code === "ArrowUp") {
        e.preventDefault();
        flap();
      }
      if (gameOver && (e.code === "Enter" || e.code === "Space")) {
        e.preventDefault();
        restart();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameOver]);

  const flap = () => {
    if (!startedRef.current) {
      startedRef.current = true;
      setStarted(true);
    }
    if (overRef.current) return;
    birdRef.current.vy = jumpVelocity;
  };

  const restart = () => {
    overRef.current = false;
    setGameOver(false);
    startedRef.current = false;
    setStarted(false);
    scoreRef.current = 0;
    setScore(0);
    pipesRef.current = [];
    const h = dims.h;
    birdRef.current = { x: 90, y: Math.floor(h / 2), vy: 0, size: 22 };
    lastTimeRef.current = null;
    // draw initial frame
    draw();
  };

  // Click/touch on canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const onPointer = (e: PointerEvent) => {
      e.preventDefault();
      if (overRef.current) {
        restart();
      } else {
        flap();
      }
    };
    canvas.addEventListener("pointerdown", onPointer);
    return () => canvas.removeEventListener("pointerdown", onPointer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dims.w, dims.h]);

  // Main game loop
  useEffect(() => {
    let raf = 0;
    const loop = (t: number) => {
      if (lastTimeRef.current == null) lastTimeRef.current = t;
      const dt = Math.min(100, t - lastTimeRef.current) / 1000; // clamp dt to 100ms
      lastTimeRef.current = t;
  timeRef.current += dt;
      update(dt);
      draw();
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dims.w, dims.h]);

  const update = (dt: number) => {
    const { w, h } = dims;
    // Background animations (clouds, ground) can move subtly even before start
    const bgSpeed = startedRef.current && !overRef.current ? scrollSpeed : scrollSpeed * 0.25;
    groundOffsetRef.current = (groundOffsetRef.current - bgSpeed * dt) % 40; // tile size 40
    cloudsRef.current = cloudsRef.current.map(c => {
      let x = c.x - c.speed * dt * (startedRef.current && !overRef.current ? 1 : 0.35);
      if (x < -80) x = w + Math.random() * 120;
      return { ...c, x };
    });

    if (!startedRef.current || overRef.current) return;

    // Spawn pipes based on spacing
    if (pipesRef.current.length === 0) {
      spawnPipeRow(h, w + 40);
    } else {
      const last = pipesRef.current[pipesRef.current.length - 1];
      if (w - (last.x + pipeWidth) >= pipeSpacing) {
        spawnPipeRow(h, w + 40);
      }
    }

    // Move pipes
    pipesRef.current.forEach(p => (p.x -= scrollSpeed * dt));
    pipesRef.current = pipesRef.current.filter(p => p.x + pipeWidth > -40);

    // Bird physics
    const bird = birdRef.current;
    bird.vy += gravity * dt;
    bird.y += bird.vy * dt;

    // Floor/ceiling collision
    if (bird.y < 0) {
      bird.y = 0;
      bird.vy = 0;
    }
    if (bird.y + bird.size > h) {
      bird.y = h - bird.size;
      gameOverNow();
    }

    // Pipe collisions and scoring
    for (const p of pipesRef.current) {
      const gapTop = p.top;
      const gapBottom = p.top + p.gap;
      const bx = bird.x;
      const by = bird.y;
      const bs = bird.size;
      const overlapsX = bx + bs > p.x && bx < p.x + pipeWidth;
      const hitsTop = by < gapTop;
      const hitsBottom = by + bs > gapBottom;
      if (overlapsX && (hitsTop || hitsBottom)) {
        gameOverNow();
        break;
      }
      if (!p.passed && p.x + pipeWidth < bx) {
        p.passed = true;
        scoreRef.current += 1;
        setScore(scoreRef.current);
      }
    }
  };

  const spawnPipeRow = (h: number, x: number) => {
    const gap = Math.floor(minGap + Math.random() * (maxGap - minGap));
    const minTop = 30;
    const maxTop = h - gap - 60; // leave a bit of floor room
    const top = Math.floor(minTop + Math.random() * (maxTop - minTop));
    pipesRef.current.push({ x, top, gap, passed: false });
  };

  const gameOverNow = () => {
    if (overRef.current) return;
    overRef.current = true;
    setGameOver(true);
  };

  const draw = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const { w, h } = dims;
    canvas.width = w;
    canvas.height = h;
    
    // Sky gradient
    const sky = ctx.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, "#7fc6ff");
    sky.addColorStop(1, "#d7efff");
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, w, h);

    // Sun
    ctx.beginPath();
    ctx.arc(w - 70, 70, 28, 0, Math.PI * 2);
    ctx.fillStyle = "#ffe07a";
    ctx.fill();
    
    // Clouds (parallax)
    cloudsRef.current.forEach(c => drawCloud(ctx, c.x, c.y, c.scale));

    // Distant hills
    drawHills(ctx, w, h, 0.25, "#a8d08d");
    drawHills(ctx, w, h, 0.35, "#7ec46d");

    // Ground base
    ctx.fillStyle = "#d7cfa1";
    ctx.fillRect(0, h - 40, w, 40);
    // Grass top
    ctx.fillStyle = "#58b45e";
    ctx.fillRect(0, h - 44, w, 8);
    // Ground texture stripes
    drawGroundTexture(ctx, w, h, groundOffsetRef.current);

    // Pipes with glossy effect and caps
    for (const p of pipesRef.current) {
      drawPipe(ctx, p.x, 0, pipeWidth, p.top, true);
      const bottomHeight = h - (p.top + p.gap) - 40;
      drawPipe(ctx, p.x, p.top + p.gap, pipeWidth, bottomHeight, false);
    }

    // Bird with shading, wing and shadow
    const b = birdRef.current;
    const s = b.size;
    const x = b.x;
    const y = b.y;
    // Shadow ellipse on ground
    ctx.save();
    ctx.globalAlpha = 0.25;
    ctx.fillStyle = "#000";
    const shadowY = h - 42;
    const shadowScale = 1 - Math.min(0.6, Math.max(0, (shadowY - (y + s)) / 220));
    ctx.beginPath();
    ctx.ellipse(x + s / 2, h - 10, (s * 0.7) * shadowScale, (s * 0.25) * shadowScale, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Body gradient
    const bodyGrad = ctx.createLinearGradient(x, y, x, y + s);
    bodyGrad.addColorStop(0, "#ffd651");
    bodyGrad.addColorStop(1, "#f1b80f");
    ctx.fillStyle = bodyGrad;
    roundRect(ctx, x, y, s, s, 7);
    ctx.fill();
    ctx.strokeStyle = "#aa8b00";
    ctx.lineWidth = 1;
    ctx.stroke();

    // Wing (simple flap)
    const flap = Math.sin(timeRef.current * 12) * 0.5 + 0.5; // 0..1
    const wingAngle = (-25 + 50 * flap) * (Math.PI / 180);
    ctx.save();
    ctx.translate(x + s * 0.35, y + s * 0.55);
    ctx.rotate(wingAngle);
    ctx.fillStyle = "#f7e07a";
    roundRect(ctx, -s * 0.25, -s * 0.12, s * 0.5, s * 0.24, 6);
    ctx.fill();
    ctx.restore();

    // Beak
    ctx.fillStyle = "#f39c12";
    ctx.beginPath();
    ctx.moveTo(x + s * 0.95, y + s * 0.45);
    ctx.lineTo(x + s * 1.15, y + s * 0.5);
    ctx.lineTo(x + s * 0.95, y + s * 0.55);
    ctx.closePath();
    ctx.fill();

    // Eye
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.arc(x + s * 0.7, y + s * 0.35, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#000";
    ctx.beginPath();
    ctx.arc(x + s * 0.75, y + s * 0.35, 2, 0, Math.PI * 2);
    ctx.fill();

    // Score
    ctx.fillStyle = "#ffffff";
    ctx.strokeStyle = "#000000";
    ctx.lineWidth = 3;
    ctx.font = "bold 28px system-ui, -apple-system, Segoe UI, Roboto";
    ctx.textAlign = "center";
    ctx.strokeText(String(scoreRef.current), w / 2, 50);
    ctx.fillText(String(scoreRef.current), w / 2, 50);

    // Overlays
    if (!startedRef.current) {
      overlayText(ctx, w, h, "Flappy Bird", "Click or press Space to start");
    } else if (overRef.current) {
      overlayText(ctx, w, h, "Game Over", "Click or press Enter to restart");
    }
  };

  return (
    <div style={{ display: "grid", placeItems: "center", minHeight: "100dvh", padding: 16 }}>
      <div style={{ textAlign: "center" }}>
        <canvas
          ref={canvasRef}
          style={{ border: "2px solid #222", borderRadius: 12, touchAction: "manipulation", background: "#87CEEB" }}
        />
        <div style={{ marginTop: 12, display: "flex", gap: 16, justifyContent: "center", alignItems: "center" }}>
          <button
            onClick={() => (gameOver ? restart() : flap())}
            style={{
              padding: "8px 14px",
              fontWeight: 600,
              borderRadius: 8,
              border: "1px solid #222",
              background: "#fff",
              cursor: "pointer",
            }}
          >
            {gameOver ? "Restart" : started ? "Flap" : "Start"}
          </button>
          <span style={{ fontWeight: 700 }}>Score: {score}</span>
        </div>
      </div>
    </div>
  );
}

// Helpers
function overlayText(ctx: CanvasRenderingContext2D, w: number, h: number, title: string, subtitle: string) {
  ctx.fillStyle = "rgba(0,0,0,0.35)";
  ctx.fillRect(0, 0, w, h);
  ctx.textAlign = "center";
  ctx.fillStyle = "#fff";
  ctx.font = "bold 36px system-ui, -apple-system, Segoe UI, Roboto";
  ctx.fillText(title, w / 2, h / 2 - 10);
  ctx.font = "500 18px system-ui, -apple-system, Segoe UI, Roboto";
  ctx.fillText(subtitle, w / 2, h / 2 + 22);
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}

// Drawing helpers
function drawCloud(ctx: CanvasRenderingContext2D, x: number, y: number, scale: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  ctx.fillStyle = "rgba(255,255,255,0.9)";
  ctx.beginPath();
  ctx.arc(0, 10, 12, 0, Math.PI * 2);
  ctx.arc(12, 6, 16, 0, Math.PI * 2);
  ctx.arc(26, 12, 12, 0, Math.PI * 2);
  ctx.arc(14, 14, 14, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawHills(ctx: CanvasRenderingContext2D, w: number, h: number, heightRatio: number, color: string) {
  const baseY = h - 40 - h * heightRatio;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(0, h - 40);
  const amp = 18;
  for (let x = 0; x <= w; x += 8) {
    const y = baseY + Math.sin((x + 0.002 * Date.now()) * 0.02) * amp;
    ctx.lineTo(x, y);
  }
  ctx.lineTo(w, h - 40);
  ctx.closePath();
  ctx.fill();
}

function drawGroundTexture(ctx: CanvasRenderingContext2D, w: number, h: number, offset: number) {
  ctx.save();
  ctx.translate(offset, 0);
  ctx.strokeStyle = "#c8bf8a";
  ctx.lineWidth = 2;
  for (let x = -80; x < w + 80; x += 40) {
    ctx.beginPath();
    ctx.moveTo(x, h - 40);
    ctx.lineTo(x + 20, h - 20);
    ctx.lineTo(x + 40, h - 40);
    ctx.stroke();
  }
  ctx.restore();
}

function drawPipe(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  isTop: boolean,
) {
  if (height <= 0) return;
  // Body gradient
  const grad = ctx.createLinearGradient(x, y, x + width, y);
  grad.addColorStop(0, "#28a745");
  grad.addColorStop(0.5, "#5ddf7a");
  grad.addColorStop(1, "#28a745");
  ctx.fillStyle = grad;
  ctx.strokeStyle = "#1d7d32";
  ctx.lineWidth = 2;
  ctx.fillRect(x, y, width, height);
  ctx.strokeRect(x, y, width, height);
  // Shine
  ctx.fillStyle = "rgba(255,255,255,0.25)";
  ctx.fillRect(x + 6, y + 4, 6, height - 8);

  // Cap
  const capH = 14;
  const capY = isTop ? y + height - capH : y;
  ctx.fillStyle = "#2fb34f";
  ctx.fillRect(x - 6, capY, width + 12, capH);
  ctx.strokeRect(x - 6, capY, width + 12, capH);
}

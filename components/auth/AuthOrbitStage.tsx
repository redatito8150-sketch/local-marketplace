"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { AnimatePresence, motion } from "framer-motion";

const ORBIT_ITEMS = [
  { src: "/images/auth/orbit/jacket.png", label: "Crimson sculptural jacket", size: 150 },
  { src: "/images/auth/orbit/sneaker.png", label: "Black futuristic sneaker", size: 142 },
  { src: "/images/auth/orbit/handbag.png", label: "Burgundy crescent handbag", size: 132 },
  { src: "/images/auth/orbit/necklace.png", label: "Silver statement necklace", size: 122 },
  { src: "/images/auth/orbit/sunglasses.png", label: "Crimson angular sunglasses", size: 118 },
  { src: "/images/auth/orbit/scarf.png", label: "Black and crimson silk scarf", size: 140 },
] as const;

type Body = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  rotation: number;
  spin: number;
};

type Phase = "orbit" | "dark" | "logo" | "lockup" | "fade";

export default function AuthOrbitStage({ compact = false }: { compact?: boolean }) {
  const stageRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<Array<HTMLDivElement | null>>([]);
  const [phase, setPhase] = useState<Phase>("orbit");
  const [cycle, setCycle] = useState(0);

  useEffect(() => {
    setPhase("orbit");
    const timers = [
      window.setTimeout(() => setPhase("dark"), compact ? 8000 : 11000),
      window.setTimeout(() => setPhase("logo"), compact ? 8800 : 12200),
      window.setTimeout(() => setPhase("lockup"), compact ? 9900 : 13800),
      window.setTimeout(() => setPhase("fade"), compact ? 16000 : 22500),
      window.setTimeout(() => setCycle((value) => value + 1), compact ? 17800 : 24700),
    ];
    return () => timers.forEach(window.clearTimeout);
  }, [cycle, compact]);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage || phase !== "orbit") return;

    const width = stage.clientWidth;
    const height = stage.clientHeight;
    const scale = compact ? 0.48 : Math.min(1, width / 650);
    const bodies: Body[] = ORBIT_ITEMS.map((item, index) => {
      const r = item.size * scale * 0.36;
      const angle = (Math.PI * 2 * index) / ORBIT_ITEMS.length + Math.random() * 0.55;
      const radius = Math.min(width, height) * (compact ? 0.22 : 0.28);
      return {
        x: width / 2 + Math.cos(angle) * radius,
        y: height / 2 + Math.sin(angle) * radius,
        vx: (Math.random() - 0.5) * (compact ? 1.45 : 2.05),
        vy: (Math.random() - 0.5) * (compact ? 1.35 : 1.85),
        r,
        rotation: Math.random() * 34 - 17,
        spin: (Math.random() - 0.5) * 0.42,
      };
    });

    let frame = 0;
    let last = performance.now();
    const started = last;

    const animate = (now: number) => {
      const dt = Math.min(2.2, (now - last) / 16.67);
      last = now;
      const elapsed = now - started;
      const escaping = elapsed > (compact ? 5900 : 8500);

      for (let i = 0; i < bodies.length; i += 1) {
        const body = bodies[i];
        if (escaping) {
          const dx = body.x - width / 2 || 1;
          const dy = body.y - height / 2 || 1;
          const length = Math.hypot(dx, dy);
          body.vx += (dx / length) * 0.035 * dt;
          body.vy += (dy / length) * 0.035 * dt;
        } else {
          body.vx += (Math.random() - 0.5) * 0.018 * dt;
          body.vy += (Math.random() - 0.5) * 0.018 * dt;
        }
        body.x += body.vx * dt;
        body.y += body.vy * dt;
        body.rotation += body.spin * dt;

        if (!escaping) {
          if (body.x < body.r) { body.x = body.r; body.vx = Math.abs(body.vx); }
          if (body.x > width - body.r) { body.x = width - body.r; body.vx = -Math.abs(body.vx); }
          if (body.y < body.r) { body.y = body.r; body.vy = Math.abs(body.vy); }
          if (body.y > height - body.r) { body.y = height - body.r; body.vy = -Math.abs(body.vy); }
        }
      }

      for (let i = 0; i < bodies.length; i += 1) {
        for (let j = i + 1; j < bodies.length; j += 1) {
          const a = bodies[i];
          const b = bodies[j];
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const distance = Math.hypot(dx, dy) || 1;
          const minDistance = a.r + b.r;
          if (distance >= minDistance) continue;
          const nx = dx / distance;
          const ny = dy / distance;
          const overlap = (minDistance - distance) / 2;
          a.x -= nx * overlap;
          a.y -= ny * overlap;
          b.x += nx * overlap;
          b.y += ny * overlap;
          const relativeVelocity = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
          if (relativeVelocity < 0) {
            a.vx += relativeVelocity * nx;
            a.vy += relativeVelocity * ny;
            b.vx -= relativeVelocity * nx;
            b.vy -= relativeVelocity * ny;
            a.spin += (Math.random() - 0.5) * 0.35;
            b.spin += (Math.random() - 0.5) * 0.35;
          }
        }
      }

      bodies.forEach((body, index) => {
        const node = itemRefs.current[index];
        if (!node) return;
        node.style.transform = `translate3d(${body.x - body.r}px, ${body.y - body.r}px, 0) rotate(${body.rotation}deg)`;
      });
      frame = requestAnimationFrame(animate);
    };
    frame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frame);
  }, [cycle, compact, phase]);

  const showLogo = phase === "logo" || phase === "lockup" || phase === "fade";

  return (
    <div ref={stageRef} className={`relative overflow-hidden bg-[#080607] ${compact ? "h-[170px] rounded-[24px]" : "h-full min-h-[640px] rounded-[32px]"}`}>
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_34%_28%,rgba(139,13,18,.34),transparent_36%),radial-gradient(circle_at_76%_76%,rgba(83,5,11,.32),transparent_34%),linear-gradient(145deg,#070506_0%,#16090c_48%,#030303_100%)]" />
      <div className="auth-stars absolute inset-0 opacity-60" />
      <div className="absolute left-[12%] top-[18%] h-48 w-48 rounded-full bg-[#8f1118]/16 blur-[90px]" />
      <div className="absolute bottom-[12%] right-[8%] h-56 w-56 rounded-full bg-mahalyred/10 blur-[100px]" />

      <motion.div
        animate={{ opacity: phase === "orbit" ? 1 : 0 }}
        transition={{ duration: phase === "orbit" ? 0.8 : 1.15 }}
        className="absolute inset-0"
      >
        {ORBIT_ITEMS.map((item, index) => (
          <div
            key={`${cycle}-${item.src}`}
            ref={(node) => { itemRefs.current[index] = node; }}
            className="absolute left-0 top-0 will-change-transform"
            style={{ width: (compact ? item.size * 0.48 : item.size), height: (compact ? item.size * 0.48 : item.size) }}
          >
            <div className="relative h-full w-full">
              <Image src={item.src} alt={item.label} fill sizes={compact ? "76px" : "150px"} className="object-contain drop-shadow-[0_18px_24px_rgba(0,0,0,.5)]" />
            </div>
          </div>
        ))}
      </motion.div>

      <AnimatePresence>
        {showLogo && (
          <motion.div
            key={`logo-${cycle}`}
            initial={{ opacity: 0, scale: 0.72, filter: "blur(18px)" }}
            animate={{
              opacity: phase === "fade" ? 0 : 1,
              scale: 1,
              y: phase === "lockup" || phase === "fade" ? (compact ? -13 : -38) : 0,
              filter: "blur(0px)",
            }}
            exit={{ opacity: 0 }}
            transition={{ duration: phase === "lockup" ? 1.1 : 1.45, ease: [0.22, 1, 0.36, 1] }}
            className="absolute inset-0 z-20 flex flex-col items-center justify-center"
          >
            <div className={`relative ${compact ? "h-16 w-16" : "h-40 w-40"}`}>
              <Image src="/images/auth/logo-transparent.png" alt="Mahaly" fill sizes={compact ? "64px" : "160px"} className="object-contain drop-shadow-[0_0_38px_rgba(183,31,26,.38)]" />
            </div>
            <motion.div
              initial={{ opacity: 0, y: 18, filter: "blur(12px)" }}
              animate={{ opacity: phase === "lockup" ? 1 : 0, y: phase === "lockup" ? 0 : 18, filter: phase === "lockup" ? "blur(0px)" : "blur(12px)" }}
              transition={{ duration: 1.15, delay: phase === "lockup" ? 0.35 : 0 }}
              className={`${compact ? "mt-2 text-[25px]" : "mt-5 text-[48px]"} font-serif font-semibold tracking-[-0.04em] text-[#f1d7d4]`}
              lang="ar"
              dir="rtl"
            >
              محلي
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {!compact && (
        <div className="absolute inset-x-0 bottom-7 z-30 flex items-center justify-center gap-2 text-[9px] font-semibold uppercase tracking-[0.22em] text-white/28">
          <span className="h-px w-9 bg-white/15" /> Local pieces in motion <span className="h-px w-9 bg-white/15" />
        </div>
      )}
    </div>
  );
}

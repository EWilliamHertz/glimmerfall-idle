import { useEffect, useRef } from 'react';
import { ENTITY_CATALOG, FOREST_ZONES, NFT_SKIN_CATALOG } from '../game/catalog';
import type { ForestZoneDefinition, PlayerState, ProductionBreakdown } from '../game/types';

interface ForestCanvasProps {
  player: PlayerState;
  production: ProductionBreakdown;
  paused: boolean;
  onHarvestTap: () => void;
}

interface Particle {
  active: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  alpha: number;
  life: number;
  maxLife: number;
  color: string;
  isBurst: boolean;
}

interface FloatingText {
  active: boolean;
  x: number;
  y: number;
  vy: number;
  text: string;
  life: number;
  maxLife: number;
  color: string;
}

interface GlimmerNode {
  xRatio: number;
  yRatio: number;
  radius: number;
  phase: number;
  hitFlash: number;
}

const PARTICLE_POOL_SIZE = 72;
const FLOAT_POOL_SIZE = 16;
const TARGET_FRAME_MS = 34; // ~30 FPS mobile-first battery & compositor friendly pacing

export function ForestCanvas({ player, production, paused, onHarvestTap }: ForestCanvasProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const stateRef = useRef({
    zone: FOREST_ZONES[0] as ForestZoneDefinition,
    clickYield: production.clickYield,
    resonancePerSec: production.resonancePerSec,
    auraHex: '#E6A832',
    hasNftSkin: false,
    paused,
    onHarvestTap,
    backdropDirty: true,
  });

  useEffect(() => {
    const zone = FOREST_ZONES.find((z) => z.id === player.activeZoneId) ?? FOREST_ZONES[0];
    const activeEntity = ENTITY_CATALOG.find((e) => e.id === player.activeEntityId) ?? ENTITY_CATALOG[0];
    const equippedSkinId = player.equippedSkinByEntity[activeEntity.id];
    const skin = NFT_SKIN_CATALOG.find((s) => s.id === equippedSkinId);
    const nextAura = skin?.auraHex ?? zone.palette.nodeGlow;
    const zoneOrAuraChanged =
      stateRef.current.zone.id !== zone.id || stateRef.current.auraHex !== nextAura;

    stateRef.current = {
      zone,
      clickYield: production.clickYield,
      resonancePerSec: production.resonancePerSec,
      auraHex: nextAura,
      hasNftSkin: Boolean(skin),
      paused,
      onHarvestTap,
      backdropDirty: stateRef.current.backdropDirty || zoneOrAuraChanged,
    };
  }, [player, production, paused, onHarvestTap]);

  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) return;

    const bgCanvas = document.createElement('canvas');
    const bgCtx = bgCanvas.getContext('2d', { alpha: false });

    let width = container.clientWidth || 760;
    let height = container.clientHeight || 380;
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);

    const drawTreesLayer = (
      target: CanvasRenderingContext2D,
      layerColor: string,
      baseY: number,
      count: number,
      treeHeight: number,
    ) => {
      target.fillStyle = layerColor;
      const spacing = width / count;
      for (let i = -1; i <= count + 1; i++) {
        const x = i * spacing + ((i * 37) % 24);
        const h = treeHeight * (0.82 + ((i * 19) % 10) * 0.03);
        target.fillRect(x - 6, baseY - h * 0.55, 12, h * 0.65);

        target.beginPath();
        target.moveTo(x, baseY - h);
        target.lineTo(x + 36, baseY - h * 0.42);
        target.lineTo(x - 36, baseY - h * 0.42);
        target.closePath();
        target.fill();

        target.beginPath();
        target.moveTo(x, baseY - h * 0.78);
        target.lineTo(x + 48, baseY - h * 0.15);
        target.lineTo(x - 48, baseY - h * 0.15);
        target.closePath();
        target.fill();
      }
    };

    const rebuildBackdrop = () => {
      if (!bgCtx) return;
      bgCanvas.width = Math.round(width * dpr);
      bgCanvas.height = Math.round(height * dpr);
      bgCtx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const pal = stateRef.current.zone.palette;
      const sky = bgCtx.createLinearGradient(0, 0, 0, height);
      sky.addColorStop(0, pal.skyTop);
      sky.addColorStop(1, pal.skyBottom);
      bgCtx.fillStyle = sky;
      bgCtx.fillRect(0, 0, width, height);

      const beam = bgCtx.createRadialGradient(
        width * 0.52,
        height * 0.16,
        12,
        width * 0.52,
        height * 0.36,
        width * 0.48,
      );
      beam.addColorStop(0, `${stateRef.current.auraHex}38`);
      beam.addColorStop(1, 'rgba(0,0,0,0)');
      bgCtx.fillStyle = beam;
      bgCtx.fillRect(0, 0, width, height);

      drawTreesLayer(bgCtx, pal.canopyBack, height * 0.86, 10, height * 0.62);
      drawTreesLayer(bgCtx, pal.canopyMid, height * 0.92, 7, height * 0.52);

      // Ancient mossy stone sanctuary floor
      bgCtx.fillStyle = pal.ground;
      bgCtx.fillRect(0, height * 0.78, width, height * 0.25);

      // Subtle mossy stone torii / woodland rune pillars framing center node
      bgCtx.fillStyle = pal.canopyFront;
      const cx = width * 0.52;
      bgCtx.fillRect(cx - 72, height * 0.48, 12, height * 0.32);
      bgCtx.fillRect(cx + 60, height * 0.48, 12, height * 0.32);
      bgCtx.fillRect(cx - 88, height * 0.45, 176, 10);

      stateRef.current.backdropDirty = false;
    };

    const applySize = () => {
      width = Math.max(280, container.clientWidth);
      height = Math.max(240, container.clientHeight);
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      stateRef.current.backdropDirty = true;
    };
    applySize();

    const observer = new ResizeObserver(() => applySize());
    observer.observe(container);

    const particles: Particle[] = Array.from({ length: PARTICLE_POOL_SIZE }, (_, i) => ({
      active: i < 28,
      x: Math.random() * width,
      y: Math.random() * height,
      vx: (Math.random() - 0.5) * 12,
      vy: -6 - Math.random() * 12,
      size: 1.6 + Math.random() * 2.2,
      alpha: 0.35 + Math.random() * 0.5,
      life: Math.random() * 4,
      maxLife: 4 + Math.random() * 4,
      color: stateRef.current.zone.palette.particleHex,
      isBurst: false,
    }));

    const floats: FloatingText[] = Array.from({ length: FLOAT_POOL_SIZE }, () => ({
      active: false,
      x: 0,
      y: 0,
      vy: -42,
      text: '',
      life: 0,
      maxLife: 0.9,
      color: '#F5C75E',
    }));

    const nodes: GlimmerNode[] = [
      { xRatio: 0.24, yRatio: 0.57, radius: 22, phase: 0.4, hitFlash: 0 },
      { xRatio: 0.52, yRatio: 0.53, radius: 30, phase: 1.7, hitFlash: 0 },
      { xRatio: 0.78, yRatio: 0.6, radius: 21, phase: 3.1, hitFlash: 0 },
    ];

    let particleCursor = 28;
    let floatCursor = 0;
    let trauma = 0;
    let hitstopTimer = 0;
    let elapsed = 0;
    let autoPulseAccum = 0;

    const spawnBurst = (cx: number, cy: number, color: string) => {
      for (let i = 0; i < 12; i++) {
        const p = particles[particleCursor];
        particleCursor = (particleCursor + 1) % PARTICLE_POOL_SIZE;
        const angle = (Math.PI * 2 * i) / 12 + Math.random() * 0.35;
        const speed = 55 + Math.random() * 115;
        p.active = true;
        p.isBurst = true;
        p.x = cx;
        p.y = cy;
        p.vx = Math.cos(angle) * speed;
        p.vy = Math.sin(angle) * speed - 25;
        p.size = 2 + Math.random() * 2.8;
        p.alpha = 1;
        p.life = 0;
        p.maxLife = 0.45 + Math.random() * 0.3;
        p.color = color;
      }
    };

    const spawnFloat = (cx: number, cy: number, text: string, color: string) => {
      const f = floats[floatCursor];
      floatCursor = (floatCursor + 1) % FLOAT_POOL_SIZE;
      f.active = true;
      f.x = cx + (Math.random() - 0.5) * 16;
      f.y = cy - 16;
      f.vy = -46;
      f.text = text;
      f.life = 0;
      f.maxLife = 0.9;
      f.color = color;
    };

    const handlePointerDown = (e: PointerEvent) => {
      if (stateRef.current.paused) return;
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      let nearest = nodes[1];
      let bestDist = Infinity;
      for (const n of nodes) {
        const d = Math.hypot(n.xRatio * width - x, n.yRatio * height - y);
        if (d < bestDist) {
          bestDist = d;
          nearest = n;
        }
      }
      nearest.hitFlash = 1;
      trauma = Math.min(1, trauma + 0.3);
      hitstopTimer = 0.035;

      spawnBurst(x, y, stateRef.current.auraHex);
      spawnFloat(x, y, `+${stateRef.current.clickYield}`, '#FFE08A');
      stateRef.current.onHarvestTap();
    };
    canvas.addEventListener('pointerdown', handlePointerDown);

    const drawCrystal = (cx: number, cy: number, r: number, color: string, flash: number) => {
      ctx.save();
      ctx.translate(cx, cy);

      ctx.globalAlpha = 0.24 + flash * 0.35;
      ctx.fillStyle = flash > 0.1 ? '#FFF6D6' : color;
      ctx.beginPath();
      ctx.arc(0, 0, r * 1.65, 0, Math.PI * 2);
      ctx.fill();

      ctx.globalAlpha = 1;
      ctx.fillStyle = flash > 0.25 ? '#FFF9E6' : color;
      ctx.beginPath();
      ctx.moveTo(0, -r * 1.15);
      ctx.lineTo(r * 0.68, -r * 0.15);
      ctx.lineTo(r * 0.42, r * 0.95);
      ctx.lineTo(-r * 0.42, r * 0.95);
      ctx.lineTo(-r * 0.68, -r * 0.15);
      ctx.closePath();
      ctx.fill();

      ctx.strokeStyle = '#09110E';
      ctx.lineWidth = 1.6;
      ctx.stroke();

      ctx.fillStyle = 'rgba(255,255,255,0.34)';
      ctx.beginPath();
      ctx.moveTo(0, -r * 1.15);
      ctx.lineTo(r * 0.18, -r * 0.1);
      ctx.lineTo(-r * 0.42, r * 0.95);
      ctx.lineTo(-r * 0.68, -r * 0.15);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    };

    let lastTime = performance.now();
    let timerId: number | null = null;
    let disposed = false;

    const renderFrame = () => {
      if (disposed) return;

      const now = performance.now();
      const rawDt = (now - lastTime) / 1000;
      lastTime = now;
      const dt = Math.min(Math.max(rawDt, 0.001), 0.05);

      const current = stateRef.current;
      const pal = current.zone.palette;

      if (current.backdropDirty) {
        rebuildBackdrop();
      }

      if (!current.paused && !document.hidden) {
        if (hitstopTimer > 0) {
          hitstopTimer = Math.max(0, hitstopTimer - dt);
        } else {
          elapsed += dt;
        }
        trauma = Math.max(0, trauma - dt * 2.4);

        autoPulseAccum += dt;
        if (autoPulseAccum >= 2.2) {
          autoPulseAccum = 0;
          const centerNode = nodes[1];
          spawnFloat(
            centerNode.xRatio * width,
            centerNode.yRatio * height - 10,
            `+${Math.round(current.resonancePerSec * 2.2)}`,
            pal.particleHex,
          );
        }

        for (const n of nodes) {
          n.hitFlash = Math.max(0, n.hitFlash - dt * 4.5);
        }

        for (let i = 0; i < PARTICLE_POOL_SIZE; i++) {
          const p = particles[i];
          if (!p.active) continue;
          p.life += dt;
          if (p.life >= p.maxLife) {
            if (p.isBurst) {
              p.active = false;
            } else {
              p.life = 0;
              p.x = Math.random() * width;
              p.y = height * (0.55 + Math.random() * 0.45);
              p.color = pal.particleHex;
            }
            continue;
          }
          p.x += p.vx * dt;
          p.y += p.vy * dt;
          if (p.isBurst) {
            p.vy += 180 * dt;
            p.alpha = 1 - p.life / p.maxLife;
          } else {
            p.x += Math.sin(elapsed * 1.4 + i) * 8 * dt;
            p.alpha = Math.sin((p.life / p.maxLife) * Math.PI) * 0.85;
          }
        }

        for (let i = 0; i < FLOAT_POOL_SIZE; i++) {
          const f = floats[i];
          if (!f.active) continue;
          f.life += dt;
          if (f.life >= f.maxLife) {
            f.active = false;
            continue;
          }
          f.y += f.vy * dt;
        }
      }

      const shake = trauma * trauma * 5;
      const sx = shake > 0.05 ? (Math.random() - 0.5) * shake : 0;
      const sy = shake > 0.05 ? (Math.random() - 0.5) * shake : 0;

      ctx.save();
      ctx.translate(sx, sy);

      // Blit cached forest backdrop in a single fast drawImage call
      ctx.drawImage(bgCanvas, 0, 0, width, height);

      // Sanctuary resonance ring
      ctx.save();
      ctx.strokeStyle = current.auraHex;
      ctx.globalAlpha = current.hasNftSkin ? 0.65 : 0.36;
      ctx.lineWidth = current.hasNftSkin ? 2.5 : 1.5;
      ctx.beginPath();
      ctx.ellipse(width * 0.52, height * 0.8, 86 + Math.sin(elapsed * 2) * 4, 17, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();

      // Animated Glimmer Nodes
      for (const n of nodes) {
        const bob = Math.sin(elapsed * 2.1 + n.phase) * 5.5;
        const nx = n.xRatio * width;
        const ny = n.yRatio * height + bob;
        const scale = 1 + n.hitFlash * 0.16;
        drawCrystal(nx, ny, n.radius * scale, current.auraHex, n.hitFlash);
      }

      // Pooled fireflies & burst shards
      for (let i = 0; i < PARTICLE_POOL_SIZE; i++) {
        const p = particles[i];
        if (!p.active || p.alpha <= 0.02) continue;
        ctx.globalAlpha = Math.max(0, Math.min(1, p.alpha));
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      // Floating harvest yields
      ctx.font = '600 15px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      for (let i = 0; i < FLOAT_POOL_SIZE; i++) {
        const f = floats[i];
        if (!f.active) continue;
        ctx.globalAlpha = Math.max(0, 1 - f.life / f.maxLife);
        ctx.fillStyle = '#09110E';
        ctx.fillText(f.text, f.x + 1, f.y + 1);
        ctx.fillStyle = f.color;
        ctx.fillText(f.text, f.x, f.y);
      }
      ctx.globalAlpha = 1;

      ctx.restore();

      timerId = window.setTimeout(renderFrame, TARGET_FRAME_MS);
    };

    renderFrame();

    return () => {
      disposed = true;
      if (timerId !== null) window.clearTimeout(timerId);
      observer.disconnect();
      canvas.removeEventListener('pointerdown', handlePointerDown);
    };
  }, []);

  return (
    <div
      ref={containerRef}
      data-testid="forest-canvas-stage"
      className="relative w-full h-[300px] sm:h-[360px] lg:h-[400px] rounded-xl overflow-hidden border border-[#21352C] bg-[#08120E] select-none cursor-pointer"
    >
      <canvas
        ref={canvasRef}
        aria-label="Mystical GlimmerFall forest realm canvas. Click or tap to harvest Glimmer Nodes."
        className="block w-full h-full touch-manipulation"
      />
    </div>
  );
}

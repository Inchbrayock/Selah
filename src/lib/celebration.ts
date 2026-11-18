import { triggerNativeHaptic } from './nativeShell';

const SANCTUARY_PALETTE = ['#1D427D', '#7FA9E8', '#265C4B', '#9C6B21', '#F7F7F4'];

type ConfettiOptions = import('canvas-confetti').Options;
type ConfettiFn = (options?: ConfettiOptions) => Promise<undefined> | null;
let confettiLoader: Promise<ConfettiFn> | null = null;

function loadConfetti(): Promise<ConfettiFn> {
  if (!confettiLoader) {
    confettiLoader = import('canvas-confetti').then(
      (mod) => (mod.default ?? mod) as unknown as ConfettiFn
    );
  }
  return confettiLoader;
}

export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function canRenderCanvasConfetti(): boolean {
  if (typeof document === 'undefined') return false;
  try {
    const canvas = document.createElement('canvas');
    return Boolean(canvas.getContext?.('2d'));
  } catch {
    return false;
  }
}

export function celebrateBookCompleted(enabled: boolean): void {
  if (!enabled || prefersReducedMotion()) return;
  void triggerNativeHaptic('milestone');
  if (!canRenderCanvasConfetti()) return;
  void loadConfetti().then((confetti) =>
    confetti({
      particleCount: 55,
      spread: 68,
      origin: { y: 0.62 },
      colors: SANCTUARY_PALETTE,
      disableForReducedMotion: true,
    })
  );
}

export function celebrateAchievementUnlocked(enabled: boolean, major = false): void {
  if (!enabled || prefersReducedMotion()) return;
  void triggerNativeHaptic(major ? 'success' : 'milestone');
  if (!canRenderCanvasConfetti()) return;
  void loadConfetti().then((confetti) => {
    if (major) {
      return confetti({
        particleCount: 95,
        spread: 90,
        origin: { y: 0.55 },
        colors: SANCTUARY_PALETTE,
        disableForReducedMotion: true,
      });
    }
    return confetti({
      particleCount: 32,
      spread: 50,
      origin: { y: 0.82, x: 0.85 },
      colors: SANCTUARY_PALETTE,
      disableForReducedMotion: true,
    });
  });
}

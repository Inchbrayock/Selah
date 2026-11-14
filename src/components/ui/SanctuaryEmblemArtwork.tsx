import React from 'react';
import type { SanctuaryEmblemDefinition, SanctuaryEmblemId } from '../../lib/avatar';

interface SanctuaryEmblemArtworkProps {
  emblem: SanctuaryEmblemDefinition;
  className?: string;
}

const EMBLEM_SHAPES: Record<
  SanctuaryEmblemId,
  (emblem: SanctuaryEmblemDefinition) => React.ReactNode
> = {
  lamp: (e) => (
    <>
      <path
        d="M32 13.5 C36 19.2 36.4 24.3 32 27.6 C27.6 24.3 28 19.2 32 13.5 Z"
        fill={e.ink}
        opacity="0.92"
      />
      <path
        d="M32 18.2 C33.6 20.6 33.7 22.8 32 24.5 C30.3 22.8 30.4 20.6 32 18.2 Z"
        fill={e.accent}
      />
      <path
        d="M21.5 33.5 C21.5 29.8 26.2 28.2 32 28.2 C37.8 28.2 42.5 29.8 42.5 33.5 C42.5 39 38.1 42.5 32 42.5 C25.9 42.5 21.5 39 21.5 33.5 Z"
        fill={e.accent}
        fillOpacity="0.14"
        stroke={e.ink}
        strokeWidth="2.1"
        strokeLinejoin="round"
      />
      <path
        d="M42.5 33 C46.4 33 47.8 35.8 45.5 38.4 C44.1 39.8 41.7 39.7 39.8 38.8"
        fill="none"
        stroke={e.ink}
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M21.5 33.5 L17 30.8"
        fill="none"
        stroke={e.ink}
        strokeWidth="2.1"
        strokeLinecap="round"
      />
      <path
        d="M28.4 42.5 L35.6 42.5 L34.2 47 L29.8 47 Z"
        fill={e.ink}
        fillOpacity="0.22"
        stroke={e.ink}
        strokeWidth="1.9"
        strokeLinejoin="round"
      />
      <line x1="25" y1="47.2" x2="39" y2="47.2" stroke={e.ink} strokeWidth="2.2" strokeLinecap="round" />
    </>
  ),
  scroll: (e) => (
    <>
      <rect
        x="20"
        y="19"
        width="24"
        height="26"
        rx="2.2"
        fill={e.accent}
        fillOpacity="0.14"
        stroke={e.ink}
        strokeWidth="2.1"
      />
      <path
        d="M20 22.5 C17 22.5 16 19.6 18.2 18 C20.1 16.8 22 18 22 19.8"
        fill="none"
        stroke={e.ink}
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M44 41.5 C47 41.5 48 44.4 45.8 46 C43.9 47.2 42 46 42 44.2"
        fill="none"
        stroke={e.ink}
        strokeWidth="2"
        strokeLinecap="round"
      />
      <line x1="25" y1="26" x2="39" y2="26" stroke={e.ink} strokeWidth="2.1" strokeLinecap="round" />
      <line x1="25" y1="31.8" x2="39" y2="31.8" stroke={e.accent} strokeWidth="2" strokeLinecap="round" />
      <line x1="25" y1="37.5" x2="34.5" y2="37.5" stroke={e.accent} strokeWidth="2" strokeLinecap="round" />
    </>
  ),
  olive: (e) => (
    <>
      <path
        d="M19.5 45.5 C24.8 36 33 27 45.5 18.5"
        fill="none"
        stroke={e.ink}
        strokeWidth="2.2"
        strokeLinecap="round"
      />
      <path
        d="M25.2 38 C19.8 35.4 18.3 30.8 22 28.2 C25.1 30.8 26.6 34.5 25.2 38 Z"
        fill={e.accent}
        fillOpacity="0.28"
        stroke={e.ink}
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path
        d="M31.2 31 C25.9 27.9 25.4 22.9 29.6 20.8 C32.3 23.9 32.9 27.7 31.2 31 Z"
        fill={e.accent}
        fillOpacity="0.28"
        stroke={e.ink}
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path
        d="M29 36.2 C33.7 38.8 38.7 37.8 40.3 33.6 C36.3 31.9 32.1 33.1 29 36.2 Z"
        fill={e.accent}
        fillOpacity="0.28"
        stroke={e.ink}
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path
        d="M36.2 27.4 C40.8 29.5 45.3 28 46.4 23.8 C42.4 22.8 38.7 24.4 36.2 27.4 Z"
        fill={e.accent}
        fillOpacity="0.28"
        stroke={e.ink}
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <circle cx="38.2" cy="21.6" r="2.4" fill={e.accent} />
    </>
  ),
  dove: (e) => (
    <>
      <path
        d="M17.5 35 C21.8 27.8 28.8 25.8 35 28 C37.2 21.8 41.2 17.8 46.2 19 C43.6 22 43 26 42 29.2 C45 31.2 46 34.8 43.4 36.8 C39.3 35.8 36.3 37.8 33.8 40.4 C28.8 45 21.8 44.8 16.8 41.6 C19.8 39.6 21.8 37.6 17.5 35 Z"
        fill={e.accent}
        fillOpacity="0.2"
        stroke={e.ink}
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path
        d="M24 29.8 C25.2 22.2 31.2 17.8 37.2 17.2"
        fill="none"
        stroke={e.ink}
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path d="M44.5 27.4 L49.6 25.8" fill="none" stroke={e.accent} strokeWidth="2" strokeLinecap="round" />
    </>
  ),
  vine: (e) => (
    <>
      <path d="M32 15.5 L32 47.5" fill="none" stroke={e.ink} strokeWidth="2.1" strokeLinecap="round" />
      <path
        d="M32 28 C26.2 24.4 21.8 21.4 20.6 17.4"
        fill="none"
        stroke={e.ink}
        strokeWidth="1.9"
        strokeLinecap="round"
      />
      <path
        d="M32 34 C37.8 30.4 42.2 27.4 43.4 23.4"
        fill="none"
        stroke={e.ink}
        strokeWidth="1.9"
        strokeLinecap="round"
      />
      <circle cx="24" cy="36" r="2.8" fill={e.ink} opacity="0.86" />
      <circle cx="29.5" cy="38.5" r="2.8" fill={e.accent} />
      <circle cx="26.5" cy="42.8" r="2.8" fill={e.ink} opacity="0.82" />
      <circle cx="38.5" cy="35" r="2.8" fill={e.ink} opacity="0.86" />
      <circle cx="42" cy="39.8" r="2.6" fill={e.accent} />
    </>
  ),
  star: (e) => (
    <>
      <path
        d="M32 13.5 L35.4 28.6 L50.5 32 L35.4 35.4 L32 50.5 L28.6 35.4 L13.5 32 L28.6 28.6 Z"
        fill={e.ink}
        opacity="0.94"
      />
      <path
        d="M22.2 22.2 L29.4 29.4 M41.8 22.2 L34.6 29.4 M22.2 41.8 L29.4 34.6 M41.8 41.8 L34.6 34.6"
        stroke={e.accent}
        strokeWidth="1.9"
        strokeLinecap="round"
      />
      <circle cx="32" cy="32" r="3.2" fill={e.accent} />
    </>
  ),
  arch: (e) => (
    <>
      <path
        d="M21 46.2 L21 30 C21 22.8 25.8 17.8 32 17.8 C38.2 17.8 43 22.8 43 30 L43 46.2"
        fill="none"
        stroke={e.ink}
        strokeWidth="2.2"
        strokeLinecap="round"
      />
      <path
        d="M25.6 46.2 L25.6 30.5 C25.6 25.6 28.4 22.3 32 22.3 C35.6 22.3 38.4 25.6 38.4 30.5 L38.4 46.2"
        fill={e.accent}
        fillOpacity="0.18"
        stroke={e.ink}
        strokeWidth="1.7"
      />
      <line x1="17" y1="46.2" x2="47" y2="46.2" stroke={e.ink} strokeWidth="2.2" strokeLinecap="round" />
      <circle cx="32" cy="31.2" r="2.8" fill={e.accent} />
    </>
  ),
  wheat: (e) => (
    <>
      <path d="M32 47.2 L32 16.5" fill="none" stroke={e.ink} strokeWidth="2.1" strokeLinecap="round" />
      <path
        d="M25 46.2 L28 31 C28.5 25.8 26.5 20.8 23 17.8"
        fill="none"
        stroke={e.ink}
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M39 46.2 L36 31 C35.5 25.8 37.5 20.8 41 17.8"
        fill="none"
        stroke={e.ink}
        strokeWidth="2"
        strokeLinecap="round"
      />
      <ellipse cx="29" cy="23.8" rx="2.2" ry="3.5" transform="rotate(-24 29 23.8)" fill={e.ink} opacity="0.86" />
      <ellipse cx="35" cy="23.8" rx="2.2" ry="3.5" transform="rotate(24 35 23.8)" fill={e.ink} opacity="0.86" />
      <ellipse cx="28.4" cy="31" rx="2.2" ry="3.5" transform="rotate(-24 28.4 31)" fill={e.accent} />
      <ellipse cx="35.6" cy="31" rx="2.2" ry="3.5" transform="rotate(24 35.6 31)" fill={e.accent} />
      <line x1="25.2" y1="39.2" x2="38.8" y2="39.2" stroke={e.ink} strokeWidth="2.2" strokeLinecap="round" />
    </>
  ),
};

export const SanctuaryEmblemArtwork: React.FC<SanctuaryEmblemArtworkProps> = ({
  emblem,
  className = 'h-full w-full',
}) => {
  return (
    <svg viewBox="0 0 64 64" aria-hidden="true" className={className}>
      <circle cx="32" cy="32" r="32" fill={emblem.bg} />
      <circle cx="32" cy="32" r="28.2" fill="none" stroke={emblem.ring} strokeWidth="1.2" />
      {EMBLEM_SHAPES[emblem.id](emblem)}
    </svg>
  );
};

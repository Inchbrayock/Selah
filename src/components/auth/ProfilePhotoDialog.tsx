import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  Camera,
  Check,
  Link2,
  RotateCcw,
  Trash2,
  Upload,
  X,
  ZoomIn,
} from 'lucide-react';
import { motion } from 'motion/react';
import {
  cropImageToAvatarDataUrl,
  parseSanctuaryEmblemUrl,
  readAvatarImageFile,
  SANCTUARY_EMBLEMS,
  getSanctuaryEmblemUrl,
  validateCustomHttpsPhotoUrl,
  type LoadedAvatarImage,
  type SanctuaryEmblemId,
} from '../../lib/avatar';
import { TACTILE_PILL_TAP } from '../../lib/motion';
import { useBibleStore } from '../../store/useBibleStore';
import { ModalDialog } from '../ui/ModalDialog';
import { ProfileAvatar } from '../ui/ProfileAvatar';
import { SanctuaryEmblemArtwork } from '../ui/SanctuaryEmblemArtwork';

interface ProfilePhotoDialogProps {
  open: boolean;
  onClose: () => void;
}

type DraftChoice =
  | { kind: 'cloud'; photoURL: string | null }
  | { kind: 'local'; dataUrl: string };

interface CropSession {
  loaded: LoadedAvatarImage;
  zoom: number;
  offsetX: number;
  offsetY: number;
}

const CROP_VIEWPORT_PX = 192;

export const ProfilePhotoDialog: React.FC<ProfilePhotoDialogProps> = ({ open, onClose }) => {
  const { user, updateProfilePhoto } = useBibleStore();
  const titleId = useId();
  const descId = useId();
  const urlInputId = useId();
  const zoomInputId = useId();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [draft, setDraft] = useState<DraftChoice>({ kind: 'cloud', photoURL: null });
  const [urlOpen, setUrlOpen] = useState(false);
  const [urlInput, setUrlInput] = useState('');
  const [cropSession, setCropSession] = useState<CropSession | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const dragStateRef = useRef<{
    pointerId: number;
    startClientX: number;
    startClientY: number;
    startOffsetX: number;
    startOffsetY: number;
  } | null>(null);

  useEffect(() => {
    if (!open || !user) return;
    const currentUrl = user.photoURL ?? null;
    if (currentUrl && currentUrl.startsWith('data:')) {
      setDraft({ kind: 'local', dataUrl: currentUrl });
      setUrlInput('');
    } else {
      setDraft({ kind: 'cloud', photoURL: currentUrl });
      const isEmblem = Boolean(parseSanctuaryEmblemUrl(currentUrl));
      setUrlInput(currentUrl && !isEmblem ? currentUrl : '');
    }
    setUrlOpen(false);
    setCropSession(null);
    setErrorMsg(null);
    setSubmitting(false);
  }, [open, user]);

  const currentEffectiveUrl = user?.photoURL ?? null;
  const previewUrl = draft.kind === 'local' ? draft.dataUrl : draft.photoURL;
  const activeEmblem = useMemo(() => parseSanctuaryEmblemUrl(previewUrl), [previewUrl]);
  const providerPhotoURL =
    user?.providerPhotoURL && user.providerPhotoURL.startsWith('https://')
      ? user.providerPhotoURL
      : null;

  const hasChanges = Boolean(cropSession) || previewUrl !== currentEffectiveUrl;

  const stageLabel = useMemo(() => {
    if (cropSession) return 'Drag photo to frame portrait';
    if (draft.kind === 'local') return 'Device portrait · saved on this device';
    if (activeEmblem) return `Sanctuary seal · ${activeEmblem.label}`;
    if (draft.photoURL) {
      if (providerPhotoURL && draft.photoURL === providerPhotoURL) {
        return 'Google account portrait · syncs everywhere';
      }
      return 'Linked portrait · syncs everywhere';
    }
    return 'Serif monogram · default initials';
  }, [cropSession, draft, activeEmblem, providerPhotoURL]);

  const previewUser = useMemo(
    () => ({
      displayName: user?.displayName ?? null,
      email: user?.email ?? null,
      photoURL: previewUrl,
    }),
    [user?.displayName, user?.email, previewUrl]
  );

  const handleSelectFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setErrorMsg(null);
    try {
      const loaded = await readAvatarImageFile(file);
      setCropSession({
        loaded,
        zoom: 1,
        offsetX: 0,
        offsetY: 0,
      });
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Could not open that image file.');
    }
  };

  const cropGeometry = useMemo(() => {
    if (!cropSession) return null;
    const { naturalWidth, naturalHeight } = cropSession.loaded;
    const coverScale =
      Math.max(CROP_VIEWPORT_PX / naturalWidth, CROP_VIEWPORT_PX / naturalHeight) * cropSession.zoom;
    const drawW = naturalWidth * coverScale;
    const drawH = naturalHeight * coverScale;
    const maxShiftX = Math.max(0, (drawW - CROP_VIEWPORT_PX) / 2);
    const maxShiftY = Math.max(0, (drawH - CROP_VIEWPORT_PX) / 2);
    return {
      drawW,
      drawH,
      maxShiftX,
      maxShiftY,
      translateX: cropSession.offsetX * maxShiftX,
      translateY: cropSession.offsetY * maxShiftY,
    };
  }, [cropSession]);

  const handleCropPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!cropSession) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture?.(e.pointerId);
    dragStateRef.current = {
      pointerId: e.pointerId,
      startClientX: e.clientX,
      startClientY: e.clientY,
      startOffsetX: cropSession.offsetX,
      startOffsetY: cropSession.offsetY,
    };
  };

  const handleCropPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragStateRef.current;
    if (!drag || drag.pointerId !== e.pointerId || !cropGeometry) return;
    const dx = e.clientX - drag.startClientX;
    const dy = e.clientY - drag.startClientY;

    const nextOffsetX =
      cropGeometry.maxShiftX > 0.5
        ? Math.max(-1, Math.min(1, drag.startOffsetX + dx / cropGeometry.maxShiftX))
        : 0;
    const nextOffsetY =
      cropGeometry.maxShiftY > 0.5
        ? Math.max(-1, Math.min(1, drag.startOffsetY + dy / cropGeometry.maxShiftY))
        : 0;

    setCropSession((prev) =>
      prev
        ? {
            ...prev,
            offsetX: nextOffsetX,
            offsetY: nextOffsetY,
          }
        : prev
    );
  };

  const handleCropPointerEnd = (e: React.PointerEvent<HTMLDivElement>) => {
    if (dragStateRef.current?.pointerId === e.pointerId) {
      dragStateRef.current = null;
    }
  };

  const applyFramedCropToDraft = (): DraftChoice | null => {
    if (!cropSession) return null;
    const dataUrl = cropImageToAvatarDataUrl({
      image: cropSession.loaded.image,
      naturalWidth: cropSession.loaded.naturalWidth,
      naturalHeight: cropSession.loaded.naturalHeight,
      zoom: cropSession.zoom,
      offsetX: cropSession.offsetX,
      offsetY: cropSession.offsetY,
    });
    const next: DraftChoice = { kind: 'local', dataUrl };
    setDraft(next);
    setCropSession(null);
    return next;
  };

  const handleSelectEmblem = (id: SanctuaryEmblemId) => {
    setErrorMsg(null);
    setCropSession(null);
    setDraft({ kind: 'cloud', photoURL: getSanctuaryEmblemUrl(id) });
  };

  const handleApplyCustomUrl = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    const validated = validateCustomHttpsPhotoUrl(urlInput);
    if (!validated.ok) {
      setErrorMsg(validated.error);
      return;
    }
    setCropSession(null);
    setDraft({ kind: 'cloud', photoURL: validated.url });
  };

  const handleSave = async () => {
    if (!user || submitting) return;
    setErrorMsg(null);

    let choiceToSave: DraftChoice = draft;
    if (cropSession) {
      try {
        const applied = applyFramedCropToDraft();
        if (applied) choiceToSave = applied;
      } catch (err) {
        setErrorMsg(err instanceof Error ? err.message : 'Could not crop this photo.');
        return;
      }
    }

    setSubmitting(true);
    try {
      await updateProfilePhoto(choiceToSave);
      onClose();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Could not update profile picture.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ModalDialog
      open={open}
      onClose={onClose}
      labelledBy={titleId}
      className="folio-sheet max-w-[35rem]"
    >
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--border-subtle)] bg-[var(--bg-surface)] px-5 py-4 sm:px-6">
        <div className="min-w-0">
          <h2 id={titleId} className="font-display text-xl font-medium text-[var(--text-primary)]">
            Profile picture
          </h2>
          <p id={descId} className="mt-0.5 text-xs text-[var(--text-secondary)]">
            Upload a photo from your device, choose a Sanctuary seal, or paste an image link.
          </p>
        </div>
        <motion.button
          type="button"
          whileTap={TACTILE_PILL_TAP}
          onClick={onClose}
          aria-label="Close profile picture studio"
          className="inline-flex min-h-10 min-w-10 shrink-0 items-center justify-center rounded-md border border-[var(--border-subtle)] bg-[var(--bg-elevated)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] sm:min-h-9 sm:min-w-9"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </motion.button>
      </div>

      <div aria-describedby={descId} className="min-h-0 flex-1 space-y-5 overflow-y-auto p-5 sm:p-6">
        {errorMsg && (
          <div
            role="alert"
            className="rounded-md border border-[color-mix(in_oklab,var(--color-crimson)_40%,var(--border-subtle))] bg-[color-mix(in_oklab,var(--color-crimson)_8%,transparent)] px-3.5 py-2.5 text-xs leading-relaxed text-[var(--color-crimson)]"
          >
            {errorMsg}
          </div>
        )}

        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif,image/*"
          onChange={(e) => void handleSelectFile(e)}
          aria-label="Choose photo file"
          className="visually-hidden"
        />

        {/* Portrait Stage: Framing Studio or Live Preview */}
        <section
          aria-label="Portrait preview"
          className="rounded-md border border-[var(--border-subtle)] bg-[var(--bg-canvas)] p-4 sm:p-5"
        >
          {cropSession && cropGeometry ? (
            <div data-no-sheet-drag className="flex flex-col items-center gap-4">
              <div
                onPointerDown={handleCropPointerDown}
                onPointerMove={handleCropPointerMove}
                onPointerUp={handleCropPointerEnd}
                onPointerCancel={handleCropPointerEnd}
                role="application"
                aria-label="Portrait crop viewfinder. Drag to position your photo."
                className="relative h-48 w-48 cursor-grab touch-none overflow-hidden rounded-full border-2 border-[var(--color-accent)] bg-[var(--bg-elevated)] shadow-sm active:cursor-grabbing"
              >
                <img
                  src={cropSession.loaded.src}
                  alt=""
                  draggable={false}
                  style={{
                    width: `${cropGeometry.drawW}px`,
                    height: `${cropGeometry.drawH}px`,
                    transform: `translate(calc(-50% + ${cropGeometry.translateX}px), calc(-50% + ${cropGeometry.translateY}px))`,
                  }}
                  className="pointer-events-none absolute top-1/2 left-1/2 max-w-none select-none"
                />
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-1 rounded-full border border-white/45"
                />
              </div>

              <div className="w-full max-w-xs space-y-2.5">
                <div className="flex items-center justify-between text-xs text-[var(--text-secondary)]">
                  <label htmlFor={zoomInputId} className="inline-flex items-center gap-1.5 font-medium">
                    <ZoomIn className="h-3.5 w-3.5 text-[var(--color-accent)]" aria-hidden="true" />
                    <span>Zoom</span>
                  </label>
                  <span className="font-mono text-[0.72rem] tabular-nums">
                    {cropSession.zoom.toFixed(1)}×
                  </span>
                </div>
                <input
                  id={zoomInputId}
                  type="range"
                  min={1}
                  max={3}
                  step={0.05}
                  value={cropSession.zoom}
                  onChange={(e) =>
                    setCropSession((prev) =>
                      prev ? { ...prev, zoom: Number.parseFloat(e.target.value) } : prev
                    )
                  }
                  className="w-full accent-[var(--color-accent)]"
                />
                <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => {
                      try {
                        applyFramedCropToDraft();
                      } catch (err) {
                        setErrorMsg(err instanceof Error ? err.message : 'Could not crop this photo.');
                      }
                    }}
                    className="btn-primary inline-flex min-h-10 items-center gap-1.5 rounded-md px-3.5 py-2 text-xs font-medium sm:min-h-8 sm:py-1.5"
                  >
                    <Check className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>Apply framing</span>
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setCropSession((prev) =>
                        prev ? { ...prev, zoom: 1, offsetX: 0, offsetY: 0 } : prev
                      )
                    }
                    className="inline-flex min-h-10 items-center rounded-md border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-3 py-2 text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] sm:min-h-8 sm:py-1.5"
                  >
                    Center
                  </button>
                  <button
                    type="button"
                    onClick={() => setCropSession(null)}
                    className="inline-flex min-h-10 items-center rounded-md border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-3 py-2 text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] sm:min-h-8 sm:py-1.5"
                  >
                    Discard photo
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-center sm:gap-5">
              {/* Hairline double-matted medallion frame */}
              <div className="shrink-0 rounded-full border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-1 shadow-xs">
                <ProfileAvatar
                  user={previewUser}
                  sizeClassName="h-20 w-20"
                  textClassName="text-2xl"
                />
              </div>

              <div className="min-w-0 flex-1 text-center sm:text-left">
                <p className="truncate font-display text-lg font-medium text-[var(--text-primary)]">
                  {user?.displayName || 'Selah Reader'}
                </p>
                <p className="mt-0.5 text-xs text-[var(--text-secondary)]">{stageLabel}</p>

                <div className="mt-3 flex flex-wrap items-center justify-center gap-2 sm:justify-start">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="inline-flex min-h-10 items-center gap-1.5 rounded-md border border-[var(--border-strong)] bg-[var(--bg-elevated)] px-3 py-1.5 text-xs font-medium text-[var(--text-primary)] transition-colors hover:bg-[var(--bg-surface)] sm:min-h-8"
                  >
                    <Upload className="h-3.5 w-3.5 text-[var(--color-accent)]" aria-hidden="true" />
                    <span>Upload photo</span>
                  </button>

                  {providerPhotoURL && previewUrl !== providerPhotoURL && (
                    <button
                      type="button"
                      onClick={() => {
                        setErrorMsg(null);
                        setDraft({ kind: 'cloud', photoURL: providerPhotoURL });
                      }}
                      className="inline-flex min-h-10 items-center gap-1.5 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-3 py-1.5 text-xs font-medium text-[var(--text-secondary)] transition-colors hover:border-[var(--border-strong)] hover:text-[var(--text-primary)] sm:min-h-8"
                    >
                      <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                      <span>Use Google photo</span>
                    </button>
                  )}

                  {previewUrl !== null && (
                    <button
                      type="button"
                      onClick={() => {
                        setErrorMsg(null);
                        setDraft({ kind: 'cloud', photoURL: null });
                      }}
                      className="inline-flex min-h-10 items-center gap-1.5 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-3 py-1.5 text-xs font-medium text-[var(--text-secondary)] transition-colors hover:border-[var(--color-crimson)]/40 hover:text-[var(--color-crimson)] sm:min-h-8"
                    >
                      <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                      <span>Use initials</span>
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}
        </section>

        {/* Curated Sanctuary Seals */}
        <section aria-labelledby="sanctuary-seals-picker-heading">
          <div className="mb-2.5 flex items-baseline justify-between gap-2">
            <h3
              id="sanctuary-seals-picker-heading"
              className="text-xs font-medium tracking-[0.06em] text-[var(--text-secondary)] uppercase"
            >
              Sanctuary seals
            </h3>
            <span className="text-[0.72rem] text-[var(--text-secondary)]">
              Syncs everywhere
            </span>
          </div>

          <div
            role="radiogroup"
            aria-label="Sanctuary portrait seals"
            className="grid grid-cols-2 gap-2 sm:grid-cols-4"
          >
            {SANCTUARY_EMBLEMS.map((emblem) => {
              const selected = !cropSession && activeEmblem?.id === emblem.id;
              return (
                <button
                  key={emblem.id}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => handleSelectEmblem(emblem.id)}
                  className={`group relative flex min-h-20 flex-col items-center justify-center gap-1.5 rounded-md border px-2 py-2.5 text-center transition-colors ${
                    selected
                      ? 'border-[var(--color-accent)] bg-[var(--color-accent-soft)]'
                      : 'border-[var(--border-subtle)] bg-[var(--bg-canvas)] hover:border-[var(--border-strong)] hover:bg-[var(--bg-surface)]'
                  }`}
                >
                  <span className="relative h-10 w-10 shrink-0 overflow-hidden rounded-full border border-[var(--border-subtle)]">
                    <SanctuaryEmblemArtwork emblem={emblem} />
                  </span>
                  <div className="min-w-0">
                    <span className="block truncate text-xs font-medium text-[var(--text-primary)]">
                      {emblem.label}
                    </span>
                    <span className="block font-mono text-[0.65rem] text-[var(--text-secondary)]">
                      {emblem.scriptureHint}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </section>

        {/* Discreet Image URL Option */}
        <section className="border-t border-[var(--border-subtle)] pt-3.5">
          <button
            type="button"
            onClick={() => setUrlOpen((v) => !v)}
            aria-expanded={urlOpen}
            className="inline-flex min-h-9 items-center gap-1.5 text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
          >
            <Link2 className="h-3.5 w-3.5 text-[var(--color-accent)]" aria-hidden="true" />
            <span>{urlOpen ? 'Hide image URL input' : 'Use an image link instead'}</span>
          </button>

          {urlOpen && (
            <form onSubmit={handleApplyCustomUrl} className="mt-2.5 space-y-2">
              <label htmlFor={urlInputId} className="block text-xs text-[var(--text-secondary)]">
                Direct HTTPS image URL (up to 1,000 characters)
              </label>
              <div className="flex flex-col gap-2 sm:flex-row">
                <input
                  id={urlInputId}
                  type="url"
                  value={urlInput}
                  onChange={(e) => setUrlInput(e.target.value)}
                  placeholder="https://example.com/portrait.jpg"
                  maxLength={1000}
                  className="folio-input min-h-10 min-w-0 flex-1 px-3 py-1.5 text-sm sm:min-h-9"
                />
                <button
                  type="submit"
                  className="inline-flex min-h-10 shrink-0 items-center justify-center gap-1.5 rounded-md border border-[var(--border-strong)] bg-[var(--bg-surface)] px-3.5 py-1.5 text-xs font-medium text-[var(--text-primary)] hover:bg-[var(--bg-subtle)] sm:min-h-9"
                >
                  <Camera className="h-3.5 w-3.5 text-[var(--color-accent)]" aria-hidden="true" />
                  <span>Preview link</span>
                </button>
              </div>
            </form>
          )}
        </section>
      </div>

      {/* Footer */}
      <div className="flex flex-col-reverse gap-3 border-t border-[var(--border-subtle)] bg-[var(--bg-surface)] px-5 py-3.5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <p className="text-[0.72rem] leading-snug text-[var(--text-secondary)]">
          Seals and HTTPS links sync across devices and Reading Circle. Device uploads stay on this device.
        </p>
        <div className="flex shrink-0 items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="min-h-10 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-3.5 py-2 text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] disabled:opacity-60 sm:min-h-9 sm:py-1.5"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={submitting || !hasChanges}
            className="btn-primary inline-flex min-h-10 items-center justify-center rounded-md px-4 py-2 text-xs font-medium disabled:cursor-not-allowed disabled:opacity-50 sm:min-h-9 sm:py-1.5"
          >
            {submitting ? 'Saving…' : 'Save portrait'}
          </button>
        </div>
      </div>
    </ModalDialog>
  );
};

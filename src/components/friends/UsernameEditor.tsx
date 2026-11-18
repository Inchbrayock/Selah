import React, { useEffect, useId, useRef, useState } from 'react';
import { normalizeUsernameInput, validateUsername } from '../../lib/friends';
import { useBibleStore } from '../../store/useBibleStore';

interface UsernameEditorProps {
  onCancel?: () => void;
  onSaved?: (username: string) => void;
  className?: string;
}

export const UsernameEditor: React.FC<UsernameEditorProps> = ({
  onCancel,
  onSaved,
  className = '',
}) => {
  const {
    firebaseAvailable,
    user,
    ownFriendProfile,
    checkUsernameAvailability,
    updateUsername,
  } = useBibleStore();

  const inputId = useId();
  const handleCheckTokenRef = useRef(0);
  const [draft, setDraft] = useState(() => ownFriendProfile?.username ?? '');
  const [dirty, setDirty] = useState(false);
  const [checkState, setCheckState] = useState<{
    checking: boolean;
    available: boolean | null;
    message: string | null;
  }>({ checking: false, available: null, message: null });
  const [saving, setSaving] = useState(false);

  const normalizedDraft = normalizeUsernameInput(draft);
  const currentUsername = ownFriendProfile?.username ?? '';
  const unchanged = Boolean(currentUsername && normalizedDraft === currentUsername);

  useEffect(() => {
    if (!dirty) {
      setDraft(ownFriendProfile?.username ?? '');
    }
  }, [dirty, ownFriendProfile?.username]);

  useEffect(() => {
    if (!firebaseAvailable || !user || !dirty) return;
    const normalized = normalizeUsernameInput(draft);
    const current = ownFriendProfile?.username ?? '';
    const token = ++handleCheckTokenRef.current;

    if (!normalized) {
      setCheckState({ checking: false, available: null, message: null });
      return;
    }
    const validation = validateUsername(normalized);
    if (!validation.ok) {
      setCheckState({ checking: false, available: false, message: validation.error });
      return;
    }
    if (validation.username === current) {
      setCheckState({
        checking: false,
        available: true,
        message: 'Your current username',
      });
      return;
    }

    setCheckState({ checking: true, available: null, message: 'Checking availability…' });
    const timer = window.setTimeout(() => {
      void checkUsernameAvailability(validation.username)
        .then((res) => {
          if (handleCheckTokenRef.current !== token) return;
          if (res.available) {
            setCheckState({
              checking: false,
              available: true,
              message: `@${res.normalized} is available`,
            });
          } else {
            setCheckState({
              checking: false,
              available: false,
              message: res.error ?? `@${res.normalized} is already taken.`,
            });
          }
        })
        .catch(() => {
          if (handleCheckTokenRef.current !== token) return;
          setCheckState({ checking: false, available: null, message: null });
        });
    }, 250);

    return () => window.clearTimeout(timer);
  }, [checkUsernameAvailability, dirty, draft, firebaseAvailable, ownFriendProfile?.username, user]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;
    const validation = validateUsername(draft);
    if (!validation.ok) {
      setCheckState({ checking: false, available: false, message: validation.error });
      return;
    }
    setSaving(true);
    try {
      await updateUsername(validation.username);
      setDirty(false);
      setDraft(validation.username);
      setCheckState({ checking: false, available: null, message: null });
      onSaved?.(validation.username);
    } catch (err) {
      setCheckState({
        checking: false,
        available: false,
        message: err instanceof Error ? err.message : 'Could not save username.',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <form
      onSubmit={(e) => void handleSubmit(e)}
      className={`rounded-md border border-[var(--border-subtle)] bg-[var(--bg-canvas)] p-3.5 ${className}`}
    >
      <div className="space-y-2">
        <label htmlFor={inputId} className="block text-xs font-medium text-[var(--text-primary)]">
          Your @username
        </label>
        <p className="text-xs leading-relaxed text-[var(--text-secondary)]">
          3–24 letters, numbers, periods, or underscores. Share this so friends can find you easily.
        </p>
        <div className="relative flex items-center">
          <span
            aria-hidden="true"
            className="pointer-events-none absolute left-3 text-sm text-[var(--text-secondary)]"
          >
            @
          </span>
          <input
            id={inputId}
            type="text"
            value={draft}
            onChange={(e) => {
              setDirty(true);
              setDraft(normalizeUsernameInput(e.target.value));
            }}
            maxLength={24}
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            placeholder="hannah.miller"
            className="folio-input min-h-10 w-full py-1.5 pl-7 pr-3 text-base sm:text-sm"
          />
        </div>
        {checkState.message && (
          <p
            role="status"
            className={`text-xs font-medium ${
              checkState.available === true
                ? 'text-[var(--color-sage)]'
                : checkState.available === false
                  ? 'text-[var(--color-crimson)]'
                  : 'text-[var(--text-secondary)]'
            }`}
          >
            {checkState.message}
          </p>
        )}
        <div className="flex items-center justify-end gap-2 pt-1">
          {onCancel && (
            <button
              type="button"
              disabled={saving}
              onClick={onCancel}
              className="min-h-9 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-3 py-1.5 text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            >
              Cancel
            </button>
          )}
          <button
            type="submit"
            disabled={
              saving ||
              checkState.checking ||
              checkState.available === false ||
              !normalizedDraft ||
              unchanged
            }
            className="btn-primary min-h-9 rounded-md px-3.5 py-1.5 text-xs font-medium disabled:opacity-55"
          >
            {saving ? 'Saving…' : 'Save username'}
          </button>
        </div>
      </div>
    </form>
  );
};

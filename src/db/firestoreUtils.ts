import type { Timestamp } from 'firebase/firestore';
import type { AccountUser } from '../lib/auth';

export function timestampToIso(value: unknown): string {
  if (value && typeof value === 'object' && 'toDate' in value) {
    const fn = (value as Timestamp).toDate;
    if (typeof fn === 'function') {
      try {
        return fn.call(value).toISOString();
      } catch {
        // Fallback below
      }
    }
  }
  if (typeof value === 'string' && value) return value;
  return new Date().toISOString();
}

export function resolveAccountDisplayName(
  user: Pick<AccountUser, 'displayName' | 'email'>,
  fallback = 'Selah Reader'
): string {
  const trimmed = (user.displayName ?? '').trim().slice(0, 100);
  if (trimmed) return trimmed;
  if (user.email) {
    const localPart = user.email.split('@')[0]?.trim();
    if (localPart) return localPart.slice(0, 100);
  }
  return fallback;
}

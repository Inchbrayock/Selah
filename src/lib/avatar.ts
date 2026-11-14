import type { AccountUser } from './auth';

export type SanctuaryEmblemId =
  | 'lamp'
  | 'scroll'
  | 'olive'
  | 'dove'
  | 'vine'
  | 'star'
  | 'arch'
  | 'wheat';

export interface SanctuaryEmblemDefinition {
  id: SanctuaryEmblemId;
  label: string;
  scriptureHint: string;
  bg: string;
  ring: string;
  ink: string;
  accent: string;
}

export const SANCTUARY_EMBLEM_BASE_URL = 'https://inchbrayock.github.io/Selah/avatars';
const LOCAL_AVATAR_STORAGE_PREFIX = 'selah-local-photo:';
const MAX_LOCAL_DATA_URL_LENGTH = 280_000;
const MAX_AVATAR_FILE_BYTES = 15 * 1024 * 1024;
export const AVATAR_OUTPUT_SIZE = 192;

export const SANCTUARY_EMBLEMS: SanctuaryEmblemDefinition[] = [
  {
    id: 'lamp',
    label: 'Sanctuary Lamp',
    scriptureHint: 'Ps. 119:105',
    bg: '#F4EBD7',
    ring: '#D9C396',
    ink: '#8B5A18',
    accent: '#C98A2C',
  },
  {
    id: 'scroll',
    label: 'Open Scroll',
    scriptureHint: '2 Tim. 3:16',
    bg: '#EFECE3',
    ring: '#C9C4B4',
    ink: '#1D427D',
    accent: '#4F72A8',
  },
  {
    id: 'olive',
    label: 'Olive Branch',
    scriptureHint: 'Ps. 52:8',
    bg: '#DFECE7',
    ring: '#B0CFC2',
    ink: '#265C4B',
    accent: '#498A75',
  },
  {
    id: 'dove',
    label: 'Descending Dove',
    scriptureHint: 'Matt. 3:16',
    bg: '#E6ECF6',
    ring: '#BCCCE6',
    ink: '#1D427D',
    accent: '#547AB8',
  },
  {
    id: 'vine',
    label: 'True Vine',
    scriptureHint: 'John 15:5',
    bg: '#F2E7EE',
    ring: '#D6B9CB',
    ink: '#6E3254',
    accent: '#9E5880',
  },
  {
    id: 'star',
    label: 'Dawn Star',
    scriptureHint: '2 Pet. 1:19',
    bg: '#1D273B',
    ring: '#445578',
    ink: '#E5B763',
    accent: '#F5DBA4',
  },
  {
    id: 'arch',
    label: 'Stone Arch',
    scriptureHint: 'Ps. 84:1',
    bg: '#F5E8E4',
    ring: '#DABBB2',
    ink: '#8E3D2E',
    accent: '#C7715F',
  },
  {
    id: 'wheat',
    label: 'Harvest Sheaf',
    scriptureHint: 'Ps. 126:6',
    bg: '#F3ECDC',
    ring: '#D7C69C',
    ink: '#725720',
    accent: '#B08A38',
  },
];

const EMBLEMS_BY_ID = Object.fromEntries(
  SANCTUARY_EMBLEMS.map((emblem) => [emblem.id, emblem])
) as Record<SanctuaryEmblemId, SanctuaryEmblemDefinition>;

export function getSanctuaryEmblemUrl(id: SanctuaryEmblemId): string {
  return `${SANCTUARY_EMBLEM_BASE_URL}/${id}.svg`;
}

export function getSanctuaryEmblemById(id: SanctuaryEmblemId): SanctuaryEmblemDefinition {
  return EMBLEMS_BY_ID[id];
}

export function parseSanctuaryEmblemUrl(url: unknown): SanctuaryEmblemDefinition | null {
  if (typeof url !== 'string') return null;
  const trimmed = url.trim();
  if (!trimmed.startsWith(`${SANCTUARY_EMBLEM_BASE_URL}/`)) return null;
  const suffix = trimmed.slice(SANCTUARY_EMBLEM_BASE_URL.length + 1);
  const match = suffix.match(/^([a-z]+)\.svg$/);
  if (!match) return null;
  const id = match[1] as SanctuaryEmblemId;
  return EMBLEMS_BY_ID[id] ?? null;
}

export function isLocalAvatarDataUrl(url: unknown): url is string {
  if (typeof url !== 'string') return false;
  if (url.length > MAX_LOCAL_DATA_URL_LENGTH) return false;
  return /^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(url);
}

export function validateCustomHttpsPhotoUrl(
  raw: string
): { ok: true; url: string } | { ok: false; error: string } {
  const trimmed = raw.trim();
  if (!trimmed) {
    return { ok: false, error: 'Paste an image link starting with https://.' };
  }
  if (!trimmed.startsWith('https://')) {
    return { ok: false, error: 'Image links must start with https://.' };
  }
  if (trimmed.length > 1000) {
    return { ok: false, error: 'Image link must be 1,000 characters or fewer.' };
  }
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'https:' || !parsed.hostname.includes('.')) {
      return { ok: false, error: 'Enter a valid web image address.' };
    }
    return { ok: true, url: trimmed };
  } catch {
    return { ok: false, error: 'Enter a valid web image address.' };
  }
}

export function readLocalAvatarDataUrl(uid: string): string | null {
  if (typeof window === 'undefined' || !uid) return null;
  try {
    const stored = window.localStorage.getItem(`${LOCAL_AVATAR_STORAGE_PREFIX}${uid}`);
    return isLocalAvatarDataUrl(stored) ? stored : null;
  } catch {
    return null;
  }
}

export function writeLocalAvatarDataUrl(uid: string, dataUrl: string | null): void {
  if (typeof window === 'undefined' || !uid) return;
  const key = `${LOCAL_AVATAR_STORAGE_PREFIX}${uid}`;
  try {
    if (!dataUrl) {
      window.localStorage.removeItem(key);
      return;
    }
    if (!isLocalAvatarDataUrl(dataUrl)) {
      throw new Error('Processed photo could not be saved.');
    }
    window.localStorage.setItem(key, dataUrl);
  } catch (err) {
    if (err instanceof Error && err.message === 'Processed photo could not be saved.') {
      throw err;
    }
    throw new Error('Could not save this photo in browser storage. Try a smaller image.');
  }
}

export function resolveEffectiveAccountUser<T extends Pick<AccountUser, 'uid' | 'photoURL'>>(
  accountUser: T | null
): T | null {
  if (!accountUser) return null;
  const localPhoto = readLocalAvatarDataUrl(accountUser.uid);
  if (!localPhoto) return accountUser;
  return {
    ...accountUser,
    photoURL: localPhoto,
  };
}

export interface LoadedAvatarImage {
  src: string;
  image: HTMLImageElement;
  naturalWidth: number;
  naturalHeight: number;
}

export async function readAvatarImageFile(file: File): Promise<LoadedAvatarImage> {
  if (!file.type.startsWith('image/')) {
    throw new Error('Choose a PNG, JPEG, WebP, or GIF image file.');
  }
  if (file.size > MAX_AVATAR_FILE_BYTES) {
    throw new Error('Image file is larger than 15 MB. Please choose a smaller photo.');
  }

  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
      } else {
        reject(new Error('Could not read the selected image file.'));
      }
    };
    reader.onerror = () => reject(new Error('Could not read the selected image file.'));
    reader.readAsDataURL(file);
  });

  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () =>
      reject(new Error('That image could not be opened. Try a PNG or JPEG photo.'));
    img.src = dataUrl;
  });

  const naturalWidth = Math.max(1, image.naturalWidth || image.width || AVATAR_OUTPUT_SIZE);
  const naturalHeight = Math.max(1, image.naturalHeight || image.height || AVATAR_OUTPUT_SIZE);

  return { src: dataUrl, image, naturalWidth, naturalHeight };
}

export function cropImageToAvatarDataUrl(params: {
  image: CanvasImageSource;
  naturalWidth: number;
  naturalHeight: number;
  zoom: number;
  /** Pan offsets in [-1, 1] relative to maximum excess slack under current zoom. */
  offsetX: number;
  offsetY: number;
  outputSize?: number;
}): string {
  const outputSize = params.outputSize ?? AVATAR_OUTPUT_SIZE;
  const zoom = Math.max(1, Math.min(3, params.zoom));
  const natW = Math.max(1, params.naturalWidth);
  const natH = Math.max(1, params.naturalHeight);

  const coverScale = Math.max(outputSize / natW, outputSize / natH) * zoom;
  const drawW = natW * coverScale;
  const drawH = natH * coverScale;

  const maxShiftX = Math.max(0, (drawW - outputSize) / 2);
  const maxShiftY = Math.max(0, (drawH - outputSize) / 2);
  const clampedOffsetX = Math.max(-1, Math.min(1, params.offsetX));
  const clampedOffsetY = Math.max(-1, Math.min(1, params.offsetY));

  const drawX = (outputSize - drawW) / 2 + clampedOffsetX * maxShiftX;
  const drawY = (outputSize - drawH) / 2 + clampedOffsetY * maxShiftY;

  const canvas = document.createElement('canvas');
  canvas.width = outputSize;
  canvas.height = outputSize;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Photo cropping is not available in this browser.');
  }

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.fillStyle = '#F7F7F4';
  ctx.fillRect(0, 0, outputSize, outputSize);
  ctx.drawImage(params.image, drawX, drawY, drawW, drawH);

  let exported = canvas.toDataURL('image/jpeg', 0.86);
  if (exported.length > MAX_LOCAL_DATA_URL_LENGTH) {
    exported = canvas.toDataURL('image/jpeg', 0.72);
  }
  if (!isLocalAvatarDataUrl(exported)) {
    exported = canvas.toDataURL('image/png');
  }
  if (!isLocalAvatarDataUrl(exported)) {
    throw new Error('Could not compress this image cleanly. Try a smaller photo.');
  }
  return exported;
}

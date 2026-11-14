import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  cropImageToAvatarDataUrl,
  getSanctuaryEmblemUrl,
  isLocalAvatarDataUrl,
  parseSanctuaryEmblemUrl,
  readLocalAvatarDataUrl,
  resolveEffectiveAccountUser,
  SANCTUARY_EMBLEMS,
  validateCustomHttpsPhotoUrl,
  writeLocalAvatarDataUrl,
} from '../lib/avatar';

describe('avatar helpers', () => {
  afterEach(() => {
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

  it('round-trips curated Sanctuary emblem URLs and rejects unknown IDs', () => {
    for (const emblem of SANCTUARY_EMBLEMS) {
      const url = getSanctuaryEmblemUrl(emblem.id);
      expect(url.startsWith('https://')).toBe(true);
      expect(url.length).toBeLessThanOrEqual(1000);
      expect(parseSanctuaryEmblemUrl(url)?.id).toBe(emblem.id);
    }

    expect(parseSanctuaryEmblemUrl('https://inchbrayock.github.io/Selah/avatars/unknown.svg')).toBeNull();
    expect(parseSanctuaryEmblemUrl('https://example.com/lamp.svg')).toBeNull();
    expect(parseSanctuaryEmblemUrl(null)).toBeNull();
  });

  it('validates custom HTTPS photo URLs safely', () => {
    expect(validateCustomHttpsPhotoUrl('')).toEqual({
      ok: false,
      error: 'Paste an image link starting with https://.',
    });
    expect(validateCustomHttpsPhotoUrl('http://example.com/photo.jpg')).toEqual({
      ok: false,
      error: 'Image links must start with https://.',
    });
    expect(validateCustomHttpsPhotoUrl(`https://example.com/${'a'.repeat(995)}`)).toEqual({
      ok: false,
      error: 'Image link must be 1,000 characters or fewer.',
    });
    expect(validateCustomHttpsPhotoUrl('https://localhost/photo.jpg')).toEqual({
      ok: false,
      error: 'Enter a valid web image address.',
    });
    expect(validateCustomHttpsPhotoUrl('  https://cdn.example.com/reader.webp  ')).toEqual({
      ok: true,
      url: 'https://cdn.example.com/reader.webp',
    });
  });

  it('persists only safe raster local data URLs per UID and overrides cloud photo', () => {
    const validJpeg = 'data:image/jpeg;base64,/9j/4AAQSkZJRg==';
    expect(isLocalAvatarDataUrl(validJpeg)).toBe(true);
    expect(isLocalAvatarDataUrl('data:image/svg+xml;base64,PHN2Zz4=')).toBe(false);

    writeLocalAvatarDataUrl('uid-1', validJpeg);
    expect(readLocalAvatarDataUrl('uid-1')).toBe(validJpeg);
    expect(readLocalAvatarDataUrl('uid-2')).toBeNull();

    const effective = resolveEffectiveAccountUser({
      uid: 'uid-1',
      photoURL: 'https://example.com/cloud.jpg',
    });
    expect(effective?.photoURL).toBe(validJpeg);

    writeLocalAvatarDataUrl('uid-1', null);
    expect(readLocalAvatarDataUrl('uid-1')).toBeNull();
    expect(
      resolveEffectiveAccountUser({
        uid: 'uid-1',
        photoURL: 'https://example.com/cloud.jpg',
      })?.photoURL
    ).toBe('https://example.com/cloud.jpg');
  });

  it('renders centered cover crop via canvas at configured output size', () => {
    const drawImage = vi.fn();
    const fillRect = vi.fn();
    const fakeCtx = {
      imageSmoothingEnabled: false,
      imageSmoothingQuality: 'low',
      fillStyle: '',
      fillRect,
      drawImage,
    } as unknown as CanvasRenderingContext2D;

    const toDataUrl = vi.fn(() => 'data:image/jpeg;base64,ZmFrZQ==');
    vi.spyOn(document, 'createElement').mockImplementation(((tag: string) => {
      if (tag === 'canvas') {
        return {
          width: 0,
          height: 0,
          getContext: () => fakeCtx,
          toDataURL: toDataUrl,
        } as unknown as HTMLCanvasElement;
      }
      return document.createElementNS('http://www.w3.org/1999/xhtml', tag);
    }) as typeof document.createElement);

    const img = {} as CanvasImageSource;
    const out = cropImageToAvatarDataUrl({
      image: img,
      naturalWidth: 400,
      naturalHeight: 200,
      zoom: 1,
      offsetX: 0,
      offsetY: 0,
      outputSize: 192,
    });

    expect(out).toBe('data:image/jpeg;base64,ZmFrZQ==');
    expect(fillRect).toHaveBeenCalledWith(0, 0, 192, 192);
    expect(drawImage).toHaveBeenCalledWith(img, -96, 0, 384, 192);
  });
});

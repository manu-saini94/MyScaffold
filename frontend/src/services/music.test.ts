import { describe, expect, it } from 'vitest'
import { BUNDLED_SONGS, isMusicUrl, rampVolume, safeMusicUrl } from './music'

describe('isMusicUrl', () => {
  it('accepts https links and bundled song paths', () => {
    for (const ok of [
      'https://example.com/theme.mp3',
      'https://music.test:8443/a/b.mp3?x=a@b#t',
      'https://[2001:db8::1]/a.mp3',
      '/assets/music/kadhalar-dhinam-theme.mp3',
      '/assets/music/a.m4a',
      '/assets/music/0-song.ogg',
      '/assets/music/x.opus',
    ]) {
      expect(isMusicUrl(ok), ok).toBe(true)
    }
  })

  it('rejects everything else, the same way the server does', () => {
    for (const bad of [
      'http://example.com/a.mp3',
      'javascript:alert(1)',
      'https://u:p@example.com/a.mp3',
      'https://host.test/a b',
      'https://host.test/a<b',
      'https://host.test/a\u0007b',
      'https://host.test/a\u0085b',
      'https://',
      '/assets/music/../x.mp3',
      '//evil/x.mp3',
      '/assets/music/a.mp3?x',
      '/assets/music/a.mp3#t',
      '/assets/music/A.mp3',
      '/assets/music/-a.mp3',
      '/assets/music/a.wav',
      '/assets/music/sub/a.mp3',
      '/assets/music//a.mp3',
      'assets/music/a.mp3',
      `/assets/music/${'a'.repeat(487)}.mp3`,
      '',
    ]) {
      expect(isMusicUrl(bad), bad).toBe(false)
    }
  })

  it('lists only bundled songs that pass the rule', () => {
    expect(BUNDLED_SONGS.length).toBeGreaterThan(0)
    for (const song of BUNDLED_SONGS) expect(isMusicUrl(song.path), song.path).toBe(true)
  })
})

describe('safeMusicUrl', () => {
  it('returns a playable URL or null', () => {
    expect(safeMusicUrl('https://example.com/theme.mp3')).toBe('https://example.com/theme.mp3')
    expect(safeMusicUrl('/assets/music/kadhalar-dhinam-theme.mp3')).toBe('/assets/music/kadhalar-dhinam-theme.mp3')
    expect(safeMusicUrl('http://example.com/theme.mp3')).toBeNull()
    expect(safeMusicUrl('javascript:alert(1)')).toBeNull()
    expect(safeMusicUrl('https://u:p@example.com/a.mp3')).toBeNull()
    expect(safeMusicUrl('/assets/music/../x.mp3')).toBeNull()
    expect(safeMusicUrl('//evil/x.mp3')).toBeNull()
    expect(safeMusicUrl('not a url')).toBeNull()
    expect(safeMusicUrl(null)).toBeNull()
    expect(safeMusicUrl(undefined)).toBeNull()
  })
})

describe('rampVolume', () => {
  it('ramps linearly and clamps', () => {
    expect(rampVolume(0, 0.7, 0, 1000)).toBe(0)
    expect(rampVolume(0, 0.8, 500, 1000)).toBeCloseTo(0.4)
    expect(rampVolume(0.7, 0, 5000, 1000)).toBe(0)
    expect(rampVolume(0, 1, 10, 0)).toBe(1)
  })
})

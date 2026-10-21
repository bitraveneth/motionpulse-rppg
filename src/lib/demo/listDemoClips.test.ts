import { describe, expect, it } from 'vitest'
import {
  clipRefsFromNames,
  normalizeDemoClipNames,
} from './listDemoClips'

describe('normalizeDemoClipNames', () => {
  it('keeps video extensions, sorts, and caps at 10', () => {
    const names = [
      'z.mp4',
      'a.webm',
      'readme.txt',
      'b.MOV',
      '.hidden.mp4',
      'c.m4v',
      'd.mp4',
      'e.mp4',
      'f.mp4',
      'g.mp4',
      'h.mp4',
      'i.mp4',
      'j.mp4',
      'k.mp4',
    ]
    const out = normalizeDemoClipNames(names)
    expect(out).toEqual([
      'a.webm',
      'b.MOV',
      'c.m4v',
      'd.mp4',
      'e.mp4',
      'f.mp4',
      'g.mp4',
      'h.mp4',
      'i.mp4',
      'j.mp4',
    ])
    expect(out).not.toContain('readme.txt')
    expect(out).not.toContain('.hidden.mp4')
    expect(out).not.toContain('k.mp4')
  })

  it('dedupes names', () => {
    expect(normalizeDemoClipNames(['a.mp4', 'a.mp4', 'b.webm'])).toEqual([
      'a.mp4',
      'b.webm',
    ])
  })
})

describe('clipRefsFromNames', () => {
  it('builds public URLs', () => {
    expect(clipRefsFromNames(['face one.mp4'])).toEqual([
      { name: 'face one.mp4', url: '/demo-clips/face%20one.mp4' },
    ])
  })
})

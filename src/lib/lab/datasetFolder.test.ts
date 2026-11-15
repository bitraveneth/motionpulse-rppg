import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  datasetActivity,
  fpsFromPureJson,
  inspectDatasetFolder,
  referenceBpmFromGroundTruth,
  referenceBpmFromPureJson,
  sampleFramePaths,
} from './datasetFolder'

describe('dataset folder', () => {
  it('counts videos and leaves a zip closed', () => {
    const root = mkdtempSync(join(tmpdir(), 'mp-folder-'))
    mkdirSync(join(root, 'subject1'))
    writeFileSync(join(root, 'subject1', 'vid.avi'), '')
    writeFileSync(join(root, 'subject1', 'ground_truth.txt'), '1\n80\n0\n')
    writeFileSync(join(root, 'pack.zip'), '')
    const report = inspectDatasetFolder(root)
    expect(report.ok).toBe(true)
    expect(report.videoCount).toBe(1)
    expect(report.zipCount).toBe(1)
    expect(report.groundTruthFiles).toBe(1)
    const lines = datasetActivity(report)
    expect(lines.some((line) => line.startsWith('videos  1'))).toBe(true)
    expect(lines.some((line) => line.includes('left closed'))).toBe(true)
    expect(lines.some((line) => line.includes('mean 80.0 BPM'))).toBe(true)
    expect(lines.at(-1)).toMatch(/ready  1/)
    expect(report.clips?.[0]?.kind).toBe('video')
    expect(report.clips?.[0]?.referenceBpm).toBe(80)
  })

  it('reads a PURE image folder and the JSON pulse rate', () => {
    const root = mkdtempSync(join(tmpdir(), 'mp-pure-'))
    const session = join(root, '01-01')
    mkdirSync(session)
    for (let i = 1; i <= 16; i += 1) writeFileSync(join(session, `Image${String(i).padStart(5, '0')}.png`), '')
    const label = {
      '/Image': { Timestamp: [0, 33_333_333, 66_666_666] },
      '/FullPackage': [{ Value: { pulseRate: 80, waveform: 0.1 } }, { Value: { pulseRate: 100, waveform: 0.2 } }],
    }
    writeFileSync(join(session, '01-01.json'), JSON.stringify(label))
    expect(referenceBpmFromPureJson(label)).toBe(90)
    expect(referenceBpmFromPureJson({ '/FullPackage': [{ Value: { waveform: 0.2 } }] })).toBeNull()
    expect(fpsFromPureJson(label)).toBe(30)
    const report = inspectDatasetFolder(root)
    expect(report.videoCount).toBe(0)
    expect(report.frameCount).toBe(1)
    expect(report.jsonFiles).toBe(1)
    expect(report.clips?.[0]).toMatchObject({
      kind: 'frames',
      folder: '01-01',
      referenceBpm: 90,
      sourceFps: 30,
      frameCount: 16,
    })
    const lines = datasetActivity(report)
    expect(lines.some((line) => line.startsWith('frames  1'))).toBe(true)
    expect(lines.some((line) => line.includes('no videos or frame folders'))).toBe(false)
  })

  it('reads a JSON label beside the image folder and keeps a long folder near 15 fps', () => {
    const root = mkdtempSync(join(tmpdir(), 'mp-pure-parent-'))
    const images = join(root, '01-02', '01-02')
    mkdirSync(images, { recursive: true })
    for (let i = 1; i <= 16; i += 1) writeFileSync(join(images, `Image${String(i).padStart(5, '0')}.png`), '')
    writeFileSync(
      join(root, '01-02', '01-02.json'),
      JSON.stringify({ '/FullPackage': [{ Value: { pulseRate: 72 } }] }),
    )
    const report = inspectDatasetFolder(root)
    expect(report.clips?.[0]).toMatchObject({
      kind: 'frames',
      folder: '01-02/01-02',
      referenceBpm: 72,
    })
    const names = Array.from({ length: 40 }, (_, index) => `Image${index}.png`)
    expect(sampleFramePaths(names, 30)).toMatchObject({ fps: 15 })
    expect(sampleFramePaths(names, 30).files).toHaveLength(20)
  })

  it('reads row 2 only when it is a heart rate', () => {
    expect(referenceBpmFromGroundTruth('1 2 3\n90 100\n0 1\n')).toBe(95)
    expect(referenceBpmFromGroundTruth('1 2 3\n10 12\n0 1\n')).toBeNull()
    expect(referenceBpmFromGroundTruth('80\n')).toBeNull()
  })

  it('names every subject folder and the gaps', () => {
    const lines = datasetActivity({
      ok: true,
      resolved: '/data/UBFC',
      videoCount: 12,
      zipCount: 0,
      groundTruthFiles: 12,
      subjectFolders: [
        'subject1',
        'subject3',
        'subject11×',
        'subject4',
        'subject5',
        'subject8',
        'subject9',
        'subject10',
        'subject12',
        'subject13',
        'subject14',
        'subject15',
      ],
      sampleVideos: ['subject15/vid.avi'],
    })
    const text = lines.join('\n')
    expect(text).toContain('subject11×')
    expect(text).toContain('No folder for subject2')
    expect(text).not.toContain('vid.avi')
  })

  it('refuses the whole disk', () => {
    const report = inspectDatasetFolder('/')
    expect(report.ok).toBe(false)
    expect(report.reason).toBe('too_broad')
  })
})

import { describe, expect, it } from 'vitest'
import { FACE_MESH_EDGES, FACE_MESH_NODES, FACE_OVAL } from './faceMesh'

describe('face mesh', () => {
  it('keeps a closed oval and a sparse node set', () => {
    expect(FACE_OVAL.length).toBeGreaterThan(20)
    expect(FACE_MESH_NODES.length).toBeGreaterThan(30)
    expect(FACE_MESH_NODES.length).toBeLessThan(120)
    expect(FACE_MESH_EDGES.length).toBeGreaterThan(40)
  })

  it('only wires known node indices', () => {
    const nodes = new Set(FACE_MESH_NODES)
    for (const [a, b] of FACE_MESH_EDGES) {
      expect(nodes.has(a)).toBe(true)
      expect(nodes.has(b)).toBe(true)
    }
  })
})

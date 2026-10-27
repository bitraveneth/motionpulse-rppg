/**
 * Sparse MediaPipe Face Mesh wires for the scan overlay.
 * Enough points to read as a face mask, not the full 468-point cloud.
 */

/** Closed face outline (MediaPipe face oval). */
export const FACE_OVAL = [
  10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379, 378,
  400, 377, 152, 148, 176, 149, 150, 136, 172, 58, 132, 93, 234, 127, 162, 21,
  54, 103, 67, 109,
] as const

const LEFT_BROW = [70, 63, 105, 66, 107] as const
const RIGHT_BROW = [336, 296, 334, 293, 300] as const
const LEFT_EYE = [33, 160, 158, 133, 153, 144] as const
const RIGHT_EYE = [362, 385, 387, 263, 373, 380] as const
const NOSE = [168, 6, 197, 195, 5, 4, 1, 19, 94, 2] as const
const LIPS_OUTER = [
  61, 185, 40, 39, 37, 0, 267, 269, 270, 409, 291, 375, 321, 405, 314, 17, 84,
  181, 91, 146,
] as const

/** Cross-face ties that give the “tech mesh” look without clutter. */
const CROSS_EDGES: ReadonlyArray<readonly [number, number]> = [
  [10, 151],
  [151, 9],
  [9, 8],
  [8, 168],
  [33, 133],
  [362, 263],
  [33, 168],
  [263, 168],
  [133, 168],
  [362, 168],
  [1, 61],
  [1, 291],
  [152, 0],
  [234, 93],
  [454, 323],
  [127, 162],
  [356, 389],
]

function ringEdges(indices: readonly number[]): Array<[number, number]> {
  const edges: Array<[number, number]> = []
  for (let i = 0; i < indices.length; i++) {
    edges.push([indices[i]!, indices[(i + 1) % indices.length]!])
  }
  return edges
}

function chainEdges(indices: readonly number[]): Array<[number, number]> {
  const edges: Array<[number, number]> = []
  for (let i = 0; i < indices.length - 1; i++) {
    edges.push([indices[i]!, indices[i + 1]!])
  }
  return edges
}

export const FACE_MESH_EDGES: ReadonlyArray<readonly [number, number]> = [
  ...ringEdges(FACE_OVAL),
  ...chainEdges(LEFT_BROW),
  ...chainEdges(RIGHT_BROW),
  ...ringEdges(LEFT_EYE),
  ...ringEdges(RIGHT_EYE),
  ...chainEdges(NOSE),
  ...ringEdges(LIPS_OUTER),
  ...CROSS_EDGES,
]

const NODE_SET = new Set<number>()
for (const [a, b] of FACE_MESH_EDGES) {
  NODE_SET.add(a)
  NODE_SET.add(b)
}
export const FACE_MESH_NODES: readonly number[] = [...NODE_SET].sort(
  (a, b) => a - b,
)

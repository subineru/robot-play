/**
 * PLAY_ROBOTS 16m x 16m 2D Spatial Hash Grid & Swept Anti-Tunneling Collision Primitives.
 * Clean Architecture Pure Domain Layer (Zero DOM / Zero THREE dependencies).
 * SSOT: [SPEC-COMBAT] Section 4 ([Section 9.2]).
 */

export const DEFAULT_CELL_SIZE_M = 16;

function cellKey(cx, cz) {
  return (cx + 16384) * 32768 + (cz + 16384);
}

/**
 * Create a 2D spatial hash grid partitioning XZ world space into uniform cells.
 */
export function createSpatialGrid(cellSizeM = DEFAULT_CELL_SIZE_M) {
  const safeCellSize = Math.max(1, Number(cellSizeM) || DEFAULT_CELL_SIZE_M);
  return {
    cellSizeM: safeCellSize,
    invCellSize: 1 / safeCellSize,
    cells: new Map(),
    itemCellsById: new Map(),
    itemsById: new Map(),
  };
}

/**
 * Remove all items and buckets from a spatial grid.
 */
export function clearSpatialGrid(grid) {
  if (!grid) return;
  grid.cells.clear();
  grid.itemCellsById.clear();
  grid.itemsById.clear();
}

/**
 * Remove a registered spatial item by its unique id in O(k) cells occupied.
 */
export function removeSpatialItem(grid, id) {
  if (!grid || !id) return;
  const keys = grid.itemCellsById.get(id);
  const item = grid.itemsById.get(id);
  if (keys && item) {
    for (let i = 0; i < keys.length; i++) {
      const bucket = grid.cells.get(keys[i]);
      if (bucket) {
        bucket.delete(item);
        if (bucket.size === 0) grid.cells.delete(keys[i]);
      }
    }
  }
  grid.itemCellsById.delete(id);
  grid.itemsById.delete(id);
}

/**
 * Insert or replace an AABB obstacle entry into all overlapping XZ grid cells.
 */
export function insertAabbItem(grid, item) {
  if (!grid || !item || !item.id) return;
  removeSpatialItem(grid, item.id);
  const inv = grid.invCellSize;
  const minCx = Math.floor(Math.min(item.minX, item.maxX) * inv);
  const maxCx = Math.floor(Math.max(item.minX, item.maxX) * inv);
  const minCz = Math.floor(Math.min(item.minZ, item.maxZ) * inv);
  const maxCz = Math.floor(Math.max(item.minZ, item.maxZ) * inv);

  const keys = [];
  for (let cx = minCx; cx <= maxCx; cx++) {
    for (let cz = minCz; cz <= maxCz; cz++) {
      const k = cellKey(cx, cz);
      let bucket = grid.cells.get(k);
      if (!bucket) {
        bucket = new Set();
        grid.cells.set(k, bucket);
      }
      bucket.add(item);
      keys.push(k);
    }
  }
  grid.itemCellsById.set(item.id, keys);
  grid.itemsById.set(item.id, item);
}

/**
 * Query unique candidate items overlapping a swept 3D line segment expanded by paddingM.
 * Uses supercover XZ grid traversal to visit only cells near the segment.
 */
export function querySegmentCandidates(grid, prevPos, curPos, paddingM = 0) {
  if (!grid || !prevPos || !curPos) return [];
  const inv = grid.invCellSize;
  const pad = Math.max(0, Number(paddingM) || 0);

  const x0 = prevPos.x;
  const z0 = prevPos.z;
  const x1 = curPos.x;
  const z1 = curPos.z;

  const dx = x1 - x0;
  const dz = z1 - z0;
  const distSq = dx * dx + dz * dz;

  const out = [];
  const seen = new Set();
  const collectCellRange = (minCx, maxCx, minCz, maxCz) => {
    for (let cx = minCx; cx <= maxCx; cx++) {
      for (let cz = minCz; cz <= maxCz; cz++) {
        const bucket = grid.cells.get(cellKey(cx, cz));
        if (!bucket) continue;
        for (const item of bucket) {
          if (!seen.has(item.id)) {
            seen.add(item.id);
            out.push(item);
          }
        }
      }
    }
  };

  // Sample along segment at half-cell intervals so long shots skip distant off-diagonal cells
  const segLen = Math.sqrt(distSq);
  const stepSize = Math.max(1, grid.cellSizeM * 0.45);
  const steps = Math.max(1, Math.ceil(segLen / stepSize));
  for (let s = 0; s <= steps; s++) {
    const t = s / steps;
    const sx = x0 + dx * t;
    const sz = z0 + dz * t;
    const minCx = Math.floor((sx - pad) * inv);
    const maxCx = Math.floor((sx + pad) * inv);
    const minCz = Math.floor((sz - pad) * inv);
    const maxCz = Math.floor((sz + pad) * inv);
    collectCellRange(minCx, maxCx, minCz, maxCz);
  }
  return out;
}

/**
 * Continuous 3D segment vs AABB slab intersection (supports radius inflation).
 */
export function intersectSegmentAabb(prevPos, curPos, box, expandRadius = 0) {
  const miss = { hit: false, t: null, point: null, normal: { x: 0, y: 0, z: 0 } };
  if (!prevPos || !curPos || !box) return miss;
  const r = Math.max(0, Number(expandRadius) || 0);
  const minX = box.minX - r;
  const maxX = box.maxX + r;
  const minY = box.minY - r;
  const maxY = box.maxY + r;
  const minZ = box.minZ - r;
  const maxZ = box.maxZ + r;

  const dx = curPos.x - prevPos.x;
  const dy = curPos.y - prevPos.y;
  const dz = curPos.z - prevPos.z;

  let tMin = 0;
  let tMax = 1;
  let nx = 0;
  let ny = 0;
  let nz = 0;

  const testAxis = (origin, delta, lo, hi, axX, axY, axZ) => {
    if (Math.abs(delta) < 1e-9) {
      return origin >= lo && origin <= hi;
    }
    const invD = 1 / delta;
    let t1 = (lo - origin) * invD;
    let t2 = (hi - origin) * invD;
    let sign = -1;
    if (t1 > t2) {
      const tmp = t1;
      t1 = t2;
      t2 = tmp;
      sign = 1;
    }
    if (t1 > tMin) {
      tMin = t1;
      nx = axX * sign;
      ny = axY * sign;
      nz = axZ * sign;
    }
    if (t2 < tMax) {
      tMax = t2;
    }
    return tMin <= tMax;
  };

  if (!testAxis(prevPos.x, dx, minX, maxX, 1, 0, 0)) return miss;
  if (!testAxis(prevPos.y, dy, minY, maxY, 0, 1, 0)) return miss;
  if (!testAxis(prevPos.z, dz, minZ, maxZ, 0, 0, 1)) return miss;

  return {
    hit: true,
    t: tMin,
    point: {
      x: prevPos.x + dx * tMin,
      y: prevPos.y + dy * tMin,
      z: prevPos.z + dz * tMin,
    },
    normal: { x: nx, y: ny, z: nz },
  };
}

/**
 * Continuous 3D segment vs upright vertical mecha capsule intersection.
 * Capsule base rests at basePos.y with total vertical span [basePos.y, basePos.y + height].
 */
export function intersectSegmentCapsuleY(prevPos, curPos, basePos, radius = 0.65, height = 2.68) {
  const miss = { hit: false, t: null, point: null };
  if (!prevPos || !curPos || !basePos) return miss;

  const safeR = Math.max(0.05, Number(radius) || 0.65);
  const safeH = Math.max(safeR * 2, Number(height) || 2.68);
  const capBottomY = basePos.y + safeR;
  const capTopY = basePos.y + safeH - safeR;

  const vx = curPos.x - prevPos.x;
  const vy = curPos.y - prevPos.y;
  const vz = curPos.z - prevPos.z;
  const fx = prevPos.x - basePos.x;
  const fz = prevPos.z - basePos.z;

  const aXZ = vx * vx + vz * vz;
  const rSq = safeR * safeR;
  let bestT = Infinity;

  // Test infinite XZ cylinder in [capBottomY, capTopY]
  if (aXZ > 1e-10) {
    const b = 2 * (fx * vx + fz * vz);
    const c = fx * fx + fz * fz - rSq;
    const disc = b * b - 4 * aXZ * c;
    if (disc >= 0) {
      const sq = Math.sqrt(disc);
      const tCandidates = [(-b - sq) / (2 * aXZ), (-b + sq) / (2 * aXZ)];
      for (const tc of tCandidates) {
        if (tc >= 0 && tc <= 1 && tc < bestT) {
          const hy = prevPos.y + vy * tc;
          if (hy >= capBottomY && hy <= capTopY) {
            bestT = tc;
          }
        }
      }
    }
  } else if (fx * fx + fz * fz <= rSq) {
    const y0 = prevPos.y;
    const y1 = curPos.y;
    if (Math.max(y0, y1) >= capBottomY && Math.min(y0, y1) <= capTopY) {
      bestT = 0;
    }
  }

  // Also test bottom and top spherical caps
  const testSphere = (cy) => {
    const fy = prevPos.y - cy;
    const a = vx * vx + vy * vy + vz * vz;
    if (a < 1e-10) {
      if (fx * fx + fy * fy + fz * fz <= rSq && 0 < bestT) bestT = 0;
      return;
    }
    const b = 2 * (fx * vx + fy * vy + fz * vz);
    const c = fx * fx + fy * fy + fz * fz - rSq;
    const disc = b * b - 4 * a * c;
    if (disc < 0) return;
    const sq = Math.sqrt(disc);
    const t0 = (-b - sq) / (2 * a);
    const t1 = (-b + sq) / (2 * a);
    if (t1 >= 0 && t0 <= 1) {
      const hitT = Math.max(0, t0);
      if (hitT < bestT) bestT = hitT;
    }
  };
  testSphere(capBottomY);
  testSphere(capTopY);

  if (bestT <= 1) {
    return {
      hit: true,
      t: bestT,
      point: {
        x: prevPos.x + vx * bestT,
        y: prevPos.y + vy * bestT,
        z: prevPos.z + vz * bestT,
      },
    };
  }
  return miss;
}

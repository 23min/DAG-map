// track-assignment.js — MLCM track assignment for metro-map layout.
//
// Given routes and station positions, assign each route a track number
// at each station. The goal: minimize line crossings at and between
// stations while keeping routes coherent.
//
// Rules implemented:
//   R1: Trunk (route 0) always on track 0
//   R2: Branches sharing more stations with trunk get closer tracks
//   R3: At a fork, diverging lines should not cross
//   R4: Monotonic tracks — a line's track changes as little as possible
//   R5: Symmetric branching — branches spread evenly above/below trunk

/**
 * Compute track assignments for all routes at all stations.
 *
 * @param {Array} routes - route objects with .nodes arrays
 * @param {Map} nodeRoutes - nodeId → Set<routeIdx>
 * @param {Map} positions - nodeId → {x, y} (for station ordering by X)
 * @returns {Map<string, Map<number, number>>} stationId → (routeIdx → trackOffset)
 */
export function assignTracks(routes, nodeRoutes, positions) {
  if (routes.length <= 1) return new Map();

  // Build station list ordered by X (left to right)
  const stations = [];
  const stationRoutes = new Map(); // stationId → sorted route indices
  for (const [nodeId, routeSet] of nodeRoutes) {
    if (routeSet.size > 1) {
      stations.push(nodeId);
      stationRoutes.set(nodeId, [...routeSet].sort((a, b) => a - b));
    }
  }
  stations.sort((a, b) => (positions.get(a)?.x ?? 0) - (positions.get(b)?.x ?? 0));

  if (stations.length === 0) return new Map();

  // R2: Compute trunk overlap for each route (how many stations shared with trunk)
  const trunkNodes = new Set(routes[0]?.nodes || []);
  const trunkOverlap = routes.map((route, ri) => {
    if (ri === 0) return Infinity; // trunk always closest
    return route.nodes.filter(id => trunkNodes.has(id)).length;
  });

  // R5: Classify branches as "above" or "below" trunk
  // Use route index parity for initial assignment, then refine
  const branchSide = new Map(); // routeIdx → +1 (below) or -1 (above)
  const nonTrunk = routes.map((_, i) => i).filter(i => i !== 0);
  // Sort by trunk overlap (most overlap = closest to trunk)
  nonTrunk.sort((a, b) => trunkOverlap[b] - trunkOverlap[a]);
  // Alternate above/below for symmetric branching
  for (let i = 0; i < nonTrunk.length; i++) {
    branchSide.set(nonTrunk[i], i % 2 === 0 ? 1 : -1);
  }

  // Assign tracks at each station, left to right
  const trackMap = new Map(); // stationId → Map(routeIdx → track)
  let prevOrder = null; // previous station's route order (for R4)

  for (const stationId of stations) {
    const routesHere = stationRoutes.get(stationId);
    const assignment = new Map();

    // R1: Trunk at track 0
    if (routesHere.includes(0)) {
      assignment.set(0, 0);
    }

    // Separate routes into above-trunk and below-trunk groups
    const above = []; // routes with negative tracks (above trunk visually)
    const below = []; // routes with positive tracks (below trunk visually)
    for (const ri of routesHere) {
      if (ri === 0) continue;
      if (branchSide.get(ri) === -1) {
        above.push(ri);
      } else {
        below.push(ri);
      }
    }

    // R2: Sort each group by trunk overlap (most overlap = closest to trunk)
    above.sort((a, b) => trunkOverlap[b] - trunkOverlap[a]);
    below.sort((a, b) => trunkOverlap[b] - trunkOverlap[a]);

    // R4: If we have a previous station, try to preserve the order
    // by checking if swapping reduces crossings
    if (prevOrder) {
      const prevAbove = above.filter(ri => prevOrder.has(ri));
      const prevBelow = below.filter(ri => prevOrder.has(ri));

      // Sort continuing routes by their previous track to minimize crossings
      const byPrevTrack = (a, b) => (prevOrder.get(a) ?? 0) - (prevOrder.get(b) ?? 0);
      prevAbove.sort(byPrevTrack);
      prevBelow.sort(byPrevTrack);

      // New routes (not at previous station) go at the edges
      const newAbove = above.filter(ri => !prevOrder.has(ri));
      const newBelow = below.filter(ri => !prevOrder.has(ri));

      above.length = 0;
      above.push(...prevAbove, ...newAbove);
      below.length = 0;
      below.push(...prevBelow, ...newBelow);
    }

    // Assign track numbers
    for (let i = 0; i < above.length; i++) {
      assignment.set(above[i], -(i + 1)); // -1, -2, -3 (above trunk)
    }
    for (let i = 0; i < below.length; i++) {
      assignment.set(below[i], i + 1); // +1, +2, +3 (below trunk)
    }

    trackMap.set(stationId, assignment);
    prevOrder = assignment;
  }

  // R3: Post-process — check for crossings at forks and swap to fix
  for (let si = 0; si < stations.length - 1; si++) {
    const sA = stations[si];
    const sB = stations[si + 1];
    const tA = trackMap.get(sA);
    const tB = trackMap.get(sB);
    if (!tA || !tB) continue;

    // Find routes present at both stations
    const common = [...tA.keys()].filter(ri => tB.has(ri));
    if (common.length < 2) continue;

    // Count crossings: route pair (i,j) crosses if track order reverses
    let crossings = 0;
    for (let i = 0; i < common.length; i++) {
      for (let j = i + 1; j < common.length; j++) {
        const ri = common[i], rj = common[j];
        if ((tA.get(ri) - tA.get(rj)) * (tB.get(ri) - tB.get(rj)) < 0) {
          crossings++;
        }
      }
    }

    // If crossings exist, try swapping pairs at station B to reduce them
    if (crossings > 0) {
      let improved = true;
      while (improved) {
        improved = false;
        for (let i = 0; i < common.length; i++) {
          for (let j = i + 1; j < common.length; j++) {
            const ri = common[i], rj = common[j];
            const ti = tB.get(ri), tj = tB.get(rj);

            // Try swap
            tB.set(ri, tj);
            tB.set(rj, ti);

            // Count crossings after swap
            let newCrossings = 0;
            for (let a = 0; a < common.length; a++) {
              for (let b = a + 1; b < common.length; b++) {
                const ra = common[a], rb = common[b];
                if ((tA.get(ra) - tA.get(rb)) * (tB.get(ra) - tB.get(rb)) < 0) {
                  newCrossings++;
                }
              }
            }

            if (newCrossings < crossings) {
              crossings = newCrossings;
              improved = true;
            } else {
              // Undo swap
              tB.set(ri, ti);
              tB.set(rj, tj);
            }
          }
        }
      }
    }
  }

  return trackMap;
}

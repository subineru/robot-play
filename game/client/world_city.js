/**
 * Neo-Tokyo Destructible City & Spatial-Grid Collision Manager (Layer 1 Client).
 * Owns road/skyline/destructible building geometry, traffic simulation, target dummy,
 * and 16m x 16m SpatialHashGrid registration/removal for swept anti-tunneling queries.
 */
import * as THREE from 'three';
import { ARENA_RADIUS } from '../shared/constants.js?v=20261116_t75e';
import { clamp, computeBuildingDurability, damageDestructibleProp, evaluateSubPartSegmentHit } from '../shared/kinematics.js?v=20261116_t75e';
import { createPartDamageState, applyPartDamage, computePartStatusPenalties } from '../shared/sim_core.js?v=20261116_t75e';
import {
  clearSpatialGrid,
  insertAabbItem,
  removeSpatialItem,
  querySegmentCandidates,
  intersectSegmentAabb,
  intersectSegmentCapsuleY,
} from '../shared/spatial_grid.js?v=20261116_t75e';

export function createWorldCityManager({ scene, spatialGrid, vfx, audio }) {
  const manager = {
    arenaGroup: null,
    built: false,
    destructibles: [],
    instancedDestructibles: [],
    cars: [],
    carInst: { bodyMesh: null, trimMesh: null, lightMesh: null },
    duelMode: false,
    dummy: null,
    dummyFireTimer: 2.6,
    dummyBurstRemaining: 2,
    cityTextureCache: {},
    cityMaterials: { floorMat: null, skyDome: null },

    _tmpCarObj: new THREE.Object3D(),
    _tmpZeroObj: new THREE.Object3D(),
    _tmpVecA: new THREE.Vector3(),
    _tmpOrigin: new THREE.Vector3(),
    _tmpTargetPt: new THREE.Vector3(),
    _tmpShotDir: new THREE.Vector3(),
    _tmpColor: new THREE.Color(),

    ensureBuilt() {
      if (this.built) return;
      this.built = true;
      this._buildNeoTokyoCity();
      this._buildTargetDummy();
      this._syncSpatialGridAll();
    },

    setVisible(visible) {
      if (this.arenaGroup) this.arenaGroup.visible = Boolean(visible);
    },

    setLightingVisuals(isDay, inMenu) {
      if (this.cityMaterials.floorMat) {
        this.cityMaterials.floorMat.color.set(isDay ? '#6d737b' : '#161d27');
      }
      if (this.cityMaterials.skyDome) {
        this.cityMaterials.skyDome.visible = Boolean(isDay && !inMenu);
      }
    },

    setDuelMode(isDuel) {
      this.duelMode = Boolean(isDuel);
      if (this.dummy) {
        this.dummy.group.visible = !this.duelMode && this.dummy.respawnTimer <= 0;
        if (this.duelMode) {
          removeSpatialItem(spatialGrid, 'target_dummy');
        } else if (spatialGrid) {
          insertAabbItem(spatialGrid, {
            id: 'target_dummy',
            kind: 'dummy',
            minX: this.dummy.x - this.dummy.radius,
            maxX: this.dummy.x + this.dummy.radius,
            minY: 0,
            maxY: 2.6,
            minZ: this.dummy.z - this.dummy.radius,
            maxZ: this.dummy.z + this.dummy.radius,
            payload: this.dummy,
          });
        }
      }
    },

    resetWorld() {
      this.dummyFireTimer = 2.6;
      this.dummyBurstRemaining = 2;
      if (this.dummy) {
        this.dummy.hp = this.dummy.maxHp;
        this.dummy.respawnTimer = 0;
        this.dummy.hitFlash = 0;
        this.dummy.partDamage = createPartDamageState({ maxAp: 900 });
        if (this.dummy.armL) this.dummy.armL.visible = true;
        if (this.dummy.armR) this.dummy.armR.visible = true;
        this.dummy.group.visible = !this.duelMode;
      }
      if (this.built) {
        this._spawnBuildings();
        this._resetCars();
        this._syncSpatialGridAll();
      }
    },

    _syncSpatialGridAll() {
      if (!spatialGrid) return;
      clearSpatialGrid(spatialGrid);
      for (let i = 0; i < this.destructibles.length; i++) {
        const b = this.destructibles[i];
        if (!b || b.state === 'destroyed' || b.state === 'collapsing') continue;
        insertAabbItem(spatialGrid, {
          id: b.id,
          kind: 'building',
          minX: b.x - b.halfW,
          maxX: b.x + b.halfW,
          minY: 0,
          maxY: b.height,
          minZ: b.z - b.halfD,
          maxZ: b.z + b.halfD,
          payload: b,
        });
      }
      if (this.dummy && !this.duelMode) {
        insertAabbItem(spatialGrid, {
          id: 'target_dummy',
          kind: 'dummy',
          minX: this.dummy.x - this.dummy.radius,
          maxX: this.dummy.x + this.dummy.radius,
          minY: 0,
          maxY: 2.6,
          minZ: this.dummy.z - this.dummy.radius,
          maxZ: this.dummy.z + this.dummy.radius,
          payload: this.dummy,
        });
      }
    },

    _getFacadeTexture(styleId, baseHex) {
      const key = `${styleId}|${baseHex}`;
      if (this.cityTextureCache[key]) return this.cityTextureCache[key];

      const w = 256;
      const h = 256;
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');

      ctx.fillStyle = baseHex;
      ctx.fillRect(0, 0, w, h);

      if (styleId === 'brick_shop') {
        ctx.fillStyle = 'rgba(0,0,0,0.08)';
        for (let y = 0; y < h; y += 8) ctx.fillRect(0, y, w, 1);
        for (let row = 0; row < 6; row++) {
          const wy = 20 + row * 38;
          for (let col = 0; col < 5; col++) {
            const wx = 14 + col * 48;
            ctx.fillStyle = '#222933';
            ctx.fillRect(wx, wy, 30, 22);
            ctx.fillStyle = 'rgba(135,175,215,0.22)';
            ctx.fillRect(wx + 2, wy + 2, 26, 8);
            ctx.fillStyle = 'rgba(255,255,255,0.12)';
            ctx.fillRect(wx, wy + 22, 30, 2);
          }
        }
      } else if (styleId === 'blue_curtain') {
        for (let row = 0; row < 10; row++) {
          const wy = 8 + row * 25;
          ctx.fillStyle = '#233b58';
          ctx.fillRect(6, wy, w - 12, 16);
          const grad = ctx.createLinearGradient(0, wy, 0, wy + 16);
          grad.addColorStop(0, 'rgba(170,212,248,0.42)');
          grad.addColorStop(1, 'rgba(30,52,82,0.18)');
          ctx.fillStyle = grad;
          ctx.fillRect(6, wy, w - 12, 16);
        }
        ctx.fillStyle = 'rgba(220,234,248,0.34)';
        for (let x = 0; x < w; x += 32) ctx.fillRect(x, 0, 3, h);
      } else {
        for (let row = 0; row < 8; row++) {
          const wy = 12 + row * 30;
          ctx.fillStyle = 'rgba(0,0,0,0.12)';
          ctx.fillRect(0, wy - 3, w, 2);
          for (let col = 0; col < 6; col++) {
            const wx = 10 + col * 40;
            ctx.fillStyle = '#1c232d';
            ctx.fillRect(wx, wy, 28, 17);
            ctx.fillStyle = row % 3 === 0 ? 'rgba(250,236,195,0.24)' : 'rgba(145,185,225,0.22)';
            ctx.fillRect(wx + 2, wy + 2, 24, 7);
          }
        }
      }

      const tex = new THREE.CanvasTexture(canvas);
      tex.wrapS = THREE.RepeatWrapping;
      tex.wrapT = THREE.RepeatWrapping;
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.needsUpdate = true;
      this.cityTextureCache[key] = tex;
      return tex;
    },

    _getJapaneseSignTexture(text, bgCol, fgCol) {
      const key = `sign|${text}|${bgCol}`;
      if (this.cityTextureCache[key]) return this.cityTextureCache[key];
      const canvas = document.createElement('canvas');
      canvas.width = 96;
      canvas.height = 256;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = bgCol;
      ctx.fillRect(0, 0, 96, 256);
      ctx.strokeStyle = fgCol;
      ctx.lineWidth = 4;
      ctx.strokeRect(4, 4, 88, 248);
      ctx.fillStyle = fgCol;
      ctx.font = 'bold 28px "Meiryo", "Microsoft JhengHei", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const chars = [...text];
      const step = 216 / Math.max(1, chars.length);
      chars.forEach((ch, idx) => {
        ctx.fillText(ch, 48, 28 + step * (idx + 0.5));
      });
      const tex = new THREE.CanvasTexture(canvas);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.needsUpdate = true;
      this.cityTextureCache[key] = tex;
      return tex;
    },

    _buildNeoTokyoCity() {
      this.arenaGroup = new THREE.Group();
      scene.add(this.arenaGroup);

      const floorGeo = new THREE.CircleGeometry(132, 64);
      floorGeo.rotateX(-Math.PI / 2);
      const floorMat = new THREE.MeshStandardMaterial({
        color: '#6d737b',
        roughness: 0.9,
        metalness: 0.08,
      });
      this.cityMaterials.floorMat = floorMat;
      const floor = new THREE.Mesh(floorGeo, floorMat);
      floor.receiveShadow = true;
      this.arenaGroup.add(floor);

      const ringGeo = new THREE.RingGeometry(ARENA_RADIUS - 0.28, ARENA_RADIUS, 72);
      ringGeo.rotateX(-Math.PI / 2);
      const ringMat = new THREE.MeshBasicMaterial({ color: '#dfa838', side: THREE.DoubleSide, transparent: true, opacity: 0.72 });
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.position.y = 0.018;
      this.arenaGroup.add(ring);

      const asphaltMat = new THREE.MeshStandardMaterial({ color: '#2b3038', roughness: 0.88, metalness: 0.06 });
      const curbMat = new THREE.MeshStandardMaterial({ color: '#8a9099', roughness: 0.86, metalness: 0.05 });
      const avenues = [
        { pos: 0, width: 6.4, len: 164 },
        { pos: 19.0, width: 3.8, len: 156 },
        { pos: -19.0, width: 3.8, len: 156 },
      ];
      for (const av of avenues) {
        for (const isEW of [false, true]) {
          const sw = new THREE.Mesh(new THREE.PlaneGeometry(av.width + 1.0, av.len), curbMat);
          sw.rotation.x = -Math.PI / 2;
          if (isEW) sw.rotation.z = Math.PI / 2;
          sw.position.set(isEW ? 0 : av.pos, 0.008, isEW ? av.pos : 0);
          sw.receiveShadow = true;
          this.arenaGroup.add(sw);

          const road = new THREE.Mesh(new THREE.PlaneGeometry(av.width, av.len), asphaltMat);
          road.rotation.x = -Math.PI / 2;
          if (isEW) road.rotation.z = Math.PI / 2;
          road.position.set(isEW ? 0 : av.pos, 0.012, isEW ? av.pos : 0);
          road.receiveShadow = true;
          this.arenaGroup.add(road);
        }
      }

      const stripeMatrices = [];
      const dummyObj = new THREE.Object3D();
      const pushStripe = (x, z, w, l) => {
        dummyObj.position.set(x, 0.016, z);
        dummyObj.rotation.set(0, 0, 0);
        dummyObj.scale.set(w, 1, l);
        dummyObj.updateMatrix();
        stripeMatrices.push(dummyObj.matrix.clone());
      };
      for (let d = -68; d <= 68; d += 3.2) {
        if (Math.abs(d) < 4.5 || Math.abs(Math.abs(d) - 19) < 3.0) continue;
        pushStripe(0, d, 0.14, 1.8);
        pushStripe(1.6, d, 0.09, 1.3);
        pushStripe(-1.6, d, 0.09, 1.3);
        pushStripe(d, 0, 1.8, 0.14);
        pushStripe(d, 1.6, 1.3, 0.09);
        pushStripe(d, -1.6, 1.3, 0.09);
      }
      for (const cx of [-19, 0, 19]) {
        for (const cz of [-19, 0, 19]) {
          const hw = cx === 0 ? 3.0 : 1.75;
          const hd = cz === 0 ? 3.0 : 1.75;
          for (let t = -hw + 0.35; t <= hw - 0.35; t += 0.56) {
            pushStripe(cx + t, cz + hd + 1.0, 0.26, 1.1);
            pushStripe(cx + t, cz - hd - 1.0, 0.26, 1.1);
          }
          for (let t = -hd + 0.35; t <= hd - 0.35; t += 0.56) {
            pushStripe(cx + hw + 1.0, cz + t, 1.1, 0.26);
            pushStripe(cx - hw - 1.0, cz + t, 1.1, 0.26);
          }
        }
      }
      const stripeMesh = new THREE.InstancedMesh(
        new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2),
        new THREE.MeshBasicMaterial({ color: '#eef2f6' }),
        stripeMatrices.length,
      );
      stripeMatrices.forEach((m, i) => stripeMesh.setMatrixAt(i, m));
      stripeMesh.instanceMatrix.needsUpdate = true;
      this.arenaGroup.add(stripeMesh);

      this._spawnStreetPropsInstanced();
      this._spawnSkylineInstanced();
      this._spawnBuildings();
    },

    _mergeSimpleGeos(geos) {
      const nonIdx = geos.map((g) => (g.index ? g.toNonIndexed() : g));
      let totalVerts = 0;
      for (const g of nonIdx) totalVerts += g.attributes.position.count;
      const posArr = new Float32Array(totalVerts * 3);
      const normArr = new Float32Array(totalVerts * 3);
      let offset = 0;
      for (const g of nonIdx) {
        g.computeVertexNormals();
        posArr.set(g.attributes.position.array, offset);
        normArr.set(g.attributes.normal.array, offset);
        offset += g.attributes.position.count * 3;
      }
      const merged = new THREE.BufferGeometry();
      merged.setAttribute('position', new THREE.BufferAttribute(posArr, 3));
      merged.setAttribute('normal', new THREE.BufferAttribute(normArr, 3));
      return merged;
    },

    _buildRealisticCarGeometries() {
      const prof = new THREE.Shape();
      prof.moveTo(-0.27, 0.035);
      prof.lineTo(0.27, 0.035);
      prof.lineTo(0.28, 0.095);
      prof.lineTo(0.24, 0.128);
      prof.lineTo(0.11, 0.138);
      prof.lineTo(0.03, 0.215);
      prof.lineTo(-0.13, 0.215);
      prof.lineTo(-0.22, 0.145);
      prof.lineTo(-0.27, 0.132);
      prof.closePath();

      const bodyGeo = new THREE.ExtrudeGeometry(prof, {
        depth: 0.21,
        bevelEnabled: true,
        bevelThickness: 0.014,
        bevelSize: 0.012,
        bevelSegments: 2,
      });
      bodyGeo.translate(0, 0, -0.105);
      bodyGeo.rotateY(-Math.PI * 0.5);

      const parts = [];
      for (const wx of [-0.112, 0.112]) {
        for (const wz of [-0.165, 0.165]) {
          const wh = new THREE.CylinderGeometry(0.044, 0.044, 0.036, 10);
          wh.rotateZ(Math.PI * 0.5);
          wh.translate(wx, 0.044, wz);
          parts.push(wh);
        }
      }
      const glassBand = new THREE.BoxGeometry(0.218, 0.068, 0.235);
      glassBand.translate(0, 0.168, -0.045);
      parts.push(glassBand);
      const grille = new THREE.BoxGeometry(0.14, 0.036, 0.02);
      grille.translate(0, 0.072, 0.28);
      parts.push(grille);
      const trimGeo = this._mergeSimpleGeos(parts);

      const lParts = [];
      for (const lx of [-0.076, 0.076]) {
        const hl = new THREE.BoxGeometry(0.046, 0.022, 0.015);
        hl.translate(lx, 0.088, 0.282);
        lParts.push(hl);
      }
      const tl = new THREE.BoxGeometry(0.18, 0.022, 0.014);
      tl.translate(0, 0.102, -0.276);
      lParts.push(tl);
      const lightGeo = this._mergeSimpleGeos(lParts);

      return { bodyGeo, trimGeo, lightGeo };
    },

    _spawnStreetPropsInstanced() {
      this.cars = [];
      const carPalette = ['#eef2f6', '#2b3440', '#b23b3b', '#4c6582', '#deb83c', '#6d7782', '#f4f6f8'];

      const addParked = (x, z, yaw, idxBias = 0) => {
        this.cars.push({
          id: `car_p_${this.cars.length}`,
          isMoving: false,
          x,
          y: 0,
          z,
          initX: x,
          initZ: z,
          initYaw: yaw,
          yaw,
          colorHex: carPalette[(this.cars.length + idxBias) % carPalette.length],
          hp: 28,
          maxHp: 28,
          radius: 0.34,
          state: 'intact',
          vx: 0,
          vy: 0,
          vz: 0,
          rx: 0,
          ry: yaw,
          rz: 0,
          rotVelX: 0,
          rotVelZ: 0,
          smokeTimer: 0,
        });
      };

      for (const d of [-30, -25, -14, 14.5, 24, 31, -36, 36]) {
        addParked(-2.4, d, 0, 0);
        addParked(2.4, -d + 1.8, Math.PI, 1);
        addParked(d + 1.2, 2.3, Math.PI * 0.5, 2);
        addParked(-d, -2.3, -Math.PI * 0.5, 3);
      }
      for (const sgn of [-1, 1]) {
        for (const p of [-11, -5, 6, 12.5, 25]) {
          addParked(sgn * 19 - 1.2, p, 0, 4);
          addParked(p, sgn * 19 + 1.2, Math.PI * 0.5, 5);
        }
      }
      const movPalette = ['#f2f4f7', '#c43e3e', '#e2bc38', '#344254', '#72889c', '#2a3038'];
      for (let i = 0; i < 6; i++) {
        const zAxisDir = i % 2 === 0 ? 1 : -1;
        const laneX = i % 2 === 0 ? 19.8 : -19.8;
        const tz = -58 + i * 21;
        this.cars.push({
          id: `car_m_z_${i}`,
          isMoving: true,
          axis: 'z',
          laneX,
          laneZ: 0,
          dir: zAxisDir,
          t: tz,
          initT: tz,
          speed: 3.2 + (i % 3) * 0.8,
          x: laneX,
          y: 0,
          z: tz,
          yaw: zAxisDir > 0 ? 0 : Math.PI,
          initYaw: zAxisDir > 0 ? 0 : Math.PI,
          colorHex: movPalette[i % movPalette.length],
          hp: 28,
          maxHp: 28,
          radius: 0.34,
          state: 'intact',
          vx: 0,
          vy: 0,
          vz: 0,
          rx: 0,
          ry: zAxisDir > 0 ? 0 : Math.PI,
          rz: 0,
          rotVelX: 0,
          rotVelZ: 0,
          smokeTimer: 0,
        });

        const xAxisDir = i % 2 === 0 ? 1 : -1;
        const laneZ = i % 2 === 0 ? -19.8 : 19.8;
        const tx = -54 + i * 19;
        this.cars.push({
          id: `car_m_x_${i}`,
          isMoving: true,
          axis: 'x',
          laneX: 0,
          laneZ,
          dir: xAxisDir,
          t: tx,
          initT: tx,
          speed: 3.4 + (i % 2) * 0.9,
          x: tx,
          y: 0,
          z: laneZ,
          yaw: xAxisDir > 0 ? Math.PI * 0.5 : -Math.PI * 0.5,
          initYaw: xAxisDir > 0 ? Math.PI * 0.5 : -Math.PI * 0.5,
          colorHex: movPalette[(i + 2) % movPalette.length],
          hp: 28,
          maxHp: 28,
          radius: 0.34,
          state: 'intact',
          vx: 0,
          vy: 0,
          vz: 0,
          rx: 0,
          ry: xAxisDir > 0 ? Math.PI * 0.5 : -Math.PI * 0.5,
          rz: 0,
          rotVelX: 0,
          rotVelZ: 0,
          smokeTimer: 0,
        });
      }

      const { bodyGeo, trimGeo, lightGeo } = this._buildRealisticCarGeometries();
      const carBodyMesh = new THREE.InstancedMesh(
        bodyGeo,
        new THREE.MeshStandardMaterial({ roughness: 0.34, metalness: 0.56 }),
        this.cars.length,
      );
      const carTrimMesh = new THREE.InstancedMesh(
        trimGeo,
        new THREE.MeshStandardMaterial({ color: '#171d24', roughness: 0.28, metalness: 0.45 }),
        this.cars.length,
      );
      const carLightMesh = new THREE.InstancedMesh(
        lightGeo,
        new THREE.MeshStandardMaterial({ color: '#fff3d6', emissive: '#ffcf70', emissiveIntensity: 1.4 }),
        this.cars.length,
      );
      carBodyMesh.castShadow = true;
      const dObj = new THREE.Object3D();
      const tmpCol = new THREE.Color();
      this.cars.forEach((c, i) => {
        c.instIdx = i;
        dObj.position.set(c.x, 0, c.z);
        dObj.rotation.set(0, c.yaw, 0);
        dObj.scale.set(1, 1, 1);
        dObj.updateMatrix();
        carBodyMesh.setMatrixAt(i, dObj.matrix);
        carTrimMesh.setMatrixAt(i, dObj.matrix);
        carLightMesh.setMatrixAt(i, dObj.matrix);
        tmpCol.set(c.colorHex);
        carBodyMesh.setColorAt(i, tmpCol);
      });
      carBodyMesh.instanceMatrix.needsUpdate = true;
      carTrimMesh.instanceMatrix.needsUpdate = true;
      carLightMesh.instanceMatrix.needsUpdate = true;
      if (carBodyMesh.instanceColor) carBodyMesh.instanceColor.needsUpdate = true;
      this.arenaGroup.add(carBodyMesh, carTrimMesh, carLightMesh);
      this.carInst = { bodyMesh: carBodyMesh, trimMesh: carTrimMesh, lightMesh: carLightMesh };

      const treeSpots = [];
      for (let d = -34; d <= 34; d += 4.2) {
        if (Math.abs(d) < 5.0 || Math.abs(Math.abs(d) - 19) < 3.2) continue;
        treeSpots.push([3.55, d], [-3.55, d], [d, 3.55], [d, -3.55]);
      }
      const trunkMesh = new THREE.InstancedMesh(
        new THREE.CylinderGeometry(0.03, 0.04, 0.28, 6),
        new THREE.MeshStandardMaterial({ color: '#4c3a2b', roughness: 0.9 }),
        treeSpots.length,
      );
      const crownMesh = new THREE.InstancedMesh(
        new THREE.DodecahedronGeometry(0.22, 0),
        new THREE.MeshStandardMaterial({ roughness: 0.85 }),
        treeSpots.length,
      );
      treeSpots.forEach(([x, z], i) => {
        const s = 0.88 + (i % 3) * 0.14;
        dObj.position.set(x, 0.14, z);
        dObj.rotation.set(0, i * 0.8, 0);
        dObj.scale.set(1, 1, 1);
        dObj.updateMatrix();
        trunkMesh.setMatrixAt(i, dObj.matrix);

        dObj.position.set(x, 0.34 * s, z);
        dObj.scale.set(s, s * 1.12, s);
        dObj.updateMatrix();
        crownMesh.setMatrixAt(i, dObj.matrix);
        tmpCol.set(i % 2 === 0 ? '#3f6a34' : '#4d7c3f');
        crownMesh.setColorAt(i, tmpCol);
      });
      crownMesh.castShadow = true;
      trunkMesh.instanceMatrix.needsUpdate = true;
      crownMesh.instanceMatrix.needsUpdate = true;
      if (crownMesh.instanceColor) crownMesh.instanceColor.needsUpdate = true;
      this.arenaGroup.add(trunkMesh, crownMesh);

      this._spawnUrbanLandmarksAndTraffic();
    },

    _spawnUrbanLandmarksAndTraffic() {
      const skyMat = new THREE.ShaderMaterial({
        uniforms: {},
        vertexShader: `
          varying vec3 vWorldPos;
          void main() {
            vec4 wp = modelMatrix * vec4(position, 1.0);
            vWorldPos = wp.xyz;
            gl_Position = projectionMatrix * viewMatrix * wp;
          }
        `,
        fragmentShader: `
          varying vec3 vWorldPos;
          void main() {
            float h = clamp(normalize(vWorldPos).y, 0.0, 1.0);
            vec3 horizon = vec3(0.83, 0.89, 0.96);
            vec3 midSky = vec3(0.49, 0.70, 0.91);
            vec3 zenith = vec3(0.28, 0.52, 0.84);
            vec3 col = mix(horizon, midSky, smoothstep(0.0, 0.24, h));
            col = mix(col, zenith, smoothstep(0.24, 0.78, h));
            gl_FragColor = vec4(col, 1.0);
          }
        `,
        side: THREE.BackSide,
        depthWrite: false,
        fog: false,
      });
      const skyDome = new THREE.Mesh(new THREE.SphereGeometry(185, 24, 16), skyMat);
      this.cityMaterials.skyDome = skyDome;
      this.arenaGroup.add(skyDome);

      const steelMat = new THREE.MeshStandardMaterial({ color: '#c4cad2', roughness: 0.52, metalness: 0.45 });
      const railMat = new THREE.MeshStandardMaterial({ color: '#455972', roughness: 0.45, metalness: 0.5 });
      const deck = new THREE.Mesh(new THREE.BoxGeometry(8.6, 0.18, 1.05), steelMat);
      deck.position.set(0, 2.95, -17.5);
      deck.castShadow = true;
      deck.receiveShadow = true;
      this.arenaGroup.add(deck);
      for (const rz of [-0.48, 0.48]) {
        const rail = new THREE.Mesh(new THREE.BoxGeometry(8.6, 0.22, 0.05), railMat);
        rail.position.set(0, 3.15, -17.5 + rz);
        this.arenaGroup.add(rail);
      }
      for (const sx of [-3.95, 3.95]) {
        const pier = new THREE.Mesh(new THREE.BoxGeometry(0.28, 2.95, 0.34), steelMat);
        pier.position.set(sx, 1.475, -17.5);
        pier.castShadow = true;
        this.arenaGroup.add(pier);
      }

      const poleSpots = [
        [3.55, 3.55],
        [-3.55, 3.55],
        [3.55, -3.55],
        [-3.55, -3.55],
        [21.2, 2.4],
        [-21.2, -2.4],
        [2.4, -21.2],
        [-2.4, 21.2],
      ];
      const poleMesh = new THREE.InstancedMesh(
        new THREE.CylinderGeometry(0.035, 0.045, 0.95, 6),
        new THREE.MeshStandardMaterial({ color: '#39414a', metalness: 0.65, roughness: 0.4 }),
        poleSpots.length,
      );
      const armMesh = new THREE.InstancedMesh(
        new THREE.BoxGeometry(0.55, 0.06, 0.08),
        new THREE.MeshStandardMaterial({ color: '#2b323b', metalness: 0.6, roughness: 0.45 }),
        poleSpots.length,
      );
      const dObj = new THREE.Object3D();
      poleSpots.forEach(([px, pz], i) => {
        dObj.position.set(px, 0.475, pz);
        dObj.rotation.set(0, 0, 0);
        dObj.updateMatrix();
        poleMesh.setMatrixAt(i, dObj.matrix);

        dObj.position.set(px + (px > 0 ? -0.22 : 0.22), 0.9, pz);
        dObj.updateMatrix();
        armMesh.setMatrixAt(i, dObj.matrix);
      });
      poleMesh.instanceMatrix.needsUpdate = true;
      armMesh.instanceMatrix.needsUpdate = true;
      this.arenaGroup.add(poleMesh, armMesh);

      const tGroup = new THREE.Group();
      tGroup.position.set(-22, 0, -76);
      const towerRed = new THREE.MeshStandardMaterial({ color: '#c83e2b', roughness: 0.48, metalness: 0.35 });
      const towerWhite = new THREE.MeshStandardMaterial({ color: '#eceef2', roughness: 0.5, metalness: 0.25 });
      const tiers = [
        [3.6, 1.8, 5.2, towerRed, 2.6],
        [1.8, 1.0, 5.4, towerWhite, 7.8],
        [2.1, 2.1, 0.85, towerRed, 10.6],
        [0.95, 0.42, 6.2, towerRed, 14.0],
        [0.14, 0.04, 4.4, towerWhite, 19.2],
      ];
      for (const [rb, rt, h, mat, cy] of tiers) {
        const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, 4), mat);
        m.rotation.y = Math.PI * 0.25;
        m.position.y = cy;
        tGroup.add(m);
      }
      this.arenaGroup.add(tGroup);

      const infillItems = [];
      let seed = 8801;
      const rand = () => {
        seed = (seed * 16807) % 2147483647;
        return (seed - 1) / 2147483646;
      };
      for (let i = 0; i < 112; i++) {
        const ang = (i / 112) * Math.PI * 2 + (rand() - 0.5) * 0.06;
        const dist = 25.5 + rand() * 31.0;
        const x = Math.cos(ang) * dist;
        const z = Math.sin(ang) * dist;
        if (Math.abs(x) < 5.6 || Math.abs(z) < 5.6) continue;
        if (Math.abs(Math.abs(x) - 19) < 3.9 || Math.abs(Math.abs(z) - 19) < 3.9) continue;
        infillItems.push({
          x,
          z,
          w: 2.3 + rand() * 2.2,
          d: 2.3 + rand() * 2.2,
          h: 1.2 + rand() * 2.7,
          style: i % 3,
        });
      }
      const infillStyles = [
        { id: 'brick_shop', hex: '#8e5d4f', rough: 0.78, metal: 0.1 },
        { id: 'cream_office', hex: '#d5cec0', rough: 0.72, metal: 0.12 },
        { id: 'slate_tower', hex: '#586270', rough: 0.62, metal: 0.22 },
      ];
      infillStyles.forEach((st, idx) => {
        const bkt = infillItems.filter((it) => it.style === idx);
        if (!bkt.length) return;
        const mesh = new THREE.InstancedMesh(
          new THREE.BoxGeometry(1, 1, 1),
          new THREE.MeshStandardMaterial({ map: this._getFacadeTexture(st.id, st.hex), roughness: st.rough, metalness: st.metal }),
          bkt.length,
        );
        bkt.forEach((it, j) => {
          dObj.position.set(it.x, it.h * 0.5, it.z);
          dObj.rotation.set(0, 0, 0);
          dObj.scale.set(it.w, it.h, it.d);
          dObj.updateMatrix();
          mesh.setMatrixAt(j, dObj.matrix);

          if (Math.hypot(it.x, it.z) <= ARENA_RADIUS + 6.5) {
            const hp = computeBuildingDurability(it.w, it.d, it.h);
            this.instancedDestructibles.push({
              id: `infill_${idx}_${j}`,
              isInstanced: true,
              instMesh: mesh,
              instanceIdx: j,
              origMatrix: dObj.matrix.clone(),
              styleSpec: st,
              group: null,
              bodyMat: null,
              x: it.x,
              z: it.z,
              w: it.w,
              d: it.d,
              halfW: it.w * 0.5,
              halfD: it.d * 0.5,
              height: it.h,
              hp,
              maxHp: hp,
              state: 'intact',
              collapseProgress: 0,
              collapseDirX: ((j + idx) % 2 === 0 ? 1 : -1) * 0.52,
              collapseDirZ: (j % 3 === 0 ? -1 : 1) * 0.42,
              dustAccum: 0,
              boomAccum: 0,
            });
          }
        });
        mesh.receiveShadow = true;
        mesh.instanceMatrix.needsUpdate = true;
        this.arenaGroup.add(mesh);
      });
    },

    _spawnSkylineInstanced() {
      const towers = [];
      let seed = 4242;
      const rand = () => {
        seed = (seed * 16807) % 2147483647;
        return (seed - 1) / 2147483646;
      };

      for (let i = 0; i < 76; i++) {
        const angle = (i / 76) * Math.PI * 2 + (rand() - 0.5) * 0.05;
        const dist = 34 + (i % 3) * 14 + rand() * 14;
        const x = Math.cos(angle) * dist;
        const z = Math.sin(angle) * dist;
        if (Math.abs(x) < 5.2 || Math.abs(z) < 5.2) continue;
        if (Math.abs(Math.abs(x) - 19) < 3.6 || Math.abs(Math.abs(z) - 19) < 3.6) continue;
        towers.push({
          x,
          z,
          w: 3.0 + rand() * 2.8,
          d: 3.0 + rand() * 2.8,
          h: 6.2 + (i % 4) * 2.4 + rand() * 5.2,
          style: i % 3,
        });
      }

      const styles = [
        { id: 'blue_curtain', hex: '#7195bc', metal: 0.45, rough: 0.35 },
        { id: 'cream_office', hex: '#d3ccbf', metal: 0.12, rough: 0.72 },
        { id: 'slate_tower', hex: '#545f6d', metal: 0.24, rough: 0.58 },
      ];
      const dObj = new THREE.Object3D();

      styles.forEach((st, sIdx) => {
        const bucket = towers.filter((t) => t.style === sIdx);
        if (!bucket.length) return;
        const tex = this._getFacadeTexture(st.id, st.hex);
        const mesh = new THREE.InstancedMesh(
          new THREE.BoxGeometry(1, 1, 1),
          new THREE.MeshStandardMaterial({ map: tex, metalness: st.metal, roughness: st.rough }),
          bucket.length,
        );
        bucket.forEach((t, i) => {
          dObj.position.set(t.x, t.h * 0.5, t.z);
          dObj.rotation.set(0, 0, 0);
          dObj.scale.set(t.w, t.h, t.d);
          dObj.updateMatrix();
          mesh.setMatrixAt(i, dObj.matrix);

          if (Math.hypot(t.x, t.z) <= ARENA_RADIUS + 6.5) {
            const hp = computeBuildingDurability(t.w, t.d, t.h);
            this.instancedDestructibles.push({
              id: `tower_${sIdx}_${i}`,
              isInstanced: true,
              instMesh: mesh,
              instanceIdx: i,
              origMatrix: dObj.matrix.clone(),
              styleSpec: st,
              group: null,
              bodyMat: null,
              x: t.x,
              z: t.z,
              w: t.w,
              d: t.d,
              halfW: t.w * 0.5,
              halfD: t.d * 0.5,
              height: t.h,
              hp,
              maxHp: hp,
              state: 'intact',
              collapseProgress: 0,
              collapseDirX: ((i + sIdx) % 2 === 0 ? 1 : -1) * 0.48,
              collapseDirZ: (i % 3 === 0 ? 1 : -1) * 0.44,
              dustAccum: 0,
              boomAccum: 0,
            });
          }
        });
        mesh.receiveShadow = true;
        mesh.instanceMatrix.needsUpdate = true;
        this.arenaGroup.add(mesh);
      });
    },

    _promoteInstancedBuilding(b) {
      if (!b || !b.isInstanced) return;
      const hideM = new THREE.Matrix4().makeScale(0, 0, 0);
      b.instMesh.setMatrixAt(b.instanceIdx, hideM);
      b.instMesh.instanceMatrix.needsUpdate = true;
      b.isInstanced = false;

      const grp = new THREE.Group();
      grp.position.set(b.x, 0, b.z);
      const st = b.styleSpec || { id: 'slate_tower', hex: '#586270', rough: 0.62, metal: 0.22 };
      const bodyMat = new THREE.MeshStandardMaterial({
        map: this._getFacadeTexture(st.id, st.hex),
        color: '#ffffff',
        roughness: st.rough ?? 0.65,
        metalness: st.metal ?? 0.2,
      });
      const body = new THREE.Mesh(new THREE.BoxGeometry(b.w, b.height, b.d), bodyMat);
      body.position.y = b.height * 0.5;
      body.receiveShadow = true;
      body.castShadow = true;
      grp.add(body);

      const roofParapet = new THREE.Mesh(
        new THREE.BoxGeometry(b.w + 0.08, 0.12, b.d + 0.08),
        new THREE.MeshStandardMaterial({ color: '#494f57', roughness: 0.85 }),
      );
      roofParapet.position.y = b.height + 0.04;
      grp.add(roofParapet);

      this.arenaGroup.add(grp);
      b.group = grp;
      b.bodyMat = bodyMat;
    },

    _spawnBuildings() {
      for (const b of this.destructibles) {
        if (b.group) {
          this.arenaGroup.remove(b.group);
          b.group = null;
        }
      }
      this.destructibles = [];

      for (const ib of this.instancedDestructibles) {
        ib.hp = ib.maxHp;
        ib.state = 'intact';
        ib.collapseProgress = 0;
        ib.dustAccum = 0;
        ib.boomAccum = 0;
        ib.bodyMat = null;
        ib.isInstanced = true;
        ib.instMesh.setMatrixAt(ib.instanceIdx, ib.origMatrix);
        ib.instMesh.instanceMatrix.needsUpdate = true;
        this.destructibles.push(ib);
      }

      const layout = [
        [-10.2, -5.2, 3.6, 2.2, 3.2, 'brick_shop', '#8f5d4e', 'アーケード'],
        [-14.2, -11.8, 3.8, 2.85, 3.6, 'cream_office', '#d7d0c3', '新東京百貨'],
        [-7.2, -13.8, 3.0, 1.95, 3.0, 'slate_tower', '#55606e', '電器街'],
        [10.4, -5.4, 3.6, 2.45, 3.4, 'cream_office', '#d2cabd', '珈琲 喫茶'],
        [14.4, -12.2, 4.0, 3.0, 3.8, 'brick_shop', '#845446', '書店本館'],
        [7.4, -14.0, 2.9, 1.85, 2.9, 'blue_curtain', '#6789ae', '高層貿易'],
        [-11.8, 7.6, 3.4, 2.25, 3.2, 'cream_office', '#dcd5c8', '東宝劇場'],
        [-15.0, 13.6, 4.0, 2.9, 3.6, 'brick_shop', '#8a594b', '飯店廣場'],
        [11.6, 7.2, 3.4, 2.1, 3.2, 'brick_shop', '#915f50', '居酒屋'],
        [14.6, 13.4, 3.8, 2.75, 3.5, 'slate_tower', '#4e5968', '防災本部'],
        [-25.0, -5.5, 4.2, 3.2, 3.8, 'blue_curtain', '#6e90b5', '丸之內塔'],
        [25.0, -5.5, 4.2, 3.15, 3.6, 'cream_office', '#cfc7ba', '中央銀行'],
        [-6.8, -24.5, 4.2, 2.9, 3.4, 'slate_tower', '#566270', '交通局'],
        [-6.8, 14.5, 3.3, 2.15, 3.2, 'brick_shop', '#8d5b4c', '模型本舖'],
      ];

      const hvacMat = new THREE.MeshStandardMaterial({ color: '#6b727a', roughness: 0.72, metalness: 0.25 });
      const tankMat = new THREE.MeshStandardMaterial({ color: '#9ba3ad', roughness: 0.45, metalness: 0.55 });
      const roofCapMat = new THREE.MeshStandardMaterial({ color: '#494f57', roughness: 0.85 });

      layout.forEach(([x, z, w, h, d, styleId, bodyCol, signText], idx) => {
        const grp = new THREE.Group();
        grp.position.set(x, 0, z);

        const tex = this._getFacadeTexture(styleId, bodyCol);
        const bodyMat = new THREE.MeshStandardMaterial({
          map: tex,
          color: '#ffffff',
          roughness: styleId === 'blue_curtain' ? 0.36 : 0.74,
          metalness: styleId === 'blue_curtain' ? 0.42 : 0.14,
        });
        const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), bodyMat);
        body.position.y = h / 2;
        body.castShadow = true;
        body.receiveShadow = true;
        grp.add(body);

        const parapet = new THREE.Mesh(new THREE.BoxGeometry(w + 0.08, 0.11, d + 0.08), roofCapMat);
        parapet.position.y = h + 0.03;
        grp.add(parapet);

        const hvac = new THREE.Mesh(new THREE.BoxGeometry(w * 0.34, 0.22, d * 0.34), hvacMat);
        hvac.position.set(w * 0.16, h + 0.14, -d * 0.14);
        hvac.castShadow = true;
        grp.add(hvac);

        if (idx % 2 === 0) {
          const tank = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.30, 12), tankMat);
          tank.position.set(-w * 0.22, h + 0.20, d * 0.18);
          tank.castShadow = true;
          grp.add(tank);
        }

        const signTex = this._getJapaneseSignTexture(signText, idx % 2 === 0 ? '#a82a2a' : '#1b3e68', '#fff6dc');
        const sign = new THREE.Mesh(
          new THREE.BoxGeometry(0.28, Math.min(1.05, h * 0.46), 0.08),
          new THREE.MeshStandardMaterial({ map: signTex, roughness: 0.45 }),
        );
        const faceSignZ = z < 0 ? d * 0.5 + 0.05 : -(d * 0.5 + 0.05);
        sign.position.set(w * 0.28, h * 0.45, faceSignZ);
        grp.add(sign);

        const nearHp = computeBuildingDurability(w, d, h);
        this.arenaGroup.add(grp);
        this.destructibles.push({
          id: `bldg_${idx}`,
          isInstanced: false,
          group: grp,
          bodyMat,
          x,
          z,
          w,
          d,
          halfW: w * 0.5,
          halfD: d * 0.5,
          height: h,
          hp: nearHp,
          maxHp: nearHp,
          state: 'intact',
          collapseProgress: 0,
          collapseDirX: (idx % 2 === 0 ? 1 : -1) * 0.55,
          collapseDirZ: 0.42,
          dustAccum: 0,
          boomAccum: 0,
        });
      });
    },

    _buildTargetDummy() {
      const grp = new THREE.Group();
      grp.position.set(0, 0, -9);

      const standMat = new THREE.MeshStandardMaterial({ color: '#2b3340', metalness: 0.8, roughness: 0.4 });
      const armorMat = new THREE.MeshStandardMaterial({ color: '#d0533c', metalness: 0.55, roughness: 0.35 });
      const coreMat = new THREE.MeshStandardMaterial({ color: '#ffaa22', emissive: '#ff6600', emissiveIntensity: 2.4 });

      const base = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.9, 0.22, 20), standMat);
      base.position.y = 0.11;
      grp.add(base);

      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, 1.35, 16), standMat);
      post.position.y = 0.85;
      grp.add(post);

      const torso = new THREE.Mesh(new THREE.BoxGeometry(0.88, 0.95, 0.52), armorMat);
      torso.position.y = 1.62;
      torso.castShadow = true;
      grp.add(torso);

      const core = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.24, 0.56), coreMat);
      core.position.y = 1.65;
      grp.add(core);

      const head = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.34, 0.36), armorMat);
      head.position.y = 2.3;
      grp.add(head);

      const armL = new THREE.Group();
      armL.position.set(-0.62, 1.85, 0);
      const shoulderL = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.28, 0.34), armorMat);
      const forearmL = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.72, 0.24), armorMat);
      forearmL.position.y = -0.44;
      const podL = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.56, 0.42), standMat);
      podL.position.set(-0.14, -0.52, -0.06);
      armL.add(shoulderL, forearmL, podL);
      grp.add(armL);

      const armR = new THREE.Group();
      armR.position.set(0.62, 1.85, 0);
      const shoulderR = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.28, 0.34), armorMat);
      const forearmR = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.72, 0.24), armorMat);
      forearmR.position.y = -0.44;
      const barrelR = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.07, 0.64, 10), standMat);
      barrelR.rotation.x = Math.PI * 0.5;
      barrelR.position.set(0, -0.68, 0.24);
      armR.add(shoulderR, forearmR, barrelR);
      grp.add(armR);

      this.arenaGroup.add(grp);
      this.dummy = {
        group: grp,
        armorMat,
        armL,
        armR,
        x: 0,
        z: -9,
        radius: 0.92,
        hp: 300,
        maxHp: 300,
        partDamage: createPartDamageState({ maxAp: 900 }),
        hitFlash: 0,
        respawnTimer: 0,
      };
    },

    getDummySubPartCapsules() {
      const d = this.dummy;
      if (!d) return [];
      const pState = d.partDamage;
      return [
        { partId: 'head', a: { x: d.x, y: 2.1, z: d.z }, b: { x: d.x, y: 2.48, z: d.z }, radius: 0.28, disabled: false },
        { partId: 'torso', a: { x: d.x, y: 1.15, z: d.z }, b: { x: d.x, y: 2.05, z: d.z }, radius: 0.46, disabled: false },
        { partId: 'arm_l', a: { x: d.x - 0.62, y: 1.95, z: d.z }, b: { x: d.x - 0.64, y: 1.1, z: d.z }, radius: 0.28, disabled: Boolean(pState?.arm_l?.severed) },
        { partId: 'arm_r', a: { x: d.x + 0.62, y: 1.95, z: d.z }, b: { x: d.x + 0.64, y: 1.1, z: d.z }, radius: 0.28, disabled: Boolean(pState?.arm_r?.severed) },
      ];
    },

    _resetCars() {
      if (!this.cars.length || !this.carInst.bodyMesh) return;
      const dObj = new THREE.Object3D();
      const tmpCol = new THREE.Color();
      this.cars.forEach((c, idx) => {
        c.hp = c.maxHp;
        c.state = 'intact';
        if (c.isMoving) {
          c.t = c.initT;
          c.x = c.axis === 'x' ? c.t : c.laneX;
          c.z = c.axis === 'z' ? c.t : c.laneZ;
        } else {
          c.x = c.initX;
          c.z = c.initZ;
        }
        c.y = 0;
        c.yaw = c.initYaw;
        c.vx = 0;
        c.vy = 0;
        c.vz = 0;
        c.rx = 0;
        c.ry = c.initYaw;
        c.rz = 0;
        c.rotVelX = 0;
        c.rotVelZ = 0;
        c.smokeTimer = 0;

        dObj.position.set(c.x, 0, c.z);
        dObj.rotation.set(0, c.yaw, 0);
        dObj.scale.set(1, 1, 1);
        dObj.updateMatrix();
        this.carInst.bodyMesh.setMatrixAt(idx, dObj.matrix);
        this.carInst.trimMesh.setMatrixAt(idx, dObj.matrix);
        this.carInst.lightMesh.setMatrixAt(idx, dObj.matrix);
        tmpCol.set(c.colorHex);
        this.carInst.bodyMesh.setColorAt(idx, tmpCol);
      });
      this.carInst.bodyMesh.instanceMatrix.needsUpdate = true;
      this.carInst.trimMesh.instanceMatrix.needsUpdate = true;
      this.carInst.lightMesh.instanceMatrix.needsUpdate = true;
      if (this.carInst.bodyMesh.instanceColor) this.carInst.bodyMesh.instanceColor.needsUpdate = true;
    },

    _wreckCar(car, impactCenter, launchPower = 5.5, score = null) {
      if (!car || car.state !== 'intact') return;
      car.hp = 0;
      car.state = 'flying';
      const dx = car.x - impactCenter.x;
      const dz = car.z - impactCenter.z;
      const dLen = Math.hypot(dx, dz) || 1;
      const nx = dx / dLen;
      const nz = dz / dLen;
      car.vx = nx * (launchPower * 0.75 + Math.random() * 2.4);
      car.vz = nz * (launchPower * 0.75 + Math.random() * 2.4);
      car.vy = launchPower * 0.88 + Math.random() * 2.2;
      car.rotVelX = (Math.random() > 0.5 ? 1 : -1) * (5.5 + Math.random() * 5.0);
      car.rotVelZ = (Math.random() > 0.5 ? 1 : -1) * (4.5 + Math.random() * 5.0);
      car.y = 0.08;

      const pos = new THREE.Vector3(car.x, 0.25, car.z);
      vfx.spawnImpactFlash(pos);
      vfx.spawnDebris(pos, 10);
      vfx.spawnDust(pos, 6);
      audio.playCarWreck();
      if (score) {
        score.destroyed += 1;
        score.mcEarned += 35;
      }

      if (this.carInst.bodyMesh) {
        this.carInst.bodyMesh.setColorAt(car.instIdx, this._tmpColor.set('#22262b'));
        if (this.carInst.bodyMesh.instanceColor) this.carInst.bodyMesh.instanceColor.needsUpdate = true;
      }
    },

    checkEnemyShotObstruction(prevPos, curPos) {
      if (!curPos) return false;
      const p0 = prevPos || curPos;
      if (spatialGrid) {
        const candidates = querySegmentCandidates(spatialGrid, p0, curPos, 0.35);
        for (let i = 0; i < candidates.length; i++) {
          const item = candidates[i];
          if (item.kind !== 'building') continue;
          const b = item.payload;
          if (!b || b.state === 'destroyed' || b.state === 'collapsing') continue;
          if (intersectSegmentAabb(p0, curPos, item, 0.3).hit) {
            audio.playBulletHit('concrete');
            return true;
          }
        }
        return false;
      }
      for (let i = 0; i < this.destructibles.length; i++) {
        const b = this.destructibles[i];
        if (b.state === 'destroyed' || b.state === 'collapsing') continue;
        if (
          curPos.x >= b.x - b.halfW - 0.3 &&
          curPos.x <= b.x + b.halfW + 0.3 &&
          curPos.z >= b.z - b.halfD - 0.3 &&
          curPos.z <= b.z + b.halfD + 0.3 &&
          curPos.y <= b.height
        ) {
          audio.playBulletHit('concrete');
          return true;
        }
      }
      return false;
    },

    querySweptPlayerShotHit(prevPos, curPos, expandRadius = 0.28) {
      if (!spatialGrid || !curPos) return null;
      const p0 = prevPos || curPos;
      const candidates = querySegmentCandidates(spatialGrid, p0, curPos, expandRadius + 0.25);
      let best = null;
      let bestT = 2;
      for (let i = 0; i < candidates.length; i++) {
        const item = candidates[i];
        if (item.kind === 'dummy') {
          const d = item.payload;
          if (!d || d.respawnTimer > 0) continue;
          const subHit = evaluateSubPartSegmentHit(p0, curPos, this.getDummySubPartCapsules());
          if (subHit.hit && subHit.t < bestT) {
            bestT = subHit.t;
            best = { kind: 'dummy', payload: d, point: subHit.hitPos, partId: subHit.partId };
          } else {
            const hit = intersectSegmentCapsuleY(p0, curPos, { x: d.x, y: 0, z: d.z }, d.radius + expandRadius, 2.75);
            if (hit.hit && hit.t < bestT) {
              bestT = hit.t;
              best = { kind: 'dummy', payload: d, point: hit.point, partId: 'torso' };
            }
          }
        } else if (item.kind === 'building') {
          const b = item.payload;
          if (!b || b.state === 'destroyed' || b.state === 'collapsing') continue;
          const hit = intersectSegmentAabb(p0, curPos, item, expandRadius);
          if (hit.hit && hit.t < bestT) {
            bestT = hit.t;
            best = { kind: 'building', payload: b, point: hit.point };
          }
        }
      }
      return best;
    },

    applyDamageInSphere(
      center,
      radius,
      dmg,
      { isMelee = false, hitPartId = null, slashDir = 'LR', score = null, onHitstop = null, onCameraShake = null, onPartDestroyed = null } = {},
    ) {
      let landedHit = false;
      let hitMaterial = 'concrete';

      if (this.dummy && !this.duelMode && this.dummy.respawnTimer <= 0) {
        const dist = Math.hypot(center.x - this.dummy.x, center.z - this.dummy.z);
        if (dist <= radius + this.dummy.radius && center.y <= 3.0) {
          let resolvedPart = hitPartId;
          if (!resolvedPart) {
            const caps = this.getDummySubPartCapsules();
            let bestD2 = Infinity;
            for (const c of caps) {
              if (!c || c.disabled) continue;
              const mx = (c.a.x + c.b.x) * 0.5;
              const my = (c.a.y + c.b.y) * 0.5;
              const mz = (c.a.z + c.b.z) * 0.5;
              let d2 = (mx - center.x) ** 2 + (my - center.y) ** 2 + (mz - center.z) ** 2;
              if (isMelee && (c.partId === 'arm_l' || c.partId === 'arm_r')) d2 *= 0.45;
              if (d2 < bestD2) {
                bestD2 = d2;
                resolvedPart = c.partId;
              }
            }
            if (isMelee && slashDir === 'RL' && !this.dummy.partDamage?.arm_l?.severed) {
              resolvedPart = 'arm_l';
            } else if (isMelee && slashDir === 'LR' && !this.dummy.partDamage?.arm_r?.severed) {
              resolvedPart = 'arm_r';
            }
          }
          const partRes = applyPartDamage(this.dummy.partDamage, resolvedPart || 'torso', {
            rawDamage: Math.round(dmg * (isMelee ? 4.5 : 3.2)),
            damageType: isMelee ? 'saber' : 'bullet',
            isMelee,
          });
          this.dummy.partDamage = partRes.partState;
          if (partRes.severedArm) {
            const armNode = partRes.severedArm === 'L' ? this.dummy.armL : this.dummy.armR;
            if (armNode) {
              const armWorld = new THREE.Vector3();
              armNode.getWorldPosition(armWorld);
              const cloneGrp = armNode.clone(true);
              cloneGrp.position.set(0, 0, 0);
              const wrapper = new THREE.Group();
              wrapper.position.copy(armWorld);
              wrapper.add(cloneGrp);
              armNode.visible = false;
              onPartDestroyed?.({
                target: 'dummy',
                partId: partRes.partId,
                severedArm: partRes.severedArm,
                severedDebris: {
                  group: wrapper,
                  originPos: { x: armWorld.x, y: armWorld.y, z: armWorld.z },
                },
                stumpPos: { x: armWorld.x, y: armWorld.y, z: armWorld.z },
              });
            }
          } else if (partRes.brokenNow) {
            onPartDestroyed?.({
              target: 'dummy',
              partId: partRes.partId,
              severedArm: null,
            });
          }

          this.dummy.hp = Math.max(0, this.dummy.hp - dmg);
          this.dummy.hitFlash = 0.14;
          landedHit = true;
          hitMaterial = 'metal';
          if (this.dummy.hp <= 0) {
            this.dummy.respawnTimer = 4.0;
            this.dummy.group.visible = false;
            if (score) {
              score.dummyKills += 1;
              score.mcEarned += 250;
            }
            vfx.spawnDebris(new THREE.Vector3(this.dummy.x, 1.3, this.dummy.z), 22);
            audio.playCollapse();
          }
        }
      }

      if (center.y <= 1.25) {
        for (let i = 0; i < this.cars.length; i++) {
          const c = this.cars[i];
          if (c.state !== 'intact') continue;
          if (Math.hypot(center.x - c.x, center.z - c.z) <= radius + c.radius + 0.15) {
            c.hp -= dmg;
            landedHit = true;
            hitMaterial = 'metal';
            if (c.hp <= 0) {
              this._wreckCar(c, center, isMelee ? 7.6 : 5.4, score);
            }
          }
        }
      }

      if (spatialGrid) {
        const candidates = querySegmentCandidates(spatialGrid, center, center, radius);
        for (let i = 0; i < candidates.length; i++) {
          const item = candidates[i];
          if (item.kind !== 'building') continue;
          const b = item.payload;
          if (!b || b.state === 'destroyed' || b.state === 'collapsing') continue;
          if (
            center.x >= b.x - b.halfW - radius &&
            center.x <= b.x + b.halfW + radius &&
            center.z >= b.z - b.halfD - radius &&
            center.z <= b.z + b.halfD + radius &&
            center.y <= b.height + radius
          ) {
            if (b.isInstanced) this._promoteInstancedBuilding(b);
            const updated = damageDestructibleProp(b, dmg);
            b.hp = updated.hp;
            b.state = updated.state;
            landedHit = true;
            if (b.state === 'collapsing') {
              removeSpatialItem(spatialGrid, b.id);
              if (score) {
                score.destroyed += 1;
                score.mcEarned += Math.round(b.maxHp * 0.25);
              }
              vfx.spawnDebris(new THREE.Vector3(b.x, b.height * 0.65, b.z), 24);
              vfx.spawnDust(new THREE.Vector3(b.x, 0.25, b.z), 10);
              audio.playCollapse();
              onCameraShake?.(0.095);
            }
          }
        }
      } else {
        for (let i = 0; i < this.destructibles.length; i++) {
          const b = this.destructibles[i];
          if (b.state === 'destroyed' || b.state === 'collapsing') continue;
          if (
            center.x >= b.x - b.halfW - radius &&
            center.x <= b.x + b.halfW + radius &&
            center.z >= b.z - b.halfD - radius &&
            center.z <= b.z + b.halfD + radius &&
            center.y <= b.height + radius
          ) {
            if (b.isInstanced) this._promoteInstancedBuilding(b);
            const updated = damageDestructibleProp(b, dmg);
            b.hp = updated.hp;
            b.state = updated.state;
            landedHit = true;
            if (b.state === 'collapsing') {
              if (score) {
                score.destroyed += 1;
                score.mcEarned += Math.round(b.maxHp * 0.25);
              }
              vfx.spawnDebris(new THREE.Vector3(b.x, b.height * 0.65, b.z), 24);
              vfx.spawnDust(new THREE.Vector3(b.x, 0.25, b.z), 10);
              audio.playCollapse();
              onCameraShake?.(0.095);
            }
          }
        }
      }

      if (landedHit) {
        audio.playHitConfirm(isMelee, hitMaterial);
        if (isMelee) {
          onHitstop?.(0.042);
          onCameraShake?.(0.065);
        }
      }
      return landedHit;
    },

    stepTrafficAndCrushedCars(dt, { physics, prevVy, score, onCameraShake } = {}) {
      if (!this.built || !this.arenaGroup?.visible) return;
      if (!this.carInst.bodyMesh || !this.cars.length) return;
      const horzSpeedNow = Math.hypot(physics.vx, physics.vz);
      const mObj = this._tmpCarObj;
      mObj.position.set(0, 0, 0);
      mObj.rotation.set(0, 0, 0);
      mObj.scale.set(1, 1, 1);
      const zeroObj = this._tmpZeroObj;
      zeroObj.scale.set(0, 0, 0);
      zeroObj.updateMatrix();
      let matrixDirty = false;

      for (let i = 0; i < this.cars.length; i++) {
        const c = this.cars[i];
        if (c.state === 'intact') {
          if (c.isMoving) {
            c.t += c.dir * c.speed * dt;
            if (c.t > 68) c.t = -68;
            if (c.t < -68) c.t = 68;
            c.x = c.axis === 'x' ? c.t : c.laneX;
            c.z = c.axis === 'z' ? c.t : c.laneZ;
            mObj.position.set(c.x, 0, c.z);
            mObj.rotation.set(0, c.yaw, 0);
            mObj.scale.set(1, 1, 1);
            mObj.updateMatrix();
            this.carInst.bodyMesh.setMatrixAt(i, mObj.matrix);
            this.carInst.trimMesh.setMatrixAt(i, mObj.matrix);
            this.carInst.lightMesh.setMatrixAt(i, mObj.matrix);
            matrixDirty = true;
          }

          if (
            physics.y <= 0.48 &&
            (horzSpeedNow > 0.75 || prevVy < -1.2) &&
            Math.hypot(physics.x - c.x, physics.z - c.z) <= 0.85
          ) {
            this._tmpVecA.set(physics.x, 0.1, physics.z);
            this._wreckCar(c, this._tmpVecA, Math.max(5.2, horzSpeedNow * 0.95), score);
            onCameraShake?.(0.045);
          }
        } else if (c.state === 'flying') {
          c.vy -= 14.5 * dt;
          c.x += c.vx * dt;
          c.y += c.vy * dt;
          c.z += c.vz * dt;
          c.rx += c.rotVelX * dt;
          c.rz += c.rotVelZ * dt;
          if (c.y <= 0.07) {
            c.y = 0.07;
            if (Math.abs(c.vy) > 1.6) {
              c.vy = -c.vy * 0.32;
              c.vx *= 0.55;
              c.vz *= 0.55;
              c.rotVelX *= 0.45;
              c.rotVelZ *= 0.45;
              vfx.spawnDust(this._tmpOrigin.set(c.x, 0.1, c.z), 4);
            } else {
              c.state = 'wreck';
              c.vx = 0;
              c.vy = 0;
              c.vz = 0;
            }
          }
          mObj.position.set(c.x, c.y, c.z);
          mObj.rotation.set(c.rx, c.ry, c.rz);
          mObj.scale.set(1, 1, 1);
          mObj.updateMatrix();
          this.carInst.bodyMesh.setMatrixAt(i, mObj.matrix);
          this.carInst.trimMesh.setMatrixAt(i, mObj.matrix);
          this.carInst.lightMesh.setMatrixAt(i, zeroObj.matrix);
          matrixDirty = true;
        } else if (c.state === 'wreck') {
          c.smokeTimer += dt;
          if (c.smokeTimer > 0.65 && Math.random() < 0.35) {
            c.smokeTimer = 0;
            vfx.spawnDust(this._tmpOrigin.set(c.x, 0.16, c.z), 1);
          }
        }
      }

      if (matrixDirty) {
        this.carInst.bodyMesh.instanceMatrix.needsUpdate = true;
        this.carInst.trimMesh.instanceMatrix.needsUpdate = true;
        this.carInst.lightMesh.instanceMatrix.needsUpdate = true;
      }
    },

    stepDestructiblesAndDummy(dt, { freezeDummyFire = false, physics, onCameraShake } = {}) {
      if (!this.built || !this.arenaGroup?.visible) return;
      for (const b of this.destructibles) {
        if (b.state === 'damaged' && b.bodyMat) {
          const hpRatio = b.hp / b.maxHp;
          if (hpRatio < 0.65) {
            const scorch = clamp((0.65 - hpRatio) / 0.65, 0, 1);
            const tone = 1 - scorch * 0.42;
            b.bodyMat.color.setRGB(tone, tone * 0.96, tone * 0.94);
            b.dustAccum += dt;
            if (b.dustAccum >= 0.45 - scorch * 0.22) {
              b.dustAccum = 0;
              vfx.spawnDust(
                new THREE.Vector3(
                  b.x + (Math.random() - 0.5) * b.w * 0.6,
                  b.height * (0.35 + Math.random() * 0.45),
                  b.z + (Math.random() - 0.5) * b.d * 0.6,
                ),
                2,
              );
            }
          }
          if (hpRatio < 0.35) {
            b.bodyMat.emissive.set('#ff3a08');
            b.bodyMat.emissiveIntensity = ((0.35 - hpRatio) / 0.35) * 0.55;
          }
        } else if (b.state === 'collapsing' && b.group) {
          b.collapseProgress = Math.min(1, b.collapseProgress + dt * 0.31);
          const p = b.collapseProgress;

          if (p < 0.2) {
            const amp = (1 - p / 0.2) * 0.09 + 0.04;
            b.group.position.set(
              b.x + (Math.random() - 0.5) * amp * 2,
              -b.height * 0.04 * (p / 0.2),
              b.z + (Math.random() - 0.5) * amp * 2,
            );
            b.group.rotation.x = b.collapseDirZ * p * 0.18;
            b.group.rotation.z = b.collapseDirX * p * 0.18;
          } else {
            const fallT = (p - 0.2) / 0.8;
            const easeFall = fallT * fallT * (1.25 - 0.25 * fallT);
            b.group.position.set(
              b.x + b.collapseDirX * fallT * 0.65,
              -b.height * 1.16 * easeFall,
              b.z + b.collapseDirZ * fallT * 0.65,
            );
            b.group.rotation.x = b.collapseDirZ * (0.04 + easeFall * 0.68);
            b.group.rotation.z = b.collapseDirX * (0.04 + easeFall * 0.68);
          }

          b.dustAccum += dt;
          if (b.dustAccum >= 0.11) {
            b.dustAccum = 0;
            vfx.spawnDust(
              new THREE.Vector3(
                b.x + (Math.random() - 0.5) * b.w * 0.9,
                Math.max(0.18, b.height * (1 - p) * 0.55),
                b.z + (Math.random() - 0.5) * b.d * 0.9,
              ),
              4,
            );
          }
          b.boomAccum += dt;
          if (b.boomAccum >= 0.36) {
            b.boomAccum = 0;
            const bPt = new THREE.Vector3(
              b.x + (Math.random() - 0.5) * b.w * 0.7,
              Math.max(0.3, b.height * (1 - p) * 0.45),
              b.z + (Math.random() - 0.5) * b.d * 0.7,
            );
            vfx.spawnDebris(bPt, 6);
            vfx.spawnImpactFlash(bPt);
            onCameraShake?.(0.045);
          }

          if (p >= 1) {
            b.state = 'destroyed';
            b.group.visible = false;
            removeSpatialItem(spatialGrid, b.id);
            vfx.spawnLandingShockRing(new THREE.Vector3(b.x, 0.05, b.z));
            vfx.spawnDust(new THREE.Vector3(b.x, 0.35, b.z), 12);
          }
        }
      }

      if (this.dummy && !this.duelMode) {
        if (this.dummy.hitFlash > 0) {
          this.dummy.hitFlash -= dt;
          this.dummy.armorMat.emissive.set('#ffffff');
          this.dummy.armorMat.emissiveIntensity = 1.6;
        } else {
          this.dummy.armorMat.emissive.set('#000000');
          this.dummy.armorMat.emissiveIntensity = 0;
        }
        if (this.dummy.respawnTimer > 0) {
          this.dummy.respawnTimer -= dt;
          if (this.dummy.respawnTimer <= 0) {
            this.dummy.hp = this.dummy.maxHp;
            this.dummy.partDamage = createPartDamageState({ maxAp: 900 });
            if (this.dummy.armL) this.dummy.armL.visible = true;
            if (this.dummy.armR) this.dummy.armR.visible = true;
            this.dummy.group.visible = true;
          }
        } else if (!freezeDummyFire && physics) {
          const dummyPen = computePartStatusPenalties(this.dummy.partDamage);
          if (!dummyPen.armRDisabled) {
            this.dummyFireTimer -= dt;
            if (this.dummyFireTimer <= 0) {
              const distToPlayer = Math.hypot(physics.x - this.dummy.x, physics.z - this.dummy.z);
              if (distToPlayer > 2.2 && distToPlayer < 46) {
                this._tmpOrigin.set(this.dummy.x, 1.58, this.dummy.z);
                this._tmpTargetPt.set(physics.x, physics.y + 1.35, physics.z);
                this._tmpShotDir.copy(this._tmpTargetPt).sub(this._tmpOrigin).normalize();
                this._tmpOrigin.addScaledVector(this._tmpShotDir, 0.9);
                vfx.spawnEnemyTestBolt(this._tmpOrigin, this._tmpShotDir);
              }
              if (this.dummyBurstRemaining > 0) {
                this.dummyBurstRemaining -= 1;
                this.dummyFireTimer = 0.20;
              } else {
                this.dummyBurstRemaining = 2;
                this.dummyFireTimer = 2.8;
              }
            }
          }
        }
      }
    },
  };

  return manager;
}

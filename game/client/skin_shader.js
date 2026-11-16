/**
 * Procedural CanvasTexture & 5-Slot PBR Material Overrider (Layer 1 Client).
 * Applies 8 tier skins + 5-channel DIY colors onto EF-018 VALIANT without downloading extra textures.
 */
import * as THREE from 'three';
import {
  resolveEffectivePalette,
  getValiantBakedTextureUrls,
  buildValiantControlMaskShaderPatch,
} from '../shared/skins.js?v=20261116_t75e';

const texCache = new Map();
const MASK_SHADER_PATCH = buildValiantControlMaskShaderPatch();

const valiantBakedState = {
  started: false,
  normalTex: null,
  maskTex: null,
  patchedMats: new Set(),
};

function syncMatBakedUniforms(mat, zPal) {
  const uniforms = mat?.userData?.valiantMaskUniforms;
  if (!uniforms) return;
  const finish = zPal?.shaderFinish || 'matte';
  uniforms.uFinishMode.value = finish === 'weathered' ? 1.0 : finish === 'chrome' || finish === 'glossy' ? 2.0 : 0.0;
  uniforms.uWearColor.value.set(zPal?.frame || '#2b323c');
  if (valiantBakedState.maskTex) {
    uniforms.uValiantMask.value = valiantBakedState.maskTex;
    uniforms.uHasValiantMask.value = 1.0;
  }
  if (valiantBakedState.normalTex && mat.normalMap !== valiantBakedState.normalTex) {
    mat.normalMap = valiantBakedState.normalTex;
    mat.normalScale?.set(0.85, 0.85);
    mat.needsUpdate = true;
  }
}

function ensureValiantBakedTexturesLoaded() {
  if (valiantBakedState.started || typeof document === 'undefined') return;
  valiantBakedState.started = true;
  const loader = new THREE.TextureLoader();
  const { normalUrl, maskUrl } = getValiantBakedTextureUrls();

  const onTexReady = () => {
    for (const mat of valiantBakedState.patchedMats) {
      syncMatBakedUniforms(mat, mat.userData?.lastZonePalette);
    }
  };

  loader.load(
    normalUrl,
    (tex) => {
      tex.flipY = false;
      tex.colorSpace = THREE.NoColorSpace;
      valiantBakedState.normalTex = tex;
      onTexReady();
    },
    undefined,
    () => {},
  );
  loader.load(
    maskUrl,
    (tex) => {
      tex.flipY = false;
      tex.colorSpace = THREE.NoColorSpace;
      valiantBakedState.maskTex = tex;
      onTexReady();
    },
    undefined,
    () => {},
  );
}

function attachValiantControlMaskShader(mat, zPal) {
  if (!mat) return;
  mat.userData.lastZonePalette = zPal;
  if (!mat.userData.valiantMaskUniforms) {
    mat.userData.valiantMaskUniforms = {
      uValiantMask: { value: valiantBakedState.maskTex },
      uHasValiantMask: { value: valiantBakedState.maskTex ? 1.0 : 0.0 },
      uFinishMode: { value: 0.0 },
      uWearColor: { value: new THREE.Color(zPal?.frame || '#2b323c') },
    };
    mat.customProgramCacheKey = () => 'valiant_v3_mask';
    mat.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, mat.userData.valiantMaskUniforms);
      shader.vertexShader = MASK_SHADER_PATCH.vertDecl + shader.vertexShader;
      if (shader.vertexShader.includes('#include <uv_vertex>')) {
        shader.vertexShader = shader.vertexShader.replace(
          '#include <uv_vertex>',
          `#include <uv_vertex>\n${MASK_SHADER_PATCH.vertUvAssign}`,
        );
      }
      shader.fragmentShader = MASK_SHADER_PATCH.uniformDecl + shader.fragmentShader;
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <map_fragment>', `#include <map_fragment>\n${MASK_SHADER_PATCH.fragDiffuse}`)
        .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>\n${MASK_SHADER_PATCH.fragRoughness}`)
        .replace('#include <metalnessmap_fragment>', `#include <metalnessmap_fragment>\n${MASK_SHADER_PATCH.fragMetalness}`);
    };
    valiantBakedState.patchedMats.add(mat);
    mat.needsUpdate = true;
  }
  ensureValiantBakedTexturesLoaded();
  syncMatBakedUniforms(mat, zPal);
}

/**
 * Resolve anatomical / weapon / shield zone for a mesh by walking child-most ancestor tags first.
 */
export function resolveMeshZoneId(obj) {
  let p = obj;
  while (p) {
    if (p.userData?.paintZone) return p.userData.paintZone;
    const name = p.name || '';
    if (name.startsWith('Shield_') || name.includes('CompositeShield') || name.includes('Shield')) {
      return 'shields';
    }
    if (name.startsWith('Wpn_') || name.includes('Pistol') || name.includes('Saber') || name === 'CustomPlasmaSaber') {
      return 'weapons';
    }
    if (name === 'Head' || name === 'Mesh_Head') return 'head';
    if (name === 'ShoulderPad_L' || name === 'Arm_Upper_L' || name === 'Arm_Lower_L' || name === 'Hand_L') return 'arm_l';
    if (name === 'ShoulderPad_R' || name === 'Arm_Upper_R' || name === 'Arm_Lower_R' || name === 'Hand_R') return 'arm_r';
    if (name.startsWith('Leg_') || name.startsWith('Foot_')) return 'legs';
    if (name === 'Backpack' || name.startsWith('Wing_')) return 'backpack';
    if (name === 'Torso' || name === 'Pelvis' || name.startsWith('FrontSkirt_') || name === 'Mesh_Torso') return 'torso';
    p = p.parent;
  }
  return 'torso';
}

function makeProceduralArmorTexture(palette) {
  const key = `${palette.shaderFinish}|${palette.primary}|${palette.secondary}|${palette.frame}`;
  if (texCache.has(key)) return texCache.get(key);

  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = palette.primary;
  ctx.fillRect(0, 0, size, size);

  const finish = palette.shaderFinish;
  if (finish === 'carbon') {
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    for (let y = 0; y < size; y += 8) {
      for (let x = 0; x < size; x += 8) {
        if (((x + y) / 8) % 2 === 0) {
          ctx.fillRect(x, y, 4, 8);
        } else {
          ctx.fillRect(x, y, 8, 4);
        }
      }
    }
  } else if (finish === 'hazard') {
    ctx.fillStyle = '#181b20';
    for (let i = -size; i < size * 2; i += 36) {
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i + 16, 0);
      ctx.lineTo(i + 16 - size * 0.45, size);
      ctx.lineTo(i - size * 0.45, size);
      ctx.closePath();
      ctx.fill();
    }
  } else if (finish === 'digital_camo') {
    const colors = [palette.primary, palette.secondary, palette.frame, 'rgba(255,255,255,0.22)'];
    let seed = 1337;
    const rand = () => {
      seed = (seed * 16807) % 2147483647;
      return (seed - 1) / 2147483646;
    };
    for (let i = 0; i < 64; i++) {
      ctx.fillStyle = colors[Math.floor(rand() * colors.length)];
      const w = 16 + Math.floor(rand() * 3) * 16;
      const h = 16 + Math.floor(rand() * 2) * 16;
      ctx.fillRect(Math.floor(rand() * 14) * 16, Math.floor(rand() * 14) * 16, w, h);
    }
  } else if (finish === 'weathered') {
    ctx.strokeStyle = 'rgba(25,20,18,0.45)';
    ctx.lineWidth = 2;
    for (let i = 0; i < 28; i++) {
      const x = (i * 53) % size;
      const y = (i * 97) % size;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + 22, y + ((i % 3) - 1) * 9);
      ctx.stroke();
    }
    ctx.fillStyle = 'rgba(230,220,210,0.18)';
    for (let i = 0; i < 16; i++) {
      ctx.fillRect((i * 71) % size, (i * 41) % size, 12, 2);
    }
  } else if (finish === 'chrome' || finish === 'glossy') {
    const grad = ctx.createLinearGradient(0, 0, size, size);
    grad.addColorStop(0, 'rgba(255,255,255,0.16)');
    grad.addColorStop(0.5, palette.primary);
    grad.addColorStop(1, 'rgba(0,0,0,0.12)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);
  } else {
    // Clean machined mecha panel plates with bevel grooves, micro rivets & subtle tone panels
    ctx.fillStyle = 'rgba(255,255,255,0.04)';
    ctx.fillRect(0, 0, size * 0.5, size * 0.5);
    ctx.fillStyle = 'rgba(0,0,0,0.045)';
    ctx.fillRect(size * 0.5, size * 0.5, size * 0.5, size * 0.5);

    ctx.strokeStyle = 'rgba(12,20,32,0.22)';
    ctx.lineWidth = 2;
    ctx.strokeRect(4, 4, size - 8, size - 8);
    ctx.beginPath();
    ctx.moveTo(0, size * 0.5);
    ctx.lineTo(size, size * 0.5);
    ctx.moveTo(size * 0.5, 0);
    ctx.lineTo(size * 0.5, size);
    ctx.moveTo(size * 0.25, size * 0.5);
    ctx.lineTo(size * 0.25, size);
    ctx.stroke();

    // Fine chamfer highlight beside main seam
    ctx.strokeStyle = 'rgba(255,255,255,0.14)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(2, size * 0.5 + 2);
    ctx.lineTo(size - 2, size * 0.5 + 2);
    ctx.moveTo(size * 0.5 + 2, 2);
    ctx.lineTo(size * 0.5 + 2, size - 2);
    ctx.stroke();
  }

  // Subtle corner rivet micro-dots across all finishes for crisp 2.0 scale readability
  ctx.fillStyle = finish === 'weathered' ? 'rgba(20,16,14,0.34)' : 'rgba(15,24,36,0.22)';
  for (const rx of [12, size * 0.5 - 12, size * 0.5 + 12, size - 12]) {
    for (const ry of [12, size * 0.5 - 12, size * 0.5 + 12, size - 12]) {
      ctx.fillRect(rx - 1, ry - 1, 2.5, 2.5);
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(2, 2);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  texCache.set(key, tex);
  return tex;
}

/**
 * Apply resolved skin palette + procedural finish onto loaded VALIANT meshes and materials.
 */
export function applyMechaSkin(mechaRoot, skinId = 'SKIN-01', customPalette = null, extraRefs = null) {
  const palette = resolveEffectivePalette(skinId, customPalette, 'all');
  const zonePaletteCache = new Map();
  const getZonePal = (zid) => {
    if (!zonePaletteCache.has(zid)) {
      zonePaletteCache.set(zid, resolveEffectivePalette(skinId, customPalette, zid));
    }
    return zonePaletteCache.get(zid);
  };

  const hasBakedMasks = extraRefs?.hasBakedMasks ?? mechaRoot?.userData?.hasBakedMasks ?? true;

  mechaRoot.traverse((obj) => {
    if (!obj.isMesh || !obj.material) return;
    if (obj.material.isShaderMaterial) return;

    if (!obj.userData._zoneMatCloned) {
      obj.material = Array.isArray(obj.material)
        ? obj.material.map((m) => (m?.isShaderMaterial ? m : m.clone()))
        : obj.material.clone();
      obj.userData._zoneMatCloned = true;
    }

    const zoneId = resolveMeshZoneId(obj);
    const zPal = getZonePal(zoneId);
    const armorTex = makeProceduralArmorTexture(zPal);
    const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
    const isSaberBlade = obj.name.includes('HyperBeamSaber_Blade');
    const isValiantBakedMesh =
      hasBakedMasks &&
      (obj.name.startsWith('Mesh_') || obj.name.startsWith('Hardpoint_Cap_')) &&
      Boolean(obj.geometry?.attributes?.uv);

    for (const mat of mats) {
      if (!mat || mat.isShaderMaterial) continue;
      const mname = mat.name || obj.userData?.paintRole || '';
      if (!isValiantBakedMesh && mat.userData?.valiantMaskUniforms) {
        mat.userData.valiantMaskUniforms.uHasValiantMask.value = 0.0;
        mat.normalMap = null;
      }
      if (isSaberBlade) {
        const wpnPal = getZonePal('weapons');
        mat.color?.set('#ffffff');
        mat.emissive?.set(wpnPal.saber);
        mat.emissiveIntensity = 3.8;
      } else if (mname === 'Mat_Armor_Primary') {
        mat.color?.set('#ffffff');
        mat.map = armorTex;
        mat.metalness = zPal.metallic;
        mat.roughness = zPal.roughness;
        if (isValiantBakedMesh) attachValiantControlMaskShader(mat, zPal);
      } else if (mname === 'Mat_Armor_Secondary') {
        mat.color?.set(zPal.secondary);
        mat.map = null;
        mat.metalness = Math.min(1, zPal.metallic + 0.04);
        mat.roughness = Math.max(0.08, zPal.roughness - 0.04);
        if (isValiantBakedMesh) attachValiantControlMaskShader(mat, zPal);
      } else if (mname === 'Mat_Frame_DarkMetal' || mname === 'Mat_Alu_Brushed') {
        if (mname === 'Mat_Frame_DarkMetal') {
          mat.color?.set(zPal.frame);
        }
        mat.metalness = 0.86;
        mat.roughness = 0.42;
        if (isValiantBakedMesh) attachValiantControlMaskShader(mat, zPal);
      } else if (mname === 'Mat_Glow_Sensor') {
        mat.color?.set(zPal.sensor);
        mat.emissive?.set(zPal.sensor);
        mat.emissiveIntensity = 3.1;
      } else if (mname === 'Mat_Glow_Thruster') {
        const bpPal = getZonePal(zoneId === 'backpack' ? 'backpack' : zoneId);
        const isDefaultStd = bpPal.id === 'SKIN-01' && bpPal.thruster === '#22aaff';
        mat.color?.set(isDefaultStd ? '#ff9b42' : bpPal.thruster);
        mat.emissive?.set(isDefaultStd ? '#ff5510' : bpPal.thruster);
        mat.emissiveIntensity = 2.1;
      }
      mat.needsUpdate = true;
    }
  });

  const wpnPal = getZonePal('weapons');
  const torsoPal = getZonePal('torso');
  if (extraRefs) {
    if (extraRefs.frameMat) extraRefs.frameMat.color?.set(torsoPal.secondary);
    if (extraRefs.hudMat) {
      extraRefs.hudMat.color?.set(torsoPal.sensor);
      extraRefs.hudMat.emissive?.set(torsoPal.sensor);
    }
    if (extraRefs.saberShaderMat?.uniforms?.uSaberColor) {
      extraRefs.saberShaderMat.uniforms.uSaberColor.value.set(wpnPal.saber);
    }
    if (extraRefs.saberAuraMat) {
      if (extraRefs.saberAuraMat.uniforms?.uSaberColor) {
        extraRefs.saberAuraMat.uniforms.uSaberColor.value.set(wpnPal.saber);
      } else {
        extraRefs.saberAuraMat.color?.set(wpnPal.saber);
        extraRefs.saberAuraMat.emissive?.set(wpnPal.saber);
      }
    }
    if (extraRefs.saberLight) {
      extraRefs.saberLight.color?.set(wpnPal.saber);
    }
  }

  return palette;
}

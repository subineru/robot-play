/**
 * Procedural CanvasTexture & 5-Slot PBR Material Overrider (Layer 1 Client).
 * Applies 8 tier skins + 5-channel DIY colors onto EF-018 VALIANT without downloading extra textures.
 */
import * as THREE from 'three';
import { resolveEffectivePalette } from '../shared/skins.js';

const texCache = new Map();

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
  const palette = resolveEffectivePalette(skinId, customPalette);
  const armorTex = makeProceduralArmorTexture(palette);

  const visited = new Set();
  mechaRoot.traverse((obj) => {
    if (!obj.isMesh || !obj.material) return;
    const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
    const isSaberBlade = obj.name.includes('HyperBeamSaber_Blade');

    for (const mat of mats) {
      if (visited.has(mat)) continue;
      visited.add(mat);

      const mname = mat.name || '';
      if (isSaberBlade) {
        // White-hot plasma core inside GLB blade mesh so it glows vividly under HDR bloom
        mat.color?.set('#ffffff');
        mat.emissive?.set(palette.saber);
        mat.emissiveIntensity = 3.8;
      } else if (mname === 'Mat_Armor_Primary') {
        mat.color?.set('#ffffff');
        mat.map = armorTex;
        mat.metalness = palette.metallic;
        mat.roughness = palette.roughness;
      } else if (mname === 'Mat_Armor_Secondary') {
        mat.color?.set(palette.secondary);
        mat.map = null;
        mat.metalness = Math.min(1, palette.metallic + 0.04);
        mat.roughness = Math.max(0.1, palette.roughness - 0.04);
      } else if (mname === 'Mat_Frame_DarkMetal' || mname === 'Mat_Alu_Brushed') {
        if (mname === 'Mat_Frame_DarkMetal') {
          mat.color?.set(palette.frame);
        }
        mat.metalness = 0.86;
        mat.roughness = 0.42;
      } else if (mname === 'Mat_Glow_Sensor') {
        mat.color?.set(palette.sensor);
        mat.emissive?.set(palette.sensor);
        mat.emissiveIntensity = 3.1;
      } else if (mname === 'Mat_Glow_Thruster') {
        // Fixed 1000 deg C combustion throat glow inside nozzle cones (independent of paint skin)
        mat.color?.set('#ff9b42');
        mat.emissive?.set('#ff5510');
        mat.emissiveIntensity = 2.1;
      }
      mat.needsUpdate = true;
    }
  });

  if (extraRefs) {
    if (extraRefs.frameMat) extraRefs.frameMat.color?.set(palette.secondary);
    if (extraRefs.hudMat) {
      extraRefs.hudMat.color?.set(palette.sensor);
      extraRefs.hudMat.emissive?.set(palette.sensor);
    }
    if (extraRefs.saberShaderMat?.uniforms?.uSaberColor) {
      extraRefs.saberShaderMat.uniforms.uSaberColor.value.set(palette.saber);
    }
    if (extraRefs.saberAuraMat) {
      if (extraRefs.saberAuraMat.uniforms?.uSaberColor) {
        extraRefs.saberAuraMat.uniforms.uSaberColor.value.set(palette.saber);
      } else {
        extraRefs.saberAuraMat.color?.set(palette.saber);
        extraRefs.saberAuraMat.emissive?.set(palette.saber);
      }
    }
    if (extraRefs.saberLight) {
      extraRefs.saberLight.color?.set(palette.saber);
    }
  }

  return palette;
}

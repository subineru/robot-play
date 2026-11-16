# PLAY_ROBOTS 3D Mecha Asset Contract (`[M2.3, M6.2]`)

> **Version:** `v2.1.0` (SSOT: [MASTER_SPEC.md](../docs/superpowers/specs/MASTER_SPEC.md))  
> **Scope:** Runtime `.glb` & Socket Equipment Plugin contract under `gemini/assets/` (dev sources isolated in `gemini/art_source/`).

---

## 1. Model Inventory & Option A Runtime Directory Naming

| Category | Code Name / Package | File Name (`gemini/assets/...`) | Height (`Y`) | Status |
| :--- | :--- | :--- | :---: | :--- |
| Mecha (`allrounder` Mk.I) | `EF-018 VALIANT Mk.I` | `mechas/ef018_valiant/valiant_mk1.glb` | `~2.68 m` | **Gen-1 Prototype** |
| Mecha (`allrounder` II) | `EF-018 VALIANT II` | `mechas/ef018_valiant/valiant_mk2.glb` + `_normal.png` / `_mask.png` | `~2.68 m` | **Gen-2 Cycles Baked Hero** |
| Mecha (`speed`) | `X-09 RAPTOR` | `mechas/x09_raptor/raptor.glb` | `~2.52 m` | Planned (`Task 8A`) |
| Mecha (`heavy`) | `TITAN-02 BRAWLER` | `mechas/titan02_brawler/brawler.glb` | `~2.80 m` | Planned (`Task 8C`) |
| Mecha (`technical`) | `ARC-04 STRIDER` | `mechas/arc04_strider/strider.glb` | `~2.65 m` | Planned (`Task 9A`) |
| Mecha (`magic`) | `PSI-00 MIRAGE` | `mechas/psi00_mirage/mirage.glb` | `~2.70 m` | Planned (`Task 9B`) |
| Equipment Plugin | 4 Shields Pack | `equipment/mecha_shields_pack.glb` | `—` | **Verified** |
| Equipment Plugin | Handheld Weapons Pack | `equipment/weapons_pack.glb` | `—` | **Task 7.3B Standard** |

---

## 2. Coordinate System & Scale Rules

- **Export Format:** Binary glTF 2.0 (`.glb`), `Y-up` enabled on export.
- **Scale:** `1.0 unit = 1.0 meter` (`2.4m ~ 2.8m` gameplay scale; Hangar displays at `2.2x` visual scale alongside `1.75m` pilot eye height).
- **Ground Alignment:** Bottom of `Foot_L` and `Foot_R` treads must rest at ground plane `0.0` (no sinking below ground or floating).
- **Facing Direction:** Model forward faces **`+Z`** in Three.js (`-Y` in Blender prior to glTF Y-up export).
- **Polygon Budget:** Total triangles per mecha `<= 30,000 tris` (target `8,000 ~ 22,000 tris` for smooth 60fps WebGL multi-mecha battles).

---

## 3. Rigid-Body 25-Node Skeletal Hierarchy

Armor plates MUST attach rigidly to bones (`parent_type = 'BONE'`) with **zero soft-skin vertex weights** so joints articulate mechanically without rubbery bending:

```text
Root
└── Pelvis
    ├── Torso
    │   ├── Head
    │   ├── ShoulderPad_L ──► Arm_Upper_L ──► Arm_Lower_L ──► Hand_L ──► WeaponMount_L
    │   ├── ShoulderPad_R ──► Arm_Upper_R ──► Arm_Lower_R ──► Hand_R ──► WeaponMount_R
    │   └── Backpack
    │       ├── Wing_L1
    │       ├── Wing_L2
    │       ├── Wing_R1
    │       └── Wing_R2
    ├── Leg_Upper_L ──► Leg_Lower_L ──► Foot_L
    └── Leg_Upper_R ──► Leg_Lower_R ──► Foot_R
```

All 25 node names MUST appear verbatim in the exported glTF `nodes` table:
`Root`, `Pelvis`, `Torso`, `Head`, `ShoulderPad_L`, `ShoulderPad_R`, `Arm_Upper_L`, `Arm_Upper_R`, `Arm_Lower_L`, `Arm_Lower_R`, `Hand_L`, `Hand_R`, `WeaponMount_L`, `WeaponMount_R`, `Backpack`, `Wing_L1`, `Wing_L2`, `Wing_R1`, `Wing_R2`, `Leg_Upper_L`, `Leg_Upper_R`, `Leg_Lower_L`, `Leg_Lower_R`, `Foot_L`, `Foot_R`.

---

## 4. Standard 5 PBR Material Slots

Every mecha `.glb` MUST use exact material names bound to `Principled BSDF` nodes so the Three.js Paint Shop (`[M5.3]`) and Donate trims (`[M5.2]`) can swap colors dynamically at runtime:

1. `Mat_Armor_Primary` — Main armor plates (Metallic ~`0.65`, Roughness ~`0.32`)
2. `Mat_Armor_Secondary` — Secondary trim / shoulders / skirts (Metallic ~`0.72`, Roughness ~`0.28`)
3. `Mat_Frame_DarkMetal` — Inner skeleton, joints, pistons (Metallic ~`0.92`, Roughness ~`0.42`)
4. `Mat_Glow_Sensor` — Visor, chest reactor, optical sensors (Emissive cyan/emerald)
5. `Mat_Glow_Thruster` — Backpack & calf vernier thruster interiors (Emissive plasma orange / electric blue)

---

## 5. Standardized Equipment Plugin & Socket Anchors (`Task 7.3B`)

Every mecha `.glb` exposes standardized empty/socket attachment nodes so modular weapons, shields, back pods, and stow racks plug in directly at `(0,0,0)` with zero hardcoded offsets:

| Socket Name | Parent Bone | Local Frame Orientation (glTF `Y-up`) | Target Plugin / Purpose |
| :--- | :--- | :--- | :--- |
| `Socket_Hand_L` / `Socket_Hand_R` | `Hand_L` / `Hand_R` | Origin at palm grip; `+Z` forward (gun barrel), `+Y` saber axis | `Wpn_BeamPistol`, `Wpn_HyperBeamSaber_Hilt` |
| `Socket_Forearm_L` / `Socket_Forearm_R` | `Arm_Lower_L` / `Arm_Lower_R` | Origin at outer gauntlet mount; `+Z` outward guard normal | `EF-SH01`, `EF-SH03`, `EF-HS07`, `EF-SH09` |
| `Socket_L_Back` / `Socket_R_Back` | `ShoulderPad_L` / `ShoulderPad_R` | Origin atop shoulder hardpoint flange; `-Z` / forward aim axis | `EF-RL08`, `EF-HC04`, `EF-BP03`, `EF-TB04` (+ hides `Hardpoint_Cap_L/R`) |
| `Socket_Stow_Backpack_Shield` | `Backpack` | Rear backpack rack (`+Z` outward normal) | Stowed shield |
| `Socket_Stow_Backpack_Saber` | `Backpack` | Left-shoulder diagonal rack (`+Y` hilt axis) | Stowed saber hilt |
| `Socket_Stow_Hip_Pistol` | `Pelvis` | Right hip holster bracket | Stowed beam pistol |

### Weapon Plugin Self-Origin & Blade Extension Contract
- Every handheld weapon plugin (`Wpn_HyperBeamSaber_Hilt`, `Wpn_BeamPistol`) MUST keep its own local `(0, 0, 0)` origin at the grip center (NOT world-flattened).
- `Wpn_HyperBeamSaber_Hilt` extends along **`+Y`** and contains `BladeEmitter_Origin` at the emitter collar mouth (`+Y` pointing out), with `Wpn_HyperBeamSaber_Blade` parented directly under `BladeEmitter_Origin` (`Y: 0 -> bladeLen`) so beam plasma and ignite extension radiate natively from the blade itself.
- `Wpn_BeamPistol` barrel points forward with `WeaponMuzzle_Origin` at the barrel tip.

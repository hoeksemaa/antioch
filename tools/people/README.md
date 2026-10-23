# People (offline asset build)

Node scripts that build `scene/public/people/` from three free CC0 packs by Quaternius (download them from itch.io: Universal Base Characters, Modular Character Outfits - Fantasy, Universal Animation Library). The site does not run these scripts.

```
npm install
# one GLB per person: outfit + base head (+ hair), bound to the outfit's skeleton
node build-person.mjs <Outfits/Male_Peasant.gltf> <Godot - UE/Superhero_Male_FullBody.gltf> <Hair_SimpleParted.gltf> ../../scene/public/people/man.glb
node build-person.mjs <Outfits/Female_Peasant.gltf> <Godot - UE/Superhero_Female_FullBody.gltf> <Hair_Buns.gltf> ../../scene/public/people/woman.glb
node build-person.mjs <Outfits/Male_Ranger.gltf> <Godot - UE/Superhero_Male_FullBody.gltf> - ../../scene/public/people/hooded.glb
# the four clips, rotation tracks only (plus root and pelvis translation)
node build-anims.mjs <UAL1_Standard.glb> <UAL1_Standard_RM.glb> ../../scene/public/people/moves.glb Walk_Loop Jog_Fwd_Loop Idle_Loop Crouch_Idle_Loop
```

- The base glTF names `T_Hair_1_Normal_png.png` and `T_Eye_Normal_png.png`; copy `T_Hair_1_Normal.png` and `T_Eye_Normal.png` to those names first.
- `build-person.mjs` keeps only the head and neck of the base body (the outfit covers the rest) and cuts textures to 512 px WebP.
- `build-anims.mjs` also prints each clip's root-motion speed from the `_RM` file.

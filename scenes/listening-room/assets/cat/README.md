# Shop kitten

Source: [Cute Pets FREE Sample by Vuena / Popyca Studio](https://vuena.itch.io/blocky-pets-free), v3.1.
Licence: CC0 1.0; see LICENSE.txt. This is the free cat sample, not the paid pack.

`animal_cat.glb` is the downloaded original, including the editable skeleton and animation clips. `cat-rig.js` contains the mobile LOD (2,452 triangles, 19 bones), a 512px albedo and the nine shop-relevant source clips. Rebuild it with:

```sh
python3 tools/prepare_shop_cat.py scenes/listening-room/assets/cat/animal_cat.glb
```

For the offline shop, the runtime preserves the original skinning and bone tracks, interpolates between sampled frames, cross-fades activity changes and leaves world movement/jump height to the existing collision-aware route. The material is matte and lightly tinted to match the room. No online model or texture request is made.

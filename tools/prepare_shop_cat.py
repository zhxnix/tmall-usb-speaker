"""Prepare Vuena's CC0 rigged cat for the offline Three.js shop (no device changes).

Input: downloaded animal_cat.glb. Output: mobile LOD, original skeleton/clips,
512px embedded albedo and licence/source files in the scene's assets/cat/.
"""
from pathlib import Path
import argparse
import base64
import io
import json
import struct

from PIL import Image


ROOT = Path(__file__).resolve().parent.parent
DESTINATION = ROOT / "scenes/listening-room/assets/cat"


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path)
    args = parser.parse_args()
    raw = args.source.read_bytes()
    json_size = struct.unpack_from("<I", raw, 12)[0]
    document = json.loads(raw[20:20 + json_size])
    binary = raw[28 + json_size:]
    used = {}
    sizes = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4, "MAT4": 16}
    types = {5121: ("Uint8Array", 1), 5123: ("Uint16Array", 2), 5126: ("Float32Array", 4)}

    def accessor(index):
        if str(index) in used:
            return index
        source = document["accessors"][index]
        view = document["bufferViews"][source["bufferView"]]
        name, width = types[source["componentType"]]
        item_size = sizes[source["type"]]
        element_size = item_size * width
        offset = view.get("byteOffset", 0) + source.get("byteOffset", 0)
        stride = view.get("byteStride", element_size)
        packed = b"".join(binary[offset + i * stride:offset + i * stride + element_size]
                          for i in range(source["count"]))
        used[str(index)] = {"type": name, "itemSize": item_size,
                            "data": base64.b64encode(packed).decode("ascii")}
        return index

    primitive = document["meshes"][1]["primitives"][0]
    attributes = {key: accessor(index) for key, index in primitive["attributes"].items()}
    indices = accessor(primitive["indices"])
    skin = dict(document["skins"][0])
    accessor(skin["inverseBindMatrices"])
    clips = []
    for animation in document["animations"]:
        if animation["name"] not in ("idle", "idle_alt", "walk", "run", "jump", "eat", "sit", "sleep", "call"):
            continue
        channels = []
        for channel in animation["channels"]:
            sample = animation["samplers"][channel["sampler"]]
            channels.append({**channel["target"], "input": accessor(sample["input"]),
                             "output": accessor(sample["output"])})
        clips.append({"name": animation["name"], "channels": channels})
    image_view = document["bufferViews"][document["images"][0]["bufferView"]]
    offset = image_view.get("byteOffset", 0)
    image = Image.open(io.BytesIO(binary[offset:offset + image_view["byteLength"]])).convert("RGB")
    image.thumbnail((512, 512), Image.Resampling.LANCZOS)
    output_image = io.BytesIO()
    image.save(output_image, "PNG", optimize=True)
    data = {"nodes": document["nodes"], "skin": skin, "attributes": attributes,
            "indices": indices, "accessors": used, "animations": clips,
            "texture": "data:image/png;base64," + base64.b64encode(output_image.getvalue()).decode("ascii"),
            "source": "https://vuena.itch.io/blocky-pets-free", "license": "CC0-1.0",
            "triangles": document["accessors"][indices]["count"] // 3}
    DESTINATION.mkdir(parents=True, exist_ok=True)
    (DESTINATION / "cat-rig.js").write_text(
        "/* Vuena / Popyca Studio, Cute Pets free sample v3.1, CC0-1.0. Mobile LOD. */\n"
        "window.SHOP_CAT_ASSET=" + json.dumps(data, separators=(",", ":")) + ";\n")
    licence = args.source.parent / "LICENSE.txt"
    if not licence.exists():
        licence = args.source.parent.parent / "LICENSE.txt"
    (DESTINATION / "LICENSE.txt").write_bytes(licence.read_bytes())
    print(f"Prepared {data['triangles']} triangles, {len(skin['joints'])} bones, {len(clips)} clips.")


if __name__ == "__main__":
    main()

"""Bundle the local 3D scene into one offline HTML file; no device changes."""
from pathlib import Path
import base64
import re
import argparse
import json


ROOT = Path(__file__).resolve().parent


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output-name", default="listening-room.html")
    args = parser.parse_args()
    if Path(args.output_name).name != args.output_name or not args.output_name.endswith(".html"):
        parser.error("output-name must be an HTML filename")
    source = (ROOT / "index.html").read_text(encoding="utf-8")
    # The imported customers stay offline too. Only the current guest is decoded
    # into a live rig; the rest remain data until the preceding guest has left.
    models = {
        path.parent.name: "data:model/gltf-binary;base64," +
        base64.b64encode(path.read_bytes()).decode("ascii")
        for path in sorted((ROOT / "assets/candidates").glob("*/shop.glb"))
    }
    source = source.replace('<script src="customer-catalog.js"></script>',
                            '<script>window.SHOP_CUSTOMER_MODELS=' + json.dumps(models) +
                            ';</script>\n<script src="customer-catalog.js"></script>')
    stylesheet = (ROOT / "style.css").read_text(encoding="utf-8")
    source = source.replace('<link rel="stylesheet" href="style.css">',
                            "<style>\n" + stylesheet + "\n</style>")
    def inline_script(match):
        path = ROOT / match.group(1)
        code = path.read_text(encoding="utf-8").replace("</script", "<\\/script")
        return "<script>\n" + code + "\n</script>"

    source = re.sub(r'<script src="([^\"]+)"></script>', inline_script, source)
    output = ROOT / "output" / args.output_name
    output.parent.mkdir(exist_ok=True)
    output.write_text(source, encoding="utf-8")
    print(f"Created {output} ({output.stat().st_size:,} bytes)")


if __name__ == "__main__":
    main()

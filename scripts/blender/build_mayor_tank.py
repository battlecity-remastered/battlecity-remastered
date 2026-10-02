from pathlib import Path
source = Path(__file__).with_name("build_demo_assets.py")
namespace = {"__file__": str(source)}
exec(compile(source.read_text().split("\nbuild_tank()\n")[0], str(source), "exec"), namespace)
namespace["build_tank"](mayor=True)

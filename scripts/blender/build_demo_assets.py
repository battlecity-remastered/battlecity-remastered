import bpy
import math
import os
from mathutils import Vector

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
OUTPUT = os.path.join(ROOT, "apps", "client-ts", "public", "assets", "models")
os.makedirs(OUTPUT, exist_ok=True)
SOURCE = os.path.join(ROOT, "scripts", "blender", "source")
os.makedirs(SOURCE, exist_ok=True)
bpy.context.preferences.filepaths.save_version = 0


def material(name, color, metallic=0.0, roughness=0.7, emission=None):
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = (*color, 1.0)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = (*color, 1.0)
    metallic_input = bsdf.inputs.get("Metallic IOR Level") or bsdf.inputs.get("Metallic")
    if metallic_input:
        metallic_input.default_value = metallic
    bsdf.inputs["Roughness"].default_value = roughness
    if emission:
        bsdf.inputs["Emission Color"].default_value = (*emission, 1.0)
        bsdf.inputs["Emission Strength"].default_value = 2.5
    return mat


OLIVE = material("DX teal armour", (0.035, 0.16, 0.18), 0.48, 0.34)
OLIVE_LIGHT = material("DX cyan armour", (0.035, 0.19, 0.20), 0.62, 0.38)
RUBBER = material("Track rubber", (0.025, 0.035, 0.028), 0.05, 0.9)
STEEL = material("Brushed steel", (0.31, 0.37, 0.33), 0.68, 0.3)
GOLD = material("Command gold", (0.82, 0.48, 0.09), 0.48, 0.3)
CONCRETE = material("DX chrome", (0.42, 0.47, 0.50), 0.85, 0.26)
PANELS = material("DX dark machinery", (0.025, 0.045, 0.05), 0.62, 0.26)
GLASS = material("Command glow", (0.08, 0.55, 0.72), 0.18, 0.18, (0.02, 0.30, 0.48))
RED = material("Warning red", (0.65, 0.035, 0.015), 0.2, 0.35, (0.7, 0.01, 0.0))
PAINT_RED = material("Red apron paint", (0.48, 0.025, 0.012), 0.0, 0.85)
PAINT_BLACK = material("Lettering charcoal", (0.012, 0.016, 0.018), 0.0, 0.86)
APRON = material("Pale stone apron", (0.38, 0.40, 0.37), 0.0, 0.9)
LAMP = material("Amber circular lamps", (0.95, 0.24, 0.012), 0.15, 0.3, (0.72, 0.13, 0.002))
SEAMS = material("Armour panel joints", (0.08, 0.095, 0.10), 0.7, 0.46)
CORE = material("Entrance energy core", (0.005, 0.045, 0.06), 0.25, 0.3, (0.01, 0.32, 0.55))
CORE.node_tree.nodes.get("Principled BSDF").inputs["Emission Strength"].default_value = 0.9
FURNACE = material("Factory furnace glow", (0.055, 0.018, 0.004), 0.2, 0.45, (0.75, 0.12, 0.012))
REACTOR = material("Research reactor glow", (0.012, 0.18, 0.23), 0.28, 0.25, (0.025, 0.36, 0.7))
REACTOR.node_tree.nodes.get("Principled BSDF").inputs["Emission Strength"].default_value = 1.1
DISPLAY = material("Research display glow", (0.002, 0.012, 0.018), 0.05, 0.36, (0.015, 0.35, 0.52))
ORB_SHELL = material("Orb plasma shell", (0.025, 0.014, 0.095), 0.55, 0.19, (0.08, 0.025, 0.30))
ORB_SHELL.node_tree.nodes.get("Principled BSDF").inputs["Emission Strength"].default_value = 1.1
ORB_GLOW = material("Orb containment glow", (0.04, 0.06, 0.25), 0.25, 0.2, (0.16, 0.04, 0.68))
ORB_TRACERY = material("Orb cyan filament glow", (0.025, 0.17, 0.32), 0.25, 0.18, (0.025, 0.32, 0.72))
MINE_SHELL = material("DX mine copper shell", (0.28, 0.11, 0.038), 0.65, 0.42)
WHITE_PAINT = material("Identification paint", (0.58, 0.62, 0.56), 0.0, 0.8)


def clear():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)


def finish(obj, mat, bevel=0.0):
    obj.data.materials.append(mat)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    if bevel:
        modifier = obj.modifiers.new("Edge highlights", "BEVEL")
        modifier.width = bevel
        modifier.segments = 2
        bpy.context.view_layer.objects.active = obj
        bpy.ops.object.modifier_apply(modifier=modifier.name)
    for polygon in obj.data.polygons:
        polygon.use_smooth = False
    return obj


def cube(name, location, scale, mat, bevel=0.0):
    bpy.ops.mesh.primitive_cube_add(location=location)
    obj = bpy.context.object
    obj.name = name
    obj.scale = scale
    return finish(obj, mat, bevel)


def apron_slab(name, width, depth, corner, bottom, top, mat):
    # Chamfer the footprint independently of thickness: a thin cube bevel
    # cannot create the cut-away corners of the original DX landing apron.
    x, y = width / 2, depth / 2
    outline = [(-x+corner,-y),(x-corner,-y),(x,-y+corner),(x,y-corner),
               (x-corner,y),(-x+corner,y),(-x,y-corner),(-x,-y+corner)]
    verts = [(a,b+1.5,z) for z in (bottom,top) for a,b in outline]
    faces = [tuple(reversed(range(8))),tuple(range(8,16))]
    faces += [(i,(i+1)%8,(i+1)%8+8,i+8) for i in range(8)]
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(verts,[],faces)
    mesh.update()
    # Planar UVs also remain useful in the editable Blender source.
    uv = mesh.uv_layers.new()
    for loop in mesh.loops:
        v = mesh.vertices[loop.vertex_index].co
        uv.data[loop.index].uv = (v.x/width+0.5,(v.y-1.5)/depth+0.5)
    obj = bpy.data.objects.new(name,mesh)
    bpy.context.collection.objects.link(obj)
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    finish(obj,mat,0.004)
    obj.select_set(False)
    return obj


def cylinder(name, location, radius, depth, mat, vertices=16, rotation=(0, 0, 0)):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth, location=location, rotation=rotation)
    obj = bpy.context.object
    obj.name = name
    finish(obj, mat, 0.012)
    for polygon in obj.data.polygons:
        polygon.use_smooth = abs(polygon.normal.z) < 0.95
    return obj


def sphere(name, location, scale, mat, segments=48, rings=24):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segments, ring_count=rings, location=location)
    obj = bpy.context.object
    obj.name = name
    obj.scale = scale
    finish(obj, mat)
    for polygon in obj.data.polygons:
        polygon.use_smooth = True
    return obj


def torus(name, location, major_radius, minor_radius, mat):
    bpy.ops.mesh.primitive_torus_add(major_radius=major_radius, minor_radius=minor_radius, major_segments=32, minor_segments=8, location=location)
    obj = bpy.context.object
    obj.name = name
    return finish(obj, mat)


def text_object(name, body, location, size, mat):
    bpy.ops.object.text_add(location=location)
    obj = bpy.context.object
    obj.name = name
    obj.data.body = body
    obj.data.align_x = "CENTER"
    obj.data.align_y = "CENTER"
    obj.data.size = size
    obj.data.extrude = 0.006
    obj.data.bevel_depth = 0.002
    obj.rotation_euler.z = math.pi
    obj.data.materials.append(mat)
    return obj


def seam(name, points, mat, thickness=0.005):
    curve = bpy.data.curves.new(name, type="CURVE")
    curve.dimensions = "3D"
    curve.bevel_depth = thickness
    curve.bevel_resolution = 1
    spline = curve.splines.new("POLY")
    spline.points.add(len(points) - 1)
    for point, coordinate in zip(spline.points, points):
        point.co = (*coordinate, 1)
    obj = bpy.data.objects.new(name, curve)
    bpy.context.collection.objects.link(obj)
    curve.materials.append(mat)
    return obj


def export(path):
    bpy.context.view_layer.update()
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(SOURCE, path.replace(".glb", ".blend")))
    # Keep the editable source, but batch exported meshes by material. Sixty
    # tiny dome fasteners should not cost sixty draw calls for every city.
    bpy.ops.object.select_all(action="DESELECT")
    for obj in list(bpy.context.scene.objects):
        if obj.type in {"FONT", "CURVE"}:
            obj.select_set(True)
            bpy.context.view_layer.objects.active = obj
            bpy.ops.object.convert(target="MESH")
            obj.select_set(False)
    groups = {}
    for obj in list(bpy.context.scene.objects):
        if obj.type == "MESH":
            # Animated parts keep their parent and pivot; static parts still batch.
            animated_parent = obj.parent.name if obj.parent and obj.parent.get("animated") else ""
            groups.setdefault((obj.data.materials[0].name, animated_parent), []).append(obj)
    for name, objects in groups.items():
        bpy.ops.object.select_all(action="DESELECT")
        for obj in objects:
            obj.select_set(True)
        bpy.context.view_layer.objects.active = objects[0]
        if len(objects) > 1:
            bpy.ops.object.join()
        bpy.context.object.name = " ".join(part for part in name if part)
    bpy.context.view_layer.update()
    points = [obj.matrix_world @ corner for obj in bpy.context.scene.objects
              if obj.type == "MESH" for corner in map(Vector, obj.bound_box)]
    width = max(p.x for p in points) - min(p.x for p in points)
    depth = max(p.y for p in points) - min(p.y for p in points)
    limit = 1.0 if "tank" in path or "-item" in path or "defense-turret" in path else 3.0
    assert width <= limit and depth <= limit, (path, width, depth)
    print(f"{path}: {width:.3f} tiles wide, {depth:.3f} tiles deep, {len(groups)} draw groups")
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.export_scene.gltf(
        filepath=os.path.join(OUTPUT, path),
        export_format="GLB",
        use_selection=True,
        export_apply=True,
        export_yup=True,
        export_extras=True,
        export_animations=True,
    )


def build_tank(mayor=False):
    clear()
    root = bpy.data.objects.new("BattleCityTank", None)
    bpy.context.collection.objects.link(root)
    # The north-facing legacy tank fills only 32 of its 48px frame horizontally.
    # Match the visible hull, including enough room to rotate inside the frame.
    root.scale = (0.70, 0.70, 0.70)

    for side in (-1, 1):
        track = cube("Track", (side * 0.34, 0, 0.18), (0.105, 0.43, 0.16), RUBBER, 0.035)
        track.parent = root
        for y in (-0.29, -0.095, 0.10, 0.295):
            wheel = cylinder("RoadWheel", (side * 0.455, y, 0.18), 0.105, 0.055, STEEL, 12, (0, math.pi / 2, 0))
            wheel.parent = root

    hull = cube("Hull", (0, 0, 0.34), (0.29, 0.36, 0.14), OLIVE, 0.045)
    hull.parent = root
    nose = cube("Glacis", (0, 0.30, 0.47), (0.265, 0.15, 0.09), OLIVE_LIGHT, 0.028)
    nose.rotation_euler.x = math.radians(-10)
    nose.parent = root
    turret = cylinder("Turret race", (0, 0.02, 0.52), 0.22, 0.07, PANELS, 32)
    turret.parent = root
    turret_roof = sphere("Cast armoured turret", (0, 0.02, 0.585), (0.222, 0.20, 0.11), OLIVE_LIGHT, 32, 16)
    turret_roof.parent = root
    hatch = cylinder("Hatch", (0, 0.01, 0.705), 0.105, 0.055, RUBBER, 32)
    hatch.parent = root
    hatch_rim = torus("Hatch seal", (0, 0.01, 0.709), 0.11, 0.008, STEEL)
    hatch_rim.parent = root
    recoil = bpy.data.objects.new("Cannon recoil",None)
    bpy.context.collection.objects.link(recoil)
    recoil.parent = root
    recoil["animated"] = True
    recoil["role"] = "tank-gun"
    barrel = cylinder("Cannon", (0, 0.32, 0.61), 0.035, 0.44, STEEL, 16, (math.pi / 2, 0, 0))
    barrel.parent = recoil
    muzzle = bpy.data.objects.new("Cannon muzzle",None)
    bpy.context.collection.objects.link(muzzle)
    muzzle.parent = recoil
    muzzle.location = (0,0.55,0.61)
    muzzle["role"] = "tank-muzzle"
    mantlet = cube("Gun mantlet", (0, 0.188, 0.603), (0.075, 0.07, 0.055), PANELS, 0.023)
    mantlet.parent = root
    # Layered armour plates and a recessed rear grille read even at game scale.
    for side in (-1, 1):
        for y in (-0.22, -0.01, 0.20):
            skirt = cube("Track skirt panel", (side * 0.298, y, 0.40), (0.035, 0.096, 0.071), OLIVE, 0.015)
            skirt.parent = root
        cap = cylinder("Rear fuel cap", (side * 0.205, -0.24, 0.50), 0.035, 0.018, STEEL, 16)
        cap.parent = root
    grille = cube("Recessed engine grille", (0, -0.27, 0.49), (0.14, 0.062, 0.008), PANELS, 0.006)
    grille.parent = root
    for x in [-0.12 + i * 0.04 for i in range(7)]:
        fin = cube("Engine grille fin", (x, -0.27, 0.503), (0.006, 0.054, 0.006), STEEL, 0.003)
        fin.parent = root
    visor = cube("Turret optics", (0, 0.13, 0.676), (0.062, 0.022, 0.014), GLASS, 0.008)
    visor.parent = root
    # Ribbed tracks and headlamps retain the compact DX silhouette.
    for side in (-1, 1):
        for y in [-0.39 + i * 0.065 for i in range(13)]:
            tread = cube("Track shoe", (side * 0.34, y, 0.345), (0.10, 0.018, 0.015), STEEL, 0.005)
            tread.parent = root
        lamp = sphere("Headlamp", (side * 0.22, 0.365, 0.40), (0.045, 0.025, 0.032), LAMP)
        lamp.parent = root
    if mayor:
        # Original DX mayor row: rounded cyan command turret and blue armour.
        command = material("Mayor cyan command armour", (0.025, 0.32, 0.39), 0.72, 0.25)
        dome = material("Mayor teal command dome", (0.04, 0.54, 0.46), 0.64, 0.20)
        for obj in list(root.children):
            if obj.type == "MESH":
                for index, source in enumerate(obj.data.materials):
                    if source in (OLIVE, OLIVE_LIGHT): obj.data.materials[index] = command
            if obj.name.startswith(("Cast armoured turret", "Hatch", "Turret optics")):
                bpy.data.objects.remove(obj, do_unlink=True)
        crown = sphere("Mayor rounded command cupola", (0,0.02,0.68), (0.25,0.23,0.22), dome, 48, 24)
        crown.parent = root
        for side in (-1,1):
            optic = sphere("Mayor command sensor", (side*0.13,0.207,0.70), (0.032,0.025,0.04), GLASS, 16, 12)
            optic.parent = root
        export("battlecity-mayor-tank.glb")
    else:
        export("battlecity-tank.glb")


def build_defense_turret():
    clear()
    root = bpy.data.objects.new("BattleCityDefenseTurret",None)
    bpy.context.collection.objects.link(root)
    base = cube("Turret anchored machine bed",(0,0,0.075),(0.45,0.45,0.075),PANELS,0.055)
    base.parent = root
    for x in (-0.33,0.33):
        for y in (-0.33,0.33):
            foot = cylinder("Turret foundation anchor",(x,y,0.16),0.048,0.075,CONCRETE,12)
            foot.parent = root
    column = cylinder("Octagonal armoured turret column",(0,0,0.43),0.265,0.57,CONCRETE,8)
    column.parent = root
    for height in (0.20,0.47,0.69):
        band = torus("Turret structural collar",(0,0,height),0.275,0.027,STEEL)
        band.parent = root
    for side in (-1,1):
        piston = cylinder("External tracking actuator",(side*0.32,0,0.46),0.042,0.49,STEEL,16)
        piston.parent = root
        sleeve = cylinder("Tracking actuator sleeve",(side*0.32,0,0.29),0.058,0.22,PANELS,16)
        sleeve.parent = root
        feed = seam("Turret hydraulic service line",[(side*0.32,-0.17,0.15),(side*0.32,-0.17,0.68),(side*0.18,-0.17,0.81)],MINE_SHELL,0.012)
        feed.parent = root
    deck = cylinder("Turret chrome equipment deck",(0,0,0.79),0.36,0.10,CONCRETE,32)
    deck.parent = root
    bearing = cylinder("Powered azimuth bearing",(0,0,0.88),0.26,0.10,PANELS,48)
    bearing.parent = root
    ring = torus("Turret cyan azimuth instrument ring",(0,0,0.91),0.26,0.009,GLASS)
    ring.parent = root
    head = bpy.data.objects.new("Tracking turret head",None)
    bpy.context.collection.objects.link(head)
    head.parent = root
    head.location = (0,0,1.025)
    head["animated"] = True
    head["role"] = "defense-head"
    housing = cube("DX olive turret receiver",(0,-0.035,0.015),(0.24,0.21,0.12),OLIVE,0.055)
    housing.parent = head
    roof = cube("Turret cast chrome roof",(0,-0.055,0.14),(0.19,0.17,0.025),CONCRETE,0.025)
    roof.parent = head
    for x in (-0.16,0,0.16):
        fin = cube("Turret cooling rib",(x,-0.12,0.179),(0.025,0.09,0.012),STEEL,0.008)
        fin.parent = head
    for side in (-1,1):
        eye = sphere("Tracking optical sensor",(side*0.16,0.173,0.063),(0.032,0.023,0.027),GLASS,16,8)
        eye.parent = head
        sideplate = cube("Turret side armour cheek",(side*0.235,0.02,0),(0.022,0.14,0.073),PANELS,0.015)
        sideplate.parent = head
    pitch = bpy.data.objects.new("Turret elevation trunnion",None)
    bpy.context.collection.objects.link(pitch)
    pitch.parent = head
    pitch["animated"] = True
    pitch["role"] = "defense-pitch"
    for side in (-1,1):
        pin = cylinder("Elevation bearing pin",(side*0.092,0.095,0),0.049,0.031,CONCRETE,24,(0,math.pi/2,0))
        pin.parent = pitch
    recoil = bpy.data.objects.new("Turret barrel recoil",None)
    bpy.context.collection.objects.link(recoil)
    recoil.parent = pitch
    recoil["animated"] = True
    recoil["role"] = "defense-gun"
    barrel = cylinder("Turret forged cannon",(0,0.267,0),0.029,0.34,STEEL,24,(math.pi/2,0,0))
    barrel.parent = recoil
    collar = cylinder("Turret muzzle brake",(0,0.409,0),0.038,0.054,PANELS,24,(math.pi/2,0,0))
    collar.parent = recoil
    mouth = cylinder("Dark turret bore",(0,0.438,0),0.021,0.008,RUBBER,24,(math.pi/2,0,0))
    mouth.parent = recoil
    socket = bpy.data.objects.new("Defense muzzle attachment",None)
    bpy.context.collection.objects.link(socket)
    socket.parent = recoil
    socket.location = (0,0.455,0)
    socket["role"] = "defense-muzzle"
    export("battlecity-defense-turret.glb")


def build_command_center():
    clear()
    root = bpy.data.objects.new("BattleCityCommandCenter", None)
    bpy.context.collection.objects.link(root)
    bpy.context.scene.render.fps = 60
    bpy.context.scene.frame_start = 1
    bpy.context.scene.frame_end = 181
    base = cube("Foundation", (0, 0, 0.045), (1.48, 0.98, 0.045), PANELS, 0.025)
    base.parent = root
    for side in (-1, 1):
        rail = cube("Reinforced foundation rail", (side * 1.435, 0, 0.105), (0.033, 0.93, 0.05), STEEL, 0.018)
        rail.parent = root
        # Feed pipes connect the power pods to rear heat exchangers.
        pipe = seam("Power feed pipe", [(side * 0.79,-0.91,0.17), (side * 0.79,-0.75,0.32),
                    (side * 0.95,-0.53,0.35),(side * 1.11,-0.32,0.44)], STEEL, 0.033)
        pipe.parent = root
        exchanger = cube("Rear heat exchanger", (side * 1.15,-0.66,0.31), (0.17,0.20,0.18), PANELS,0.055)
        exchanger.parent = root
        for i in range(5):
            fin = cube("Exchanger cooling fin", (side * 1.15,-0.81+i*0.065,0.51), (0.155,0.012,0.022), STEEL,0.008)
            fin.parent = root
    lower_ring = torus("Heavy machinery collar", (0,-0.08,0.19), 1.01,0.036,STEEL)
    lower_ring.scale.y = 0.82
    lower_ring.parent = root
    rim = apron_slab("Apron brushed perimeter",2.96,0.98,0.17,0.0,0.026,STEEL)
    rim.parent = root
    apron = apron_slab("NO PARKING apron",2.82,0.88,0.14,0.020,0.027,APRON)
    apron.parent = root
    # Recessed joints divide the landing pad into cast mineral panels.
    for x in (-0.94,0.94):
        joint = seam("Apron expansion joint",[(x,1.10,0.028),(x,1.92,0.028)],SEAMS,0.005)
        joint.parent = root
    # A ribbed approach plate and drains visually connect pad and entrance.
    for i in range(7):
        rib = cube("Entrance tread rib",(0,1.07+i*0.036,0.032),(0.34,0.009,0.006),STEEL,0.003)
        rib.parent = root
    for side in (-1,1):
        drain = cube("Apron drain surround",(side*1.17,1.20,0.029),(0.12,0.10,0.004),SEAMS,0.008)
        drain.parent = root
        for i in range(4):
            slot = cube("Apron drain slot",(side*1.17,1.13+i*0.045,0.035),(0.09,0.010,0.003),PANELS,0.002)
            slot.parent = root
        for y in (1.12,1.86):
            fastener = cylinder("Apron countersunk fastener",(side*1.35,y,0.03),0.018,0.006,STEEL,vertices=12)
            fastener.parent = root
    # Slightly slanted, uneven lettering reads as applied graffiti, not a
    # machined plaque. Paint remains almost flush with the mineral surface.
    for word, x, tilt in [("NO",0.58,-0.035),("PARKING",-0.43,0.024)]:
        parking_text = text_object("NO PARKING graffiti "+word,word,(x,1.69,0.030),0.265,PAINT_BLACK)
        parking_text.data.extrude = 0.0004
        parking_text.data.bevel_depth = 0.0002
        parking_text.data.offset = 0.0045
        parking_text.data.shear = 0.14
        parking_text.rotation_euler.z += tilt
        parking_text.parent = root
    prohibition_ring = torus("Parking prohibition ring", (1.13, 1.67, 0.032), 0.14, 0.017, PAINT_RED)
    for vertex in prohibition_ring.data.vertices:
        angle = math.atan2(vertex.co.y,vertex.co.x)
        irregular = 1.0+0.035*math.sin(angle*5.0)+0.02*math.cos(angle*9.0)
        vertex.co.x *= irregular
        vertex.co.y *= irregular*0.96
    prohibition_ring.parent = root
    slash = cube("Parking prohibition slash", (1.13, 1.67, 0.034), (0.015, 0.16, 0.008), PAINT_RED, 0.003)
    slash.rotation_euler.z = math.radians(-45)
    slash.parent = root
    for side in (-1, 1):
        stripe = cube("Apron hazard marker", (side * 1.42, 1.50, 0.028), (0.018, 0.43, 0.006), GOLD, 0.003)
        stripe.parent = root
    body = cylinder("Machinery plinth", (0, -0.18, 0.87), 1.02, 1.48, PANELS, 48)
    body.scale.y = 0.78
    body.parent = root
    roof = sphere("Armoured dome", (0, -0.18, 1.76), (1.08, 0.78, 0.72), CONCRETE,64,32)
    roof.parent = root
    # Heavy longitudinal exoskeleton ribs turn the dome into a reinforced
    # command bunker, rather than a ball sitting on a flat foundation.
    for angle in (math.pi/3,math.pi/2,2*math.pi/3):
        points = [(1.095*math.cos(angle)*math.cos(t),-0.18+0.793*math.sin(angle)*math.cos(t),
                   1.76+0.738*math.sin(t)) for t in [i*math.pi/32 for i in range(33)]]
        rib = seam("Dome structural girder",points,STEEL,0.018)
        rib.parent = root
    # Fine curved armour joints echo the panel grid on the DX dome.
    def dome_point(angle, latitude):
        return (1.085 * math.cos(angle) * math.cos(latitude),
                -0.18 + 0.785 * math.sin(angle) * math.cos(latitude),
                1.76 + 0.725 * math.sin(latitude))
    for i in range(12):
        line = seam("Dome meridian joint", [dome_point(i * math.tau / 12, j * math.pi / 48)
                    for j in range(25)], SEAMS)
        line.parent = root
    for latitude in [math.pi / 12, math.pi / 6, math.pi / 4, math.pi / 3]:
        line = seam("Dome transverse joint", [dome_point(j * math.tau / 64, latitude)
                    for j in range(65)], SEAMS)
        line.parent = root
    window = torus("Cyan energy ring", (0, -0.18, 1.75), 1.085, 0.025, GLASS)
    window.scale.y = 0.73
    window.parent = root
    door = cube("Dark entrance", (0, 0.79, 0.77), (0.54, 0.15, 0.62), PANELS, 0.10)
    door.parent = root
    for side in (-1, 1):
        pod = sphere("Power pod", (side * 1.08, -0.14, 0.90), (0.30, 0.45, 0.57), PANELS)
        pod.parent = root
        lamp_socket = cylinder("Armoured lamp socket",(side*1.08,0.0,1.45),0.26,0.08,CONCRETE,48)
        lamp_socket.parent = root
        lamp = cylinder("Landing lamp", (side * 1.08, 0.0, 1.505), 0.215, 0.04, LAMP, 48)
        lamp.parent = root
        # Opposed mechanical irises rotate over the original circular DX lamps.
        rotor = bpy.data.objects.new(f"Lamp iris {'left' if side < 0 else 'right'}", None)
        bpy.context.collection.objects.link(rotor)
        rotor.parent = root
        rotor.location = (side * 1.08, 0.0, 1.535)
        rotor["animated"] = True
        for i in range(6):
            angle = i * math.tau / 6
            blade = cube("Iris blade", (0.10 * math.cos(angle), 0.10 * math.sin(angle), 0),
                         (0.06, 0.016, 0.009), PANELS, 0.006)
            blade.rotation_euler.z = angle + 0.35
            blade.parent = rotor
        rotor.rotation_euler.z = side * 0.3
        rotor.keyframe_insert(data_path="rotation_euler", frame=1)
        rotor.rotation_euler.z = side * (0.3 + math.tau)
        rotor.keyframe_insert(data_path="rotation_euler", frame=181)
        for fcurve in rotor.animation_data.action.fcurves:
            for keyframe in fcurve.keyframe_points:
                keyframe.interpolation = "LINEAR"
        rotor.rotation_euler.z = side * 0.3
    # The DX entrance is a chrome arch, with a dark mouth and cyan threshold.
    arch = torus("Entrance arch", (0, 0.91, 0.83), 0.60, 0.09, CONCRETE)
    arch.rotation_euler.x = math.pi / 2
    arch.scale.y = 1.06
    arch.parent = root
    for side in (-1,1):
        jamb = cube("Entrance armour jamb", (side*0.61,0.91,0.58),(0.095,0.09,0.46),CONCRETE,0.028)
        jamb.parent = root
        sill = cube("Entrance support pad", (side*0.59,0.89,0.12),(0.14,0.11,0.045),STEEL,0.025)
        sill.parent = root
    threshold = cube("Cyan threshold", (0, 0.985, 0.14), (0.41, 0.04, 0.025), GLASS, 0.01)
    threshold.parent = root
    core = cube("Entrance core", (0, 0.955, 0.68), (0.34, 0.008, 0.38), CORE, 0.04)
    core.parent = root
    # Broad structural ribs and rear service towers break the plain sphere
    # silhouette. Keep all hard machinery within the original 3x2 body.
    for angle in [math.radians(a) for a in (35,65,115,145,190,220,260,300)]:
        rib = cube("Vertical barrel armour",(math.cos(angle)*1.015,-0.18+math.sin(angle)*0.75,0.90),
                   (0.058,0.05,0.60),CONCRETE,0.018)
        rib.rotation_euler.z = angle
        rib.parent = root
    for side in (-1,1):
        tower = cube("Command service tower",(side*1.18,-0.67,0.76),(0.19,0.24,0.64),PANELS,0.065)
        tower.parent = root
        hood = cube("Service tower armoured hood",(side*1.18,-0.67,1.41),(0.20,0.25,0.035),CONCRETE,0.025)
        hood.parent = root
        for i in range(5):
            louvre = cube("Tower cooling louvre",(side*1.18,-0.88,0.40+i*0.17),(0.145,0.025,0.025),STEEL,0.008)
            louvre.parent = root
    hood = cube("Entrance armoured brow",(0,0.70,1.38),(0.59,0.13,0.065),STEEL,0.04)
    hood.parent = root
    # Raised panel ribs read at gameplay distance instead of faceted sphere rings.
    for i in range(12):
        angle = i * math.tau / 12
        for j in range(1, 6):
            latitude = j * math.pi / 12
            x = math.cos(angle) * 1.085 * math.cos(latitude)
            y = -0.18 + math.sin(angle) * 0.785 * math.cos(latitude)
            z = 1.76 + 0.725 * math.sin(latitude)
            rivet = sphere("Dome panel rivet", (x, y, z), (0.018, 0.018, 0.014), STEEL, 8, 4)
            rivet.parent = root
    export("battlecity-command-center.glb")


def rotor(root,name,location,seconds,direction=1):
    pivot = bpy.data.objects.new(name,None)
    bpy.context.collection.objects.link(pivot)
    pivot.parent = root
    pivot.location = location
    pivot["animated"] = True
    end = int(seconds*60)+1
    pivot.rotation_euler.z = 0
    pivot.keyframe_insert(data_path="rotation_euler",frame=1)
    pivot.rotation_euler.z = direction*math.tau
    pivot.keyframe_insert(data_path="rotation_euler",frame=end)
    for fcurve in pivot.animation_data.action.fcurves:
        for keyframe in fcurve.keyframe_points:
            keyframe.interpolation = "LINEAR"
    pivot.rotation_euler.z = 0
    bpy.context.scene.frame_end = max(bpy.context.scene.frame_end,end)
    return pivot


def fan_blades(pivot,radius,count=8):
    hub = cylinder("Turbine hub",(0,0,0.025),radius*0.22,0.07,STEEL,32)
    hub.parent = pivot
    for i in range(count):
        angle = i*math.tau/count
        # Swept, twisted metal blades catch a graded highlight instead of a
        # flat white rectangle. Their raised tips make the turbine read in 3D.
        outline = [(0.20,-0.13,-0.02),(0.93,-0.08,0.01),(0.86,0.13,0.07),(0.24,0.11,0.02)]
        vertices = [(x*radius,y*radius,z*radius+dz) for dz in (-0.014,0.014) for x,y,z in outline]
        faces = [(3,2,1,0),(4,5,6,7)]+[(j,(j+1)%4,(j+1)%4+4,j+4) for j in range(4)]
        mesh = bpy.data.meshes.new("Swept turbine blade")
        mesh.from_pydata(vertices,[],faces)
        mesh.update()
        blade = bpy.data.objects.new("Swept turbine blade",mesh)
        bpy.context.collection.objects.link(blade)
        bpy.context.view_layer.objects.active = blade
        blade.select_set(True)
        finish(blade,STEEL,0.006)
        blade.select_set(False)
        blade.rotation_euler.z = angle+0.28
        blade.parent = pivot


def arrow(root,side):
    points = [(-0.28,-0.09),(0.02,-0.09),(0.02,-0.19),(0.30,0),(0.02,0.19),(0.02,0.09),(-0.28,0.09)]
    vertices = [(side*0.81-side*x,1.50+y,0.053) for x,y in points]
    mesh = bpy.data.meshes.new("Factory inward arrow")
    mesh.from_pydata(vertices,[],[tuple(reversed(range(7))) if side>0 else tuple(range(7))])
    mesh.update()
    obj = bpy.data.objects.new("Factory inward arrow",mesh)
    bpy.context.collection.objects.link(obj)
    obj.data.materials.append(PAINT_BLACK)
    obj.parent = root


def rocket_shape(root,location,scale=1.0):
    weapon = bpy.data.objects.new("Rocket assembly",None)
    bpy.context.collection.objects.link(weapon)
    weapon.parent = root
    weapon.location = location
    weapon.scale = (scale,scale,scale)
    body = cylinder("Rocket casing",(0,0,0),0.072,0.49,CONCRETE,32,(math.pi/2,0,0))
    body.parent = weapon
    sleeve = cylinder("Rocket red safety sleeve",(0,0.14,0),0.076,0.13,PAINT_RED,32,(math.pi/2,0,0))
    sleeve.parent = weapon
    bpy.ops.mesh.primitive_cone_add(vertices=32,radius1=0.072,radius2=0,depth=0.20,location=(0,-0.345,0),rotation=(math.pi/2,0,0))
    nose = bpy.context.object
    nose.name = "Rocket armoured warhead"
    finish(nose,PANELS,0.008)
    nose.parent = weapon
    exhaust = cylinder("Rocket exhaust nozzle",(0,0.29,0),0.051,0.09,PANELS,32,(math.pi/2,0,0))
    exhaust.parent = weapon
    for angle in (0,math.pi/2,math.pi,3*math.pi/2):
        fin = cube("Rocket stabiliser fin",(math.cos(angle)*0.10,0.20,math.sin(angle)*0.10),(0.058,0.09,0.010),PAINT_RED,0.004)
        fin.rotation_euler.y = -angle
        fin.parent = weapon
    return weapon


def mine_shape(root,location,scale=1.0):
    weapon = bpy.data.objects.new("Mine assembly",None)
    bpy.context.collection.objects.link(weapon)
    weapon.parent = root
    weapon.location = location
    weapon.scale = (scale,scale,scale)
    base = cylinder("Mine armoured rim",(0,0,0.045),0.247,0.07,STEEL,32)
    base.parent = weapon
    shell = sphere("Mine copper pressure plate",(0,0,0.11),(0.234,0.234,0.10),MINE_SHELL,32,16)
    shell.parent = weapon
    for i in range(6):
        angle = i*math.tau/6
        points = [(0.236*math.cos(angle)*math.cos(t),0.236*math.sin(angle)*math.cos(t),0.11+0.103*math.sin(t))
                  for t in [j*math.pi/16 for j in range(9)]]
        joint = seam("Mine shell joint",points,PANELS,0.006)
        joint.parent = weapon
    fuse = cylinder("Mine central fuse",(0,0,0.22),0.050,0.07,PANELS,16)
    fuse.parent = weapon
    lamp = sphere("Mine armed indicator",(0,0,0.263),(0.023,0.023,0.015),RED,16,8)
    lamp.parent = weapon
    return weapon


PRODUCT_NAMES = ["cloak","rocket","medkit","bomb","mine","orb","flare","dfg","wall","turret","sleeper","plasma","laser"]


def product_shape(root,product,location=(0,0,0),scale=1.0):
    if product == 1:
        return rocket_shape(root,location,scale)
    if product == 4:
        return mine_shape(root,location,scale)
    weapon = bpy.data.objects.new(PRODUCT_NAMES[product]+" assembly",None)
    bpy.context.collection.objects.link(weapon)
    weapon.parent = root
    weapon.location = location
    weapon.scale = (scale,scale,scale)
    def box(name,p,size,mat,bevel=0.02):
        obj = cube(name,p,size,mat,bevel)
        obj.parent = weapon
        return obj
    def tube(name,p,r,d,mat,rotation=(0,0,0)):
        obj = cylinder(name,p,r,d,mat,32,rotation)
        obj.parent = weapon
        return obj
    def ball(name,p,size,mat):
        obj = sphere(name,p,size,mat,32,16)
        obj.parent = weapon
        return obj
    if product in (0,3):
        box("DX sealed equipment crate",(0,0,0.17),(0.26,0.22,0.16),PANELS,0.035)
        for x in (-0.21,0.21):
            box("Crate armoured strap",(x,0,0.19),(0.016,0.23,0.17),STEEL,0.008)
        if product == 3:
            for x in (-0.11,0.11):
                ball("Bomb armed lamps",(x,-0.20,0.34),(0.038,0.035,0.025),RED)
            box("Bomb control panel",(0,-0.232,0.19),(0.13,0.008,0.065),SEAMS,0.008)
        else:
            for i in range(3):
                path = seam("Cloak charged circuit",[(-0.16,-0.15+i*0.12,0.337),(0,-0.04+i*0.12,0.337),(0.16,-0.15+i*0.12,0.337)],ORB_TRACERY,0.009)
                path.parent = weapon
    elif product == 2:
        box("DX medical case",(0,0,0.17),(0.24,0.21,0.16),WHITE_PAINT,0.04)
        box("Medical red cross horizontal",(0,0,0.336),(0.17,0.055,0.006),PAINT_RED,0.003)
        box("Medical red cross vertical",(0,0,0.337),(0.055,0.17,0.006),PAINT_RED,0.003)
        box("Medical case handle",(0,0.23,0.20),(0.11,0.02,0.025),STEEL,0.01)
    elif product == 6:
        box("DX flare controller",(0,0,0.075),(0.14,0.25,0.07),STEEL,0.025)
        for x in (-0.065,0.065):
            for y in (-0.14,-0.04,0.06):
                tube("Controller button",(x,y,0.15),0.025,0.012,PANELS)
        box("Controller status display",(0,0.15,0.15),(0.10,0.055,0.005),REACTOR,0.004)
        tube("Flare antenna",(0,0.34,0.10),0.014,0.19,PANELS,(math.pi/2,0,0))
    elif product == 7:
        tube("DFG copper hub",(0,0,0.13),0.12,0.14,MINE_SHELL)
        for angle in (0,math.pi/2,math.pi,3*math.pi/2):
            x,y=0.27*math.cos(angle),0.27*math.sin(angle)
            arm=box("DFG four emitter cross",(x/2,y/2,0.11),(0.15,0.035,0.035),STEEL,0.012)
            arm.rotation_euler.z=angle
            ball("DFG copper emitter",(x,y,0.13),(0.078,0.078,0.065),MINE_SHELL)
            ball("DFG cyan emitter cap",(x,y,0.18),(0.036,0.036,0.020),GLASS)
    elif product == 8:
        box("DX wall block",(0,0,0.17),(0.29,0.18,0.17),WHITE_PAINT,0.015)
        for x in (-0.23,0,0.23):
            box("Wall crenellation",(x,0,0.40),(0.065,0.18,0.065),WHITE_PAINT,0.012)
        for z in (0.10,0.22):
            box("Wall masonry joint",(0,-0.184,z),(0.28,0.005,0.006),SEAMS,0.002)
    elif product in (9,10,11,12):
        tube("Weapon mount bearing",(0,0,0.045),0.29,0.09,PANELS)
        tube("Weapon azimuth ring",(0,0,0.11),0.25,0.06,STEEL)
        if product == 9:
            box("DX turret olive housing",(0,0,0.25),(0.21,0.19,0.12),OLIVE,0.035)
            tube("Turret cannon",(0,-0.26,0.28),0.047,0.26,STEEL,(math.pi/2,0,0))
            tube("Turret dark muzzle",(0,-0.405,0.28),0.050,0.030,PANELS,(math.pi/2,0,0))
        elif product == 10:
            ball("Sleeper chrome dish",(0,0,0.20),(0.265,0.265,0.11),CONCRETE)
            for x in (-0.10,0.10):
                tube("Sleeper induction injector",(x,-0.17,0.30),0.045,0.29,CONCRETE,(math.pi/3,0,0))
            tube("Sleeper amber capacitor",(0,0.04,0.32),0.11,0.06,GOLD)
        elif product == 11:
            for side in (-1,1):
                pylon=box("DX plasma triangular yoke",(side*0.17,0,0.27),(0.070,0.18,0.20),PANELS,0.022)
                pylon.rotation_euler.y=-side*math.radians(22)
            tube("Plasma charged chamber",(0,-0.07,0.29),0.085,0.31,REACTOR,(math.pi/2,0,0))
            for y in (-0.18,-0.08,0.02):
                ring=torus("Plasma containment collar",(0,y,0.29),0.10,0.017,CONCRETE)
                ring.rotation_euler.x=math.pi/2
                ring.parent=weapon
        else:
            box("Laser armoured receiver",(0,0.04,0.22),(0.20,0.18,0.11),CONCRETE,0.03)
            for x in (-0.105,0.105):
                tube("Twin laser barrel",(x,-0.25,0.25),0.049,0.30,PANELS,(math.pi/2,0,0))
                tube("Laser focusing lens",(x,-0.404,0.25),0.034,0.008,RED,(math.pi/2,0,0))
            for y in (-0.05,0.07,0.19):
                box("Laser heat sink",(0,y,0.34),(0.19,0.025,0.035),STEEL,0.005)
    return weapon


def build_weapon_item(product):
    clear()
    name = PRODUCT_NAMES[product]
    root = bpy.data.objects.new("BattleCity"+name.title()+"Item",None)
    bpy.context.collection.objects.link(root)
    weapon = product_shape(root,product,(0,0,0.16 if product == 1 else 0),1.0)
    if product in (1,6):
        weapon.rotation_euler.z = math.radians(-38)
    export("battlecity-"+name+"-item.glb")


def build_factory(orb_factory=False, product=None, production_platform=False):
    clear()
    root = bpy.data.objects.new("BattleCityOrbFactory" if orb_factory else "BattleCityRocketFactory" if product == 1 else "BattleCityMineFactory" if product == 4 else "BattleCityFactory",None)
    bpy.context.collection.objects.link(root)
    bpy.context.scene.render.fps = 60
    bpy.context.scene.frame_end = 361
    base = cube("Factory machine bed",(0,0,0.07),(1.48,0.98,0.07),PANELS,0.04)
    base.parent = root
    housing = cube("Factory armoured production hall",(0,0.10,0.70),(0.67,0.73,0.59),PANELS,0.09)
    housing.parent = root
    roof = cube("Production hall steel roof",(0,0.07,1.33),(0.71,0.76,0.07),CONCRETE,0.065)
    roof.parent = root
    for side in (-1,1):
        tower = cylinder("DX twin production stack",(side*1.05,-0.42,1.10),0.22,1.92,STEEL,40)
        tower.parent = root
        for height in (0.29,0.78,1.23,1.72):
            collar = torus("Stack armoured collar",(side*1.05,-0.42,height),0.225,0.035,CONCRETE)
            collar.parent = root
        for height in (0.92,1.52):
            band = torus("Stack cyan instrument ring",(side*1.05,-0.42,height),0.227,0.014,GLASS)
            band.parent = root
        cowl = cylinder("Stack intake cowl",(side*1.05,-0.42,2.08),0.27,0.18,PANELS,48)
        cowl.parent = root
        rim = torus("Stack intake chrome rim",(side*1.05,-0.42,2.18),0.254,0.025,CONCRETE)
        rim.parent = root
        pivot = rotor(root,"Factory intake turbine "+str(side),(side*1.05,-0.42,2.20),4.0 if side<0 else 5.0,side)
        fan_blades(pivot,0.23,6)
        feet = cube("Stack piston supports",(side*1.05,-0.42,0.20),(0.30,0.35,0.12),PANELS,0.04)
        feet.parent = root
        pipe = seam("Factory service feed",[(side*1.05,-0.68,0.45),(side*1.05,-0.86,0.45),
                    (side*0.45,-0.86,0.45),(side*0.45,-0.58,0.88)],STEEL,0.037)
        pipe.parent = root
        rail = cube("Factory edge rail",(side*1.43,0,0.13),(0.027,0.94,0.055),STEEL,0.014)
        rail.parent = root
    gantry = cube("Production gantry",(0,-0.44,1.65),(1.03,0.065,0.055),CONCRETE,0.028)
    gantry.parent = root
    for i in range(0 if orb_factory or product is not None or production_platform else 5):
        vent = cube("Production roof heat fin",(-0.49+i*0.245,-0.16,1.45),(0.045,0.43,0.04),STEEL,0.014)
        vent.parent = root
    furnace = cube("Recessed production furnace",(0,0.843,0.79),(0.47,0.015,0.19),ORB_GLOW if orb_factory else FURNACE,0.025)
    furnace.parent = root
    for i in range(6):
        rib = cube("Furnace safety grille",(-0.40+i*0.16,0.87,0.79),(0.022,0.022,0.19),STEEL,0.01)
        rib.parent = root
    pickup = cube("Factory pickup module",(0,0.88,0.31),(0.36,0.10,0.21),CONCRETE,0.045)
    pickup.parent = root
    shutter = cube("Factory dispatch shutter",(0,0.987,0.30),(0.25,0.013,0.13),PANELS,0.015)
    shutter.parent = root
    for i in range(4):
        slat = cube("Dispatch shutter slat",(0,1.008,0.21+i*0.06),(0.24,0.006,0.008),STEEL,0.003)
        slat.parent = root
    landing = cylinder("Factory arrow platform",(0,1.50,0.026),1.0,0.022,GOLD,64)
    landing.scale.x = 1.40
    landing.scale.y = 0.39
    landing.parent = root
    inset = cylinder("Factory platform inset",(0,1.50,0.043),1.0,0.008,APRON,64)
    inset.scale.x = 1.32
    inset.scale.y = 0.32
    inset.parent = root
    for side in (-1,1):
        arrow(root,side)
    if orb_factory:
        cradle = cylinder("Orb synthesis cradle",(0,0.05,1.48),0.49,0.15,CONCRETE,64)
        cradle.parent = root
        shell = sphere("Orb synthesis plasma sphere",(0,0.05,1.96),(0.40,0.40,0.40),ORB_SHELL,64,32)
        shell.parent = root
        for direction in (-1,1):
            field = rotor(root,"Orb containment gimbal "+str(direction),(0,0.05,1.96),7.0+direction,direction)
            hoop = torus("Containment armoured gimbal",(0,0,0),0.52,0.032,STEEL)
            hoop.rotation_euler.x = math.radians(58*direction)
            hoop.parent = field
            track = torus("Containment charged circuit",(0,0,0),0.49,0.009,ORB_TRACERY)
            track.rotation_euler.x = math.radians(58*direction)
            track.parent = field
        for side in (-1,1):
            needle = sphere("Orb generator charged terminal",(side*0.99,-0.42,2.26),(0.07,0.07,0.045),ORB_GLOW,16,8)
            needle.parent = root
    if production_platform:
        plinth = cylinder("Weapon assembly plinth",(0,0.06,1.46),0.50,0.12,STEEL,48)
        plinth.parent = root
        rim = torus("Assembly plinth instrument ring",(0,0.06,1.53),0.47,0.012,GLASS)
        rim.parent = root
    if product == 1:
        for x in (-0.39,0,0.39):
            rail = cube("Rocket assembly cradle",(x,0.10,1.47),(0.10,0.45,0.035),STEEL,0.02)
            rail.parent = root
            rocket_shape(root,(x,0.10,1.57),0.80)
    if product == 4:
        for x in (-0.30,0.30):
            for y in (-0.22,0.37):
                press = cylinder("Mine assembly press",(x,y,1.44),0.21,0.12,STEEL,32)
                press.parent = root
                mine_shape(root,(x,y,1.51),0.74)
    export("battlecity-weapon-factory.glb" if production_platform else "battlecity-orb-factory.glb" if orb_factory else "battlecity-rocket-factory.glb" if product == 1 else "battlecity-mine-factory.glb" if product == 4 else "battlecity-factory.glb")


def build_research_center():
    clear()
    root = bpy.data.objects.new("BattleCityResearchCenter",None)
    bpy.context.collection.objects.link(root)
    bpy.context.scene.render.fps = 60
    bpy.context.scene.frame_end = 481
    base = cube("Research reinforced foundation",(0,0.50,0.06),(1.48,1.48,0.06),PANELS,0.055)
    base.parent = root
    for side in (-1,1):
        rail = cube("Laboratory perimeter rail",(side*1.43,0.50,0.14),(0.026,1.37,0.055),STEEL,0.018)
        rail.parent = root
    hall = cube("Laboratory machinery hall",(-0.46,-0.10,0.66),(0.83,0.73,0.52),PANELS,0.085)
    hall.parent = root
    chamber = cylinder("Research containment chamber",(-0.49,-0.18,1.37),0.73,0.39,PANELS,64)
    chamber.parent = root
    rim = torus("Containment chamber chrome rim",(-0.49,-0.18,1.59),0.71,0.043,CONCRETE)
    rim.parent = root
    well = cylinder("Dark containment well",(-0.49,-0.18,1.59),0.65,0.025,RUBBER,64)
    well.parent = root
    for i in range(16):
        angle = i*math.tau/16
        gauge = cube("Containment perimeter instrument",(-0.49+0.64*math.cos(angle),-0.18+0.64*math.sin(angle),1.62),
                     (0.035,0.012,0.012),GLASS if i%4 == 0 else CONCRETE,0.003)
        gauge.rotation_euler.z = angle
        gauge.parent = root
    for angle in (math.pi/4,3*math.pi/4,5*math.pi/4,7*math.pi/4):
        x,y = -0.49+0.54*math.cos(angle),-0.18+0.54*math.sin(angle)
        probe = cube("Containment optical probe",(x,y,1.77),(0.06,0.065,0.18),CONCRETE,0.025)
        probe.rotation_euler.z = angle
        probe.parent = root
        lens = sphere("Probe charged lens",(x,y,1.97),(0.035,0.035,0.025),REACTOR,16,8)
        lens.parent = root
    focus = bpy.data.objects.new("Research levitating specimen",None)
    bpy.context.collection.objects.link(focus)
    focus.parent = root
    focus["animated"] = True
    focus.location = (-0.49,-0.18,1.77)
    focus.keyframe_insert(data_path="location",frame=1)
    focus.location.z += 0.12
    focus.keyframe_insert(data_path="location",frame=121)
    focus.location.z -= 0.12
    focus.keyframe_insert(data_path="location",frame=241)
    crystal = cylinder("Research crystalline specimen",(0,0,0),0.145,0.38,REACTOR,6)
    crystal.parent = focus
    for direction in (-1,1):
        bpy.ops.mesh.primitive_cone_add(vertices=6,radius1=0.145,radius2=0,depth=0.16,
            location=(0,0,direction*0.27),rotation=(0,0,0) if direction>0 else (math.pi,0,0))
        tip = bpy.context.object
        tip.name = "Faceted specimen tip"
        finish(tip,REACTOR)
        tip.parent = focus
    for z,radius in ((1.73,0.32),(2.01,0.28)):
        field = torus("Static containment field",(-0.49,-0.18,z),radius,0.007,GLASS)
        field.parent = root
    socket = torus("Crystal containment socket",(-0.49,-0.18,1.68),0.20,0.025,CONCRETE)
    socket.parent = root
    spine = cube("Laboratory armoured spine",(0.62,0.08,0.73),(0.50,0.84,0.56),PANELS,0.09)
    spine.parent = root
    cap = cube("Laboratory chrome service deck",(0.85,0.53,1.30),(0.35,0.40,0.035),CONCRETE,0.025)
    cap.parent = root
    core = cylinder("Research charged core",(0.75,-0.32,1.57),0.19,1.0,REACTOR,48)
    core.parent = root
    for z in (1.05,1.95):
        collar = cylinder("Reactor armoured pole",(0.75,-0.32,z),0.27,0.12,CONCRETE,48)
        collar.parent = root
    turns = [(0.75+0.24*math.cos(i*math.tau/24),-0.32+0.24*math.sin(i*math.tau/24),1.05+i/120*0.90) for i in range(121)]
    winding = seam("Research helical winding",turns,STEEL,0.038)
    winding.parent = root
    orbital = rotor(root,"Research induction scanner",(0.75,-0.32,2.08),6.0)
    arm = cube("Induction scanner arm",(0.18,0,0),(0.21,0.03,0.028),STEEL,0.015)
    arm.parent = orbital
    tip = sphere("Scanner charged tip",(0.37,0,0),(0.055,0.055,0.038),REACTOR,16,8)
    tip.parent = orbital
    for side in (-1,1):
        pipe = seam("Laboratory feed pipe",[(side*1.27,-0.70,0.35),(side*1.27,0.82,0.35),
                    (side*0.46,0.82,0.35),(side*0.46,1.25,0.35)],STEEL,0.028)
        pipe.parent = root
        marker = cube("Laboratory amber marker",(side*1.26,1.66,0.19),(0.055,0.065,0.035),LAMP,0.015)
        marker.parent = root
    console = cube("DX research terminal",(-0.66,1.18,0.46),(0.58,0.63,0.32),CONCRETE,0.065)
    console.parent = root
    screen_frame = cube("Terminal dark screen frame",(-0.66,1.27,0.79),(0.44,0.43,0.025),PANELS,0.035)
    screen_frame.parent = root
    display = cube("Laboratory diagnostic display",(-0.66,1.27,0.82),(0.38,0.36,0.01),DISPLAY,0.018)
    display.parent = root
    for i in range(4):
        fin = cube("Terminal cooling rib",(0.41+i*0.18,1.18,0.30),(0.05,0.38,0.09),STEEL,0.014)
        fin.parent = root
    for i in range(5):
        light = cube("Research status lamp",(-1.08+i*0.18,1.74,0.73),(0.028,0.025,0.014),REACTOR,0.01)
        light.parent = root
    export("battlecity-research-center.glb")


def build_orb_item():
    clear()
    root = bpy.data.objects.new("BattleCityOrbItem",None)
    bpy.context.collection.objects.link(root)
    bpy.context.scene.render.fps = 60
    bpy.context.scene.frame_end = 481
    shell = sphere("DX orb violet plasma globe",(0,0,0.30),(0.245,0.245,0.245),ORB_SHELL,64,32)
    shell.parent = root
    # The original orb's spherical cyan/violet reticle remains readable under
    # the new plasma. Two inclined energy rings give it a distinct silhouette.
    grid = rotor(root,"Orb celestial reticle",(0,0,0.30),8.0)
    for latitude in (-0.6,0,0.6):
        ring = torus("Orb latitude reticle",(0,0,math.sin(latitude)*0.251),math.cos(latitude)*0.251,0.0035,ORB_TRACERY)
        ring.parent = grid
    for angle in (0,math.pi/2):
        ring = torus("Orb longitude reticle",(0,0,0),0.251,0.0035,ORB_TRACERY)
        ring.rotation_euler.x = math.pi/2
        ring.rotation_euler.z = angle
        ring.parent = grid
    for direction in (-1,1):
        field = rotor(root,"Orb energy orbit "+str(direction),(0,0,0.30),5.0+direction,direction)
        ring = torus("Orb energy orbit filament",(0,0,0),0.315,0.0055,ORB_GLOW)
        ring.rotation_euler.x = math.radians(58*direction)
        ring.parent = field
        spark = sphere("Orb orbiting energy mote",(0.315,0,0),(0.02,0.02,0.02),ORB_TRACERY,12,6)
        spark.parent = field
    export("battlecity-orb-item.glb")


build_tank()
build_tank(mayor=True)
build_defense_turret()
build_command_center()
build_factory()
build_factory(product=1)
build_factory(product=4)
build_factory(production_platform=True)
build_factory(orb_factory=True)
build_research_center()
build_orb_item()
for product in range(len(PRODUCT_NAMES)):
    if product != 5:
        build_weapon_item(product)
print(f"Exported BattleCity demo assets to {OUTPUT}")

"""
Stroy Bazar product photography toolkit (Blender / Cycles).

Builds every catalog photo procedurally: a seamless studio sweep, softbox
lighting, physically based materials and parametric product models. Run via
`tools/render/render.py`; requires the `bpy` module (pip install bpy==4.5.*).
"""
import math
import bpy
import bmesh
from mathutils import Vector, Matrix, Euler

# --------------------------------------------------------------- scene setup


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'
    scene.cycles.device = 'CPU'
    scene.cycles.samples = 96
    scene.cycles.use_adaptive_sampling = True
    scene.cycles.adaptive_threshold = 0.02
    scene.cycles.use_denoising = True
    scene.cycles.denoiser = 'OPENIMAGEDENOISE'
    scene.cycles.max_bounces = 8
    scene.cycles.glossy_bounces = 4
    scene.cycles.transmission_bounces = 8
    scene.cycles.transparent_max_bounces = 8
    scene.cycles.caustics_reflective = False
    scene.cycles.caustics_refractive = False
    scene.cycles.blur_glossy = 1.0
    scene.view_settings.view_transform = 'AgX'
    try:
        scene.view_settings.look = 'AgX - Medium High Contrast'
    except TypeError:
        pass
    scene.view_settings.exposure = 0.0
    scene.render.resolution_x = 1000
    scene.render.resolution_y = 1000
    scene.render.resolution_percentage = 100
    scene.render.film_transparent = False
    scene.render.image_settings.file_format = 'WEBP'
    scene.render.image_settings.quality = 84
    scene.render.image_settings.color_mode = 'RGB'
    world = bpy.data.worlds.new('World')
    scene.world = world
    world.use_nodes = True
    bg = world.node_tree.nodes['Background']
    bg.inputs['Color'].default_value = (0.82, 0.82, 0.83, 1)
    bg.inputs['Strength'].default_value = 0.15
    return scene


def link(obj):
    bpy.context.scene.collection.objects.link(obj)
    return obj


def mesh_object(name, verts, faces, mat=None, smooth=True):
    me = bpy.data.meshes.new(name)
    me.from_pydata([tuple(v) for v in verts], [], [tuple(f) for f in faces])
    me.validate()
    me.update()
    obj = bpy.data.objects.new(name, me)
    link(obj)
    if smooth:
        for p in me.polygons:
            p.use_smooth = True
    if mat:
        obj.data.materials.append(mat)
    return obj


def backdrop(color=(0.86, 0.86, 0.85), size=12.0, curve_radius=1.6, floor_z=0.0, y_back=1.6):
    """Seamless L-shaped sweep: floor that curves up into a back wall."""
    verts, faces = [], []
    profile = []
    # floor from front to the start of the curve
    for i in range(10):
        profile.append((-size + i * (size + y_back - curve_radius) / 9, floor_z))
    for i in range(1, 17):
        a = i / 16 * (math.pi / 2)
        profile.append((y_back - curve_radius + math.sin(a) * curve_radius, floor_z + curve_radius - math.cos(a) * curve_radius))
    for i in range(1, 8):
        profile.append((y_back, floor_z + curve_radius + i * size / 7))
    n = len(profile)
    for x in (-size, size):
        for y, z in profile:
            verts.append((x, y, z))
    for i in range(n - 1):
        faces.append((i, i + 1, n + i + 1, n + i))
    mat = material('Backdrop', color=color, roughness=0.65)
    obj = mesh_object('Backdrop', verts, faces, mat)
    obj.visible_glossy = True
    return obj


def area_light(name, location, target, size=2.0, energy=400, color=(1, 1, 1), size_y=None):
    data = bpy.data.lights.new(name, 'AREA')
    data.energy = energy
    data.color = color
    if size_y:
        data.shape = 'RECTANGLE'
        data.size = size
        data.size_y = size_y
    else:
        data.size = size
    obj = bpy.data.objects.new(name, data)
    obj.location = location
    direction = Vector(target) - Vector(location)
    obj.rotation_euler = direction.to_track_quat('-Z', 'Y').to_euler()
    link(obj)
    return obj


def reflection_card(name, location, target, w=2.0, h=1.0, strength=3.0):
    """Emissive panel visible only in reflections (gives chrome/glaze highlights)."""
    bpy.ops.mesh.primitive_plane_add(size=1)
    obj = bpy.context.active_object
    obj.name = name
    obj.scale = (w, h, 1)
    obj.location = location
    direction = Vector(target) - Vector(location)
    obj.rotation_euler = direction.to_track_quat('Z', 'Y').to_euler()
    mat = bpy.data.materials.new(name + 'Mat')
    mat.use_nodes = True
    nt = mat.node_tree
    nt.nodes.clear()
    out = nt.nodes.new('ShaderNodeOutputMaterial')
    em = nt.nodes.new('ShaderNodeEmission')
    em.inputs['Strength'].default_value = strength
    nt.links.new(em.outputs[0], out.inputs[0])
    obj.data.materials.append(mat)
    obj.visible_camera = False
    obj.visible_diffuse = False
    obj.visible_shadow = False
    return obj


def studio(key=1.0, warm=True, backdrop_color=(0.5, 0.5, 0.49), scale=1.0):
    """Standard three-softbox product setup. `scale` ~ product size in metres."""
    s = scale
    backdrop(color=backdrop_color, size=12 * max(1, s), curve_radius=1.6 * max(0.6, s), y_back=1.8 * max(0.6, s))
    kc = (1.0, 0.97, 0.93) if warm else (1, 1, 1)
    area_light('Key', (-2.6 * s, -2.4 * s, 3.0 * s), (0, 0, 0.3 * s), size=2.4 * s, energy=380 * key * s * s, color=kc)
    area_light('Fill', (3.0 * s, -1.6 * s, 1.6 * s), (0, 0, 0.3 * s), size=3.0 * s, energy=110 * key * s * s, color=(0.95, 0.97, 1.0))
    area_light('Top', (0.2 * s, 0.6 * s, 4.2 * s), (0, 0, 0), size=3.0 * s, energy=200 * key * s * s)
    area_light('Rim', (1.4 * s, 2.6 * s, 2.2 * s), (0, 0, 0.4 * s), size=1.6 * s, energy=140 * key * s * s)
    reflection_card('CardL', (-2.2 * s, -1.0 * s, 1.4 * s), (0, 0, 0.4 * s), 1.2 * s, 2.6 * s, 4)
    reflection_card('CardR', (2.4 * s, -0.6 * s, 1.2 * s), (0, 0, 0.4 * s), 1.0 * s, 2.2 * s, 2.5)
    reflection_card('CardTop', (0, -0.6 * s, 3.0 * s), (0, 0, 0), 3.0 * s, 1.0 * s, 2.0)


def frame_camera(objects=None, azimuth=-32, elevation=16, lens=70, margin=1.18, target_offset=(0, 0, 0), shift_y=0.0):
    """Place a camera that frames the given objects' bounding box."""
    scene = bpy.context.scene
    if objects is None:
        objects = [o for o in scene.objects if o.type == 'MESH' and o.name not in ('Backdrop',) and o.visible_camera]
    pts = []
    deps = bpy.context.evaluated_depsgraph_get()
    for obj in objects:
        ev = obj.evaluated_get(deps) if obj.type == 'MESH' else obj
        for corner in ev.bound_box:
            pts.append(obj.matrix_world @ Vector(corner))
    lo = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
    hi = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
    center = (lo + hi) / 2 + Vector(target_offset)
    cam_data = bpy.data.cameras.new('Camera')
    cam_data.lens = lens
    cam_data.sensor_width = 36
    cam = bpy.data.objects.new('Camera', cam_data)
    link(cam)
    scene.camera = cam
    az, el = math.radians(azimuth), math.radians(elevation)
    direction = Vector((math.sin(az) * math.cos(el), -math.cos(az) * math.cos(el), math.sin(el)))
    rot = direction.to_track_quat('Z', 'Y')
    cam.rotation_euler = rot.to_euler()
    # project bbox corners into camera space and find required distance
    rmat = rot.to_matrix()
    inv = rmat.transposed()
    corners = [Vector((x, y, z)) for x in (lo.x, hi.x) for y in (lo.y, hi.y) for z in (lo.z, hi.z)]
    half_fov = math.atan(cam_data.sensor_width / 2 / lens)
    aspect = scene.render.resolution_y / scene.render.resolution_x
    half_fov_y = math.atan(math.tan(half_fov) * aspect)
    dist = 0.0
    for c in corners:
        local = inv @ (c - center)
        need_x = abs(local.x) * margin / math.tan(half_fov) + local.z
        need_y = abs(local.y) * margin / math.tan(half_fov_y) + local.z
        dist = max(dist, need_x, need_y)
    cam.location = center + direction * dist
    cam_data.shift_y = shift_y
    cam_data.clip_start = 0.01
    cam_data.clip_end = 200
    return cam


def render(path, samples=None, resolution=None):
    scene = bpy.context.scene
    if samples:
        scene.cycles.samples = samples
    if resolution:
        scene.render.resolution_x, scene.render.resolution_y = resolution
    scene.render.filepath = path
    bpy.ops.render.render(write_still=True)


# --------------------------------------------------------------- materials

_mat_cache = {}


def material(name, color=(0.8, 0.8, 0.8), roughness=0.5, metallic=0.0, coat=0.0, coat_roughness=0.03,
             transmission=0.0, ior=1.45, alpha=1.0, specular=0.5, sheen=0.0, emission=None, emission_strength=0.0):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes['Principled BSDF']
    bsdf.inputs['Base Color'].default_value = (*color, 1)
    bsdf.inputs['Roughness'].default_value = roughness
    bsdf.inputs['Metallic'].default_value = metallic
    bsdf.inputs['Coat Weight'].default_value = coat
    bsdf.inputs['Coat Roughness'].default_value = coat_roughness
    bsdf.inputs['Transmission Weight'].default_value = transmission
    bsdf.inputs['IOR'].default_value = ior
    bsdf.inputs['Alpha'].default_value = alpha
    bsdf.inputs['Specular IOR Level'].default_value = specular
    bsdf.inputs['Sheen Weight'].default_value = sheen
    if emission:
        bsdf.inputs['Emission Color'].default_value = (*emission, 1)
        bsdf.inputs['Emission Strength'].default_value = emission_strength
    return mat


def srgb(hex_color):
    """'#RRGGBB' -> linear RGB tuple."""
    h = hex_color.lstrip('#')
    out = []
    for i in (0, 2, 4):
        c = int(h[i:i + 2], 16) / 255
        out.append(c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4)
    return tuple(out)


def ceramic(color='#F4F4F2', name='Ceramic'):
    return material(name, color=srgb(color), roughness=0.12, coat=1.0, coat_roughness=0.02, specular=0.6)


def matte_ceramic(color='#2A2A2C', name='MatteCeramic'):
    return material(name, color=srgb(color), roughness=0.42, coat=0.15, coat_roughness=0.3)


def chrome(name='Chrome'):
    return material(name, color=(0.92, 0.93, 0.95), roughness=0.04, metallic=1.0)


def brushed(color='#C9CBCF', roughness=0.28, name='Brushed'):
    return material(name, color=srgb(color), roughness=roughness, metallic=1.0)


def gold(name='Gold', brushed_finish=True):
    return material(name, color=srgb('#D9B36C'), roughness=0.22 if brushed_finish else 0.06, metallic=1.0)


def black_metal(name='BlackMetal'):
    return material(name, color=srgb('#1E1F21'), roughness=0.38, metallic=0.6, coat=0.2, coat_roughness=0.25)


def plastic(color, roughness=0.35, name='Plastic', coat=0.0):
    return material(name, color=srgb(color), roughness=roughness, coat=coat)


def glass(name='Glass', tint=(0.97, 0.99, 0.99), roughness=0.0):
    mat = material(name, color=tint, roughness=roughness, transmission=1.0, ior=1.5)
    return mat


def frosted_glass(name='Frosted'):
    return material(name, color=(0.95, 0.97, 0.97), roughness=0.35, transmission=1.0, ior=1.5)


def node_material(name):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nt = mat.node_tree
    return mat, nt, nt.nodes['Principled BSDF']


def _coords(nt, scale=1.0, mapping_rot=(0, 0, 0), use_object=True):
    tc = nt.nodes.new('ShaderNodeTexCoord')
    mp = nt.nodes.new('ShaderNodeMapping')
    mp.inputs['Scale'].default_value = (scale, scale, scale)
    mp.inputs['Rotation'].default_value = mapping_rot
    nt.links.new(tc.outputs['Object' if use_object else 'UV'], mp.inputs['Vector'])
    return mp


def _ramp(nt, stops):
    ramp = nt.nodes.new('ShaderNodeValToRGB')
    cr = ramp.color_ramp
    cr.elements[0].position = stops[0][0]
    cr.elements[0].color = (*srgb(stops[0][1]), 1)
    cr.elements[1].position = stops[-1][0]
    cr.elements[1].color = (*srgb(stops[-1][1]), 1)
    for pos, col in stops[1:-1]:
        e = cr.elements.new(pos)
        e.color = (*srgb(col), 1)
    return ramp


def wood(name='Wood', light='#C89A64', dark='#8A5A2E', scale=6.0, roughness=0.45, coat=0.25, along='X', rings=1.0, seed=0.0, straight=False):
    """Procedural wood grain (long grain along X by default)."""
    mat, nt, bsdf = node_material(name)
    stretch = {'X': (0.08, 1.0, 1.0), 'Y': (1.0, 0.08, 1.0), 'Z': (1.0, 1.0, 0.08)}[along]
    tc = nt.nodes.new('ShaderNodeTexCoord')
    mp = nt.nodes.new('ShaderNodeMapping')
    mp.inputs['Scale'].default_value = tuple(scale * s for s in stretch)
    # push the ring centre far away so the rings read as gently curving straight grain
    far = {'X': (seed, seed * 0.7, 12.0 + seed), 'Y': (seed * 0.7, seed, 12.0 + seed), 'Z': (seed, 12.0 + seed, seed * 0.7)}[along]
    mp.inputs['Location'].default_value = far
    nt.links.new(tc.outputs['Object'], mp.inputs['Vector'])
    noise = nt.nodes.new('ShaderNodeTexNoise')
    noise.inputs['Scale'].default_value = 2.0
    noise.inputs['Detail'].default_value = 6
    noise.inputs['Distortion'].default_value = 0.6
    nt.links.new(mp.outputs[0], noise.inputs['Vector'])
    wave = nt.nodes.new('ShaderNodeTexWave')
    if straight:
        # straight quarter-sawn grain: bands across the board, distorted by noise
        wave.wave_type = 'BANDS'
        wave.bands_direction = {'X': 'Y', 'Y': 'X', 'Z': 'X'}[along]
    else:
        wave.wave_type = 'RINGS'
    wave.inputs['Scale'].default_value = 2.6 * rings
    wave.inputs['Distortion'].default_value = 3.0
    wave.inputs['Detail'].default_value = 4
    wave.inputs['Detail Scale'].default_value = 1.5
    mix = nt.nodes.new('ShaderNodeMix')
    mix.data_type = 'VECTOR'
    mix.inputs['Factor'].default_value = 0.12
    nt.links.new(mp.outputs[0], mix.inputs[4])
    nt.links.new(noise.outputs['Color'], mix.inputs[5])
    nt.links.new(mix.outputs[1], wave.inputs['Vector'])
    ramp = _ramp(nt, [(0.0, dark), (0.45, light), (0.75, light), (1.0, dark)])
    nt.links.new(wave.outputs['Fac'], ramp.inputs['Fac'])
    fine = nt.nodes.new('ShaderNodeTexNoise')
    fine.inputs['Scale'].default_value = 60.0
    fine.inputs['Detail'].default_value = 3
    nt.links.new(mp.outputs[0], fine.inputs['Vector'])
    mixc = nt.nodes.new('ShaderNodeMix')
    mixc.data_type = 'RGBA'
    mixc.blend_type = 'MULTIPLY'
    mixc.inputs['Factor'].default_value = 0.18
    nt.links.new(ramp.outputs['Color'], mixc.inputs[6])
    nt.links.new(fine.outputs['Color'], mixc.inputs[7])
    nt.links.new(mixc.outputs[2], bsdf.inputs['Base Color'])
    bump = nt.nodes.new('ShaderNodeBump')
    bump.inputs['Strength'].default_value = 0.08
    nt.links.new(wave.outputs['Fac'], bump.inputs['Height'])
    nt.links.new(bump.outputs['Normal'], bsdf.inputs['Normal'])
    bsdf.inputs['Roughness'].default_value = roughness
    bsdf.inputs['Coat Weight'].default_value = coat
    bsdf.inputs['Coat Roughness'].default_value = 0.15
    return mat


def marble(name='Marble', base='#F2F0EC', vein='#8E8A84', vein2='#C9B79A', scale=2.0, roughness=0.08, polish=True,
           vein_width=0.04, seed=0.0, warp=8.0):
    mat, nt, bsdf = node_material(name)
    mp = _coords(nt, scale)
    mp.inputs['Location'].default_value = (seed, seed * 0.37, 0)
    noise = nt.nodes.new('ShaderNodeTexNoise')
    noise.inputs['Scale'].default_value = 1.4
    noise.inputs['Detail'].default_value = 10
    noise.inputs['Roughness'].default_value = 0.62
    noise.inputs['Distortion'].default_value = 0.8
    nt.links.new(mp.outputs[0], noise.inputs['Vector'])
    wave = nt.nodes.new('ShaderNodeTexNoise')
    wave.inputs['Scale'].default_value = 0.9
    wave.inputs['Detail'].default_value = 14
    wave.inputs['Roughness'].default_value = 0.58
    wave.inputs['Distortion'].default_value = warp * 0.18
    nt.links.new(mp.outputs[0], wave.inputs['Vector'])
    sub = nt.nodes.new('ShaderNodeMath')
    sub.operation = 'SUBTRACT'
    sub.inputs[1].default_value = 0.5
    nt.links.new(wave.outputs['Fac'], sub.inputs[0])
    ab = nt.nodes.new('ShaderNodeMath')
    ab.operation = 'ABSOLUTE'
    nt.links.new(sub.outputs[0], ab.inputs[0])
    vr = nt.nodes.new('ShaderNodeMapRange')
    vr.inputs['From Min'].default_value = 0.0
    vr.inputs['From Max'].default_value = vein_width
    vr.inputs['To Min'].default_value = 1.0
    vr.inputs['To Max'].default_value = 0.0
    nt.links.new(ab.outputs[0], vr.inputs['Value'])
    mul = nt.nodes.new('ShaderNodeMath')
    mul.operation = 'MULTIPLY'
    nt.links.new(vr.outputs[0], mul.inputs[0])
    nt.links.new(noise.outputs['Fac'], mul.inputs[1])
    pw = nt.nodes.new('ShaderNodeMath')
    pw.operation = 'MULTIPLY'
    pw.inputs[1].default_value = 1.6
    nt.links.new(mul.outputs[0], pw.inputs[0])
    clouds = _ramp(nt, [(0.3, base), (0.7, vein2)])
    nt.links.new(noise.outputs['Fac'], clouds.inputs['Fac'])
    mixc = nt.nodes.new('ShaderNodeMix')
    mixc.data_type = 'RGBA'
    mixc.inputs[7].default_value = (*srgb(vein), 1)
    clamp = nt.nodes.new('ShaderNodeClamp')
    nt.links.new(pw.outputs[0], clamp.inputs['Value'])
    nt.links.new(clamp.outputs[0], mixc.inputs['Factor'])
    soft = nt.nodes.new('ShaderNodeMix')
    soft.data_type = 'RGBA'
    soft.inputs['Factor'].default_value = 0.35
    nt.links.new(clouds.outputs['Color'], soft.inputs[6])
    soft.inputs[7].default_value = (*srgb(base), 1)
    nt.links.new(soft.outputs[2], mixc.inputs[6])
    nt.links.new(mixc.outputs[2], bsdf.inputs['Base Color'])
    bsdf.inputs['Roughness'].default_value = roughness
    if polish:
        bsdf.inputs['Coat Weight'].default_value = 0.6
        bsdf.inputs['Coat Roughness'].default_value = 0.04
    return mat


def stone(name='Stone', light='#BDB7AE', dark='#8F8A82', scale=3.0, roughness=0.6, speckle=0.0, speckle_color='#555555', bump=0.15, coat=0.0):
    """Concrete / travertine / terrazzo-like mottled surfaces."""
    mat, nt, bsdf = node_material(name)
    mp = _coords(nt, scale)
    noise = nt.nodes.new('ShaderNodeTexNoise')
    noise.inputs['Scale'].default_value = 3.0
    noise.inputs['Detail'].default_value = 12
    noise.inputs['Roughness'].default_value = 0.6
    nt.links.new(mp.outputs[0], noise.inputs['Vector'])
    ramp = _ramp(nt, [(0.35, dark), (0.65, light)])
    nt.links.new(noise.outputs['Fac'], ramp.inputs['Fac'])
    color_out = ramp.outputs['Color']
    if speckle > 0:
        vor = nt.nodes.new('ShaderNodeTexVoronoi')
        vor.inputs['Scale'].default_value = 45.0
        vor.inputs['Randomness'].default_value = 1.0
        nt.links.new(mp.outputs[0], vor.inputs['Vector'])
        thr = nt.nodes.new('ShaderNodeMath')
        thr.operation = 'LESS_THAN'
        thr.inputs[1].default_value = speckle
        nt.links.new(vor.outputs['Distance'], thr.inputs[0])
        mixs = nt.nodes.new('ShaderNodeMix')
        mixs.data_type = 'RGBA'
        nt.links.new(thr.outputs[0], mixs.inputs['Factor'])
        nt.links.new(color_out, mixs.inputs[6])
        nt.links.new(vor.outputs['Color'], mixs.inputs[7])
        tint = nt.nodes.new('ShaderNodeMix')
        tint.data_type = 'RGBA'
        tint.blend_type = 'MULTIPLY'
        tint.inputs['Factor'].default_value = 1.0
        nt.links.new(mixs.outputs[2], tint.inputs[6])
        tint.inputs[7].default_value = (*srgb(speckle_color), 1)
        sel = nt.nodes.new('ShaderNodeMix')
        sel.data_type = 'RGBA'
        nt.links.new(thr.outputs[0], sel.inputs['Factor'])
        nt.links.new(color_out, sel.inputs[6])
        nt.links.new(tint.outputs[2], sel.inputs[7])
        color_out = sel.outputs[2]
    nt.links.new(color_out, bsdf.inputs['Base Color'])
    bp = nt.nodes.new('ShaderNodeBump')
    bp.inputs['Strength'].default_value = bump
    fine = nt.nodes.new('ShaderNodeTexNoise')
    fine.inputs['Scale'].default_value = 80
    nt.links.new(mp.outputs[0], fine.inputs['Vector'])
    nt.links.new(fine.outputs['Fac'], bp.inputs['Height'])
    nt.links.new(bp.outputs['Normal'], bsdf.inputs['Normal'])
    bsdf.inputs['Roughness'].default_value = roughness
    bsdf.inputs['Coat Weight'].default_value = coat
    return mat


def image_material(name, path, roughness=0.3, coat=0.0, scale=(1, 1), bump=0.0, metallic=0.0, projection='UV'):
    mat, nt, bsdf = node_material(name)
    tex = nt.nodes.new('ShaderNodeTexImage')
    tex.image = bpy.data.images.load(path, check_existing=True)
    tex.interpolation = 'Cubic'
    tc = nt.nodes.new('ShaderNodeTexCoord')
    mp = nt.nodes.new('ShaderNodeMapping')
    mp.inputs['Scale'].default_value = (scale[0], scale[1], 1)
    nt.links.new(tc.outputs['UV'], mp.inputs['Vector'])
    nt.links.new(mp.outputs[0], tex.inputs['Vector'])
    nt.links.new(tex.outputs['Color'], bsdf.inputs['Base Color'])
    bsdf.inputs['Roughness'].default_value = roughness
    bsdf.inputs['Coat Weight'].default_value = coat
    bsdf.inputs['Metallic'].default_value = metallic
    if bump:
        bp = nt.nodes.new('ShaderNodeBump')
        bp.inputs['Strength'].default_value = bump
        nt.links.new(tex.outputs['Color'], bp.inputs['Height'])
        nt.links.new(bp.outputs['Normal'], bsdf.inputs['Normal'])
    return mat


def fabric_bag(name='Bag', color='#B89A70', roughness=0.85, weave=140.0):
    """Woven polypropylene / kraft paper bag."""
    mat, nt, bsdf = node_material(name)
    mp = _coords(nt, 1.0)
    wv = nt.nodes.new('ShaderNodeTexWave')
    wv.inputs['Scale'].default_value = weave
    wv.inputs['Distortion'].default_value = 0.4
    nt.links.new(mp.outputs[0], wv.inputs['Vector'])
    bp = nt.nodes.new('ShaderNodeBump')
    bp.inputs['Strength'].default_value = 0.05
    nt.links.new(wv.outputs['Fac'], bp.inputs['Height'])
    nt.links.new(bp.outputs['Normal'], bsdf.inputs['Normal'])
    bsdf.inputs['Base Color'].default_value = (*srgb(color), 1)
    bsdf.inputs['Roughness'].default_value = roughness
    return mat


# ----------------------------------------------------------- geometry tools


def superellipse(rx, ry, n=2.0, segments=48, cx=0.0, cy=0.0, rot=0.0):
    pts = []
    for i in range(segments):
        t = 2 * math.pi * i / segments
        c, s = math.cos(t), math.sin(t)
        x = rx * math.copysign(abs(c) ** (2 / n), c)
        y = ry * math.copysign(abs(s) ** (2 / n), s)
        if rot:
            x, y = x * math.cos(rot) - y * math.sin(rot), x * math.sin(rot) + y * math.cos(rot)
        pts.append((cx + x, cy + y))
    return pts


def loft(name, rings, mat=None, segments=48, cap_start=True, cap_end=True, subsurf=2, smooth=True):
    """
    Build a mesh by connecting horizontal rings.
    rings: list of dicts {z, rx, ry, n=2, cx=0, cy=0} (superellipse cross sections),
    ordered along the surface (they may go up and then back down for vessels).
    """
    verts, faces = [], []
    for ring in rings:
        pts = superellipse(ring['rx'], ring['ry'], ring.get('n', 2.0), segments, ring.get('cx', 0.0), ring.get('cy', 0.0), ring.get('rot', 0.0))
        for x, y in pts:
            verts.append((x, y, ring['z']))
    count = len(rings)
    for r in range(count - 1):
        a, b = r * segments, (r + 1) * segments
        for i in range(segments):
            j = (i + 1) % segments
            faces.append((a + i, a + j, b + j, b + i))
    if cap_start:
        faces.append(tuple(reversed(range(segments))))
    if cap_end:
        base = (count - 1) * segments
        faces.append(tuple(base + i for i in range(segments)))
    obj = mesh_object(name, verts, faces, mat, smooth)
    # normals consistent
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(obj.data)
    bm.free()
    if subsurf:
        mod = obj.modifiers.new('Subsurf', 'SUBSURF')
        mod.levels = subsurf
        mod.render_levels = subsurf
    return obj


def lathe(name, profile, mat=None, segments=64, subsurf=1, smooth=True):
    """Revolve a list of (radius, z) points around Z (profile ordered along the surface)."""
    rings = [{'z': z, 'rx': max(r, 1e-5), 'ry': max(r, 1e-5)} for r, z in profile]
    return loft(name, rings, mat, segments=segments, cap_start=profile[0][0] > 1e-4, cap_end=profile[-1][0] > 1e-4,
                subsurf=subsurf, smooth=smooth)


def box(name, size, location=(0, 0, 0), mat=None, bevel=0.0, segments=3, rotation=(0, 0, 0)):
    bpy.ops.mesh.primitive_cube_add(size=1, location=location, rotation=rotation)
    obj = bpy.context.active_object
    obj.name = name
    obj.scale = size
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    if bevel > 0:
        mod = obj.modifiers.new('Bevel', 'BEVEL')
        mod.width = bevel
        mod.segments = segments
        mod.limit_method = 'ANGLE'
        mod.harden_normals = False
        bpy.ops.object.shade_smooth()
        obj.data.polygons.foreach_set('use_smooth', [True] * len(obj.data.polygons))
        try:
            bpy.ops.object.shade_auto_smooth(angle=math.radians(40))
        except Exception:
            pass
    if mat:
        obj.data.materials.append(mat)
    return obj


def cylinder(name, radius, depth, location=(0, 0, 0), mat=None, vertices=64, rotation=(0, 0, 0), bevel=0.0, smooth=True):
    bpy.ops.mesh.primitive_cylinder_add(radius=radius, depth=depth, vertices=vertices, location=location, rotation=rotation)
    obj = bpy.context.active_object
    obj.name = name
    if bevel > 0:
        mod = obj.modifiers.new('Bevel', 'BEVEL')
        mod.width = bevel
        mod.segments = 3
        mod.limit_method = 'ANGLE'
    if smooth:
        bpy.ops.object.shade_smooth()
        try:
            bpy.ops.object.shade_auto_smooth(angle=math.radians(40))
        except Exception:
            pass
    if mat:
        obj.data.materials.append(mat)
    return obj


def sphere(name, radius, location=(0, 0, 0), mat=None, scale=(1, 1, 1), segments=48):
    bpy.ops.mesh.primitive_uv_sphere_add(radius=radius, location=location, segments=segments, ring_count=segments // 2)
    obj = bpy.context.active_object
    obj.name = name
    obj.scale = scale
    bpy.ops.object.shade_smooth()
    if mat:
        obj.data.materials.append(mat)
    return obj


def torus(name, major, minor, location=(0, 0, 0), mat=None, rotation=(0, 0, 0)):
    bpy.ops.mesh.primitive_torus_add(major_radius=major, minor_radius=minor, location=location, rotation=rotation,
                                     major_segments=72, minor_segments=24)
    obj = bpy.context.active_object
    obj.name = name
    bpy.ops.object.shade_smooth()
    if mat:
        obj.data.materials.append(mat)
    return obj


def tube(name, points, radius, mat=None, resolution=24, handle='AUTO', caps=True):
    """A pipe/hose/spout following a smooth path through 3D points."""
    curve = bpy.data.curves.new(name, 'CURVE')
    curve.dimensions = '3D'
    curve.resolution_u = resolution
    curve.bevel_depth = radius
    curve.bevel_resolution = 8
    curve.use_fill_caps = caps
    spline = curve.splines.new('BEZIER')
    spline.bezier_points.add(len(points) - 1)
    for bp, p in zip(spline.bezier_points, points):
        bp.co = p
        bp.handle_left_type = handle
        bp.handle_right_type = handle
    obj = bpy.data.objects.new(name, curve)
    link(obj)
    if mat:
        obj.data.materials.append(mat)
    return obj


def poly_tube(name, points, radius, mat=None, caps=True):
    """Straight-segment tube (POLY spline) – good for pipes with sharp bends."""
    curve = bpy.data.curves.new(name, 'CURVE')
    curve.dimensions = '3D'
    curve.bevel_depth = radius
    curve.bevel_resolution = 10
    curve.use_fill_caps = caps
    spline = curve.splines.new('POLY')
    spline.points.add(len(points) - 1)
    for sp, p in zip(spline.points, points):
        sp.co = (*p, 1)
    obj = bpy.data.objects.new(name, curve)
    link(obj)
    if mat:
        obj.data.materials.append(mat)
    return obj


def boolean(target, cutter, operation='DIFFERENCE', apply=True, hide=True):
    mod = target.modifiers.new('Bool', 'BOOLEAN')
    mod.operation = operation
    mod.object = cutter
    mod.solver = 'EXACT'
    if apply:
        bpy.context.view_layer.objects.active = target
        # apply preceding modifiers too so the boolean acts on final shape
        for m in list(target.modifiers):
            bpy.ops.object.modifier_apply(modifier=m.name)
    if hide:
        bpy.data.objects.remove(cutter, do_unlink=True)
    return target


def apply_mods(obj):
    bpy.context.view_layer.objects.active = obj
    for m in list(obj.modifiers):
        bpy.ops.object.modifier_apply(modifier=m.name)
    return obj


def parent_all(objs, name='Group'):
    empty = bpy.data.objects.new(name, None)
    link(empty)
    for o in objs:
        o.parent = empty
    return empty


def transform(objs, location=(0, 0, 0), rotation=(0, 0, 0), scale=1.0):
    """Move/rotate a list of objects as a group around the origin."""
    empty = parent_all(objs)
    empty.location = location
    empty.rotation_euler = Euler([math.radians(a) for a in rotation])
    empty.scale = (scale, scale, scale)
    bpy.context.view_layer.update()
    return empty


def uv_unwrap(obj, method='cube', size=1.0):
    bpy.context.view_layer.objects.active = obj
    for o in bpy.context.selected_objects:
        o.select_set(False)
    obj.select_set(True)
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    if method == 'cube':
        bpy.ops.uv.cube_project(cube_size=size)
    elif method == 'smart':
        bpy.ops.uv.smart_project()
    else:
        bpy.ops.uv.reset()
    bpy.ops.object.mode_set(mode='OBJECT')
    return obj


def top_face_uv(obj):
    """Map the UVs of a box so the +Z face shows the full 0..1 texture (others too, stretched)."""
    me = obj.data
    if not me.uv_layers:
        me.uv_layers.new()
    uv = me.uv_layers.active.data
    xs = [v.co.x for v in me.vertices]
    ys = [v.co.y for v in me.vertices]
    x0, x1, y0, y1 = min(xs), max(xs), min(ys), max(ys)
    for poly in me.polygons:
        for li in poly.loop_indices:
            v = me.vertices[me.loops[li].vertex_index].co
            uv[li].uv = ((v.x - x0) / (x1 - x0 or 1), (v.y - y0) / (y1 - y0 or 1))
    return obj

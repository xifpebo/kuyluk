"""
Batch renderer for Stroy Bazar catalog photos.

    node tools/render/export-jobs.js            # writes tools/render/jobs.json
    python tools/render/render.py [--samples N] [--size PX] [--limit N]

Each job: {out, m, a, c, bg} for a product photo or {out, cover: [...], bg} for
a wide shop cover. Requires the `bpy` module (pip install bpy==4.5.*).
"""
import json
import math
import os
import sys
import time
import traceback

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

import bpy  # noqa: E402
from mathutils import Vector  # noqa: E402
import studio as S  # noqa: E402
import models_bath  # noqa: E402
import models_build  # noqa: E402
import models_eng  # noqa: E402

MODULES = (models_bath, models_build, models_eng)
TEXTURES = os.path.join(HERE, 'textures')


def find_model(name):
    for module in MODULES:
        fn = getattr(module, name, None)
        if fn:
            return fn
    raise KeyError(f'Unknown model {name}')


def build(name, args):
    args = dict(args or {})
    if name == 'wallpaper_rolls':
        args = {'texture_path': os.path.join(TEXTURES, f"{args.get('texture', 'linen')}.png")}
    if name == 'tile_display' and 'size' in args:
        args['size'] = tuple(args['size'])
    if name == 'tile_panel' and 'tile' in args:
        args['tile'] = tuple(args['tile'])
    if name == 'flooring' and 'plank_size' in args:
        args['plank_size'] = tuple(args['plank_size'])
    result = find_model(name)(**args)
    if isinstance(result, tuple):
        result = result[1]
    return [o for o in result if o is not None]


def hex_to_linear(value):
    return S.srgb(value)


# Named presets used by shop covers (several products in one wide scene).
COVER_PRESETS = {
    'bathtub_free': ('bathtub', {'kind': 'freestanding'}),
    'vanity': ('vanity', {'width': 0.8, 'finish': 'oak', 'handle': 'black'}),
    'toilet_wall': ('toilet_wall', {}),
    'toilet_floor': ('toilet_floor', {}),
    'install': ('install_frame', {}),
    'tile_calacatta': ('tile_display', {'kind': 'calacatta'}),
    'tile_hex': ('tile_panel', {'kind': 'matte', 'color': ['#3E6B5A', '#42705F'], 'tile': (0.1, 0.1), 'cols': 6, 'rows': 7, 'hexagon': True, 'grout': '#E2DFD8'}),
    'tile_wood': ('flooring', {'kind': 'oak'}),
    'door_oak': ('door_interior', {'finish': 'oak'}),
    'door_white': ('door_interior', {'finish': 'white', 'style': 'vertical_glass'}),
    'door_entrance': ('door_entrance', {}),
    'pail_blue': ('paint_pail', {'paint': '#2F6F8F', 'accent': '#2F6F8F', 'size': 10}),
    'pail_green': ('paint_pail', {'paint': '#9AAE92', 'accent': '#9AAE92', 'size': 5, 'open_lid': True}),
    'can_red': ('paint_can', {'paint': '#B5281F'}),
    'floor_oak': ('flooring', {'kind': 'natural_oak'}),
    'floor_walnut': ('flooring', {'kind': 'walnut', 'herringbone': True}),
    'pipes': ('pipe_bundle', {'stripe': '#C62828'}),
    'valve': ('ball_valve', {'size': 2.2}),
    'fittings': ('fitting_set', {}),
    'pendant': ('pendant_lamp', {}),
    'socket': ('socket_switch', {'count': 2}),
    'cable': ('cable_coil', {}),
    'bags': ('bag', {'stack': 2, 'band': '#1F5FA8'}),
    'bricks': ('bricks', {}),
    'drywall': ('drywall_stack', {}),
    'radiator': ('radiator', {'sections': 8}),
    'boiler': ('gas_boiler', {}),
    'heater': ('water_heater', {}),
    'drill': ('drill', {}),
    'grinder': ('angle_grinder', {}),
    'level': ('spirit_level', {}),
    'ksink': ('kitchen_sink', {'material_kind': 'granite'}),
    'counter': ('countertop', {}),
    'kfaucet': ('faucet_kitchen', {}),
}


def roots_of(objs):
    roots = []
    for o in objs:
        r = o
        while r.parent is not None:
            r = r.parent
        if r not in roots:
            roots.append(r)
    return roots


def bounds(objs):
    deps = bpy.context.evaluated_depsgraph_get()
    pts = []
    for obj in objs:
        ev = obj.evaluated_get(deps) if obj.type == 'MESH' else obj
        for corner in ev.bound_box:
            pts.append(obj.matrix_world @ Vector(corner))
    lo = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
    hi = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
    return lo, hi


def normalize_height(objs, target):
    """Scale a model group to a comparable visual size (keeps covers balanced)."""
    lo, hi = bounds(objs)
    h = max(hi.z - lo.z, 0.62 * max(hi.x - lo.x, hi.y - lo.y))
    if h <= 0:
        return
    k = target / h
    for r in roots_of(objs):
        r.scale = (r.scale.x * k, r.scale.y * k, r.scale.z * k)
        r.location = r.location * k
    bpy.context.view_layer.update()


def render_cover(job, samples, size=1000):
    S.reset()
    scene = bpy.context.scene
    scene.render.resolution_x, scene.render.resolution_y = (1600, 640) if size >= 1000 else (size * 2, int(size * 0.8))
    bg = hex_to_linear(job.get('bg', '#9A9A98'))
    S.studio(backdrop_color=tuple(c * 0.9 for c in bg), scale=1.3)
    groups = []
    for key in job['cover']:
        name, args = COVER_PRESETS[key]
        objs = build(name, args)
        bpy.context.view_layer.update()
        normalize_height(objs, 1.0)
        groups.append(objs)
    x = 0.0
    placed = []
    for objs in groups:
        lo, hi = bounds(objs)
        width = hi.x - lo.x
        shift = x - lo.x
        for r in roots_of(objs):
            r.location.x += shift
            r.location.y -= (lo.y + hi.y) / 2
        bpy.context.view_layer.update()
        x += width + 0.35
        placed += objs
    S.frame_camera(placed, azimuth=-12, elevation=12, lens=55, margin=1.08)
    S.render(job['out'], samples=samples)


def render_product(job, samples, size):
    S.reset()
    bg = job.get('bg')
    if bg:
        S.studio(backdrop_color=hex_to_linear(bg))
    else:
        S.studio()
    objs = build(job['m'], job.get('a'))
    bpy.context.view_layer.update()
    cam = dict(job.get('c') or {})
    S.frame_camera(objs, **cam)
    S.render(job['out'], samples=samples, resolution=(size, size))


def main():
    argv = sys.argv[1:]
    samples = int(argv[argv.index('--samples') + 1]) if '--samples' in argv else 80
    size = int(argv[argv.index('--size') + 1]) if '--size' in argv else 1000
    limit = int(argv[argv.index('--limit') + 1]) if '--limit' in argv else None
    jobs_file = argv[argv.index('--jobs') + 1] if '--jobs' in argv else os.path.join(HERE, 'jobs.json')
    with open(jobs_file) as fh:
        jobs = json.load(fh)
    if limit:
        jobs = jobs[:limit]
    outdir = argv[argv.index('--outdir') + 1] if '--outdir' in argv else None
    if outdir:
        jobs = [dict(job, out=os.path.join(outdir, os.path.basename(job['out']))) for job in jobs]
    failures = 0
    for i, job in enumerate(jobs, 1):
        os.makedirs(os.path.dirname(job['out']), exist_ok=True)
        started = time.time()
        try:
            if 'cover' in job:
                render_cover(job, samples, size)
            else:
                render_product(job, samples, size)
            print(f'[{i}/{len(jobs)}] OK {os.path.basename(job["out"])} {time.time() - started:.1f}s', flush=True)
        except Exception:  # keep going; report at the end
            failures += 1
            print(f'[{i}/{len(jobs)}] FAIL {job["out"]}', flush=True)
            traceback.print_exc()
    print(f'done, {failures} failures', flush=True)


if __name__ == '__main__':
    main()

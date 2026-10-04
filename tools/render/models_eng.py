"""Engineering products: pipes, fittings, valves, heating, electrical, lighting, kitchen, power tools."""
import math
import random
from studio import (loft, lathe, box, cylinder, sphere, torus, tube, poly_tube, material, ceramic, matte_ceramic,
                    chrome, gold, black_metal, brushed, plastic, glass, frosted_glass, stone, marble, srgb, transform,
                    boolean, fabric_bag)


# ----------------------------------------------------------------- pipes

def pipe_bundle(color='#F4F4F2', stripe='#2C6FD1', diameter=0.025, count=7, length=0.42, stripe2=None):
    r = diameter / 2
    pm = plastic(color, 0.35, 'Pipe', coat=0.2)
    sm = plastic(stripe, 0.35, 'Stripe')
    parts = []
    positions = [(0, 0)]
    for k in range(6):
        a = k * math.pi / 3
        positions.append((math.cos(a) * diameter * 1.02, math.sin(a) * diameter * 1.02))
    for i, (y, z) in enumerate(positions[:count]):
        x_off = random.Random(i).uniform(-0.08, 0.08)
        outer = cylinder('Pipe%d' % i, r, length, (x_off, y, z + r * 3.2), pm, rotation=(0, math.pi / 2, 0), vertices=48)
        inner = cylinder('Cut%d' % i, r * 0.72, length + 0.02, (x_off, y, z + r * 3.2), None, rotation=(0, math.pi / 2, 0), vertices=48)
        boolean(outer, inner)
        parts.append(outer)
        # thin stripes along the pipe
        for s_idx, ang in enumerate((math.pi / 2,) if not stripe2 else (math.pi / 2, -math.pi / 2)):
            st = box('St%d' % i, (length * 0.98, 0.0025, 0.0006), (x_off, y + math.cos(ang) * 0.0, z + r * 3.2 + r + 0.0001), sm if s_idx == 0 else plastic(stripe2, 0.35, 'Stripe2'))
            parts.append(st)
    parts = transform(parts, rotation=(0, 0, 25)) and parts
    return parts


def sewer_pipe(color='#8E9196', diameter=0.11, length=1.0, socket=True, extra=True):
    r = diameter / 2
    pm = plastic(color, 0.4, 'PVC', coat=0.15)
    parts = []

    def one(x, y, L, rot):
        prof = [(r, 0.0), (r, L), (r * 1.06, L + 0.01), (r * 1.08, L + 0.02), (r * 1.08, L + 0.09), (r * 1.06, L + 0.1),
                (r * 0.94, L + 0.1), (r * 0.94, L + 0.03), (r * 0.9, L + 0.02), (r * 0.9, 0.0)]
        if not socket:
            prof = [(r, 0.0), (r, L), (r * 0.9, L), (r * 0.9, 0.0)]
        prof = prof + [(r * 0.999, 0.0)]
        o = lathe('Sewer', prof, pm, segments=64, subsurf=0)
        o.data.polygons.foreach_set('use_smooth', [True] * len(o.data.polygons))
        o.rotation_euler = (0, math.pi / 2, rot)
        o.location = (x, y, r * 1.08)
        return o

    parts.append(one(-length / 2, 0, length, 0))
    if extra:
        parts.append(one(-length / 2 + 0.1, r * 2.3, length * 0.8, 0.0))
        # elbow fitting next to pipes
        el = tube('Elbow', [(0.45, -0.25, r * 1.1), (0.45, -0.25 + 0.12, r * 1.1), (0.45 + 0.12, -0.25 + 0.12, r * 1.1)], r * 1.06, pm, resolution=24, handle='VECTOR')
        parts.append(el)
    return parts


def fitting_set(kind='ppr', color='#F4F4F2'):
    """Assorted fittings: elbow, tee, coupling, threaded adapter."""
    pm = plastic(color, 0.35, 'Fit', coat=0.2) if kind != 'brass' else gold('Brass', brushed_finish=True)
    br = gold('BrassInsert')
    r = 0.016
    parts = []
    # elbow 90
    parts.append(poly_tube('Elbow', [(-0.12, 0, r), (-0.12, 0.05, r), (-0.07, 0.05, r)], r, pm))
    parts.append(cylinder('ElbowSock1', r * 1.15, 0.03, (-0.12, -0.0, r), pm, rotation=(math.pi / 2, 0, 0)))
    parts.append(cylinder('ElbowSock2', r * 1.15, 0.03, (-0.075, 0.05, r), pm, rotation=(0, math.pi / 2, 0)))
    # tee
    parts.append(cylinder('Tee', r * 1.12, 0.1, (0.05, 0.0, r * 1.12), pm, rotation=(0, math.pi / 2, 0), bevel=0.002))
    parts.append(cylinder('TeeB', r * 1.12, 0.05, (0.05, 0.025, r * 1.12), pm, rotation=(math.pi / 2, 0, 0), bevel=0.002))
    # coupling
    parts.append(cylinder('Coupling', r * 1.14, 0.06, (-0.04, -0.09, r * 1.14), pm, rotation=(0, math.pi / 2, 0.4), bevel=0.002))
    # threaded adapter (plastic + brass hex)
    parts.append(cylinder('Adapter', r * 1.12, 0.04, (0.12, -0.08, r * 1.12), pm, rotation=(0, math.pi / 2, 0), bevel=0.002))
    parts.append(cylinder('Hex', r * 1.25, 0.022, (0.152, -0.08, r * 1.25), br, vertices=6, rotation=(0, math.pi / 2, 0)))
    parts.append(cylinder('Thread', r * 0.95, 0.025, (0.175, -0.08, r * 1.25), br, rotation=(0, math.pi / 2, 0)))
    return parts


def ball_valve(handle='lever', color='#C62828', size=1.0):
    s = size
    brass = gold('Brass', brushed_finish=True)
    nickel = brushed('#D0D3D6', 0.16, 'Nickel')
    parts = [sphere('Body', 0.026 * s, (0, 0, 0.03 * s), nickel, scale=(1.0, 0.95, 0.95))]
    for x in (-1, 1):
        parts.append(cylinder('Neck', 0.017 * s, 0.03 * s, (x * 0.035 * s, 0, 0.03 * s), nickel, rotation=(0, math.pi / 2, 0)))
        parts.append(cylinder('Hex', 0.021 * s, 0.018 * s, (x * 0.058 * s, 0, 0.03 * s), nickel, vertices=6, rotation=(0, math.pi / 2, 0)))
        parts.append(cylinder('Thread', 0.016 * s, 0.014 * s, (x * 0.074 * s, 0, 0.03 * s), brass, rotation=(0, math.pi / 2, 0)))
    parts.append(cylinder('Stem', 0.008 * s, 0.025 * s, (0, 0, 0.06 * s), nickel))
    hm = plastic(color, 0.35, 'Handle', coat=0.3)
    if handle == 'butterfly':
        parts.append(box('Wing', (0.06 * s, 0.022 * s, 0.006 * s), (0, 0, 0.075 * s), hm, bevel=0.003))
        parts.append(cylinder('Hub', 0.01 * s, 0.012 * s, (0, 0, 0.072 * s), hm))
    else:
        parts.append(box('Lever', (0.11 * s, 0.018 * s, 0.006 * s), (0.04 * s, 0, 0.076 * s), hm, bevel=0.003))
        parts.append(cylinder('Hub', 0.011 * s, 0.012 * s, (0, 0, 0.072 * s), hm))
    parts.append(cylinder('Nut', 0.005 * s, 0.006 * s, (0, 0, 0.081 * s), nickel, vertices=6))
    return parts


def flex_hoses(count=2, length=0.5):
    braid = brushed('#C7CACE', 0.35, 'Braid')
    nut = chrome('Nut')
    parts = []
    for i in range(count):
        y = i * 0.05
        pts = [(-0.2, y, 0.012), (-0.05, y + 0.08, 0.012), (0.1, y - 0.04, 0.012), (0.22, y + 0.03, 0.012)]
        parts.append(tube('Hose%d' % i, pts, 0.0065, braid))
        parts.append(cylinder('NutA%d' % i, 0.011, 0.02, (-0.21, y, 0.012), nut, vertices=6, rotation=(0, math.pi / 2, 0)))
        parts.append(cylinder('NutB%d' % i, 0.008, 0.025, (0.235, y + 0.03, 0.012), nut, rotation=(0, math.pi / 2, 0)))
    return parts


def manifold(outlets=4):
    brass = gold('Brass', brushed_finish=True)
    parts = [cylinder('Bar', 0.017, 0.06 + outlets * 0.05, (0, 0, 0.05), brass, rotation=(0, math.pi / 2, 0), vertices=6)]
    for i in range(outlets):
        x = -outlets * 0.025 + 0.025 + i * 0.05
        parts.append(cylinder('Out', 0.009, 0.05, (x, -0.03, 0.05), brass, rotation=(math.pi / 2, 0, 0)))
        parts.append(cylinder('Valve', 0.012, 0.03, (x, 0, 0.075), brass))
        parts.append(cylinder('Cap', 0.012, 0.012, (x, 0, 0.095), plastic('#2C6FD1' if i % 2 else '#C62828', 0.35, 'Cap%d' % i)))
    return parts


# --------------------------------------------------------------- heating

def water_heater(liters=80, color='#F4F4F2', display=True, flat=False):
    h = 0.45 + liters / 100 * 0.45
    body = plastic(color, 0.25, 'Shell', coat=0.6)
    parts = []
    if flat:
        parts.append(loft('Body', [dict(z=0.0, rx=0.25, ry=0.13, n=4.5), dict(z=0.01, rx=0.26, ry=0.14, n=4.5),
                                   dict(z=h, rx=0.26, ry=0.14, n=4.5), dict(z=h + 0.01, rx=0.25, ry=0.13, n=4.5)], body, segments=64))
        fz, fy = h * 0.6, -0.141
    else:
        r = 0.22
        parts.append(lathe('Body', [(0.001, 0.0), (r * 0.7, 0.0), (r * 0.95, 0.02), (r, 0.06), (r, h - 0.06), (r * 0.95, h - 0.02),
                                    (r * 0.7, h), (0.001, h)], body, segments=72, subsurf=2))
        fz, fy = h * 0.55, -r
    parts.append(box('Panel', (0.16, 0.012, 0.09), (0, fy - 0.002, fz), black_metal('PanelM'), bevel=0.01))
    if display:
        parts.append(box('LCD', (0.07, 0.004, 0.03), (-0.02, fy - 0.009, fz + 0.01),
                         material('LCD', (0.1, 0.4, 0.9), 0.2, emission=(0.2, 0.6, 1.0), emission_strength=4)))
        parts.append(cylinder('Knob', 0.016, 0.01, (0.045, fy - 0.01, fz), chrome('Knob'), rotation=(math.pi / 2, 0, 0)))
    for x in (-0.05, 0.05):
        parts.append(cylinder('Pipe', 0.009, 0.05, (x, 0, -0.02), chrome('PipeC%d' % int(x * 100))))
    return parts


def radiator(sections=10, kind='aluminum', color='#F4F4F2', height=0.58):
    m = plastic(color, 0.3, 'RadPaint', coat=0.4)
    parts = []
    if kind == 'panel':
        L = sections * 0.08 + 0.2
        for k, y in enumerate((0.0, 0.07)):
            parts.append(box('Panel%d' % k, (L, 0.02, height), (0, y, height / 2), m, bevel=0.004))
            for i in range(int(L / 0.033)):
                parts.append(box('Rib', (0.004, 0.004, height - 0.04), (-L / 2 + 0.02 + i * 0.033, y - 0.011, height / 2), m))
        parts.append(box('Grill', (L, 0.09, 0.012), (0, 0.035, height + 0.006), m, bevel=0.002))
        parts.append(box('SideL', (0.012, 0.09, height), (-L / 2 - 0.004, 0.035, height / 2), m, bevel=0.002))
        parts.append(box('SideR', (0.012, 0.09, height), (L / 2 + 0.004, 0.035, height / 2), m, bevel=0.002))
    else:
        w = 0.08
        for i in range(sections):
            x = (i - (sections - 1) / 2) * w
            parts.append(box('Sec%d' % i, (w - 0.006, 0.08, height), (x, 0, height / 2), m, bevel=0.01, segments=3))
            parts.append(box('Fin%d' % i, (w - 0.02, 0.02, height - 0.12), (x, -0.045, height / 2), m, bevel=0.006))
        parts.append(cylinder('Valve', 0.012, 0.06, ((sections / 2) * w + 0.03, 0, height - 0.06), chrome('Vlv'), rotation=(0, math.pi / 2, 0)))
    return parts


def gas_boiler(color='#F4F4F2', width=0.4):
    m = plastic(color, 0.25, 'Case', coat=0.5)
    parts = [box('Case', (width, 0.3, 0.7), (0, 0, 0.35 + 0.1), m, bevel=0.02, segments=4)]
    parts.append(box('Panel', (width * 0.9, 0.012, 0.12), (0, -0.152, 0.2), black_metal('Panel'), bevel=0.01))
    parts.append(box('LCD', (0.08, 0.004, 0.035), (-0.05, -0.159, 0.21), material('LCD', (0.2, 0.2, 0.2), 0.2, emission=(0.3, 0.7, 1.0), emission_strength=3)))
    for x in (0.05, 0.11):
        parts.append(cylinder('Knob', 0.018, 0.012, (x, -0.16, 0.2), chrome('Knob%d' % int(x * 100)), rotation=(math.pi / 2, 0, 0)))
    for i, x in enumerate((-0.12, -0.06, 0.0, 0.06, 0.12)):
        parts.append(cylinder('Pipe%d' % i, 0.009, 0.1, (x, 0.0, 0.05), brushed('#C8A060' if i % 2 else '#C9CBCF', 0.3, 'P%d' % i)))
    parts.append(cylinder('Flue', 0.05, 0.12, (0, 0.0, 0.86), plastic('#F0F0F0', 0.4, 'Flue')))
    return parts


# ------------------------------------------------------------ electrical

def cable_coil(color='#F2F2F2', cores=3, thickness=0.012):
    m = plastic(color, 0.35, 'Sheath', coat=0.2)
    parts = []
    turns = 9
    R = 0.16
    pts = []
    for i in range(turns * 24):
        a = i / 24 * 2 * math.pi
        layer = (i // 24) % 3
        rr = R - layer * thickness * 0.95 + math.sin(i * 0.37) * 0.003
        pts.append((math.cos(a) * rr, math.sin(a) * rr, thickness / 2 + (i // 72) * thickness * 0.9 + (i % 24) / 24 * 0.0))
    parts.append(poly_tube('Coil', pts, thickness / 2, m))
    # loose end with stripped cores
    end = [(R, 0, thickness / 2), (R + 0.06, -0.05, thickness / 2), (R + 0.12, -0.18, thickness / 2)]
    parts.append(tube('End', end, thickness / 2, m))
    core_cols = ['#8B5A2B', '#1E62C9', '#3FA34D'] if cores == 3 else ['#8B5A2B', '#1E62C9']
    for k, c in enumerate(core_cols):
        off = (k - (len(core_cols) - 1) / 2) * thickness * 0.45
        parts.append(tube('Core%d' % k, [(R + 0.12, -0.18 + off, thickness / 2), (R + 0.15, -0.24 + off, thickness / 2)], thickness * 0.17,
                          plastic(c, 0.35, 'Ins%d' % k)))
        parts.append(tube('Cu%d' % k, [(R + 0.15, -0.24 + off, thickness / 2), (R + 0.16, -0.265 + off, thickness / 2)], thickness * 0.09,
                          material('Copper', srgb('#C27A44'), 0.25, metallic=1.0)))
    paper = fabric_bag('Tag', '#F4E9C8', 0.7, 200)
    parts.append(box('Label', (0.09, 0.06, 0.002), (0, 0, turns * thickness * 0.95 + thickness), paper))
    return parts


def socket_switch(color='#F6F6F4', kind='socket', count=2, frame='#F6F6F4', insert='#F6F6F4'):
    fm = plastic(frame, 0.3, 'Frame', coat=0.4) if frame not in ('gold', 'black_metal') else (gold('Frame') if frame == 'gold' else black_metal('Frame'))
    im = plastic(insert, 0.3, 'Insert', coat=0.4)
    parts = []
    W = 0.086
    parts.append(box('Frame', (W * count - 0.0 * count, 0.01, W), (0, 0, W / 2), fm, bevel=0.006, segments=4))
    for i in range(count):
        x = (i - (count - 1) / 2) * W
        if kind == 'socket' or (kind == 'combo' and i == 0):
            parts.append(cylinder('Cup', 0.025, 0.006, (x, -0.007, W / 2), im, rotation=(math.pi / 2, 0, 0), bevel=0.002))
            for dx in (-0.01, 0.01):
                parts.append(cylinder('Hole', 0.0026, 0.004, (x + dx, -0.0105, W / 2), material('HoleM', (0.02, 0.02, 0.02), 0.9),
                                      rotation=(math.pi / 2, 0, 0)))
            for dz in (-0.017, 0.017):
                parts.append(box('Earth', (0.006, 0.003, 0.003), (x, -0.0095, W / 2 + dz), brushed('#C9CBCF', 0.3, 'Earth')))
        else:
            parts.append(box('Key', (0.052, 0.008, 0.052), (x, -0.009, W / 2), im, bevel=0.003))
            parts.append(box('KeyLine', (0.001, 0.002, 0.05), (x, -0.0135, W / 2), material('KL', srgb('#C9C9C9'), 0.5)))
    return parts


def breakers(count=4, kind='mcb'):
    """Row of DIN-rail modular circuit breakers, front facing the camera (-Y)."""
    body = plastic('#F2F2F0', 0.35, 'MCB')
    parts = [box('Rail', (count * 0.018 + 0.05, 0.008, 0.035), (0, 0.03, 0.045), brushed('#C9CCCF', 0.3, 'DIN'))]
    tog = plastic('#2B2B2B' if kind == 'mcb' else '#1E62C9', 0.4, 'Tog')
    for i in range(count):
        x = (i - (count - 1) / 2) * 0.0182
        parts.append(box('M%d' % i, (0.0175, 0.055, 0.09), (x, 0, 0.045), body, bevel=0.0015))
        parts.append(box('Face%d' % i, (0.0175, 0.012, 0.045), (x, -0.032, 0.045), body, bevel=0.002))
        parts.append(box('Tog%d' % i, (0.008, 0.02, 0.012), (x, -0.044, 0.052), tog, bevel=0.002))
        parts.append(box('Win%d' % i, (0.009, 0.002, 0.006), (x, -0.0385, 0.03), plastic('#2E8B57', 0.4, 'Win%d' % i)))
        for z in (0.006, 0.084):
            parts.append(cylinder('Screw%d' % i, 0.0028, 0.003, (x, -0.0285, z), brushed('#A9ADB1', 0.3, 'Scr'), rotation=(math.pi / 2, 0, 0)))
    return parts


def led_panel(size=0.6, round_shape=False):
    frame = plastic('#F4F4F2', 0.3, 'Frame')
    diff = material('Diff', (1, 1, 1), 0.4, emission=(1.0, 0.98, 0.94), emission_strength=5.0)
    if round_shape:
        parts = [cylinder('Frame', size / 2, 0.025, (0, 0, 0.0125), frame, bevel=0.003),
                 cylinder('Diffuser', size / 2 - 0.012, 0.002, (0, 0, 0.026), diff)]
    else:
        parts = [box('Frame', (size, size, 0.012), (0, 0, 0.006), frame, bevel=0.002),
                 box('Diffuser', (size - 0.02, size - 0.02, 0.002), (0, 0, 0.0125), diff)]
        parts.append(box('Driver', (0.1, 0.06, 0.03), (0.38, -0.15, 0.015), plastic('#F0F0F0', 0.4, 'Drv'), bevel=0.003))
    return transform(parts, location=(0, 0, size * 0.5 + 0.02), rotation=(70, 0, 0)) and parts


def pendant_lamp(shade='black', shape='dome'):
    sm = black_metal('Shade') if shade == 'black' else (gold('Shade') if shade == 'gold' else plastic('#F2F2F0', 0.3, 'Shade'))
    parts = []
    if shape == 'dome':
        prof = [(0.001, 0.0), (0.03, 0.0), (0.04, -0.02), (0.1, -0.08), (0.16, -0.17), (0.17, -0.2), (0.166, -0.2),
                (0.155, -0.172), (0.097, -0.085), (0.038, -0.03), (0.028, -0.01), (0.001, -0.01)]
    else:
        prof = [(0.001, 0.0), (0.05, 0.0), (0.06, -0.01), (0.07, -0.25), (0.066, -0.25), (0.056, -0.012), (0.001, -0.012)]
    o = lathe('Shade', prof, sm, segments=72, subsurf=1)
    o.location = (0, 0, 0.5)
    parts.append(o)
    bulb = material('Bulb', (1, 1, 1), 0.2, emission=(1.0, 0.85, 0.6), emission_strength=12)
    parts.append(sphere('Bulb', 0.035, (0, 0, 0.5 - 0.09), bulb))
    parts.append(cylinder('Cord', 0.003, 0.5, (0, 0, 0.75), plastic('#1A1A1A', 0.5, 'Cord')))
    parts.append(cylinder('Canopy', 0.05, 0.03, (0, 0, 1.0), sm))
    return parts


def led_bulb(kind='a60'):
    glass_m = material('Milk', (0.95, 0.95, 0.93), 0.3, transmission=0.3, emission=(1, 0.95, 0.85), emission_strength=0.3)
    base = brushed('#C9CBCF', 0.3, 'Base')
    neck = plastic('#F2F2F2', 0.4, 'Neck')
    prof = [(0.001, 0.115), (0.02, 0.113), (0.03, 0.105), (0.03, 0.08), (0.025, 0.06), (0.015, 0.045)]
    parts = [lathe('Globe', [(0.001, 0.115), (0.022, 0.112), (0.03, 0.098), (0.03, 0.078), (0.024, 0.062), (0.016, 0.052), (0.015, 0.05)], glass_m)]
    parts.append(lathe('Neck', [(0.0155, 0.052), (0.015, 0.035), (0.0135, 0.03)], neck))
    parts.append(lathe('Screw', [(0.0135, 0.03), (0.0135, 0.008), (0.009, 0.002), (0.001, 0.0)], base))
    for i in range(5):
        parts.append(torus('Thread%d' % i, 0.0133, 0.0011, (0, 0, 0.011 + i * 0.0042), base))
    return parts


# ----------------------------------------------------------------- kitchen

def kitchen_sink(material_kind='steel', bowls=1, color='#2B2B2D'):
    if material_kind == 'granite':
        m = stone('Granite', light='#3A3A3C', dark='#262628', scale=8, roughness=0.55, speckle=0.06, speckle_color='#9A9A9A')
        if color == 'beige':
            m = stone('Granite', light='#D9CDBA', dark='#C9BCA6', scale=8, roughness=0.55, speckle=0.06, speckle_color='#8B7F6E')
    else:
        m = brushed('#CDD0D3', 0.22, 'Steel')
    W, D = (0.78 if bowls == 1 else 1.0), 0.5
    parts = []
    rim = [dict(z=0.0, rx=W / 2, ry=D / 2, n=8), dict(z=0.012, rx=W / 2, ry=D / 2, n=8), dict(z=0.015, rx=W / 2 - 0.006, ry=D / 2 - 0.006, n=8)]
    if bowls == 1:
        rim += [dict(z=0.016, rx=W / 2 - 0.05, ry=D / 2 - 0.05, n=6), dict(z=0.0, rx=W / 2 - 0.055, ry=D / 2 - 0.055, n=6),
                dict(z=-0.18, rx=W / 2 - 0.07, ry=D / 2 - 0.07, n=5), dict(z=-0.19, rx=W / 2 - 0.09, ry=D / 2 - 0.09, n=4)]
        parts.append(loft('Sink', rim, m, segments=96))
        parts.append(cylinder('Drain', 0.045, 0.004, (0, 0, -0.188), chrome('DrainK')))
    else:
        parts.append(box('Top', (W, D, 0.015), (0, 0, 0.0075), m, bevel=0.006))
        for x in (-0.22, 0.24):
            cut = box('Cut', (0.4, 0.38, 0.4), (x, 0, -0.18), None, bevel=0.03)
            boolean(parts[0], cut)
            bowl = loft('Bowl', [dict(z=0.012, rx=0.2, ry=0.19, n=6), dict(z=-0.18, rx=0.19, ry=0.18, n=5), dict(z=-0.19, rx=0.17, ry=0.16, n=4)], m,
                        segments=64, cap_start=False)
            bowl.location.x = x
            parts.append(bowl)
    parts += _mini_faucet(m if material_kind == 'steel' else chrome('FaucetC'), (0, D / 2 - 0.06, 0.015))
    # the bowl hangs below the rim: lift the whole sink so it rests on the studio floor
    return transform(parts, location=(0, 0, 0.192)) and parts


def _mini_faucet(m, loc):
    x, y, z = loc
    return [cylinder('FBase', 0.026, 0.01, (x, y, z + 0.005), m),
            cylinder('FBody', 0.02, 0.2, (x, y, z + 0.1), m),
            tube('FNeck', [(x, y, z + 0.2), (x, y, z + 0.3), (x, y - 0.06, z + 0.36), (x, y - 0.17, z + 0.34), (x, y - 0.2, z + 0.28)], 0.012, m)]


def countertop(kind='calacatta', thickness=0.02):
    from models_build import tile_material
    m = tile_material(kind)
    parts = [box('Slab', (1.2, 0.62, thickness), (0, 0, thickness / 2 + 0.06), m, bevel=0.003)]
    parts.append(box('Sample', (0.3, 0.3, thickness), (0.75, -0.35, thickness / 2), m, bevel=0.003, rotation=(0, 0, 0.3)))
    parts.append(box('Riser', (1.1, 0.5, 0.06), (0, 0.02, 0.03), material('Riser', srgb('#5A5C60'), 0.6)))
    return parts


def range_hood(finish='steel', width=0.6):
    m = brushed('#CDD0D3', 0.22, 'Hood') if finish == 'steel' else black_metal('Hood')
    parts = [box('Canopy', (width, 0.5, 0.05), (0, 0, 0.025), m, bevel=0.003)]
    # tapered pyramid between canopy and chimney (flat faces, crisp edges)
    hood = loft('Pyramid', [dict(z=0.05, rx=width / 2 - 0.005, ry=0.245, cy=0.0, n=12),
                            dict(z=0.2, rx=0.13, ry=0.1, cy=0.07, n=12)], m, segments=64, subsurf=0, smooth=False)
    parts.append(hood)
    parts.append(box('Chimney', (0.26, 0.2, 0.6), (0, 0.07, 0.5), m, bevel=0.002))
    parts.append(box('Panel', (0.2, 0.006, 0.022), (0, -0.252, 0.025), black_metal('Btns'), bevel=0.002))
    for i, x in enumerate((-0.06, -0.02, 0.02, 0.06)):
        parts.append(cylinder('Btn%d' % i, 0.005, 0.004, (x, -0.256, 0.025), chrome('B%d' % i), rotation=(math.pi / 2, 0, 0)))
    led = material('Led', (1, 1, 1), 0.3, emission=(1.0, 0.95, 0.85), emission_strength=8)
    for x in (-0.16, 0.16):
        parts.append(cylinder('Led%d' % int(x * 100), 0.018, 0.002, (x, -0.05, -0.001), led))
    return parts


# -------------------------------------------------------------- power tools

def drill(color='#E46A1C', kind='drill'):
    """Cordless drill / hammer drill product shot."""
    bm = plastic(color, 0.35, 'Housing', coat=0.2)
    dark = plastic('#232325', 0.55, 'Rubber')
    parts = []
    L = 0.2 if kind == 'drill' else 0.3
    parts.append(loft('Motor', [dict(z=-0.02, rx=0.03, ry=0.032), dict(z=0.0, rx=0.034, ry=0.036), dict(z=L * 0.7, rx=0.034, ry=0.038),
                                dict(z=L * 0.75, rx=0.03, ry=0.032)], bm, segments=48))
    parts[-1].rotation_euler = (0, math.pi / 2, 0)
    parts[-1].location = (-0.05, 0, 0.21)
    parts.append(cylinder('Chuck', 0.022, 0.05, (L * 0.7 - 0.02, 0, 0.21), dark, rotation=(0, math.pi / 2, 0), bevel=0.004))
    parts.append(cylinder('ChuckTip', 0.014, 0.02, (L * 0.7 + 0.015, 0, 0.21), brushed('#AEB2B6', 0.3, 'Jaw'), rotation=(0, math.pi / 2, 0)))
    parts.append(loft('Grip', [dict(z=0.05, rx=0.022, ry=0.03, n=2.4), dict(z=0.12, rx=0.02, ry=0.026, n=2.4), dict(z=0.18, rx=0.024, ry=0.03, n=2.4)],
                      dark, segments=40))
    parts[-1].location = (-0.01, 0, 0.0)
    parts[-1].rotation_euler = (0, math.radians(-12), 0)
    parts.append(box('Battery', (0.11, 0.075, 0.06), (0.0, 0, 0.03), plastic('#2A2A2C', 0.45, 'Batt'), bevel=0.008))
    parts.append(box('BattBand', (0.112, 0.077, 0.012), (0.0, 0, 0.045), bm, bevel=0.004))
    parts.append(box('Trigger', (0.012, 0.016, 0.03), (0.025, 0, 0.16), dark, bevel=0.004))
    if kind == 'hammer':
        parts.append(loft('SideGrip', [dict(z=0, rx=0.016, ry=0.016), dict(z=0.11, rx=0.018, ry=0.018)], dark, segments=24))
        parts[-1].location = (0.12, -0.03, 0.21)
        parts[-1].rotation_euler = (math.radians(70), 0, 0)
    return transform(parts, rotation=(0, 0, 20)) and parts


def angle_grinder(color='#1E62C9'):
    bm = plastic(color, 0.35, 'Housing', coat=0.2)
    dark = plastic('#232325', 0.55, 'Rubber')
    parts = [loft('Body', [dict(z=0.0, rx=0.03, ry=0.03), dict(z=0.2, rx=0.034, ry=0.034), dict(z=0.25, rx=0.03, ry=0.03)], bm, segments=40)]
    parts[0].rotation_euler = (0, math.pi / 2, 0)
    parts[0].location = (-0.15, 0, 0.06)
    parts.append(box('Head', (0.06, 0.06, 0.05), (0.12, 0, 0.06), brushed('#9EA2A6', 0.35, 'Gear'), bevel=0.01))
    parts.append(cylinder('Guard', 0.064, 0.006, (0.14, 0.0, 0.025), brushed('#B9BCC0', 0.3, 'Guard')))
    parts.append(cylinder('Disc', 0.0625, 0.0025, (0.14, 0, 0.018), material('Disc', srgb('#4A4A4C'), 0.6)))
    parts.append(cylinder('Tail', 0.022, 0.06, (-0.18, 0, 0.06), dark, rotation=(0, math.pi / 2, 0)))
    parts.append(loft('SideH', [dict(z=0, rx=0.013, ry=0.013), dict(z=0.09, rx=0.015, ry=0.015)], dark, segments=24))
    parts[-1].location = (0.1, -0.03, 0.06)
    parts[-1].rotation_euler = (math.radians(90), 0, 0)
    return parts

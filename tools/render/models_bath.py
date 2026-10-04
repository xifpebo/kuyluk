"""Bathroom products: toilets, basins, vanities, bathtubs, showers, faucets."""
import math
from studio import (loft, lathe, box, cylinder, sphere, torus, tube, poly_tube, material, ceramic, matte_ceramic,
                    chrome, gold, black_metal, brushed, plastic, glass, frosted_glass, wood, marble, srgb, transform,
                    boolean, apply_mods, superellipse, mesh_object)


def finish_metal(finish):
    if finish == 'black':
        return black_metal('MetalFinish')
    if finish == 'gold':
        return gold('MetalFinish')
    if finish == 'gunmetal':
        return brushed('#5A5C60', 0.25, 'MetalFinish')
    if finish == 'steel':
        return brushed('#C8CACD', 0.3, 'MetalFinish')
    return chrome('MetalFinish')


def body_mat(color):
    if color in ('black', 'matte_black'):
        return matte_ceramic('#232325', 'Body')
    if color == 'gray':
        return matte_ceramic('#8E9092', 'Body')
    if color == 'beige':
        return ceramic('#E9DFCF', 'Body')
    return ceramic('#F5F5F3', 'Body')


# -------------------------------------------------------------- toilets

def toilet_floor(color='white', rimless=True, tank=True, square=False):
    """Close-coupled floor-standing toilet with tank and a closed soft-close lid."""
    mat = body_mat(color)
    n = 3.2 if square else 2.2
    rings = [
        dict(z=0.0, rx=0.125, ry=0.17, cy=0.07, n=n + 0.3),
        dict(z=0.015, rx=0.126, ry=0.172, cy=0.07, n=n + 0.3),
        dict(z=0.12, rx=0.118, ry=0.17, cy=0.06, n=n + 0.2),
        dict(z=0.24, rx=0.142, ry=0.205, cy=0.03, n=n),
        dict(z=0.33, rx=0.176, ry=0.25, cy=-0.01, n=n),
        dict(z=0.385, rx=0.181, ry=0.258, cy=-0.015, n=n),
        dict(z=0.40, rx=0.178, ry=0.255, cy=-0.015, n=n),
        dict(z=0.401, rx=0.15, ry=0.222, cy=-0.02, n=n),
        dict(z=0.385, rx=0.142, ry=0.212, cy=-0.02, n=n),
        dict(z=0.30, rx=0.12, ry=0.17, cy=-0.025, n=n),
        dict(z=0.22, rx=0.07, ry=0.09, cy=-0.01),
        dict(z=0.20, rx=0.05, ry=0.06, cy=0.0),
    ]
    parts = [loft('Bowl', rings, mat, segments=64, cap_start=True, cap_end=True)]
    if tank:
        # deck behind the bowl supporting the tank
        parts.append(loft('Deck', [
            dict(z=0.28, rx=0.15, ry=0.09, cy=0.17, n=3.5),
            dict(z=0.40, rx=0.17, ry=0.1, cy=0.17, n=3.5),
            dict(z=0.405, rx=0.168, ry=0.098, cy=0.17, n=3.5),
        ], mat, cap_start=True, cap_end=True))
        tank_rings = [
            dict(z=0.40, rx=0.175, ry=0.085, cy=0.215, n=4.0 if square else 3.2),
            dict(z=0.43, rx=0.182, ry=0.09, cy=0.215, n=4.0 if square else 3.2),
            dict(z=0.76, rx=0.182, ry=0.09, cy=0.215, n=4.0 if square else 3.2),
            dict(z=0.765, rx=0.18, ry=0.088, cy=0.215, n=4.0 if square else 3.2),
        ]
        parts.append(loft('Tank', tank_rings, mat, cap_start=True, cap_end=True))
        parts.append(loft('TankLid', [
            dict(z=0.762, rx=0.188, ry=0.095, cy=0.215, n=4.5 if square else 3.4),
            dict(z=0.79, rx=0.19, ry=0.097, cy=0.215, n=4.5 if square else 3.4),
            dict(z=0.795, rx=0.183, ry=0.09, cy=0.215, n=4.5 if square else 3.4),
        ], mat))
        cm = chrome('FlushChrome')
        parts.append(cylinder('Flush', 0.032, 0.012, (0, 0.215, 0.80), cm, bevel=0.002))
        parts.append(box('FlushSplit', (0.004, 0.064, 0.004), (0.006, 0.215, 0.806), material('Gap', srgb('#9A9A9A'), 0.4)))
    # seat + lid
    parts.append(loft('Seat', [
        dict(z=0.401, rx=0.176, ry=0.25, cy=-0.02, n=n),
        dict(z=0.418, rx=0.178, ry=0.252, cy=-0.02, n=n),
        dict(z=0.42, rx=0.176, ry=0.25, cy=-0.02, n=n),
    ], mat))
    parts.append(loft('Lid', [
        dict(z=0.42, rx=0.176, ry=0.25, cy=-0.02, n=n),
        dict(z=0.432, rx=0.181, ry=0.256, cy=-0.02, n=n),
        dict(z=0.448, rx=0.176, ry=0.25, cy=-0.02, n=n),
        dict(z=0.452, rx=0.16, ry=0.232, cy=-0.02, n=n),
    ], mat))
    hm = chrome('HingeChrome')
    for x in (-0.09, 0.09):
        parts.append(cylinder('Hinge', 0.014, 0.03, (x, 0.235 if tank else 0.2, 0.425), hm, rotation=(0, math.pi / 2, 0)))
    return parts


def toilet_wall(color='white', square=False):
    """Wall-hung rimless toilet (bowl floating) with slim lid."""
    mat = body_mat(color)
    n = 3.0 if square else 2.3
    rings = [
        dict(z=0.10, rx=0.10, ry=0.14, cy=0.07, n=n + 0.6),
        dict(z=0.105, rx=0.11, ry=0.155, cy=0.065, n=n + 0.6),
        dict(z=0.22, rx=0.165, ry=0.235, cy=0.0, n=n),
        dict(z=0.31, rx=0.18, ry=0.265, cy=-0.025, n=n),
        dict(z=0.33, rx=0.178, ry=0.262, cy=-0.025, n=n),
        dict(z=0.331, rx=0.148, ry=0.225, cy=-0.03, n=n),
        dict(z=0.31, rx=0.14, ry=0.21, cy=-0.03, n=n),
        dict(z=0.22, rx=0.09, ry=0.12, cy=-0.02),
        dict(z=0.18, rx=0.05, ry=0.06, cy=-0.01),
    ]
    body = loft('Bowl', rings, mat, segments=64)
    # flat back: cut with a big box
    cut = box('Cut', (1, 0.4, 1), (0, 0.26 + 0.2, 0.2))
    boolean(body, cut)
    parts = [body]
    parts.append(loft('Lid', [
        dict(z=0.331, rx=0.176, ry=0.258, cy=-0.03, n=n),
        dict(z=0.345, rx=0.18, ry=0.263, cy=-0.03, n=n),
        dict(z=0.356, rx=0.176, ry=0.258, cy=-0.03, n=n),
        dict(z=0.36, rx=0.16, ry=0.24, cy=-0.03, n=n),
    ], mat))
    return parts


def install_frame(finish='chrome', plate_color='white'):
    """Concealed installation frame with a flush plate (shown as a product set)."""
    steel = plastic('#2B5FA8', 0.45, 'FramePaint')
    parts = []
    for x in (-0.2, 0.2):
        parts.append(box('Post', (0.04, 0.04, 1.12), (x, 0, 0.56), steel, bevel=0.004))
    parts.append(box('Rail', (0.44, 0.04, 0.04), (0, 0, 1.1), steel, bevel=0.004))
    parts.append(box('Rail2', (0.44, 0.04, 0.05), (0, 0, 0.42), steel, bevel=0.004))
    tankm = plastic('#E9E6DF', 0.5, 'Cistern')
    parts.append(box('Cistern', (0.36, 0.09, 0.42), (0, 0.035, 0.8), tankm, bevel=0.02))
    for x in (-0.11, 0.11):
        parts.append(cylinder('Stud', 0.007, 0.16, (x, -0.06, 0.25), brushed(), rotation=(math.pi / 2, 0, 0)))
    parts.append(cylinder('Outlet', 0.045, 0.2, (0, -0.06, 0.23), plastic('#F2F2F2', 0.4, 'PVC'), rotation=(math.pi / 2, 0, 0)))
    for x in (-0.2, 0.2):
        parts.append(box('Foot', (0.1, 0.12, 0.012), (x, -0.02, 0.006), steel))
    # flush plate floating in front
    pm = ceramic('#F5F5F3', 'Plate') if plate_color == 'white' else (black_metal('Plate') if plate_color == 'black' else chrome('Plate'))
    parts.append(box('FlushPlate', (0.245, 0.012, 0.165), (0.0, -0.075, 0.9), pm, bevel=0.006))
    bm = finish_metal(finish)
    parts.append(box('BtnL', (0.065, 0.006, 0.1), (-0.04, -0.084, 0.9), bm, bevel=0.004))
    parts.append(box('BtnR', (0.035, 0.006, 0.1), (0.035, -0.084, 0.9), bm, bevel=0.004))
    return parts


# ------------------------------------------------------------- faucets

def faucet_basin(finish='chrome', tall=False, style='round', location=(0, 0, 0), scale=1.0):
    m = finish_metal(finish)
    x0, y0, z0 = location
    s = scale
    h = 0.30 if tall else 0.16
    parts = []
    if style == 'square':
        parts.append(box('Base', (0.055 * s, 0.055 * s, 0.01 * s), (x0, y0, z0 + 0.005 * s), m, bevel=0.003))
        parts.append(box('Body', (0.045 * s, 0.045 * s, h * s), (x0, y0, z0 + h * s / 2), m, bevel=0.004))
        parts.append(box('Spout', (0.035 * s, 0.13 * s, 0.022 * s), (x0, y0 - 0.075 * s, z0 + (h - 0.02) * s), m, bevel=0.004))
        parts.append(box('Lever', (0.016 * s, 0.07 * s, 0.014 * s), (x0, y0 + 0.01 * s, z0 + (h + 0.012) * s), m, bevel=0.004,
                         rotation=(0.25, 0, 0)))
    else:
        parts.append(cylinder('Base', 0.028 * s, 0.01 * s, (x0, y0, z0 + 0.005 * s), m, bevel=0.002))
        parts.append(cylinder('Body', 0.022 * s, h * s, (x0, y0, z0 + h * s / 2), m, bevel=0.003))
        parts.append(tube('Spout', [(x0, y0, z0 + (h - 0.03) * s), (x0, y0 - 0.06 * s, z0 + (h - 0.015) * s),
                                    (x0, y0 - 0.12 * s, z0 + (h - 0.045) * s)], 0.011 * s, m))
        parts.append(cylinder('Aerator', 0.0125 * s, 0.012 * s, (x0, y0 - 0.12 * s, z0 + (h - 0.05) * s), m))
        parts.append(cylinder('Cap', 0.022 * s, 0.02 * s, (x0, y0, z0 + (h + 0.01) * s), m, bevel=0.004))
        parts.append(tube('Lever', [(x0, y0 + 0.0, z0 + (h + 0.02) * s), (x0, y0 + 0.05 * s, z0 + (h + 0.04) * s),
                                    (x0, y0 + 0.085 * s, z0 + (h + 0.05) * s)], 0.006 * s, m))
    return parts


def faucet_kitchen(finish='chrome', pull_out=True):
    m = finish_metal(finish)
    parts = [cylinder('Base', 0.032, 0.012, (0, 0, 0.006), m, bevel=0.003),
             cylinder('Body', 0.025, 0.24, (0, 0, 0.13), m, bevel=0.003)]
    pts = [(0, 0, 0.24), (0, 0, 0.36), (0, -0.04, 0.43), (0, -0.13, 0.44), (0, -0.2, 0.40), (0, -0.215, 0.33)]
    parts.append(tube('Neck', pts, 0.015, m, resolution=32))
    parts.append(cylinder('Head', 0.02, 0.07 if pull_out else 0.02, (0, -0.215, 0.30 if pull_out else 0.325), m, bevel=0.004))
    parts.append(tube('Lever', [(0.022, 0, 0.21), (0.06, 0, 0.225), (0.09, 0, 0.23)], 0.007, m))
    parts.append(cylinder('LeverHub', 0.014, 0.03, (0.028, 0, 0.21), m, rotation=(0, math.pi / 2, 0)))
    return parts


# --------------------------------------------------------------- basins

def basin_vessel(color='white', shape='round', width=0.42):
    mat = body_mat(color)
    r = width / 2
    if shape == 'oval':
        rx, ry, n = r, r * 0.72, 2.0
    elif shape == 'square':
        rx, ry, n = r, r * 0.85, 4.0
    else:
        rx, ry, n = r, r, 2.0
    rings = [
        dict(z=0.0, rx=rx * 0.55, ry=ry * 0.55, n=n),
        dict(z=0.004, rx=rx * 0.6, ry=ry * 0.6, n=n),
        dict(z=0.06, rx=rx * 0.9, ry=ry * 0.9, n=n),
        dict(z=0.13, rx=rx, ry=ry, n=n),
        dict(z=0.14, rx=rx * 0.99, ry=ry * 0.99, n=n),
        dict(z=0.141, rx=rx * 0.95, ry=ry * 0.95, n=n),
        dict(z=0.13, rx=rx * 0.93, ry=ry * 0.93, n=n),
        dict(z=0.04, rx=rx * 0.6, ry=ry * 0.6, n=n),
        dict(z=0.02, rx=rx * 0.2, ry=ry * 0.2, n=n),
    ]
    parts = [loft('Basin', rings, mat, segments=64)]
    parts.append(cylinder('Drain', 0.02, 0.004, (0, 0, 0.021), chrome('DrainC')))
    return parts


def countertop_slab(width=0.9, depth=0.5, mat=None, z=0.0, thickness=0.03):
    return box('Counter', (width, depth, thickness), (0, 0, z - thickness / 2), mat, bevel=0.003)


def basin_wall(color='white', width=0.6):
    """Wall-hung / pedestal rectangular basin with a tap hole and faucet."""
    mat = body_mat(color)
    w, d = width / 2, 0.23
    outer = [
        dict(z=0.0, rx=w * 0.82, ry=d * 0.7, cy=0.02, n=4.0),
        dict(z=0.10, rx=w * 0.97, ry=d * 0.95, n=4.0),
        dict(z=0.15, rx=w, ry=d, n=4.0),
        dict(z=0.152, rx=w * 0.995, ry=d * 0.99, n=4.0),
        dict(z=0.153, rx=w * 0.92, ry=d * 0.8, cy=-0.02, n=4.0),
        dict(z=0.14, rx=w * 0.9, ry=d * 0.76, cy=-0.02, n=4.0),
        dict(z=0.04, rx=w * 0.62, ry=d * 0.5, cy=-0.02, n=3.0),
        dict(z=0.03, rx=0.03, ry=0.03, cy=-0.02, n=2.0),
    ]
    parts = [loft('Basin', outer, mat, segments=72)]
    # back deck for the tap
    parts.append(box('Deck', (width * 0.96, 0.07, 0.03), (0, d * 0.82, 0.138), mat, bevel=0.012))
    parts += faucet_basin('chrome', location=(0, d * 0.82, 0.152), scale=0.9)
    parts.append(cylinder('Drain', 0.019, 0.004, (0, -0.02, 0.032), chrome('DrainC')))
    return parts


def vanity(width=0.8, finish='oak', handle='black', top='white', drawers=2, legs=False):
    """Wall-hung bathroom vanity with integrated ceramic basin and faucet."""
    if finish == 'oak':
        fm = wood('Front', light='#C9A273', dark='#A47C50', scale=2.5, along='X', straight=True)
    elif finish == 'walnut':
        fm = wood('Front', light='#7B5434', dark='#58391F', scale=2.5, along='X', straight=True)
    elif finish == 'graphite':
        fm = plastic('#3C3E42', 0.4, 'Front', coat=0.3)
    elif finish == 'green':
        fm = plastic('#5E7564', 0.45, 'Front', coat=0.2)
    else:
        fm = plastic('#F1F0EC', 0.25, 'Front', coat=0.6)
    w, d, h = width, 0.46, 0.5
    z0 = 0.25 if legs else 0.0
    parts = [box('Carcass', (w, d, h), (0, 0, z0 + h / 2), fm, bevel=0.004)]
    gap = material('Gap', srgb('#1A1A1A'), 0.8)
    hm = finish_metal(handle)
    rows = drawers
    for i in range(rows):
        zc = z0 + h * (i + 0.5) / rows
        parts.append(box('Drawer', (w - 0.012, 0.02, h / rows - 0.012), (0, -d / 2 - 0.006, zc), fm, bevel=0.003))
        parts.append(box('Handle', (w * 0.42, 0.018, 0.012), (0, -d / 2 - 0.02, zc + h / rows / 2 - 0.035), hm, bevel=0.003))
    parts.append(box('GapLine', (w - 0.01, 0.002, h - 0.01), (0, -d / 2 + 0.001, z0 + h / 2), gap))
    if legs:
        for x in (-w / 2 + 0.04, w / 2 - 0.04):
            for y in (-d / 2 + 0.05, d / 2 - 0.05):
                parts.append(cylinder('Leg', 0.012, 0.25, (x, y, 0.125), hm))
    # integrated top basin
    tm = body_mat(top)
    zt = z0 + h
    top_rings = [
        dict(z=zt, rx=w / 2 + 0.005, ry=d / 2 + 0.01, n=8),
        dict(z=zt + 0.045, rx=w / 2 + 0.006, ry=d / 2 + 0.012, n=8),
        dict(z=zt + 0.05, rx=w / 2 - 0.002, ry=d / 2 + 0.004, n=8),
        dict(z=zt + 0.051, rx=w / 2 - 0.07, ry=d / 2 - 0.09, cy=-0.025, n=4.5),
        dict(z=zt + 0.035, rx=w / 2 - 0.08, ry=d / 2 - 0.1, cy=-0.025, n=4.5),
        dict(z=zt - 0.06, rx=w / 2 - 0.16, ry=d / 2 - 0.15, cy=-0.025, n=3.0),
        dict(z=zt - 0.07, rx=0.03, ry=0.03, cy=-0.025, n=2),
    ]
    parts.append(loft('Top', top_rings, tm, segments=72))
    parts += faucet_basin('chrome' if handle != 'black' else 'black', location=(0, d / 2 - 0.06, zt + 0.05), scale=0.9)
    return parts


def mirror_cabinet(width=0.7, led=True):
    frame = plastic('#EDEDEB', 0.3, 'MirrorFrame')
    mir = material('Mirror', (0.95, 0.96, 0.97), 0.02, metallic=1.0)
    parts = [box('Cab', (width, 0.13, 0.7), (0, 0, 0.35), frame, bevel=0.004)]
    parts.append(box('DoorL', (width / 2 - 0.004, 0.012, 0.69), (-width / 4, -0.071, 0.35), mir, bevel=0.002))
    parts.append(box('DoorR', (width / 2 - 0.004, 0.012, 0.69), (width / 4, -0.071, 0.35), mir, bevel=0.002))
    if led:
        led_m = material('LED', (1, 1, 1), 0.3, emission=(1, 0.95, 0.85), emission_strength=6)
        parts.append(box('LedTop', (width * 0.9, 0.02, 0.012), (0, -0.06, -0.008), led_m))
    return parts


# ------------------------------------------------------------- bathtubs

def bathtub(kind='built_in', length=1.7, width=0.75, color='white', panel=True):
    mat = body_mat(color)
    L, W = length / 2, width / 2
    parts = []
    if kind == 'freestanding':
        rings = [
            dict(z=0.0, rx=L * 0.78, ry=W * 0.72, n=2.4),
            dict(z=0.01, rx=L * 0.8, ry=W * 0.74, n=2.4),
            dict(z=0.3, rx=L * 0.95, ry=W * 0.93, n=2.4),
            dict(z=0.58, rx=L, ry=W, n=2.4),
            dict(z=0.6, rx=L * 0.995, ry=W * 0.99, n=2.4),
            dict(z=0.601, rx=L * 0.965, ry=W * 0.92, n=2.4),
            dict(z=0.57, rx=L * 0.955, ry=W * 0.9, n=2.4),
            dict(z=0.15, rx=L * 0.8, ry=W * 0.68, n=2.6),
            dict(z=0.06, rx=L * 0.68, ry=W * 0.5, n=2.8),
            dict(z=0.055, rx=L * 0.6, ry=W * 0.4, n=2.8),
        ]
        parts.append(loft('Tub', [dict(r, cx=0) for r in rings], mat, segments=96, subsurf=2))
        parts += faucet_floor_stand()
    else:
        outer = [
            dict(z=0.0, rx=L, ry=W, n=10),
            dict(z=0.58, rx=L, ry=W, n=10),
            dict(z=0.6, rx=L - 0.003, ry=W - 0.003, n=10),
            dict(z=0.601, rx=L - 0.07, ry=W - 0.07, n=5.5),
            dict(z=0.57, rx=L - 0.09, ry=W - 0.085, n=5.0),
            dict(z=0.2, rx=L - 0.2, ry=W - 0.16, n=3.6),
            dict(z=0.08, rx=L - 0.28, ry=W - 0.2, n=3.2),
            dict(z=0.075, rx=L - 0.33, ry=W - 0.23, n=3.0),
        ]
        parts.append(loft('Tub', outer, mat, segments=96, subsurf=2))
        parts.append(cylinder('Drain', 0.03, 0.004, (-L + 0.4, 0, 0.078), chrome('DrainC')))
        parts.append(cylinder('Overflow', 0.03, 0.01, (-L + 0.115, 0, 0.45), chrome('OverflowC'), rotation=(0, math.pi / 2, 0)))
    return parts


def faucet_floor_stand(finish='chrome'):
    m = finish_metal(finish)
    x = 1.0
    parts = [cylinder('Foot', 0.05, 0.012, (x, 0, 0.006), m, bevel=0.003),
             cylinder('Pillar', 0.022, 0.86, (x, 0, 0.43), m)]
    parts.append(tube('Spout', [(x, 0, 0.84), (x, 0, 0.95), (x - 0.06, 0, 1.0), (x - 0.16, 0, 0.98), (x - 0.2, 0, 0.92)], 0.014, m))
    parts.append(cylinder('Mixer', 0.03, 0.08, (x, 0, 0.78), m, bevel=0.004))
    parts.append(cylinder('HandShower', 0.017, 0.2, (x + 0.05, 0, 0.66), m, bevel=0.004))
    return parts


# -------------------------------------------------------------- showers

def shower_column(finish='chrome', head='round', thermostat=True):
    m = finish_metal(finish)
    parts = []
    parts.append(cylinder('Riser', 0.012, 1.1, (0, 0, 0.75), m))
    parts.append(tube('Arm', [(0, 0, 1.28), (0, 0, 1.32), (0, -0.05, 1.35), (0, -0.32, 1.35)], 0.011, m))
    if head == 'square':
        parts.append(box('Head', (0.3, 0.3, 0.012), (0, -0.33, 1.335), m, bevel=0.004))
        nozzle_area = box('Nozzles', (0.27, 0.27, 0.002), (0, -0.33, 1.328), plastic('#2B2B2B', 0.5, 'Rubber'))
        parts.append(nozzle_area)
    else:
        parts.append(cylinder('Head', 0.15, 0.012, (0, -0.33, 1.335), m, bevel=0.004))
        parts.append(cylinder('Nozzles', 0.135, 0.002, (0, -0.33, 1.328), plastic('#2B2B2B', 0.5, 'Rubber')))
    if thermostat:
        parts.append(cylinder('Thermo', 0.03, 0.3, (0, -0.05, 0.25), m, rotation=(0, math.pi / 2, 0), bevel=0.003))
        parts.append(cylinder('KnobL', 0.034, 0.04, (-0.17, -0.05, 0.25), m, rotation=(0, math.pi / 2, 0), bevel=0.004))
        parts.append(cylinder('KnobR', 0.034, 0.04, (0.17, -0.05, 0.25), m, rotation=(0, math.pi / 2, 0), bevel=0.004))
        parts.append(tube('Conn', [(0, -0.05, 0.25), (0, -0.03, 0.25), (0, 0, 0.25)], 0.012, m))
    else:
        parts.append(cylinder('Mixer', 0.03, 0.12, (0, -0.05, 0.25), m, bevel=0.004))
        parts.append(tube('Lever', [(0, -0.07, 0.31), (0, -0.12, 0.32)], 0.008, m))
    # hand shower on a slider
    parts.append(cylinder('Slider', 0.018, 0.05, (0, -0.02, 0.85), m, bevel=0.003))
    parts.append(_hand_shower(m))
    hose = brushed('#C8CBCF', 0.25, 'Hose')
    parts.append(tube('HoseT', [(0, -0.06, 0.62), (0.03, -0.12, 0.35), (0.06, -0.1, 0.12), (0.03, -0.06, 0.2), (0, -0.05, 0.23)], 0.007, hose))
    return [p for p in parts if p is not None]


def _hand_shower(m):
    obj = loft('HandShower', [
        dict(z=0.60, rx=0.011, ry=0.011),
        dict(z=0.62, rx=0.012, ry=0.012),
        dict(z=0.80, rx=0.016, ry=0.016),
        dict(z=0.85, rx=0.034, ry=0.034),
        dict(z=0.865, rx=0.036, ry=0.036),
        dict(z=0.87, rx=0.033, ry=0.033),
    ], m, segments=48)
    obj.location = (0, -0.06, 0.0)
    obj.rotation_euler = (math.radians(12), 0, 0)
    return obj


def shower_enclosure(width=0.9, profile='chrome', glass_kind='clear', tray='white'):
    """Quadrant / square enclosure with stone tray and glass panels."""
    w = width / 2
    parts = []
    tm = body_mat(tray) if tray != 'stone' else matte_ceramic('#E6E3DD', 'Tray')
    parts.append(loft('Tray', [
        dict(z=0.0, rx=w, ry=w, n=8), dict(z=0.045, rx=w, ry=w, n=8), dict(z=0.05, rx=w - 0.004, ry=w - 0.004, n=8),
        dict(z=0.051, rx=w - 0.04, ry=w - 0.04, n=6), dict(z=0.035, rx=w - 0.06, ry=w - 0.06, n=5),
        dict(z=0.03, rx=0.03, ry=0.03, n=2)], tm, segments=64))
    gm = glass('Glass', tint=(0.92, 0.97, 0.97)) if glass_kind == 'clear' else frosted_glass('Glass')
    pm = finish_metal(profile)
    H = 1.95
    # two back panels (wall side) and two front sliding/hinged doors forming a square
    parts.append(box('GlassL', (0.008, width - 0.02, H), (-w + 0.01, 0, 0.05 + H / 2), gm))
    parts.append(box('GlassB', (width - 0.02, 0.008, H), (0, w - 0.01, 0.05 + H / 2), gm))
    parts.append(box('GlassF1', (width / 2, 0.008, H), (-w / 2 + 0.02, -w + 0.02, 0.05 + H / 2), gm))
    parts.append(box('GlassF2', (width / 2, 0.008, H), (w / 2 - 0.04, -w + 0.035, 0.05 + H / 2), gm))
    parts.append(box('GlassR', (0.008, width / 2, H), (w - 0.015, w / 2 - 0.02, 0.05 + H / 2), gm))
    for x, y, sx, sy in [(-w + 0.01, 0, 0.02, width), (0, w - 0.01, width, 0.02), (0, -w + 0.028, width, 0.03), (w - 0.015, 0, 0.02, width)]:
        parts.append(box('ProfTop', (sx, sy, 0.025), (x, y, 0.05 + H), pm, bevel=0.003))
    for x in (-w + 0.01, w - 0.015):
        parts.append(box('Post', (0.025, 0.025, H), (x, -w + 0.025, 0.05 + H / 2), pm, bevel=0.003))
    parts.append(cylinder('Knob', 0.012, 0.3, (0.05, -w + 0.01, 1.05), pm))
    return parts


def towel_rail(finish='chrome', bars=8, width=0.5, height=0.8):
    m = finish_metal(finish)
    parts = [cylinder('SideL', 0.014, height, (-width / 2, 0, height / 2), m),
             cylinder('SideR', 0.014, height, (width / 2, 0, height / 2), m)]
    for i in range(bars):
        z = 0.06 + i * (height - 0.12) / (bars - 1)
        parts.append(cylinder('Bar', 0.01, width, (0, 0, z), m, rotation=(0, math.pi / 2, 0)))
    for x in (-width / 2, width / 2):
        for z in (0.12, height - 0.12):
            parts.append(cylinder('Bracket', 0.008, 0.06, (x, 0.03, z), m, rotation=(math.pi / 2, 0, 0)))
    return parts

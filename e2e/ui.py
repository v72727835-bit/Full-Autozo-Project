#!/usr/bin/env python3
"""
A tiny Android UI driver for the app smoke test (no extra installs: adb + uiautomator).

Each command line in a flow file is one step:
    wait <seconds>
    tap <regex>            tap the first element whose text or description matches
    tapif <regex>          same, but skip quietly if it is not on screen
    type <regex> <text>    tap the field (matched by its text/hint/description) and type
    key <name>             e.g. back, enter
    hidekb                 close the on-screen keyboard if it is open
    dump <name>            save the screen's view tree to out/<name>.xml
    swipeup                scroll the screen up once
    shot <name>            screenshot to out/<name>.png
    alive                  fail if the app process has died
Every step also checks the app is still running and saves a screenshot when it is not.
"""
import os
import re
import subprocess
import sys
import time
import xml.etree.ElementTree as ET

PKG = sys.argv[1]
FLOW = sys.argv[2]
OUT = sys.argv[3] if len(sys.argv) > 3 else 'out'
os.makedirs(OUT, exist_ok=True)
failures = []


def adb(*args, check=True, capture=True):
    r = subprocess.run(['adb', *args], capture_output=capture, text=True)
    if check and r.returncode != 0:
        print('adb', args, 'failed:', r.stderr.strip())
    return r.stdout if capture else ''


def shot(name):
    with open(os.path.join(OUT, f'{name}.png'), 'wb') as f:
        f.write(subprocess.run(['adb', 'exec-out', 'screencap', '-p'], capture_output=True).stdout)


def alive():
    return bool(adb('shell', 'pidof', PKG, check=False).strip())


# React Native screens keep animating, so plain `uiautomator dump` waits for an
# idle state that never comes and returns nothing. uiautomator2 does not wait.
try:
    import uiautomator2 as u2
    DEVICE = u2.connect()
except Exception as e:  # pragma: no cover - fall back to plain uiautomator
    print('uiautomator2 unavailable, falling back to uiautomator dump:', e)
    DEVICE = None


def hierarchy():
    if DEVICE is not None:
        try:
            return DEVICE.dump_hierarchy(compressed=False)
        except Exception as e:
            print('  dump_hierarchy failed:', e)
    adb('shell', 'uiautomator', 'dump', '/sdcard/ui.xml', check=False)
    return adb('shell', 'cat', '/sdcard/ui.xml', check=False)


def nodes():
    xml = hierarchy()
    try:
        root = ET.fromstring(xml[xml.find('<'):]) if '<' in xml else None
    except ET.ParseError:
        return []
    return list(root.iter('node')) if root is not None else []


def clear_system_dialogs(ns):
    """Tap "Wait" on an emulator "<app> isn't responding" dialog that covers the screen."""
    if any("isn't responding" in (n.get('text') or '') for n in ns):
        for n in ns:
            if (n.get('text') or '') == 'Wait':
                m = re.match(r'\[(\d+),(\d+)\]\[(\d+),(\d+)\]', n.get('bounds', ''))
                if m:
                    x1, y1, x2, y2 = map(int, m.groups())
                    print('  (dismissing a system "not responding" dialog)')
                    adb('shell', 'input', 'tap', str((x1 + x2) // 2), str((y1 + y2) // 2))
                    time.sleep(1.5)
                    return True
    return False


def find(pattern):
    rx = re.compile(pattern, re.I)
    ns = nodes()
    if clear_system_dialogs(ns):
        ns = nodes()
    for n in ns:
        label = ' '.join(filter(None, [n.get('text'), n.get('content-desc'), n.get('hint')]))
        if label and rx.search(label):
            m = re.match(r'\[(\d+),(\d+)\]\[(\d+),(\d+)\]', n.get('bounds', ''))
            if m:
                x1, y1, x2, y2 = map(int, m.groups())
                return (x1 + x2) // 2, (y1 + y2) // 2
    return None


def tap(pattern, optional=False):
    for _ in range(10):  # the screen may still be loading
        pos = find(pattern)
        if pos:
            adb('shell', 'input', 'tap', str(pos[0]), str(pos[1]))
            return True
        time.sleep(1.5)
    if not optional:
        failures.append(f'not found on screen: {pattern}')
        print('  !! not found:', pattern)
    return False


step = 0
for raw in open(FLOW):
    line = raw.strip()
    if not line or line.startswith('#'):
        continue
    step += 1
    cmd, _, rest = line.partition(' ')
    print(f'[{step}] {line}', flush=True)
    if cmd == 'wait':
        time.sleep(float(rest))
    elif cmd in ('tap', 'tapif'):
        tap(rest, optional=cmd == 'tapif')
        time.sleep(1.5)
    elif cmd == 'type':
        pattern, _, text = rest.partition(' ')
        if tap(pattern):
            time.sleep(0.8)
            adb('shell', 'input', 'text', text.replace(' ', '%s'))
            time.sleep(0.5)
    elif cmd == 'hidekb':
        # Close the keyboard only if it is open (a bare "back" would leave the app).
        if 'mInputShown=true' in adb('shell', 'dumpsys', 'input_method', check=False):
            adb('shell', 'input', 'keyevent', '4')
            time.sleep(1)
    elif cmd == 'dump':
        with open(os.path.join(OUT, f'{rest or "screen"}.xml'), 'w') as f:
            f.write(hierarchy())
    elif cmd == 'key':
        adb('shell', 'input', 'keyevent', {'back': '4', 'enter': '66'}.get(rest, rest))
        time.sleep(1)
    elif cmd == 'swipeup':
        adb('shell', 'input', 'swipe', '540', '1700', '540', '700', '400')
        time.sleep(1)
    elif cmd == 'shot':
        shot(rest)
    elif cmd == 'alive':
        pass
    if not alive():
        failures.append(f'APP CRASHED after step {step}: {line}')
        print('  !! APP IS NOT RUNNING after:', line, flush=True)
        shot(f'crash-step{step}')
        break

print('\nRESULT:', 'OK' if not failures else 'FAILED')
for f in failures:
    print(' -', f)
sys.exit(1 if failures else 0)

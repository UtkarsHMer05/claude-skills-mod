#!/usr/bin/python3
# <xbar.title>Claude usage</xbar.title>
# <xbar.desc>5-hour and weekly Claude limits left, from the usage-card mod's last reading.</xbar.desc>
# <swiftbar.hideAbout>true</swiftbar.hideAbout>
# <swiftbar.hideRunInTerminal>true</swiftbar.hideRunInTerminal>
# <swiftbar.hideLastUpdated>true</swiftbar.hideLastUpdated>
# <swiftbar.hideDisablePlugin>true</swiftbar.hideDisablePlugin>
# <swiftbar.refreshOnOpen>true</swiftbar.refreshOnOpen>
"""
SwiftBar menu bar plugin. Reads the numbers the usage-card mod saves after
each Claude Code reply on this Mac (no network calls) and draws them as
images: two labelled mini bars in the menu bar, and a card per limit in the
menu. It refreshes when a Claude Code turn ends (a Stop hook opens
swiftbar://refreshplugin?name=usage-card), when you open its menu, and
otherwise only every 30 minutes (the ".30m" in the file name), so a limit
that resets while you are away still shows as reset.

Uses macOS's own /usr/bin/python3 and its Pillow. Images are drawn at 2x and
tagged 144 dpi, so AppKit shows them at half their pixel size, sharp on Retina.
"""
import base64
import glob
import io
import json
import os
import time
from datetime import datetime, timezone

from PIL import Image, ImageDraw, ImageFont

STORE = os.path.expanduser('~/.claude/plugins/store')
FONT = '/System/Library/Fonts/SFNSRounded.ttf'
FONT_FALLBACK = '/System/Library/Fonts/SFNS.ttf'
S = 2  # output scale (Retina)
SS = 4  # supersampling on top of that, for smooth edges

# The mod's colour ramp, by % left.
STOPS = [(0, '#ef4444'), (25, '#f97316'), (50, '#facc15'), (75, '#a3e635'), (100, '#22c55e')]
WINDOWS = {'five_hour': ('5-hour limit', '5h'), 'seven_day': ('Weekly limit', 'Wk')}


# ── colour ───────────────────────────────────────────────────────────────────
def rgb(h):
    h = h.lstrip('#')
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


def mix(a, b, t):
    return tuple(int(round(a[i] + (b[i] - a[i]) * t)) for i in range(3))


def status(left):
    left = max(0, min(100, left))
    for (p0, c0), (p1, c1) in zip(STOPS, STOPS[1:]):
        if left <= p1:
            return mix(rgb(c0), rgb(c1), (left - p0) / (p1 - p0))
    return rgb(STOPS[-1][1])


def hexc(c):
    return '#%02x%02x%02x' % c


# ── drawing helpers ──────────────────────────────────────────────────────────
_fonts = {}


def font(px, weight='Medium'):
    key = (px, weight)
    if key not in _fonts:
        try:
            f = ImageFont.truetype(FONT, px)
        except OSError:
            f = ImageFont.truetype(FONT_FALLBACK, px)
        try:
            f.set_variation_by_name(weight)
        except Exception:
            pass
        _fonts[key] = f
    return _fonts[key]


class Canvas:
    """A drawing surface in points; renders at S*SS and downsamples to S."""

    def __init__(self, w, h):
        self.w, self.h = w, h
        self.k = S * SS
        self.img = Image.new('RGBA', (int(w * self.k), int(h * self.k)), (0, 0, 0, 0))
        self.d = ImageDraw.Draw(self.img)

    def _r(self, *v):
        return [int(round(x * self.k)) for x in v]

    def text(self, x, y, s, size, color, weight='Medium', anchor='ls'):
        self.d.text(self._r(x, y), s, font=font(int(size * self.k), weight), fill=color, anchor=anchor)

    def text_w(self, s, size, weight='Medium'):
        return font(int(size * self.k), weight).getlength(s) / self.k

    def pill(self, x, y, w, h, fill):
        x0, y0, x1, y1 = self._r(x, y, x + w, y + h)
        if x1 - x0 < 1:
            return
        self.d.rounded_rectangle([x0, y0, x1, y1], radius=(y1 - y0) / 2, fill=fill)

    def gradient_pill(self, x, y, w, h, left, track):
        """Track, then a fill coloured by % left: deeper at the start, bright at the tip."""
        self.pill(x, y, w, h, track)
        fw = w * left / 100
        if fw <= 0:
            return
        fw = max(fw, h)  # a sliver still reads as a round dot
        x0, y0, x1, y1 = self._r(x, y, x + fw, y + h)
        tip = status(left)
        base = mix(tip, (0, 0, 0), 0.28)
        grad = Image.new('RGBA', (x1 - x0, y1 - y0))
        gd = ImageDraw.Draw(grad)
        for i in range(x1 - x0):
            t = i / max(1, x1 - x0 - 1)
            gd.line([(i, 0), (i, y1 - y0)], fill=mix(base, tip, t ** 0.8) + (255,))
        # soft sheen along the top half
        sheen = Image.new('RGBA', grad.size, (255, 255, 255, 0))
        sd = ImageDraw.Draw(sheen)
        hh = (y1 - y0) // 2
        for j in range(hh):
            sd.line([(0, j), (grad.width, j)], fill=(255, 255, 255, int(70 * (1 - j / hh))))
        grad = Image.alpha_composite(grad, sheen)
        mask = Image.new('L', grad.size, 0)
        ImageDraw.Draw(mask).rounded_rectangle([0, 0, grad.width - 1, grad.height - 1], radius=grad.height / 2, fill=255)
        self.img.paste(grad, (x0, y0), mask)

    def b64(self):
        out = self.img.resize((int(self.w * S), int(self.h * S)), Image.LANCZOS)
        buf = io.BytesIO()
        out.save(buf, 'PNG', dpi=(72 * S, 72 * S), optimize=True)
        return base64.b64encode(buf.getvalue()).decode()


# ── data ─────────────────────────────────────────────────────────────────────
def load():
    files = sorted(glob.glob(os.path.join(STORE, 'usage-card_*.json')), key=os.path.getmtime, reverse=True)
    for f in files:
        try:
            latest = json.load(open(f)).get('latest')
        except Exception:
            continue
        if isinstance(latest, list) and latest:
            return latest, os.path.getmtime(f)
    return [], None


def parse_time(s):
    try:
        return datetime.strptime(s.split('.')[0].rstrip('Z'), '%Y-%m-%dT%H:%M:%S').replace(tzinfo=timezone.utc).timestamp()
    except Exception:
        return None


def reset_text(at, now):
    if not at:
        return ''
    secs = at - now
    if secs <= 0:
        return 'Resetting…'
    mins = int(round(secs / 60))
    if mins < 60:
        return f'Resets in {mins}m'
    h, m = divmod(mins, 60)
    if h < 24:
        return f'Resets in {h}h {m:02d}m'
    d = datetime.fromtimestamp(at)
    return 'Resets ' + d.strftime('%a %-I:%M %p')


def ago(saved, now):
    m = int((now - saved) // 60)
    if m < 1:
        return 'just now'
    if m < 60:
        return f'{m}m ago'
    if m < 1440:
        return f'{m // 60}h {m % 60}m ago'
    return f'{m // 1440}d ago'


# ── images ───────────────────────────────────────────────────────────────────
THEMES = {
    # name: label text, number text, track, muted
    'light': ((0, 0, 0, 150), (0, 0, 0, 230), (0, 0, 0, 38), (0, 0, 0, 115)),
    'dark': ((255, 255, 255, 165), (255, 255, 255, 245), (255, 255, 255, 46), (255, 255, 255, 120)),
}


def title_image(rows, theme):
    """Menu bar: '5h ▬▬▬ 82%   W ▬▬▬ 78%' with a coloured dot of status per window."""
    label, num, track, _ = THEMES[theme]
    bar_w, bar_h, gap = 26, 5, 5
    parts = []
    for r in rows:
        pct = f"{r['left']}%"
        parts.append((r['short'], pct, r['left']))
    fs = 11.5
    w = 2
    for short, pct, _ in parts:
        w += canvas_w(short, fs, 'Semibold') + gap + bar_w + gap + canvas_w(pct, fs, 'Semibold') + 11
    w = w - 11 + 2
    c = Canvas(w, 22)
    x = 2
    base = 15.3
    for short, pct, left in parts:
        c.text(x, base, short, fs, label, 'Semibold')
        x += c.text_w(short, fs, 'Semibold') + gap
        c.gradient_pill(x, 11 - bar_h / 2 + 0.5, bar_w, bar_h, left, track)
        x += bar_w + gap
        c.text(x, base, pct, fs, status(left) + (255,) if theme == 'dark' else mix(status(left), (0, 0, 0), 0.25) + (255,), 'Semibold')
        x += c.text_w(pct, fs, 'Semibold') + 11
    return c.b64()


def canvas_w(s, size, weight):
    return font(int(size * S * SS), weight).getlength(s) / (S * SS)


def card_image(r, theme):
    """Menu card: title and % left on one line, a wide bar, the reset below."""
    label, num, track, muted = THEMES[theme]
    W, H = 280, 58
    c = Canvas(W, H)
    pad = 2
    tone = status(r['left'])
    tone_txt = tone + (255,) if theme == 'dark' else mix(tone, (0, 0, 0), 0.3) + (255,)
    c.text(pad, 15, r['title'], 13, num, 'Semibold')
    pct = f"{r['left']}% left"
    c.text(W - pad, 15, pct, 13, tone_txt, 'Bold', anchor='rs')
    c.gradient_pill(pad, 24, W - 2 * pad, 9, r['left'], track)
    c.text(pad, 50, r['reset'] or ' ', 11, muted, 'Medium')
    used = f"{100 - r['left']}% used"
    c.text(W - pad, 50, used, 11, muted, 'Medium', anchor='rs')
    return c.b64()


def pair(fn, *a):
    return f'{fn(*a, "light")},{fn(*a, "dark")}'


# ── output ───────────────────────────────────────────────────────────────────
def main():
    now = time.time()
    try:  # when it last ran, so a refresh can be checked
        open(os.path.expanduser('~/Library/Caches/usage-card-menubar.last'), 'w').write(str(int(now)))
    except OSError:
        pass
    latest, saved = load()
    rows = []
    for kind in ('five_hour', 'seven_day'):
        l = next((x for x in latest if isinstance(x, dict) and x.get('kind') == kind), None)
        if not l or not isinstance(l.get('percentUsed'), (int, float)):
            continue
        at = parse_time(l['resetsAt']) if l.get('resetsAt') else None
        left = max(0, min(100, 100 - l['percentUsed']))
        if at and at <= now:  # the window has reset since the reading
            left, at = 100, None
        title, short = WINDOWS[kind]
        rows.append({'title': title, 'short': short, 'left': int(round(left)), 'reset': reset_text(at, now)})

    if not rows:
        print('Claude – | sfimage=gauge.with.dots.needle.33percent')
        print('---')
        print('No reading yet | size=13')
        print('Send a message in a Claude Code session on this Mac. | size=11')
        print('---')
        print('Open usage on claude.ai | href=https://claude.ai/settings/usage sfimage=safari')
        return

    tip = '   '.join(f"{r['title']}: {r['left']}% left" for r in rows)
    print(f'| image={pair(title_image, rows)} tooltip={tip}')
    print('---')
    for r in rows:
        print(f'| image={pair(card_image, r)}')
        print('---')
    print(f'Updated {ago(saved, now)} from a Claude Code reply | size=11 sfimage=clock')
    print('Numbers move when a Claude Code session on this Mac gets a reply | size=11')
    print('---')
    print('Open usage on claude.ai | href=https://claude.ai/settings/usage sfimage=safari')
    print('Refresh | refresh=true sfimage=arrow.clockwise')


if __name__ == '__main__':
    main()

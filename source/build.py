import json, re, hashlib, sys, os
os.chdir(os.path.dirname(os.path.abspath(__file__)))
MASTER = os.environ.get('HYO_MASTER', 'seunghyo12!')
PUBLIC_URL = os.environ.get('HYO_URL', '')

def svg(p):
    s = open(p).read()
    s = re.sub(r'>\s+<', '><', s)
    return s

names = list('ABCDEFGHIJKLMNOPQRSTUVWXYZ') + ['logo', 'star']
glyph, box = {}, {}
for n in names:
    s = svg(f'stickers/{n}.svg')
    vb = [float(v) for v in re.search(r'viewBox="([^"]+)"', s).group(1).split()]
    box[n] = [round(v, 2) for v in vb]
    glyph[n] = s
assets = {
    'logo': svg('assets/logo.svg'),
    'env': [svg(f'assets/env_{c}.svg') for c in ('blue', 'lime', 'navy')],
    'paper': [svg(f'assets/paper_{c}.svg') for c in ('blue', 'lime', 'navy')],
    'glyph': glyph, 'glyphBox': box,
    'star': open('raw/star_d.txt').read(),
    'hyoLogo': svg('assets/hyo_logotype.svg'), 'hyoSymbol': svg('assets/hyo_symbol.svg'),
    'bg': 'data:image/webp;base64,' + __import__('base64').b64encode(open('assets/background.webp','rb').read()).decode(),
}
# Paperlogy Bold (buttons) — subset to the characters this page uses
import subprocess, base64
_txt = open('src/body.html').read() + open('src/app.js').read()
_chars = set(c for c in _txt if '\uac00' <= c <= '\ud7a3') | set("0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz !?.,:;()'\"-~=·…×+/%")
open('raw/chars.txt', 'w').write(''.join(sorted(_chars)))
subprocess.run(['pyftsubset', 'raw/Paperlogy-7Bold.ttf', '--text-file=raw/chars.txt', '--flavor=woff2', '--output-file=assets/paperlogy-bold.woff2', '--layout-features=*'], check=True)
# Pretendard (variable, all weights) — KS X 1001 2,350 Hangul + ASCII, so visitors' own letters render too
if not os.path.exists('assets/pretendard-var.woff2'):
    subprocess.run(['pyftsubset', 'raw/fonts/PretendardVariable.ttf', '--text-file=raw/ks.txt', '--flavor=woff2', '--output-file=assets/pretendard-var.woff2', '--layout-features=kern,liga,calt,ccmp,locl'], check=True)
PRET_CSS = "@font-face{font-family:'Pretendard';font-weight:45 920;font-display:block;src:url(data:font/woff2;base64,%s) format('woff2')}" % base64.b64encode(open('assets/pretendard-var.woff2','rb').read()).decode()
FONT_CSS = "@font-face{font-family:'Paperlogy';font-weight:700;font-display:block;src:url(data:font/woff2;base64,%s) format('woff2')}" % base64.b64encode(open('assets/paperlogy-bold.woff2','rb').read()).decode()
FIREBASE = {'apiKey': 'AIzaSyD5OueRgWnshfaMldf5NoSHNqmjg15a1-Y', 'authDomain': 'hyodoer.firebaseapp.com', 'projectId': 'hyodoer', 'storageBucket': 'hyodoer.firebasestorage.app', 'messagingSenderId': '168837654625', 'appId': '1:168837654625:web:f99a01b0bd84030a10e220'}
mh = hashlib.sha256(('hyodoer:' + MASTER).encode()).hexdigest()
VIEWER = os.environ.get('HYO_VIEWER') == '1'
if VIEWER: mh = ''
app = open('src/app.js').read().replace('__MASTER_KEYS__', open('keys/master.json').read().strip()).replace('__FIREBASE__', json.dumps(FIREBASE)).replace('__INTRO_SIZES__', open('assets/intro_sizes.json').read()).replace('__PUBLIC_URL__', PUBLIC_URL).replace("'__VIEWER__'", "'1'" if VIEWER else "'0'")
qr = open('raw/qrcode.js').read()
html = f'''<!DOCTYPE html>
<html lang="ko"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>HYODOER 효도어 — 편지 쓰기 · 방명록</title>
<style>{PRET_CSS}{FONT_CSS}{open('src/style.css').read()}</style></head><body>
{open('src/body.html').read()}
<script>window.__ASSETS={json.dumps(assets, ensure_ascii=False)};</script>
<script>{qr}</script>
<script>{app}</script>
</body></html>'''
os.makedirs('dist', exist_ok=True)
out = os.environ.get('HYO_OUT', 'dist/index.html')
os.makedirs(os.path.dirname(out) or '.', exist_ok=True)
open(out, 'w').write(html)
print('built', len(html))

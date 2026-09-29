"""Refresh the self-hosted OFL UI font subset after adding non-ASCII UI text."""
from pathlib import Path
import re
from urllib.parse import quote
from urllib.request import Request, urlopen

root = Path(__file__).resolve().parent.parent
text = ''.join(p.read_text() for p in (root / 'src').glob('*.ts')) + (root / 'index.html').read_text()
characters = ''.join(sorted({c for c in text if ord(c) >= 128}))
url = 'https://fonts.googleapis.com/css2?family=Noto+Sans+SC:wght@400&text=' + quote(characters)
# This endpoint returns TrueType for this user agent; assert its signature below.
css = urlopen(Request(url, headers={'User-Agent': 'Mozilla/5.0 Chrome/140.0.0.0 Safari/537.36'})).read().decode()
font_url = re.search(r'url\(([^)]+)\)', css).group(1)
data = urlopen(font_url).read()
assert data[:4] == b'\x00\x01\x00\x00', 'Unexpected font format; update extension and CSS together.'
(root / 'public/fonts/noto-sans-sc-ui.ttf').write_bytes(data)
print(f'Bundled {len(characters)} UI characters, {len(data)} bytes.')

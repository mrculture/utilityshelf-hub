"""Build the public, synthetic photo-practice ZIP. Requires Pillow; no private inputs."""
import io
import json
from pathlib import Path
import random
import zipfile
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[2]
DESTINATION = ROOT / 'guides/samples/product-photo-practice-v1.zip'
entries = {}


def picture(name, size, label, fmt, noisy=False, view='front'):
    w, h = size
    image = Image.frombytes('RGB', size, random.Random(1042).randbytes(w*h*3)) if noisy else Image.new('RGB', size, '#e9f0e9')
    draw = ImageDraw.Draw(image)
    box = (w//4, h//3, 3*w//4, 5*h//6)
    draw.rounded_rectangle(box, radius=w//35, fill='#1d6957', outline='#143f38', width=max(2,w//200))
    if view == 'detail':
        draw.ellipse((w//3,h//2,2*w//3,3*h//4),fill='#e7c780',outline='#172e29',width=max(2,w//100))
    elif view == 'packaging':
        draw.rectangle((w//3,h//2,2*w//3,2*h//3),fill='#f5e1b8')
        for x in range(w//3,2*w//3,w//60):
            draw.line((x,3*h//4,x,4*h//5),fill='white',width=max(1,w//400))
    else:
        draw.rounded_rectangle((w//3,h//2,2*w//3,2*h//3),radius=w//80,fill='#c6e1d1')
    # A built-in font keeps this generator independent of system font files.
    strip = Image.new('RGB',(400,64),'#ffffff')
    text = ImageDraw.Draw(strip)
    font = ImageFont.load_default()
    text.text((10,6),'UTILITYSHELF PRACTICE - SYNTHETIC EXAMPLE',font=font,fill='#172e29')
    text.text((10,25),label,font=font,fill='#172e29')
    text.text((10,44),f'{w} x {h} pixels | Not a real product listing',font=font,fill='#172e29')
    image.paste(strip.resize((w,w*64//400),Image.Resampling.NEAREST),(0,0))
    output=io.BytesIO()
    image.save(output,format=fmt,**({'quality':90} if fmt in ('JPEG','WEBP') else {}))
    entries[name]=output.getvalue()


picture('photos/01-pass-front.jpg',(1600,1200),'01 - PASS: front view','JPEG')
picture('photos/02-pass-detail.png',(1200,1200),'02 - PASS: detail view','PNG',view='detail')
picture('photos/03-fail-too-small.jpg',(600,450),'03 - FAIL: below 800 x 800 minimum','JPEG')
picture('photos/04-fail-file-size.png',(1200,1200),'04 - FAIL: above 1 MB practice limit','PNG',noisy=True)
entries['photos/05-fail-unreadable.jpg']=b'UtilityShelf deliberately unreadable practice file. This is text, not a JPEG. Remove it from the practice batch.\n'
picture('photos/06-pass-packaging.webp',(1400,1000),'06 - PASS: packaging view','WEBP',view='packaging')
picture('replacements/03-replacement.jpg',(1600,1200),'03 - REPLACEMENT: large enough to pass','JPEG')
assert len(entries['photos/04-fail-file-size.png']) > 1000000
assert all(len(data) < 1000000 for name,data in entries.items() if name != 'photos/04-fail-file-size.png')

settings={'tool':'utilityshelf-image-dimension-checker','version':1,'preset':'custom','minimumWidth':800,'minimumHeight':800,'maximumSizeMB':1,'maximumLongEdge':1200}
entries['practice-settings.json']=(json.dumps(settings,indent=2)+'\n').encode()
sizes='\n'.join(f'  {name}: {len(data):,} bytes' for name,data in entries.items() if name.startswith('photos/'))
entries['START-HERE.txt']=f'''UtilityShelf product-photo practice pack - version 1

These are synthetic illustrations for practising the tools, not real product
photos or marketplace requirements. You may use and share these examples for
practice. One file is deliberately unreadable; it contains harmless plain text.
No private photos, executable scripts or external downloads are included.

1. Extract this ZIP into a new folder.
2. Open https://utilityshelf.site/utilities/image-dimension-checker/?test-mode=1
   Use Load settings and choose practice-settings.json.
   Limits: Custom, minimum 800 x 800 pixels, maximum 1 MB, long edge 1200 px.
   These are PRACTICE limits, not the eBay preset. Test mode excludes practice
   actions from usage tracking and stays on when following workflow tool links.
3. Choose ONLY the six files in photos/ (do not include the replacement yet).
   Expect 3 of 6 meet your limits, and report status Check incomplete:
   01-pass-front.jpg: Pass.
   02-pass-detail.png: Pass.
   03-fail-too-small.jpg: Width short by 200 px; height short by 350 px.
   04-fail-file-size.png: Over the file size limit.
   05-fail-unreadable.jpg: Could not check; not a supported image.
   06-pass-packaging.webp: Pass.
   The maximum long edge applies when preparing copies, not to this first check.
4. Remove 05-fail-unreadable.jpg. Expect 3 of 5 pass; Needs attention.
5. Replace 03-fail-too-small.jpg with replacements/03-replacement.jpg.
   Expect 4 of 5 pass; only 04-fail-file-size.png exceeds the byte limit.
6. Select Prepare smaller copies. Expect 5 of 5 copies meet all limits.
   Download checked-photo-copies.zip and extract it into a separate folder.
   Output sizes may vary by browser, but each copy must meet the chosen limits.
7. Recheck those FIVE extracted photos and download a fresh photo report.
   Expect 5 of 5 pass. Do not select resize-report.txt as a photo.
8. Use the same five checked copies in Image Contact Sheet. Reorder them,
   download the contact sheet and use Download ordered filenames (.txt).
9. In Filename Cleaner use Load filename list to open ordered-filenames.txt
   (or copy and paste the names), then choose Product / SKU + numbers,
   prefix PRACTICE-1042, start 1, and 3 digits. Select the same checked files.
   Download the renamed ZIP and mapping. Expect five named photos; extension
   types are preserved. Do not assume every file will be JPEG.

Keep originals, checked copies and renamed copies in separate folders.
The 05 unreadable file and old 03 small image must not appear in the final ZIP.
Full guide: https://utilityshelf.site/guides/prepare-product-photos-for-ebay?test-mode=1

Original photo-file sizes (1 MB = 1,000,000 bytes):
{sizes}
'''.encode()

DESTINATION.parent.mkdir(parents=True,exist_ok=True)
with zipfile.ZipFile(DESTINATION,'w',compression=zipfile.ZIP_DEFLATED,compresslevel=9) as archive:
    for name,data in entries.items():
        info=zipfile.ZipInfo(name,date_time=(2026,11,10,0,0,0))
        info.compress_type=zipfile.ZIP_DEFLATED
        info.external_attr=0o644<<16
        archive.writestr(info,data)
print(f'{DESTINATION}: {DESTINATION.stat().st_size:,} bytes; {len(entries)} files')
print(sizes)

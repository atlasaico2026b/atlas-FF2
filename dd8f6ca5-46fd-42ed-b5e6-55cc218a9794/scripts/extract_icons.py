#!/usr/bin/env python3
import zipfile, glob, os, unicodedata

SRC = glob.glob('*.zip')[0]
OUT = 'public/equipment-icons'
os.makedirs(OUT, exist_ok=True)

# Persian filename -> english slug
mapping = {
    'ساختمانهای اداری': 'office_building',
    'مخزن فوم آتش نشانی': 'foam_tank',
    'مانیتورهای آب آتش نشانی': 'monitor',
    'پارکینگ خودروها': 'parking',
    'لوله های آب آتش نشانی': 'pipe',
    'فومینگ مخازن': 'tank_foaming',
    'جوکی پمپ آب نشانی': 'jockey_pump',
    'ولو پروانه ای هیدرانت ها و مانیتورها': 'butterfly_valve',
    'اطفا اتوماتیک CO₂': 'auto_co2',
    'مخزن ذخیره مواد نفتی': 'oil_tank',
    'ولو مسیر لوله': 'valve',
    'ایستگاه برق': 'electrical_station',
    'انبار سلوویج': 'salvage_store',
    'سوله توربین ها و الکتروموتورها': 'turbine',
    'مخزن زیرزمینی مواد آلوده': 'contamination_tank',
    'جاده': 'road',
    'ایستگاه مخابرات': 'telecom_station',
    'آبپاش اطفا حریق سوله ها': 'shed_sprinkler',
    'ساختمان کنترل سایت': 'control_building',
    'ساختمان HSE': 'hse_building',
    'ساختمان انبار': 'warehouse',
    'آبپاش کولینگ مخازن': 'tank_cooling',
    'پمپ آب آتش نشانی': 'pump',
    'ساختمانهای کارگاهی': 'workshop',
    'مخزن آب آتش نشانی': 'water_tank',
    'هیدرانت آب آتش نشانی': 'hydrant',
    'منیفولد ترابهای صنعتی': 'manifold',
    'باندوال های اطراف مخازن': 'bundwall',
}

def norm(s):
    s = s.replace('\u200c', ' ').replace('\u00a0', ' ')
    return ' '.join(s.split()).strip()

z = zipfile.ZipFile(SRC)
written = 0
for name in z.namelist():
    base = name.rsplit('/', 1)[-1]
    if not base.lower().endswith('.png'):
        continue
    stem = base[:-4]
    key = norm(stem)
    slug = None
    for pk, pv in mapping.items():
        if norm(pk) == key:
            slug = pv
            break
    if slug is None:
        print('UNMAPPED:', repr(stem))
        continue
    with z.open(name) as src, open(os.path.join(OUT, slug + '.png'), 'wb') as dst:
        dst.write(src.read())
    written += 1

print('written:', written)
print('files:', sorted(os.listdir(OUT)))

# -*- coding: utf-8 -*-
"""
광일 + 삼정 판매명세서를 읽어서 배차 프로그램(https://kichair.github.io/baecha/)에
바로 밀어넣는다. 배차 화면에서 업로드할 필요가 없다.

  python push_baecha.py

폴더에서 '오늘 이후로 바뀐 파일'만 읽어 올리므로 하루에 몇 번을 돌려도 중복되지 않는다.
(배차 쪽에서도 같은 건은 한 번 더 걸러낸다)
"""
import os, sys, glob, json, time, configparser, datetime, urllib.request, re

HERE = os.path.dirname(os.path.abspath(__file__))
CFG = configparser.ConfigParser()
CFG.read(os.path.join(HERE, 'config.ini'), encoding='utf-8')

STATE = os.path.join(HERE, '_state.json')


def log(*a):
    msg = ' '.join(str(x) for x in a)
    try:
        print(datetime.datetime.now().strftime('[%H:%M:%S]'), msg, flush=True)
    except UnicodeEncodeError:
        enc = (sys.stdout.encoding or 'cp949')
        print(datetime.datetime.now().strftime('[%H:%M:%S]'),
              msg.encode(enc, 'replace').decode(enc), flush=True)


# ── 엑셀 읽기 ────────────────────────────────────────────────
def read_rows(path):
    """xlsx / xls / csv 를 2차원 리스트로"""
    ext = os.path.splitext(path)[1].lower()
    if ext == '.csv':
        import csv
        for enc in ('utf-8-sig', 'cp949'):
            try:
                with open(path, encoding=enc) as f:
                    return [r for r in csv.reader(f)]
            except UnicodeDecodeError:
                continue
        return []
    if ext == '.xlsx':
        import openpyxl
        ws = openpyxl.load_workbook(path, data_only=True).active
        return [list(r) for r in ws.iter_rows(values_only=True)]
    if ext == '.xls':
        import xlrd
        sh = xlrd.open_workbook(path).sheet_by_index(0)
        return [sh.row_values(i) for i in range(sh.nrows)]
    return []


def norm(x):
    return re.sub(r'\s', '', str(x if x is not None else ''))


def find_header(rows):
    for i, r in enumerate(rows[:30]):
        cells = [norm(c) for c in r]
        if any('거래처명' in c for c in cells):
            return i
    return -1


DATE_RE = re.compile(r'(\d{4})[-./](\d{1,2})[-./](\d{1,2})')


def to_date(v):
    if isinstance(v, datetime.datetime):
        return v.strftime('%Y-%m-%d')
    if isinstance(v, datetime.date):
        return v.strftime('%Y-%m-%d')
    m = DATE_RE.search(str(v or ''))
    if m:
        return '%s-%02d-%02d' % (m.group(1), int(m.group(2)), int(m.group(3)))
    return ''


def parse_sheet(rows):
    """배차 프로그램과 같은 규칙으로 명세서를 읽는다"""
    head = ' '.join(str(c) for r in rows[:6] for c in r)
    if ('구매' in head or '매입' in head) and '판매' not in head:
        return [], False      # 구매·매입 자료는 배송이 아니므로 건너뜀
    hi = find_header(rows)
    if hi < 0:
        return [], False
    H = [norm(c) for c in rows[hi]]

    def ix(name):
        for i, h in enumerate(H):
            if name in h:
                return i
        return -1

    iN, iP, iS, iM, iQ = ix('거래처명'), ix('품목명'), ix('비고'), ix('적요'), ix('수량')
    iD = ix('거래일자')
    iG = ix('거래처구분')   # ERP수시집 = 명세서 지참 / 대금 수령 주의 건
    # 전표(거래명세서) 인쇄용 금액 컬럼 — 광일·삼정 서식 둘 다 있음
    iU, iA, iV, iT = ix('단가'), ix('공급가액'), ix('부가세'), ix('합계')
    # 삼정(이카운트) 서식은 '일자-No.' / '회계반영일자' 가 있다 → 비고가 적요 역할
    sj = any(('일자-No' in h) or ('회계반영일자' in h) for h in H)
    if sj:
        iM, iS = iS, -1
    if iD < 0:
        for i, h in enumerate(H):
            if ('일자' in h or '날짜' in h) and '회계' not in h:
                iD = i
                break
    if iN < 0 or iP < 0 or iQ < 0:
        return [], sj

    out = []
    for r in rows[hi + 1:]:
        def g(i):
            return r[i] if 0 <= i < len(r) else ''
        n = str(g(iN) or '').strip()
        p = str(g(iP) or '').strip()
        if not n or not p or '단가정정' in p:
            continue
        try:
            q = int(round(float(str(g(iQ)).replace(',', '') or 0)))
        except Exception:
            continue
        if q <= 0:
            continue
        if re.search(r'택배비|운임비', p):
            continue
        row = {'n': n, 'p': p, 's': str(g(iS) or '').strip(),
               'q': q, 'm': str(g(iM) or '').strip()[:80], 'd': to_date(g(iD))}
        # 금액 (있을 때만) — u=단가 a=공급가액 v=부가세 t=합계
        for fk, ii in (('u', iU), ('a', iA), ('v', iV), ('t', iT)):
            if ii >= 0:
                try:
                    fv = int(round(float(str(g(ii)).replace(',', '') or 0)))
                    if fv:
                        row[fk] = fv
                except Exception:
                    pass
        if iG >= 0:
            gv = str(g(iG) or '').strip()
            if gv:
                row['g'] = gv[:20]
        if not row['d']:
            continue
        if sj:
            row['sj'] = 1
            if row['m'] and not row['m'].startswith('삼정)'):
                row['m'] = '삼정) ' + row['m']
            elif not row['m']:
                row['m'] = '삼정)'
        out.append(row)
    return out, sj


# ── 폴더에서 새 파일 찾기 ────────────────────────────────────
def newest_files(folder, since, match='', quiet=True):
    if not folder:
        return []
    if not os.path.isdir(folder):
        log('폴더를 못 찾았습니다 (건너뜀):', folder)
        return []
    got = []
    for ext in ('*.xlsx', '*.xls', '*.csv'):
        got += glob.glob(os.path.join(folder, ext))
    got = [f for f in got if not os.path.basename(f).startswith('~$')]
    if match:
        got = [f for f in got if match in os.path.basename(f)]
    got = [f for f in got if os.path.getmtime(f) > since]

    # 다른 프로그램(매출수금 등)이 지금 쓰고 있는 파일은 건드리지 않는다
    # (삼정 폴더는 우리가 방금 받아 놓은 것이므로 기다릴 필요가 없다)
    now = time.time()
    qs = CFG.getint('folder', 'quiet_seconds', fallback=90) if quiet else 0
    ready = []
    for f in got:
        if now - os.path.getmtime(f) < qs:
            log('아직 저장 중인 것 같아 건너뜁니다:', os.path.basename(f))
            continue
        if locked(f):
            log('다른 프로그램이 쓰는 중이라 건너뜁니다:', os.path.basename(f))
            continue
        ready.append(f)
    return sorted(ready, key=os.path.getmtime)


def show_folder(folder, match, since):
    """폴더 안에 뭐가 있고 언제 저장됐는지 로그에 남긴다"""
    if not folder or not os.path.isdir(folder):
        return
    got = []
    for ext in ('*.xlsx', '*.xls', '*.csv'):
        got += glob.glob(os.path.join(folder, ext))
    got = [f for f in got if not os.path.basename(f).startswith('~$')]
    if match:
        got = [f for f in got if match in os.path.basename(f)]
    got.sort(key=os.path.getmtime, reverse=True)
    for f in got[:5]:
        t = os.path.getmtime(f)
        log('   %s  %s  %s' % (
            datetime.datetime.fromtimestamp(t).strftime('%m-%d %H:%M'),
            '새것' if t > since else '이미읽음',
            os.path.basename(f)[:44]))
    if not got:
        log('   (조건에 맞는 파일이 없습니다)')


def locked(path):
    """다른 프로그램이 쓰고 있는 파일인지 확인"""
    try:
        with open(path, 'rb'):
            pass
        try:
            os.rename(path, path)      # 윈도우에서 잠긴 파일이면 실패
        except OSError:
            return True
        return False
    except Exception:
        return True


# ── Supabase 에 올리기 ───────────────────────────────────────
def push(rows, url, key, src=None):
    body = json.dumps([{
        'id': 3,
        'data': {'ts': int(time.time() * 1000), 'rows': rows, 'src': src or {}},
        'updated_at': datetime.datetime.now(datetime.timezone.utc).isoformat().replace('+00:00', 'Z'),
    }]).encode('utf-8')
    req = urllib.request.Request(
        url.rstrip('/') + '/rest/v1/board',
        data=body, method='POST',
        headers={'apikey': key, 'Authorization': 'Bearer ' + key,
                 'Content-Type': 'application/json',
                 'Prefer': 'resolution=merge-duplicates'})
    with urllib.request.urlopen(req, timeout=30) as r:
        return r.status


def main():
    st = {}
    if os.path.exists(STATE):
        try:
            st = json.load(open(STATE, encoding='utf-8'))
        except Exception:
            st = {}
    # 예전 방식(폴더 구분 없이 하나의 since)에서 넘어오기
    old = st.get('since')
    sinces = st.get('sinces')
    if not isinstance(sinces, dict):
        sinces = {}
        if isinstance(old, (int, float)):
            sinces = {'kwangil': float(old), 'samjung': float(old)}

    rows, files = [], []
    newest = {}
    src = {}
    for tag in ('kwangil', 'samjung'):
        folder = CFG.get('folder', tag, fallback='')
        match = CFG.get('folder', tag + '_match', fallback='').strip()
        since = float(sinces.get(tag, 0))
        log('[%s] 폴더 %s  (지난번까지 읽은 시각 %s)'
            % (tag, folder, datetime.datetime.fromtimestamp(since).strftime('%m-%d %H:%M') if since else '없음'))
        show_folder(folder, match, since)
        picked = newest_files(folder, since, match, quiet=(tag != 'samjung'))
        if not picked:
            log('[%s] 새로 저장된 파일이 없습니다' % tag)
        for f in picked:
            got, sj = parse_sheet(read_rows(f))
            log(os.path.basename(f), '->', len(got), '줄', '[삼정]' if sj else '[광일]')
            rows += got
            files.append(f)
            newest[tag] = max(newest.get(tag, 0), os.path.getmtime(f))
            d = src.setdefault(tag, {'ts': 0, 'n': 0, 'f': ''})
            d['ts'] = int(time.time() * 1000)
            d['n'] += len(got)
            d['f'] = os.path.basename(f)[:40]

    if not rows:
        log('새로 올릴 명세서가 없습니다.')
        for tag, ts in newest.items():
            sinces[tag] = ts
        st['sinces'] = sinces
        st.pop('since', None)
        json.dump(st, open(STATE, 'w', encoding='utf-8'))
        return 0

    # 같은 줄은 한 번만
    seen, uniq = set(), []
    for l in rows:
        k = (l['d'], l['n'], l['p'], l['s'], l['q'], l['m'], l.get('sj', ''), l.get('g', ''))
        if k in seen:
            continue
        seen.add(k)
        uniq.append(l)

    url = CFG.get('supabase', 'url')
    key = CFG.get('supabase', 'key')
    code = push(uniq, url, key, src)
    log('배차로 보냄:', len(uniq), '줄  (HTTP', code, ')')

    for tag, ts in newest.items():
        sinces[tag] = ts
    st['sinces'] = sinces
    st.pop('since', None)
    json.dump(st, open(STATE, 'w', encoding='utf-8'))
    return 0


if __name__ == '__main__':
    sys.exit(main())

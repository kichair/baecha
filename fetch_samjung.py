# -*- coding: utf-8 -*-
"""
이카운트(삼정퍼니처)에서 판매현황을 엑셀로 내려받는다.
   재고Ⅰ → 판매 → 판매현황

    python fetch_samjung.py            (창 없이 실행)
    python fetch_samjung.py --show     (창을 띄워서 눈으로 확인 · 처음엔 이걸로)

처음 준비:
    pip install playwright
    playwright install chromium
"""
import os, sys, time, glob, configparser, datetime

HERE = os.path.dirname(os.path.abspath(__file__))
CFG = configparser.ConfigParser()
CFG.read(os.path.join(HERE, 'config.ini'), encoding='utf-8')

SHOW = '--show' in sys.argv
OUT = CFG.get('folder', 'samjung', fallback='').strip() or os.path.join(HERE, '삼정')
try:
    os.makedirs(OUT, exist_ok=True)
except Exception as e:
    OUT = os.path.join(HERE, '삼정')
    os.makedirs(OUT, exist_ok=True)
    print('설정한 폴더를 못 써서 여기에 저장합니다:', OUT, '(', e, ')')


def log(*a):
    s = datetime.datetime.now().strftime('[%H:%M:%S] ') + ' '.join(str(x) for x in a)
    try:
        print(s, flush=True)
    except Exception:
        try:
            enc = sys.stdout.encoding or 'utf-8'
        except Exception:
            enc = 'utf-8'
        print(s.encode(enc, 'replace').decode(enc, 'replace'), flush=True)


def period():
    t = datetime.date.today()
    a = t - datetime.timedelta(days=CFG.getint('ecount', 'days_back', fallback=1))
    b = t + datetime.timedelta(days=CFG.getint('ecount', 'days_forward', fallback=21))
    return a.strftime('%Y%m%d'), b.strftime('%Y%m%d')


def main():
    from playwright.sync_api import sync_playwright

    com = CFG.get('ecount', 'company')
    uid = CFG.get('ecount', 'user')
    pwd = CFG.get('ecount', 'password')
    frm, to = period()
    log('조회 기간', frm, '~', to)

    with sync_playwright() as pw:
        br = pw.chromium.launch(headless=not SHOW)
        ctx = br.new_context(accept_downloads=True, locale='ko-KR',
                             viewport={'width': 1600, 'height': 950})
        pg = ctx.new_page()

        # 1) 로그인 ------------------------------------------------------
        pg.goto(CFG.get('ecount', 'login_url', fallback='https://login.ecount.com/'),
                wait_until='domcontentloaded')
        # 화면이 다 그려질 때까지 기다린다 (이카운트는 자바스크립트로 그린다)
        try:
            pg.wait_for_selector('#com_code', state='visible', timeout=30000)
        except Exception:
            log('로그인 화면이 안 떴습니다.')
            pg.screenshot(path=os.path.join(HERE, '_login_화면.png'))
            br.close()
            return 2
        pg.wait_for_timeout(600)

        # 이카운트 입력칸은 그냥 값을 넣으면 지워지는 경우가 있어
        # 실제로 타자를 치듯 넣고, 들어갔는지 확인한 뒤 안 들어갔으면 다시 친다
        def put(sel, val, label):
            val = (val or '').strip()
            if not val:
                log('!! config.ini 의', label, '이(가) 비어 있습니다')
                return False
            for _ in range(4):
                try:
                    el = pg.locator(sel)
                    el.click()
                    el.fill('')
                    pg.wait_for_timeout(120)
                    el.type(val, delay=45)
                    pg.wait_for_timeout(250)
                    if (el.input_value() or '').strip() == val:
                        return True
                except Exception:
                    pass
                pg.wait_for_timeout(400)
            log('!!', label, '칸에 입력이 안 됩니다')
            return False

        log('회사코드', com, '/ 사용자ID', uid)
        ok1 = put('#com_code', com, '회사코드')
        ok2 = put('#id', uid, '사용자ID')
        ok3 = put('#passwd', pwd, '비밀번호')

        # ID·비밀번호를 넣는 사이에 회사코드가 지워지는 일이 있어 한 번 더 확인
        try:
            if (pg.locator('#com_code').input_value() or '').strip() != com.strip():
                ok1 = put('#com_code', com, '회사코드')
        except Exception:
            pass

        if not (ok1 and ok2 and ok3):
            pg.screenshot(path=os.path.join(HERE, '_login_화면.png'), full_page=True)
            br.close()
            return 2
        log('회사코드·ID·비밀번호 입력 완료')

        # 로그인 중 뜨는 안내창은 모두 확인 처리 (중복 로그인 등)
        pg.on('dialog', lambda d: d.accept())

        try:
            pg.click('#save')
        except Exception:
            pg.keyboard.press('Enter')

        # 로그인 창(회사코드 칸)이 사라지면 로그인된 것
        # (ERP 주소도 loginca.ecount.com 이라 주소로 판단하면 안 된다)
        def logged_in():
            try:
                return pg.locator('#com_code').count() == 0 or not pg.locator('#com_code').first.is_visible()
            except Exception:
                return True
        for _ in range(60):
            pg.wait_for_timeout(500)
            if logged_in():
                break
        pg.wait_for_timeout(3000)

        # 이미 로그인 중이면 '강제 로그인' 같은 버튼이 뜬다
        for t in ['강제 로그인', '강제로그인', '접속', '확인', 'OK']:
            try:
                b = pg.get_by_role('button', name=t)
                if b.count() and b.first.is_visible():
                    b.first.click()
                    pg.wait_for_timeout(3000)
                    break
            except Exception:
                pass

        if not logged_in():
            log('로그인이 안 됐습니다. 회사코드·ID·비밀번호를 다시 확인해 주세요.')
            pg.screenshot(path=os.path.join(HERE, '_login_화면.png'), full_page=True)
            if SHOW:
                pg.wait_for_timeout(15000)
            br.close()
            return 2
        log('로그인 완료')

        # 2) 재고Ⅰ → 영업관리 → 판매현황 ------------------------------
        def click_text(t, timeout=8000):
            for f in [pg] + pg.frames:
                try:
                    el = f.get_by_text(t, exact=True).first
                    if el.count() and el.is_visible():
                        el.click(timeout=timeout)
                        return True
                except Exception:
                    pass
            return False

        for t in ['재고 I', '재고Ⅰ', '재고I']:
            if click_text(t):
                log('재고Ⅰ 클릭')
                break
        pg.wait_for_timeout(1500)
        if click_text('영업관리'):
            log('영업관리 클릭')
        pg.wait_for_timeout(1500)
        if click_text('판매현황'):
            log('판매현황 클릭')
        pg.wait_for_timeout(4000)

        # 조건 화면이 들어 있는 프레임 찾기
        def cond_frame():
            for f in [pg.main_frame] + pg.frames:
                try:
                    if f.locator('text=기준일자').count():
                        return f
                except Exception:
                    pass
            return pg.main_frame
        fr = cond_frame()

        # 3) 기준일자 넣고 F8 검색 --------------------------------------
        today = datetime.date.today()
        a = today.replace(day=1)          # 이번 달 1일부터
        b = today + datetime.timedelta(days=CFG.getint('ecount', 'days_forward', fallback=21))
        quick = CFG.get('ecount', 'quick_period', fallback='금월').strip()
        done_date = False

        # 기간 버튼(금월)이 있으면 그걸 먼저 쓴다 - 이번 달 1일~말일
        if quick:
            for t in [quick]:
                try:
                    el = fr.locator('text=' + t).first
                    if el.count() and el.is_visible():
                        el.click()
                        log('기간 버튼 [' + t + '] 사용 - 이번 달 전체')
                        done_date = True
                        pg.wait_for_timeout(1500)
                except Exception:
                    pass

        # 화면 안의 '날짜처럼 생긴 입력칸'을 직접 찾아서 채운다
        def _digits(s):
            return ''.join(ch for ch in (s or '') if ch.isdigit())

        def _fmt(dt, sample):
            if '-' in (sample or ''):
                return dt.strftime('%Y-%m-%d')
            if '/' in (sample or ''):
                return dt.strftime('%Y/%m/%d')
            if '.' in (sample or ''):
                return dt.strftime('%Y.%m.%d')
            return dt.strftime('%Y%m%d')

        def _date_inputs(f):
            out = []
            try:
                cands = f.locator('input[type="text"], input:not([type])')
                total = cands.count()
            except Exception:
                return out, 0
            for k in range(min(total, 120)):
                try:
                    v = cands.nth(k).input_value()
                except Exception:
                    continue
                d = _digits(v)
                if len(d) == 8 and 2000 <= int(d[:4]) <= 2100 and 1 <= int(d[4:6]) <= 12:
                    out.append((k, v))
            return out, total

        # 기준일자 칸 채우기.
        # 이카운트 화면은 [연][월][일] 세 칸으로 나뉘어 있고, 일 칸만 id="day" 다.
        # 같은 칸 묶음(부모) 안의 input 들을 순서대로 연/월/일로 보고 채운다.
        DATE_JS = """(args) => {
          const fire = (el) => {
            ['input', 'change', 'keyup', 'blur'].forEach(t => {
              try { el.dispatchEvent(new Event(t, { bubbles: true })); } catch (e) {}
            });
          };
          const days = Array.from(document.querySelectorAll('input#day'));
          if (days.length < 2) return { ok: false, why: 'day input ' + days.length };
          const dump = [];
          let filled = 0;
          for (let k = 0; k < 2; k++) {
            let box = days[k];
            for (let up = 0; up < 4 && box.parentElement; up++) {
              box = box.parentElement;
              if (box.querySelectorAll('input').length >= 3) break;
            }
            const ins = Array.from(box.querySelectorAll('input')).filter(
              e => !e.type || e.type === 'text' || e.type === 'tel');
            dump.push(ins.map((e, i) =>
              i + '|' + (e.id || '') + '|' + (e.name || '') + '|ml' + (e.maxLength || 0) + '|' + String(e.value || '')).join('  '));
            const want = args[k];
            const di = ins.indexOf(days[k]);
            if (di >= 2) {
              ins[di - 2].value = want[0]; fire(ins[di - 2]);
              ins[di - 1].value = want[1]; fire(ins[di - 1]);
              ins[di].value = want[2];     fire(ins[di]);
              filled++;
            } else if (di === 1) {
              ins[0].value = want[1]; fire(ins[0]);
              ins[1].value = want[2]; fire(ins[1]);
            }
          }
          const after = Array.from(document.querySelectorAll('input#day')).map(e => e.value).join(',');
          return { ok: true, rows: dump, filled: filled, day: after };
        }"""

        if not done_date:
            try:
                args = [['%04d' % a.year, '%02d' % a.month, '%02d' % a.day],
                        ['%04d' % b.year, '%02d' % b.month, '%02d' % b.day]]
                info = fr.evaluate(DATE_JS, args)
                log('날짜칸', info)
                if info.get('ok') and info.get('filled') == 2:
                    log('기준일자', a, '~', b)
            except Exception as e:
                log('날짜칸 채우기 실패:', e)
            done_date = True

        if not done_date:
            for t in ['금월', '전월+금월', '금월(~오늘)']:
                try:
                    el = fr.locator('text=' + t).first
                    if el.count() and el.is_visible():
                        el.click()
                        log('기간 버튼 [' + t + '] 사용')
                        done_date = True
                        pg.wait_for_timeout(1500)
                        break
                except Exception:
                    pass
        if not done_date:
            log('!! 기간을 못 정했습니다 - 화면 기본값으로 조회합니다')

        pg.keyboard.press('F8')
        pg.wait_for_timeout(2000)
        for sel in ['button:has-text("검색(F8)")', 'text=검색(F8)', 'button:has-text("Search(F3)")']:
            try:
                el = fr.locator(sel).first
                if el.count() and el.is_visible():
                    el.click()
                    break
            except Exception:
                pass
        pg.wait_for_timeout(7000)
        log('조회 완료')

        # 4) 하단 Excel(화면) 눌러서 내려받기 ---------------------------
        got = None
        res = cond_frame()
        for f in [pg.main_frame] + pg.frames:
            try:
                if f.locator('text=Excel(화면)').count():
                    res = f
                    break
            except Exception:
                pass
        try:
            with pg.expect_download(timeout=90000) as dl:
                done = False
                for sel in ['text=Excel(화면)', 'button:has-text("Excel")', '[title*="Excel"]', 'text=엑셀']:
                    try:
                        el = res.locator(sel).first
                        if el.count() and el.is_visible():
                            el.click()
                            done = True
                            break
                    except Exception:
                        pass
                if not done:
                    raise Exception('Excel(화면) 버튼을 못 찾음')
            d = dl.value
            name = '삼정_판매현황_%s.xlsx' % datetime.datetime.now().strftime('%Y%m%d_%H%M')
            got = os.path.join(OUT, name)
            d.save_as(got)          # 다운로드 폴더가 아니라 설정한 폴더에 저장
            log('저장 완료 →', got)
        except Exception as e:
            log('엑셀 내려받기 실패:', e)
            pg.screenshot(path=os.path.join(HERE, '_판매현황_화면.png'), full_page=True)
            log('화면을 _판매현황_화면.png 로 저장했습니다.')

        if SHOW:
            pg.wait_for_timeout(8000)   # 창을 눈으로 확인할 시간
        br.close()
        return 0 if got else 3


if __name__ == '__main__':
    sys.exit(main())

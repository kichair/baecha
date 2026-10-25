# -*- coding: utf-8 -*-
"""납품계 + 납품확인서 + 사진대지를 한 번에 만드는 프로그램 (결과: .hwpx)

실행: 납품서류_만들기.bat 더블클릭  (또는  python 납품서류_만들기.py)
필요: pip install python-hwpx pillow
"""
import io
import json
import os
import re
import sys
import warnings
from datetime import date
from pathlib import Path

warnings.filterwarnings("ignore")

# ===================== 업체 정보 (바뀔 때만 여기를 고치세요) =====================
COMPANY = "주식회사 광일체어"
ADDRESS = "인천광역시 서구 건지로109번길 21(석남동)"
BIZ_NO = "137-81-50515"        # 사업자등록번호
CEO = "오상현"
ORDERER = "서울지방조달청"            # 발주처 기본값
SUBMIT_TO = "서울지방조달청 자재구매과"  # 납품계 맨 아래 수신처 기본값
STAMP_FILE = "도장.png"        # 이 프로그램과 같은 폴더에 두면 (인) 위치에 자동으로 찍힙니다
# ================================================================================

HERE = Path(__file__).resolve().parent
SETTINGS = HERE / "마지막입력.json"
MIN_ROWS = 14                  # 납품내용 표의 기본 빈 줄 수

HP = "{http://www.hancom.co.kr/hwpml/2011/paragraph}"
H = lambda pt: int(round(pt * 100))
FONT = "굴림체"   # 글꼴을 바꾸려면 여기만 고치세요
BAT = MAL = GUL = TIT = FONT


# ----------------------------------------------------------------- 값 변환
def parse_date(s):
    """'2026-10-06' '2026.10.6' '20261006' → date"""
    if isinstance(s, date):
        return s
    nums = re.findall(r"\d+", str(s))
    if len(nums) == 1 and len(nums[0]) == 8:
        nums = [nums[0][:4], nums[0][4:6], nums[0][6:]]
    if len(nums) < 3:
        raise ValueError(f"날짜를 읽을 수 없습니다: {s!r}  (예: 2026-10-06)")
    return date(int(nums[0]), int(nums[1]), int(nums[2]))


def kr_date(d):
    return f"{d.year}년 {d.month}월 {d.day}일"


def spaced_date(d):
    return f"{d.year}년 {d.month}월 {d.day}일"


def dot_date(d):
    return f"{d.year}.{d.month:02d}.{d.day:02d}"


def hangul_amount(n):
    """26150000 → 이천육백일십오만"""
    dig = "영일이삼사오육칠팔구"
    unit4 = ["", "십", "백", "천"]
    big = ["", "만", "억", "조"]
    out, g = [], 0
    while n > 0:
        part, n = n % 10000, n // 10000
        s = "".join(dig[int(c)] + unit4[3 - i] for i, c in enumerate(f"{part:04d}") if c != "0")
        if s:
            out.append(s + big[g])
        g += 1
    return "".join(reversed(out)) or "영"


def won(n):
    return f"{n:,}"


def parse_items(text):
    """한 줄에 하나: 품명, 모델명, 수량, 단가  (쉼표 또는 탭)"""
    items = []
    for ln, line in enumerate(text.splitlines(), 1):
        if not line.strip():
            continue
        parts = [p.strip() for p in re.split(r"[,\t]", line)]
        if len(parts) < 4:
            raise ValueError(f"품목 {ln}번째 줄: '품명, 모델명, 수량, 단가' 4칸이 필요합니다.\n→ {line}")
        try:
            qty = int(parts[2].replace(",", ""))
            price = int(parts[3].replace(",", ""))
        except ValueError:
            raise ValueError(f"품목 {ln}번째 줄: 수량/단가는 숫자여야 합니다.\n→ {line}")
        items.append((parts[0], parts[1], qty, price))
    return items


# ----------------------------------------------------------------- 이미지
def prepare_photo(path, max_px=1600):
    """회전 보정 + 축소 → (jpeg bytes, 가로, 세로)"""
    from PIL import Image, ImageOps
    im = ImageOps.exif_transpose(Image.open(path)).convert("RGB")
    im.thumbnail((max_px, max_px))
    buf = io.BytesIO()
    im.save(buf, "JPEG", quality=85)
    return buf.getvalue(), im.width, im.height


def prepare_stamp(path, px=300):
    from PIL import Image
    im = Image.open(path).convert("RGBA")
    im.thumbnail((px, px))
    buf = io.BytesIO()
    im.save(buf, "PNG")
    return buf.getvalue()


def sort_photos(paths, by="name"):
    paths = [Path(p) for p in paths]
    if by == "time":
        return sorted(paths, key=lambda p: (p.stat().st_mtime, p.name))
    # 파일명 안의 숫자를 숫자로 비교 (IMG_2 < IMG_10)
    key = lambda p: [int(t) if t.isdigit() else t.lower() for t in re.split(r"(\d+)", p.name)]
    return sorted(paths, key=key)


# ----------------------------------------------------------------- 문서 생성
def build(data, photos, out_path, progress=None):
    from hwpx import HwpxDocument

    d = HwpxDocument.new()
    S = d.styles
    stamp_png = None
    stamp_path = HERE / STAMP_FILE
    if stamp_path.exists():
        stamp_png = prepare_stamp(stamp_path)
    stamp_id = d.add_image(stamp_png, "png") if stamp_png else None

    items = data["items"]
    total = sum(q * p for _, _, q, p in items)
    contract_amt = data.get("contract_amount") or total
    blank = bool(data.get("blank"))          # 빈 양식(내용 없이 틀만)
    deliver = None if blank else parse_date(data["deliver_date"])
    contract_date = data.get("contract_date")
    due_date = data.get("due_date")
    orderer = data.get("orderer") or ORDERER
    submit_to = data.get("submit_to") or SUBMIT_TO
    submit_date = parse_date(data["submit_date"]) if data.get("submit_date") else deliver
    fmt = lambda f, x: f(x) if x else ""
    place = data.get("place", "")
    title = data.get("contract_name", "")
    photo_content = data.get("photo_content") or title   # 비우면 계약명과 동일

    def run(font, size, bold=False):
        return S.ensure_run(font=font, size=size, bold=bold)

    class Sec:
        def __init__(self, i, L, R):
            self.i, self.y = i, 0.0
            d.set_page_margins(left=H(L), right=H(R), top=0, bottom=0, header=0, footer=0, section_index=i)

        def new_page(self):
            self.y = 0.0

        def text(self, txt, top, size, font, bold=False, align="LEFT", indent=0, pb=False):
            cid = run(font, size, bold)
            first = d.sections[self.i].paragraphs[0]
            if self.y == 0 and not first.text.strip() and not getattr(self, "used", False):
                p = first
                p.text = txt
                for rn in p.element.iter(HP + "run"):
                    rn.set("charPrIDRef", cid)
            else:
                d.add_paragraph(txt, section_index=self.i, char_pr_id_ref=cid)
                p = d.sections[self.i].paragraphs[-1]
            self.used = True
            S.apply_paragraph_format(paragraphs=[p], alignment=align, line_spacing_percent=100,
                                     spacing_before_pt=max(top - self.y, 0), spacing_after_pt=0,
                                     indent_left_mm=indent / 2.835, page_break_before=pb)
            self.y = top + size
            return p

        def table(self, top, rows, cols, row_h, pb=False):
            t = d.add_table(rows, cols, section_index=self.i,
                            border_fill_id_ref=S.ensure_border_fill(border_color="#000000", border_width="0.12 mm"))
            p = d.sections[self.i].paragraphs[-1]
            S.apply_paragraph_format(paragraphs=[p], alignment="LEFT", line_spacing_percent=100,
                                     spacing_before_pt=max(top - self.y, 0), spacing_after_pt=0,
                                     page_break_before=pb)
            self.used = True
            self.y = top + sum(row_h)
            return t

    def finish(t, col_w, row_h):
        tbl = t.element
        tbl.find(HP + "sz").set("width", str(H(sum(col_w))))
        tbl.find(HP + "sz").set("height", str(H(sum(row_h))))
        for tc in tbl.iter(HP + "tc"):
            a, sp, sz = tc.find(HP + "cellAddr"), tc.find(HP + "cellSpan"), tc.find(HP + "cellSz")
            c, r = int(a.get("colAddr")), int(a.get("rowAddr"))
            cs, rs = int(sp.get("colSpan")), int(sp.get("rowSpan"))
            sz.set("width", str(H(sum(col_w[c:c + cs]))))
            sz.set("height", str(H(sum(row_h[r:r + rs]))))

    def cell(t, r, c, txt="", font=BAT, size=10, align="CENTER"):
        t.set_cell_text(r, c, txt)
        for p in t.cell(r, c).paragraphs:
            for rn in p.element.iter(HP + "run"):
                rn.set("charPrIDRef", run(font, size))
            S.apply_paragraph_format(paragraphs=[p], alignment=align, line_spacing_percent=100,
                                     spacing_before_pt=0, spacing_after_pt=0)

    def stamp(p, x, y, size=50):
        if stamp_id:
            p.add_picture(stamp_id, width=H(size), height=H(size), treat_as_char=False,
                          pos_overrides={"horzRelTo": "PAPER", "vertRelTo": "PAPER", "horzAlign": "LEFT",
                                         "vertAlign": "TOP", "horzOffset": H(x), "vertOffset": H(y)},
                          text_wrap="IN_FRONT_OF_TEXT")

    # ======== 1. 납품계 (위치·크기는 작성된 광일체어 원본 기준) ========
    s = Sec(0, 45, 68.7)
    s.text("납 품 계", 99.7, 26, TIT, True, "CENTER")
    amt_txt = (f"{won(contract_amt)}원(금 {hangul_amount(contract_amt)}원정/VAT포함)"
               if contract_amt else "")
    for lab, val, top in [("○ 계 약 명 :", title, 197.4),
                          ("○ 계약금액 :", amt_txt, 228.4),
                          ("○ 계약일자 :", dot_date(parse_date(contract_date)) if contract_date else "", 259.5),
                          ("○ 납품기한 :", dot_date(parse_date(due_date)) if due_date else "", 290.4),
                          ("○ 납품일자 :", fmt(dot_date, deliver), 321.5)]:
        s.text(f"{lab} {val}".rstrip(), top, 15, BAT)
    s.text("상기와 같이 납품하였기에 납품계를 제출합니다.", 376.5, 15, BAT, align="CENTER")
    s.text(fmt(spaced_date, submit_date) or "20    년      월      일", 520.5, 15, BAT, align="CENTER")
    for txt, top in [(f"업체명 : {COMPANY}", 592.5), (f"사업자번호 : {BIZ_NO}".rstrip(), 616.5),
                     (f"주    소 : {ADDRESS}", 640.5)]:
        s.text(txt, top, 15, BAT, True, indent=97.1)
    p = s.text(f"대표이사 : {CEO}               (인)", 664.5, 15, BAT, True, indent=97.1)
    stamp(p, 367.4, 650.5, 48.4)
    s.text(f"{submit_to} 귀하", 737.6, 20, TIT, True, "CENTER")

    # ======== 2. 납품확인서 ========
    d.add_section()
    s = Sec(1, 46.4, 58.8)
    s.text("납 품 확 인 서", 61.0, 18, MAL, True, "CENTER", pb=True)
    cw, rh = [97.4, 392.7], [28.0]
    t = s.table(109.3, 1, 2, rh); cell(t, 0, 0, "발 주 처", MAL, 11); cell(t, 0, 1, orderer, MAL, 11, "LEFT")
    finish(t, cw, rh)
    s.text("당사는 상기 발주처에 아래와 같이 납품하였음을 확인합니다.", 150.7, 11, MAL)
    s.text("- 납 품 내 용 -", 179.5, 11, MAL, align="CENTER")
    body = max(MIN_ROWS, len(items))
    cw = [58.4, 84.0, 95.2, 47.1, 61.3, 75.6, 67.0]
    rh = [22.7] * (1 + body + 3)
    t = s.table(202.7, len(rh), 7, rh)
    for c, h in enumerate(["납품일자", "품  명", "모델명", "수 량", "단 가", "공 급 가 액", "비 고"]):
        cell(t, 0, c, h, MAL, 10)
    for i, (name, model, qty, price) in enumerate(items):
        r = 1 + i
        if i == 0:
            cell(t, r, 0, f"{deliver.month}/{deliver.day}" if deliver else "", MAL, 10)
        cell(t, r, 1, name, MAL, 10); cell(t, r, 2, model, MAL, 10)
        cell(t, r, 3, str(qty), MAL, 10); cell(t, r, 4, won(price), MAL, 10)
        cell(t, r, 5, won(qty * price), MAL, 10)
    base = 1 + body
    for r, lab, val in [(base, "계", won(total) if items else ""), (base + 1, "부가세", "" if blank else "(포함)"), (base + 2, "합계", "")]:
        cell(t, r, 4, lab, MAL, 10)
        if val:
            cell(t, r, 5, val, MAL, 10, "RIGHT")
        nb = S.ensure_border_fill(border_color="#000000", active_borders=[])
        for c in range(4):
            t.cell(r, c).element.set("borderFillIDRef", nb)
    finish(t, cw, rh)
    y_end = 202.7 + sum(rh)
    s.text(fmt(spaced_date, submit_date) or "20    년      월      일", y_end + 33.6, 11, MAL, align="CENTER")
    for txt, off in [(f"사업자등록번호      {BIZ_NO}".rstrip(), 73.1), (f"주          소      {ADDRESS}", 89.7),
                     (f"상          호      {COMPANY}", 106.4)]:
        s.text(txt, y_end + off, 11, MAL, indent=10.2)
    p = s.text(f"대    표    자      {CEO}                  (인)", y_end + 122.8, 11, MAL, indent=10.2)
    stamp(p, 282.9, y_end + 100.8, 49.8)

    # ======== 3. 사진대지 (사진 2장 = 1쪽) ========
    d.add_section()
    s = Sec(2, 29.4, 52.9)
    cw = [87.1, 196.6, 78.9, 150.0]
    rh = [269.0, 34.7, 34.8, 271.7, 33.3, 31.0]
    n_pages = max(1, (len(photos) + 1) // 2)
    for pg in range(n_pages):
        if progress:
            progress(f"사진대지 {pg + 1}/{n_pages}쪽 만드는 중…")
        s.new_page()
        s.text("사 진 대 지", 58.2, 20, GUL, True, "CENTER", pb=(pg > 0))
        t = s.table(90.1, 6, 4, rh)
        for r0 in (0, 3):
            t.merge_cells(r0, 0, r0, 3)
        for r0 in (2, 5):
            t.merge_cells(r0, 1, r0, 3)
        for k, r0 in enumerate((1, 4)):
            cell(t, r0, 0, "위치"); cell(t, r0, 1, place, align="LEFT"); cell(t, r0, 2, "날짜")
            cell(t, r0, 3, fmt(dot_date, deliver))
            cell(t, r0 + 1, 0, "내용"); cell(t, r0 + 1, 1, photo_content, align="LEFT")
            idx = pg * 2 + k
            if idx < len(photos):
                jpg, w, h = prepare_photo(photos[idx])
                bid = d.add_image(jpg, "jpg")
                box_w, box_h = 442.0, (252.0 if k == 0 else 255.0)
                sc = min(box_w / w, box_h / h)
                pw, ph = w * sc, h * sc
                photo_row = r0 - 1
                c = t.cell(photo_row, 0)
                par = c.paragraphs[0]
                S.apply_paragraph_format(paragraphs=[par], alignment="CENTER", line_spacing_percent=100,
                                         spacing_before_pt=0, spacing_after_pt=0)
                par.add_picture(bid, width=H(pw), height=H(ph))
        finish(t, cw, rh)

    d.save_to_path(str(out_path))
    _clean_metadata(out_path)
    return out_path


def _clean_metadata(path):
    """라이브러리 기본 작성자 표시를 업체명으로 바꾼다 (실패해도 문서에는 영향 없음)."""
    import os
    import zipfile
    tmp = str(path) + ".tmp"
    try:
        with zipfile.ZipFile(path) as zin, zipfile.ZipFile(tmp, "w") as zout:
            for it in zin.infolist():
                data = zin.read(it.filename)
                if it.filename.endswith("content.hpf"):
                    data = data.decode("utf-8").replace("synthetic-fixture-author", COMPANY).encode("utf-8")
                zout.writestr(it, data, compress_type=it.compress_type)
        os.replace(tmp, path)
    except Exception:
        if os.path.exists(tmp):
            os.remove(tmp)


def hwpx_to_pdf(src, dst):
    """한컴오피스(한글)가 설치된 Windows에서 hwpx를 PDF로 변환한다. 성공하면 True."""
    try:
        import os
        import win32com.client  # pip install pywin32
        hwp = win32com.client.Dispatch("HWPFrame.HwpObject")
        try:
            hwp.RegisterModule("FilePathCheckDLL", "FilePathCheckerModule")  # 보안 확인창 방지(등록돼 있을 때)
        except Exception:
            pass
        hwp.Open(os.path.abspath(src), "HWPX", "")
        hwp.SaveAs(os.path.abspath(dst), "PDF", "")
        hwp.Quit()
        return Path(dst).exists()
    except Exception:
        return False


# ----------------------------------------------------------------- 화면(GUI)
def run_gui():
    import tkinter as tk
    from tkinter import filedialog, messagebox

    # ---------- 색상/글꼴 ----------
    BG, CARD, NAVY, BLUE, BLUE_D = "#eef1f6", "#ffffff", "#17304f", "#2f6fed", "#2459c7"
    TXT, SUB, LINE, OK = "#1c2430", "#6b7686", "#d5dbe6", "#0f9d58"
    FF = "맑은 고딕"
    f_norm, f_small = (FF, 10), (FF, 9)
    f_bold, f_title, f_big = (FF, 10, "bold"), (FF, 17, "bold"), (FF, 12, "bold")

    last = {}
    try:
        last = json.loads(SETTINGS.read_text(encoding="utf-8"))
    except Exception:
        pass

    root = tk.Tk()
    root.title("납품서류 만들기")
    root.geometry("880x780")
    root.minsize(760, 560)
    root.configure(bg=BG)

    # ---------- 상단 배너 ----------
    head = tk.Frame(root, bg=NAVY)
    head.pack(fill="x")
    tk.Label(head, text="납품서류 만들기", bg=NAVY, fg="white", font=f_title).pack(anchor="w", padx=24, pady=(14, 0))
    tk.Label(head, text=f"{COMPANY}  ·  납품계 + 납품확인서 + 사진대지를 한 번에", bg=NAVY, fg="#a9b8d0",
             font=f_small).pack(anchor="w", padx=24, pady=(0, 14))

    # ---------- 하단 고정 영역 (옵션 + 만들기 버튼) ----------
    foot = tk.Frame(root, bg=CARD, highlightbackground=LINE, highlightthickness=1)
    foot.pack(side="bottom", fill="x")

    # ---------- 스크롤 가능한 본문 ----------
    wrap = tk.Frame(root, bg=BG)
    wrap.pack(fill="both", expand=True)
    canvas = tk.Canvas(wrap, bg=BG, highlightthickness=0)
    sb = tk.Scrollbar(wrap, orient="vertical", command=canvas.yview)
    canvas.configure(yscrollcommand=sb.set)
    sb.pack(side="right", fill="y")
    canvas.pack(side="left", fill="both", expand=True)
    body = tk.Frame(canvas, bg=BG)
    win = canvas.create_window((0, 0), window=body, anchor="nw")
    body.bind("<Configure>", lambda e: canvas.configure(scrollregion=canvas.bbox("all")))
    canvas.bind("<Configure>", lambda e: canvas.itemconfig(win, width=e.width))
    canvas.bind_all("<MouseWheel>", lambda e: canvas.yview_scroll(int(-e.delta / 120), "units")
                    if not isinstance(root.focus_get(), (tk.Text, tk.Listbox)) else None)

    def card(title, hint=""):
        outer = tk.Frame(body, bg=BG)
        outer.pack(fill="x", padx=20, pady=(14, 0))
        box = tk.Frame(outer, bg=CARD, highlightbackground=LINE, highlightthickness=1)
        box.pack(fill="x")
        top = tk.Frame(box, bg=CARD)
        top.pack(fill="x", padx=18, pady=(14, 6))
        tk.Frame(top, bg=BLUE, width=4, height=18).pack(side="left")
        tk.Label(top, text=title, bg=CARD, fg=TXT, font=f_big).pack(side="left", padx=(8, 0))
        if hint:
            tk.Label(top, text=hint, bg=CARD, fg=SUB, font=f_small).pack(side="left", padx=(10, 0))
        inner = tk.Frame(box, bg=CARD)
        inner.pack(fill="x", padx=18, pady=(0, 16))
        return inner

    vars_ = {}

    def entry(parent, key, label, init, row, col, span=1):
        cell = tk.Frame(parent, bg=CARD)
        cell.grid(row=row, column=col, columnspan=span, sticky="ew", padx=(0, 14), pady=(4, 6))
        tk.Label(cell, text=label, bg=CARD, fg=SUB, font=f_small).pack(anchor="w")
        v = tk.StringVar(value=init)
        e = tk.Entry(cell, textvariable=v, font=f_norm, relief="flat", bg="#f7f9fc", fg=TXT,
                     highlightthickness=1, highlightbackground=LINE, highlightcolor=BLUE, insertbackground=TXT)
        e.pack(fill="x", ipady=5, pady=(2, 0))
        vars_[key] = v
        return e

    today = date.today().strftime("%Y-%m-%d")

    # ---------- 1. 계약 정보 ----------
    c1 = card("계약 정보", "비워도 되는 칸은 비워 두세요")
    for i in range(2):
        c1.columnconfigure(i, weight=1, uniform="c")
    entry(c1, "contract_name", "계약명", last.get("contract_name", ""), 0, 0, 2)
    entry(c1, "submit_to", "납품계 수신처  (맨 아래 '○○ 귀하')", last.get("submit_to", SUBMIT_TO), 1, 0)
    entry(c1, "orderer", "납품확인서 발주처", last.get("orderer", ORDERER), 1, 1)
    entry(c1, "place", "사진대지 '위치'  (수요기관·부서)", last.get("place", "경기도 이천시 "), 2, 0)
    entry(c1, "photo_content", "사진대지 '내용'  (비우면 계약명과 같게)", last.get("photo_content", ""), 2, 1)
    entry(c1, "contract_date", "계약일자   예) 2026-09-29", last.get("contract_date", ""), 3, 0)
    entry(c1, "due_date", "납품기한   예) 2026-11-14", last.get("due_date", ""), 3, 1)
    entry(c1, "deliver_date", "납품일자   예) 2026-10-15", today, 4, 0)
    entry(c1, "submit_date", "제출일자  (납품계·확인서 날짜)", today, 4, 1)
    entry(c1, "contract_amount", "계약금액 숫자  (비우면 품목 합계로 자동 계산)", "", 5, 0, 2)

    # ---------- 2. 품목 ----------
    c2 = card("품목", "한 줄에 하나   품명, 모델명, 수량, 단가")
    items_box = tk.Text(c2, height=6, font=f_norm, relief="flat", bg="#f7f9fc", fg=TXT, wrap="none",
                        highlightthickness=1, highlightbackground=LINE, highlightcolor=BLUE, insertbackground=TXT)
    items_box.pack(fill="x", pady=(2, 0))
    items_box.insert("1.0", last.get("items_text", "캐비닛, SJAC0083D, 22, 225500\n"))
    tk.Label(c2, text="공급가액·계·계약금액(한글 금액 포함)은 자동으로 계산됩니다.", bg=CARD, fg=SUB,
             font=f_small).pack(anchor="w", pady=(6, 0))

    # ---------- 3. 사진 ----------
    c3 = card("사진", "위에서 아래 순서대로 사진대지에 들어갑니다 (2장 = 1쪽)")
    paths = []
    count_var = tk.StringVar()
    by_var = tk.StringVar(value="name")

    left = tk.Frame(c3, bg=CARD)
    left.pack(side="left", fill="both", expand=True)
    lbf = tk.Frame(left, bg=CARD, highlightbackground=LINE, highlightthickness=1)
    lbf.pack(fill="both", expand=True)
    lb = tk.Listbox(lbf, height=9, selectmode="extended", font=f_norm, relief="flat", activestyle="none",
                    selectbackground="#dbe7ff", selectforeground=TXT, bg="#f7f9fc", highlightthickness=0)
    lsb = tk.Scrollbar(lbf, command=lb.yview)
    lb.configure(yscrollcommand=lsb.set)
    lsb.pack(side="right", fill="y")
    lb.pack(side="left", fill="both", expand=True)
    tk.Label(left, textvariable=count_var, bg=CARD, fg=BLUE, font=f_bold).pack(anchor="w", pady=(6, 0))

    right = tk.Frame(c3, bg=CARD)
    right.pack(side="left", fill="y", padx=(14, 0))
    prev = tk.Label(right, bg="#f0f3f8", width=24, height=8, text="미리보기", fg=SUB, font=f_small,
                    highlightbackground=LINE, highlightthickness=1)
    prev.pack(pady=(0, 8))
    prev_img = {"im": None}

    def show_preview(_=None):
        sel = lb.curselection()
        if not sel:
            return
        try:
            from PIL import Image, ImageOps, ImageTk
            im = ImageOps.exif_transpose(Image.open(paths[sel[0]]))
            im.thumbnail((190, 130))
            prev_img["im"] = ImageTk.PhotoImage(im)
            prev.configure(image=prev_img["im"], text="", width=190, height=130)
        except Exception:
            prev.configure(image="", text="미리보기 없음")

    lb.bind("<<ListboxSelect>>", show_preview)

    def refresh():
        lb.delete(0, "end")
        for i, p in enumerate(paths, 1):
            lb.insert("end", f"  {i:>2}.  {Path(p).name}")
        n = len(paths)
        count_var.set(f"사진 {n}장  →  사진대지 {max(1, (n + 1) // 2)}쪽" if n else "사진을 추가해 주세요")

    def add_photos():
        sel = filedialog.askopenfilenames(title="사진 선택 (여러 장 한 번에)",
                                          filetypes=[("사진", "*.jpg *.jpeg *.png *.bmp *.webp"), ("모든 파일", "*.*")])
        if sel:
            paths.extend(str(p) for p in sort_photos(sel, by_var.get()))
            refresh()

    def move(delta):
        idxs = list(lb.curselection())
        if not idxs:
            return
        for i in (idxs if delta < 0 else reversed(idxs)):
            j = i + delta
            if 0 <= j < len(paths):
                paths[i], paths[j] = paths[j], paths[i]
        refresh()
        for i in idxs:
            lb.selection_set(min(max(i + delta, 0), len(paths) - 1))

    def remove():
        for i in reversed(lb.curselection()):
            del paths[i]
        refresh()

    def btn(parent, text, cmd, primary=False):
        return tk.Button(parent, text=text, command=cmd, font=f_norm, relief="flat", cursor="hand2",
                         bg=BLUE if primary else "#e8edf5", fg="white" if primary else TXT,
                         activebackground=BLUE_D if primary else "#d8e0ee",
                         activeforeground="white" if primary else TXT, padx=10, pady=5)

    btn(right, "＋  사진 추가", add_photos, True).pack(fill="x")
    row = tk.Frame(right, bg=CARD)
    row.pack(fill="x", pady=(6, 0))
    btn(row, "▲ 위로", lambda: move(-1)).pack(side="left", expand=True, fill="x", padx=(0, 3))
    btn(row, "▼ 아래로", lambda: move(1)).pack(side="left", expand=True, fill="x", padx=(3, 0))
    btn(right, "선택 삭제", remove).pack(fill="x", pady=(6, 0))
    tk.Label(right, text="추가할 때 정렬", bg=CARD, fg=SUB, font=f_small).pack(anchor="w", pady=(10, 0))
    for txt, val in [("파일명순", "name"), ("촬영(수정)시간순", "time")]:
        tk.Radiobutton(right, text=txt, variable=by_var, value=val, bg=CARD, font=f_small, anchor="w",
                       activebackground=CARD, selectcolor=CARD).pack(fill="x")
    refresh()
    tk.Frame(body, bg=BG, height=16).pack()

    # ---------- 하단: 옵션 + 버튼 ----------
    status = tk.StringVar()
    pdf_var = tk.BooleanVar(value=last.get("pdf_auto", False))
    open_var = tk.BooleanVar(value=last.get("open_after", True))
    opts = tk.Frame(foot, bg=CARD)
    opts.pack(side="left", padx=18, pady=10)
    tk.Checkbutton(opts, text="만든 뒤 한글에서 바로 열기  (고친 다음 PDF로 저장)", variable=open_var, bg=CARD,
                   font=f_small, activebackground=CARD).pack(anchor="w")
    tk.Checkbutton(opts, text="수정 없이 PDF도 같이 자동 저장  (선택)", variable=pdf_var, bg=CARD,
                   font=f_small, activebackground=CARD).pack(anchor="w")
    tk.Label(opts, textvariable=status, bg=CARD, fg=OK, font=f_small).pack(anchor="w")

    def make():
        try:
            items = parse_items(items_box.get("1.0", "end"))
            if not items:
                raise ValueError("품목을 한 줄 이상 입력하세요.")
            data = {k: v.get().strip() for k, v in vars_.items()}
            data["items"] = items
            data["contract_amount"] = int(re.sub(r"\D", "", data["contract_amount"]) or 0) or None
            parse_date(data["deliver_date"])
            out = filedialog.asksaveasfilename(
                title="저장할 위치", defaultextension=".hwpx",
                initialfile=f"납품서류_{parse_date(data['deliver_date']):%Y%m%d}.hwpx",
                filetypes=[("한글 문서(hwpx)", "*.hwpx")])
            if not out:
                return
            status.set("만드는 중…  잠시만 기다려 주세요")
            root.update()
            build(data, paths, out, progress=lambda m: (status.set(m), root.update()))
            SETTINGS.write_text(json.dumps({
                "contract_name": data["contract_name"], "orderer": data["orderer"], "place": data["place"],
                "submit_to": data["submit_to"], "photo_content": data["photo_content"],
                "contract_date": data["contract_date"], "due_date": data["due_date"],
                "items_text": items_box.get("1.0", "end").strip(),
                "pdf_auto": pdf_var.get(), "open_after": open_var.get()}, ensure_ascii=False), encoding="utf-8")
            msg = f"저장했습니다.\n{out}"
            if pdf_var.get():
                status.set("PDF 변환 중…")
                root.update()
                pdf = str(Path(out).with_suffix(".pdf"))
                if hwpx_to_pdf(out, pdf):
                    msg += f"\n\nPDF도 저장했습니다.\n{pdf}"
                else:
                    msg += "\n\nPDF 자동 변환은 되지 않았습니다. 한글에서 열어 [파일 → PDF로 저장하기]를 눌러 주세요."
            msg += "\n\n한글에서 내용을 고친 뒤 [파일 → PDF로 저장하기]로 PDF를 만드세요."
            if open_var.get():
                try:
                    os.startfile(out)
                except Exception:
                    pass
            status.set(f"완료: {out}")
            messagebox.showinfo("완료", msg)
        except Exception as e:
            status.set("")
            messagebox.showerror("확인해 주세요", str(e))

    go = tk.Button(foot, text="서류 만들기", command=make, font=(FF, 13, "bold"), bg=BLUE, fg="white",
                   activebackground=BLUE_D, activeforeground="white", relief="flat", cursor="hand2",
                   padx=34, pady=10)
    go.pack(side="right", padx=18, pady=12)
    root.mainloop()


if __name__ == "__main__":
    try:
        run_gui()
    except Exception:
        import traceback
        msg = traceback.format_exc()
        try:
            (HERE / "오류기록.txt").write_text(msg, encoding="utf-8")
            import tkinter
            from tkinter import messagebox
            r = tkinter.Tk(); r.withdraw()
            messagebox.showerror("오류", "프로그램에 문제가 생겼습니다.\n오류기록.txt 파일을 보내주세요.\n\n" + msg[-600:])
        except Exception:
            pass

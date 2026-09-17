# -*- coding: utf-8 -*-
"""
Servidor local do App Start Inglês.

Serve a página + endpoints de YouTube (metadados e legendas).
Rode com:  python youtube_server.py
Depois abra: http://127.0.0.1:5110
"""
import html
import json
import os
import re
import sys
import tempfile
import urllib.parse
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

ROOT = os.path.dirname(os.path.abspath(__file__))
PORT = int(os.environ.get("PORT", "5110"))
ON_RENDER = os.environ.get("RENDER") == "1"
HOST = "0.0.0.0" if ON_RENDER else "127.0.0.1"

VIDEO_ID_RE = re.compile(
    r"(?:youtube\.com/(?:watch\?[^#]*v=|embed/|shorts/|live/|shorts%2F)|youtu\.be/)([\w-]{11})"
)
LANG_WHITELIST = ["en", "pt", "es", "fr", "de", "it", "ja", "ko", "nl", "ru"]

MIME = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "application/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".mp3": "audio/mpeg",
    ".mp4": "video/mp4",
    ".m4a": "audio/mp4",
    ".webm": "video/webm",
    ".ico": "image/x-icon",
    ".svg": "image/svg+xml",
}

CAPTION_CACHE = {}
CACHE_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "logs", "transl_cache.json")
try:
    TRANSLATE_CACHE = _load_cache_early()
except Exception:
    TRANSLATE_CACHE = {}

MEDIA_DIR = os.path.join(tempfile.gettempdir(), "aprende_ingles_media")
CURRENT_MEDIA = {"video_id": None, "file": None}


def _load_cache_early():
    import json as _json
    try:
        with open(CACHE_PATH, "r", encoding="utf-8") as f:
            d = _json.load(f)
        return d if isinstance(d, dict) else {}
    except Exception:
        return {}


def merge_lines(rows):
    """Junta trechos curtos de legenda em linhas legiveis (mesma logica do app.js)."""
    out = []
    cur = None
    for r in rows:
        txt = str(r.get("text") or "").strip()
        if not txt:
            continue
        start = float(r.get("start", 0))
        dur = float(r.get("dur", 0))
        if cur is None:
            cur = {"start": start, "dur": dur, "text": txt}
            continue
        joined = cur["text"] + " " + txt
        gap = start - (cur["start"] + cur["dur"])
        if len(joined.split()) <= 10 and gap < 1.2:
            cur["text"] = joined
            cur["dur"] = (start + dur) - cur["start"]
        else:
            out.extend(_split_long(cur))
            cur = {"start": start, "dur": dur, "text": txt}
    if cur:
        out.extend(_split_long(cur))
    return out


def _split_long(cur):
    """Quebra blocos longos de legenda em frases, distribuindo o tempo pela letra."""
    txt = str(cur.get("text") or "").strip()
    dur = float(cur.get("dur", 0))
    start = float(cur.get("start", 0))
    if dur < 6.5:
        return [cur]
    import re
    parts = [p.strip() for p in re.split(r"(?<=[;,.!?\-)])\s+|\s+\([^)]*\)|\(\d+\)", txt) if p.strip()]
    if len(parts) < 2:
        return [cur]
    total = sum(len(p) for p in parts) or 1
    out = []
    acc = start
    dur_sum = 0.0
    for p in parts:
        w = max(0.35, dur * len(p) / total)
        out.append({"start": round(acc, 2), "dur": round(w, 2), "text": p})
        acc += w
        dur_sum += w
    if dur_sum < dur * 0.6:
        out[-1]["dur"] = round(out[-1]["dur"] + (dur - dur_sum), 2)
    return out


# ---------- letra correta via LRCLIB (as legendas automaticas do YT sao cheias de erro) ----------

_EN_STOPS = set(("the a an and you i to of in it that is was for on are with as this your my me we they he she "
                 "not but at from or have has do does be been so no yes there here").split())


def _english_ratio(texts):
    tot = 0
    hits = 0
    for t in texts[:40]:
        for w in re.findall(r"[a-z']+", (t or "").lower()):
            tot += 1
            # stopwords comuns OU palavras curtas ("doo", "na", "la", "hey"):
            # musicas infantis repetem silabas que nao estao em nenhuma lista
            if w in _EN_STOPS or len(w) <= 3:
                hits += 1
    return (hits / tot) if tot else 0.0


def _token_overlap(a, b):
    ta = set(re.findall(r"[a-z']+", a.lower()))
    tb = set(re.findall(r"[a-z']+", (b or "").lower()))
    if not ta or not tb:
        return 0.0
    return len(ta & tb) / min(len(ta), len(tb))


def _parse_lrc(text):
    out = []
    for line in (text or "").splitlines():
        m = re.match(r"\[(\d+):(\d+(?:\.\d+)?)\](.*)", line.strip())
        if not m:
            continue
        t = int(m.group(1)) * 60 + float(m.group(2))
        txt = m.group(3).strip()
        if txt:
            out.append({"t": round(t, 2), "text": txt})
    return out


def _song_query_variants(query, title):
    """Gera variacoes da busca (tira ruido tipo '(Official Video)', '|', 'Lyrics')
    e vai encurtando a frase, porque a busca do LRCLIB falha com frases longas."""
    import re

    def clean(s):
        s = re.sub(r"[\(\[].*?[\)\]]", " ", s)
        s = re.split(r"[|/]", s)[0]
        s = re.sub(r"\b(official|video|lyrics?|audio|hd|hq|4k|remaster(ed)?|live|feat|ft|mv|music|"
                   r"nursery|rhymes?|kids|songs?|dance|most|viewed)\b", " ", s, flags=re.I)
        s = re.sub(r"[^0-9A-Za-z\u00c0-\u00ff'\s-]", " ", s)
        return re.sub(r"\s+", " ", s).strip()

    variants = []
    for src in (query, title):
        src = (src or "").strip()
        if not src:
            continue
        if src not in variants:
            variants.append(src)
        c = clean(src)
        if c and c not in variants:
            variants.append(c)
    for s in list(variants):
        words = s.split()
        for n in (5, 4, 3, 2):
            if len(words) > n:
                v = " ".join(words[:n])
                if v not in variants:
                    variants.append(v)
    return variants[:10]


def fetch_lrclib(query, title="", author=""):
    """Busca letra sincronizada (LRC) no lrclib. Retorna lista de {t,text} ou []."""
    import json as _json
    import urllib.parse
    author = (author or "").strip()
    best = []
    for q in _song_query_variants(query, title):
        urls = ["https://lrclib.net/api/search?q=" + urllib.parse.quote(q)]
        if author:
            urls.append("https://lrclib.net/api/search?track_name=" +
                        urllib.parse.quote(q + " " + author))
        for u in urls:
            try:
                req = urllib.request.Request(u, headers={"User-Agent": "Mozilla/5.0"})
                with urllib.request.urlopen(req, timeout=15) as r:
                    items = _json.loads(r.read().decode("utf-8", "replace"))
                for it in (items or []):
                    lrc = _parse_lrc(it.get("syncedLyrics"))
                    if len(lrc) >= 3 and len(lrc) > len(best):
                        best = lrc
            except Exception:
                continue
        if len(best) >= 8:
            break
    return best


def best_lrc_offset(cap_lines, lrc_lines):
    """Acha o deslocamento (em s) entre a linha do tempo da legenda YT e a do LRC."""
    cand = []
    for ci in range(min(8, len(cap_lines))):
        best_li = -1
        best_s = 0.0
        for li in range(min(12, len(lrc_lines))):
            s = _token_overlap(cap_lines[ci].get("text", ""), lrc_lines[li].get("text", ""))
            if s > best_s:
                best_s = s
                best_li = li
        if best_s >= 0.35:
            cand.append(round(cap_lines[ci]["start"] - lrc_lines[best_li]["t"], 2))
    if len(cand) < 3:
        return None
    cand.sort()
    off = cand[len(cand) // 2]
    agree = sum(1 for c in cand if abs(c - off) <= 2.0)
    if agree < 3:
        return None
    return off


# ---------- Vagalume: letra correta + traducao humana PT (alinhadas por linha) ----------

def _slug(s):
    s = (s or "").lower()
    for a, b in (("áàâãä", "a"), ("éèêë", "e"), ("íìîï", "i"),
                 ("óòôõö", "o"), ("úùûü", "u"), ("ç", "c")):
        for ch in a:
            s = s.replace(ch, b)
    s = re.sub(r"[^a-z0-9]+", "-", s)
    return s.strip("-")


def _clean_title(title, author=""):
    """Remove ruido do titulo do YouTube: 'Artista - ', '(Official Video)', feat etc."""
    t = title or ""
    t = re.sub(r"\(([^)]*)\)", " ", t)
    t = re.sub(r"\[([^\]]*)\]", " ", t)
    t = re.split(r"\s+[|/]\s+", t)[0]
    low = t.lower()
    for w in ("official video", "official music video", "lyrics", "lyric video",
              "audio", "video clip", "videoclipe", "hd", "hq", "legendado", "traducao"):
        low = low.replace(w, " ")
    t = low
    a = _slug(author).replace("-", " ")
    if a and t.strip().lower().startswith(a):
        t = t[len(a):]
    if " - " in t:
        t = t.split(" - ")[-1]
    t = re.sub(r"\bfeat\b.*$", "", t)
    return t.strip(" -_")


def fetch_vagalume(artist, title):
    """Busca no Vagalume a pagina de traducao e devolve (en_lines, pt_lines)."""
    import urllib.parse
    art = (_slug(artist) or "").strip("-")
    cands = []
    ct = _clean_title(title, artist)
    if art and ct:
        cands.append((art, _slug(ct)))
    if art and title:
        cands.append((art, _slug(title)))
    seen = set()
    for a, s in cands:
        if not a or not s or (a, s) in seen:
            continue
        seen.add((a, s))
        url = "https://www.vagalume.com.br/%s/%s-traducao.html" % (a, s)
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"})
            with urllib.request.urlopen(req, timeout=20) as r:
                html = r.read().decode("utf-8", "replace")
        except Exception:
            continue
        if "Ops... 404" in html[:2000]:
            continue
        items = []
        for m in re.finditer(r'<div class="(orig|trad)([^"]*?)"\s*><p>(.*?)</div>', html, re.S):
            kind = m.group(1)
            cls = m.group(2)
            txt = re.sub(r"<[^>]+>", "", m.group(3)).strip()
            ln = re.search(r"line(\d+)", cls)
            items.append((int(ln.group(1)) if ln else -1, kind, txt))
        items.sort(key=lambda x: x[0])
        en = [t for _, k, t in items if k == "orig" and t]
        pt = [t for _, k, t in items if k == "trad" and t]
        # remove a 1a linha (nome da musica) quando aparece dos dois lados
        if en and pt and _token_overlap(en[0], pt[0]) < 0.34 and len(en) > 3:
            en = en[1:]
            pt = pt[1:]
        if len(en) >= 5:
            return en, pt
    return [], []


def align_text_to_track(display, track):
    """Casa linhas limpas (Vagalume) com a grade de tempo das legendas do video.
    Retorna (lista_de_inicios, taxa_de_acerto)."""
    n = len(track)
    m = len(display)
    if not track or not display:
        return [], 0.0
    starts = [None] * m
    j = 0
    matched = 0
    for i in range(m):
        words = re.findall(r"[a-z']+", display[i].lower())
        if len(words) < 3:
            continue
        best = -1
        best_s = 0.0
        for k in range(j, min(n, j + 7)):
            s = _token_overlap(display[i], track[k]["text"])
            if s > best_s:
                best_s = s
                best = k
        if best >= 0 and best_s >= 0.34:
            starts[i] = track[best]["start"]
            j = best + 1
            matched += 1
    known = [i for i, x in enumerate(starts) if x is not None]
    if not known:
        base = track[0]["start"]
        return [round(base + i * 3.0, 2) for i in range(m)], 0.0
    # preenche lacunas por interpolacao
    first = known[0]
    for i in range(first):
        starts[i] = max(0.0, starts[first] - (first - i) * 2.6)
    for a, b in zip(known, known[1:]):
        if b - a == 1:
            continue
        step = (starts[b] - starts[a]) / (b - a)
        for i in range(a + 1, b):
            starts[i] = starts[a] + step * (i - a)
    last = known[-1]
    for i in range(last + 1, m):
        starts[i] = starts[last] + (i - last) * 2.6
    starts = [round(max(0.0, x), 2) for x in starts]
    return starts, matched / float(m)


def search_candidates(query):
    """Busca no YouTube pelo nome da musica e lista candidatos (id/titulo/autor/thumb)."""
    import yt_dlp
    opts = {
        "quiet": True,
        "no_warnings": True,
        "skip_download": True,
        "noplaylist": True,
        "extract_flat": True,
    }
    with yt_dlp.YoutubeDL(opts) as ydl:
        info = ydl.extract_info("ytsearch5:" + query, download=False)
    out = []
    for e in (info.get("entries") or []):
        if not e or not e.get("id"):
            continue
        try:
            thumb = (e.get("thumbnails") or [{}])[0].get("url", "")
        except Exception:
            thumb = ""
        if not thumb:
            thumb = "https://i.ytimg.com/vi/" + e["id"] + "/hqdefault.jpg"
        out.append({
            "id": e["id"],
            "title": e.get("title") or "",
            "author": e.get("channel") or e.get("uploader") or "",
            "thumb": thumb,
        })
    return out


def download_media(video_id):
    """Baixa a musica do video (mp4 se possivel, senao so o audio) numa pasta temporaria.
    Ja existindo do mesmo video, reutiliza. Qualquer outro arquivo antigo e apagado."""
    global CURRENT_MEDIA
    if CURRENT_MEDIA.get("video_id") == video_id and CURRENT_MEDIA.get("file"):
        fname = CURRENT_MEDIA["file"]
        full = os.path.join(MEDIA_DIR, fname)
        if os.path.isfile(full):
            ext = os.path.splitext(fname)[1].lower()
            kind = "video" if ext in (".mp4", ".webm") else "audio"
            return fname, ext, kind, float(CURRENT_MEDIA.get("duration") or 0)

    cleanup_media()
    os.makedirs(MEDIA_DIR, exist_ok=True)
    import yt_dlp
    outtmpl = os.path.join(MEDIA_DIR, video_id + ".%(ext)s")
    opts = {
        "quiet": True,
        "no_warnings": True,
        "noplaylist": True,
        "outtmpl": outtmpl,
        "format": (
            "best[ext=mp4]/bestaudio[ext=m4a]/bestaudio/best" if ON_RENDER else
            "bestvideo[ext=mp4][vcodec^=avc][height<=480]+bestaudio[ext=m4a]/"
            "bestvideo[ext=mp4][height<=480]+bestaudio[ext=m4a]/"
            "best[ext=mp4]/best[ext=m4a]/bestaudio/best"),
        "extractor_args": {"youtube": {"player_client": ["android", "ios", "web"]}},
        "retries": 3,
        "socket_timeout": 20,
    }
    duration = 0.0
    with yt_dlp.YoutubeDL(opts) as ydl:
        info = ydl.extract_info(video_id, download=True)
        try:
            duration = float((info or {}).get("duration") or 0)
        except Exception:
            duration = 0.0

    files = [f for f in os.listdir(MEDIA_DIR) if f.startswith(video_id + ".")]
    if not files:
        raise ValueError("Nao consegui baixar a musica desse video.")
    fname = files[0]
    ext = os.path.splitext(fname)[1].lower()
    kind = "video" if ext in (".mp4", ".webm") else "audio"
    CURRENT_MEDIA = {"video_id": video_id, "file": fname, "duration": duration}
    return fname, ext, kind, duration


def cleanup_media():
    """Apaga os arquivos temporarios de musica (depois de usar)."""
    global CURRENT_MEDIA
    if os.path.isdir(MEDIA_DIR):
        for f in os.listdir(MEDIA_DIR):
            try:
                os.remove(os.path.join(MEDIA_DIR, f))
            except OSError:
                pass
    CURRENT_MEDIA = {"video_id": None, "file": None}


def translate_lines(lines):
    """Traduz linhas en->pt de uma vez (lote). Backend principal: Google Translate via
    PowerShell (Invoke-RestMethod, funciona sem chave); fallback por linha: MyMemory
    (com email). Cache em memoria + disco. Nunca quebra o numero de linhas."""
    import hashlib
    import json as _json
    import time
    import urllib.parse

    if not lines:
        return []
    key = hashlib.md5(("|".join(lines) + "|pt").encode("utf-8")).hexdigest()
    if key in TRANSLATE_CACHE:
        return TRANSLATE_CACHE[key]

    def gtx_ps_chunk(chunk_lines):
        """Traduz um lote de linhas (unidas por \n) numa unica chamada ao google via PS."""
        import base64
        import subprocess
        text = "\n".join(chunk_lines)
        q = "'" + text.replace("'", "''") + "'"
        ps_cmd = (
            "$ErrorActionPreference='Stop'; "
            "$ProgressPreference='SilentlyContinue'; "
            "[Console]::OutputEncoding=[System.Text.Encoding]::UTF8; "
            "$q=[uri]::EscapeDataString(" + q + "); "
            "$r=Invoke-RestMethod -Uri ('https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=pt&dt=t&q='+$q) -TimeoutSec 12; "
            "$s=$r[0]; [Console]::Write((($s | ForEach-Object { $_[0] }) -join ''))"
        )
        enc = base64.b64encode(ps_cmd.encode("utf-16-le")).decode("ascii")
        out = subprocess.run(["powershell", "-NoProfile", "-NonInteractive", "-EncodedCommand", enc],
                             capture_output=True, timeout=25)
        if out.returncode != 0:
            raise RuntimeError(out.stderr.decode("utf-8", "replace")[:120])
        got = out.stdout.decode("utf-8", "replace").split("\n")
        got = [t.strip() for t in got if t.strip()]
        want = len(chunk_lines)
        if len(got) > want:
            fixed = got[:want]
            for extra in got[want:]:
                fixed[-1] = (fixed[-1] + " " + extra).strip()
            got = fixed
        if len(got) < want:
            raise RuntimeError("resposta incompleta: %d/%d" % (len(got), want))
        return got

    def my_one(text, attempt=0):
        if not text.strip():
            return text
        if len(text) > 450:
            return text
        url = ("https://api.mymemory.translated.net/get?q=" +
               urllib.parse.quote(text) +
               "&langpair=en%7Cpt-BR&de=aprenda.ingles@example.com")
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
        try:
            with urllib.request.urlopen(req, timeout=8) as r:
                d = _json.loads(r.read().decode("utf-8", "replace"))
            if d.get("responseStatus") != 200:
                raise ValueError("MyMemory status " + str(d.get("responseStatus")))
            t = d.get("responseData", {}).get("translatedText", "").strip()
            return t or text
        except Exception as e:
            raise

    out = lines[:]
    from concurrent.futures import ThreadPoolExecutor

    n = len(lines)
    chunks = [(i, lines[i:i + 30]) for i in range(0, n, 30)]

    def do_chunk(job):
        i, chunk = job
        try:
            got = gtx_ps_chunk(chunk)
            return i, got
        except Exception:
            return i, None

    with ThreadPoolExecutor(max_workers=3) as ex:
        results = list(ex.map(do_chunk, chunks))

    dead = 0
    for i, got in results:
        chunk = lines[i:i + 30]
        if got is None:
            for j, ln in enumerate(chunk):
                if not ln.strip() or dead >= 5:
                    continue
                try:
                    out[i + j] = my_one(ln)
                    dead = 0
                except Exception:
                    dead += 1
        else:
            out[i:i + len(got)] = got

    TRANSLATE_CACHE[key] = out
    try:
        _save_cache()
    except Exception:
        pass
    return out


def _load_cache():
    import json as _json
    try:
        with open(CACHE_PATH, "r", encoding="utf-8") as f:
            data = _json.load(f)
        return data if isinstance(data, dict) else {}
    except Exception:
        return {}


def _save_cache():
    import json as _json
    try:
        os.makedirs(os.path.dirname(CACHE_PATH), exist_ok=True)
        with open(CACHE_PATH, "w", encoding="utf-8") as f:
            _json.dump(TRANSLATE_CACHE, f, ensure_ascii=False)
    except Exception:
        pass


def video_id_from(url):
    m = VIDEO_ID_RE.search(url or "")
    return m.group(1) if m else None


def _parse_json3(text):
    """Legenda no formato JSON3 do YouTube."""
    out = []
    for e in (json.loads(text).get("events") or []):
        raw = "".join((s or {}).get("utf8", "") for s in (e.get("segs") or []))
        raw = raw.replace("\n", " ").strip()
        if not raw:
            continue
        start = float(e.get("tStartMs", 0)) / 1000.0
        dur = float(e.get("dDurationMs", 0)) / 1000.0
        out.append({"start": round(start, 2), "dur": round(max(0.4, dur), 2), "text": raw})
    return out


def _parse_srv3(text):
    """Legenda no formato XML (srv3) do YouTube."""
    out = []
    for m in re.finditer(r"<p\b([^>]*)>(.*?)</p>", text, re.S):
        attrs, inner = m.group(1), m.group(2)
        tm = re.search(r'\bt="(\d+)"', attrs)
        dm = re.search(r'\bd="(\d+)"', attrs)
        start = float(tm.group(1)) / 1000.0 if tm else 0.0
        dur = float(dm.group(1)) / 1000.0 if dm else 2.0
        txt = html.unescape(re.sub(r"<[^>]+>", "", inner)).replace("\n", " ").strip()
        if txt:
            out.append({"start": round(start, 2), "dur": round(max(0.4, dur), 2), "text": txt})
    return out


def _parse_vtt(text):
    """Legenda no formato WebVTT."""
    def secs(t):
        t = t.replace(",", ".")
        parts = t.split(":")
        if len(parts) == 3:
            h, m, s = parts
            return int(h) * 3600 + int(m) * 60 + float(s)
        if len(parts) == 2:
            m, s = parts
            return int(m) * 60 + float(s)
        return float(parts[0])

    out, cur = [], None
    for ln in text.replace("\r", "").split("\n"):
        if "-->" in ln:
            if cur and cur["text"]:
                out.append(cur)
            a, b = (ln.split("-->") + ["", ""])[:2]
            try:
                s = secs(a.strip().split(" ")[0])
                e = secs(b.strip().split(" ")[0])
            except Exception:
                s, e = 0.0, 2.0
            cur = {"start": round(s, 2), "dur": round(max(0.4, e - s), 2), "text": ""}
        elif cur is not None:
            t = html.unescape(re.sub(r"<[^>]+>", "", ln)).strip()
            if t and not t.startswith(("WEBVTT", "NOTE", "Kind:", "Language:")):
                cur["text"] = (cur["text"] + " " + t).strip()
    if cur and cur["text"]:
        out.append(cur)
    return out


def _caption_tracks(video_id):
    """Lista as faixas de legenda (lingua, formato, url) usando o yt-dlp."""
    import yt_dlp
    opts = {
        "quiet": True,
        "no_warnings": True,
        "skip_download": True,
        "extractor_args": {"youtube": {"player_client": ["android", "ios", "web"]}},
    }
    with yt_dlp.YoutubeDL(opts) as ydl:
        info = ydl.extract_info("https://www.youtube.com/watch?v=" + video_id, download=False)
    out = []
    for src in ("subtitles", "automatic_captions"):
        for lc, arr in (info.get(src) or {}).items():
            for t in (arr or []):
                if t.get("url"):
                    out.append((lc, (t.get("ext") or "").lower(), t["url"]))
    return out


def _captions_via_ytdlp(video_id, want):
    """Legenda via yt-dlp (mesmo caminho que baixa o video). Retorna (lang, data) ou None."""
    tracks = _caption_tracks(video_id)
    if not tracks:
        return None
    chosen = None
    for l in want:
        for ext in ("json3", "vtt", "srv3", ""):
            for lc, tx, url in tracks:
                low = lc.lower()
                if low != l.lower() and not low.startswith(l.lower() + "-"):
                    continue
                if ext and tx != ext:
                    continue
                chosen = (lc, tx, url)
                break
            if chosen:
                break
        if chosen:
            break
    if not chosen:
        chosen = tracks[0]
    lc, ext, url = chosen
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=25) as r:
        raw = r.read().decode("utf-8", "replace")
    head = raw.lstrip()[:1]
    if ext == "json3" or head == "{":
        data = _parse_json3(raw)
    elif ext == "srv3" or head == "<":
        data = _parse_srv3(raw)
    else:
        data = _parse_vtt(raw)
    data = [d for d in data if d["text"].strip()]
    return (lc, data) if data else None


def _captions_via_api(video_id, lang):
    """Ultimo recurso: lib youtube_transcript_api (pode tomar IP-ban)."""
    from youtube_transcript_api import NoTranscriptFound, TranscriptsDisabled
    from youtube_transcript_api import VideoUnavailable, YouTubeTranscriptApi
    api = YouTubeTranscriptApi()
    try:
        t = api.fetch(video_id, languages=(lang,))
    except NoTranscriptFound:
        for other in LANG_WHITELIST:
            if other == lang:
                continue
            try:
                t = api.fetch(video_id, languages=(other,))
                lang = other
                break
            except (NoTranscriptFound, TranscriptsDisabled, VideoUnavailable):
                continue
        else:
            return None
    except (TranscriptsDisabled, VideoUnavailable):
        return None
    rows = t.to_raw_data()
    data = [{"start": float(r.get("start", 0)), "dur": float(r.get("duration", 0)), "text": r.get("text", "")} for r in rows]
    data = [d for d in data if d["text"].strip()]
    return (lang, data) if data else None


def fetch_captions(video_id, lang):
    global CAPTION_CACHE
    key = video_id + "|" + lang
    if key in CAPTION_CACHE:
        return CAPTION_CACHE[key]

    want = [lang] + [l for l in LANG_WHITELIST if l != lang]

    result = None
    try:
        result = _captions_via_ytdlp(video_id, want)
    except Exception:
        result = None

    if not result:
        try:
            result = _captions_via_api(video_id, lang)
        except Exception:
            result = None

    if not result:
        raise ValueError("Este video nao tem legenda utilizavel (ou o YouTube bloqueou temporariamente o seu IP).")

    used, data = result
    CAPTION_CACHE[key] = (used, data)
    return CAPTION_CACHE[key]


def oembed_info(url):
    api = "https://www.youtube.com/oembed?url=" + urllib.parse.quote(url, safe="") + "&format=json"
    with urllib.request.urlopen(api, timeout=12) as r:
        return json.loads(r.read().decode("utf-8"))


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *args):
        pass

    def _cors(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "*")

    def _read_body(self):
        length = int(self.headers.get("Content-Length", 0))
        raw = self.rfile.read(length).decode("utf-8") or "{}"
        try:
            return json.loads(raw)
        except ValueError:
            raise ValueError("corpo invalido")

    def _json(self, obj, code=200):
        body = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self._cors()
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self.send_response(204)
        self._cors()
        self.end_headers()

    def do_POST(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path
        if path == "/api/translate":
            try:
                body = self._read_body()
                lines = body.get("lines") or []
                lines = [str(x) for x in lines if str(x).strip()]
                if not lines:
                    self._json({"ok": True, "transl": []})
                    return
                transl = translate_lines(lines)
                self._json({"ok": True, "transl": transl})
            except ValueError as e:
                self._json({"ok": False, "error": "corpo invalido: " + str(e)})
            except Exception as e:
                self._json({"ok": False, "error": "falha na traducao: " + str(e)})
            return
        if path == "/api/ytfetch":
            try:
                body = self._read_body()
                self.handle_ytfetch(body)
            except ValueError as e:
                self._json({"ok": False, "error": str(e)})
            except Exception as e:
                self._json({"ok": False, "error": "Falha ao buscar/baixar: " + str(e)})
            return
        if path == "/api/cleanup":
            cleanup_media()
            self._json({"ok": True})
            return
        self._json({"ok": False, "error": "nao encontrado"}, 404)

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path
        qs = urllib.parse.parse_qs(parsed.query)

        # ---------- API ----------
        if path == "/api/video":
            self.handle_video(qs)
            return
        if path == "/api/captions":
            self.handle_captions(qs)
            return

        # ---------- musica temporaria baixada ----------
        if path.startswith("/media/"):
            self.handle_media(path)
            return

        # ---------- estatico ----------
        if path in ("/", "/index.html"):
            path = "/index.html"
        if not path.startswith("/") or ".." in path:
            self._json({"ok": False, "error": "caminho invalido"}, 400)
            return
        rel = path.lstrip("/")
        full = os.path.normpath(os.path.join(ROOT, rel))
        if not full.startswith(os.path.normpath(ROOT)):
            self._json({"ok": False, "error": "fora do root"}, 400)
            return
        ext = os.path.splitext(full)[1].lower()
        if not os.path.isfile(full):
            self._json({"ok": False, "error": "nao encontrado"}, 404)
            return
        with open(full, "rb") as f:
            body = f.read()
        self.send_response(200)
        self.send_header("Content-Type", MIME.get(ext, "application/octet-stream"))
        if ext in (".html", ".css", ".js", ".json", ".png", ".jpg", ".jpeg", ".ico", ".svg"):
            self.send_header("Cache-Control", "no-store")
        self._cors()
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def handle_media(self, path):
        name = os.path.basename(path.replace("\\", "/"))
        if not name or ".." in name:
            self._json({"ok": False, "error": "nome invalido"}, 400)
            return
        full = os.path.join(MEDIA_DIR, name)
        if not os.path.isfile(full):
            self._json({"ok": False, "error": "nao encontrado"}, 404)
            return
        size = os.path.getsize(full)
        ext = os.path.splitext(full)[1].lower()
        if ext in (".m4a", ".webm"):
            ctype = MIME.get(ext, "application/octet-stream")
        else:
            ctype = "video/mp4" if ext == ".mp4" else "application/octet-stream"

        m = re.match(r"bytes=(\d*)-(\d*)", self.headers.get("Range", ""))
        if m and (m.group(1) or m.group(2)):
            start = int(m.group(1)) if m.group(1) else 0
            end = int(m.group(2)) if m.group(2) else size - 1
            start = max(0, min(start, size - 1))
            end = max(start, min(end, size - 1))
            length = end - start + 1
            self.send_response(206)
            self.send_header("Content-Range", "bytes %d-%d/%d" % (start, end, size))
        else:
            start, end, length = 0, size - 1, size
            self.send_response(200)
        self.send_header("Accept-Ranges", "bytes")
        self.send_header("Content-Type", ctype)
        self._cors()
        self.send_header("Content-Length", str(length))
        self.end_headers()
        with open(full, "rb") as f:
            f.seek(start)
            remain = length
            while remain > 0:
                chunk = f.read(min(65536, remain))
                if not chunk:
                    break
                self.wfile.write(chunk)
                remain -= len(chunk)

    def handle_ytfetch(self, body):
        query = str(body.get("query") or "").strip()
        if not query:
            raise ValueError("Digite o nome da musica ou cole um link do YouTube.")

        title = author = thumb = ""
        vid = video_id_from(query)
        if not vid:
            entries = search_candidates(query)
            if not entries:
                raise ValueError("Nao achei nenhum video para essa busca.")
            e = entries[0]
            vid = e["id"]
            title = e["title"]
            author = e["author"]
            thumb = e["thumb"]

        fname, ext, kind, total = download_media(vid)

        # Legenda do YouTube: melhor esforco, UMA tentativa so
        # (varrer candidatos estourava o limite do YouTube -> HTTP 429)
        merged = []
        used_lang = "en"
        try:
            used_lang, rows = fetch_captions(vid, "en")
            merged = merge_lines(rows)
        except Exception:
            merged = []

        if not title:
            try:
                info = oembed_info("https://www.youtube.com/watch?v=" + vid)
                title = info.get("title", "")
                author = info.get("author_name", "")
                thumb = info.get("thumbnail_url", "")
            except Exception:
                pass

        source = "yt"
        transl_out = None

        # 1) Vagalume: letra limpa + traducao humana (NAO depende de legenda)
        try:
            vag_en, vag_pt = fetch_vagalume(author, title)
            if len(vag_en) >= 5 and _english_ratio(vag_en) >= 0.12:
                starts = None
                step = 3.0
                if merged:
                    st, ratio = align_text_to_track(vag_en, merged)
                    if len(st) == len(vag_en) and ratio >= 0.4:
                        starts = st
                if not starts:
                    t0 = merged[0]["start"] if merged else 0.0
                    if merged:
                        tF = merged[-1]["start"] + merged[-1]["dur"]
                    else:
                        tF = max(float(total or 0), len(vag_en) * 3.0)
                    span = max(1.0, tF - t0)
                    step = span / len(vag_en)
                    starts = [round(t0 + i * step, 2) for i in range(len(vag_en))]
                lines = []
                for k, txt in enumerate(vag_en):
                    start = starts[k]
                    nxt = starts[k + 1] if k + 1 < len(starts) else start + step
                    lines.append({"start": start, "dur": round(max(0.4, nxt - start), 2), "text": txt})
                merged = lines
                source = "vagalume"
                if len(vag_pt) == len(vag_en):
                    transl_out = vag_pt
        except Exception:
            pass

        # 2) LRCLIB (letra sincronizada) quando nao veio do Vagalume
        if source == "yt":
            try:
                lrc = fetch_lrclib(query or title, title, author)
                if len(lrc) >= 5 and _english_ratio([x["text"] for x in lrc]) >= 0.12:
                    lrc.sort(key=lambda x: x["t"])
                    off = 0.0
                    if merged:
                        o = best_lrc_offset(merged, lrc)
                        if o is not None:
                            off = o
                    lines = []
                    for k, ln in enumerate(lrc):
                        start = round(ln["t"] + off, 2)
                        nxt = (lrc[k + 1]["t"] + off) if k + 1 < len(lrc) else start + 4.0
                        lines.append({"start": start, "dur": round(max(0.4, nxt - start), 2), "text": ln["text"]})
                    merged = lines
                    source = "lrc"
            except Exception:
                pass

        if not merged:
            cleanup_media()
            raise ValueError(
                "Nao consegui a letra desta musica. O YouTube bloqueou as legendas (tente de novo em alguns minutos) "
                "e nao encontrei letra no Vagalume/LRCLIB para ela. Tente outra versao da musica.")

        # 3) Sem traducao humana (LRCLIB/legenda): traduz automaticamente en->pt
        if transl_out is None:
            try:
                orig = [ln["text"] for ln in merged]
                translated = translate_lines(orig)
                if len(translated) == len(orig):
                    diff = sum(1 for a, b in zip(translated, orig) if a.strip() and a.strip() != b.strip())
                    if diff >= max(1, len(orig) // 4):
                        transl_out = translated
            except Exception:
                transl_out = None

        self._json({
            "ok": True,
            "video_id": vid,
            "title": title,
            "author": author,
            "thumbnail": thumb,
            "file": "/media/" + fname,
            "kind": kind,
            "lang": used_lang,
            "source": source,
            "lines": merged,
            "transl": transl_out,
        })

    def handle_video(self, qs):
        url = (qs.get("url") or [""])[0]
        try:
            info = oembed_info(url)
            vid = video_id_from(url)
            self._json({
                "ok": True,
                "video_id": vid or (info.get("video_id") or ""),
                "title": info.get("title", ""),
                "author": info.get("author_name", ""),
                "thumbnail": info.get("thumbnail_url", ""),
            })
        except Exception as e:
            self._json({"ok": False, "error": str(e)})

    def handle_captions(self, qs):
        video_id = (qs.get("video_id") or [""])[0]
        lang = (qs.get("lang") or ["en"])[0]
        if lang not in LANG_WHITELIST:
            lang = "en"
        if not video_id or not re.fullmatch(r"[\w-]{11}", video_id):
            self._json({"ok": False, "error": "video_id invalido"})
            return
        try:
            used_lang, lines = fetch_captions(video_id, lang)
            self._json({"ok": True, "lang": used_lang, "lines": lines})
        except ValueError as e:
            self._json({"ok": False, "error": str(e)})
        except Exception as e:
            self._json({"ok": False, "error": "Falha ao buscar legenda: " + str(e)})


def main():
    import threading
    if ON_RENDER:
        from http.server import BaseHTTPRequestHandler as _B
        _B.log_message = lambda *a: None
    else:
        import webbrowser

    cleanup_media()
    no_open = "--no-open" in sys.argv or ON_RENDER
    try:
        srv = ThreadingHTTPServer((HOST, PORT), Handler)
    except OSError:
        url = "http://127.0.0.1:{}".format(PORT)
        print("Ja existe uma instancia do app rodando na porta " + str(PORT) + ".")
        if not no_open:
            threading.Timer(0.6, lambda: webbrowser.open(url)).start()
        return

    url = "http://{}:{}".format(HOST, PORT)
    print("App Start Ingles rodando em " + url)
    if not no_open:
        threading.Timer(0.6, lambda: webbrowser.open(url)).start()
    srv.serve_forever()


if __name__ == "__main__":
    main()
/* ============ utilidades ============ */
function $(s) { return document.querySelector(s); }
function $$(s) { return document.querySelectorAll(s); }

function norm(w) {
  return String(w).toLowerCase().replace(/[^a-z0-9']/g, '');
}

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function view(name) {
  $$('.view').forEach(v => v.classList.add('hidden'));
  $('#view-' + name).classList.remove('hidden');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function goHome() {
  stopEverything();
  renderStats();
  view('home');
}

function openModal(title, html) {
  $('#modal-title').textContent = title;
  $('#modal-body').innerHTML = html;
  $('#modal').classList.remove('hidden');
}

function closeModal() { $('#modal').classList.add('hidden'); }

/* ============ voz (speech) ============ */
let voices = [];
function loadVoices() {
  if (window.speechSynthesis) voices = speechSynthesis.getVoices();
}
if (window.speechSynthesis) {
  loadVoices();
  speechSynthesis.onvoiceschanged = loadVoices;
}

function speakEn(text, rate, onend) {
  if (!window.speechSynthesis) return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'en-US';
  u.rate = rate || 0.85;
  const en = voices.find(v => v.lang && v.lang.toLowerCase().startsWith('en'));
  if (en) u.voice = en;
  if (onend) u.onend = onend;
  speechSynthesis.speak(u);
}

/* fala linhas em sequênca; chama fnLine(i) antes de cada linha */
function speakChain(texts, fnLine, onDone) {
  if (!window.speechSynthesis) return;
  speechSynthesis.cancel();
  let i = 0;
  function next() {
    if (i >= texts.length) {
      if (fnLine) fnLine(-1);
      if (onDone) onDone();
      return;
    }
    if (fnLine) fnLine(i);
    const u = new SpeechSynthesisUtterance(texts[i]);
    u.lang = 'en-US';
    u.rate = 0.85;
    const en = voices.find(v => v.lang && v.lang.toLowerCase().startsWith('en'));
    if (en) u.voice = en;
    u.onend = () => { i++; next(); };
    speechSynthesis.speak(u);
  }
  next();
}

function speakWord(el) {
  if (!el) return;
  const w = el.textContent;
  speakEn(w, 0.8);
  el.classList.add('speaking');
  setTimeout(() => el.classList.remove('speaking'), 1200);
}

/* ============ audio de arquivo ============ */
let audioEl = null;
function stopAudio() { if (audioEl) { audioEl.pause(); audioEl = null; } }

/* ============ YouTube ============ */
const BEGINNER_QUICK = [
  'Let It Go Frozen',
  'Hakuna Matata The Lion King',
  'A Whole New World Aladdin',
  'You\'re Welcome Moana',
  'Twinkle Twinkle Little Star',
  'Old MacDonald Had a Farm',
  'Baby Shark',
  'Head Shoulders Knees and Toes',
  'The Wheels on the Bus'
];

function renderBeginnerQuick() {
  const c = $('#beginner-quick');
  if (!c) return;
  c.innerHTML = '';
  BEGINNER_QUICK.forEach(qqq => {
    const b = document.createElement('button');
    b.className = 'btn ghost btn-tiny';
    b.textContent = qqq;
    b.onclick = () => ytQuick(qqq);
    c.appendChild(b);
  });
}

function ytQuick(query) {
  const inp = $('#yt-url-home');
  if (inp) inp.value = query;
  ytLoadFromInput('yt-url-home');
}

let ytSong = null;
let ytPlayer = null;
let ytPlayerVideo = null;
let ytPoll = null;
let ytApiLoading = false;

function stopEverything() {
  if (window.speechSynthesis) speechSynthesis.cancel();
  stopAudio();
  escStop();
  escStopReveal();
  window.clearInterval(memTimer);
  stopYtPoll();
  if (ytPlayer && ytPlayer.pauseVideo) { try { ytPlayer.pauseVideo(); } catch (e) {} }
}

function extractVideoId(url) {
  const m = String(url || '').match(
    /(?:youtube\.com\/(?:watch\?[^#]*v=|embed\/|shorts\/|live\/)|youtu\.be\/)([\w-]{11})/
  );
  return m ? m[1] : null;
}

function mergeLines(rows) {
  const out = [];
  let cur = null;
  rows.forEach(r => {
    const txt = String(r.text || '').trim();
    if (!txt) return;
    if (!cur) { cur = { start: r.start, dur: r.dur, text: txt }; return; }
    const joined = cur.text + ' ' + txt;
    const words = joined.split(/\s+/).length;
    const gap = r.start - (cur.start + cur.dur);
    if (words <= 10 && gap < 1.2) {
      cur.text = joined;
      cur.dur = (r.start + (r.dur || 0)) - cur.start;
    } else {
      out.push(cur);
      cur = { start: r.start, dur: r.dur, text: txt };
    }
  });
  if (cur) out.push(cur);
  return out;
}

function setYtStatus(sel, msg, cls) {
  const el = $(sel);
  if (!el) return;
  el.textContent = msg;
  el.className = 'yt-status ' + (cls || '');
}

function resolveSong(id) {
  if (!id) return null;
  if (ytSong && id === ytSong.id) return ytSong;
  return SONGS.find(s => s.id === id);
}

function whenYT(cb) {
  if (window.YT && window.YT.Player) { cb(); return; }
  if (!ytApiLoading) {
    ytApiLoading = true;
    const s = document.createElement('script');
    s.src = 'https://www.youtube.com/iframe_api';
    document.head.appendChild(s);
  }
  const t = setInterval(() => {
    if (window.YT && window.YT.Player) { clearInterval(t); cb(); }
  }, 250);
}

function ytTearDown() {
  stopYtPoll();
  if (ytPlayer) { try { ytPlayer.pauseVideo(); } catch (e) {} }
  if (mediaEl) { try { mediaEl.pause(); } catch (e) {} }
  const root = $('#yt-root');
  if (root) root.classList.add('hidden');
}

let ytPending = null;
let ytRetried = false;
let ytBlockedVid = '';
let mediaEl = null;

window.addEventListener('beforeunload', () => {
  try { fetch(API_BASE + '/api/cleanup', { method: 'POST' }).catch(() => {}); } catch (e) {}
});

function currentPlayTime() {
  if (mediaEl && mediaEl.currentTime != null) return mediaEl.currentTime;
  if (ytPlayer && ytPlayer.getCurrentTime) { try { return ytPlayer.getCurrentTime(); } catch (e) {} }
  return 0;
}

function playingState() {
  if (mediaEl) return mediaEl.paused ? 2 : 1;
  if (ytPlayer && ytPlayer.getPlayerState) { try { return ytPlayer.getPlayerState(); } catch (e) {} }
  return 5;
}

function ensureMediaPlayer(song) {
  const root = $('#yt-root');
  if (!root) return;
  root.classList.remove('hidden');
  if (ytPlayer) { try { ytPlayer.destroy(); } catch (e) {} ytPlayer = null; }
  ytPlayerVideo = null;
  const vid = (song.yt || {}).videoId || '';
  if (mediaEl && mediaEl.dataset.video === vid) {
    try { mediaEl.play().catch(() => {}); } catch (e) {}
    return;
  }
  const holder = $('#yt-player-root');
  holder.innerHTML = '';
  const el = document.createElement(song.mediaKind === 'audio' ? 'audio' : 'video');
  el.controls = true;
  el.preload = 'auto';
  el.classList.add('media-player');
  if (song.mediaKind !== 'audio' && song.thumbnail) el.poster = song.thumbnail;
  el.src = song.media;
  el.dataset.video = vid;
  holder.appendChild(el);
  mediaEl = el;
  try { mediaEl.play().catch(() => {}); } catch (e) {}
}

function ensureYtPlayer(videoId) {
  const root = $('#yt-root');
  if (!root) return;
  root.classList.remove('hidden');
  whenYT(() => {
    if (!window.YT || !window.YT.Player) return;
    if (ytPlayer && ytPlayerVideo === videoId) return;
    if (ytRetried) {
      ytRetried = false;
      try { if (ytPlayer) ytPlayer.destroy(); } catch (e) {}
      ytPlayer = null;
      ytPlayerVideo = null;
    }
    if (ytPlayer) {
      ytPending = videoId;
      try { ytPlayer.loadVideoById(videoId); ytPlayerVideo = videoId; } catch (e) {}
      return;
    }
    ytPlayer = new window.YT.Player('yt-player-root', {
      videoId: videoId,
      playerVars: { enablejsapi: 1, rel: 0, playsinline: 1 },
      events: {
        onReady: e => {
          if (ytPending) {
            try { e.target.loadVideoById(ytPending); } catch (err) {}
            ytPending = null;
          }
        },
        onError: ev => {
          if (ev.data === 101 || ev.data === 150) {
            const vid = ytBlockedVid || ((ytSong && ytSong.yt) ? ytSong.yt.videoId : '');
            if (!ytRetried) {
              ytRetried = true;
              try { if (ytPlayer) ytPlayer.destroy(); } catch (e) {}
              ytPlayer = null;
              ytPlayerVideo = null;
              setTimeout(() => ensureYtPlayer(vid), 1500);
              return;
            }
            ytRetried = false;
            openModal('Este vídeo não toca aqui',
              '<p>Algumas músicas de gravadoras grandes bloqueiam o player dentro de outros sites.</p>' +
              '<p>Sua letra continua na tela — você pode abrir o vídeo no YouTube para tocar:</p>' +
              '<p><a class="btn primary" style="display:inline-block;text-decoration:none;margin:6px 0" href="https://www.youtube.com/watch?v=' + vid + '" target="_blank">Abrir no YouTube</a></p>' +
              '<p class="hint-word">Dica: procure outra versão da mesma música (lyric videos costumam funcionar no app).</p>');
          }
        }
      }
    });
    ytPlayerVideo = videoId;
  });
}

function playYt(fromStart) {
  if (mediaEl) {
    if (fromStart) { try { mediaEl.currentTime = 0; } catch (e) {} }
    mediaEl.play().catch(() => {});
    return;
  }
  if (!ytPlayer || !ytPlayer.playVideo) return;
  if (fromStart && ytPlayer.seekTo) { try { ytPlayer.seekTo(0, true); } catch (e) {} }
  ytPlayer.playVideo();
}

function pauseYt() {
  if (mediaEl) { try { mediaEl.pause(); } catch (e) {} return; }
  if (ytPlayer && ytPlayer.pauseVideo) { try { ytPlayer.pauseVideo(); } catch (e) {} }
}

let ytCurLine = -1;
let ytOffset = 0;

function adjSync(d) {
  ytOffset = Math.round((ytOffset + d) * 100) / 100;
  const v = $('#sync-val');
  if (v) v.textContent = (ytOffset > 0 ? '+' : '') + ytOffset.toFixed(1) + 's';
  if (ytSong && ytSong.yt && localStorage) {
    try { localStorage.setItem('syncoff_' + ytSong.yt.videoId, String(ytOffset)); } catch (e) {}
  }
}

function setSyncoffFor(song) {
  ytOffset = 0;
  const vid = (song && song.yt) ? song.yt.videoId : '';
  if (vid && localStorage) {
    try { ytOffset = parseFloat(localStorage.getItem('syncoff_' + vid)) || 0; } catch (e) { ytOffset = 0; }
  }
  const v = $('#sync-val');
  if (v) v.textContent = (ytOffset > 0 ? '+' : '') + ytOffset.toFixed(1) + 's';
}

function startYtPoll(lines) {
  stopYtPoll();
  ytCurLine = -1;
  ytPoll = setInterval(() => {
    try {
      const nowEl = $('#yt-now');
      const introEl = $('#yt-intro');
      const t = currentPlayTime();
      if (nowEl) nowEl.textContent = t.toFixed(1) + 's';
      const st = playingState();
      if (st !== 1 && st !== 2) { ytCurLine = -1; if (introEl) introEl.textContent = ''; return; }
      const eff = t + ytOffset;
      let a = -1;
      for (let i = lines.length - 1; i >= 0; i--) { if (eff >= lines[i].start) { a = i; break; } }
      if (introEl) {
        if (a < 0 && lines.length) {
          const f = lines[0].start - eff;
          introEl.textContent = f > 0 ? '\u00b7 primeira linha em ' + f.toFixed(1) + 's' : '\u00b7 1\u00aa linha agora';
        } else {
          introEl.textContent = '';
        }
      }
      if (a === ytCurLine) return;
      ytCurLine = a;
      $$('.lyric-line.en').forEach(l => {
        const li = parseInt(l.dataset.line, 10);
        l.classList.toggle('active', li === a);
      });
      if (a >= 0) {
        const el = document.querySelector('.lyric-line.en[data-line="' + a + '"]');
        if (el) el.scrollIntoView({ block: 'center' });
      }
    } catch (e) {}
  }, 250);
}

function stopYtPoll() { if (ytPoll) { clearInterval(ytPoll); ytPoll = null; } }

function ytLineClick(i) {
  if (!ytSong || !ytSong.ytLines) return;
  const ln = ytSong.ytLines[i];
  if (!ln) return;
  const target = Math.max(0, ln.start - ytOffset - 0.2);
  if (mediaEl) {
    try { mediaEl.currentTime = target; mediaEl.play().catch(() => {}); } catch (e) {}
    return;
  }
  if (ytPlayer) { try { ytPlayer.seekTo(target, true); ytPlayer.playVideo(); } catch (e) {} }
}

function ytLoadFromInput(inputId) {
  const input = $('#' + inputId);
  const statusSel = '#yt-status-' + (inputId === 'yt-url-learn' ? 'learn' : (inputId === 'yt-url-dict' ? 'dict' : (inputId === 'yt-url-escuta' ? 'escuta' : 'home')));
  const fromHome = inputId === 'yt-url-home';
  const q = input.value.trim();
  if (!q) { setYtStatus(statusSel, 'Digite o nome da música ou cole um link do YouTube.', 'err'); return; }
  setYtStatus(statusSel, 'Buscando "' + q.slice(0, 40) + '"... (baixa na hora; apaga depois de usar)');
  const expanded = extractVideoId(q) ? q : q;

  fetch(API_BASE + '/api/ytfetch', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: expanded })
  })
    .then(r => r.json())
    .then(res => {
      if (!res.ok) { setYtStatus(statusSel, res.error || 'Falha ao buscar a música.', 'err'); return; }
      const merged = res.lines || [];
      if (!merged.length) { setYtStatus(statusSel, 'Este vídeo não tem legenda utilizável.', 'err'); return; }
      const preTransl = (res.transl && res.transl.length === merged.length) ? res.transl : [];
      ytSong = {
        id: 'yt_' + res.video_id,
        title: res.title || 'Música do YouTube',
        artist: 'YouTube' + (res.author ? ' · ' + res.author : ''),
        level: 'YouTube',
        audio: '',
        yt: { videoId: res.video_id },
        media: API_BASE + res.file,
        mediaKind: res.kind || 'video',
        thumbnail: res.thumbnail || '',
        ytLines: merged,
        lyrics: merged.map(l => l.text),
        transl: preTransl
      };
      input.value = '';
      const notaSrc = res.source === 'vagalume' ? 'letra + tradução do Vagalume' :
        (res.source === 'lrc' ? 'letra corrigida (fonte LRCLIB)' : ('legenda ' + res.lang));
      setYtStatus(statusSel, 'Pronto! Toca agora com a letra sincronizada' + (preTransl.length ? ' e tradução PT abaixo de cada linha.' : ' (tradução PT entra sozinha abaixo de cada linha).') + ' (' + notaSrc + ')', 'good');

      const dictVisible = !$('#view-dictation').classList.contains('hidden');
      if (dictVisible) {
        dictSong = ytSong;
        renderSongPicker('#song-picker-dict', ytSong.id, id => pickDictSong(id));
        renderDictation();
      }
      currentLearn = ytSong;
      renderSongPicker('#song-picker-learn', ytSong.id, id => pickLearnSong(id));
      renderLearnSong();
      const escutaVisible = !$('#view-escuta').classList.contains('hidden');
      if (escutaVisible) { escIdx = 0; escStep = 0; escRes = null; renderEscuta(); }
      if (fromHome || $('#view-home').classList.contains('hidden') === false) view('learn');

      if (preTransl.length) return;

      fetch(API_BASE + '/api/translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lines: merged.map(l => l.text) })
      }).then(r => r.json()).then(tr => {
        if (!tr || !tr.ok || !tr.transl || tr.transl.length !== merged.length) return;
        if (ytSong) ytSong.transl = tr.transl;
        if (currentLearn && currentLearn.id === ytSong.id) currentLearn.transl = tr.transl;
        if (dictSong && dictSong.id === ytSong.id) dictSong.transl = tr.transl;
        setYtStatus(statusSel, 'Pronto! Toque no vídeo abaixo para tocar com a letra e a tradução PT sincronizada. (' + (res.source === 'lrc' ? 'letra corrigida' : 'legenda ' + res.lang) + ')', 'good');
        const learnOpen = !$('#view-learn').classList.contains('hidden');
        const dictOpen = !$('#view-dictation').classList.contains('hidden');
        if (learnOpen && currentLearn && currentLearn.id === ytSong.id) renderLearnSong();
        if (dictOpen && dictSong && dictSong.id === ytSong.id) renderDictation();
        if (!$('#view-escuta').classList.contains('hidden')) renderEscuta();
      }).catch(() => {});
    })
    .catch(err => {
      setYtStatus(statusSel,
        'Não deu para conectar: rode o app pelo atalho "Aprende Inglês" da área de trabalho (ele abre o navegador).',
        'err');
    });
}

function playSongAudio(song) {
  if (!song || !song.audio) return;
  stopAudio();
  const a = new Audio(song.audio);
  a.play().catch(() => {
    openModal('Arquivo não encontrado',
      '<p>Não achei o arquivo <b>' + song.audio + '</b>. Coloque o MP3 na pasta <b>songs</b> e confira o nome em <b>js/songs.js</b>.</p>' +
      '<p>Enquanto isso, use o botão <b>"Ler letra (voz)"</b>.</p>');
  });
  audioEl = a;
}

/* ============ seleção de música (genérica) ============ */
function renderSongPicker(containerSel, activeId, onClick) {
  const c = $(containerSel);
  c.innerHTML = '';
  SONGS.forEach(s => {
    const d = document.createElement('div');
    d.className = 'song-card' + (s.id === activeId ? ' active' : '');
    d.innerHTML = '<h4>' + s.title + '</h4><small>' + s.artist + ' · ' + s.level + '</small>' +
      (s.beginner ? ' <span class="lvl-beginner">iniciante</span>' : '');
    d.onclick = () => onClick(s.id);
    c.appendChild(d);
  });
  if (ytSong) {
    const d = document.createElement('div');
    d.className = 'song-card yt-card' + (ytSong.id === activeId ? ' active' : '');
    d.innerHTML = '<h4>' + ytSong.title + '</h4><small>YouTube · baixada na hora, som e letra sincronizados</small>';
    d.onclick = () => onClick(ytSong.id);
    c.appendChild(d);
  }
}

/* ============ MODO 1: APRENDER ============ */
let currentLearn = null;

function openLearn() {
  stopEverything();
  view('learn');
  if (!currentLearn) currentLearn = SONGS[0];
  pickLearnSong(currentLearn.id);
  renderSongPicker('#song-picker-learn', currentLearn.id, id => pickLearnSong(id));
}

function pickLearnSong(id) {
  currentLearn = resolveSong(id);
  renderSongPicker('#song-picker-learn', id, i2 => pickLearnSong(i2));
  renderLearnSong();
}

function renderLearnSong() {
  const s = currentLearn;
  if (!s) return;
  const box = $('#learn-content');
  box.classList.remove('hidden');
  stopYtPoll();

  let html = '<div class="controls">';
  if (s.yt) {
    html += '<button class="btn primary" onclick="playYt(false)">Tocar</button>';
    html += '<button class="btn ghost" onclick="pauseYt()">Pausar</button>';
    html += '<button class="btn ghost" onclick="playYt(true)">Reiniciar</button>';
    html += '<button class="btn ghost" onclick="stopEverything()">Parar</button>';
    html += '</div>';
    html += '<p class="sync-bar">' +
      'Sincronia: <button class="btn tiny" onclick="adjSync(-0.5)">\u22120,5s</button> ' +
      '<span id="sync-val" class="sync-val">0.0s</span> ' +
      '<button class="btn tiny" onclick="adjSync(0.5)">+0,5s</button> ' +
      '<button class="btn tiny" onclick="adjSync(0)">zerar</button> | ' +
      'tempo: <span id="yt-now" class="now">0.0s</span> ' +
      '<span id="yt-intro"></span></p>' +
    '<p class="sub hint-word" style="margin-bottom:12px">A linha fica destacada pelo <b>tempo da música</b>. Se a linha ativa chega <b>atrasada</b> em relação ao som, aperte <b>+</b>; se chega <b>adiantada</b>, aperte <b>\u2212</b>. O ajuste fica salvo pra essa música. Clique numa linha para pular até ela; clique numa palavra para ouvi-la.</p>';
  } else {
    if (s.audio) {
      html += '<button class="btn primary" onclick="playSongAudio(currentLearn)">Tocar música</button>';
    }
    html += '<button class="btn primary" onclick="readLearnSong()">Ler letra (voz)</button>';
    html += '<button class="btn ghost" onclick="stopEverything()">Parar</button>';
    html += '</div>';
  }

  html += '<div id="chunk-info" class="chunk-pop"></div>';
  html += '<p class="sub chunk-legend" style="margin-top:6px">Grupos em <b style="color:#4ade80">verde</b> s\u00e3o express\u00f5es prontas (chunks): clique para ver o significado do bloco inteiro, n\u00e3o palavra por palavra.</p>';
  html += '<div class="lyrics">';
  s.lyrics.forEach((line, i) => {
    html += '<div class="lyric-line en" data-line="' + i + '"' + (s.yt ? ' onclick="ytLineClick(' + i + ')"' : '') + '>';
    html += chunkSpans(line);
    html += '</div>';
    if (s.transl && s.transl[i]) {
      html += '<div class="lyric-line pt" data-transl="' + i + '">' + s.transl[i] +
        ' <button class="btn ghost tiny pd-btn" title="Salvar no meu dicionário" onclick="pdSaveFromSong(' + abQ(line) + ',' + abQ(s.transl[i]) + ')">\ud83d\udcbe salvar</button></div>';
    }
    if (i < s.lyrics.length - 1) html += '<hr class="separator">';
  });
  html += '</div>';

  if (s.yt) {
    html += '<p class="sub" style="margin-top:16px">Clique em uma <b>linha</b> para pular o vídeo até ela. Clique em uma <b>palavra</b> para ouvir só essa palavra.</p>';
  } else {
    html += '<p class="sub" style="margin-top:16px">Clique em qualquer <b>palavra</b> para ouvir a pronúncia em inglês.</p>';
  }

  box.innerHTML = html;

  if (s.media) {
    setSyncoffFor(s);
    ensureMediaPlayer(s);
    startYtPoll(s.ytLines);
  } else if (s.yt) {
    ytBlockedVid = s.yt.videoId;
    setSyncoffFor(s);
    ensureYtPlayer(s.yt.videoId);
    startYtPoll(s.ytLines);
  } else {
    ytTearDown();
  }
}

function readLearnSong() {
  if (!currentLearn || currentLearn.yt) return;
  stopAudio();
  speakChain(currentLearn.lyrics, i => {
    $$('.lyric-line.en').forEach(l => l.classList.remove('active'));
    if (i >= 0) {
      const el = document.querySelector('.lyric-line.en[data-line="' + i + '"]');
      if (el) { el.classList.add('active'); el.scrollIntoView({ block: 'center', behavior: 'smooth' }); }
    }
  });
}

function toggleTransl() {
  $('#transl-box').classList.toggle('hidden');
}

/* ============ CHUNKS (expressões verdes) ============ */
function chunkSpans(text) {
  const words = String(text).split(' ').filter(Boolean);
  const out = [];
  let i = 0;
  while (i < words.length) {
    let hit = null;
    for (let ci = 0; ci < CHUNKS.length; ci++) {
      const cw = CHUNKS[ci].en.split(' ');
      if (i + cw.length > words.length) continue;
      let eq = true;
      for (let k = 0; k < cw.length; k++) {
        if (normWord(words[i + k]) !== normWord(cw[k])) { eq = false; break; }
      }
      if (eq) { hit = ci; break; }
    }
    if (hit !== null) {
      const cw = CHUNKS[hit].en.split(' ');
      const joined = words.slice(i, i + cw.length).join(' ');
      out.push('<span class="word chunk" data-chunk="' + hit + '" onclick="chunkClick(this,' + hit + ')">' + joined + '</span> ');
      i += cw.length;
    } else {
      out.push('<span class="word" onclick="speakWord(this)">' + words[i] + '</span> ');
      i++;
    }
  }
  return out.join('');
}

function chunkClick(el, idx) {
  const c = CHUNKS[idx];
  if (!c) return;
  const box = $('#chunk-info');
  box.innerHTML = '<b class="chunk-en">' + c.en + '</b> ' +
    '<button class="btn tiny" onclick="speakChunk(' + idx + ')">\ud83d\udd0a</button>' +
    ' &rarr; <span class="chunk-pt">' + c.pt + '</span>' +
    (c.note ? '<span class="chunk-note"> &middot; ' + c.note + '</span>' : '');
  box.style.display = 'block';
  if (el) {
    $$('.word.chunk').forEach(x => x.classList.remove('chunk-active'));
    el.classList.add('chunk-active');
  }
  speakChunk(idx);
}

function speakChunk(idx) {
  const c = CHUNKS[idx];
  if (c) speakEn(c.en, 0.75);
}

/* ============ MODO ESCUTA POR PASSOS (iniciante) ============ */
let escIdx = 0;
let escStep = 0;
let escRate = 0.65;
let escRes = null;
let escSeekFn = null;
let escRevTimer = null;
let escRevN = 0;

function escSong() {
  if (ytSong && ytSong.ytLines && ytSong.ytLines.length) return ytSong;
  if (currentLearn && currentLearn.ytLines && currentLearn.ytLines.length) return currentLearn;
  return null;
}

function escStatus(msg, cls) {
  setYtStatus('#yt-status-escuta', msg, cls || '');
}

function openEscuta() {
  stopEverything();
  view('escuta');
  escStopReveal();
  const s = escSong();
  renderSongPicker('#song-picker-escuta', s ? s.id : null, id => {
    const ys = ytSong;
    if (ys && ys.id === id) { escIdx = 0; escStep = 0; escRes = null; renderEscuta(); }
    else escStatus('O Modo Escuta precisa de uma música do YouTube com letra sincronizada. Busque-a na caixa acima (ex: All of Me John Legend).', 'err');
  });
  escStopReveal();
  renderEscuta();
}

function escWordSpans(text) {
  const words = String(text || '').split(/\s+/);
  let h = '';
  words.forEach(w => { h += '<span class="word esc-word" onclick="speakWord(this)">' + w + '</span> '; });
  return h;
}

function renderEscuta() {
  const s = escSong();
  const box = $('#escuta-content');
  if (!box) return;
  if (!$('#view-escuta').classList.contains('hidden') && !s) {
    escStatus('Nenhuma música com letra sincronizada ainda. Busque uma na caixa acima (ex: All of Me John Legend) e toque.', 'err');
  }
  if (!s) { box.classList.add('hidden'); return; }
  box.classList.remove('hidden');

  if (escIdx >= s.ytLines.length) escIdx = s.ytLines.length - 1;
  if (escIdx < 0) escIdx = 0;
  const last = escIdx === s.ytLines.length - 1;
  const ln = s.ytLines[escIdx];
  const hasTime = typeof ln.start === 'number' && ln.dur > 0 && !!s.media;
  const tr = (s.transl && s.transl[escIdx]) || '';

  /* FINAL */
  if (escStep === 99) {
    const img = s.thumbnail ? '<img class="esc-thumb" src="' + s.thumbnail + '" alt="">' : '';
    box.innerHTML =
      '<div class="esc-stage esc-done">' +
      '<p class="esc-emojis">\ud83c\udfb5 \ud83d\udc4f \ud83c\udf89</p>' +
      '<h3>Voc\u00ea completou a m\u00fasica!</h3>' +
      img +
      '<p><b>' + s.title + '</b> — ' + s.ytLines.length + ' frases ouvidas uma a uma.</p>' +
      '<p class="sub">Voc\u00ea leu, ouviu e interpretou cada frase. Consegue repetir de cor? Volte e pratique de novo — ou troque de m\u00fasica para um desafio novo.</p>' +
      '<div class="controls" style="justify-content:center">' +
      '<button class="btn primary" onclick="escRestart()">Recome\u00e7ar a m\u00fasica</button>' +
      '<button class="btn ghost" onclick="openLearn()">Ir para o modo Aprender</button>' +
      '</div></div>';
    return;
  }

  let html = '<p class="sync-bar" style="margin-bottom:12px">Frase <b>' + (escIdx + 1) + '</b> de <b>' + s.ytLines.length + '</b> &middot; ' + (s.title || '') +
    ' <span class="esc-rates">velocidade: ' +
    [0.5, 0.65, 0.8, 1].map(r => '<button class="btn tiny' + (r === escRate ? ' active' : '') + '" onclick="escSetRate(' + r + ')">' + r + 'x</button>').join(' ') +
    '</span></p>';

  html += '<div class="esc-stage">';

  if (escStep === 0) {
    const words = (ln.text || '').split(/\s+/).filter(Boolean);
    html += '<p class="esc-label">Passo 1 de 3 &middot; <b>Ou\u00e7a palavra por palavra</b></p>';
    html += '<div class="lyric-line en esc-big esc-reveal">';
    words.forEach(() => { html += '<span class="esc-hidden-w">\u2022\u2022\u2022</span> '; });
    html += '</div>';
    html += '<p class="supp esc-reveal-msg" style="margin:6px 0 0 2px">Frase com <b>' + words.length + '</b> ' + (words.length === 1 ? 'palavra' : 'palavras') + '. Aperte Ouvir e veja cada palavra aparecer no ritmo da m\u00fasica.</p>';
    html += escRecBox();
    html += '<div class="controls">' +
      '<button class="btn primary" onclick="escPlayReveal()">\ud83d\udc42 Ouvir palavra por palavra</button>' +
      '<button class="btn ghost" onclick="escToStep(1)">Frase vis\u00edvel &mdash; traduzir</button>' +
      '<button class="btn ghost" onclick="escToStep(2)">N\u00e3o sei &mdash; mostrar tradu\u00e7\u00e3o</button>' +
      '</div>';
  } else if (escStep === 1) {
    html += '<p class="esc-label">Passo 2 de 3 &middot; <b>Traduza para o portugu\u00eas</b></p>';
    html += '<div class="lyric-line en esc-small-en">' + escWordSpans(ln.text) + '</div>';
    html += '<p class="supp" style="margin:0 0 10px 4px">No papel e na sua cabe\u00e7a, o que essa frase quer dizer? Escreva em PT — n\u00e3o precisa ser perfeito.</p>';
    html += '<input id="esc-input" class="yt-input" placeholder="Escreva aqui a tradu\u00e7\u00e3o em portugu\u00eas..." autocomplete="off">';
    html += escRecBox();
    html += '<div class="controls">' +
      '<button class="btn primary" onclick="escCheck()">Conferir com a tradu\u00e7\u00e3o certa</button>' +
      '<button class="btn ghost" onclick="escPlay()">Ouvir de novo (loop)</button>' +
      '<button class="btn ghost" onclick="escToStep(2)">Desistir &mdash; mostrar</button>' +
      '</div>';
  } else if (escStep === 2) {
    html += '<p class="esc-label">Passo 3 de 3 &middot; <b>A tradu\u00e7\u00e3o certa</b></p>';
    if (escRes) {
      html += '<p class="esc-score">' + escRes.msg + '</p>';
    }
    html += '<div class="lyric-line en esc-big">' + escWordSpans(ln.text) + '</div>';
    if (tr) html += '<div class="lyric-line pt esc-big esc-pt">' + escWordSpans(tr) + '</div>';
    else html += '<div class="lyric-line pt esc-big esc-pt">(tradu\u00e7\u00e3o n\u00e3o dispon\u00edvel para esta frase)</div>';
    html += escRecBox();
    html += '<div class="controls">' +
      (hasTime ? '<button class="btn primary" onclick="escPlay()">Ouvir de novo</button>' : '') +
      (last ? '<button class="btn primary" onclick="escNext()">Terminei a m\u00fasica!</button>' : '<button class="btn primary" onclick="escNext()">Pr\u00f3xima frase</button>') +
      '</div>';
  }

  html += '</div>';

  html += '<div class="controls esc-nav">' +
    '<button class="btn ghost" onclick="escPrev()" ' + (escIdx === 0 ? 'disabled' : '') + '>\u2039 Anterior</button>' +
    '<button class="btn ghost" onclick="escRestart()">Reiniciar do zero</button>' +
    (last && escStep >= 3 ? '<button class="btn primary" onclick="escNext()">Finalizar</button>' : '') +
    '</div>';

  box.innerHTML = html;
  const inp = $('#esc-input');
  if (inp) inp.focus();
}

function escToStep(n) {
  escStop();
  escStopReveal();
  escStep = n;
  renderEscuta();
}

function escPlay() {
  const s = escSong();
  if (!s || !s.ytLines || !s.ytLines[escIdx]) return;
  const ln = s.ytLines[escIdx];
  if (window.speechSynthesis) speechSynthesis.cancel();
  if (mediaEl && typeof ln.start === 'number' && ln.dur > 0) {
    escStop();
    try {
      mediaEl.playbackRate = escRate;
      const a = Math.max(0, ln.start - 0.1);
      const b = ln.start + ln.dur + 0.25;
      mediaEl.currentTime = a;
      mediaEl.play().catch(() => {});
      escSeekFn = () => {
        try { if (mediaEl.currentTime >= b) mediaEl.currentTime = a; } catch (e) {}
      };
      mediaEl.addEventListener('timeupdate', escSeekFn);
    } catch (e) {}
  } else {
    speakEn(ln.text, escRate * 0.7 + 0.35);
  }
}

function escStop() {
  escRecAbort();
  if (mediaEl && escSeekFn) {
    try { mediaEl.removeEventListener('timeupdate', escSeekFn); } catch (e) {}
  }
  escSeekFn = null;
}

function escStopReveal() {
  if (escRevTimer) { clearInterval(escRevTimer); escRevTimer = null; }
  escRevN = 0;
}

/* --- gravação da própria voz (shadowing) --- */
let escRec = null;
let escRecLastUrl = null;

function escRecAbort() {
  if (!escRec) return;
  if (escRec.tmr) clearInterval(escRec.tmr);
  try { if (escRec.rec && escRec.rec.state !== 'inactive') escRec.rec.stop(); } catch (e) {}
  try { if (escRec.stream) escRec.stream.getTracks().forEach(t => t.stop()); } catch (e) {}
  escRec = null;
}

function escStartRec() {
  if (escRec) return;
  try { escStop(); } catch (e) {}
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    openModal('Grava\u00e7\u00e3o n\u00e3o suportada', '<p>Seu navegador n\u00e3o permite gravar o microfone aqui. Tente Chrome ou Edge atualizados (em http://localhost ou 127.0.0.1).</p>');
    return;
  }
  navigator.mediaDevices.getUserMedia({ audio: true })
    .then(stream => {
      try {
        const rec = new MediaRecorder(stream);
        const chunks = [];
        rec.ondataavailable = e => { if (e.data && e.data.size) chunks.push(e.data); };
        rec.start();
        escRec = { stream: stream, rec: rec, chunks: chunks, on: Date.now(), tmr: setInterval(escRecTick, 300) };
        renderEscuta();
      } catch (err) {
        stream.getTracks().forEach(t => t.stop());
        openModal('N\u00e3o deu para gravar', '<p>' + err.message + '</p>');
      }
    })
    .catch(() => openModal('Microfone bloqueado', '<p>Para gravar sua voz, permita o acesso ao microfone no bot\u00e3o do cadeado (ou no \u00edcone de permiss\u00e3o) ao lado do endere\u00e7o no navegador.</p>'));
}

function escRecTick() {
  const t = document.querySelector('#esc-rec-time');
  if (t && escRec) {
    const s = Math.floor((Date.now() - escRec.on) / 1000);
    t.innerHTML = '<b>gravando...</b> ' + s + 's';
  }
}

function escStopRec() {
  const a = escRec;
  if (!a) return;
  if (a.tmr) clearInterval(a.tmr);
  escRec = null;
  a.rec.onstop = () => {
    try { a.stream.getTracks().forEach(t => t.stop()); } catch (e) {}
    const blob = new Blob(a.chunks, { type: (a.rec.mimeType || 'audio/webm') });
    if (escRecLastUrl) { try { URL.revokeObjectURL(escRecLastUrl); } catch (e) {} }
    escRecLastUrl = blob.size ? URL.createObjectURL(blob) : null;
    renderEscuta();
  };
  try { a.rec.stop(); } catch (e) { escRecLastUrl = null; renderEscuta(); }
}

function escPlayRec() {
  if (!escRecLastUrl) return;
  const a = new Audio(escRecLastUrl);
  a.volume = 1;
  a.play().catch(() => openModal('N\u00e3o deu para tocar', '<p>N\u00e3o foi poss\u00edvel reproduzir a grava\u00e7\u00e3o.</p>'));
}

function escDelRec() {
  if (escRecLastUrl) { try { URL.revokeObjectURL(escRecLastUrl); } catch (e) {} }
  escRecLastUrl = null;
  renderEscuta();
}

function escRecBox() {
  let h = '<div class="esc-rec">';
  h += '<span class="esc-rec-tag">Shadowing \u00b7 sua voz:</span> ';
  if (escRec) {
    h += '<button class="btn tiny danger" onclick="escStopRec()">\u2b1b Parar grava\u00e7\u00e3o <span id="esc-rec-time"></span></button>';
  } else if (escRecLastUrl) {
    h += '<button class="btn tiny" onclick="escPlayRec()">\u25b6 Ouvir meu take</button> ' +
      '<button class="btn tiny" onclick="escStartRec()">\ud83c\udfa4 Gravar de novo</button> ' +
      '<button class="btn ghost tiny" onclick="escDelRec()">\ud83d\uddd1 Apagar</button>';
  } else {
    h += '<button class="btn tiny" onclick="escStartRec()">\ud83c\udfa4 Gravar minha voz</button>';
  }
  h += '</div>';
  return h;
}

function escRenderReveal(words, revealed) {
  const el = document.querySelector('.esc-reveal');
  const msg = document.querySelector('.esc-reveal-msg');
  if (!el) return;
  let h = '';
  words.forEach((w, i) => {
    if (i < revealed) h += '<span class="word esc-word" onclick="speakWord(this)">' + w + '</span> ';
    else h += '<span class="esc-hidden-w">\u2022\u2022\u2022</span> ';
  });
  el.innerHTML = h;
  if (msg) {
    const base = 'Frase com <b>' + words.length + '</b> ' + (words.length === 1 ? 'palavra' : 'palavras') + '. ';
    if (revealed >= words.length) {
      msg.innerHTML = base + '<b>Frase completa!</b> \u2b05 Dele para traduzir ou aperte Ouvir de novo.';
    } else {
      msg.innerHTML = base + 'Ou\u00e7a e veja cada palavra aparecer... (' + revealed + '/' + words.length + ')';
    }
  }
}

function escPlayReveal() {
  escStopReveal();
  escStop();
  const s = escSong();
  if (!s || !s.ytLines || !s.ytLines[escIdx]) return;
  const ln = s.ytLines[escIdx];
  const words = (ln.text || '').split(/\s+/).filter(Boolean);
  const n = words.length;
  if (!n) return;
  if (window.speechSynthesis) speechSynthesis.cancel();

  escRevN = 0;
  escRenderReveal(words, 0);

  if (mediaEl && typeof ln.start === 'number' && ln.dur > 0) {
    try {
      mediaEl.playbackRate = escRate;
      mediaEl.currentTime = Math.max(0, ln.start - 0.05);
      mediaEl.play().catch(() => {});
    } catch (e) {}
  } else {
    speakEn(ln.text, escRate * 0.7 + 0.35);
  }

  const dur = (ln.dur && ln.dur > 0) ? ln.dur : 3;
  const stepMs = Math.max(280, Math.round((dur * 1000) / n));
  escRevTimer = setInterval(() => {
    escRevN++;
    escRenderReveal(words, escRevN);
    if (escRevN >= n) escStopReveal();
  }, stepMs);
}

function escSetRate(r) {
  escRate = r;
  if (escSeekFn) escPlay();
  else renderEscuta();
}

function normWord(w) {
  return String(w).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '');
}

function wordCount(text) {
  return String(text || '').trim().split(/\s+/).filter(Boolean).length;
}

function escCheck() {
  const inp = $('#esc-input');
  if (!inp) return;
  const s = escSong();
  const ln = s.ytLines[escIdx];
  if (!ln) return;
  const tr = (s.transl && s.transl[escIdx]) || '';
  const dig = String(inp.value).trim();
  if (!tr) {
    escRes = { pct: null, msg: 'Essa frase n\u00e3o tem tradu\u00e7\u00e3o oficial no Vagalume, mas voc\u00ea tentou! \u00c9 isso que importa.' };
    escStep = 2;
    renderEscuta();
    return;
  }
  const got = new Set(dig.split(/\s+/).map(normWord).filter(Boolean));
  const want = new Set(tr.split(/\s+/).map(normWord).filter(w => w.length > 2));
  let hit = 0;
  want.forEach(w => { if (got.has(w)) hit++; });
  const total = want.size || 1;
  const pct = Math.round(hit / total * 100);
  let msg;
  if (pct === 100) msg = 'Perfeito! Sua tradu\u00e7\u00e3o bateu com a oficial. \u2b50';
  else if (pct >= 60) msg = 'Muito bom: voc\u00ea acertou ' + hit + ' de ' + total + ' palavras-chave (' + pct + '%).';
  else if (pct > 0) msg = 'Voc\u00ea acertou ' + hit + ' de ' + total + ' palavras-chave (' + pct + '%). Olhe a tradu\u00e7\u00e3o e escute de novo.';
  else msg = 'N\u00e3o tem problema, isso \u00e9 normal no in\u00edcio. Compare com a tradu\u00e7\u00e3o e escute a frase mais devagar.';
  escRes = { pct: pct, msg: msg };
  try { localStorage.setItem('esc_' + s.id + '_' + escIdx, String(pct)); } catch (e) {}
  escStep = 2;
  renderEscuta();
}

function escPrev() {
  escStop();
  escStopReveal();
  if (escIdx > 0) { escIdx--; escStep = 0; escRes = null; }
  renderEscuta();
}

function escNext() {
  escStop();
  escStopReveal();
  const s = escSong();
  if (!s) return;
  if (escIdx < s.ytLines.length - 1) { escIdx++; escStep = 0; escRes = null; }
  else escStep = 99;
  renderEscuta();
}

function escRestart() {
  escStop();
  escStopReveal();
  escIdx = 0;
  escStep = 0;
  escRes = null;
  renderEscuta();
}

/* ============ MODO ABC / BASICO ============ */
const ABC_VOGAIS = ['A', 'E', 'I', 'O', 'U'];
const ABC_LESSONS = {
  alfabeto: {
    t: 'Alfabeto', ic: 'ABC',
    d: 'As 26 letras em inglês, com o som e uma palavra de exemplo.',
    note: 'No inglês as letras têm nomes diferentes dos nossos. Ouça cada uma!',
    items: [
      { l: 'A', w: 'apple', pt: 'maçã' }, { l: 'B', w: 'ball', pt: 'bola' },
      { l: 'C', w: 'cat', pt: 'gato' }, { l: 'D', w: 'dog', pt: 'cachorro' },
      { l: 'E', w: 'egg', pt: 'ovo' }, { l: 'F', w: 'fish', pt: 'peixe' },
      { l: 'G', w: 'girl', pt: 'menina' }, { l: 'H', w: 'hat', pt: 'chapéu' },
      { l: 'I', w: 'ice', pt: 'gelo' }, { l: 'J', w: 'jam', pt: 'geleia' },
      { l: 'K', w: 'kite', pt: 'pipa' }, { l: 'L', w: 'lion', pt: 'leão' },
      { l: 'M', w: 'milk', pt: 'leite' }, { l: 'N', w: 'nose', pt: 'nariz' },
      { l: 'O', w: 'orange', pt: 'laranja' }, { l: 'P', w: 'pig', pt: 'porco' },
      { l: 'Q', w: 'queen', pt: 'rainha' }, { l: 'R', w: 'rabbit', pt: 'coelho' },
      { l: 'S', w: 'sun', pt: 'sol' }, { l: 'T', w: 'tiger', pt: 'tigre' },
      { l: 'U', w: 'umbrella', pt: 'guarda-chuva' }, { l: 'V', w: 'van', pt: 'van' },
      { l: 'W', w: 'water', pt: 'água' }, { l: 'X', w: 'x-ray', pt: 'raio-x' },
      { l: 'Y', w: 'yo-yo', pt: 'ioiô' }, { l: 'Z', w: 'zebra', pt: 'zebra' }
    ],
    quiz: 'letter'
  },
  pronomes: {
    t: 'Pronomes Pessoais',
    d: 'Pronomes que substituem os nomes nas frases.',
    note: 'I = eu, You = voce, He = ele, She = ella, It = ele/isso, We = nos, Eles = eles',
    items: [
      { l: 'I', w: 'I', pt: 'eu' },
      { l: 'You', w: 'you', pt: 'voce' },
      { l: 'He', w: 'he', pt: 'ele' },
      { l: 'She', w: 'she', pt: 'ela' },
      { l: 'It', w: 'it', pt: 'isso / ele / ela (animais)' },
      { l: 'We', w: 'we', pt: 'nos' },
      { l: 'They', w: 'they', pt: 'eles / elas' }
    ],
    quiz: 'pronoun'
  },
  verbos: {
    t: 'Verbos Essenciais',
    d: 'Os verbos mais comuns em inglês para iniciantes.',
    note: 'To be (Am/Is/Are), Like, Want, Love, Have',
    items: [
      { l: 'to be', w: 'Am/Is/Are', pt: 'Ser/Estar' },
      { l: 'like', w: 'like', pt: 'Gostar' },
      { l: 'want', w: 'want', pt: 'Querer' },
      { l: 'love', w: 'love', pt: 'Amar' },
      { l: 'have', w: 'have', pt: 'Ter' }
    ],
    quiz: 'verb'
  },
  adjetivos: {
    t: 'Qualidades (Adjetivos)',
    d: 'Adjetivos para descrever coisas e pessoas.',
    note: 'No inglês, o adjetivo vem ANTES do objeto (ex: "carro azul").',
    items: [
      { l: 'Good', w: 'Good', pt: 'Bom' },
      { l: 'Bad', w: 'Bad', pt: 'Ruim' },
      { l: 'Big', w: 'Big', pt: 'Grande' },
      { l: 'Small', w: 'Small', pt: 'Pequeno' },
      { l: 'Beautiful', w: 'Beautiful', pt: 'Bonito' },
      { l: 'Ugly', w: 'Ugly', pt: 'Feio' },
      { l: 'Happy', w: 'Happy', pt: 'Feliz' },
      { l: 'Sad', w: 'Sad', pt: 'Triste' }
    ],
    quiz: 'adjective'
  },
  possessivos: {
    t: 'Possessivos',
    d: 'Palavras para indicar de quem é algo.',
    note: 'My = meu/minha, Your = seu/sua',
    items: [
      { l: 'My', w: 'My', pt: 'Meu / Minha' },
      { l: 'Your', w: 'Your', pt: 'Seu / Sua' }
    ],
    quiz: 'possessive'
  },
  demonstrativos: {
    t: 'Demonstrativos',
    d: 'Palavras para apontar objetos ou lugares.',
    note: 'This = perto, That = longe',
    items: [
      { l: 'This', w: 'This', pt: 'Este / Esta' },
      { l: 'That', w: 'That', pt: 'Aquele / Aquela' }
    ],
    quiz: 'demonstrative'
  },
  mundos: {
    t: 'Nomes do Mundo',
    d: 'Substantivos comuns em músicas e conversas do dia a dia.',
    note: 'World (mundo), Sky (céu), Home (casa), Love (amor), Heart (coração), Life (vida), Night (noite), Day (dia).',
    items: [
      { l: 'World', w: 'World', pt: 'Mundo' },
      { l: 'Sky', w: 'Sky', pt: 'Céu' },
      { l: 'Home', w: 'Home', pt: 'Casa' },
      { l: 'Love', w: 'Love', pt: 'Amor' },
      { l: 'Heart', w: 'Heart', pt: 'Coração' },
      { l: 'Life', w: 'Life', pt: 'Vida' },
      { l: 'Night', w: 'Night', pt: 'Noite' },
      { l: 'Day', w: 'Day', pt: 'Dia' }
    ],
    quiz: 'noun'
  },
  perguntas: {
    t: 'Perguntas Wh-',
    d: 'As perguntas mais comuns com Wh- no inglês.',
    note: 'What = O que, Where = Onde, Who = Quem, Why = Por que, How = Como',
    items: [
      { l: 'What', w: 'What', pt: 'O que / Qual' },
      { l: 'Where', w: 'Where', pt: 'Onde' },
      { l: 'Who', w: 'Who', pt: 'Quem' },
      { l: 'Why', w: 'Why', pt: 'Por que' },
      { l: 'How', w: 'How', pt: 'Como' }
    ],
    quiz: 'question'
  },
  vogais: {
    t: 'Vogais', ic: 'AEIOU',
    d: 'A, E, I, O, U são as vogais. Toda palavra tem pelo menos uma.',
    note: 'Toca a letra e a palavra de exemplo junta.',
    items: [
      { l: 'A', w: 'apple', pt: 'maçã' }, { l: 'E', w: 'egg', pt: 'ovo' },
      { l: 'I', w: 'ice', pt: 'gelo' }, { l: 'O', w: 'orange', pt: 'laranja' },
      { l: 'U', w: 'umbrella', pt: 'guarda-chuva' }
    ],
    quiz: 'type'
  },
  consoantes: {
    t: 'Consoantes', ic: 'BCDF',
    d: 'As outras 21 letras são consoantes. Com as vogais, montam as sílabas.',
    note: 'Toca a letra e a palavra de exemplo junta.',
    items: [
      { l: 'B', w: 'bus', pt: 'ônibus' }, { l: 'C', w: 'cat', pt: 'gato' },
      { l: 'D', w: 'dog', pt: 'cachorro' }, { l: 'F', w: 'fish', pt: 'peixe' },
      { l: 'G', w: 'girl', pt: 'menina' }, { l: 'H', w: 'hat', pt: 'chapéu' },
      { l: 'J', w: 'jam', pt: 'geleia' }, { l: 'K', w: 'kite', pt: 'pipa' },
      { l: 'L', w: 'lion', pt: 'leão' }, { l: 'M', w: 'milk', pt: 'leite' },
      { l: 'N', w: 'nose', pt: 'nariz' }, { l: 'P', w: 'pig', pt: 'porco' },
      { l: 'Q', w: 'queen', pt: 'rainha' }, { l: 'R', w: 'rabbit', pt: 'coelho' },
      { l: 'S', w: 'sun', pt: 'sol' }, { l: 'T', w: 'tiger', pt: 'tigre' },
      { l: 'V', w: 'van', pt: 'van' }, { l: 'W', w: 'water', pt: 'água' },
      { l: 'X', w: 'box', pt: 'caixa' }, { l: 'Y', w: 'yo-yo', pt: 'ioiô' },
      { l: 'Z', w: 'zebra', pt: 'zebra' }
    ],
    quiz: 'type'
  },
  artigos: {
    t: 'Artigo THE', ic: 'the',
    d: '"the" = o, a, os, as. Usamos para algo específico ou que todo mundo conhece.',
    note: 'the sun (o sol) · the door (a porta) · the moon (a lua)',
    items: [
      { l: 'the sun', w: 'the sun', pt: 'o sol' },
      { l: 'the door', w: 'the door', pt: 'a porta' },
      { l: 'the moon', w: 'the moon', pt: 'a lua' },
      { l: 'the sky', w: 'the sky', pt: 'o céu' }
    ],
    quiz: 'article'
  },
  aan: {
    t: 'A e AN (indefinidos)', ic: 'a/an',
    d: '"a" = um/uma e "an" = um/uma. Usamos AN quando a próxima palavra COMEÇA com som de vogal.',
    note: 'a dog (um cachorro) · an apple (uma maçã) · an hour (uma hora: o "h" não se fala!)',
    items: [
      { l: 'a dog', w: 'a dog', pt: 'um cachorro' },
      { l: 'an apple', w: 'an apple', pt: 'uma maçã' },
      { l: 'a cat', w: 'a cat', pt: 'um gato' },
      { l: 'an egg', w: 'an egg', pt: 'um ovo' },
      { l: 'a car', w: 'a car', pt: 'um carro' },
      { l: 'an orange', w: 'an orange', pt: 'uma laranja' },
      { l: 'a book', w: 'a book', pt: 'um livro' },
      { l: 'an umbrella', w: 'an umbrella', pt: 'um guarda-chuva' }
    ],
    quiz: 'aan'
  }
};

let basicoKey = null;
let basicoQ = null;
let basicoRound = null;
/* Musica requer o servidor local youtube_server.py (iniciar.bat).
   Se um dia fixarmos um backend (ex.: Render), basta preencher esta URL. */
var API_BASE = '';
let gradMode = false;
let gradFase = 1; /* 1 = com som | 2 = Fase 2 Graduacao (sem som) */

function openBasico() {
  stopEverything();
  view('basico');
  if (!basicoKey) basicoKey = 'alfabeto';
  abRenList();
  abOpen(basicoKey);
}

function abRenList() {
  const c = $('#basico-lessons');
  c.innerHTML = '';
  Object.keys(ABC_LESSONS).forEach(k => {
    const L = ABC_LESSONS[k];
    const d = document.createElement('div');
    d.className = 'song-card' + (k === basicoKey ? ' active' : '');
    d.innerHTML = '<h4>' + (L.ic || L.t) + '</h4><small>' + L.t + '</small>';
    d.onclick = () => abOpen(k);
    c.appendChild(d);
  });
}

function abOpen(key) {
  basicoKey = key;
  basicoQ = null;
  basicoRound = null;
  gradMode = false;
  abRenList();
  const box = $('#basico-content');
  box.classList.remove('hidden');
  const L = ABC_LESSONS[key];
  const best = localStorage.getItem('abcb_' + key);
  let html = '<div class="esc-stage">' +
    '<h3>' + L.t + '</h3>' +
    '<p>' + L.d + '</p>' +
    (L.note ? '<p class="supp"><b>Exemplos:</b> ' + L.note + '</p>' : '') +
    (best ? '<p class="supp">Melhor no quiz: <b>' + best + '</b></p>' : '') +
    '</div>';
  html += '<div class="abc-grid">';
  L.items.forEach(it => {
    html += '<div class="abc-card">' +
      '<span class="abc-letter" onclick="abSay(' + abQ(it.l) + ')">' + it.l + '</span>' +
      '<span class="abc-word" onclick="abSay(' + abQ(it.w) + ')">' + it.w + '</span>' +
      '<span class="abc-pt">' + it.pt + '</span>' +
      '</div>';
  });
  html += '</div>';
  html += '<div class="controls" style="justify-content:center">' +
    '<button class="btn primary" onclick="abStartQuiz()">Jogar quiz: ' + L.t + '</button>' +
    '</div>';
  box.innerHTML = html;
}

function abQ(text) {
  return "'" + String(text).replace(/\\/g, '\\\\').replace(/'/g, "\\'") + "'";
}

function abSay(text) {
  speakEn(String(text), 0.8);
}

function abStartQuiz() {
  const L = ABC_LESSONS[basicoKey];
  const qs = [];
  const seen = new Set();
  const pool = L.items.slice();
  const n = Math.max(5, Math.min(8, pool.length));
  let guard = 0;
  while (qs.length < n && guard < 300) {
    guard++;
    const it = pool[Math.floor(Math.random() * pool.length)];
    if (pool.length >= 5 && seen.has(it.w)) continue;
    seen.add(it.w);
    qs.push(it);
  }
  basicoRound = { qs: qs, i: 0, ok: 0, key: basicoKey };
  abNextQ();
}

function abShuffle(a) {
  const r = a.slice();
  for (let i = r.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const t = r[i]; r[i] = r[j]; r[j] = t;
  }
  return r;
}

function abBuildQ(it) {
  const L = ABC_LESSONS[basicoKey];
  const t = L.quiz;
  const silent = gradMode && gradFase === 2;
  const finish = q => { if (silent) delete q.speak; return q; };
  if (t === 'letter') {
    const opts = new Set([it.l]);
    const all = ABC_LESSONS.alfabeto.items.map(x => x.l);
    while (opts.size < 5) opts.add(all[Math.floor(Math.random() * all.length)]);
    if (silent) {
      return { prompt: 'Que letra \u00e9 esta? (Fase 2 sem som)', show: it.l, answer: it.l, options: abShuffle([...opts]) };
    }
    return { prompt: 'Que letra voc\u00ea ouviu? (letra escondida: adivinhe pelo som)', show: '???', masked: true, speak: it.l, answer: it.l, options: abShuffle([...opts]) };
  }
  if (t === 'type') {
    const isVogal = ABC_VOGAIS.indexOf(it.l) >= 0;
    const ans = isVogal ? 'vogal' : 'consoante';
    return finish({ prompt: 'A letra "' + it.l + '" \u00e9...', show: it.l, speak: it.l, answer: ans, options: ['vogal', 'consoante'] });
  }
  if (t === 'article') {
    const noun = String(it.w).replace(/^(a|an|the)\s+/i, '');
    return finish({
      prompt: 'Complete a frase:',
      show: '___ ' + noun,
      speak: it.w,
      answer: 'the',
      options: ['the', 'a', 'an', 'this', 'that']
    });
  }
  if (t === 'aan') {
    const noun = String(it.w).replace(/^(a|an|the)\s+/i, '');
    const ans = (/^(a|an)\s/i.test(it.w) ? String(it.w).split(/\s/)[0].toLowerCase() : 'a');
    return finish({
      prompt: 'Complete a frase:',
      show: '___ ' + noun,
      speak: it.w,
      answer: ans,
      options: ['a', 'an', 'this', 'that', 'the']
    });
  }
  // palavras em ingles (pronomes, verbos, adjetivos, possessivos, nomes, perguntas)
  const ans = String(it.w || it.l);
  const opts = new Set([ans]);
  const cands = L.items.map(x => String(x.w || x.l)).filter(Boolean);
  for (let guard = 0; opts.size < 5 && guard < 80; guard++) {
    const c = cands[Math.floor(Math.random() * cands.length)];
    if (c) opts.add(c);
  }
  const extra = ABC_LESSONS.alfabeto.items.map(x => x.w);
  for (let guard = 0; opts.size < 5 && guard < 80; guard++) {
    opts.add(extra[Math.floor(Math.random() * extra.length)]);
  }
  return finish({
    prompt: 'Como se diz "' + (it.pt || it.l) + '" em ingl\u00eas?',
    show: it.pt || it.l,
    speak: ans,
    answer: ans,
    options: abShuffle([...opts])
  });
}

function abNextQ() {
  const R = basicoRound;
  if (!R || R.i >= R.qs.length) { abEnd(); return; }
  const it = R.qs[R.i];
  R.i++;
  const Q = abBuildQ(it);
  basicoQ = Q;
  R.it = it;
  const box = $('#basico-content');
  const L = ABC_LESSONS[basicoKey];
  let html = '<p class="sync-bar">Quiz ' + L.t + ' · <b>' + R.i + '</b>/' + R.qs.length + ' · certas: <b>' + R.ok + '</b></p>';
  html += '<div class="esc-stage">';
  html += '<p class="esc-label">' + Q.prompt + '</p>';
  if (Q.speak) {
    html += '<div class="abc-speak"><button class="btn tiny" onclick="abSay(' + abQ(Q.speak) + ')">\ud83d\udd0a Ouvir</button></div>';
  }
  html += '<div class="abc-question">' + (Q.masked ? '<span class="abc-mask">' + Q.show + '</span>' : Q.show) + '</div>';
  html += '<div class="controls abc-opts">';
  Q.options.forEach(op => {
    html += '<button class="btn ghost abc-opt" onclick="abAnswer(' + abQ(op) + ')">' + op + '</button>';
  });
  html += '</div>';
  if (Q.masked) {
    html += '<div class="controls" style="justify-content:center">' +
      '<button class="btn ghost btn-tiny" onclick="abPeek()">\ud83d\udc41 Mostrar a letra (perde o ponto)</button>' +
      '</div>';
  }
  html += '<p class="supp">Escolha a resposta. Se errar, o app mostra a certa.</p>';
  html += '</div>';
  box.innerHTML = html;
  if (Q.speak) abSay(Q.speak);
}

function abPeek() {
  if (!basicoQ) return;
  const Q = basicoQ;
  const R = basicoRound;
  const isGrad = gradMode && R.key && typeof levelLessonKey === 'function' &&
    levelLessonKey(englishProgress.level) === R.key;
  const box = $('#basico-content');
  if (isGrad) {
    gradMode = false;
    box.innerHTML =
      '<p class="sync-bar">Quiz ' + ABC_LESSONS[basicoKey].t + ' · certas: <b>' + R.ok + '</b></p>' +
      '<div class="esc-stage">' +
      '<p class="esc-score" style="background:rgba(239,68,68,0.15)"><b>Voc\u00ea olhou a letra \u274c</b> Na Gradua\u00e7\u00e3o a letra fica escondida: adivinhe pelo som. A letra era "<b>' + Q.answer + '</b>".</p>' +
      '<p class="supp" style="color:#fca5a5">Quem abre a letra perde a fase e volta ao N\u00edvel 1.</p>' +
      '<div class="controls" style="justify-content:center">' +
      '<button class="btn primary" onclick="graduationFail()">Voltar ao N\u00edvel 1</button>' +
      '</div></div>';
    return;
  }
  box.innerHTML =
    '<p class="sync-bar">Quiz ' + ABC_LESSONS[basicoKey].t + ' · certas: <b>' + R.ok + '</b></p>' +
    '<div class="esc-stage">' +
    '<p class="esc-score" style="background:rgba(239,68,68,0.15)"><b>Voc\u00ea olhou a letra \u274c</b> A letra era "<b>' + Q.answer + '</b>". Tente de novo sem olhar!</p>' +
    '<div class="controls" style="justify-content:center">' +
    '<button class="btn primary" onclick="abNextQ()">Pr\u00f3xima</button>' +
    '</div></div>';
}

function abAnswer(op) {
  if (!basicoQ) return;
  const Q = basicoQ;
  const R = basicoRound;
  const certa = op === Q.answer;
  if (certa) R.ok++;
  const box = $('#basico-content');
  let html = '<p class="sync-bar">Quiz ' + ABC_LESSONS[basicoKey].t + ' · certas: <b>' + R.ok + '</b></p>';
  html += '<div class="esc-stage">';
  const word = (R.it && R.it.w) || '';
  const pt = (R.it && R.it.pt) || '';
  html += certa
    ? '<p class="esc-score" style="background:rgba(34,197,94,0.15)"><b>Acertou! \u2705</b> "' + Q.show + '" -> <b>' + Q.answer + '</b>' + (pt ? ' (' + pt + ')' : '') + '</p>'
    : '<p class="esc-score" style="background:rgba(239,68,68,0.15)"><b>Errou \u274c</b> A certa era "<b>' + Q.answer + '</b>" ' + (pt ? '(' + pt + ')' : '') + '</p>';
  if (word && !(gradMode && gradFase === 2)) html += '<p class="supp"><button class="btn tiny" onclick="abSay(' + abQ(word) + ')">Ouvir: ' + word + '</button></p>';
  const isGradFail = !certa && gradMode && R.key && typeof levelLessonKey === 'function' &&
    levelLessonKey(englishProgress.level) === R.key;
  if (isGradFail) {
    gradMode = false;
    html += '<p class="supp" style="color:#fca5a5">Esse \u00e9 o teste da Gradua\u00e7\u00e3o: um erro encerra a fase e voc\u00ea volta ao N\u00edvel 1.</p>';
    html += '<div class="controls">' +
      '<button class="btn primary" onclick="graduationFail()">Voltar ao N\u00edvel 1</button>' +
      '</div>';
  } else {
    html += '<div class="controls">' +
      '<button class="btn primary" onclick="abNextQ()">' + (R.i >= R.qs.length ? 'Ver resultado' : 'Pr\u00f3xima') + '</button>' +
      '</div>';
  }
  html += '</div>';
  box.innerHTML = html;
}

function abEnd() {
  const R = basicoRound;
  if (!R) return;
  const pct = Math.round(R.ok / R.qs.length * 100);
  const prev = localStorage.getItem('abcb_' + basicoKey);
  const isBest = prev === null || R.ok > Number(prev);
  if (isBest) { try { localStorage.setItem('abcb_' + basicoKey, String(R.ok)); } catch (e) {} }
  const box = $('#basico-content');
  const L = ABC_LESSONS[basicoKey];
  box.innerHTML =
    '<div class="esc-stage esc-done">' +
    '<p class="esc-emojis">' + (pct === 100 ? '\ud83c\udf89' : (pct >= 50 ? '\ud83d\udc4f' : '\ud83d\udc4d')) + '</p>' +
    '<h3>Voc\u00ea acertou ' + R.ok + ' de ' + R.qs.length + '!</h3>' +
    '<p class="score-big">' + pct + '%</p>' +
    (isBest ? '<p><b>Novo recorde!</b></p>' : '<p>Recorde: ' + prev + '</p>') +
    '<div class="controls" style="justify-content:center">' +
    '<button class="btn primary" onclick="abStartQuiz()">Jogar de novo</button>' +
    '<button class="btn ghost" onclick="abOpen(\'' + basicoKey + '\')">Ver li\u00e7\u00e3o</button>' +
    '</div></div>';
  if (R.key && typeof levelLessonKey === 'function' && levelLessonKey(englishProgress.level) === R.key) {
    onQuizResult(pct);
  }
  gradMode = false;
}

/* ============ MODO 2: DITADO ============ */
let dictSong = null;
let dictMode = 'escrita';

function openDictation() {
  stopEverything();
  view('dictation');
  if (!dictSong) dictSong = SONGS[0];
  pickDictSong(dictSong.id);
  renderSongPicker('#song-picker-dict', dictSong.id, id => pickDictSong(id));
}

function pickDictSong(id) {
  dictSong = resolveSong(id);
  renderSongPicker('#song-picker-dict', id, i2 => pickDictSong(i2));
  renderDictation();
}

function setDictMode(m) {
  dictMode = m;
  $$('.mode-pill').forEach(p => p.classList.toggle('active', p.dataset.mode === m));
  renderDictInputs();
}

function renderDictation() {
  const s = dictSong;
  const g = $('#dict-game');
  g.classList.remove('hidden');
  stopYtPoll();

  let html = '<div class="dict-mode">';
  html += '<button class="mode-pill active" data-mode="escrita" onclick="setDictMode(\'escrita\')">Escrever tudo</button>';
  html += '<button class="mode-pill" data-mode="lacunas" onclick="setDictMode(\'lacunas\')">Completar lacunas</button>';
  html += '</div>';

  html += '<div class="controls">';
  if (s.yt) {
    html += '<button class="btn primary" onclick="playYt(false)">Tocar</button>';
    html += '<button class="btn ghost" onclick="pauseYt()">Pausar</button>';
    html += '<button class="btn ghost" onclick="playYt(true)">Reiniciar</button>';
    html += '<button class="btn ghost" onclick="stopEverything()">Parar</button>';
    html += '</div>';
  } else {
    if (s.audio) {
      html += '<button class="btn primary" onclick="playSongAudio(dictSong)">Tocar música</button>';
    }
    html += '<button class="btn primary" onclick="readDictSong()">Ler letra (voz)</button>';
    html += '<button class="btn ghost" onclick="stopEverything()">Parar</button>';
    html += '</div>';
  }

  html += '<div id="dict-inputs"></div>';
  html += '<div class="controls">' +
    '<button class="btn primary" onclick="checkDictation()">Conferir</button>' +
    '<button class="btn ghost" onclick="renderDictInputs()">Recomeçar</button>' +
    '</div>';
  html += '<div id="dict-result" class="result"></div>';

  g.innerHTML = html;

  if (s.media) {
    ensureMediaPlayer(s);
  } else if (s.yt) {
    ytBlockedVid = s.yt.videoId;
    ensureYtPlayer(s.yt.videoId);
  } else {
    ytTearDown();
  }
  renderDictInputs();
}

/* escolhe quais palavras viram lacuna (não remove a 1ª de cada linha) */
function pickBlanks(line) {
  const words = line.split(' ');
  const idx = [];
  const count = Math.max(1, Math.round(words.length * 0.3));
  let tries = 0;
  while (idx.length < count && tries++ < 200) {
    const r = 1 + Math.floor(Math.random() * (words.length - 1));
    if (!idx.includes(r)) idx.push(r);
  }
  return idx;
}

function renderDictInputs() {
  if (!dictSong) return;
  const s = dictSong;
  $('#dict-inputs').innerHTML = '';
  $('#dict-result').innerHTML = '';
  let html = '';

  if (dictMode === 'escrita') {
    html = '<div class="input-lines">';
    s.lyrics.forEach((l, i) => {
      html += '<input class="line-input" id="dline' + i + '" placeholder="Linha ' + (i + 1) + '..." autocomplete="off">';
    });
    html += '</div>';
  } else {
    html = '<div class="blanks">';
    s.lyrics.forEach((line, i) => {
      const words = line.split(' ');
      const blanks = pickBlanks(line);
      html += '<div class="bline" data-line="' + i + '">';
      words.forEach((w, j) => {
        if (blanks.includes(j)) {
          const esc = w.replace(/"/g, '&quot;');
          html += '<span class="blank" data-answer="' + esc + '">' +
            '<input class="blank-input" style="width:' + Math.max(70, w.length * 14) + 'px" autocomplete="off">' +
            '</span> ';
        } else {
          html += w.replace(/"/g, '&quot;') + ' ';
        }
      });
      html += '</div>';
    });
    html += '</div>';
  }

  $('#dict-inputs').innerHTML = html;
  linkEnterKeys($('#dict-inputs'));
}

function linkEnterKeys(container) {
  const inputs = container.querySelectorAll('input');
  inputs.forEach((inp, i) => {
    inp.addEventListener('keydown', e => {
      if (e.key === 'Enter') {
        e.preventDefault();
        if (inputs[i + 1]) inputs[i + 1].focus();
        else checkDictation();
      }
    });
  });
}

function readDictSong() {
  if (!dictSong || dictSong.yt) return;
  stopAudio();
  speakChain(dictSong.lyrics, i => {
    $$('.blanks .bline, .lyric-line.en').forEach(l => l.classList.remove('active'));
    $$('.bline[data-line="' + i + '"]').forEach(t => {
      t.classList.add('active');
      t.scrollIntoView({ block: 'center', behavior: 'smooth' });
    });
  });
}

function checkDictation() {
  const s = dictSong;
  const result = $('#dict-result');
  let correct = 0, total = 0;

  if (dictMode === 'escrita') {
    s.lyrics.forEach((line, i) => {
      const inp = $('#dline' + i);
      if (!inp) return;
      const got = (inp.value || '').split(/\s+/).filter(Boolean);
      const want = line.split(' ');
      total += want.length;
      let lineOk = 0;
      want.forEach((w, j) => { if (norm(got[j]) === norm(w)) lineOk++; });
      correct += lineOk;
      inp.classList.add(lineOk === want.length ? 'ok' : 'bad');
      if (lineOk !== want.length) {
        inp.value = want.join(' ');
      }
    });
  } else {
    const blanks = $$('.blanks .blank');
    total = blanks.length;
    blanks.forEach(b => {
      const inp = b.querySelector('input');
      const answer = b.dataset.answer;
      const ok = inp ? norm(inp.value) === norm(answer) : false;
      if (ok) correct++;
      b.classList.add(ok ? 'ok' : 'bad');
      if (inp) {
        b.innerHTML = ok
          ? '<span class="blank-answer ok">' + answer + '</span>'
          : '<span class="blank-answer bad">' + (inp.value || '?') + '</span>' +
            '<span class="reveal">' + answer + '</span>';
      }
    });
  }

  const pct = total ? Math.round((correct / total) * 100) : 0;
  const key = 'dic_' + s.id + '_' + dictMode;
  const best = localStorage.getItem(key);
  const isBest = best === null || pct > Number(best);
  if (isBest) localStorage.setItem(key, String(pct));

  let msg = pct >= 80 ? 'Excelente!' : pct >= 50 ? 'Muito bom!' : pct > 0 ? 'Continue praticando!' : 'Tente de novo!';
  result.innerHTML =
    '<h3>' + msg + '</h3>' +
    '<div class="score-big">' + pct + '%</div>' +
    '<p>Corretas: <b>' + correct + '</b> de <b>' + total + '</b> palavras</p>' +
    (isBest ? '<p><b>Novo recorde!</b></p>' : '') +
    '<p>As respostas certas estão acima. Ouça de novo e tente melhorar!</p>';
}

/* ============ JOGO DA MEMÓRIA ============ */
let memCat = null;
let memTimer = null;
let memStart = 0;
let memMoves = 0;
let memFound = 0;
let memPairCount = 0;
let memLocked = false;
let memFlipped = [];

/* ===== ENSINANDO POR FRASE (v36) ===== */
let fraseCat = nullUpper, fraseIdx = 0, fraseRevealed = false;
function openFrase() {
  stopEverything();
  view('frase');
  if (!fraseCat) fraseCat = FRASES_CATEGORIAS[0].id;
  renderFrase();
}
function renderFrase() {
  const cat = FRASES_CATEGORIAS.find(c => c.id === fraseCat);
  if (!cat) return;
  $('#frase-cats').innerHTML = '';
  FRASES_CATEGORIAS.forEach(c => {
    const b = document.createElement('button');
    b.className = 'cat-pill' + (c.id === fraseCat ? ' active' : '');
    b.textContent = c.name;
    b.onclick = () => { fraseCat = c.id; fraseIdx = 0; fraseRevealed = false; renderFrase(); };
    $('#frase-cats').appendChild(b);
  });
  drawFrase(cat, fraseIdx);
}
// usa +- com borda; reusa declaração existente abaixo (speakEn) sem colidir
let fraseCatQuebrada = 0;
function drawFrase(cat, idx) {
  if (!cat || idx > cat.items.length - 1) { fraseIdx = 0; idx = 0; }
  const it = cat.items[idx];
  const wordTag = '<b class="fr-word">' + it.word + '</b>';
  const sent = it.en.replace(new RegExp('\\b' + it.word + '\\b', 'i'), wordTag);
  const covered = fraseRevealed ? it.pt : '<span class="fr-cover" onclick="fraseRevealPt()">ver tradu\u00e7\u00e3o</span>';
  $('#frase-card').innerHTML =
    '<div class="fr-card">' +
      '<div class="fr-en" onclick="speakEn(\'' + it.en.replace(/'/g, "\\'") + '\')">' + sent + '</div>' +
      '<div class="fr-pt">' + covered + '</div>' +
      '<div class="fr-controls">' +
        '<button class="btn ghost" onclick="fraseSpeakWord()">\u{1F50A} Palavra</button>' +
        '<button class="btn ghost" onclick="fraseSpeakFull()">\u{1F3A4} Frase</button>' +
      '</div>' +
    '</div>';
  $('#frase-progress').textContent = (idx + 1) + ' / ' + cat.items.length;
}
function fraseRevealPt() {
  fraseRevealed = true;
  drawFrase(FRASES_CATEGORIAS.find(c => c.id === fraseCat), fraseIdx);
}
function fraseSpeakWord() {
  const cat = FRASES_CATEGORIAS.find(c => c.id === fraseCat);
  const it = cat.items[fraseIdx];
  speakEn(it.word);
}
function fraseSpeakFull() {
  const cat = FRASES_CATEGORIAS.find(c => c.id === fraseCat);
  speakEn(cat.items[fraseIdx].en);
}
function fraseNext() {
  const cat = FRASES_CATEGORIAS.find(c => c.id === fraseCat);
  fraseIdx = (fraseIdx + 1) % cat.items.length;
  fraseRevealed = false;
  drawFrase(cat, fraseIdx);
}
function frasePrev() {
  const cat = FRASES_CATEGORIAS.find(c => c.id === fraseCat);
  fraseIdx = (fraseIdx - 1 + cat.items.length) % cat.items.length;
  fraseRevealed = false;
  drawFrase(cat, fraseIdx);
}
function fraseNovo() {
  const cat = FRASES_CATEGORIAS.find(c => c.id === fraseCat);
  fraseIdx = Math.floor(Math.random() * cat.items.length);
  fraseRevealed = false;
  drawFrase(cat, fraseIdx);
}

function openMemory() {
  stopEverything();
  view('memory');
  if (!memCat) memCat = WORD_CATEGORIES[0].id;
  startMemory(memCat);
}

function renderCats(sel, activeId, onClick) {
  const box = $(sel);
  if (!box) return;
  box.innerHTML = '';
  WORD_CATEGORIES.forEach(c => {
    const b = document.createElement('button');
    b.className = 'cat-pill' + (c.id === activeId ? ' active' : '');
    b.textContent = c.name;
    b.onclick = () => onClick(c.id);
    box.appendChild(b);
  });
}

function startMemory(catId) {
  window.clearInterval(memTimer); memTimer = null;
  memCat = catId;
  memMoves = 0; memFound = 0; memLocked = false; memFlipped = [];
  const cat = WORD_CATEGORIES.find(c => c.id === catId);
  memPairCount = cat.items.length;

  $('#mem-setup').innerHTML =
    '<div id="mem-cats" style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:10px"></div>' +
    '<label class="checkbox"><input type="checkbox" id="mem-pt" onchange="renderMemory()"> Mostrar português na imagem</label>';
  renderCats('#mem-cats', catId, id => startMemory(id));

  renderMemory();
  $('#mem-board').classList.remove('hidden');
}

function renderMemory() {
  const cat = WORD_CATEGORIES.find(c => c.id === memCat);
  const showPt = $('#mem-pt') && $('#mem-pt').checked;

  const deck = [];
  cat.items.forEach(it => {
    deck.push({ kind: 'img', item: it });
    deck.push({ kind: 'word', item: it });
  });
  const order = shuffle(deck);

  let html = '<div class="hud">' +
    '<span>Jogadas: <b id="mem-moves">0</b></span>' +
    '<span>Tempo: <b id="mem-time">0s</b></span>' +
    '<span>Pares: <b id="mem-found">0</b>/' + memPairCount + '</span></div>';

  html += '<div class="mem-grid">';
  order.forEach((card, i) => {
    let front = '';
    if (card.kind === 'img') {
      front = '<span class="pico">' + card.item.img + '</span>' +
        (showPt ? '<span class="pt">' + card.item.pt + '</span>' : '');
    } else {
      front = '<span class="en">' + card.item.en + '</span>';
    }
    html += '<div class="card3d" data-en="' + card.item.en + '" data-kind="' + card.kind + '" onclick="flipCard(this)">' +
      '<div class="card-inner">' +
      '<div class="face back">?</div>' +
      '<div class="face front">' + front + '</div>' +
      '</div></div>';
  });
  html += '</div>';

  $('#mem-board').innerHTML = html;
  $('#mem-moves').textContent = 0;
  $('#mem-found').textContent = 0;
  $('#mem-time').textContent = '0s';
  memStart = Date.now();
  if (!memTimer) {
    memTimer = setInterval(() => {
      $('#mem-time').textContent = Math.floor((Date.now() - memStart) / 1000) + 's';
    }, 250);
  }
}

function flipCard(el) {
  if (memLocked) return;
  if (el.classList.contains('flipped') || el.classList.contains('matched')) return;

  el.classList.add('flipped');
  memFlipped.push(el);

  if (memFlipped.length === 2) {
    memMoves++;
    $('#mem-moves').textContent = memMoves;
    const [a, b] = memFlipped;
    memFlipped = [];
    if (a.dataset.en === b.dataset.en && a.dataset.kind !== b.dataset.kind) {
      memFound++;
      $('#mem-found').textContent = memFound;
      a.classList.add('matched'); b.classList.add('matched');
      speakEn(a.dataset.en, 0.85);
      if (memFound === memPairCount) endMemory();
    } else {
      memLocked = true;
      setTimeout(() => {
        a.classList.remove('flipped'); b.classList.remove('flipped');
        memLocked = false;
      }, 750);
    }
  }
}

function endMemory() {
  window.clearInterval(memTimer); memTimer = null;
  const time = Math.floor((Date.now() - memStart) / 1000);
  const key = 'mem_' + memCat;
  const best = localStorage.getItem(key);
  const isBest = best === null || time < Number(best);
  if (isBest) localStorage.setItem(key, String(time));

  $('#mem-board').insertAdjacentHTML('beforeend',
    '<div class="win-overlay result">' +
    '<h3>Você achou todos os pares!</h3>' +
    '<div class="score-big">' + time + 's</div>' +
    '<p>' + memMoves + ' jogadas</p>' +
    (isBest ? '<p><b>Novo recorde de tempo!</b></p>' : '<p>Recorde: ' + best + 's</p>') +
    '<div class="controls" style="justify-content:center">' +
    '<button class="btn primary" onclick="startMemory(memCat)">Jogar de novo</button></div></div>');
}

/* ============ JOGO DE SOLETRAR ============ */
let spellCat = null;
let spellQueue = [];
let spellIdx = 0;
let spellScore = 0;
let spellTotal = 0;
let spellResults = [];

function openSpell() {
  stopEverything();
  view('spell');
  if (!spellCat) spellCat = WORD_CATEGORIES[0].id;
  startSpell(spellCat);
}

function renderSpellSetup(activeId, onClick) {
  const box = $('#spell-cats');
  if (!box) return;
  box.innerHTML = '';
  WORD_CATEGORIES.forEach(c => {
    const b = document.createElement('button');
    b.className = 'cat-pill' + (c.id === activeId ? ' active' : '');
    b.textContent = c.name;
    b.onclick = () => onClick(c.id);
    box.appendChild(b);
  });
}

function startSpell(catId) {
  spellCat = catId;
  const cat = WORD_CATEGORIES.find(c => c.id === catId);
  spellQueue = shuffle(cat.items);
  spellIdx = 0;
  spellScore = 0;
  spellTotal = 0;
  spellResults = [];

  $('#spell-setup').innerHTML = '<div id="spell-cats" style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:14px"></div>';
  renderSpellSetup(catId, id => startSpell(id));

  $('#spell-game').classList.remove('hidden');
  renderSpellRound();
}

function renderSpellRound() {
  if (spellIdx >= spellQueue.length) { endSpell(); return; }
  const it = spellQueue[spellIdx];

  let dots = '<div class="progress-dots">';
  spellQueue.forEach((q, i) => {
    let cls = '';
    if (i < spellIdx) cls = spellResults[i] ? 'ok' : 'bad';
    dots += '<span class="dot ' + cls + '"></span>';
  });
  dots += '</div>';

  $('#spell-game').innerHTML = dots +
    '<div class="spell-stage">' +
    '<div class="big-img">' + it.img + '</div>' +
    '<h3>O que é isso em inglês?</h3>' +
    '<p class="hint-word">' + (it.pt ? 'Dica: ' + it.pt : '') + '</p>' +
    '<input id="spell-inp" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="digite a palavra">' +
    '<div class="controls" style="justify-content:center;margin-top:14px">' +
    '<button class="btn primary" onclick="checkSpell()">Confirmar</button></div>' +
    '<p id="spell-feedback"></p>' +
    '</div>';

  const inp = $('#spell-inp');
  inp.focus();
  inp.addEventListener('keydown', e => { if (e.key === 'Enter') checkSpell(); });
}

function checkSpell() {
  const inp = $('#spell-inp');
  if (!inp || inp.disabled) return;
  const it = spellQueue[spellIdx];
  const ok = norm(inp.value) === norm(it.en);
  spellTotal++;
  if (ok) spellScore++;
  spellResults[spellIdx] = ok;
  spellIdx++;

  inp.disabled = true;
  inp.classList.add(ok ? 'ok' : 'bad');
  $('#spell-feedback').innerHTML = ok
    ? '<p style="color:var(--good)">Correto! ' + it.en + ' = ' + it.pt + '</p>'
    : '<p style="color:var(--bad)">Quase! A palavra é <b>' + it.en + '</b></p>';
  speakEn(ok ? 'Correct! ' + it.en : it.en, 0.8);

  setTimeout(() => renderSpellRound(), ok ? 500 : 1600);
}

function endSpell() {
  const key = 'spell_' + spellCat;
  const best = localStorage.getItem(key);
  const isBest = best === null || spellScore > Number(best);
  if (isBest) localStorage.setItem(key, String(spellScore));

  $('#spell-game').innerHTML =
    '<div class="result">' +
    '<h3>Fim de jogo!</h3>' +
    '<div class="score-big">' + spellScore + '/' + spellTotal + '</div>' +
    '<p>Palavras certas de <b>' + spellTotal + '</b></p>' +
    (isBest ? '<p><b>Novo recorde!</b></p>' : '<p>Recorde: ' + best + '</p>') +
    '<div class="controls" style="justify-content:center">' +
    '<button class="btn primary" onclick="startSpell(spellCat)">Jogar de novo</button></div>' +
    '</div>';
}

/* ============ DICIONÃRIO PESSOAL + repetição espaçada ============ */
const PD_INTERVALS = [0, 1, 3, 7, 14];
let pdict = [];
let pdQuiz = null;

function pdLoad() {
  try { pdict = JSON.parse(localStorage.getItem('PDICT')) || []; } catch (e) { pdict = []; }
}
function pdSave() {
  try { localStorage.setItem('PDICT', JSON.stringify(pdict)); } catch (e) {}
}
function pdDueAt(e) {
  const last = e.lastReview || e.date || Date.now();
  const iv = PD_INTERVALS[Math.min(e.stage || 0, PD_INTERVALS.length - 1)];
  return last + iv * 86400000;
}
function pdIsDue(e) { return pdDueAt(e) <= Date.now(); }
function pdIntervLabel(e) {
  const iv = PD_INTERVALS[Math.min(e.stage || 0, PD_INTERVALS.length - 1)];
  return iv === 0 ? 'nova' : iv + 'd';
}

function openDict() {
  stopEverything();
  view('dict');
  pdLoad();
  pdQuiz = null;
  pdRender();
}

function pdAdd(en, pt, opt) {
  if (!en || !pt) return;
  const trimmed = String(en).trim();
  if (pdict.some(e => normWord(e.en) === normWord(trimmed))) {
    openModal('Já está no dicionário', '<p>A palavra/frase <b>' + trimmed + '</b> já foi salva.</p>');
    return;
  }
  const e = { en: trimmed, pt: String(pt).trim(), img: (opt && opt.img) || '', src: (opt && opt.src) || 'manual', date: Date.now(), stage: 0, lastReview: null, review: 0 };
  pdict.unshift(e);
  pdSave();
  pdRender();
  openModal('Salvo!', '<p><b>' + trimmed + '</b> está no seu dicionário. Revisar com espaçamento faz você nunca esquecer.</p>');
}

function pdRemove(id) {
  pdict.splice(id, 1);
  pdSave();
  pdRender();
}

function pdAddManual() {
  const en = $('#dict-en-inp').value;
  const pt = $('#dict-pt-inp').value;
  const img = $('#dict-img-inp').value;
  pdAdd(en, pt, { img: img || '', src: 'manual' });
}

function pdSaveFromSong(en, pt) {
  pdLoad();
  pdAdd(en, pt, { src: 'musica' });
}

function pdRender() {
  const box = $('#dict-content');
  const due = pdict.filter(pdIsDue);
  const later = pdict.filter(e => !pdIsDue(e));
  let html = '<div class="esc-stage">' +
    '<h3>Meu dicionário pessoal</h3>' +
    '<p class="sub" style="margin-top:0">Cada item é revisado com espaçamento (1d &rarr; 3d &rarr; 7d &rarr; 14d). Acertar avança; errar volta para o começo.</p></div>';

  html += '<div class="controls" style="justify-content:flex-start;flex-wrap:wrap">' +
    '<input id="dict-en-inp" class="yt-input" style="min-width:140px;flex:1" placeholder="Inglês (ex: to figure out)" autocomplete="off">' +
    '<input id="dict-pt-inp" class="yt-input" style="min-width:140px;flex:1" placeholder="Português (ex: descobrir)" autocomplete="off">' +
    '<input id="dict-img-inp" class="yt-input" style="max-width:120px" placeholder="emoji (opcional)">' +
    '<button class="btn primary" onclick="pdAddManual()">Salvar</button>' +
    '</div>';

  html += '<div class="controls" style="justify-content:center;margin:10px 0">' +
    '<button class="btn primary" onclick="pdStartQuiz(' + due.length + ')"' + (due.length ? '' : ' disabled') + '>Revisar agora (' + due.length + ')</button>' +
    '</div>';

  if (due.length) {
    html += '<h4>Para revisar hoje <span class="lvl-beginner">' + due.length + '</span></h4><div class="pd-list">';
    due.forEach((e, i) => { html += pdRow(e, i, true); });
    html += '</div>';
  }
  if (later.length) {
    html += '<h4>Revisadas — voltam em breve</h4><div class="pd-list">';
    later.forEach((e, i) => { const rid = pdict.indexOf(e); html += pdRow(e, rid, false); });
    html += '</div>';
  }
  if (!pdict.length) {
    html += '<p class="sub" style="text-align:center;margin-top:14px">Seu dicionário está vazio. No Modo Aprender, clique em "<b>salvar</b>" em qualquer frase da música — ou adicione manualmente acima.</p>';
  }

  box.innerHTML = html;
}

function pdRow(e, id, isDue) {
  return '<div class="pd-row">' +
    '<span class="pd-img">' + (e.img || '\ud83d\udcd6') + '</span>' +
    '<span class="pd-en" onclick="speakEn(\'' + e.en.replace(/'/g, "\\'") + '\')">' + e.en + '</span>' +
    '<span class="pd-pt">= ' + e.pt + '</span>' +
    '<span class="pd-interv">' + pdIntervLabel(e) + (e.review ? ' &middot; revisado ' + e.review + 'x' : '') + '</span>' +
    '<button class="btn ghost tiny" onclick="speakEn(\'' + e.en.replace(/'/g, "\\'") + '\')">\ud83d\udd0a</button>' +
    '<button class="btn ghost tiny" onclick="pdRemove(' + id + ')">\ud83d\uddd1</button>' +
    '</div>';
}

function pdStartQuiz(n) {
  pdLoad();
  const due = pdict.filter(pdIsDue);
  if (!due.length) return;
  pdQuiz = { qs: pdShuffle(due.slice()), i: 0, ok: 0, total: due.length };
  pdNextQ();
}

function pdShuffle(a) {
  const r = a.slice();
  for (let i = r.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const t = r[i]; r[i] = r[j]; r[j] = t;
  }
  return r;
}

function pdNextQ() {
  const Q = pdQuiz;
  if (!Q || Q.i >= Q.qs.length) { pdEnd(); return; }
  const e = Q.qs[Q.i];
  Q.i++;
  Q.cur = e;
  const others = pdict.filter(x => x !== e).map(x => x.pt);
  const opts = new Set([e.pt]);
  let guard = 0;
  while (opts.size < 4 && guard++ < 50 && others.length) {
    opts.add(others[Math.floor(Math.random() * others.length)]);
  }
  // garante pelo menos 2 opções
  while (opts.size < 2) {
    const rnd = others[Math.floor(Math.random() * others.length)];
    if (rnd && !opts.has(rnd)) opts.add(rnd);
  }
  const options = pdShuffle([...opts]);
  const box = $('#dict-content');
  let html = '<p class="sync-bar">Revisão &middot; <b>' + Q.i + '</b>/' + Q.qs.length + ' &middot; certas: <b>' + Q.ok + '</b></p>';
  html += '<div class="esc-stage">';
  html += '<p class="esc-label">O que significa em português?</p>';
  html += '<div class="abc-question" style="font-size:1.5rem;letter-spacing:0">' + (e.img ? e.img + ' ' : '') + e.en + '</div>';
  html += '<div class="controls"><button class="btn tiny" onclick="speakEn(' + abQ(e.en) + ')">\ud83d\udd0a Ouvir</button></div>';
  html += '<div class="controls abc-opts" style="flex-wrap:wrap">';
  options.forEach(op => {
    html += '<button class="btn ghost abc-opt" onclick="pdAnswer(' + abQ(op) + ')">' + op + '</button>';
  });
  html += '</div></div>';
  box.innerHTML = html;
}

function pdAnswer(op) {
  const Q = pdQuiz;
  if (!Q || !Q.cur) return;
  const e = Q.cur;
  const certa = op === e.pt;
  if (certa) {
    Q.ok++;
    e.stage = Math.min((e.stage || 0) + 1, PD_INTERVALS.length - 1);
  } else {
    e.stage = 0;
  }
  e.lastReview = Date.now();
  e.review = (e.review || 0) + 1;
  pdSave();
  const box = $('#dict-content');
  let html = '<p class="sync-bar">Revisão &middot; certas: <b>' + Q.ok + '</b></p>';
  html += '<div class="esc-stage">';
  if (certa) {
    html += '<p class="esc-score" style="background:rgba(34,197,94,0.15)"><b>Acertou! \u2705</b> "' + e.en + '" = "' + e.pt + '"</p>';
    html += '<p class="supp">Próxima revisão: <b>' + pdIntervLabel(e) + '</b></p>';
  } else {
    html += '<p class="esc-score" style="background:rgba(239,68,68,0.15)"><b>Errou \u274c</b> "' + e.en + '" = "<b>' + e.pt + '</b>"</p>';
    html += '<p class="supp">Sem problema: voltou para o começo da fila (revisão em 0d).</p>';
  }
  html += '<div class="controls"><button class="btn primary" onclick="pdNextQ()">' +
    (Q.i >= Q.qs.length ? 'Ver resultado' : 'Próxima') + '</button></div>';
  html += '</div>';
  box.innerHTML = html;
}


/* ============================================================
   SISTEMA DE PROGRESSAO (9 niveis) - errar volta ao Nivel 1
   ============================================================ */
const LEVEL_PLAN = [
  { key: 'alfabeto',       name: 'Alfabeto e Sons' },
  { key: 'vogais',         name: 'Vogais e Consoantes' },
  { key: 'artigos',        name: 'Artigo THE' },
  { key: 'aan',            name: 'A e AN' },
  { key: 'pronomes',       name: 'Pronomes Pessoais' },
  { key: 'possessivos',    name: 'Possessivos e Demonstrativos' },
  { key: 'verbos',         name: 'Verbos Essenciais' },
  { key: 'adjetivos',      name: 'Adjetivos e Nomes do Mundo' },
  { key: 'perguntas',      name: 'Perguntas Wh-' }
];

let englishProgress = {
  level: 1,
  completed: [],
  certificateEarned: false
};

function saveEnglishProgress() {
  try { localStorage.setItem('EN_PROGRESS', JSON.stringify(englishProgress)); } catch (e) {}
}

function loadEnglishProgress() {
  try {
    const p = JSON.parse(localStorage.getItem('EN_PROGRESS'));
    if (p && typeof p.level === 'number') {
      englishProgress = {
        level: p.level || 1,
        completed: p.completed || [],
        certificateEarned: !!p.certificateEarned
      };
    }
  } catch (e) {}
}

function levelLessonKey(level) {
  const plan = LEVEL_PLAN[Math.min(level, LEVEL_PLAN.length) - 1];
  return plan ? plan.key : null;
}

function updateProgressDisplay() {
  const total = LEVEL_PLAN.length;
  const lv = Math.min(Math.max(englishProgress.level || 1, 1), total);
  const plan = LEVEL_PLAN[lv - 1];
  const blockEl = document.getElementById('progress-block');
  const levelEl = document.getElementById('progress-level');
  const barEl = document.getElementById('progress-bar');
  const gb = document.getElementById('grad-block');
  const gl = document.getElementById('grad-level');
  const gbar = document.getElementById('grad-bar');
  const saida = (gradFase === 2 ? 'Fase 2 Gradua\u00e7\u00e3o \u00b7 ' : '') + 'Nivel ' + lv + '/' + total + ' - ' + plan.name;
  const saida2 = englishProgress.certificateEarned
    ? 'Certificado conquistado!'
    : 'Concluidos: ' + englishProgress.completed.length + '/' + total;
  const w = Math.round(englishProgress.completed.length / total * 100) + '%';
  if (blockEl) blockEl.innerText = saida;
  if (gb) gb.innerText = saida;
  if (levelEl) levelEl.innerText = saida2;
  if (gl) gl.innerText = saida2;
  if (barEl) barEl.style.width = w;
  if (gbar) gbar.style.width = w;
}

function resetToLevel1() {
  englishProgress.level = 1;
  englishProgress.completed = [];
  saveEnglishProgress();
  updateProgressDisplay();
}

function advanceLevel() {
  const lv = Math.min(englishProgress.level, LEVEL_PLAN.length);
  if (englishProgress.completed.indexOf(lv) < 0) englishProgress.completed.push(lv);
  if (lv >= LEVEL_PLAN.length) {
    englishProgress.certificateEarned = true;
    saveEnglishProgress();
    updateProgressDisplay();
    earnCertificate();
    return;
  }
  englishProgress.level = lv + 1;
  saveEnglishProgress();
  updateProgressDisplay();
  showLevelNext(englishProgress.level);
}

function earnCertificate() {
  const modal = document.getElementById('certificate-modal');
  const fs = document.getElementById('final-score');
  const ct = document.getElementById('certificate-text');
  if (fs) fs.innerText = 'Parabens! Voce completou os ' + LEVEL_PLAN.length + ' niveis do ingles basico!';
  if (ct) ct.innerHTML =
    '<h3>Certificado Basico de Ingles</h3>' +
    '<p>Voce dominou os fundamentos do ingles basico:</p>' +
    '<ul style="text-align:left;margin:8px 0 8px 18px">' +
      '<li>Alfabeto, vogais e consoantes</li>' +
      '<li>Artigos (the, a, an)</li>' +
      '<li>Pronomes pessoais (I, you, he, she, it, we, they)</li>' +
      '<li>Possessivos e demonstrativos (my, your, this, that)</li>' +
      '<li>Verbos essenciais (to be, like, want, love, have)</li>' +
      '<li>Adjetivos e nomes do mundo</li>' +
      '<li>Perguntas Wh- (what, where, who, why, how)</li>' +
    '</ul>' +
    '<p>Continue praticando para nao esquecer!</p>';
  if (modal) modal.classList.remove('hidden');
}

function showLevelStart(level) {
  const box = document.getElementById('level-start-box');
  if (!box) return;
  const plan = LEVEL_PLAN[Math.min(level, LEVEL_PLAN.length) - 1];
  box.innerHTML =
    '<h3>Nivel ' + level + ' de ' + LEVEL_PLAN.length + '</h3>' +
    '<p>Bloco: <b>' + plan.name + '</b></p>' +
    '<p>Acertar 100% leva para a proxima fase. <b>Um unico erro volta ao Nivel 1</b> e o teste para na hora.</p>' +
    '<div class="controls" style="justify-content:center">' +
    '<button class="btn primary" onclick="startLevel()">Come\u00e7ar o quiz</button>' +
    '<button class="btn ghost" onclick="document.getElementById(\'level-start-modal\').classList.add(\'hidden\')">Agora nao</button>' +
    '</div>';
  document.getElementById('level-start-modal').classList.remove('hidden');
}

function showLevelNext(level) {
  const box = document.getElementById('level-start-box');
  if (!box) return;
  const plan = LEVEL_PLAN[Math.min(level, LEVEL_PLAN.length) - 1];
  box.innerHTML =
    '<h3>Fase conclu\u00edda! \ud83c\udf89</h3>' +
    '<p>N\u00edvel <b>' + level + ' de ' + LEVEL_PLAN.length + '</b>: <b>' + plan.name + '</b> liberado.</p>' +
    '<p>Continuar a Gradua\u00e7\u00e3o leva direto para o pr\u00f3ximo n\u00edvel.</p>' +
    '<div class="controls" style="justify-content:center">' +
    '<button class="btn primary" onclick="startLevel()">Pr\u00f3ximo n\u00edvel</button>' +
    '<button class="btn ghost" onclick="document.getElementById(\'level-start-modal\').classList.add(\'hidden\')">Agora n\u00e3o</button>' +
    '</div>';
  document.getElementById('level-start-modal').classList.remove('hidden');
}

function startLevel() {
  document.getElementById('level-start-modal').classList.add('hidden');
  const key = levelLessonKey(englishProgress.level);
  if (!key) return;
  openBasico();
  abOpen(key);
  gradMode = true;
}

function onQuizResult(pct) {
  if (pct === 100) {
    advanceLevel();
    return;
  }
  resetToLevel1();
  showLevelFail();
}

function graduationFail() {
  resetToLevel1();
  updateProgressDisplay();
  showLevelFail();
}

function showLevelFail() {
  const box = document.getElementById('level-start-box');
  if (!box) return;
  box.innerHTML =
    '<h3>Voltou ao N\u00edvel 1</h3>' +
    '<p>Voc\u00ea errou e o teste parou por aqui. O m\u00e9todo exige 100% de acerto para avancar \u2014 refor\u00e7ar o come\u00e7o faz parte da Gradua\u00e7\u00e3o.</p>' +
    '<div class="controls" style="justify-content:center">' +
    '<button class="btn primary" onclick="returnToStart()">Entendi</button>' +
    '</div>';
  document.getElementById('level-start-modal').classList.remove('hidden');
}

function returnToStart() {
  document.getElementById('level-start-modal').classList.add('hidden');
  startLevel();
}

function initProgress() {
  loadEnglishProgress();
  const f = Number(localStorage.getItem('EN_GRADFASE') || '1');
  gradFase = (f === 2) ? 2 : 1;
  updateProgressDisplay();
}

function saveGradFase() {
  try { localStorage.setItem('EN_GRADFASE', String(gradFase)); } catch (e) {}
}

function faseTab(n) {
  gradFase = (n === 2) ? 2 : 1;
  saveGradFase();
  const b1 = document.getElementById('grad-fase-1');
  const b2 = document.getElementById('grad-fase-2');
  if (b1) b1.classList.toggle('active', gradFase === 1);
  if (b2) b2.classList.toggle('active', gradFase === 2);
  updateProgressDisplay();
  renderGradList();
}

/* ============ MODO GRADUACAO (aba propria) ============ */
function openGraduacao() {
  stopEverything();
  view('graduacao');
  const b1 = document.getElementById('grad-fase-1');
  const b2 = document.getElementById('grad-fase-2');
  if (b1) b1.classList.toggle('active', gradFase === 1);
  if (b2) b2.classList.toggle('active', gradFase === 2);
  renderGradList();
  updateProgressDisplay();
}

function renderGradList() {
  const c = document.getElementById('grad-list');
  if (!c) return;
  const total = LEVEL_PLAN.length;
  const cur = Math.min(Math.max(englishProgress.level || 1, 1), total);
  let html = '';
  for (let i = 1; i <= total; i++) {
    const done = englishProgress.completed.indexOf(i) >= 0;
    const isCur = i === cur;
    const unlocked = i === 1 || done || englishProgress.completed.indexOf(i - 1) >= 0;
    const st = done ? 'done' : (isCur ? 'cur' : 'lock');
    html += '<button class="grad-item st-' + st + '" onclick="gradPick(' + i + ')"' + (unlocked ? '' : ' disabled') + '>' +
      '<span class="grad-num">' + i + '</span>' +
      '<span class="grad-name">' + LEVEL_PLAN[i - 1].name + '</span>' +
      '<span class="grad-tag">' + (done ? '\u2713' : (isCur ? '\u25b6' : '')) + '</span>' +
      '</button>';
  }
  c.innerHTML = html;
}

function gradPick(level) {
  const total = LEVEL_PLAN.length;
  const cur = Math.min(Math.max(englishProgress.level || 1, 1), total);
  const unlocked = level === 1 || englishProgress.completed.indexOf(level) >= 0 ||
    englishProgress.completed.indexOf(level - 1) >= 0;
  if (level !== cur && !unlocked) return;
  if (level !== cur) {
    englishProgress.level = level;
    saveEnglishProgress();
    updateProgressDisplay();
    renderGradList();
  }
  showLevelStart(level);
}

function gradStartCurrent() {
  const cur = Math.min(Math.max(englishProgress.level || 1, 1), LEVEL_PLAN.length);
  showLevelStart(cur);
}

document.addEventListener('DOMContentLoaded', initProgress);

function pdEnd() {
  const Q = pdQuiz;
  if (!Q) return;
  const pct = Math.round(Q.ok / Q.qs.length * 100);
  $('#dict-content').innerHTML =
    '<div class="esc-stage esc-done">' +
    '<p class="esc-emojis">' + (pct === 100 ? '\ud83c\udf89' : (pct >= 50 ? '\ud83d\udc4f' : '\ud83d\udc4d')) + '</p>' +
    '<h3>Revisão feita: ' + Q.ok + ' de ' + Q.qs.length + '</h3>' +
    '<p class="score-big">' + pct + '%</p>' +
    '<p class="sub">As que você acertou só voltam daqui a alguns dias. As que errou voltam logo -- é assim que a memória fixa.</p>' +
    '<div class="controls" style="justify-content:center">' +
    '<button class="btn primary" onclick="openDict()">Voltar ao dicionário</button>' +
    '</div></div>';
}

let teacherStats = {
  abcQuizzes: Number(localStorage.getItem('teacher_abc') || 0),
  inicianteMusicas: Number(localStorage.getItem('teacher_iniciante') || 0),
  escutaSessoes: Number(localStorage.getItem('teacher_escuta') || 0),
  dicSalvos: Number(localStorage.getItem('teacher_dic') || 0)
};

function openTeacher() {
  stopEverything();
  view('teacher');
  teacherStats.abcQuizzes = Number(localStorage.getItem('teacher_abc') || 0);
  teacherStats.inicianteMusicas = Number(localStorage.getItem('teacher_iniciante') || 0);
  teacherStats.escutaSessoes = Number(localStorage.getItem('teacher_escuta') || 0);
  teacherStats.dicSalvos = Number(localStorage.getItem('teacher_dic') || 0);
  $('#teacher-resumo').innerHTML =
    '<p><b>Progresso atual:</b></p>' +
    '<ul style="margin:6px 0 0; padding-left:18px">' +
    '<li>Alfabetos no quiz: ' + teacherStats.abcQuizzes + '</li>' +
    '<li>Músicas iniciantes ouvidas: ' + teacherStats.inicianteMusicas + '</li>' +
    '<li>Frases ouvidas no Escuta: ' + teacherStats.escutaSessoes + '</li>' +
    '<li>Palavras no Dicionário: ' + teacherStats.dicSalvos + '</li>' +
    '</ul>';
  renderTeacherOpts();
}

function renderTeacherOpts() {
  const box = $('#teacher-resumo');
  // Already rendered inside openTeacher, just ensure buttons are visible
}

function teacherPath(p) {
  closeTeacher();
  view('home'); // return home first
  switch (p) {
    case 'abc':
      openBasico();
      break;
    case 'iniciante':
      // Already home has beginner box; just show a hint
      openModal('Músicas Iniciante', '<p>Clique na caixa "Nível Iniciante" no topo e depois em qualquer atalho para ouvir músicas com pronúncia clara. Ótimo para começar do zero!</p>');
      break;
    case 'escuta':
      openEscuta();
      break;
    case 'dic':
      openDict();
      break;
  }
}

function closeTeacher() {
  view('home');
}

function saveTeacherStat(path) {
  switch (path) {
    case 'abc': localStorage.setItem('teacher_abc', String(++teacherStats.abcQuizzes)); break;
    case 'iniciante': localStorage.setItem('teacher_iniciante', String(++teacherStats.inicianteMusicas)); break;
    case 'escuta': localStorage.setItem('teacher_escuta', String(++teacherStats.escutaSessoes)); break;
    case 'dic': localStorage.setItem('teacher_dic', String(++teacherStats.dicSalvos)); break;
  }
  teacherStats = {
    abcQuizzes: Number(localStorage.getItem('teacher_abc') || 0),
    inicianteMusicas: Number(localStorage.getItem('teacher_iniciante') || 0),
    escutaSessoes: Number(localStorage.getItem('teacher_escuta') || 0),
    dicSalvos: Number(localStorage.getItem('teacher_dic') || 0)
  };
}

/* ============ recordes (home) ============ */
function renderStats() {
  let bestMem = null, bestDict = 0, bestSpell = 0;
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    const v = Number(localStorage.getItem(k));
    if (k.indexOf('mem_') === 0 && (bestMem === null || v < bestMem)) bestMem = v;
    if (k.indexOf('dic_') === 0 && v > bestDict) bestDict = v;
    if (k.indexOf('spell_') === 0 && v > bestSpell) bestSpell = v;
  }
  $('#stats-bar').innerHTML =
    '<div class="stat"><b>' + (bestMem === null ? '--' : bestMem + 's') + '</b><span>Melhor tempo memória</span></div>' +
    '<div class="stat"><b>' + bestDict + '%</b><span>Melhor ditado</span></div>' +
    '<div class="stat"><b>' + bestSpell + ' pts</b><span>Melhor soletração</span></div>';
}

/* boot */
pdLoad();
renderBeginnerQuick();
renderStats();
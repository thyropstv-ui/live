/* Cabeçalho, rodapé, avisos e dados compartilhados por todas as páginas. */
const PAGINAS = [
  ["index.html", "Início"],
  ["placar.html", "Placar"],
  ["jogos.html", "Jogos"],
  ["guia.html", "Guia"],
  ["agenda.html", "Agenda"],
  ["vozes.html", "Vozes"],
  ["memes.html", "Memes"],
];

const CANAIS = {
  twitch: ["Twitch", "https://www.twitch.tv/thyrops"],
  kick: ["Kick", "https://kick.com/thyrops"],
  youtube: ["YouTube", "https://www.youtube.com/@thyrops"],
  instagram: ["Instagram", "https://www.instagram.com/thyrops/"],
  ra: ["RetroAchievements", "https://retroachievements.org/user/Thyrops"],
};
const RA_PROGRESSO = "https://retroachievements.org/user/Thyrops/progress?filter%5Bsystem%5D=0&filter%5Bstatus%5D=gte-completed";

function botoesCanais(chaves) {
  return chaves.map(k => '<a class="botao botao--sec canal" href="' + CANAIS[k][1] + '" target="_blank" rel="noopener">' + CANAIS[k][0] + "</a>").join("");
}

const qs = (s, r) => (r || document).querySelector(s);
const qsa = (s, r) => [...(r || document).querySelectorAll(s)];
const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

function montaCabecalho() {
  const topo = qs("#topo");
  if (!topo) return;
  const atual = document.body.dataset.pagina;
  topo.className = "topo";
  topo.innerHTML =
    '<a class="marca" href="index.html" aria-label="Thyrops Live, início"><img src="assets/logo.png" alt="Thyrops Live" width="152" height="92"></a>' +
    '<nav class="nav-abas" aria-label="Páginas">' +
    PAGINAS.map(p => '<a class="aba" href="' + p[0] + '"' + (p[0] === atual ? ' aria-current="page"' : "") + ">" + p[1] + "</a>").join("") +
    "</nav>";
}

function montaRodape() {
  const r = qs("#rodape");
  if (!r) return;

  const ehVozes =
    /(?:^|\/)vozes(?:\.html)?(?:$|[?#])/i.test(window.location.pathname) ||
    document.body.dataset.pagina === "vozes";

  const avisoVozes = ehVozes
    ? '<p class="aviso">Projeto não oficial. As vozes e amostras pertencem aos seus criadores no Fish Audio. Não use para enganar ou se passar por pessoas reais.</p>'
    : "";

  r.className = "rodape";
  r.innerHTML =
    '<div class="temas" role="group" aria-label="Cor do site"><span>Cor do site</span></div>' +
    '<div class="canais">' + botoesCanais(["twitch", "kick", "youtube", "instagram"]) + "</div>" +
    avisoVozes;

  const box = qs(".temas", r);
  Tema.lista.forEach(t => {
    const b = document.createElement("button");
    b.type = "button"; b.className = "tema-bola"; b.title = t[1]; b.setAttribute("aria-label", "Tema " + t[1]);
    b.dataset.t = t[0];
    b.style.background = "linear-gradient(135deg," + t[2] + "," + t[3] + ")";
    b.setAttribute("aria-pressed", String(Tema.atual() === t[0]));
    b.onclick = () => { Tema.troca(t[0]); qsa(".tema-bola", box).forEach(x => x.setAttribute("aria-pressed", String(x.dataset.t === t[0]))); };
    box.appendChild(b);
  });
}

function toast(t) {
  let el = qs("#toast");
  if (!el) { el = document.createElement("div"); el.id = "toast"; el.setAttribute("role", "status"); el.setAttribute("aria-live", "polite"); document.body.appendChild(el); }
  el.textContent = t; el.classList.add("show");
  clearTimeout(toast.t); toast.t = setTimeout(() => el.classList.remove("show"), 1600);
}

async function copiar(t) {
  try { await navigator.clipboard.writeText(t); return true; }
  catch (e) {
    try {
      const x = document.createElement("textarea");
      x.value = t; x.style.cssText = "position:fixed;opacity:0";
      document.body.appendChild(x); x.select();
      const ok = document.execCommand("copy"); x.remove(); return ok;
    } catch (_) { return false; }
  }
}

async function carregaJson(arquivo) {
  const r = await fetch(arquivo + "?_=" + Date.now());
  if (!r.ok) throw new Error(arquivo + " " + r.status);
  return r.json();
}
/* dados.json (você edita) + auto.json (gerado pela automação do GitHub; se existir, tem prioridade) */
async function carregaDados() {
  const d = await carregaJson("dados.json");
  let a = null;
  try { a = await carregaJson("auto.json"); } catch (e) {}
  d.auto = a;
  if (a) {
    if (a.placar && a.placar.consoles && a.placar.consoles.length) { d.placar = a.placar; d.exemplo = false; }
    if (a.guia) {
      if (a.guia.playlists && a.guia.playlists.length) d.guia.playlists = a.guia.playlists;
      if (a.guia.gameplay && a.guia.gameplay.length) d.guia.gameplay = a.guia.gameplay;
      if (a.guia.shorts && a.guia.shorts.length) d.guia.shorts = a.guia.shorts;
    }
    if (a.ultimoShort) d.ultimoShort = a.ultimoShort;
    if (a.gameplayAtual) d.gameplayAtual = a.gameplayAtual;
  }
  return d;
}

/* Próxima live: 1) ao vivo / agendada no YouTube (auto.json)  2) calendário semanal do dados.json */
const NOMES_DIA = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];
function proximaLive(d) {
  const agora = Date.now(), ag = d.agenda, dur = (ag.duracaoHoras || 4) * 3600e3, a = d.auto;
  if (a && a.atualizado) {
    const idade = agora - Date.parse(a.atualizado);
    if (idade < 4 * 3600e3 && a.aoVivo) return { t: agora, aoVivo: true, titulo: a.aoVivo.titulo, fonte: "youtube", id: a.aoVivo.id };
    if (a.proxima) {
      const t = Date.parse(a.proxima.inicio);
      if (t + dur > agora) return { t, titulo: a.proxima.titulo, fonte: "youtube", id: a.proxima.id };
    }
  }
  const off = 3 * 3600e3, b = new Date(agora - off);
  let melhor = null;
  for (let i = -1; i <= 7; i++) {
    const dt = new Date(Date.UTC(b.getUTCFullYear(), b.getUTCMonth(), b.getUTCDate() + i));
    ag.lives.forEach(l => {
      if (l.dia !== dt.getUTCDay()) return;
      const [h, m] = l.hora.split(":").map(Number);
      const t = Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth(), dt.getUTCDate(), h, m) + off;
      if (t + dur <= agora) return;
      if (!melhor || t < melhor.t) melhor = { t, titulo: l.titulo, fonte: "calendario", dia: l.dia, hora: l.hora };
    });
  }
  return melhor;
}
function iniciaContagem(d, el, q, loc) {
  const fmtLocal = t => new Intl.DateTimeFormat("pt-BR", { weekday: "long", hour: "2-digit", minute: "2-digit" }).format(new Date(t));
  function tic() {
    const p = proximaLive(d);
    if (!p) { el.textContent = "--"; q.textContent = "Sem lives marcadas."; if (loc) loc.textContent = ""; return; }
    const falta = p.t - Date.now();
    const origem = p.fonte === "youtube" ? "agendada no YouTube" : "calendário fixo";
    if (loc) loc.textContent = "No seu horário: " + fmtLocal(p.t) + " · " + origem;
    if (falta <= 0) { el.innerHTML = '<span class="aovivo">AO VIVO</span>'; q.textContent = p.titulo || ""; return; }
    const s = Math.floor(falta / 1000), dd = Math.floor(s / 86400), h = Math.floor(s % 86400 / 3600), m = Math.floor(s % 3600 / 60), sg = s % 60;
    el.textContent = (dd ? dd + "d " : "") + String(h).padStart(2, "0") + ":" + String(m).padStart(2, "0") + ":" + String(sg).padStart(2, "0");
    const brt = new Date(p.t - 3 * 3600e3);
    q.textContent = NOMES_DIA[brt.getUTCDay()] + ", " + String(brt.getUTCHours()).padStart(2, "0") + ":" + String(brt.getUTCMinutes()).padStart(2, "0") + " (Brasília)" + (p.titulo ? " · " + p.titulo : "");
  }
  tic(); setInterval(tic, 1000);
}

/* faixa avisando que os números ainda são de exemplo */
function avisoExemplo(dados, onde) {
  if (!dados || !dados.exemplo) return;
  const d = document.createElement("div");
  d.className = "aviso-exemplo";
  d.innerHTML = "<b>Dados de exemplo.</b> Edite o <code>dados.json</code> com os seus números e links reais e mude <code>\"exemplo\"</code> para <code>false</code> para esta faixa sumir.";
  (onde || qs("main")).prepend(d);
}

function erroCarga(onde, msg) {
  onde.innerHTML = '<div class="vazio"><p>' + esc(msg) + "</p></div>";
}

/* número que sobe até o valor (respeita "reduzir movimento") */
function contaAte(el, alvo) {
  const quieto = matchMedia("(prefers-reduced-motion:reduce)").matches;
  if (quieto || alvo < 2) { el.textContent = alvo; return; }
  const t0 = performance.now(), dur = 900;
  const passo = t => {
    const k = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - k, 3);
    el.textContent = Math.round(alvo * e);
    if (k < 1) requestAnimationFrame(passo);
  };
  requestAnimationFrame(passo);
}

/* ---------- horizontal x vertical: duas linhas lado a lado ---------- */
function quandoBRT(t) {
  const b = new Date(t - 3 * 3600e3);
  return NOMES_DIA[b.getUTCDay()] + ", " + String(b.getUTCHours()).padStart(2, "0") + ":" + String(b.getUTCMinutes()).padStart(2, "0") + " (Brasília)";
}
function montaFormatos(d, el) {
  if (!el) return;
  const a = d.auto, agora = Date.now(), dur = ((d.agenda && d.agenda.duracaoHoras) || 4) * 3600e3;
  const fresco = !!(a && a.atualizado && agora - Date.parse(a.atualizado) < 4 * 3600e3);
  const watch = id => "https://www.youtube.com/watch?v=" + encodeURIComponent(id);
  const linha = (cls, rot, sub, txt, id, vivo) =>
    '<div class="fmt ' + cls + '"><div class="fmt-r"><b>' + rot + "</b><span>" + sub + '</span></div><div class="fmt-t">' + (vivo ? '<span class="aovivo">AO VIVO</span> ' : "") + txt + "</div>" +
    (id ? '<a class="botao botao--sec" href="' + watch(id) + '" target="_blank" rel="noopener">' + (vivo ? "Assistir agora" : "Ver no YouTube") + "</a>" : "") + "</div>";

  // horizontal = principal (YouTube, ou calendário fixo quando não há live agendada)
  const p = proximaLive(d);
  let h;
  if (!p) h = linha("fh", "Horizontal", "principal", "Sem live marcada.", "", false);
  else if (p.fonte === "youtube") h = linha("fh", "Horizontal", "principal", p.aoVivo || p.t <= agora ? "No ar agora" : quandoBRT(p.t), p.id, p.aoVivo || p.t <= agora);
  else h = linha("fh", "Horizontal", "principal", quandoBRT(p.t) + ' <small>(o link aparece quando a live for agendada no YouTube)</small>', "", false);

  // vertical = versão para celular, separada
  let v;
  if (fresco && a.aoVivoVertical) v = linha("fv", "Vertical", "para celular", "No ar agora", a.aoVivoVertical.id, true);
  else if (fresco && a.proximaVertical && Date.parse(a.proximaVertical.inicio) + dur > agora) {
    const t = Date.parse(a.proximaVertical.inicio);
    v = linha("fv", "Vertical", "para celular", t <= agora ? "No ar agora" : quandoBRT(t), a.proximaVertical.id, t <= agora);
  } else v = linha("fv", "Vertical", "para celular", "Sem live vertical agendada.", "", false);

  el.innerHTML = '<p class="fmt-aviso">A live <b>horizontal</b> é a principal. A <b>vertical</b> é a mesma live em formato de celular, em outro link.</p>' + h + v;
}

/* ---------- tempo e vídeos do YouTube (carregam só quando clica) ---------- */
function fmtTempo(seg) {
  if (!seg || seg < 60) return "";
  const h = Math.floor(seg / 3600), m = Math.round(seg % 3600 / 60);
  return h ? h + "h" + (m ? String(m).padStart(2, "0") : "") : m + " min";
}
const SVG_PLAY = '<svg viewBox="0 0 24 24" width="22" height="22" fill="#fff" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>';
function videoLazy(o) {   // o: {id, lista, titulo, vertical}
  const thumb = o.id ? '<img loading="lazy" alt="" src="https://i.ytimg.com/vi/' + encodeURIComponent(o.id) + '/hqdefault.jpg">' : "";
  return '<button type="button" class="vid' + (o.vertical ? " vert" : "") + '" data-id="' + esc(o.id || "") + '" data-lista="' + esc(o.lista || "") + '" aria-label="Assistir ' + esc(o.titulo || "vídeo") + '">' +
    thumb + '<span class="pl">' + SVG_PLAY + "</span></button>";
}
function ativaVideos(raiz) {
  qsa(".vid", raiz).forEach(b => b.onclick = () => {
    if (b.classList.contains("on")) return;
    const src = b.dataset.lista
      ? "https://www.youtube-nocookie.com/embed/videoseries?list=" + encodeURIComponent(b.dataset.lista) + "&autoplay=1&rel=0&playsinline=1"
      : "https://www.youtube-nocookie.com/embed/" + encodeURIComponent(b.dataset.id) + "?autoplay=1&rel=0&playsinline=1";
    b.classList.add("on");
    b.insertAdjacentHTML("beforeend", '<iframe title="Vídeo" src="' + src + '" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen></iframe>');
  });
}
function listaDe(url) { try { return new URL(url).searchParams.get("list") || ""; } catch (e) { return ""; } }

/* bloco "Em destaque": último short do guia + gameplay da vez */
function montaDestaques(d, el) {
  const sh = d.ultimoShort || (d.guia.shorts && d.guia.shorts[0]);
  const gp = d.gameplayAtual;
  if (!sh && !gp) { el.hidden = true; return; }
  let h = "";
  if (sh) h += '<div class="dest dest-short"><div class="rotulo">Último short do guia</div>' + videoLazy({ id: sh.id, titulo: sh.titulo, vertical: true }) +
    '<div class="dest-t">' + esc(sh.titulo) + "</div></div>";
  if (gp) {
    const j = gp.jogo;
    const info = j ? '<div class="dest-jogo">' + (j.imagem ? '<img alt="" src="' + esc(j.imagem) + '">' : "") + '<div><b>' + esc(j.titulo) + "</b><span>" + esc(j.console) + (j.conquistas ? " · " + j.ganhas + "/" + j.conquistas + " conquistas" : "") + "</span></div></div>" : "";
    h += '<div class="dest dest-game"><div class="rotulo">Gameplay da vez</div>' + videoLazy({ id: gp.id, titulo: gp.titulo }) + info +
      '<div class="dest-t">' + esc(gp.titulo) + "</div></div>";
  }
  el.innerHTML = h; ativaVideos(el);
}

document.addEventListener("DOMContentLoaded", () => { montaCabecalho(); montaRodape(); });

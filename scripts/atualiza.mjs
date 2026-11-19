// Atualiza auto.json (placar do RetroAchievements, playlists, shorts e live do YouTube) e memes.json.
// Roda no GitHub Actions. Cada parte é independente: se uma falha, as outras seguem e o valor antigo é mantido.
import { readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs";

const RA_USER = "Thyrops";
const CANAL = "UCf_GuhprPz2P2VKSOQNGVBQ";
const RA_KEY = process.env.RA_API_KEY || "";
const YT_KEY = process.env.YT_API_KEY || "";
const BASE = process.env.SITE_DIR || ".";

const lerJson = (f, padrao) => { try { return JSON.parse(readFileSync(`${BASE}/${f}`, "utf8")); } catch { return padrao; } };
const norm = s => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const API = process.env.API_OVERRIDE || "";   // só para testes locais
async function get(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`HTTP ${r.status} em ${url.replace(/(key|y)=[^&]+/g, "$1=***")}`);
  return r.json();
}

const SIGLAS = {
  "nintendo 64": "N64", "playstation": "PS1", "game boy advance": "GBA", "game boy color": "GBC", "game boy": "GB",
  "mega drive": "MD", "genesis/mega drive": "MD", "snes/super famicom": "SNES", "nes/famicom": "NES",
  "master system": "SMS", "sega saturn": "SAT", "dreamcast": "DC", "playstation 2": "PS2", "psp": "PSP",
  "nintendo ds": "NDS", "neo geo pocket": "NGP", "atari 2600": "2600", "pc engine/turbografx-16": "PCE",
};
const sigla = c => SIGLAS[norm(c)] || c.split(/\s+/).map(p => p[0]).join("").toUpperCase().slice(0, 4);
const ORDEM_CONSOLES = Object.keys(SIGLAS);

const antigo = lerJson("auto.json", {});
const auto = { ...antigo };
const avisos = [];

/* ---------------- RetroAchievements ---------------- */
const RA = `${API || "https://retroachievements.org"}/API`;
const raGet = (rota, q) => get(`${RA}/${rota}?y=${RA_KEY}&${q}`);
const dormir = ms => new Promise(r => setTimeout(r, ms));
const IMG_RA = "https://media.retroachievements.org";
const MAX_DETALHES = 80;          // chamadas de detalhe por rodada (a API tem limite; o resto vem nas próximas horas)
let jogosRA = null;

const ignoraConsole = c => !c || /^(events|hubs)$/i.test(c);
// HighestAwardKind: mastered (platina hardcore), completed (100% softcore), beaten-hardcore, beaten-softcore
const kindDe = x => String(x.HighestAwardKind ?? x.highestAwardKind ?? "").toLowerCase();

async function raLista() {
  const todos = [];
  for (let off = 0, total = Infinity; off < total;) {
    const j = await raGet("API_GetUserCompletionProgress.php", `u=${RA_USER}&c=500&o=${off}`);
    const r = j.Results || j.results || [];
    total = j.Total ?? j.total ?? r.length;
    if (!r.length) break;
    todos.push(...r); off += r.length;
    await dormir(300);
  }
  return todos.map(x => {
    const kind = kindDe(x), ganhas = x.NumAwardedHardcore ?? x.numAwardedHardcore ?? x.NumAwarded ?? x.numAwarded ?? 0;
    const conquistas = x.MaxPossible ?? x.maxPossible ?? 0, img = x.ImageIcon ?? x.imageIcon ?? "";
    return {
      id: x.GameID ?? x.gameId, titulo: x.Title ?? x.title, console: x.ConsoleName ?? x.consoleName,
      imagem: img ? IMG_RA + img : "", conquistas, ganhas, pct: conquistas ? Math.round(ganhas / conquistas * 100) : 0,
      platinado: kind === "mastered", zerado: ["mastered", "completed", "beaten-hardcore", "beaten-softcore", "beaten"].includes(kind),
      data: x.HighestAwardDate ?? x.highestAwardDate ?? x.MostRecentAwardedDate ?? x.mostRecentAwardedDate ?? null, emLive: false,
    };
  }).filter(g => !ignoraConsole(g.console) && g.ganhas > 0);
}

// plano B: lista só dos prêmios (sem progresso dos jogos em andamento)
async function raPremios() {
  const j = await raGet("API_GetUserAwards.php", `u=${RA_USER}`);
  const mapa = new Map();
  for (const x of j.VisibleUserAwards || j.visibleUserAwards || []) {
    const a = { tipo: x.AwardType ?? x.awardType, id: x.AwardData ?? x.awardData, extra: x.AwardDataExtra ?? x.awardDataExtra, titulo: x.Title ?? x.title, console: x.ConsoleName ?? x.consoleName, img: x.ImageIcon ?? x.imageIcon, data: x.AwardedAt ?? x.awardedAt };
    if (a.tipo !== "Mastery/Completion" && a.tipo !== "Game Beaten") continue;
    if (ignoraConsole(a.console)) continue;
    const g = mapa.get(a.id) || { id: a.id, titulo: a.titulo, console: a.console, imagem: a.img ? IMG_RA + a.img : "", conquistas: 0, ganhas: 0, pct: 0, platinado: false, zerado: false, data: a.data, emLive: false };
    g.zerado = true;
    if (a.tipo === "Mastery/Completion" && Number(a.extra) === 1) g.platinado = true;
    mapa.set(a.id, g);
  }
  return [...mapa.values()];
}

// tempo de jogo e data do prêmio por jogo (GetGameInfoAndUserProgress); guarda em cache e só refaz se o progresso mudou
async function raDetalhes(jogos) {
  const cache = new Map(((antigo.placar && antigo.placar.jogos) || []).map(g => [String(g.id), g]));
  let feitas = 0;
  for (const g of jogos) {
    const c = cache.get(String(g.id));
    if (c && c.ganhas === g.ganhas && c.tempoSeg !== undefined) { g.tempoSeg = c.tempoSeg; if (c.data) g.data = g.data || c.data; continue; }
    if (feitas >= MAX_DETALHES) { if (c && c.tempoSeg !== undefined) g.tempoSeg = c.tempoSeg; continue; }
    try {
      const j = await raGet("API_GetGameInfoAndUserProgress.php", `g=${g.id}&u=${RA_USER}&a=1`);
      const t = j.UserTotalPlaytime ?? j.userTotalPlaytime;
      if (typeof t === "number") g.tempoSeg = t;   // a doc não diz a unidade; tratamos como segundos
      g.data = j.HighestAwardDate ?? j.highestAwardDate ?? g.data;
    } catch (e) { avisos.push(`detalhe ${g.titulo}: ${e.message}`); }
    feitas++; await dormir(350);
  }
  if (feitas) console.log(`RA: ${feitas} jogos detalhados`);
}

async function parteRA() {
  if (!RA_KEY) { avisos.push("RA_API_KEY ausente: placar não atualizado"); return; }
  try { jogosRA = await raLista(); }
  catch (e) { avisos.push("RA lista completa falhou (" + e.message + "); usando só os prêmios"); jogosRA = await raPremios(); }
  await raDetalhes(jogosRA);
}

/* ---------------- YouTube ---------------- */
const yt = (rota, q) => get(`${API || "https://www.googleapis.com"}/youtube/v3/${rota}?key=${YT_KEY}&${q}`);
const dur = iso => { const m = /PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/.exec(iso || ""); return m ? (+m[1] || 0) * 3600 + (+m[2] || 0) * 60 + (+m[3] || 0) : 0; };
const ehGuia = t => /guia|conquista|achievement/i.test(t);
const consoleDoTexto = t => { const n = " " + norm(t) + " "; return ORDEM_CONSOLES.find(c => n.includes(" " + norm(c) + " ") || n.includes(" " + norm(SIGLAS[c]) + " ")) || ""; };
const nomeConsole = c => c ? c.replace(/\b\w/g, x => x.toUpperCase()) : "";

async function paginas(rota, q, max = 10) {
  const out = []; let tok = "";
  for (let i = 0; i < max; i++) {
    const j = await yt(rota, q + (tok ? `&pageToken=${tok}` : ""));
    out.push(...(j.items || []));
    if (!(tok = j.nextPageToken)) break;
  }
  return out;
}

let videosGameplay = [];
async function partePlaylists() {
  if (!YT_KEY) { avisos.push("YT_API_KEY ausente: playlists, shorts e live não atualizados"); return; }
  const pls = await paginas("playlists", `part=snippet&maxResults=50&channelId=${CANAL}`, 4);
  const guia = [], gameplay = [], shortsBrutos = [];
  for (const p of pls) {
    const nome = p.snippet.title, url = `https://www.youtube.com/playlist?list=${p.id}`;
    const itens = await paginas("playlistItems", `part=snippet&maxResults=50&playlistId=${p.id}`, 6).catch(() => []);
    const reg = { pid: p.id, nome, url, console: nomeConsole(consoleDoTexto(nome)), descricao: `${itens.length} ${itens.length === 1 ? "vídeo" : "vídeos"}`, _n: itens.length };
    const vids = itens.filter(i => i.snippet.resourceId && i.snippet.title !== "Private video" && i.snippet.title !== "Deleted video")
      .map(i => ({ id: i.snippet.resourceId.videoId, titulo: i.snippet.title, data: i.snippet.publishedAt, playlist: nome }));
    if (ehGuia(nome)) { guia.push(reg); shortsBrutos.push(...vids); } else { gameplay.push(reg); videosGameplay.push(...vids); }
  }
  guia.sort((a, b) => b._n - a._n); gameplay.sort((a, b) => b._n - a._n);
  guia.forEach(x => delete x._n); gameplay.forEach(x => delete x._n);

  // shorts = vídeos curtos das playlists do guia, mais novos primeiro
  const unicos = [...new Map(shortsBrutos.map(v => [v.id, v])).values()].sort((a, b) => (b.data || "").localeCompare(a.data || "")).slice(0, 60);
  const curtos = [];
  for (let i = 0; i < unicos.length; i += 50) {
    const lote = unicos.slice(i, i + 50);
    const j = await yt("videos", `part=contentDetails&id=${lote.map(v => v.id).join(",")}`);
    const dmap = new Map((j.items || []).map(v => [v.id, dur(v.contentDetails.duration)]));
    lote.forEach(v => { const d = dmap.get(v.id); if (d && d <= 180) curtos.push(v); });
  }
  const shortsFinal = curtos.slice(0, 12).map(v => ({ id: v.id, titulo: v.titulo, data: v.data, jogo: "", console: nomeConsole(consoleDoTexto(v.titulo + " " + v.playlist)) }));
  auto.guia = { playlists: guia, gameplay, shorts: shortsFinal };
  auto.ultimoShort = shortsFinal[0] || null;

  // gameplay da vez = vídeo mais novo (com mais de 3 min) das playlists que não são do guia
  const recentes = [...new Map(videosGameplay.filter(v => !ehVertical(v.titulo)).map(v => [v.id, v])).values()].sort((a, b) => (b.data || "").localeCompare(a.data || "")).slice(0, 8);
  if (recentes.length) {
    const j = await yt("videos", `part=contentDetails&id=${recentes.map(v => v.id).join(",")}`);
    const dmap = new Map((j.items || []).map(v => [v.id, dur(v.contentDetails.duration)]));
    const v = recentes.find(x => (dmap.get(x.id) || 0) > 180) || recentes[0];
    auto.gameplayAtual = { id: v.id, titulo: v.titulo, data: v.data, playlist: v.playlist };
  }
}

const ehVertical = t => /vertical/i.test(t || "");

async function parteLive() {
  if (!YT_KEY) return;
  const base = `part=snippet&type=video&maxResults=10&channelId=${CANAL}`;
  const [vivo, prox] = await Promise.all([yt("search", base + "&eventType=live"), yt("search", base + "&eventType=upcoming")]);
  const ids = [...new Set([...(vivo.items || []), ...(prox.items || [])].map(i => i.id.videoId))];
  const det = new Map();
  if (ids.length) {
    const j = await yt("videos", `part=liveStreamingDetails,snippet&id=${ids.join(",")}`);
    (j.items || []).forEach(x => det.set(x.id, { id: x.id, titulo: x.snippet.title, inicio: x.liveStreamingDetails && x.liveStreamingDetails.scheduledStartTime }));
  }
  const noAr = (vivo.items || []).map(i => ({ id: i.id.videoId, titulo: i.snippet.title }));
  const futuras = (prox.items || []).map(i => det.get(i.id.videoId)).filter(x => x && x.inicio && Date.parse(x.inicio) > Date.now() - 4 * 3600e3)
    .sort((a, b) => Date.parse(a.inicio) - Date.parse(b.inicio));
  // a live horizontal é a principal; a vertical (título com "VERTICAL") é a versão para celular
  auto.aoVivo = noAr.find(x => !ehVertical(x.titulo)) || null;
  auto.aoVivoVertical = noAr.find(x => ehVertical(x.titulo)) || null;
  auto.proxima = futuras.find(x => !ehVertical(x.titulo)) || null;
  auto.proximaVertical = futuras.find(x => ehVertical(x.titulo)) || null;

  if (auto.aoVivo) {
    auto.gameplayAtual = {
      id: auto.aoVivo.id,
      titulo: auto.aoVivo.titulo,
      data: new Date().toISOString(),
      playlist: "ao vivo",
    };
  }
}

async function parteUploads() {
  if (!YT_KEY) return;

  const candidatos = new Map();

  // 1) Busca lives encerradas recentes diretamente via search (eventType=completed)
  try {
    const comp = await yt(
      "search",
      `part=snippet&type=video&eventType=completed&order=date&maxResults=10&channelId=${CANAL}`
    );
    for (const item of comp.items || []) {
      const id = item.id && item.id.videoId;
      if (id) {
        candidatos.set(id, {
          id,
          titulo: item.snippet.title,
          data: item.snippet.publishedAt,
          ehLive: true,
        });
      }
    }
  } catch (e) {
    avisos.push("search completed falhou: " + e.message);
  }

  // 2) Complementa com os envios do canal (UU...)
  const envios = await paginas("playlistItems", `part=snippet&maxResults=50&playlistId=UU${CANAL.slice(2)}`, 2);
  for (const i of envios) {
    const id = i.snippet && i.snippet.resourceId && i.snippet.resourceId.videoId;
    if (id && !candidatos.has(id)) {
      candidatos.set(id, {
        id,
        titulo: i.snippet.title,
        data: i.snippet.publishedAt,
        ehLive: false,
      });
    }
  }

  const ids = [...candidatos.keys()];
  if (!ids.length) return;

  const itensDetalhe = [];
  for (let i = 0; i < ids.length; i += 50) {
    const lote = ids.slice(i, i + 50);
    const j = await yt("videos", `part=snippet,contentDetails,liveStreamingDetails&id=${lote.join(",")}`);
    itensDetalhe.push(...(j.items || []));
  }

  const vids = itensDetalhe.map(v => {
    const liveInfo = v.liveStreamingDetails || {};
    const base = candidatos.get(v.id) || {};
    const ehLive = Boolean(
      base.ehLive ||
      liveInfo.actualStartTime ||
      liveInfo.actualEndTime ||
      v.snippet.liveBroadcastContent === "live" ||
      v.snippet.liveBroadcastContent === "completed" ||
      /\blive\b|ao vivo/i.test(v.snippet.title)
    );
    const dataRef = liveInfo.actualEndTime || liveInfo.actualStartTime || v.snippet.publishedAt;
    return {
      id: v.id,
      titulo: v.snippet.title,
      ao: v.snippet.liveBroadcastContent,
      seg: dur(v.contentDetails.duration),
      ehLive,
      data: dataRef,
    };
  });

  vids.filter(v => v.ehLive)
    .forEach(v => videosGameplay.push({ id: v.id, titulo: v.titulo, data: v.data, playlist: "lives" }));

  // Última live horizontal que já começou/encerrou (ignora agendadas "upcoming" e verticais)
  const ultimaLiveHorizontal = vids
    .filter(v =>
      v.ehLive &&
      v.ao !== "upcoming" &&
      !ehVertical(v.titulo) &&
      (v.seg === 0 || v.seg > 180)
    )
    .sort((a, b) => Date.parse(b.data || 0) - Date.parse(a.data || 0))[0];

  if (ultimaLiveHorizontal) {
    auto.gameplayAtual = {
      id: ultimaLiveHorizontal.id,
      titulo: ultimaLiveHorizontal.titulo,
      data: ultimaLiveHorizontal.data,
      playlist: "lives do canal",
    };
  }
}

/* ---------------- junta: placar + "em live" ---------------- */
// o nome do jogo precisa aparecer como palavras inteiras e sem número/algarismo romano logo depois:
// "Crash Bandicoot" não casa com "Crash Bandicoot 3 ao vivo"
function aparece(t, alvo) {
  if (!alvo) return false;
  for (let i = t.indexOf(alvo); i >= 0; i = t.indexOf(alvo, i + 1)) {
    const antes = t[i - 1], dep = t.slice(i + alvo.length);
    if ((antes === undefined || antes === " ") && (dep === "" || dep[0] === " ") && !/^ (\d+|ii|iii|iv|v|vi|vii|viii|ix|x)( |$)/.test(dep)) return true;
  }
  return false;
}

function montaPlacar() {
  if (!jogosRA) return;
  const lista = nome => lerJson(nome, []).map(norm);
  const forcaSim = lista("em-live.json"), forcaNao = lista("nao-em-live.json");
  const base = t => norm(String(t).split(/[:\-–(]/)[0]);
  const titulos = videosGameplay.map(v => norm(v.titulo));
  const normTit = new Map(jogosRA.map(g => [g, norm(g.titulo)]));
  // o começo do nome só vale se nenhum outro jogo seu tiver esse mesmo começo (ex.: "Crash Bandicoot" é de vários)
  const baseUnica = g => { const b = base(g.titulo); return b.length >= 6 && !jogosRA.some(o => o !== g && normTit.get(o).includes(b)) ? b : ""; };
  const casa = g => { const n = normTit.get(g), b = baseUnica(g); return titulos.some(t => aparece(t, n) || (b && aparece(t, b))); };
  for (const g of jogosRA) {
    const n = normTit.get(g);
    g.emLive = forcaNao.includes(n) ? false : (forcaSim.includes(n) || casa(g));
  }
  const por = new Map();
  for (const g of jogosRA) {
    const c = por.get(g.console) || { nome: g.console, sigla: sigla(g.console), platinados: 0, zerados: 0, emLive: 0, emAndamento: 0, tempoSeg: 0 };
    if (g.platinado) { c.platinados++; if (g.emLive) c.emLive++; }
    if (g.zerado) c.zerados++; else c.emAndamento++;
    c.tempoSeg += g.tempoSeg || 0;
    por.set(g.console, c);
  }
  const consoles = [...por.values()].filter(c => c.platinados || c.zerados).sort((a, b) => b.platinados - a.platinados);
  auto.placar = {
    atualizado: new Date().toISOString(), consoles,
    jogos: jogosRA.sort((a, b) => (b.data || "").localeCompare(a.data || "")),
    comVideoAoVivo: videosGameplay.length > 0,
  };
  // jogo da vez: o jogo do RetroAchievements que aparece no título da gameplay mais recente
  if (auto.gameplayAtual) {
    const t = norm(auto.gameplayAtual.titulo);
    const g = jogosRA.find(x => aparece(t, normTit.get(x)) || (baseUnica(x) && aparece(t, baseUnica(x))));
    auto.gameplayAtual.jogo = g ? { id: g.id, titulo: g.titulo, console: g.console, imagem: g.imagem, ganhas: g.ganhas, conquistas: g.conquistas } : null;
  }
}

/* ---------------- memes: cada arquivo de assets/memes vira um comando ---------------- */
async function parteMemes() {
  const pasta = `${BASE}/assets/memes`;
  if (!existsSync(pasta) && !process.env.DRIVE_FOLDER_ID) return;
  const nomeArq = p => String(p || "").split("/").pop();
  const arqs = (existsSync(pasta) ? readdirSync(pasta) : []).filter(f => /\.(mp3|wav|ogg|m4a|aac|webm|mp4|mov)$/i.test(f)).sort();
  const atual = lerJson("memes.json", []).filter(m => !/^!exemplo\d*$/.test(m.comando));
  // entradas que você já escreveu ficam como estão (só o caminho é completado com assets/memes/)
  const ehDrive = a => /^drive:|drive\.google\.com/i.test(String(a || ""));
  const lista = atual.map(m => m.arquivo && !ehDrive(m.arquivo) ? { ...m, arquivo: "assets/memes/" + nomeArq(m.arquivo) } : m);
  const usados = new Set(lista.map(m => nomeArq(m.arquivo)));
  const comandos = new Set(lista.map(m => m.comando));
  for (const f of arqs) {
    if (usados.has(f)) continue;
    let comando = "!" + norm(f.replace(/\.[^.]+$/, "")).replace(/ /g, "_"), n = 2;
    while (comandos.has(comando)) comando = comando.replace(/_\d+$/, "") + "_" + n++;
    comandos.add(comando);
    lista.push({ comando, descricao: "", arquivo: `assets/memes/${f}` });
  }
  // pasta do Google Drive (opcional): precisa de DRIVE_FOLDER_ID e DRIVE_API_KEY; a pasta deve estar como "qualquer pessoa com o link"
  if (process.env.DRIVE_FOLDER_ID && process.env.DRIVE_API_KEY) {
    const q = encodeURIComponent(`'${process.env.DRIVE_FOLDER_ID}' in parents and trashed=false`);
    const u = `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name,mimeType)&pageSize=1000&key=${process.env.DRIVE_API_KEY}`;
    const r = await fetch(u);
    if (!r.ok) throw new Error("Drive HTTP " + r.status);
    for (const f of (await r.json()).files || []) {
      if (!/^(audio|video)\//.test(f.mimeType) || usados.has(f.name)) continue;
      const ja = lista.find(m => m.arquivo === "drive:" + f.id);
      if (ja) continue;
      let comando = "!" + norm(f.name.replace(/\.[^.]+$/, "")).replace(/ /g, "_"), n = 2;
      while (comandos.has(comando)) comando = comando.replace(/_\d+$/, "") + "_" + n++;
      comandos.add(comando);
      lista.push({ comando, descricao: "", arquivo: "drive:" + f.id, ...(f.mimeType.startsWith("video/") ? { video: true } : {}) });
    }
  }
  const faltam = lista.filter(m => m.arquivo && !ehDrive(m.arquivo) && !arqs.includes(nomeArq(m.arquivo))).map(m => m.arquivo);
  if (faltam.length) avisos.push("memes sem arquivo em assets/memes: " + faltam.join(", "));
  if (lista.length) writeFileSync(`${BASE}/memes.json`, JSON.stringify(lista, null, 2) + "\n");
}

for (const [nome, fn] of [["RetroAchievements", parteRA], ["playlists", partePlaylists], ["envios", parteUploads], ["live", parteLive]]) {
  try { await fn(); } catch (e) { avisos.push(`${nome}: ${e.message}`); }
}
try { montaPlacar(); } catch (e) { avisos.push("placar: " + e.message); }
try { await parteMemes(); } catch (e) { avisos.push("memes: " + e.message); }

auto.atualizado = new Date().toISOString();
writeFileSync(`${BASE}/auto.json`, JSON.stringify(auto, null, 2) + "\n");
avisos.forEach(a => console.warn("AVISO:", a));
console.log("auto.json ok:", Object.keys(auto).join(", "));

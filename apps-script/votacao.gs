/*
  Backend da votação (Google Apps Script ligado a uma planilha do Google).
  Passo a passo no README ("Votação no site com login do Google").
  - Cada pessoa vota UMA vez por rodada: o login do Google é verificado aqui no servidor.
  - A planilha guarda só um código embaralhado (hash) da conta, nunca e-mail ou nome.
*/
const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const SEGREDO = process.env.SECRET_APP_SCRIPT;   // embaralha os códigos dos eleitores
const CHAVE_BOT = process.env.STREAMER_BOT_SECRET;            // senha que o Streamer.bot usa para votar pelo chat
const SITE_URL = "https://thyropstv-ui.github.io/tts-vozes/";  // de onde o script lê a lista de jogos votáveis
const ABA = "Votos";

// jogos que podem receber voto: platinados que ainda NÃO foram feitos em live (mesma regra do Placar)
function candidatos_() {
  const cache = CacheService.getScriptCache(), c = cache.get("cand");
  if (c) return JSON.parse(c);
  let lista = [];
  try {
    const a = JSON.parse(UrlFetchApp.fetch(SITE_URL + "auto.json?_=" + Date.now(), { muteHttpExceptions: true }).getContentText());
    lista = ((a.placar && a.placar.jogos) || []).filter(g => g.platinado && !g.emLive).map(g => g.titulo);
  } catch (x) {}
  if (!lista.length) {
    try {
      const d = JSON.parse(UrlFetchApp.fetch(SITE_URL + "dados.json?_=" + Date.now(), { muteHttpExceptions: true }).getContentText());
      lista = ((d.votacao && d.votacao.opcoes) || []).map(o => o.jogo);
    } catch (x) {}
  }
  cache.put("cand", JSON.stringify(lista), 600);   // guarda por 10 minutos
  return lista;
}
function norm_(s) { return String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim(); }
// transforma o que a pessoa digitou no chat ("crash 3") no título certo da lista
function acha_(texto, lista) {
  const q = norm_(texto);
  if (!q) return { erro: "sem_jogo" };
  const exato = lista.filter(t => norm_(t) === q);
  if (exato.length === 1) return { jogo: exato[0] };
  const palavras = q.split(" ");
  const m = lista.filter(t => { const n = " " + norm_(t); return palavras.every(p => n.indexOf(" " + p) >= 0); });
  if (m.length === 1) return { jogo: m[0] };
  if (m.length > 1) return { erro: "ambiguo", opcoes: m.slice(0, 3) };
  return { erro: "nao_encontrado" };
}
function texto_(s) { return ContentService.createTextOutput(s).setMimeType(ContentService.MimeType.TEXT); }

function aba_() {
  const s = SpreadsheetApp.getActive();
  let a = s.getSheetByName(ABA);
  if (!a) { a = s.insertSheet(ABA); a.appendRow(["data", "rodada", "eleitor", "jogo"]); }
  return a;
}
function json_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
function hash_(sub) {
  const b = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, SEGREDO + ":" + sub);
  return Utilities.base64EncodeWebSafe(b).slice(0, 22);
}
function quem_(token) {
  if (!token) return null;
  const r = UrlFetchApp.fetch("https://oauth2.googleapis.com/tokeninfo?id_token=" + encodeURIComponent(token), { muteHttpExceptions: true });
  if (r.getResponseCode() !== 200) return null;
  const p = JSON.parse(r.getContentText());
  if (p.aud !== CLIENT_ID || Number(p.exp) < Date.now() / 1000 || !p.sub) return null;
  return p.sub;
}
function lerRodada_(rodada) {
  const v = aba_().getDataRange().getValues(), linhas = [];
  for (let i = 1; i < v.length; i++) if (String(v[i][1]) === rodada) linhas.push({ eleitor: String(v[i][2]), jogo: String(v[i][3]) });
  return linhas;
}
function totais_(linhas) { const t = {}; linhas.forEach(l => { t[l.jogo] = (t[l.jogo] || 0) + 1; }); return t; }

// resultado público (sem login): ?rodada=...
function doGet(e) {
  const rodada = String((e && e.parameter && e.parameter.rodada) || "1"), t = totais_(lerRodada_(rodada));
  if (e && e.parameter && e.parameter.texto) {   // ?texto=1 -> frase pronta para o chat (top 3)
    const top = Object.keys(t).sort((a, b) => t[b] - t[a]).slice(0, 3).map(k => k + " (" + t[k] + ")");
    return texto_(top.length ? "Top votos: " + top.join(", ") : "Ainda não há votos nesta rodada.");
  }
  return json_({ ok: true, totais: t });
}

// status/voto (com token do Google): corpo JSON {token, rodada, acao: "status"|"votar", jogo}
function doPost(e) {
  let d;
  try { d = JSON.parse(e.postData.contents); } catch (x) { return json_({ ok: false, erro: "pedido_invalido" }); }
  if (d.acao === "votar_chat") return votoChat_(d);
  const sub = quem_(d.token);
  if (!sub) return json_({ ok: false, erro: "login_invalido" });
  const rodada = String(d.rodada || "1"), eleitor = hash_(sub);
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const linhas = lerRodada_(rodada), meu = linhas.find(l => l.eleitor === eleitor);
    if (d.acao === "votar") {
      const jogo = String(d.jogo || "").trim();
      const cand = candidatos_();
      if (!jogo || jogo.length > 100 || (cand.length && cand.indexOf(jogo) < 0)) return json_({ ok: false, erro: "voto_invalido" });
      if (meu) return json_({ ok: false, erro: "ja_votou", meuVoto: meu.jogo, totais: totais_(linhas) });
      aba_().appendRow([new Date(), rodada, eleitor, jogo]);
      linhas.push({ eleitor, jogo });
      return json_({ ok: true, meuVoto: jogo, totais: totais_(linhas) });
    }
    return json_({ ok: true, meuVoto: meu ? meu.jogo : null, totais: totais_(linhas) });
  } finally { lock.releaseLock(); }
}

// voto vindo do chat (Streamer.bot): {acao:"votar_chat", chave, rodada, plataforma, usuario, texto}; responde só uma frase para o chat
function votoChat_(d) {
  if (d.chave !== CHAVE_BOT) return texto_("Chave do bot inválida.");
  const plat = String(d.plataforma || "chat").slice(0, 20), usuario = String(d.usuario || "").slice(0, 64);
  if (!usuario) return texto_("Não consegui identificar você.");
  const cand = candidatos_();
  if (!cand.length) return texto_("A votação não tem jogos disponíveis agora.");
  const r = acha_(d.texto, cand);
  if (r.erro === "sem_jogo") return texto_("Use: !votar nome do jogo. Lista em " + SITE_URL + "placar.html");
  if (r.erro === "nao_encontrado") return texto_("Não achei esse jogo na votação. Lista em " + SITE_URL + "placar.html");
  if (r.erro === "ambiguo") return texto_("Qual deles? " + r.opcoes.join(" | "));
  const rodada = String(d.rodada || "1"), eleitor = hash_("chat:" + plat + ":" + usuario.toLowerCase());
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const meu = lerRodada_(rodada).find(l => l.eleitor === eleitor);
    if (meu) return texto_("Você já votou em " + meu.jogo + " nesta rodada.");
    aba_().appendRow([new Date(), rodada, eleitor, r.jogo]);
    return texto_("Voto registrado em " + r.jogo + "!");
  } finally { lock.releaseLock(); }
}

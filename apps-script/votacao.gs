/**
 * Backend da votação "Refazer em live" (Google Apps Script).
 *
 * Recebe votos de dois lugares:
 *  - Página placar.html (login com Google): acao "status" e "votar".
 *  - Chat da live via Streamer.bot (Twitch, YouTube, Kick): acao "votar_chat".
 *
 * Regra: 1 voto por pessoa, por plataforma, por rodada. A mesma pessoa pode votar em
 * plataformas diferentes (a chave do voto é "plataforma:usuario").
 *
 * Como instalar: veja o LEIA-ME no final deste arquivo.
 */

// ====== CONFIGURAÇÃO ======
// Endereço público do dados.json do seu site (o mesmo que a página placar.html lê).
const DADOS_URL = 'https://thyropstv-ui.github.io/live/dados.json';
const ABA_VOTOS = 'Votos';
const LIMIAR_SUGESTAO = 0.55;   // abaixo disso, o jogo é considerado "não encontrado"
const MAX_OPCOES = 3;           // quantas sugestões mostrar no chat
const TTL_PENDENTE_S = 180;     // tempo para a pessoa confirmar a sugestão (segundos)
const LIMITE_CHAT = 195;        // YouTube corta mensagens em 200 caracteres

// ====== ENTRADA ======
function doGet(e) {
  try {
    const dados = carregarDados_();
    const rodada = String((dados.votacao && dados.votacao.rodada) || (e && e.parameter && e.parameter.rodada) || '1');
    return json_({ ok: true, totais: totais_(lerVotos_(rodada)) });
  } catch (err) {
    console.error(err);
    return json_({ ok: false, erro: 'interno' });
  }
}

function doPost(e) {
  let req;
  try { req = JSON.parse((e && e.postData && e.postData.contents) || '{}'); }
  catch (_) { return json_({ ok: false, erro: 'json' }); }

  const chat = req.acao === 'votar_chat';
  const lock = LockService.getScriptLock();
  try { lock.waitLock(20000); }
  catch (_) { return chat ? texto_('Estou ocupado agora, tente de novo.') : json_({ ok: false, erro: 'ocupado' }); }

  try {
    const dados = carregarDados_();
    const rodada = String((dados.votacao && dados.votacao.rodada) || req.rodada || '1');
    if (chat) return texto_(cortar_(votarChat_(req, dados, rodada), LIMITE_CHAT));
    if (req.acao === 'status' || req.acao === 'votar') return json_(votarWeb_(req, dados, rodada));
    return json_({ ok: false, erro: 'acao' });
  } catch (err) {
    console.error(err);
    return chat ? texto_('Não consegui registrar o voto agora, tente de novo.') : json_({ ok: false, erro: 'interno' });
  } finally {
    lock.releaseLock();
  }
}

// ====== VOTO PELO CHAT ======
function votarChat_(req, dados, rodada) {
  const segredo = PropertiesService.getScriptProperties().getProperty('SEGREDO');
  if (!segredo || String(req.chave || '') !== segredo) {
    console.error('Votação: chave do Streamer.bot inválida ou SEGREDO não configurado.');
    return 'Erro de configuração no sistema de votação.';
  }

  const v = dados.votacao || {};
  if (!v.ativa) return 'Nenhuma votação aberta no momento.';
  const comando = v.comando || '!votar';

  const plat = String(req.plataforma || 'chat').toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 20) || 'chat';
  const usuario = String(req.usuario || '').replace(/^[=+\-@\s]+/, '').replace(/\s+/g, '').slice(0, 64);
  if (!usuario) return 'Não consegui identificar você. Tente de novo.';
  const chave = plat + ':' + usuario;

  const cands = candidatos_(dados);
  if (!cands.length) return 'Nenhuma votação aberta no momento.';

  const votos = lerVotos_(rodada);
  const meu = votos.find(x => x.chave === chave);
  if (meu) return 'Você já votou nesta rodada em ' + meu.jogo + '.';

  const txt = String(req.texto || '').trim().replace(/\s+/g, ' ').slice(0, 120);
  if (!txt) return 'Use ' + comando + ' nome do jogo. Exemplo: ' + comando + ' ' + cands[0].jogo;

  // Respostas a uma sugestão anterior (sim, não, 1, 2, 3)
  const cache = CacheService.getScriptCache();
  const chavePend = 'pend:' + rodada + ':' + chave;
  const bruto = cache.get(chavePend);
  let pend = null;
  try { pend = bruto ? JSON.parse(bruto) : null; } catch (_) { pend = null; }

  if (pend && pend.length) {
    const r = normalizar_(txt);
    if (RESP_NAO.indexOf(r) >= 0) {
      cache.remove(chavePend);
      return 'Ok, cancelei. Mande ' + comando + ' e o nome do jogo quando quiser.';
    }
    let escolha = null;
    if (RESP_SIM.indexOf(r) >= 0) {
      if (pend.length === 1) escolha = pend[0];
      else return 'Qual deles? Responda ' + comando + ' 1, 2 ou 3.';
    } else if (/^[1-9]$/.test(r) && Number(r) <= pend.length) {
      escolha = pend[Number(r) - 1];
    }
    if (escolha) {
      cache.remove(chavePend);
      const op = cands.find(c => c.jogo === escolha.jogo && (c.console || '') === (escolha.console || ''));
      if (!op) return 'Esse jogo saiu da lista. Mande ' + comando + ' e o nome de novo.';
      registrar_(rodada, plat, usuario, chave, op);
      return 'Voto registrado em ' + rotulo_(op) + '!';
    }
    // Qualquer outro texto: trata como um jogo novo e descarta a sugestão antiga.
    cache.remove(chavePend);
  }

  const res = resolver_(txt, cands);
  if (res.tipo === 'exato') {
    registrar_(rodada, plat, usuario, chave, res.opcoes[0]);
    return 'Voto registrado em ' + rotulo_(res.opcoes[0]) + '!';
  }
  if (res.tipo === 'nenhum') {
    return 'Não achei "' + cortar_(txt, 40) + '" na lista. Veja os jogos no site do placar.';
  }

  cache.put(chavePend, JSON.stringify(res.opcoes.map(o => ({ jogo: o.jogo, console: o.console || '' }))), TTL_PENDENTE_S);
  if (res.opcoes.length === 1) {
    return 'Você quis dizer ' + rotulo_(res.opcoes[0]) + '? Responda ' + comando + ' sim para confirmar.';
  }
  const lista = res.opcoes.map((o, i) => (i + 1) + ') ' + cortar_(rotulo_(o), 38)).join('  ');
  return 'Qual deles? ' + lista + ' Responda ' + comando + ' 1, 2 ou 3.' + (res.maisQueMostrado ? ' (Se não for nenhum, seja mais específico.)' : '');
}

const RESP_SIM = ['sim', 's', 'yes', 'y', 'confirmo', 'confirmar', 'isso', 'ok', 'pode'];
const RESP_NAO = ['nao', 'n', 'no', 'cancelar', 'cancela'];

// ====== VOTO PELO SITE (conta Google) ======
function votarWeb_(req, dados, rodada) {
  const v = dados.votacao || {};
  if (!v.clientId) return { ok: false, erro: 'config' };
  const user = verificarToken_(req.token, v.clientId);
  if (!user) return { ok: false, erro: 'token' };

  const chave = 'google:' + user.sub;
  const votos = lerVotos_(rodada);
  const meu = votos.find(x => x.chave === chave);

  if (req.acao === 'status') return { ok: true, meuVoto: meu ? meu.jogo : null, totais: totais_(votos) };
  if (!v.ativa) return { ok: false, erro: 'encerrada', meuVoto: meu ? meu.jogo : null, totais: totais_(votos) };
  if (meu) return { ok: false, erro: 'ja_votou', meuVoto: meu.jogo, totais: totais_(votos) };

  const op = candidatos_(dados).find(c => c.jogo === String(req.jogo || ''));
  if (!op) return { ok: false, erro: 'jogo_invalido', meuVoto: null, totais: totais_(votos) };

  registrar_(rodada, 'google', user.sub, chave, op);
  votos.push({ chave: chave, jogo: op.jogo, console: op.console });
  return { ok: true, meuVoto: op.jogo, totais: totais_(votos) };
}

function verificarToken_(token, clientId) {
  if (!token) return null;
  const r = UrlFetchApp.fetch('https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(token), { muteHttpExceptions: true });
  if (r.getResponseCode() !== 200) return null;
  const p = JSON.parse(r.getContentText());
  if (p.aud !== clientId || !p.sub) return null;
  if (p.exp && Number(p.exp) * 1000 < Date.now()) return null;
  return { sub: String(p.sub) };
}

// ====== LISTA DE JOGOS (a mesma regra da página) ======
function candidatos_(dados) {
  const j = dados.placar && dados.placar.jogos;
  if (j && j.length) {
    return j.filter(x => x.platinado && !x.emLive).map(x => ({ jogo: String(x.titulo), console: String(x.console || '') }));
  }
  const op = (dados.votacao && dados.votacao.opcoes) || [];
  return op.map(x => ({ jogo: String(x.jogo), console: String(x.console || '') }));
}

function carregarDados_() {
  const cache = CacheService.getScriptCache();
  let txt = cache.get('dados');
  if (!txt) {
    const r = UrlFetchApp.fetch(DADOS_URL, { muteHttpExceptions: true });
    if (r.getResponseCode() !== 200) throw new Error('dados.json respondeu ' + r.getResponseCode());
    txt = r.getContentText();
    JSON.parse(txt);
    try { cache.put('dados', txt, 300); } catch (_) { /* arquivo grande demais para o cache: segue sem */ }
  }
  return JSON.parse(txt);
}

// ====== PLANILHA ======
function aba_() {
  const id = PropertiesService.getScriptProperties().getProperty('SHEET_ID');
  const ss = id ? SpreadsheetApp.openById(id) : SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(ABA_VOTOS);
  if (!sh) {
    sh = ss.insertSheet(ABA_VOTOS);
    sh.appendRow(['rodada', 'chave', 'plataforma', 'usuario', 'jogo', 'console', 'data']);
  }
  return sh;
}

function lerVotos_(rodada) {
  const sh = aba_();
  const n = sh.getLastRow();
  if (n < 2) return [];
  return sh.getRange(2, 1, n - 1, 7).getValues()
    .filter(r => String(r[0]) === String(rodada))
    .map(r => ({ chave: String(r[1]), jogo: String(r[4]), console: String(r[5]) }));
}

function registrar_(rodada, plat, usuario, chave, op) {
  aba_().appendRow([String(rodada), chave, plat, usuario, op.jogo, op.console || '', new Date()]);
}

function totais_(votos) {
  const t = {};
  votos.forEach(x => { t[x.jogo] = (t[x.jogo] || 0) + 1; });
  return t;
}

// ====== BUSCA APROXIMADA ======
const ROMANOS = { ii: '2', iii: '3', iv: '4', v: '5', vi: '6', vii: '7', viii: '8', ix: '9', x: '10', xi: '11', xii: '12' };

function normalizar_(s) {
  const t = String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/&/g, ' e ').replace(/['’`]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
  const w = t.split(' ').filter(Boolean);
  return w.map(x => (w.length > 1 && ROMANOS[x]) ? ROMANOS[x] : x).join(' ');
}

function lev_(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = [];
  for (let j = 0; j <= b.length; j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
}

function tokenIgual_(a, b) {
  if (a === b) return true;
  const d = lev_(a, b);
  if (a.length >= 5 && b.length >= 5 && d <= 1) return true;
  if (a.length >= 8 && b.length >= 8 && d <= 2) return true;
  return false;
}

// q e t já normalizados. 1 só quando são idênticos; parecidos ficam no máximo em 0.99.
function pontuar_(q, t) {
  if (!q || !t) return 0;
  if (q === t) return 1;
  const qt = q.split(' '), tt = t.split(' ');
  const cobQ = qt.filter(w => tt.some(x => tokenIgual_(w, x))).length / qt.length;
  const cobT = tt.filter(x => qt.some(w => tokenIgual_(w, x))).length / tt.length;
  const porToken = cobQ * (0.6 + 0.4 * cobT);
  const porLetra = 1 - lev_(q, t) / Math.max(q.length, t.length);
  return Math.min(0.99, Math.max(porToken, porLetra));
}

function resolver_(texto, cands) {
  const q = normalizar_(texto);
  const pont = cands.map(c => {
    const t = normalizar_(c.jogo);
    const tc = normalizar_(c.jogo + ' ' + (c.console || ''));
    return { op: c, s: Math.max(pontuar_(q, t), pontuar_(q, tc)) };
  }).sort((a, b) => b.s - a.s);

  if (!pont.length || pont[0].s < LIMIAR_SUGESTAO) return { tipo: 'nenhum' };

  const exatos = pont.filter(p => p.s === 1);
  if (exatos.length === 1) return { tipo: 'exato', opcoes: [exatos[0].op] };
  if (exatos.length > 1) {
    return { tipo: 'sugerir', opcoes: exatos.slice(0, MAX_OPCOES).map(p => p.op), maisQueMostrado: exatos.length > MAX_OPCOES };
  }

  const corte = Math.max(LIMIAR_SUGESTAO, pont[0].s - 0.15);
  const proximos = pont.filter(p => p.s >= corte);
  return { tipo: 'sugerir', opcoes: proximos.slice(0, MAX_OPCOES).map(p => p.op), maisQueMostrado: proximos.length > MAX_OPCOES };
}

// ====== UTILITÁRIOS ======
function rotulo_(op) { return op.jogo + (op.console ? ' (' + op.console + ')' : ''); }
function cortar_(s, n) { s = String(s); return s.length > n ? s.slice(0, n - 1) + '…' : s; }
function json_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
function texto_(s) { return ContentService.createTextOutput(String(s)).setMimeType(ContentService.MimeType.TEXT); }

/*
 * LEIA-ME
 * 1. Abra (ou crie) a planilha do Google onde os votos vão ficar. Extensões > Apps Script.
 *    Apague o código que vier e cole este arquivo inteiro.
 * 2. Em DADOS_URL, coloque o endereço do seu dados.json publicado (o que o placar.html lê).
 * 3. Engrenagem (Configurações do projeto) > Propriedades do script > Adicionar:
 *      SEGREDO = o mesmo valor da global STREAMER_BOT_SECRET do Streamer.bot.
 *    (Se o script NÃO estiver dentro da planilha, adicione também SHEET_ID = id da planilha.)
 * 4. Implantar > Nova implantação > Tipo: App da Web.
 *      Executar como: Eu. Quem tem acesso: Qualquer pessoa.
 *    Autorize quando pedir. Copie a URL que termina em /exec.
 * 5. Essa URL vai em dados.json (votacao.api) e na global VOTING_API do Streamer.bot.
 *    Depois de mudar o código, use Implantar > Gerenciar implantações > editar > Nova versão.
 */
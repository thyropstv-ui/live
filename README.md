# Vozes | Thyrops Live

Site estático (sem servidor) para o GitHub Pages, no visual das lives.

## Páginas

- `index.html`: início, com contagem para a próxima live e resumo das platinas.
- `placar.html`: platinados e zerados por console, horas de jogo, barra de platinas feitas em live e lista de jogos para votar.
- `jogos.html`: todos os jogos do RetroAchievements com status (platina, zerado, em andamento), progresso, tempo de jogo e se foi feito em live. Tem busca e filtros.
- `guia.html`: último short do guia e gameplay da vez (tocam no próprio site), shorts, playlists do guia e de gameplay (com player).
- `agenda.html`: semana de lives, contagem e horário convertido para quem visita.
- `vozes.html`: catálogo de vozes (era o antigo `index.html`).
- `memes.html`: memes do chat, com play, cópia do comando e, nos arquivos de vídeo, botão para ver o vídeo.

## Como o site se atualiza sozinho

A automação `.github/workflows/atualiza.yml` roda **a cada hora** no GitHub e grava `auto.json` (e `memes.json`). O site lê `auto.json` primeiro; o que não estiver lá vem do `dados.json`.

- **Jogos e placar:** vêm do RetroAchievements (usuário Thyrops). A lista completa vem de `API_GetUserCompletionProgress` e o tempo de jogo de `API_GetGameInfoAndUserProgress`. Platinado = `mastered`; zerado = `mastered`, `completed` ou `beaten`. Os detalhes ficam em cache e só são pedidos de novo quando o progresso do jogo muda (até 80 jogos por rodada, o resto entra nas horas seguintes).
- **Tempo de jogo:** a documentação não diz a unidade de `UserTotalPlaytime`; o site trata como segundos. Compare um jogo com a página de progresso do RetroAchievements; se estiver diferente, avise para ajustar.
- **Em destaque:** o último short do guia (vídeo curto das playlists "guia") e a gameplay da vez (a última live horizontal que já terminou, lida dos envios do canal, pela data real da live; vertical, shorts e vídeos do guia ficam de fora). Se o título da gameplay tiver o nome de um jogo do RetroAchievements, aparece o progresso dele.
- **Em live:** um jogo conta como feito em live quando o nome dele aparece, como palavras inteiras, no título de uma live (playlists de gameplay e envios do canal). O nome não vale se vier seguido de número: "Crash Bandicoot" não casa com "Crash Bandicoot 3". O começo do nome (antes do `:`) só vale quando nenhum outro jogo seu começa igual. Para corrigir à mão, escreva o título exato do jogo no `em-live.json` (força "em live") ou no `nao-em-live.json` (força "não foi em live"), ex.: `["Crash Bandicoot"]`.
- **Votação:** lista os platinados que ainda não estão como "em live".
- **Horizontal e vertical:** a automação separa as lives pelo título: se tiver "VERTICAL", é a vertical; o resto é a horizontal (principal). A contagem e o destaque são da horizontal, e a vertical aparece numa linha própria, com o seu link, avisando que é a versão para celular. Sem live horizontal agendada no YouTube, a contagem usa o calendário fixo.
- **Guia:** playlists do canal cujo nome tem "guia" ou "conquista" viram o guia; as outras viram gameplay. Os shorts são os vídeos de até 3 minutos dessas playlists do guia.
- **Live:** se houver live ao vivo ou agendada no YouTube, ela manda na contagem. Se não houver, vale o calendário do `dados.json` (terça, quarta e quinta às 21h, horário de Brasília).

### Ligar (uma vez)

1. No repositório: **Settings → Secrets and variables → Actions → New repository secret**.
2. `RA_API_KEY`: sua chave em retroachievements.org → Settings → Keys (Web API Key).
3. `YT_API_KEY`: chave do YouTube Data API v3 (console.cloud.google.com → ativar "YouTube Data API v3" → Credenciais → Chave de API).
4. **Actions → Atualizar dados do site → Run workflow** para a primeira atualização.

Sem as chaves o site continua funcionando com o `dados.json` (a automação só avisa no log).

## Memes

Coloque os arquivos em `assets/memes/`. Pode ser **mp3, wav, ogg, m4a, mp4 ou webm** (em vídeo, o site toca só o som).

- Arquivo novo sem entrada no `memes.json` ganha um comando pelo nome: `bonk.mp4` vira `!bonk`, `risada maligna.mp3` vira `!risada_maligna`. A automação faz isso quando você sobe arquivos.
- Para escolher o comando e a descrição, escreva você mesmo no `memes.json`. O que você escreve é mantido:
  `{ "comando": "!certomizeravi", "descricao": "Acerto Mizeravi", "arquivo": "assets/memes/nome-do-arquivo.mp4" }`
- O `arquivo` pode ser só o nome (`nome-do-arquivo.mp4`); o site procura em `assets/memes/`.
- Se um meme não tocar: confira se o arquivo está mesmo em `assets/memes/` (o nome precisa ser igual, com maiúsculas e minúsculas) e se o `memes.json` tem vírgula entre as entradas.
- Para arquivos de vídeo grandes, converta para mp3 (só o som): `ffmpeg -i entrada.mp4 -vn -b:a 128k saida.mp3`.

## Arquivos que você edita

- `dados.json`: agenda, playlists de reserva e votação de reserva. Enquanto `"exemplo": true` e sem `auto.json`, aparece uma faixa avisando que o placar é de exemplo.
- `em-live.json`: jogos que você quer marcar como feitos em live à mão.
- `custom_voices.json`: as vozes (veja abaixo).

## Tema de cores

`tema.css` guarda a paleta neon padrão e mais 4 (Gelo, Espectro, Relâmpago, Luar). O visitante escolhe pelas bolinhas no rodapé. Para criar outra, copie um bloco `html[data-tema="..."]` e adicione a linha em `tema.js`.

## Publicar (grátis)

1. Crie um repositório público no GitHub e envie **todos** os arquivos, mantendo a pasta `assets/`.
2. Em **Settings → Pages**: *Deploy from a branch*, branch `main`, pasta `/ (root)`.
3. O site fica em `https://SEU-USUARIO.github.io/NOME-DO-REPO/`.

## Adicionar ou editar vozes

Edite `custom_voices.json`. Cada voz tem:

```json
{
  "nome": "!goku",
  "id": "ID_DO_MODELO_NO_FISH_AUDIO",
  "descricao": "De Dragon Ball",
  "volume": 0,
  "categoria": "Animes",
  "subcategoria": "Dragon Ball",
  "thumbnail": ""
}
```

- `id`: o código na URL da voz (`fish.audio/m/<id>`).
- `thumbnail` (opcional): capa da voz. Vazio = capa padrão do Fish Audio. Aceita um link (`https://...`) ou o nome de um arquivo enviado para `assets/vozes/` (ex.: `"goku.png"`). Se a imagem não carregar, cai na capa do Fish e depois na letra inicial.
- `volume`: ajuste em % (só é usado no gerador).
- `categoria`: vira uma aba. As atuais são Séries de TV, Animes, Desenhos, Filmes e Heróis, Games, Música, Narradores, Personalidades e Outras vozes.
- `subcategoria`: a série ou grupo dentro da aba (Chaves, Naruto, One Piece...). Aparece como título e como botão de filtro.
- Categoria nova no JSON ganha uma aba sozinha, depois das atuais. Voz sem categoria cai em "Outras vozes".
- Dentro de cada categoria, as séries com mais vozes aparecem primeiro e as chamadas "Outros ..." vão para o fim.
- A ordem das abas está no começo de `voices.js` (`ORDEM_CATEGORIAS`).

> Depois de editar o `custom_voices.json`, a lista de reserva dentro do `vozes.html` (bloco `VOZES:INICIO`) só importa para quem abre o arquivo direto do computador; o site publicado lê o JSON.

## Como o catálogo toca as vozes (sem chave)

Ao clicar no play, a página consulta `https://api.fish.audio/model/<id>` (endpoint público), pega a primeira amostra da voz e toca o MP3 de `platform.r2.fish.audio`. As capas vêm de `public-platform.r2.fish.audio`. Voz sem amostra pública mostra "amostra indisponível".

## Aviso

Projeto não oficial. As vozes pertencem aos seus criadores no Fish Audio. Não use para enganar ou se passar por pessoas reais.

## Memes no Google Drive (opcional)

Em `memes.json`, o campo `arquivo` aceita, além de `assets/memes/...`, um link do Drive (`https://drive.google.com/file/d/ID/view`) ou `drive:ID`. O arquivo precisa estar compartilhado como "qualquer pessoa com o link". Vídeos do Drive sem extensão visível: adicione `"video": true` na entrada para aparecer o botão de ver.

Para listar uma pasta inteira automaticamente, crie no repositório (Settings → Secrets and variables → Actions) `DRIVE_FOLDER_ID` e `DRIVE_API_KEY` (chave do Google Cloud com a Drive API ativada) (o `atualiza.yml` já lê os dois como secrets). Arquivos novos viram comandos sozinhos.

Limites: o Drive pode bloquear downloads diretos de arquivos grandes ou com muito tráfego (cota), e é mais lento que o GitHub Pages. Para meme curto, `assets/memes` continua sendo o mais confiável.

## Votação ligada ao YouTube

A API do YouTube não permite ler nem incorporar enquetes de posts da comunidade. Então, em `dados.json` → `votacao`, preencha `postUrl` (link do post) e, se quiser, `postTitulo`: a página Placar mostra um botão "Votar no YouTube" que abre o post. A lista com "Copiar voto" continua para votar no chat.

## Memes: vídeo só com o olho, áudio só com o play

`.mp4`, `.webm`, `.mov` e links do Google Drive mostram só o botão do olho (abre o vídeo). `.mp3`, `.wav`, `.ogg`, `.m4a`, `.aac` mostram só o play. Para forçar um caso, use `"tipo": "video"` ou `"tipo": "audio"` na entrada. Vídeos do Drive abrem no player do próprio Drive (é o que funciona com link público).

## Votação no site com login do Google (um voto por pessoa)

O site é estático, então o voto precisa de um pequeno servidor gratuito: um Google Apps Script ligado a uma planilha sua. O login do Google é conferido no servidor, e a planilha guarda só um código embaralhado da conta (sem e-mail ou nome). O site também mostra os votos de cada jogo.

1. **Planilha:** crie uma planilha no Google Drive (ex.: "Votos Thyrops"). Extensões → Apps Script.
2. **Código:** cole o conteúdo de `apps-script/votacao.gs`. Troque `SEGREDO` por um texto longo qualquer.
3. **Client ID:** em console.cloud.google.com crie um projeto → APIs e serviços → Credenciais → Criar credenciais → ID do cliente OAuth → *Aplicativo da Web*. Em "Origens JavaScript autorizadas" coloque `https://thyropstv-ui.github.io`. Configure a tela de consentimento (externa, só nome do app e e-mail). Copie o Client ID e cole em `CLIENT_ID` no script.
4. **Publicar:** no Apps Script, Implantar → Nova implantação → App da Web → *Executar como: eu*, *Quem pode acessar: qualquer pessoa*. Copie a URL `/exec`.
5. **Site:** em `dados.json` → `votacao` preencha `api` (URL `/exec`), `clientId` e `rodada` (um nome, ex.: `"2026-12"`). Para abrir uma votação nova, mude a `rodada`: todo mundo pode votar de novo.

Com `api` e `clientId` vazios, o site continua com o botão "Copiar voto". Os votos ficam na aba `Votos` da planilha. Limite honesto: uma pessoa com várias contas Google pode votar várias vezes; o sistema garante um voto por conta, não por pessoa. A lista de jogos vem do RetroAchievements; o servidor aceita qualquer nome de jogo até 100 caracteres, mas o site só exibe os da lista.

## Votação pelo chat (Streamer.bot)

O mesmo Apps Script recebe votos do chat. Quem vota no chat usa `!votar nome do jogo`; o script acha o jogo na lista (aceita nome parcial, tipo `!votar crash 3`; se houver mais de um, responde quais são). Um voto por usuário por rodada (a identidade é a plataforma + o ID do usuário no chat). Quem vota no site e no chat conta duas vezes, porque são identidades diferentes.

1. No `votacao.gs`, defina `CHAVE_BOT` (uma senha só sua) e confira `SITE_URL`. Publique **nova versão** da implantação (Implantar → Gerenciar implantações → editar → Nova versão); a URL `/exec` não muda.
2. No Streamer.bot: Commands → novo comando `!votar` (Twitch, YouTube e Kick, com cooldown por usuário de uns 10 s). Ação com sub-ação **Execute C# Code** com o conteúdo de `streamerbot/votar.cs` (troque URL, CHAVE e RODADA).
3. Depois da sub-ação, adicione "Send Message" de cada plataforma com o texto `%msgVoto%`.
4. Opcional: um comando `!votos` que faz GET em `SUA_URL/exec?texto=1` e responde com o top 3.

Só entram na votação os jogos platinados que ainda não foram feitos em live (os mesmos que o Placar lista). O script lê essa lista do `auto.json` do site (cache de 10 min). O arquivo `apps-script/votacao.gs` do repositório é só cópia de referência: o código que vale é o colado no Apps Script. Nunca suba para o GitHub o `SEGREDO`/`CHAVE_BOT` verdadeiros.

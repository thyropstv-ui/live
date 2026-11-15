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
  "subcategoria": "Dragon Ball"
}
```

- `id`: o código na URL da voz (`fish.audio/m/<id>`).
- `volume`: ajuste em % (só é usado no gerador).
- `categoria`: vira uma aba. As atuais são Séries de TV, Animes, Desenhos, Filmes e Heróis, Games, Música, Narradores, Personalidades e Outras vozes.
- `subcategoria`: a série ou grupo dentro da aba (Chaves, Naruto, One Piece...). Aparece como título e como botão de filtro.
- Categoria nova no JSON ganha uma aba sozinha, depois das atuais. Voz sem categoria cai em "Outras vozes".
- Dentro de cada categoria, as séries com mais vozes aparecem primeiro e as chamadas "Outros ..." vão para o fim.
- A ordem das abas está no começo de `voices.js` (`ORDEM_CATEGORIAS`).

## Como o catálogo toca as vozes (sem chave)

Ao clicar no play, a página consulta `https://api.fish.audio/model/<id>` (endpoint público), pega a primeira amostra da voz e toca o MP3 de `platform.r2.fish.audio`. As capas vêm de `public-platform.r2.fish.audio`. Voz sem amostra pública mostra "amostra indisponível".

## Aviso

Projeto não oficial. As vozes pertencem aos seus criadores no Fish Audio. Não use para enganar ou se passar por pessoas reais.

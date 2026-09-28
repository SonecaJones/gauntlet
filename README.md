# Gauntlet Reforged

Um clone do **Gauntlet do NES** com recursos e jogabilidade modernos — roda direto no navegador, sem dependências, sem build e sem nenhum arquivo de imagem ou áudio (tudo é gerado por código).

## Como jogar

```bash
npm start            # servidor sem dependências (páginas + salas online)
# abra http://localhost:8080
```

Qualquer servidor estático funciona (`npx serve`, `python3 -m http.server`...). Abrir o `index.html` direto do disco não funciona porque o jogo usa módulos ES.

## Celular

- Controles de toque: joystick esquerdo move e o herói **mira e atira sozinho** no inimigo mais próximo à vista (dá para desligar na pausa ou mirar manualmente com o joystick direito). Botões » esquiva, ★ especial e ⚗ poção no canto direito.
- Funciona em paisagem e retrato, respeita notch e bordas seguras, mantém a tela acesa durante o jogo e tem botão de tela cheia (Android).
- É um **PWA**: no celular, use "Adicionar à tela inicial" para instalar como app, em tela cheia e com funcionamento offline.

## Publicar no Firebase Hosting

Não há build: os arquivos do repositório já são o site.

```bash
npm i -g firebase-tools
firebase login
firebase use --add        # escolha o projeto
firebase deploy --only hosting
```

O `firebase.json` já está configurado (publica a raiz, ignora `server.js`, `README.md` etc.). O modo local funciona por completo no Hosting. O modo online precisa do servidor de salas (veja abaixo), que o Hosting não executa.

## Multiplayer online

1. Rode o servidor do jogo (`npm start`) numa máquina acessível por todos, ou faça deploy dele em qualquer serviço Node (Render, Fly.io, Railway...). Ele usa a variável `PORT` e não tem dependências.
2. No título, escolha **Criar sala online**. Aparece um código de 4 letras e um link de convite (`?sala=ABCD`).
3. Os amigos abrem o link, ou escolhem **Entrar em sala online** e digitam o código.

- Até 4 heróis por partida, misturando jogadores locais (teclado/gamepads do anfitrião) e online. Até 7 convidados podem se conectar, e quem sobra assiste.
- Dá para entrar no meio da partida: quem está assistindo aperta ENTER/START.
- O anfitrião roda a simulação e envia o estado 20 vezes por segundo. Os convidados veem os inimigos interpolados e o próprio herói com predição local, então o movimento responde na hora.
- O servidor só repassa mensagens entre os jogadores da sala (WebSocket implementado sem bibliotecas).
- Se o jogo estiver num servidor diferente do da página, use `?server=wss://seu-servidor/ws`.

A versão publicada como Artifact do Claude não consegue jogar online, porque a página não pode abrir conexões WebSocket. Lá só o modo local funciona.

## O que vem do clássico

- Quatro heróis: **Guerreiro**, **Valquíria**, **Mago** e **Elfo**, cada um com velocidade, armadura, ataque e magia diferentes.
- A vida funciona como relógio: cai 1 ponto por segundo. Comida recupera.
- **Geradores** criam hordas sem parar até serem destruídos (e perdem nível conforme apanham).
- Fantasmas, Grunts, Demônios, Lobbers, Feiticeiros invisíveis e a **Morte** (só morre com poção).
- Chaves abrem portas, poções limpam a tela, tesouros dão pontos, amuletos dão poderes temporários.
- "Não atire na comida!" — tiros destroem comida (e atirar numa poção a detona).
- Narrador com as frases icônicas ("O Guerreiro precisa de comida, urgente!") via síntese de voz.

## O que é moderno

- **Controle twin-stick**: mira independente do movimento (mouse, analógico direito ou joystick de toque).
- **Esquiva** com invencibilidade e **habilidade especial** por classe: Redemoinho, Investida, Nova Arcana, Chuva de Flechas.
- **Co-op local para até 4 jogadores** (teclado + gamepads), com **entrada a qualquer momento** (aperte START) e **reviver** o companheiro ficando perto do túmulo.
- Câmera dinâmica que acompanha e dá zoom no grupo.
- **Masmorras procedurais** infinitas com portas trancadas sempre solucionáveis, salas de tesouro e dificuldade crescente.
- **Relíquias** entre os níveis (progressão estilo roguelite).
- IA com pathfinding (campo de fluxo), iluminação dinâmica com tochas, partículas, números de dano, tremor de tela, vibração do controle.
- Música chiptune e efeitos sintetizados em tempo real (WebAudio).
- Controles de toque para celular, minimapa com névoa de guerra, recordes salvos, PT-BR/EN.

## Controles

| Ação | Teclado + mouse | Gamepad | Toque |
|---|---|---|---|
| Mover | WASD | Analógico esquerdo / D-pad | Joystick esquerdo |
| Mirar e atirar | Mouse + clique, ou setas | Analógico direito (ou RT/X na direção atual) | Joystick direito |
| Esquiva | Espaço / Shift | A | » |
| Especial | E / botão direito | RB / B | ★ |
| Poção | Q | Y / LB | ⚗ |
| Mapa | Tab / M | Select | ▦ |
| Pausa | Esc / P | Start | II |
| Entrar no jogo | Enter | Start | toque |

## Estrutura

```
index.html        página + canvas
server.js         servidor estático + salas online via WebSocket (npm start)
src/main.js       loop principal, configurações, recordes
src/screens.js    telas: título, seleção, jogo/pausa, relíquias, fim de jogo
src/game.js       simulação: heróis, inimigos, IA, combate, câmera, iluminação
src/level.js      gerador procedural de masmorras
src/render.js     arte procedural (tiles, heróis, monstros, itens)
src/ui.js         HUD, minimapa, controles de toque
src/input.js      teclado, mouse, gamepads e toque unificados
src/net.js        conexão, salas, sincronização de telas e controles remotos
src/netgame.js    snapshots do anfitrião; jogo do convidado com interpolação e predição
src/audio.js      efeitos, música e narrador
src/heroes.js     classes e relíquias
src/enemies.js    atributos dos monstros
src/i18n.js       textos PT-BR / EN
```

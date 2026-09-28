# Gauntlet Reforged

Um clone do **Gauntlet do NES** com recursos e jogabilidade modernos — roda direto no navegador, sem dependências, sem build e sem nenhum arquivo de imagem ou áudio (tudo é gerado por código).

## Como jogar

```bash
npm start            # servidor estático sem dependências
# abra http://localhost:8080
```

Qualquer servidor estático funciona (`npx serve`, `python3 -m http.server`...). Abrir o `index.html` direto do disco não funciona porque o jogo usa módulos ES.

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
server.js         servidor estático (npm start)
src/main.js       loop principal, configurações, recordes
src/screens.js    telas: título, seleção, jogo/pausa, relíquias, fim de jogo
src/game.js       simulação: heróis, inimigos, IA, combate, câmera, iluminação
src/level.js      gerador procedural de masmorras
src/render.js     arte procedural (tiles, heróis, monstros, itens)
src/ui.js         HUD, minimapa, controles de toque
src/input.js      teclado, mouse, gamepads e toque unificados
src/audio.js      efeitos, música e narrador
src/heroes.js     classes e relíquias
src/enemies.js    atributos dos monstros
src/i18n.js       textos PT-BR / EN
```

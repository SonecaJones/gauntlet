# Página do Cryptfall no itch.io

Tudo o que é preciso para publicar em https://itch.io/game/new. Os campos estão na ordem do formulário.

Arquivos desta pasta:

- `cover.png`: capa (630×500, o tamanho que o itch pede)
- `screenshots/`: 5 imagens 1280×720 (a primeira é a que aparece em destaque)
- o jogo: rode `npm run itch` na raiz do repositório e ele gera `dist/cryptfall-itch.zip`

---

## 1. Campos do formulário

| Campo | Valor |
|---|---|
| **Title** | `Cryptfall: Co-op Dungeon Crawler` |
| **Project URL** | `cryptfall` (fica `seunome.itch.io/cryptfall`) |
| **Short description or tagline** | `Co-op dungeon crawler inspired by NES Gauntlet. Up to 4 players, local or online, in your browser.` |
| **Classification** | Games |
| **Kind of project** | HTML |
| **Release status** | Released |
| **Pricing** | No payments (ou *Donate*, se quiser aceitar doações) |

### Uploads

1. **Upload files** → `dist/cryptfall-itch.zip`
2. Marque **This file will be played in the browser**

### Embed options

| Opção | Valor |
|---|---|
| Embed in page | Manually set size: **1280 × 720** |
| Mobile friendly | ✅ marcado (Orientation: *Default*, o jogo funciona nas duas) |
| Automatically start on page load | ❌ (deixe o botão "Run game", assim o som funciona de primeira) |
| Fullscreen button | ✅ |
| Enable scrollbars | ❌ |
| SharedArrayBuffer support | ❌ |

### Details

- **Description**: cole o texto da seção 2
- **Genre**: Action
- **Tags** (o itch aceita até 10): `co-op`, `dungeon-crawler`, `local-co-op`, `multiplayer`, `retro`, `roguelite`, `twin-stick-shooter`, `top-down`, `3d`, `nes`
- **AI generation disclosure**: o itch pergunta se o projeto usa conteúdo gerado por IA. Responda de acordo com como o jogo foi feito.
- **App store links**: vazio
- **Custom noun**: vazio

### Metadata (opcional, mas ajuda na busca)

| Campo | Valor |
|---|---|
| Inputs | Keyboard, Mouse, Xbox controller, Playstation controller, Touchscreen |
| Multiplayer | Local multiplayer, Ad-hoc networked multiplayer |
| Player count | 1 – 4 |
| Languages | English, Portuguese (Brazil) |
| Average session | About a half-hour |
| Links | `Play the web version` → https://cryptfall.web.app/ |

### Visibility

Salve primeiro como **Draft**, abra a página para testar (jogue uma partida e crie uma sala online) e depois mude para **Public**.

---

## 2. Descrição da página

O editor do itch aceita texto formatado. Copie a partir daqui:

---

**Grab up to three friends and dive into endless dungeons.** Cryptfall is a modern take on the NES classic Gauntlet: hordes of monsters pouring out of generators, a life bar that drains over time, keys, potions, treasure and an ominous narrator reminding you that *the Warrior needs food, badly!*

### ⚔️ Features

- **4 heroes**: Warrior, Valkyrie, Wizard and Elf, each with their own speed, armor, attack, magic and a special ability
- **Co-op for up to 4 players**, locally (keyboard and gamepads) or **online**: host a room and send the link. Friends can drop in mid-game.
- **Endless procedural dungeons** with locked doors, treasure rooms and rising difficulty
- **A boss arena every 5 levels**: the Red Dragon, the Necromancer and the Stone Golem, each with an enraged phase
- **Relics** between levels for roguelite progression
- **Twin-stick controls**, dodge with invincibility frames, reviving fallen teammates
- **NES-style chiptune music** and a demonic narrator
- Plays great on **phones** too, with touch controls and auto-aim

### 🎮 Controls

| | Keyboard + mouse | Gamepad | Touch |
|---|---|---|---|
| Move | WASD | Left stick | Left joystick |
| Aim & shoot | Mouse / arrows | Right stick | Auto, or right joystick |
| Dodge | Space | A | » |
| Special | E / right click | RB | ★ |
| Potion | Q | Y | ⚗ |
| Map | Tab | Select | ▦ |
| Join game | Enter | Start | tap |

**Tip:** use the fullscreen button in the bottom right corner. Online invites open the game at cryptfall.web.app, and players there and here share the same rooms.

### 🛠️ Made with code only

No image or audio files: the music is played by a small NES-style synthesizer, the 3D models are built by scripts in Blender, and online play connects players directly with WebRTC, with no game server.

---

🇧🇷 **Em português:** dungeon crawler cooperativo inspirado no Gauntlet do NES. Até 4 jogadores no mesmo computador ou online: crie uma sala e mande o link para os amigos. O jogo está em português e inglês (botão *pt | EN* na tela inicial).

---

## 3. Aparência da página (Edit theme)

Para combinar com o jogo:

| Cor | Valor |
|---|---|
| Background | `#050308` |
| Background 2 (caixa do texto) | `#140c1f` |
| Text | `#e8dcff` |
| Link | `#f6b440` |
| Button | `#f6b440` |

- **Banner**: o `icons/og-image.jpg` da raiz do repositório funciona bem como banner.
- **Screenshots**: suba na ordem dos nomes dos arquivos.
- **Gameplay video**: se gravar um clipe, suba no YouTube e cole o link no campo de vídeo. Isso aumenta bastante os cliques.

---

## 4. Primeiro devlog (opcional)

O itch divulga os devlogs no feed de quem segue tags parecidas, então vale postar um no lançamento:

> **Cryptfall is out!**
>
> Cryptfall is my love letter to the NES Gauntlet: four heroes, endless dungeons, and a boss every five levels. You can play solo, with friends on the same couch, or online by sending a room link.
>
> I'd love to know how far you get and how online play works for you. Leave a comment below!

---

## 5. Atualizar o jogo depois

Depois de mudar o jogo, rode `npm run itch` de novo e, no itch, substitua o arquivo em **Uploads** (ou use o [butler](https://itch.io/docs/butler/): `butler push dist/cryptfall-itch.zip seunome/cryptfall:html5`).

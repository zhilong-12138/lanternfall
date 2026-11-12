# LANTERNFALL

## 微信小游戏版本

新增横屏小游戏前端与 Python/MySQL 后端：

- [wechat-client/README.md](wechat-client/README.md)：构建、微信开发者工具导入、触摸操作与存档说明。
- [backend/README.md](backend/README.md)：Docker MySQL、Python 服务、微信登录、存档接口和测试。

`wechat-client` 构建复用下方网页版本的 `src/`；原网页入口保留。

A single-page three.js idle battler. A party of heroes holds a lantern-lit line against waves of monsters that come out of the dark. Fights run on their own: you pick the party, spend the loot and fire flares at the right moment.

**Play:** https://loktar00.github.io/lanternfall/

## How to play

- Press Enter or Space (or click) on the title screen to begin.
- Battles run automatically. Heroes use their skills on cooldown.
- Fire a flare to light up the field and boost the party when a wave gets hard.
- Spend experience and relics in the menu to level and re-equip the heroes.
- Click once on the page to start the sound (browsers block audio until you interact).

## Controls

| Input | Action |
| --- | --- |
| Enter / Space | Start (title screen) |
| Space | Fire a flare |
| M | Open or close the menu |
| Esc | Close the open panel |
| C | Toggle close camera |
| + / - | Faster / slower game speed (1x, 2x, 4x) |
| F8 | Sound debug overlay |
| Click | Interact with the field and panels |

## Build

The game is one self-contained `index.html`. It is built by concatenating `three.min.js` and `src/*.js` into the page template `src/head.html`.

```sh
sh tools/build.sh          # writes index.html
sh tools/build.sh stage    # writes stage.html instead
```

Requires `python` and `node` (the build refuses to write the page if the JS does not parse). Open `index.html` in any modern browser.

`tools/music.py` documents how the embedded music was produced. The audio itself is embedded in the built page.

## Credits

- 3D engine: [three.js](https://threejs.org/) (MIT).

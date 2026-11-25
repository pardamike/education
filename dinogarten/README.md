# Dinogarten

A free, offline dinosaur learning game for kindergarteners. You are a little T. rex. Walk around, meet other dinosaurs, and learn letters and numbers from them.

**Status:** early. You can walk around the world and meet a Triceratops, a Stegosaurus and a cranky old Spinosaurus under a skyline of volcanoes. Lessons, voices, player names and installers are still to come. The planned cast is in [DINOSAURS.md](DINOSAURS.md).

## Run it

You need [Node.js](https://nodejs.org) 24 or newer and [pnpm](https://pnpm.io).

```sh
pnpm install
pnpm dev        # opens the game and reloads as you edit
```

Click where you want the T. rex to go, or use the arrow keys.

Other commands: `pnpm build` makes a production build in `out/`, `pnpm start` runs that build, and `pnpm typecheck` checks the TypeScript.

## Add a dinosaur

Every folder in `content/dinos/` is a dinosaur. Add a folder and it appears in the world; no code changes.

```
content/dinos/triceratops/
  dino.json     its name, how to say it, what it eats, where it stands, how it looks
  model.glb     the 3D model
```

The `look` section of `dino.json` is where a model is made friendly:

- `height`: how tall it stands. The little T. rex is 1.7.
- `colors`: a colour for each of the model's colour slots, or `"hidden"` to leave a part out (the T. rex's teeth, for example).
- `eyes`: where the cartoon eyes sit, measured from the base of the head as fractions of the dinosaur's height. Every head is a different shape, so expect to nudge these while looking at the game. Add `lid` and `frown` for heavy, grumpy eyelids.
- `boneScales`: resize parts of the skeleton. A bigger `Head` and a shorter `Tail1` make a youngster. Three numbers instead of one stretch a bone along its own axes, which is how a head becomes a long snout.
- `parts`: extra body parts built in code and pinned to the skeleton, such as a `sail`.

A new animal does not need a new model. The Spinosaurus is the T. rex model with different colours, a stretched head, bigger arms and a sail; see [DINOSAURS.md](DINOSAURS.md).

The player's own settings are in `content/player/player.json`.

## How it is built

- [Electron](https://www.electronjs.org) wraps the game as a desktop app.
- [Three.js](https://threejs.org) draws the 3D world (`src/renderer/src/world/`).
- [React](https://react.dev) will draw the menus and lessons on top.

## Credits

See [CREDITS.md](CREDITS.md).

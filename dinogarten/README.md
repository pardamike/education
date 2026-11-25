# Dinogarten

A free, offline dinosaur learning game for kindergarteners. You are a little T. rex. Walk around, meet other dinosaurs, and learn letters and numbers from them.

**Status:** early. You can walk around a fern meadow, down a beach and into a deep underwater world, and meet sixteen other kinds of animal, including a towering Brachiosaurus, a flock of Microraptors, a cranky old Spinosaurus in his rocky inlet, a toothy Mosasaurus and a gentle Plesiosaurus on the sea floor, and two flying reptiles overhead, under a skyline of volcanoes. Walk up to any land dinosaur and it introduces itself out loud; the Triceratops then gives the first lesson, finding the letter T. More lessons, player names, saved progress and installers are still to come. The planned cast is in [DINOSAURS.md](DINOSAURS.md).

## Run it

You need [Node.js](https://nodejs.org) 24 or newer and [pnpm](https://pnpm.io).

```sh
pnpm install
pnpm dev        # opens the game and reloads as you edit
```

Click where you want the T. rex to go, or use the arrow keys.

Walk up to a dinosaur and stop beside it. The camera swings round to show the two of them face to face, and the dinosaur says hello, says its name slowly, and says what it eats. If it has a lesson, that comes next. Walk away at any time to end the meeting.

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
- `eyes`: where the cartoon eyes sit, measured from the base of the head as fractions of the dinosaur's height. Every head is a different shape, so expect to nudge these while looking at the game. Add `lid`, `frown`, `brow` and a smaller `pupil` for a grumpy or angry face.
- `boneScales`: resize parts of the skeleton. A bigger `Head` and a shorter `Tail1` make a youngster. Three numbers instead of one stretch a bone along its own axes, which is how a head becomes a long snout.
- `pose`: turns a bone on top of every animation, to change how the animal stands. The Brachiosaurus is the Apatosaurus with its body tipped back and its neck raised.
- `stretch`: makes the whole animal wider or longer for its height. The Ankylosaurus is a Stegosaurus stretched wide and low.
- `lengthen`: makes every separate piece in a colour slot longer, such as a row of teeth, or shorter with a number below 1.
- `slim`: pulls the body's surface in around the bones you list, for a leaner animal.
- `parts`: extra body parts built in code and pinned to the skeleton. A `sail` runs along the back, `studs` are rows of bumps or spikes that wrap round the body, and a `cone` or a `ball` makes a horn, a crest or a tail club.

An animal built in code has no `model.glb`; its `dino.json` names it with `madeInCode`, and `swims` gives the stretch of water it patrols. The Mosasaurus and the Plesiosaurus are made this way.

A flier has `flies` in its `dino.json`: the patch of sky it circles. The fliers all use the pterosaur model, whose colours are `Body`, `Wings`, `Crest` and `Beak`, and whose wingspan comes out at about four and a half times its `height`.

`flock` makes a whole group of one animal, scattered around its position, each a little different in size.

Outside `look`, two settings help with giants: `"turnsToPlayer": false` makes an animal stand still instead of swinging round to watch the player, and `personalSpace` sets how close the player can get.

A new animal does not need a new model. The Spinosaurus is the T. rex model with different colours, a stretched head, bigger arms and a sail. Seven of the animals are made this way; see [DINOSAURS.md](DINOSAURS.md).

The player's own settings are in `content/player/player.json`.

## Add a lesson

A dinosaur gives a lesson when its `dino.json` has a `lesson`. The Triceratops has the first one:

```json
"lesson": { "type": "find-letter", "letter": "T", "others": ["S", "O"] }
```

`find-letter` shows the letter among the others on big tiles and asks for it. There is no way to fail: a wrong tile fades away with a "try again", and when only the right one is left the dinosaur points it out. A right answer earns a star, and both dinosaurs jump for joy.

Each kind of lesson is one file in `src/renderer/src/lessons/`. The player cannot read yet, so a lesson must work by listening and looking alone.

## Voices

Every line a dinosaur says is a small sound file in its own folder, `content/dinos/<id>/voice/`. The files are made from text by Kokoro, a free speech model that runs on your own computer, and they are committed, so the game itself needs nothing extra to play them.

After changing a dinosaur's name, lesson or voice, make its lines again:

```sh
cd tools/voices
pnpm install    # once. It is big: about 450 MB of tools, plus a 92 MB model on the first run
pnpm make
```

Each dinosaur's `dino.json` picks its voice and how fast it talks, under `voice`. How to change a line, or fix how a name is said, is in [tools/voices/README.md](tools/voices/README.md).

## How it is built

- [Electron](https://www.electronjs.org) wraps the game as a desktop app.
- [Three.js](https://threejs.org) draws the 3D world (`src/renderer/src/world/`).
- [React](https://react.dev) will draw the menus and lessons on top.

## Credits

See [CREDITS.md](CREDITS.md).

# Dinogarten

A free, offline dinosaur learning game for kindergarteners. You are a little T. rex. Walk around, meet other dinosaurs, and learn letters and numbers from them.

**Status:** early. You can walk around a fern meadow, down a beach and into a deep underwater world, and meet sixteen other kinds of animal, including a towering Brachiosaurus, a flock of Microraptors, a cranky old Spinosaurus in his rocky inlet, a toothy Mosasaurus and a gentle Plesiosaurus on the sea floor, and two flying reptiles overhead, under a skyline of volcanoes. Walk up to any land dinosaur and it introduces itself out loud. Some of them then give a lesson: finding letters and numbers, counting eggs, finding keys on the real keyboard and typing short words. Each lesson has three levels that get harder. Each player has a name, a colour and saved stars. More lessons and installers are still to come. The cast, and who teaches what, is in [DINOSAURS.md](DINOSAURS.md).

## Run it

You need [Node.js](https://nodejs.org) 24 or newer and [pnpm](https://pnpm.io).

```sh
pnpm install
pnpm dev        # opens the game and reloads as you edit
```

The game opens by asking who is playing. A grown-up adds each player once: type a name and choose an egg. From then on a child picks their own egg, and the little T. rex comes out in that colour. The button in the top corner of the game goes back to change player.

Click where you want the T. rex to go, or use the arrow keys. The letter keys are kept free for lessons that ask for typing.

Walk up to a dinosaur and stop beside it. The camera swings round to show the two of them face to face, and the dinosaur says hello, says its name slowly, and says what it eats. If it has a lesson, that comes next. The next time you meet the same dinosaur, it just says hello again and gets on with the lesson. Walk away at any time to end the meeting.

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

## Players and saved stars

Everyone who plays on a computer, and the stars each has earned, is kept in one small file:

- macOS: `~/Library/Application Support/dinogarten/players.json`
- Windows: `%APPDATA%\dinogarten\players.json`

Delete the file to start everyone afresh, or copy it to keep a backup. It is outside this folder, so players' names never end up in git.

A player earns one star for each level of a dinosaur's lesson they finish, so a dinosaur with three levels can give three stars. Each dinosaur's stars are saved by its folder name, like `"triceratops": 2`. A round can be played again as often as they like; the stars are kept.

## Add a lesson

A dinosaur gives a lesson when its `dino.json` has a `lesson`. A lesson is a kind of game and a list of `levels` that get harder. Each visit is a round of three questions at the player's level for that dinosaur. There are five kinds so far.

```json
"lesson": { "type": "find-letter", "levels": [ { "letters": "TSAPMD" }, { "letters": "ABCDEFGHIJKLMNOPQRSTUVWXYZ" }, { "letters": "ABCDEFGHIJKLMNOPQRSTUVWXYZ", "small": true } ] }
```

`find-letter` asks for one letter and shows it among two others on big tiles. Each question picks its letters from the level's `letters`. With `"small": true` the tiles show small letters, and a big capital beside them shows which one to match. The Triceratops has this one.

```json
"lesson": { "type": "find-number", "levels": [ { "numbers": [0, 5] }, { "numbers": [6, 10] }, { "numbers": [11, 20] } ] }
```

`find-number` is the same with numbers. A level's `numbers` are `[from, to]`, both included. The Stegosaurus has this one.

```json
"lesson": { "type": "count-eggs", "levels": [ { "eggs": [1, 5] }, { "eggs": [6, 10] }, { "eggs": [11, 20] } ] }
```

`count-eggs` shows a nest with that many eggs, up to 20. The player touches them one at a time, and the dinosaur counts along out loud. Then it asks for that number, shown among two close ones on big tiles. The Parasaurolophus has this one.

```json
"lesson": { "type": "find-key", "levels": [ { "keys": "SATPINMD" }, { "keys": "ABCDEFGHIJKLMNOPQRSTUVWXYZ" }, { "keys": "0123456789" } ] }
```

`find-key` asks for one letter or number from the level's `keys`. A big card shows it, above a picture of a keyboard, and the player presses that key on the real keyboard (clicking the picture works too). A wrong key shakes, and the dinosaur says which key it was and asks again. After two wrong keys the right one glows. The Velociraptor has this one.

```json
"lesson": { "type": "type-it", "levels": [ { "words": ["cat", "dog", "sun"] }, { "words": ["fox", "hen", "ant"] }, { "numbers": [10, 20] } ] }
```

`type-it` asks for a whole short word, or a number, and the player types it letter by letter on the real keyboard. A level has either `words` or a `numbers` range, `[from, to]`, both included (up to twenty). A card shows the word's picture and a faint slot for each letter to copy; a number has no picture. The slot to fill next pulses gently. A right key fills its slot and the dinosaur says the letter's name. A wrong key shakes and the dinosaur says "Try again!", and after two wrong keys on one slot the right key glows. When the last letter is in, every slot turns green. Each word needs a picture at `content/pictures/<word>.svg` (see [CREDITS.md](CREDITS.md) for where the current ones come from). The Dilophosaurus has this one.

How a round goes:

- The level is the number of stars the player has for that dinosaur, or the last level once they have them all.
- Three dots near the lesson fill in as questions are answered. Every question in a round is about something different.
- There is no way to fail: a wrong tile fades away with a "try again", and when only the right one is left the dinosaur points it out. (With keys, a wrong key says which key it was, and the right one glows after two.)
- A right answer makes both dinosaurs jump for joy, and the dinosaur says "yes!" before the next question.
- After the third question the dinosaur says "well done", and a big star and a big play button appear. Finishing a round earns a star. The play button starts the next round.

After adding or changing a lesson, make its spoken lines (see [Voices](#voices)).

To add a new kind of game:

1. Add its shape to `src/renderer/src/lessons/types.ts`, and its question shape if it needs one.
2. Make `lessons/<Game>.tsx` with a function that makes the questions for one level. If a question is a row of tiles to pick from, use `PickTile`; otherwise add a component that plays one question.
3. Add a line for it in `makeQuestions` in `lessons/Round.tsx`, and a line to show a question that is not a `PickTile`.
4. Add its clips to `buildLines` in `tools/voices/make.mjs`, and run `pnpm make`.

The player cannot read yet, so a game must work by listening and looking alone.

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
- [React](https://react.dev) draws the player picker, the name cards and the lessons on top (`src/renderer/src/`).
- The game's screen is a web page, which may not touch files. `src/main/` reads and writes the save file for it, and `src/preload/` is the small bridge between the two.

## Credits

See [CREDITS.md](CREDITS.md).

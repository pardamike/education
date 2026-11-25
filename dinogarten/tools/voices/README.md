# Dinosaur voices

Turns each dinosaur's lines into spoken clips with Kokoro, a free text-to-speech
model that runs on this computer. No account, no internet needed after the first run.

## Run it

    cd dinogarten/tools/voices
    pnpm install
    pnpm make

Clips are written to `content/dinos/<id>/voice/<clip>.ogg` (mono Ogg Opus, about
32 kbps, all at a similar loudness) together with `voice/lines.json`, which records
each clip's text, voice, speed and a hash. A second run skips every clip whose text,
voice and speed did not change, so it finishes in a fraction of a second.

`pnpm make triceratops velociraptor` only handles the dinosaurs you name.

## The clips

| clip | says |
| --- | --- |
| `hello` | Hello! I am a {name}. ("an" before a vowel) |
| `name` | {name}. (slower, the "how to say it" clip) |
| `eats` | I eat {eats}. |
| `ask`, `again`, `show`, `yes` | only for dinosaurs with a `find-letter` lesson |

`{name}` and `{eats}` come from `dino.json`. The lines live in `buildLines` in `make.mjs`.

## Change a voice

Each `dino.json` can have `"voice": { "name": "af_heart", "speed": 1 }`. Run `pnpm make`
and only that dinosaur's clips are redone. Available English voices:
`af_heart af_alloy af_aoede af_bella af_jessica af_kore af_nicole af_nova af_river af_sarah af_sky`,
`am_adam am_echo am_eric am_fenrir am_liam am_michael am_onyx am_puck am_santa`,
`bf_alice bf_emma bf_isabella bf_lily`, `bm_daniel bm_fable bm_george bm_lewis`.
(`a` = American, `b` = British, `f`/`m` = female/male.)

## Change a line

Edit `buildLines` in `make.mjs`, then run `pnpm make`.

## Fix how a name is said

Kokoro only takes plain text and works out the sounds itself, which can go wrong for
dinosaur names. To override one, add the sounds (IPA, the same symbols Kokoro uses)
for that dinosaur to `pronunciations.json`, for example
`"mosasaurus": "mˌoʊzəsˈɔːɹəs"`. `ˈ` marks the main stressed syllable and `ˌ` a lighter
one. The name must come last before punctuation in its line (it does in every line today).
Dinosaurs not listed use Kokoro's own guess.

## Check the names

`pnpm check` listens to every `name` and `hello` clip with a small local Whisper model
and prints what it heard next to the real name. This is a rough aid: Whisper spells
unusual words in odd ways, so judge the result with a pinch of salt.

## Downloads

On the first run the Kokoro model (`Kokoro-82M-v1.0-ONNX`, 8-bit, about 92 MB) is
downloaded. `pnpm check` also downloads Whisper (`whisper-base.en`, about 290 MB).
Both are stored inside `node_modules`, which git ignores, so nothing large lands in the repo.
The Opus encoder comes from the `ffmpeg-static` package, so nothing needs installing on the system.

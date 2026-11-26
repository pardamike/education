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
| `back`, `again`, `show`, `done` | only for dinosaurs with a lesson: "Hello again!" (said on later meetings), "Try again!", "Here it is!" (pointing out the answer), and "Well done! You did it!" |
| `ask-T`, `yes-T`, ... | `find-letter`: one pair for each letter any level can ask. "Can you find the letter T?" and "Yes! That is the letter T." The letter the dinosaur's name starts with adds " T is for Triceratops!" |
| `ask-7`, `yes-7`, ... | `find-number`: one pair for each number any level can ask, said as words ("Can you find the number seven?"), zero included |
| `ask-T`, `yes-T`, `ask-7`, `yes-7`, ... | `find-key`: one pair for each letter or number any level can ask. "Can you press the letter T?" and "Yes! That is the letter T.", or "Can you press the number seven?" and "Yes! That is the number seven." |
| `is-G`, `is-7`, ... | `find-key`: one for every letter and number, whatever the levels, for a key pressed by mistake: "That is the letter G." |
| `1`, `2`, `3`, ... | `count-eggs`: each number said while counting, up to the biggest nest |
| `ask`, `find-5`, `yes-5`, ... | `count-eggs`: "Can you count my eggs? Tap them, one by one.", then for each count any level can use, "Five eggs! Can you find the number five?" and "Yes! That is the number five. I have five eggs!" |
| `ask-cat`, `yes-cat`, `ask-12`, `yes-12`, ... | `type-it`: a pair for each word and each number any level can ask. "Let's write cat. C, A, T." and "Yes! C, A, T. That spells cat!", or "Let's write twelve. One, two." and "Yes! One, two. That makes twelve!" |
| `A`, `B`, ..., `0`, `1`, ..., `9` | `type-it`: the name of each letter used by any word ("A!") and of each digit ("Seven!"), said as the key is typed |

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

## Check the clips

`pnpm check` listens to every `name` and `hello` clip with a small local Whisper model
and prints what it heard next to the real name. `pnpm check triceratops` only does that
dinosaur. It then listens to all that dinosaur's lesson clips and prints any whose words
do not loosely match the text. This is a rough aid: Whisper spells unusual words in odd
ways, writes numbers as digits and is poor at single letters, so judge the result with a
pinch of salt.

## Downloads

On the first run the Kokoro model (`Kokoro-82M-v1.0-ONNX`, 8-bit, about 92 MB) is
downloaded. `pnpm check` also downloads Whisper (`whisper-base.en`, about 290 MB).
Both are stored inside `node_modules`, which git ignores, so nothing large lands in the repo.
The Opus encoder comes from the `ffmpeg-static` package, so nothing needs installing on the system.

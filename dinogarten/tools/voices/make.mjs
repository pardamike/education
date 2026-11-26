// Makes the spoken clips for every dinosaur.
// Reads content/dinos/<id>/dino.json, writes content/dinos/<id>/voice/<clip>.ogg
// and voice/lines.json. Clips whose text, voice and speed did not change are skipped.

import { KokoroTTS } from "kokoro-js";
import { phonemize } from "phonemizer";
import ffmpegPath from "ffmpeg-static";
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, rmSync, readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const dinosDir = join(here, "..", "..", "content", "dinos");

const MODEL = "onnx-community/Kokoro-82M-v1.0-ONNX";
const DEFAULT_VOICE = { name: "af_heart", speed: 1 };
const NAME_CLIP_SPEED = 0.8; // the "how to say it" clip is slower than the voice's normal speed

// Bump this when the audio processing below changes, so every clip gets rebuilt.
const PIPELINE_VERSION = "3";

const pronunciations = JSON.parse(readFileSync(join(here, "pronunciations.json"), "utf8"));

// The numbers as words, so the voice reads them the same way every time. NUMBERS[5] is "five".
const NUMBERS = [
  "zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten",
  "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen", "twenty",
];

// Every whole number from `from` to `to`, both included.
function range(from, to) {
  return Array.from({ length: to - from + 1 }, (_, i) => from + i);
}

function capital(word) {
  return word[0].toUpperCase() + word.slice(1);
}

// "a" or "an" in front of the name
function article(name) {
  return /^[aeiou]/i.test(name) ? "an" : "a";
}

// The list of clips for one dinosaur: [clipName, text, speedMultiplier, ipaForTheName]
function buildLines(id, dino) {
  const name = dino.name;
  const ipa = pronunciations[id]; // hand-written phonemes for the name, if we have them
  const lines = [
    ["hello", `Hello! I am ${article(name)} ${name}.`, 1, ipa],
    ["name", `${name}.`, NAME_CLIP_SPEED, ipa],
    ["eats", `I eat ${dino.eats}.`, 1],
  ];
  const lesson = dino.lesson;
  if (!lesson) return lines;
  lines.push(
    ["back", "Hello again!", 1],
    ["again", "Try again!", 1],
    ["show", "Here it is!", 1],
    ["done", "Well done! You did it!", 1],
  );
  // Everything a level can ask for, so every question has its clips.
  const letters = [...new Set(lesson.levels.flatMap((level) => (level.letters ?? "").split("")))].sort();
  const numbers = [...new Set(lesson.levels.flatMap((level) => range(...(level.numbers ?? level.eggs ?? [1, 0]))))].sort((a, b) => a - b);
  if (lesson.type === "find-letter") {
    for (const L of letters) {
      // The letter the dinosaur's name starts with also says so.
      const isFirst = name[0].toUpperCase() === L;
      lines.push(
        [`ask-${L}`, `Can you find the letter ${L}?`, 1],
        [`yes-${L}`, `Yes! That is the letter ${L}.${isFirst ? ` ${L} is for ${name}!` : ""}`, 1, isFirst ? ipa : undefined],
      );
    }
  }
  if (lesson.type === "find-number") {
    for (const n of numbers) {
      lines.push(
        [`ask-${n}`, `Can you find the number ${NUMBERS[n]}?`, 1],
        [`yes-${n}`, `Yes! That is the number ${NUMBERS[n]}.`, 1],
      );
    }
  }
  if (lesson.type === "count-eggs") {
    // One clip for each number said while counting: 1.ogg says "One!", 2.ogg says "Two!", and so on.
    for (let n = 1; n <= numbers[numbers.length - 1]; n++) lines.push([String(n), `${capital(NUMBERS[n])}!`, 1]);
    lines.push(["ask", "Can you count my eggs? Tap them, one by one.", 1]);
    for (const n of numbers) {
      const eggs = n === 1 ? "egg" : "eggs";
      lines.push(
        [`find-${n}`, `${capital(NUMBERS[n])} ${eggs}! Can you find the number ${NUMBERS[n]}?`, 1],
        [`yes-${n}`, `Yes! That is the number ${NUMBERS[n]}. I have ${NUMBERS[n]} ${eggs}!`, 1],
      );
    }
  }
  return lines;
}

function hashOf(text, ipa, voice, speed) {
  return createHash("sha1").update(JSON.stringify([PIPELINE_VERSION, text, ipa, voice, speed])).digest("hex").slice(0, 12);
}

// Turn text into phonemes the same way kokoro-js does: punctuation is kept,
// the words between it are phonemized by espeak (the same engine kokoro-js uses).
async function phonemes(text) {
  const parts = text.split(/(\s*[;:,.!?\u2014\u2026"()]+\s*)/);
  const out = [];
  for (const part of parts) {
    if (part === "") continue;
    const isPunctuation = /^\s*[;:,.!?\u2014\u2026"()]+\s*$/.test(part);
    out.push(isPunctuation ? part : (await phonemize(part, "en-us")).join(" "));
  }
  return out.join("");
}

// Say a line. When we have hand-written phonemes (IPA) for the dinosaur name,
// the text is split at the name: the words around it go through espeak and the
// name uses our phonemes. The name must be the last word before punctuation.
async function speak(tts, text, name, ipa, voice, speed) {
  if (!ipa) return tts.generate(text, { voice, speed });
  const at = text.indexOf(name);
  const before = text.slice(0, at);
  const after = text.slice(at + name.length);
  const space = before.endsWith(" ") ? " " : ""; // espeak drops the space after "a", so put it back
  const phonemeString = ((await phonemes(before)) + space + ipa + (await phonemes(after))).trim();
  const { input_ids } = tts.tokenizer(phonemeString, { truncation: true });
  return tts.generate_from_ids(input_ids, { voice, speed });
}

function ffmpeg(args) {
  return execFileSync(ffmpegPath, ["-hide_banner", "-loglevel", "error", "-y", ...args], { encoding: "utf8" });
}

// Cut silence at both ends (the end is cut by reversing, cutting the start, reversing back).
const TRIM = "silenceremove=start_periods=1:start_threshold=-45dB:detection=peak";
const TRIM_BOTH = `${TRIM},areverse,${TRIM},areverse`;
const LOUD = "I=-18:TP=-1.5:LRA=11";

// First pass: measure loudness (ffmpeg prints the numbers to stderr).
// A single word ("One!") is too short for ffmpeg to measure, so it is measured played several times over.
function measure(wavPath, repeated = false) {
  const again = repeated ? ",aloop=loop=5:size=240000" : "";
  const r = spawnSync(
    ffmpegPath,
    ["-hide_banner", "-nostats", "-i", wavPath, "-af", `${TRIM_BOTH}${again},loudnorm=${LOUD}:print_format=json`, "-f", "null", "-"],
    { encoding: "utf8" },
  );
  const json = r.stderr.slice(r.stderr.lastIndexOf("{"), r.stderr.lastIndexOf("}") + 1);
  const measured = JSON.parse(json);
  if (!repeated && !Number.isFinite(Number(measured.input_i))) return measure(wavPath, true);
  return measured;
}

// Turn a raw wav into a mono Ogg Opus file at a steady loudness.
function encodeClip(wavPath, oggPath) {
  const m = measure(wavPath);
  const loud =
    `loudnorm=${LOUD}:measured_I=${m.input_i}:measured_TP=${m.input_tp}` +
    `:measured_LRA=${m.input_lra}:measured_thresh=${m.input_thresh}:offset=${m.target_offset}:linear=true`;
  // trim silence, even out loudness, then add 60 ms of lead and 150 ms of tail silence
  const filters = `${TRIM_BOTH},${loud},aresample=24000,aformat=channel_layouts=mono,adelay=60,apad=pad_dur=0.15`;
  ffmpeg(["-i", wavPath, "-af", filters, "-ac", "1", "-ar", "24000", "-c:a", "libopus", "-b:a", "32k", "-application", "voip", oggPath]);
}

// ---- main ----

// Optional: `pnpm make triceratops velociraptor` only handles those dinosaurs.
const only = process.argv.slice(2);
const ids = readdirSync(dinosDir, { withFileTypes: true })
  .filter((d) => d.isDirectory() && (only.length === 0 || only.includes(d.name)) && existsSync(join(dinosDir, d.name, "dino.json")))
  .map((d) => d.name)
  .sort();

// Work out what needs making first, so a no-change run does not even load the model.
const todo = [];
const linesToWrite = []; // written only after the clips exist
for (const id of ids) {
  const dino = JSON.parse(readFileSync(join(dinosDir, id, "dino.json"), "utf8"));
  const voice = { ...DEFAULT_VOICE, ...(dino.voice ?? {}) };
  const voiceDir = join(dinosDir, id, "voice");
  const linesPath = join(voiceDir, "lines.json");
  const old = existsSync(linesPath) ? JSON.parse(readFileSync(linesPath, "utf8")) : {};
  const next = {};
  for (const [clip, text, mult, ipa] of buildLines(id, dino)) {
    const speed = Math.round(voice.speed * mult * 1000) / 1000;
    const hash = hashOf(text, ipa, voice.name, speed);
    next[clip] = { text, ...(ipa ? { ipa } : {}), voice: voice.name, speed, hash };
    const upToDate = old[clip]?.hash === hash && existsSync(join(voiceDir, `${clip}.ogg`));
    if (!upToDate) todo.push({ id, name: dino.name, ipa, clip, text, voice: voice.name, speed, voiceDir });
  }
  // Remove clips that are no longer wanted (e.g. a lesson was taken away).
  for (const clip of Object.keys(old)) {
    if (!next[clip]) rmSync(join(voiceDir, `${clip}.ogg`), { force: true });
  }
  mkdirSync(voiceDir, { recursive: true });
  linesToWrite.push([linesPath, next]);
}

function writeLines() {
  for (const [path, lines] of linesToWrite) writeFileSync(path, JSON.stringify(lines, null, 2) + "\n");
}

if (todo.length === 0) {
  writeLines();
  console.log("All clips are up to date.");
  process.exit(0);
}

console.log(`Making ${todo.length} clip(s). Loading the model (first run downloads it)...`);
const tts = await KokoroTTS.from_pretrained(MODEL, { dtype: "q8", device: "cpu" });
const tmp = mkdtempSync(join(tmpdir(), "dino-voice-"));

for (const { id, name, ipa, clip, text, voice, speed, voiceDir } of todo) {
  const audio = await speak(tts, text, name, ipa, voice, speed);
  const wav = join(tmp, "clip.wav");
  await audio.save(wav);
  encodeClip(wav, join(voiceDir, `${clip}.ogg`));
  console.log(`  ${id}/${clip}  (${voice} x${speed})  "${text}"`);
}

rmSync(tmp, { recursive: true, force: true });
writeLines();
console.log("Done.");

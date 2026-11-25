// Development aid, not part of `make`.
// Listens to the "name" and "hello" clips with a small local Whisper model and
// prints what it heard next to the name we wanted.
// Usage: pnpm check [id ...]     (no ids = all dinosaurs)

import { pipeline } from "@huggingface/transformers";
import ffmpegPath from "ffmpeg-static";
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const dinosDir = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "content", "dinos");
const asr = await pipeline("automatic-speech-recognition", "Xenova/whisper-base.en");

// Decode an .ogg file to 16 kHz mono floats, which is what Whisper wants.
function load(path) {
  const raw = execFileSync(ffmpegPath, ["-v", "error", "-i", path, "-f", "f32le", "-ac", "1", "-ar", "16000", "-"], {
    maxBuffer: 1 << 28,
  });
  const samples = new Float32Array(raw.buffer, raw.byteOffset, raw.byteLength / 4);
  // Whisper does better on very short clips with half a second of silence around them.
  const padded = new Float32Array(samples.length + 16000);
  padded.set(samples, 8000);
  return padded;
}

const letters = (s) => s.toLowerCase().replace(/[^a-z]/g, "");

// 1 means identical letters, 0 means nothing in common (edit distance based).
function similarity(a, b) {
  a = letters(a);
  b = letters(b);
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 0; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return 1 - d[a.length][b.length] / Math.max(a.length, b.length, 1);
}

const wanted = process.argv.slice(2);
const ids = readdirSync(dinosDir).filter((id) => existsSync(join(dinosDir, id, "dino.json")) && (!wanted.length || wanted.includes(id)));

for (const id of ids) {
  const dino = JSON.parse(readFileSync(join(dinosDir, id, "dino.json"), "utf8"));
  for (const clip of ["name", "hello"]) {
    const file = join(dinosDir, id, "voice", `${clip}.ogg`);
    if (!existsSync(file)) continue;
    const heard = (await asr(load(file))).text.trim();
    // For "hello" compare the last word heard; for "name" the whole thing.
    const tail = heard.replace(/[.!?]+$/, "").split(/\s+/).pop();
    const score = similarity(clip === "hello" ? tail : heard, dino.name);
    console.log(`${id.padEnd(16)} ${clip.padEnd(6)} ${score.toFixed(2)}  heard: "${heard}"   wanted: ${dino.name}`);
  }
}

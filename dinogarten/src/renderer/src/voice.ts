// The dinosaurs' spoken lines. Each line is a short sound file at
// content/dinos/<dinosaur>/voice/<line>.ogg, made from text by the tool in tools/voices.

const files = import.meta.glob<string>('@content/dinos/*/voice/*.ogg', {
  eager: true,
  query: '?url',
  import: 'default'
})

/** "triceratops/hello" -> the address of that sound file. */
const clips = new Map<string, string>()
for (const [path, url] of Object.entries(files)) {
  const [dinosaur, , file] = path.split('/').slice(-3)
  clips.set(`${dinosaur}/${file!.replace(/\.ogg$/, '')}`, url)
}

/** How long a dinosaur with no recording for a line stays quiet in its place, in milliseconds. */
const SILENT_LINE_MS = 900

/** Whatever is being said right now, and how to tell whoever is waiting that it is over. */
let speaking: { audio: HTMLAudioElement | null; finish: () => void } | null = null

/** Stops whatever is being said. Anyone waiting for that line to end is let go at once. */
export function hush(): void {
  const stopped = speaking
  speaking = null
  stopped?.audio?.pause()
  stopped?.finish()
}

/**
 * Says one of a dinosaur's lines, cutting off anything already being said.
 * The promise settles when the line ends, or when it is cut short by `hush` or by another line.
 */
export function say(dinosaur: string, line: string): Promise<void> {
  hush()
  return new Promise((resolve) => {
    const url = clips.get(`${dinosaur}/${line}`)
    if (!url) {
      const timer = window.setTimeout(resolve, SILENT_LINE_MS)
      speaking = { audio: null, finish: () => (window.clearTimeout(timer), resolve()) }
      return
    }
    const audio = new Audio(url)
    const mine = { audio, finish: resolve }
    speaking = mine
    const done = (): void => {
      if (speaking === mine) speaking = null
      resolve()
    }
    audio.addEventListener('ended', done)
    audio.addEventListener('error', done)
    audio.play().catch(done)
  })
}

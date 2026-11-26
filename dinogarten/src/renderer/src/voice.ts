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

/** Whatever is being said right now, and how to tell whoever is waiting how it ended. */
let speaking: { audio: HTMLAudioElement | null; finish: (heard: boolean) => void } | null = null

/** Stops whatever is being said. Anyone waiting for that line to end is let go at once. */
export function hush(): void {
  const stopped = speaking
  speaking = null
  stopped?.audio?.pause()
  stopped?.finish(false)
}

/**
 * Says one of a dinosaur's lines, cutting off anything already being said.
 * The promise gives true when the line was heard to the end, and false when it was cut short
 * by `hush` or by another line. Whatever was going to be said next should then be left unsaid.
 */
export function say(dinosaur: string, line: string): Promise<boolean> {
  hush()
  return new Promise((resolve) => {
    const url = clips.get(`${dinosaur}/${line}`)
    const audio = url ? new Audio(url) : null
    const mine = { audio, finish: resolve }
    speaking = mine
    const done = (): void => {
      if (speaking === mine) speaking = null
      resolve(true)
    }
    if (!audio) {
      // No recording: stay quiet for a moment in its place, so the screen still keeps its pace.
      const timer = window.setTimeout(done, SILENT_LINE_MS)
      mine.finish = (heard) => (window.clearTimeout(timer), resolve(heard))
      return
    }
    audio.addEventListener('ended', done)
    audio.addEventListener('error', done)
    audio.play().catch(done)
  })
}

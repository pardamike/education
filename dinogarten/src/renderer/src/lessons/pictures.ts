// The pictures on the cards of "Type it": content/pictures/<word>.svg. They are only ever shown
// through an <img>, never put into the page, so nothing inside a picture can run.

const files = import.meta.glob<string>('@content/pictures/*.svg', {
  eager: true,
  query: '?url',
  import: 'default'
})

/** "cat" -> the address of its picture. */
const pictures = new Map<string, string>()
for (const [path, url] of Object.entries(files)) {
  pictures.set(path.split('/').pop()!.replace(/\.svg$/, ''), url)
}

/** The picture for a word, or nothing if the word has none. */
export function pictureOf(word: string): string | undefined {
  return pictures.get(word)
}

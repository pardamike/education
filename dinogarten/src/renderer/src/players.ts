// Everyone who plays on this computer, and the stars each has earned. It is all kept in one small
// file, which the main process reads and writes for us (see src/main/index.ts for where it lives).

/** The colours a player can be. The little T. rex wears them, and so does the player's egg on the picker. */
export const COLOURS = {
  green: { body: '#57b84a', belly: '#c9ea8f' },
  blue: { body: '#3f9fe6', belly: '#c4e4fb' },
  purple: { body: '#9a70e2', belly: '#e0d3f9' },
  pink: { body: '#ee6fa8', belly: '#fcd3e3' },
  orange: { body: '#f08b3c', belly: '#fcdcb0' },
  yellow: { body: '#e6ba2c', belly: '#fbf1b6' }
} as const

export type ColourName = keyof typeof COLOURS

export interface Player {
  id: string
  name: string
  colour: ColourName
  /** For each dinosaur, by folder name, how many of its levels this player has finished: one star each. */
  stars: Record<string, number>
}

export function totalStars(player: Player): number {
  return Object.values(player.stars).reduce((total, stars) => total + stars, 0)
}

/** Reads the stars of a saved player. The first saves listed the dinosaurs finished, which count as one star each. */
function loadStars(saved: unknown): Record<string, number> {
  const stars: Record<string, number> = {}
  if (Array.isArray(saved)) {
    for (const dinosaur of saved) if (typeof dinosaur === 'string') stars[dinosaur] = 1
  } else if (saved && typeof saved === 'object') {
    for (const [dinosaur, count] of Object.entries(saved)) {
      if (typeof count === 'number' && count > 0) stars[dinosaur] = Math.floor(count)
    }
  }
  return stars
}

declare global {
  interface Window {
    /** Set up by src/preload/index.ts. Missing only if the page is opened outside the game's own window. */
    saves?: { read(): Promise<unknown>; write(saves: unknown): Promise<void> }
  }
}

/** Reads the save file. Anything missing or odd in it is patched up, so an old or hand-edited file still loads. */
export async function loadPlayers(): Promise<Player[]> {
  const saved = (await window.saves?.read()) as { players?: Array<Partial<Omit<Player, 'stars'>> & { stars?: unknown }> } | null | undefined
  if (!Array.isArray(saved?.players)) return []
  return saved.players
    .filter((player) => typeof player?.name === 'string')
    .map((player, place) => ({
      id: typeof player.id === 'string' ? player.id : `player-${place}`,
      name: player.name!,
      colour: player.colour && player.colour in COLOURS ? player.colour : 'green',
      stars: loadStars(player.stars)
    }))
}

export function savePlayers(players: Player[]): void {
  void window.saves?.write({ players })
}

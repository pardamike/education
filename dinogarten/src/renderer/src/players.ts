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
  /** The dinosaurs whose lesson this player has finished, by folder name. One star each. */
  stars: string[]
}

declare global {
  interface Window {
    /** Set up by src/preload/index.ts. Missing only if the page is opened outside the game's own window. */
    saves?: { read(): Promise<unknown>; write(saves: unknown): Promise<void> }
  }
}

/** Reads the save file. Anything missing or odd in it is patched up, so an old or hand-edited file still loads. */
export async function loadPlayers(): Promise<Player[]> {
  const saved = (await window.saves?.read()) as { players?: Array<Partial<Player>> } | null | undefined
  if (!Array.isArray(saved?.players)) return []
  return saved.players
    .filter((player) => typeof player?.name === 'string')
    .map((player, place) => ({
      id: typeof player.id === 'string' ? player.id : `player-${place}`,
      name: player.name!,
      colour: player.colour && player.colour in COLOURS ? player.colour : 'green',
      stars: Array.isArray(player.stars) ? player.stars.filter((star) => typeof star === 'string') : []
    }))
}

export function savePlayers(players: Player[]): void {
  void window.saves?.write({ players })
}

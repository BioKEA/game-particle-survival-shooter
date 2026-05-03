import { BiokeaLeaderboard } from '@biokea/leaderboard'

export const GAME_ID = 'particle-survival-shooter'

export const leaderboard = new BiokeaLeaderboard({
  supabaseUrl: import.meta.env.VITE_SUPABASE_URL ?? '',
  supabaseKey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? '',
})

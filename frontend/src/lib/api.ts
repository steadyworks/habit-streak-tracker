const BACKEND = 'http://localhost:3001'

export interface HeatmapCell {
  date: string
  completed: boolean
}

export interface Habit {
  id: number
  name: string
  status: string
  current_streak: number
  longest_streak: number
  completed_today: boolean
  heatmap: HeatmapCell[]
}

export async function getHabits(): Promise<Habit[]> {
  const res = await fetch(`${BACKEND}/habits`)
  return res.json()
}

export async function createHabit(name: string): Promise<Habit> {
  const res = await fetch(`${BACKEND}/habits`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  })
  return res.json()
}

export async function getArchivedHabits(): Promise<Habit[]> {
  const res = await fetch(`${BACKEND}/habits/archived`)
  return res.json()
}

export async function archiveHabit(id: number): Promise<void> {
  await fetch(`${BACKEND}/habits/${id}/archive`, { method: 'PATCH' })
}

export async function unarchiveHabit(id: number): Promise<void> {
  await fetch(`${BACKEND}/habits/${id}/unarchive`, { method: 'PATCH' })
}

export async function deleteHabit(id: number): Promise<void> {
  await fetch(`${BACKEND}/habits/${id}`, { method: 'DELETE' })
}

export async function toggleComplete(id: number): Promise<void> {
  await fetch(`${BACKEND}/habits/${id}/complete`, { method: 'POST' })
}

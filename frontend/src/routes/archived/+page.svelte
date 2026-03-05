<script lang="ts">
  import { onMount } from 'svelte'
  import * as api from '$lib/api'
  import type { Habit } from '$lib/api'

  let habits: Habit[] = []

  onMount(async () => {
    habits = await api.getArchivedHabits()
  })

  async function unarchive(id: number) {
    await api.unarchiveHabit(id)
    habits = habits.filter((h) => h.id !== id)
  }
</script>

<main class="max-w-3xl mx-auto p-6 min-h-screen bg-gray-50">
  <h1 class="text-2xl font-bold text-gray-900 mb-2">Archived Habits</h1>
  <a href="/" class="text-blue-600 hover:underline text-sm block mb-6">← Back to dashboard</a>

  <div data-testid="archived-list">
    {#if habits.length === 0}
      <p class="text-gray-400 text-center py-16">No archived habits.</p>
    {:else}
      {#each habits as habit (habit.id)}
        <div data-testid="archived-card" class="bg-white rounded-xl shadow p-4 mb-4">
          <div class="flex items-center justify-between mb-3">
            <span data-testid="archived-name" class="text-lg font-medium text-gray-800">
              {habit.name}
            </span>
            <button
              data-testid="unarchive-btn"
              on:click={() => unarchive(habit.id)}
              class="text-sm bg-blue-100 text-blue-600 px-3 py-1 rounded hover:bg-blue-200"
            >
              Unarchive
            </button>
          </div>

          <!-- Heatmap -->
          <div data-testid="heatmap-grid" class="grid grid-cols-12 gap-0.5">
            {#each habit.heatmap as cell}
              <div
                data-testid="heatmap-cell"
                data-date={cell.date}
                data-completed={String(cell.completed)}
                class="w-3 h-3 rounded-sm {cell.completed ? 'bg-green-500' : 'bg-gray-200'}"
                title={cell.date}
              />
            {/each}
          </div>
        </div>
      {/each}
    {/if}
  </div>
</main>

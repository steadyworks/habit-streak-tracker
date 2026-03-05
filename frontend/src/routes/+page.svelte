<script lang="ts">
  import { onMount } from 'svelte'
  import * as api from '$lib/api'
  import type { Habit } from '$lib/api'

  let habits: Habit[] = []
  let showAddForm = false
  let newHabitName = ''

  $: completedCount = habits.filter((h) => h.completed_today).length
  $: totalCount = habits.length
  $: progressPercent = totalCount > 0 ? Math.floor((completedCount / totalCount) * 100) : 0
  // r = 100 / (2π) ≈ 15.91549 so circumference ≈ 100, making dasharray arithmetic clean
  $: dashOffset = 100 - progressPercent

  onMount(async () => {
    habits = await api.getHabits()
  })

  async function addHabit() {
    if (!newHabitName.trim()) return
    const habit = await api.createHabit(newHabitName.trim())
    habits = [...habits, habit]
    newHabitName = ''
    showAddForm = false
  }

  async function toggleComplete(habit: Habit) {
    await api.toggleComplete(habit.id)
    habits = await api.getHabits()
  }

  async function archiveHabit(id: number) {
    await api.archiveHabit(id)
    habits = habits.filter((h) => h.id !== id)
  }

  async function deleteHabit(id: number) {
    if (!confirm('Delete this habit permanently?')) return
    await api.deleteHabit(id)
    habits = habits.filter((h) => h.id !== id)
  }
</script>

<main class="max-w-3xl mx-auto p-6 min-h-screen bg-gray-50">
  <h1 class="text-3xl font-bold text-gray-900 mb-6">Habit Streak Tracker</h1>

  <!-- Summary bar -->
  <div data-testid="summary-bar" class="bg-white rounded-xl shadow p-4 mb-6 flex items-center gap-4">
    <div
      data-testid="progress-ring"
      data-progress={progressPercent}
      class="relative w-16 h-16 shrink-0"
    >
      <svg viewBox="0 0 36 36" class="w-full h-full -rotate-90">
        <circle cx="18" cy="18" r="15.91549" fill="none" stroke-width="3" class="stroke-gray-200" />
        <circle
          cx="18"
          cy="18"
          r="15.91549"
          fill="none"
          stroke-width="3"
          class="stroke-green-500"
          stroke-dasharray="{progressPercent} {100 - progressPercent}"
          stroke-linecap="round"
        />
      </svg>
    </div>
    <p data-testid="summary-text" class="text-lg text-gray-700">
      {completedCount} of {totalCount} habits completed today
    </p>
  </div>

  <!-- Top bar: nav + add button -->
  <div class="mb-4 flex justify-between items-center">
    <a href="/archived" class="text-blue-600 hover:underline text-sm">View archived habits</a>
    <button
      data-testid="add-habit-btn"
      on:click={() => { showAddForm = true; newHabitName = '' }}
      class="bg-green-500 text-white px-4 py-2 rounded-lg hover:bg-green-600 text-sm font-medium"
    >
      + Add Habit
    </button>
  </div>

  <!-- Add-habit form -->
  {#if showAddForm}
    <div class="bg-white rounded-xl shadow p-4 mb-4">
      <div class="flex gap-2">
        <input
          data-testid="habit-name-input"
          type="text"
          bind:value={newHabitName}
          placeholder="Habit name"
          class="flex-1 border border-gray-300 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-green-400"
          on:keydown={(e) => e.key === 'Enter' && addHabit()}
        />
        <button
          data-testid="habit-submit"
          on:click={addHabit}
          class="bg-green-500 text-white px-4 py-2 rounded-lg hover:bg-green-600 font-medium"
        >
          Create
        </button>
      </div>
    </div>
  {/if}

  <!-- Habit list -->
  <div data-testid="habit-list">
    {#if habits.length === 0}
      <div
        data-testid="empty-state"
        class="text-center text-gray-400 py-20 text-lg"
      >
        No habits yet. Add your first habit above!
      </div>
    {:else}
      {#each habits as habit (habit.id)}
        <div data-testid="habit-card" class="bg-white rounded-xl shadow p-4 mb-4">
          <!-- Header row -->
          <div class="flex items-center justify-between mb-3">
            <div class="flex items-center gap-3">
              <input
                data-testid="habit-checkbox"
                type="checkbox"
                checked={habit.completed_today}
                on:change={() => toggleComplete(habit)}
                class="w-5 h-5 accent-green-500 cursor-pointer"
              />
              <span data-testid="habit-name" class="text-lg font-medium text-gray-800">
                {habit.name}
              </span>
            </div>
            <div class="flex gap-2">
              <button
                data-testid="archive-btn"
                on:click={() => archiveHabit(habit.id)}
                class="text-sm bg-gray-100 text-gray-600 px-3 py-1 rounded hover:bg-gray-200"
              >
                Archive
              </button>
              <button
                data-testid="delete-btn"
                on:click={() => deleteHabit(habit.id)}
                class="text-sm bg-red-100 text-red-600 px-3 py-1 rounded hover:bg-red-200"
              >
                Delete
              </button>
            </div>
          </div>

          <!-- Streak counters -->
          <div class="flex gap-6 mb-3 text-sm text-gray-500">
            <span>
              🔥 Current streak:
              <span data-testid="streak-current" class="font-bold text-gray-800">
                {habit.current_streak}
              </span>
            </span>
            <span>
              🏆 Longest:
              <span data-testid="streak-longest" class="font-bold text-gray-800">
                {habit.longest_streak}
              </span>
            </span>
          </div>

          <!-- Heatmap (84 cells = 12 cols × 7 rows) -->
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

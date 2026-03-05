import { test, expect, type Page, type APIRequestContext, type Dialog } from '@playwright/test'

const FRONTEND = 'http://localhost:3000'
const BACKEND = 'http://localhost:3001'

// ---------------------------------------------------------------------------
// Date helpers
// ---------------------------------------------------------------------------

function dateOffset(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

// ---------------------------------------------------------------------------
// Locator helpers
// ---------------------------------------------------------------------------

function habitCard(page: Page, name: string) {
  return page
    .getByTestId('habit-card')
    .filter({ has: page.getByTestId('habit-name').filter({ hasText: name }) })
}

function archivedCard(page: Page, name: string) {
  return page
    .getByTestId('archived-card')
    .filter({ has: page.getByTestId('archived-name').filter({ hasText: name }) })
}

// ---------------------------------------------------------------------------
// UI helpers
// ---------------------------------------------------------------------------

async function addHabit(page: Page, name: string): Promise<void> {
  await page.getByTestId('add-habit-btn').click()
  await page.getByTestId('habit-name-input').fill(name)
  await page.getByTestId('habit-submit').click()
  // Wait until the card is visible
  await expect(habitCard(page, name)).toBeVisible({ timeout: 8000 })
}

/** Remove every habit in the system using UI interactions. */
async function clearAllHabits(page: Page): Promise<void> {
  const dialogHandler = (d: Dialog) => d.accept()
  page.on('dialog', dialogHandler)
  try {
    // ── Active habits ──────────────────────────────────────────────────────
    await page.goto(FRONTEND)
    await page.waitForLoadState('networkidle')

    let count = await page.getByTestId('delete-btn').count()
    while (count > 0) {
      await page.getByTestId('delete-btn').first().click()
      await page.waitForLoadState('networkidle')
      count = await page.getByTestId('delete-btn').count()
    }

    // ── Archived habits: unarchive them all first ──────────────────────────
    await page.goto(`${FRONTEND}/archived`)
    await page.waitForLoadState('networkidle')

    count = await page.getByTestId('unarchive-btn').count()
    while (count > 0) {
      await page.getByTestId('unarchive-btn').first().click()
      await page.waitForLoadState('networkidle')
      count = await page.getByTestId('unarchive-btn').count()
    }

    // ── Delete the newly-reactivated habits ────────────────────────────────
    await page.goto(FRONTEND)
    await page.waitForLoadState('networkidle')

    count = await page.getByTestId('delete-btn').count()
    while (count > 0) {
      await page.getByTestId('delete-btn').first().click()
      await page.waitForLoadState('networkidle')
      count = await page.getByTestId('delete-btn').count()
    }
  } finally {
    page.off('dialog', dialogHandler)
  }
}

// ---------------------------------------------------------------------------
// Date-override helpers
// ---------------------------------------------------------------------------

interface CompletionInfo {
  /** Base URL of the completion endpoint (query string stripped). */
  url: string
  /** HTTP method used to record a completion. */
  method: string
  /** Request body, if any. */
  postData: string | null
}

/**
 * Discovers the backend endpoint used when checking a habit off for today by
 * intercepting the network request triggered by clicking the checkbox.
 *
 * Side-effect: the checkbox is clicked ON then OFF, so today's completion
 * ends up cleared — the caller can re-check it as needed.
 */
async function discoverCompletionInfo(page: Page, name: string): Promise<CompletionInfo> {
  const card = habitCard(page, name)
  const checkbox = card.getByTestId('habit-checkbox')

  // Click to complete today; intercept the resulting API call.
  const [req] = await Promise.all([
    page.waitForRequest(
      (r) => r.url().startsWith(BACKEND) && r.method() !== 'GET',
      { timeout: 8000 },
    ),
    checkbox.click(),
  ])

  // Uncheck so today's completion is cleared before we record past dates.
  await checkbox.click()
  await page.waitForLoadState('networkidle')

  return {
    url: req.url().split('?')[0],
    method: req.method(),
    postData: req.postData(),
  }
}

/** Record a completion for a specific calendar date via the API date-override. */
async function recordPastCompletion(
  request: APIRequestContext,
  info: CompletionInfo,
  date: string,
): Promise<void> {
  const fetchOptions: Parameters<APIRequestContext['fetch']>[1] = {
    method: info.method,
  }
  if (info.postData) {
    fetchOptions.data = info.postData
    fetchOptions.headers = { 'Content-Type': 'application/json' }
  }
  const resp = await request.fetch(`${info.url}?date=${date}`, fetchOptions)
  // Accept any 2xx response — the exact status is an implementation detail.
  expect(resp.ok()).toBe(true)
}

// ---------------------------------------------------------------------------
// beforeEach — start each test with a clean slate
// ---------------------------------------------------------------------------

test.beforeEach(async ({ page }) => {
  await clearAllHabits(page)
  await page.goto(FRONTEND)
  await page.waitForLoadState('networkidle')
})

// ---------------------------------------------------------------------------
// TC-1: Daily summary reflects the correct completion count and progress
// ---------------------------------------------------------------------------

test('TC-1: daily summary shows correct count and progress ring', async ({ page }) => {
  await addHabit(page, 'Exercise')
  await addHabit(page, 'Read')
  await addHabit(page, 'Meditate')

  await habitCard(page, 'Exercise').getByTestId('habit-checkbox').click()
  await habitCard(page, 'Read').getByTestId('habit-checkbox').click()
  await page.waitForLoadState('networkidle')

  await expect(page.getByTestId('summary-text')).toContainText('2 of 3 habits completed today')
  await expect(page.getByTestId('progress-ring')).toHaveAttribute('data-progress', '66')
}, 45_000)

// ---------------------------------------------------------------------------
// TC-2: Three-day consecutive streak increments correctly; heatmap reflects
// ---------------------------------------------------------------------------

test('TC-2: three-day streak and heatmap reflect consecutive completions', async ({
  page,
  request,
}) => {
  await addHabit(page, 'Drink water')

  // Discover the completion endpoint (leaves today unchecked).
  const info = await discoverCompletionInfo(page, 'Drink water')

  // Record past completions via the date-override mechanism.
  await recordPastCompletion(request, info, dateOffset(-2))
  await recordPastCompletion(request, info, dateOffset(-1))

  // Reload so the frontend reflects the updated history.
  await page.goto(FRONTEND)
  await page.waitForLoadState('networkidle')

  // Complete today via UI.
  await habitCard(page, 'Drink water').getByTestId('habit-checkbox').click()
  await page.waitForLoadState('networkidle')

  const card = habitCard(page, 'Drink water')
  await expect(card.getByTestId('streak-current')).toHaveText('3')

  const heatmap = card.getByTestId('heatmap-grid')
  for (const date of [dateOffset(-2), dateOffset(-1), dateOffset(0)]) {
    await expect(
      heatmap.locator(`[data-testid="heatmap-cell"][data-date="${date}"]`),
    ).toHaveAttribute('data-completed', 'true')
  }
}, 45_000)

// ---------------------------------------------------------------------------
// TC-3: Streak resets to 1 after a missed day; longest streak is preserved
// ---------------------------------------------------------------------------

test('TC-3: streak resets after missed day; longest streak is preserved', async ({
  page,
  request,
}) => {
  await addHabit(page, 'Journal')

  // Discover the completion endpoint (leaves today unchecked).
  const info = await discoverCompletionInfo(page, 'Journal')

  // Three consecutive completions ending at today−2 (today−1 intentionally skipped).
  await recordPastCompletion(request, info, dateOffset(-4))
  await recordPastCompletion(request, info, dateOffset(-3))
  await recordPastCompletion(request, info, dateOffset(-2))

  // Reload and complete today — the chain is broken by the missed yesterday.
  await page.goto(FRONTEND)
  await page.waitForLoadState('networkidle')

  await habitCard(page, 'Journal').getByTestId('habit-checkbox').click()
  await page.waitForLoadState('networkidle')

  const card = habitCard(page, 'Journal')
  await expect(card.getByTestId('streak-current')).toHaveText('1')
  await expect(card.getByTestId('streak-longest')).toHaveText('3')
}, 45_000)

// ---------------------------------------------------------------------------
// TC-4: Archiving hides a habit; unarchiving restores it with history intact
// ---------------------------------------------------------------------------

test('TC-4: archiving hides a habit; unarchiving restores it with history', async ({ page }) => {
  await addHabit(page, 'Stretch')

  // Complete today.
  await habitCard(page, 'Stretch').getByTestId('habit-checkbox').click()
  await page.waitForLoadState('networkidle')

  // Archive.
  await habitCard(page, 'Stretch').getByTestId('archive-btn').click()
  await page.waitForLoadState('networkidle')

  // Should no longer appear in the active habit list.
  await expect(habitCard(page, 'Stretch')).toHaveCount(0)

  // Navigate to archived view.
  await page.goto(`${FRONTEND}/archived`)
  await page.waitForLoadState('networkidle')

  // Should appear in archived list.
  await expect(archivedCard(page, 'Stretch')).toBeVisible()

  // Unarchive.
  await archivedCard(page, 'Stretch').getByTestId('unarchive-btn').click()
  await page.waitForLoadState('networkidle')

  // Navigate back to dashboard.
  await page.goto(FRONTEND)
  await page.waitForLoadState('networkidle')

  // Should be back in the active list.
  const card = habitCard(page, 'Stretch')
  await expect(card).toBeVisible()

  // Today's completion is preserved.
  await expect(card.getByTestId('habit-checkbox')).toBeChecked()

  // Streak of 1 is preserved.
  await expect(card.getByTestId('streak-current')).toHaveText('1')
}, 45_000)

// ---------------------------------------------------------------------------
// TC-5: Deleting a habit removes it from all views and its history is gone
// ---------------------------------------------------------------------------

test('TC-5: deleting a habit removes it from all views', async ({ page }) => {
  await addHabit(page, 'Cold shower')

  await habitCard(page, 'Cold shower').getByTestId('habit-checkbox').click()
  await page.waitForLoadState('networkidle')

  // Accept any confirmation dialog the implementation may show.
  const dialogHandler = (d: Dialog) => d.accept()
  page.on('dialog', dialogHandler)

  await habitCard(page, 'Cold shower').getByTestId('delete-btn').click()
  await page.waitForLoadState('networkidle')

  page.off('dialog', dialogHandler)

  // Not in active list.
  await expect(habitCard(page, 'Cold shower')).toHaveCount(0)

  // Not in archived list either.
  await page.goto(`${FRONTEND}/archived`)
  await page.waitForLoadState('networkidle')
  await expect(archivedCard(page, 'Cold shower')).toHaveCount(0)
}, 30_000)

// ---------------------------------------------------------------------------
// TC-6: Empty state is shown when there are no active habits
// ---------------------------------------------------------------------------

test('TC-6: empty state is visible with no habits; hidden after adding one', async ({ page }) => {
  await expect(page.getByTestId('empty-state')).toBeVisible()

  await addHabit(page, 'Yoga')

  await expect(page.getByTestId('empty-state')).not.toBeVisible()
  await expect(habitCard(page, 'Yoga')).toBeVisible()
}, 20_000)

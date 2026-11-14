import { readFileSync } from 'node:fs';
import { test, expect, type Page, type APIRequestContext, type Browser, type BrowserContextOptions } from '@playwright/test';
import pg from 'pg';

// Runs against the built app with E2E=1 (emails are captured instead of sent) and a database
// loaded with 12 round 1 questions. Tests run in order and share state.
const ADMIN = process.env.ADMIN_EMAIL ?? 'admin@example.org';
const TRAINEE = 'trainee@example.org';
const SHOTS = 'e2e/screenshots';
const TRAINEE_STATE = 'e2e/.state-trainee.json';
const ADMIN_STATE = 'e2e/.state-admin.json';
const db = new pg.Pool({ connectionString: process.env.TEST_DATABASE_URL });

async function lastLink(request: APIRequestContext, to: string): Promise<string> {
  const r = await request.get(`/api/test/last-email?to=${encodeURIComponent(to)}`);
  expect(r.ok(), `an email was sent to ${to}`).toBeTruthy();
  const mail = await r.json();
  return new URL(mail.link).pathname + new URL(mail.link).search;
}

async function signIn(page: Page, email: string, viaInvite = false) {
  if (!viaInvite) {
    await page.goto('/login');
    await page.getByLabel('Email').fill(email);
    await page.getByRole('button', { name: 'Email me a sign-in link' }).click();
    await expect(page.getByText('Check your email')).toBeVisible();
  }
  await page.goto(await lastLink(page.request, email));
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL((u) => !u.pathname.startsWith('/auth'));
}

/** A signed-in trainee page that reuses the saved session (sign-in links are rate limited). */
async function traineePage(browser: Browser, opts: BrowserContextOptions = {}) {
  const context = await browser.newContext({ storageState: TRAINEE_STATE, ...opts });
  const page = await context.newPage();
  return { context, page };
}

async function adminPage(browser: Browser) {
  const context = await browser.newContext({ storageState: ADMIN_STATE });
  return { context, page: await context.newPage() };
}

const ORIGIN = () => process.env.BASE_URL ?? 'http://localhost:3000';

async function noSidewaysScroll(page: Page) {
  const r = await page.evaluate(() => {
    const over = document.documentElement.scrollWidth - document.documentElement.clientWidth;
    const culprits = [...document.querySelectorAll('body *')]
      .filter((el) => el.getBoundingClientRect().right > document.documentElement.clientWidth + 1)
      .slice(0, 5).map((el) => `${el.tagName.toLowerCase()}.${el.className}`);
    return { over, culprits };
  });
  expect(r.over, `${page.url()} scrolls sideways; widest: ${r.culprits.join(', ')}`).toBeLessThanOrEqual(0);
}

async function answerCurrent(page: Page, optionIndex: number, confidence: string) {
  await page.locator('.option').nth(optionIndex).click();
  await page.getByRole('button', { name: confidence }).click();
  await page.getByRole('button', { name: 'Submit answer' }).click();
}

test.describe.serial('Web app', () => {
  test.afterAll(async () => { await db.end(); });

  test('health check reports the database and questions', async ({ request }) => {
    const r = await request.get('/api/health');
    expect(r.status()).toBe(200);
    expect(await r.json()).toMatchObject({ ok: true, db: true, items: 12 });
  });

  test('signed-out visitors are sent to sign in, and APIs refuse them', async ({ page, request }) => {
    await page.goto('/');
    await expect(page).toHaveURL(/\/login$/);
    await page.screenshot({ path: `${SHOTS}/01-login.png`, fullPage: true });
    expect((await request.get('/api/sets/next')).status()).toBe(401);
  });

  test('the brand comes from the brand file: header, logo, title, manifest and icons', async ({ page, request }) => {
    const brand = JSON.parse(readFileSync(`brand/${process.env.BRAND ?? 'fellowpilot'}/brand.json`, 'utf8'));
    await page.goto('/login');
    await expect(page.getByRole('link', { name: `${brand.name} home` })).toBeVisible();
    await expect(page.getByRole('img', { name: brand.name })).toBeVisible();
    await expect(page).toHaveTitle(`Sign in – ${brand.name}`);
    const manifest = await (await request.get('/manifest.webmanifest')).json();
    expect(manifest.name).toBe(brand.name);
    for (const icon of manifest.icons) expect((await request.get(icon.src)).status()).toBe(200);
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.screenshot({ path: `${SHOTS}/01-login-dark.png`, fullPage: true });
    await page.emulateMedia({ colorScheme: 'light' });
  });

  test('unknown emails get the same reply and no email', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('Email').fill('stranger@example.org');
    await page.getByRole('button', { name: 'Email me a sign-in link' }).click();
    await expect(page.getByText('Check your email')).toBeVisible();
    expect((await page.request.get('/api/test/last-email?to=stranger@example.org')).status()).toBe(404);
  });

  test('first admin signs in, accepts the terms and invites a trainee', async ({ page }) => {
    await signIn(page, ADMIN);
    await expect(page).toHaveURL(/\/welcome$/);
    await page.screenshot({ path: `${SHOTS}/02-welcome.png`, fullPage: true });
    await page.getByLabel('Your name').fill('Sam Admin');
    await page.getByRole('button', { name: 'PGY2' }).click();
    await page.getByLabel(/I understand how my data is used/).check();
    await page.getByRole('button', { name: 'Start practising' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Sam');
    await page.context().storageState({ path: ADMIN_STATE });

    await page.goto('/admin');
    await page.getByLabel('Email').fill(TRAINEE);
    await page.getByLabel(/^Name/).fill('Test Trainee');
    await page.getByRole('button', { name: 'Send invitation' }).click();
    await expect(page.getByText(`Invitation sent to ${TRAINEE}`)).toBeVisible();
    await expect(page.getByRole('cell', { name: TRAINEE })).toBeVisible();
    await page.screenshot({ path: `${SHOTS}/03-admin.png`, fullPage: true });
  });

  test('a sign-in link works once', async ({ page }) => {
    const link = await lastLink(page.request, TRAINEE);
    await signIn(page, TRAINEE, true);
    await expect(page).toHaveURL(/\/welcome$/);
    await page.context().clearCookies();
    await page.goto(link);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page.getByText(/expired or was already used/)).toBeVisible();
  });

  test('trainee practises a set: change of answer, confidence, feedback, flag, summary', async ({ page }) => {
    await signIn(page, TRAINEE);
    await page.getByLabel('Your name').fill('Test Trainee');
    await page.getByRole('button', { name: 'PGY1' }).click();
    await page.getByLabel(/I understand how my data is used/).check();
    await page.getByRole('button', { name: 'Start practising' }).click();
    await expect(page.getByRole('link', { name: 'Quick set: 10 questions' })).toBeVisible();
    await page.context().storageState({ path: TRAINEE_STATE });
    await page.screenshot({ path: `${SHOTS}/04-home.png`, fullPage: true });

    await page.getByRole('link', { name: 'Quick set: 10 questions' }).click();
    await expect(page.getByText('Question 1 of 10')).toBeVisible();
    const submit = page.locator('.actionbar .btn');
    await expect(submit).toBeDisabled();
    await expect(submit).toHaveText('Choose an answer');

    // Pick one option, then change to another, then rate confidence.
    await page.locator('.option').nth(1).click();
    await page.locator('.option').nth(0).click();
    await expect(submit).toHaveText('Rate your confidence');
    await page.getByRole('button', { name: 'Fairly sure' }).click();
    await page.screenshot({ path: `${SHOTS}/05-question.png`, fullPage: true });
    await page.getByRole('button', { name: 'Submit answer' }).click();

    await expect(page.getByText(/^(Correct|Not this time)$/)).toBeVisible();
    await expect(page.getByText(/-?\+?\d+ points/).first()).toBeVisible();
    await expect(page.getByText('Best answer')).toBeVisible();
    await expect(page.getByText('You changed your answer.')).toBeVisible();
    await page.getByRole('button', { name: 'Re-read the question' }).click();
    await page.screenshot({ path: `${SHOTS}/06-feedback.png`, fullPage: true });

    await page.getByRole('button', { name: 'Report a problem with this question' }).click();
    await page.getByLabel("What's wrong?").selectOption('typo');
    await expect(page.getByRole('button', { name: 'Send report' })).toBeDisabled();   // a comment is required
    await page.getByLabel(/^What looks wrong\?/).fill('Spelling mistake in the second sentence.');
    await page.getByRole('button', { name: 'Send report' }).click();
    await expect(page.getByText(/taken this question out of practice for everyone/)).toBeVisible();

    for (let i = 2; i <= 10; i++) {
      await page.getByRole('button', { name: i === 2 ? 'Next question' : 'Next question' }).click();
      await expect(page.getByText(`Question ${i} of 10`)).toBeVisible();
      await answerCurrent(page, i % 4, i % 3 === 0 ? 'Certain' : 'Unsure');
      await expect(page.getByText(/^(Correct|Not this time)$/)).toBeVisible();
    }
    await page.getByRole('button', { name: 'Finish set' }).click();
    await expect(page.getByRole('heading', { name: 'Set complete' })).toBeVisible();
    await expect(page.getByText(/of 10 correct/)).toBeVisible();
    // Ten answers earns the first achievement, announced on the summary.
    await expect(page.getByText('Achievement unlocked').first()).toBeVisible();
    await expect(page.getByText('First steps')).toBeVisible();
    await expect(page.getByRole('link', { name: /^Write a question on / })).toBeVisible();
    await page.screenshot({ path: `${SHOTS}/07-summary.png`, fullPage: true });

    // The database marked every answer from the stored key, and kept the change of answer.
    const { rows } = await db.query(
      `SELECT a.correct, a.final_option, a.first_option, a.n_changes, a.change_path, a.final_confidence, v.key
         FROM answer a JOIN user_profile p ON p.user_id = a.user_id
         JOIN item_version v ON v.item_id = a.item_id AND v.version = a.item_version
        WHERE p.email = $1 ORDER BY a.client_ts`, [TRAINEE]);
    expect(rows).toHaveLength(10);
    for (const r of rows) expect(r.correct).toBe(r.final_option === r.key);
    expect(rows[0].n_changes).toBe(1);
    expect(rows[0].change_path).toMatch(/^[A-D]>[A-D]$/);
    expect(rows[0].final_confidence).toBe(3);
    const flags = await db.query(
      `SELECT f.reason, f.suspended_item, i.status, i.status_before_review FROM flag f JOIN user_profile p ON p.user_id = f.user_id
         JOIN item i ON i.id = f.item_id WHERE p.email = $1`, [TRAINEE]);
    expect(flags.rows).toHaveLength(1);
    expect(flags.rows[0]).toMatchObject({ reason: 'typo', suspended_item: true, status: 'under_review' });
    expect(['live', 'pretest']).toContain(flags.rows[0].status_before_review);
    const ev = await db.query(
      `SELECT event_type, count(*)::int AS n FROM event e JOIN user_profile p ON p.user_id = e.user_id
        WHERE p.email = $1 GROUP BY event_type`, [TRAINEE]);
    const n = Object.fromEntries(ev.rows.map((r) => [r.event_type, r.n]));
    expect(n.item_presented).toBe(10);
    expect(n.answer_submitted).toBe(10);
    expect(n.option_selected).toBe(11);
    expect(n.change_reason_given).toBe(1);
    expect(n.item_flag_raised).toBe(1);
  });

  test('insights show the trainee their patterns', async ({ browser }) => {
    const { context, page } = await traineePage(browser);
    await page.goto('/insights');
    await expect(page.getByText(/10 questions answered/)).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Confidence against accuracy' })).toBeVisible();
    await expect(page.getByText(/Changed 1 of 10/)).toBeVisible();
    await expect(page.getByRole('cell', { name: 'After re-reading the question' })).toBeVisible();
    await page.screenshot({ path: `${SHOTS}/08-insights.png`, fullPage: true });
    await context.close();
  });

  test('reported questions come out of practice until resolved; weekly cap per trainee', async ({ browser }) => {
    const trainee = await traineePage(browser);
    const t = trainee.page;
    const { item_id: flagged, status_before_review: before } = (await db.query(
      `SELECT f.item_id, i.status_before_review FROM flag f JOIN user_profile p ON p.user_id = f.user_id JOIN item i ON i.id = f.item_id
        WHERE p.email = $1 AND f.suspended_item`, [TRAINEE])).rows[0];
    // Out of practice for everyone while the report is open.
    const set = await (await t.request.get('/api/sets/next?size=50')).json();
    expect(set.items.map((x: { item_id: string }) => x.item_id)).not.toContain(flagged);

    // The admin sees the signals and doesn't uphold it: back in practice.
    const admin = await adminPage(browser);
    await admin.page.goto('/admin');
    const report = admin.page.locator('article', { hasText: 'Spelling mistake in the second sentence.' });
    await expect(report.getByText('Taken out of practice')).toBeVisible();
    await expect(report.getByText(/Flagger: \d+ answered, \d+% correct overall; got this question (right|wrong)\./)).toBeVisible();
    await expect(report.getByText(/answered it without reporting/)).toBeVisible();
    await admin.page.screenshot({ path: `${SHOTS}/22-admin-reports.png`, fullPage: true });
    await report.getByRole('button', { name: 'Not upheld: put it back' }).click();
    await expect(report).toHaveCount(0);
    expect((await db.query('SELECT status, status_before_review FROM item WHERE id = $1', [flagged])).rows[0]).toEqual({ status: before, status_before_review: null });

    // Reported again and upheld: stays out until fixed, then put back.
    const send = (comment: string) => t.request.post('/api/flags', { headers: { origin: ORIGIN() },
      data: { item_id: flagged, item_version: 1, reason: 'wrong_key', comment } });
    expect((await send('short')).status()).toBe(400);
    expect((await (await send('The key contradicts current eTG advice.')).json()).suspended).toBe(true);
    await admin.page.reload();
    const again = admin.page.locator('article', { hasText: 'The key contradicts current eTG advice.' });
    await again.getByRole('button', { name: 'Upheld: keep it out until fixed' }).click();
    const held = admin.page.locator('article', { has: admin.page.getByRole('button', { name: 'Fixed: put it back' }) });
    await expect(held).toHaveCount(1);
    expect((await db.query('SELECT status FROM item WHERE id = $1', [flagged])).rows[0].status).toBe('under_review');
    await held.getByRole('button', { name: 'Fixed: put it back' }).click();
    await expect(held).toHaveCount(0);
    expect((await db.query('SELECT status FROM item WHERE id = $1', [flagged])).rows[0].status).toBe(before);
    await admin.context.close();

    // Over the weekly limit, a report is still recorded but doesn't take the question out.
    const uid = (await db.query('SELECT user_id FROM user_profile WHERE email = $1', [TRAINEE])).rows[0].user_id;
    await db.query(
      `INSERT INTO flag (item_id, item_version, user_id, reason, comment, suspended_item, status, outcome, action)
       SELECT $1, 1, $2, 'other', 'cap test', true, 'resolved', 'not_upheld', 'none' FROM generate_series(1, 5)`, [flagged, uid]);
    const capped = await (await send('Another concern about this question.')).json();
    expect(capped.suspended).toBe(false);
    expect((await db.query('SELECT status FROM item WHERE id = $1', [flagged])).rows[0].status).toBe(before);
    await db.query(`DELETE FROM flag WHERE user_id = $1 AND comment IN ('cap test', 'Another concern about this question.')`, [uid]);
    await trainee.context.close();
  });

  test('progress: weekly goal, curriculum map and achievements', async ({ browser }) => {
    const { context, page } = await traineePage(browser);
    await page.goto('/progress');
    await expect(page.getByRole('heading', { name: 'Progress', level: 1 })).toBeVisible();
    await expect(page.locator('.cmap .tile')).toHaveCount(20 + 28);   // learning areas plus outcome statements
    await expect(page.locator('.badge.done', { hasText: 'First steps' })).toContainText('Earned');
    await expect(page.locator('.badge.done', { hasText: 'First steps' })).toContainText('New');
    await page.screenshot({ path: `${SHOTS}/14-progress.png`, fullPage: true });

    // Seen once, no longer new; and the goal can be changed.
    await page.getByRole('button', { name: '50', exact: true }).click();
    await expect(page.getByRole('button', { name: '50', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await page.reload();
    await expect(page.locator('.badge.done', { hasText: 'First steps' })).not.toContainText('New');
    await page.goto('/');
    await expect(page.getByText(/of 50 questions/)).toBeVisible();
    const goal = await db.query(`SELECT u.weekly_goal FROM app_user u JOIN user_profile p ON p.user_id = u.id WHERE p.email = $1`, [TRAINEE]);
    expect(goal.rows[0].weekly_goal).toBe(50);
    expect((await page.request.put('/api/me/goal', { headers: { origin: ORIGIN() }, data: { weekly_goal: 7 } })).status()).toBe(400);
    await context.close();
  });

  test('study guide: confident errors first, then weak areas, with readings', async ({ browser }) => {
    const { context, page } = await traineePage(browser);
    await page.goto('/guide');
    await expect(page.getByRole('heading', { name: 'Your study guide' })).toBeVisible();
    await expect(page.getByText(/Built from your \d+ answers/)).toBeVisible();
    const open = await db.query(
      `SELECT count(*)::int AS n FROM answer a JOIN user_profile p ON p.user_id = a.user_id
        WHERE p.email = $1 AND a.attempt_number = 1 AND NOT a.correct AND a.final_confidence >= 3`, [TRAINEE]);
    if (open.rows[0].n > 0) {
      await expect(page.getByRole('heading', { name: '1. Fix these first' })).toBeVisible();
      await expect(page.locator('.guide-area').first().locator('.readings li').first()).toBeVisible();
    }
    await expect(page.getByRole('button', { name: 'Print or save as PDF' })).toBeVisible();
    await page.screenshot({ path: `${SHOTS}/15-guide.png`, fullPage: true });
    await context.close();
  });

  test('question writing: draft with checks and AI feedback, review, changes, acceptance', async ({ browser }) => {
    const { context, page } = await traineePage(browser);
    await page.goto('/write');
    await page.getByRole('link', { name: 'Start a new question' }).click();
    await expect(page.getByRole('heading', { name: 'New question' })).toBeVisible();

    // Sending an empty draft shows what's missing.
    await page.getByRole('button', { name: 'Send for review' }).click();
    await expect(page.getByText(/^Fix \d+ problems marked below first\.$/)).toBeVisible();
    await expect(page.getByText('Choose a learning area.')).toBeVisible();

    await page.locator('#q-area').selectOption('Emergency presentations');
    await page.locator('#q-pres').fill('anaphylaxis');
    await page.locator('#q-ctx').selectOption('ed');
    await page.locator('#q-stem').fill('A 24-year-old man presents to a rural emergency department 10 minutes after a bee sting with widespread urticaria, lip swelling, wheeze and a blood pressure of 80/50 mmHg. He has no other medical history and takes no regular medicines.');
    await page.locator('#q-lead').fill('What is the most appropriate first treatment?');
    const opts = { A: 'Intramuscular adrenaline 0.5 mg', B: 'Oral cetirizine 10 mg', C: 'Intravenous hydrocortisone 200 mg', D: 'Nebulised salbutamol 5 mg' };
    const why = {
      A: 'Intramuscular adrenaline is first-line for anaphylaxis with hypotension.',
      B: 'Antihistamines treat skin symptoms only and do not reverse shock.',
      C: 'Corticosteroids act too slowly to treat the acute reaction.',
      D: 'Salbutamol may help wheeze but does not treat the systemic reaction.',
    };
    for (const k of ['A', 'B', 'C', 'D'] as const) {
      await page.locator(`#q-opt-${k}`).fill(opts[k]);
      await page.locator(`#q-exp-${k}`).fill(why[k]);
    }
    await page.locator('input[name="q-key"]').nth(0).check();
    await page.locator('#q-lp').fill('Give IM adrenaline first in anaphylaxis.');
    await page.getByLabel('Reference 1 title').fill('ASCIA anaphylaxis guidelines');
    await expect(page.getByText('Add a setting note if')).toBeVisible();   // a warning, not a blocker

    await page.getByRole('button', { name: 'Get AI feedback' }).click();
    await expect(page.getByText('Mock coach (Emergency presentations).', { exact: false })).toBeVisible();
    await expect(page).toHaveURL(/\/write\/[0-9a-f-]{36}$/);
    await page.getByLabel(/I wrote this question myself/).check();
    await page.screenshot({ path: `${SHOTS}/16-write.png`, fullPage: true });
    await page.getByRole('button', { name: 'Send for review' }).click();
    await expect(page.locator('.status', { hasText: 'Waiting for review' })).toBeVisible();
    const id = page.url().split('/').at(-1)!;
    let d = await db.query('SELECT status, recall_declared, coaching IS NOT NULL AS coached FROM draft_item WHERE id = $1', [id]);
    expect(d.rows[0]).toEqual({ status: 'submitted', recall_declared: true, coached: true });

    // An admin asks for a change.
    const admin = await adminPage(browser);
    await admin.page.goto('/review');
    await admin.page.getByRole('link', { name: /anaphylaxis/ }).click();
    await expect(admin.page.getByText('Mock coach (Emergency presentations)', { exact: false })).toBeVisible();
    await admin.page.screenshot({ path: `${SHOTS}/17-review.png`, fullPage: true });
    await admin.page.getByLabel(/Request changes/).check();
    await admin.page.getByLabel(/Note to the author/).fill('Please add a setting note about repeat doses while awaiting retrieval.');
    await admin.page.getByRole('button', { name: 'Save review' }).click();
    await expect(admin.page).toHaveURL(/\/review$/);
    expect((await (await page.request.get(`/api/test/last-email?to=${encodeURIComponent(TRAINEE)}`)).json()).subject).toMatch(/^Changes requested/);

    // The author sees the note, edits and resends.
    await page.goto(`/write/${id}`);
    await expect(page.getByText('The reviewer asked for changes')).toBeVisible();
    await expect(page.getByText(/setting note about repeat doses/)).toBeVisible();
    await page.locator('#q-rural').fill('Repeat IM adrenaline every 5 minutes as needed while arranging retrieval.');
    await page.getByRole('button', { name: 'Send for review' }).click();
    await expect(page.locator('.status', { hasText: 'Waiting for review' })).toBeVisible();

    // Authors can't review their own; the admin accepts.
    const self = await page.request.post(`/api/questions/${id}`, { headers: { origin: ORIGIN() }, data: { action: 'review', decision: 'accept' } });
    expect(self.status()).toBe(403);
    await admin.page.goto(`/review/${id}`);
    await admin.page.getByLabel(/^Accept/).check();
    await admin.page.getByRole('button', { name: 'Save review' }).click();
    await expect(admin.page).toHaveURL(/\/review$/);
    await admin.context.close();

    d = await db.query(
      `SELECT d.status, i.status AS item_status, i.tenant_id IS NOT NULL AS local, v.provenance, v.key, v.learning_area, v.rural_note, v.review_level
         FROM draft_item d JOIN item i ON i.id = d.item_id JOIN item_version v ON v.item_id = i.id WHERE d.id = $1`, [id]);
    expect(d.rows[0]).toEqual({ status: 'accepted', item_status: 'pretest', local: true, provenance: 'trainee', key: 'A',
      learning_area: 'Emergency presentations', rural_note: 'Repeat IM adrenaline every 5 minutes as needed while arranging retrieval.', review_level: 'peer' });
    expect((await (await page.request.get(`/api/test/last-email?to=${encodeURIComponent(TRAINEE)}`)).json()).subject).toMatch(/^Your question was accepted/);

    // The author isn't served their own question, and earns the writing achievements.
    const itemId = (await db.query('SELECT item_id FROM draft_item WHERE id = $1', [id])).rows[0].item_id;
    const set = await (await page.request.get('/api/sets/next?size=50')).json();
    expect(set.items.map((x: { item_id: string }) => x.item_id)).not.toContain(itemId);
    await page.goto(`/write/${id}`);
    await expect(page.locator('.status', { hasText: 'Accepted' })).toBeVisible();
    await page.goto('/progress');
    await expect(page.locator('.badge.done', { hasText: 'Question writer' })).toBeVisible();
    await expect(page.locator('.badge.done', { hasText: 'Published' })).toBeVisible();
    await context.close();
  });

  test('admins edit achievements; trainees see the change', async ({ browser }) => {
    const admin = await adminPage(browser);
    const { page } = admin;
    await page.goto('/admin');
    await page.getByRole('link', { name: 'Edit achievements' }).click();
    await expect(page.getByRole('heading', { name: 'Achievements', level: 1 })).toBeVisible();

    // Validation shows on the field.
    await page.getByRole('button', { name: 'New achievement' }).click();
    const form = page.getByRole('form', { name: 'New achievement' });
    await form.getByLabel(/^ID/).fill('First Five');
    await form.getByLabel('Title').fill('Warm-up');
    await form.getByLabel('Rewards').selectOption('answered');
    await form.getByLabel('Questions', { exact: true }).fill('5');
    await form.getByRole('button', { name: 'Use this' }).click();
    await expect(form.getByLabel(/^How to earn it/)).toHaveValue('Answer 5 questions.');
    await form.getByLabel(/^ID/).fill('first-five!');
    await form.getByRole('button', { name: 'Add achievement' }).click();
    await expect(form.getByText(/lowercase letters, numbers or hyphens/)).toBeVisible();
    await form.getByLabel(/^ID/).fill('first-five');
    await form.getByLabel(/^Order/).fill('1');
    await page.screenshot({ path: `${SHOTS}/21-achievements-admin.png`, fullPage: true });
    await form.getByRole('button', { name: 'Add achievement' }).click();
    await expect(page.locator('.qlist .badge', { hasText: 'Warm-up' })).toContainText('This state only');

    // Rename an existing one.
    await page.getByRole('button', { name: 'Edit Century' }).click();
    const edit = page.getByRole('form', { name: 'Edit Century' });
    await edit.getByLabel('Title').fill('Hundred club');
    await edit.getByRole('button', { name: 'Save changes' }).click();
    await expect(page.locator('.qlist .badge', { hasText: 'Hundred club' })).toBeVisible();
    await admin.context.close();

    const { context, page: t } = await traineePage(browser);
    await t.goto('/progress');
    await expect(t.locator('.badge.done', { hasText: 'Warm-up' })).toContainText('Earned');
    await expect(t.locator('.badge', { hasText: 'Hundred club' })).toBeVisible();
    // Trainees can't use the editor.
    expect((await t.request.get('/api/admin/achievements')).status()).toBe(403);
    const put = await t.request.put('/api/admin/achievements/century', { headers: { origin: ORIGIN() }, data: { title: 'x' } });
    expect(put.status()).toBe(403);
    await context.close();

    // Switching it off hides it.
    const again = await adminPage(browser);
    await again.page.goto('/admin/achievements');
    await again.page.getByRole('button', { name: 'Edit Warm-up' }).click();
    await again.page.getByRole('form', { name: 'Edit Warm-up' }).getByLabel(/^Switched on/).uncheck();
    await again.page.getByRole('form', { name: 'Edit Warm-up' }).getByRole('button', { name: 'Save changes' }).click();
    await expect(again.page.locator('.qlist .badge', { hasText: 'Warm-up' })).toContainText('switched off');
    await again.context.close();
    const t2 = await traineePage(browser);
    await t2.page.goto('/progress');
    await expect(t2.page.locator('.badge', { hasText: 'Warm-up' })).toHaveCount(0);
    await t2.context.close();
  });

  test('answers made offline are kept and sent when back online', async ({ browser }) => {
    const { context, page } = await traineePage(browser);
    await page.goto('/practice?size=10');
    await expect(page.getByText('Question 1 of')).toBeVisible();
    await context.setOffline(true);
    await answerCurrent(page, 0, 'Guessing');
    await expect(page.getByText(/Answer saved on this device/)).toBeVisible();
    await page.screenshot({ path: `${SHOTS}/09-offline.png`, fullPage: true });
    const before = await db.query(`SELECT count(*)::int AS n FROM answer a JOIN user_profile p ON p.user_id = a.user_id WHERE p.email = $1`, [TRAINEE]);
    await context.setOffline(false);
    await page.evaluate(() => window.dispatchEvent(new Event('online')));
    await expect.poll(async () => (await db.query(
      `SELECT count(*)::int AS n FROM answer a JOIN user_profile p ON p.user_id = a.user_id WHERE p.email = $1`, [TRAINEE])).rows[0].n,
      { timeout: 15_000 }).toBe(before.rows[0].n + 1);
    await context.close();
  });

  test('onboarding: a goal plan sets the starting content and earns a badge', async ({ browser }) => {
    const { context, page } = await traineePage(browser);
    await page.goto('/');
    await page.getByRole('link', { name: 'Create my goal plan' }).click();
    await expect(page.getByRole('heading', { name: 'Your goal plan' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Save my plan' })).toBeDisabled();   // nothing filled in yet
    await page.locator('#g-0').fill('Be confident escalating a deteriorating patient overnight');
    await page.locator('#g-0-o-0').selectOption('1.9');
    await page.getByRole('button', { name: 'Add another goal' }).click();
    await page.locator('#g-1').fill('Prescribe fluids and electrolytes safely');
    await page.locator('#g-1-o-0').selectOption('1.8');
    await page.screenshot({ path: `${SHOTS}/26-onboarding.png`, fullPage: true });
    await page.getByRole('button', { name: 'Save my plan' }).click();
    await expect(page.getByRole('heading', { name: 'Plan saved' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Practise Deteriorating patient' })).toBeVisible();
    const plan = await db.query(`SELECT g.version, g.goals, u.pgy_level FROM goal_plan g JOIN app_user u ON u.id = g.user_id JOIN user_profile p ON p.user_id = u.id WHERE p.email = $1`, [TRAINEE]);
    expect(plan.rows).toHaveLength(1);
    expect(plan.rows[0].goals[0].outcomes).toEqual(['1.9']);
    expect(plan.rows[0].pgy_level).toBe(1);
    await page.goto('/progress');
    await expect(page.locator('.badge.done', { hasText: 'Plan in place' })).toBeVisible();
    await context.close();
  });

  test('logbook: reflections are encrypted at rest, tagged, counted on the outcome map, and deletable', async ({ browser }) => {
    const { context, page } = await traineePage(browser);
    await page.goto('/logbook');
    await page.getByRole('button', { name: /A time you escalated/ }).click();
    const text = 'Overnight a patient on the ward became hypotensive and tachycardic. I called the registrar early, gave a clear ISBAR handover and started fluids while waiting. Next time I would ask the nurse to call the rapid response team sooner.';
    await page.getByLabel(/What happened/).fill(text);
    await expect(page.getByRole('button', { name: /^1\.9 / })).toBeVisible();     // suggested from the words
    await page.getByRole('button', { name: /^1\.9 / }).click();
    await page.getByRole('button', { name: /^1\.1 / }).click();
    await page.screenshot({ path: `${SHOTS}/27-logbook.png`, fullPage: true });
    await page.getByRole('button', { name: 'Save entry' }).click();
    await expect(page.getByText(text)).toBeVisible();
    const saved = () => db.query(`SELECT r.tags, r.words, r.prompt_id, encode(r.body_enc, 'escape') AS raw FROM reflection r JOIN user_profile p ON p.user_id = r.user_id WHERE p.email = $1 AND r.deleted_at IS NULL`, [TRAINEE]);
    await expect.poll(async () => (await saved()).rows.length, { timeout: 10_000 }).toBe(1);
    const row = await saved();
    expect(row.rows[0].tags.sort()).toEqual(['1.1', '1.9']);
    expect(row.rows[0].prompt_id).toBe('escalation');
    expect(row.rows[0].raw).not.toContain('hypotensive');                          // encrypted, not plain text
    await page.goto('/progress');
    await expect(page.locator('.badge.done', { hasText: 'First reflection' })).toBeVisible();
    await expect(page.locator('.tile', { hasText: '1.9' })).toContainText('1r');
    await page.goto('/logbook');
    page.once('dialog', (d) => d.accept());
    await page.getByRole('button', { name: 'Delete' }).first().click();
    await expect(page.getByText(text)).toHaveCount(0);
    await context.close();
  });

  test('streak pauses and teams', async ({ browser }) => {
    const { context, page } = await traineePage(browser);
    await page.goto('/progress');
    await page.getByRole('button', { name: /Pause my streak/ }).click();
    await page.locator('#ps').fill('2026-12-21');
    await page.locator('#pe').fill('2026-12-27');
    await page.getByRole('button', { name: 'Leave', exact: true }).click();
    await page.getByRole('button', { name: 'Save pause' }).click();
    await expect(page.getByText(/21 Dec to 27 Dec: Leave/)).toBeVisible();
    expect((await page.request.post('/api/me/pauses', { headers: { origin: ORIGIN() }, data: { starts_on: '2026-01-01', ends_on: '2026-06-01', reason: 'leave' } })).status()).toBe(400);

    await page.goto('/team');
    await page.getByLabel('Team name').fill('Port Pirie interns');
    await page.getByRole('button', { name: 'Create and get a code' }).click();
    await expect(page.getByRole('heading', { name: /Port Pirie interns/ })).toBeVisible();
    const code = (await page.locator('strong.num').innerText()).trim();
    expect(code).toMatch(/^[A-Z0-9]{6}$/);
    await expect(page.getByText(/1 member: /)).toBeVisible();
    await page.goto('/progress');
    await expect(page.locator('.badge.done', { hasText: 'Team player' })).toBeVisible();
    await page.screenshot({ path: `${SHOTS}/28-team.png`, fullPage: true });
    await context.close();
  });

  test('seasons: an admin creates one, trainees see it on home and progress', async ({ browser }) => {
    const admin = await adminPage(browser);
    await admin.page.goto('/admin/seasons');
    await admin.page.getByRole('button', { name: 'New season' }).click();
    const form = admin.page.getByRole('form', { name: 'New season' });
    await form.getByLabel(/^ID/).fill('test-season');
    await form.getByLabel('Title').fill('Sepsis September');
    await form.getByLabel('Theme').fill('Spot it early, escalate early.');
    const today = new Date();
    const iso = (d: Date) => d.toISOString().slice(0, 10);
    await form.getByLabel('Starts').fill(iso(new Date(today.getTime() - 86_400_000 * 3)));
    await form.getByLabel('Ends').fill(iso(new Date(today.getTime() + 86_400_000 * 20)));
    await form.getByLabel('Target per person').fill('5');
    await form.getByRole('button', { name: 'Add season' }).click();
    await expect(admin.page.locator('.qlist', { hasText: 'Sepsis September' })).toBeVisible();
    await admin.context.close();

    const { context, page } = await traineePage(browser);
    await page.goto('/');
    await expect(page.getByText(/Sepsis September/)).toBeVisible();
    await page.goto('/progress');
    await expect(page.getByRole('heading', { name: 'Sepsis September' })).toBeVisible();
    await expect(page.getByText(/of 5\./)).toBeVisible();
    expect((await page.request.get('/api/admin/seasons')).status()).toBe(403);
    await context.close();
  });

  test('security: roles, answer keys, server-only events and cross-site requests', async ({ browser }) => {
    const { context, page } = await traineePage(browser);
    await page.goto('/admin');
    await expect(page).toHaveURL(/\/$/);
    expect((await page.request.get('/api/admin/users')).status()).toBe(403);

    const unanswered = await db.query(
      `SELECT c.item_id, c.version FROM item_current c WHERE NOT EXISTS (
         SELECT 1 FROM answer a JOIN user_profile p ON p.user_id = a.user_id WHERE p.email = $1 AND a.item_id = c.item_id) LIMIT 1`, [TRAINEE]);
    const { item_id, version } = unanswered.rows[0];
    expect((await page.request.get(`/api/items/${item_id}/feedback?version=${version}`)).status()).toBe(403);

    const set = await (await page.request.get('/api/sets/next?size=3')).json();
    expect(JSON.stringify(set)).not.toMatch(/"key"|explanations/);

    const origin = new URL(page.url()).origin;
    const sneaky = await page.request.post('/api/events', {
      headers: { origin },
      data: { events: [{ event_id: crypto.randomUUID(), event_type: 'achievement_earned', session_id: crypto.randomUUID(), client_ts: new Date().toISOString(), app_version: 'x', mode: 'none', payload: {} }] },
    });
    expect((await sneaky.json()).rejected).toHaveLength(1);

    const cross = await page.request.post('/api/feedback', { headers: { origin: 'https://evil.example' }, data: { body: 'hello there' } });
    expect(cross.status()).toBe(403);
    await context.close();
  });

  test('phone layout: no sideways scrolling on the main screens', async ({ browser }) => {
    const { context: ctx, page } = await traineePage(browser, { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, colorScheme: 'dark' });
    for (const [path, name] of [['/', '10-phone-home'], ['/practice?size=10', '11-phone-question'], ['/insights', '12-phone-insights'],
      ['/progress', '18-phone-progress'], ['/guide', '19-phone-guide'], ['/write/new?area=Emergency%20presentations', '20-phone-write'],
      ['/logbook', '23-phone-logbook'], ['/onboarding', '24-phone-onboarding'], ['/team', '25-phone-team']] as const) {
      await page.goto(path);
      if (path.startsWith('/practice')) {
        await expect(page.getByText('Question 1 of')).toBeVisible();
        await page.locator('.option').nth(2).click();
        await page.getByRole('button', { name: 'Unsure' }).click();
      }
      await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true });
      await noSidewaysScroll(page);
    }
    await ctx.close();
  });

  test('Ask why: the tutor answers about the question just answered, in the letters the trainee sees', async ({ browser }) => {
    const { context, page } = await traineePage(browser);
    // Not before answering.
    const unanswered = await db.query(
      `SELECT c.item_id, c.version FROM item_current c WHERE NOT EXISTS (
         SELECT 1 FROM answer a JOIN user_profile p ON p.user_id = a.user_id WHERE p.email = $1 AND a.item_id = c.item_id) LIMIT 1`, [TRAINEE]);
    if (unanswered.rows.length) {
      const r = await page.request.post(`/api/tutor/${unanswered.rows[0].item_id}`, {
        headers: { origin: process.env.BASE_URL ?? 'http://localhost:3000' },
        data: { version: unanswered.rows[0].version, option_order: ['A', 'B', 'C', 'D'], messages: [{ role: 'user', content: 'Why?' }] },
      });
      expect(r.status()).toBe(403);
    }

    await page.goto('/practice?size=10');
    await expect(page.getByText('Question 1 of')).toBeVisible();
    await answerCurrent(page, 1, 'Unsure');
    await expect(page.getByText(/^(Correct|Not this time)$/)).toBeVisible();
    const shownLetter = (await page.locator('.option.is-key .letter').innerText()).trim();

    await page.getByRole('button', { name: 'Ask why' }).click();
    await page.getByRole('button', { name: 'Why is the best answer right?' }).click();
    await expect(page.getByText(`Mock tutor. The best answer is ${shownLetter}.`)).toBeVisible();
    await page.getByLabel('Your question').fill('And in a city hospital?');
    await page.getByRole('button', { name: 'Ask', exact: true }).click();
    await expect(page.getByText(/You asked: "And in a city hospital\?"/)).toBeVisible();
    await page.getByRole('button', { name: 'Yes' }).first().click();
    await expect(page.getByText('Thanks for the feedback.')).toBeVisible();
    await page.screenshot({ path: `${SHOTS}/13-tutor.png`, fullPage: true });

    await expect.poll(async () => {
      const ev = await db.query(
        `SELECT event_type, count(*)::int AS n FROM event e JOIN user_profile p ON p.user_id = e.user_id
          WHERE p.email = $1 AND event_type LIKE 'tutor_%' GROUP BY event_type ORDER BY 1`, [TRAINEE]);
      return ev.rows.map((r) => `${r.event_type}:${r.n}`).join(',');
    }, { timeout: 15_000 }).toBe('tutor_answer_rated:1,tutor_answer_shown:2,tutor_question_asked:2');
    await context.close();
  });

  test('sign-in links are rate limited to five per 15 minutes', async ({ request }) => {
    const base = (await (await request.get('/api/test/last-email?to=' + encodeURIComponent(TRAINEE))).json()).count;
    for (let i = 0; i < 8; i++) {
      const r = await request.post('/api/auth/request', { headers: { origin: process.env.BASE_URL ?? 'http://localhost:3000' }, data: { email: TRAINEE } });
      expect(r.status()).toBe(200);
    }
    const after = (await (await request.get('/api/test/last-email?to=' + encodeURIComponent(TRAINEE))).json()).count;
    expect(after - base).toBeLessThanOrEqual(5);
    expect(after - base).toBeLessThan(8);
  });
});

// Renders the README screenshots from the real app into docs/:
//   notepad-light.png, notepad-dark.png        the notepad itself
//   notepad-canvas-day.png, notepad-canvas-week.png   with a made-up Canvas connection
// Run with: npm run screenshots
'use strict';

const { app, BrowserWindow, ipcMain } = require('electron');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'docs');
const PREFIX = 'kitchen-notepad:v1:';
const DAY_IDS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

// Sample pages so the shots aren't blank: [text, done?]
const PAGES = {
  notes: [['Olive oil, lemons, parmesan'], ['Ask Sam about Saturday'], ['Renew library card', true]],
  mon: [['Reply to Priya'], ['Book dentist'], ['Gym at 6', true]],
  tue: [['Lab report draft']],
  wed: [['Dentist 2:30'], ['Pick up prescription']],
  thu: [['Study group · library']],
  fri: [['Clean the kitchen'], ['Movie night']],
  sat: [['Farmers market']],
  sun: [['Plan next week']],
};

const BACKDROPS = {
  light: 'radial-gradient(120% 90% at 30% 20%, #f3e9d8 0%, #e6d6bd 55%, #d6c3a3 100%)',
  dark: 'radial-gradient(120% 90% at 30% 20%, #3a3f52 0%, #262a3a 55%, #181b26 100%)',
};

/* ---------- A made-up Canvas connection (no real school, courses or people) ---------- */

const COURSES = [
  { id: 101, name: 'Calculus II', code: 'MATH 31', color: '#c4513a' },
  { id: 102, name: 'Intro to Programming', code: 'CS 46A', color: '#4a78b0' },
  { id: 103, name: 'General Chemistry', code: 'CHEM 1A', color: '#6f8f3e' },
  { id: 104, name: 'World History', code: 'HIST 15', color: '#8a5aa0' },
];

// [day of the week (0 = Monday), hour, minute, title, course id, missing?]
const ASSIGNMENTS = [
  [0, 23, 59, 'Quiz 12', 101],
  [0, 23, 59, 'Reading response 7', 104],
  [1, 23, 59, 'Lab 8 report', 103, true],
  [2, 17, 0, 'Problem set 6', 102],
  [3, 11, 45, 'Thinking exercise 4', 104],
  [3, 17, 0, 'Project milestone 2', 102],
  [3, 23, 59, 'Quiz 13', 101],
  [4, 11, 20, 'Lab 9 check-in', 103],
  [5, 23, 59, 'Essay draft', 104],
  [6, 23, 59, 'Problem set 7', 102],
];

function fakeCanvasState() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayOffset = (today.getDay() + 6) % 7;
  const monday = new Date(today);
  monday.setDate(today.getDate() - todayOffset);
  const items = ASSIGNMENTS.map(([day, hour, minute, title, courseId, missing], i) => {
    const date = new Date(monday);
    date.setDate(monday.getDate() + day);
    date.setHours(hour, minute, 0, 0);
    const past = day < todayOffset;
    const course = COURSES.find((c) => c.id === courseId);
    return {
      id: `assignment-${i}`,
      type: 'assignment',
      title,
      date: date.toISOString(),
      timed: true,
      courseId,
      course: course.name,
      url: '',
      done: past && !missing,
      missing: past && Boolean(missing),
      late: false,
    };
  });
  return {
    enabled: true,
    host: 'school.instructure.com',
    mode: 'token',
    userName: 'Student',
    status: 'connected',
    error: '',
    updatedAt: Date.now(),
    courses: COURSES.map((c) => ({ ...c, hidden: false })),
    items,
    canStoreToken: true,
  };
}

let canvasOn = false;
ipcMain.handle('canvas:get-state', () => (canvasOn ? fakeCanvasState() : null));
ipcMain.handle('fonts:list', () => []);

app.setPath('userData', path.join(os.tmpdir(), 'notepad-screenshots'));

app.whenReady().then(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const win = new BrowserWindow({
    width: 760,
    height: 900,
    show: false,
    frame: false,
    backgroundColor: '#ffffff',
    webPreferences: { preload: path.join(ROOT, 'preload.js'), contextIsolation: true, sandbox: true },
  });
  const js = (code) => win.webContents.executeJavaScript(code, true);
  const load = () => win.loadFile(path.join(ROOT, 'index.html'), { query: { desktop: '1' } });
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));

  // Storage is written while the page is loaded (same origin), then the page is reloaded so the
  // app starts from it. The app only saves pages that changed, so the reload doesn't undo this.
  const seed = Object.entries(PAGES).map(([id, lines]) =>
    `localStorage.setItem(${JSON.stringify(`${PREFIX}page:${id}`)}, ${JSON.stringify(JSON.stringify({ items: lines.map(([t, d]) => ({ t, d: Boolean(d) })) }))});`).join('\n');

  const todayId = DAY_IDS[(new Date().getDay() + 6) % 7];
  const shots = [
    { name: 'light', theme: 'light', page: 'mon' },
    { name: 'dark', theme: 'dark', page: 'week' },
    { name: 'canvas-day', theme: 'light', page: todayId, canvas: true },
    { name: 'canvas-week', theme: 'dark', page: 'week', canvas: true },
  ];
  await load();
  await js('localStorage.clear()');
  for (const shot of shots) {
    canvasOn = Boolean(shot.canvas);
    await js(`
      ${seed}
      localStorage.setItem(${JSON.stringify(`${PREFIX}prefs`)}, JSON.stringify({ theme: ${JSON.stringify(shot.theme)}, font: 'hand', scale: 100, marks: 'strike' }));
      localStorage.setItem(${JSON.stringify(`${PREFIX}current`)}, ${JSON.stringify(shot.page)});
    `);
    await load();
    await js(`document.body.style.background = ${JSON.stringify(BACKDROPS[shot.theme])}; document.activeElement?.blur(); document.fonts.ready`);
    await wait(900);
    const image = await win.webContents.capturePage();
    const file = path.join(OUT, `notepad-${shot.name}.png`);
    fs.writeFileSync(file, image.toPNG());
    console.log(`wrote ${path.relative(ROOT, file)} (${image.getSize().width}x${image.getSize().height})`);
  }
  app.exit(0);
});

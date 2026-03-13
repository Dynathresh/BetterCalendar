# 📅 BetterCalendar

A clean, 12-month year-at-a-glance view of your Google Calendar — built specifically for tracking travel and multi-day events.

**Live at:** `https://dynathresh.github.io/BetterCalendar`

---

## What it does

- Shows **12 months** starting from the current month, all on one page
- **Multi-day events** (trips, conferences, etc.) display as coloured label bars spanning the days they cover
- **Single-day events** appear as small coloured dots — hover to see the name
- Click any event → opens it directly in Google Calendar
- Toggle individual calendars on/off with the filter bar at the top
- Your calendar selection is remembered between visits (localStorage)
- Works in light mode and dark mode automatically

---

## Setup — two parts

> **🔒 Security:** No API key required. Your OAuth **Client ID** is stored as a **GitHub repo secret** and injected into the site at deploy time by GitHub Actions — it never appears in your source code.

### Part 1 — Google Cloud credentials (~8 min, one time)

#### Step 1 · Create a Google Cloud project

1. Go to [console.cloud.google.com](https://console.cloud.google.com/)
2. Click the project selector at the top → **New Project**
3. Give it a name (e.g. `BetterCalendar`) → **Create**
4. Make sure the new project is selected in the top bar

#### Step 2 · Enable the Google Calendar API

1. In the left sidebar → **APIs & Services → Library**
2. Search for **Google Calendar API** → click it → **Enable**

#### Step 3 · Configure the OAuth consent screen

1. **APIs & Services → OAuth consent screen**
2. Choose **External** → **Create**
3. Fill in:
   - App name: `BetterCalendar`
   - User support email: your email
   - Developer contact: your email
4. Click **Save and Continue** through the remaining steps (you can skip Scopes and Test Users)
5. Back on the OAuth consent screen dashboard, click **Publish App** → **Confirm**
   *(This lets you sign in without being added as a test user)*

> **Note:** Google may show a warning screen on sign-in ("This app isn't verified") — this is completely normal for personal tools. Click **Advanced → Go to BetterCalendar (unsafe)** to proceed.

#### Step 4 · Create an OAuth 2.0 Client ID

1. **APIs & Services → Credentials → + Create Credentials → OAuth client ID**
2. Application type: **Web application**
3. Name: `BetterCalendar Web`
4. Under **Authorised JavaScript origins**, add:
   ```
   https://dynathresh.github.io
   ```
5. Leave **Authorised redirect URIs** empty (not needed for this flow)
6. Click **Create**
7. Copy the **Client ID** — it looks like:
   `123456789012-abcdefg.apps.googleusercontent.com`

That's it — **no API key needed**.

---

### Part 2 — Add the secret & enable GitHub Pages (no editing code!)

#### Step 5 · Add your Client ID as a repo secret

1. Go to your GitHub repo → **Settings → Secrets and variables → Actions**
2. Click **New repository secret**
3. Name: `GOOGLE_CLIENT_ID`
4. Secret: paste your Client ID (e.g. `123456789012-abcdefg.apps.googleusercontent.com`)
5. Click **Add secret**

The deploy workflow (`.github/workflows/deploy.yml`) automatically injects this into `config.js` every time you push — the real value is never stored in your code.

#### Step 6 · Enable GitHub Pages via GitHub Actions

1. Go to your repo → **Settings → Pages**
2. Under **Source**: select **GitHub Actions** *(not "Deploy from a branch")*
3. Click **Save**

#### Step 7 · Trigger your first deploy

Push any change to `main` (or go to **Actions → Deploy to GitHub Pages → Run workflow**).

After ~1 minute your site will be live at:
**`https://dynathresh.github.io/BetterCalendar`**

---

## Usage

1. Open the site → click **Sign in with Google**
2. Choose your Google account and approve access (read-only calendar access)
3. All your calendars appear as toggle pills at the top — turn off the ones you don't want to see
4. The 12-month grid loads with all your events

**Tips:**
- Drag events in Google Calendar to span multiple days to get the coloured trip bars
- Hit **⟳ Refresh** in the filter bar to re-fetch events without reloading the page
- Your calendar selection is saved automatically

---

## File structure

```
BetterCalendar/
├── index.html   — HTML shell
├── style.css    — All styles (light + dark mode)
├── app.js       — Google Calendar integration & rendering logic
├── config.js    — ← put your API credentials here
└── README.md
```

---

## Troubleshooting

| Problem | Fix |
|---|---|
| "Sign in" button stays grey | Both Google scripts haven't loaded yet — wait a second and try again |
| Popup blocked | Allow popups for the site in your browser settings |
| "This app isn't verified" warning | Click Advanced → Go to BetterCalendar → this is normal for personal tools |
| No events showing | Make sure at least one calendar is checked in the filter bar |
| Wrong events showing | Your travel events might be on a calendar that's unchecked — toggle calendars in the filter bar |
| Events not updating | Click **⟳ Refresh** or reload the page (tokens expire after 1 hour) |

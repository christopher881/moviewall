# MovieWall

A home digital movie poster display system. Mount a smart TV on the wall, open the URL, and let MovieWall play full-screen movie posters. Manage everything from a premium admin portal on your phone or laptop.

Built with **Next.js (App Router) + TypeScript + Supabase + Tailwind CSS**.

---

## What you get

- **Admin portal** — dashboard, poster library, collections, displays, schedules
- **TV display page** at `/display/[displayId]` — vertical 9:16, full-screen, no chrome
- **Supabase Realtime** — change a setting on your phone, the TV updates instantly
- **localStorage cache** — the TV keeps showing posters even if the Wi-Fi drops
- **Sleep windows**, fit modes (cover/contain), transitions (fade/slide/none), overlays

---

## 1. Create a Supabase project

1. Go to <https://supabase.com> and create a new project.
2. In **Project Settings → API**, copy:
   - `Project URL` → goes into `NEXT_PUBLIC_SUPABASE_URL`
   - `anon public` key → goes into `NEXT_PUBLIC_SUPABASE_ANON_KEY`

## 2. Run the SQL schema

1. Open **SQL Editor** in your Supabase dashboard.
2. Paste the contents of [`supabase/schema.sql`](supabase/schema.sql) and run it.

This creates the tables (`posters`, `collections`, `collection_posters`, `displays`, `schedules`), the public `movie-posters` storage bucket, the storage / RLS policies, and enables Realtime on every table.

> **Auth note:** The admin portal has a simple password gate (see [Admin password](#admin-password) below). RLS still allows the anon role full access at the database level — the gate prevents random people from loading the admin UI. Tighten the RLS policies if you want stricter database-level enforcement.

## 3. Verify the storage bucket

In **Storage**, you should see a public bucket called `movie-posters`. The app uploads to:
- `movie-posters/posters/` — the actual poster image files
- `movie-posters/uploads/` — reserved for future use

If the schema didn't create it, click **New bucket** → name `movie-posters` → toggle **Public**.

## 4. Install and run locally

```bash
cp .env.example .env.local
# fill in NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY

npm install
npm run dev
```

Open <http://localhost:3000>. You'll be redirected to `/dashboard`.

## 5. Use the admin

1. **Posters** → click **Upload**. Drop in a JPG / PNG / WEBP. Fill in title, year, etc.
2. **Collections** → create one (e.g. "Halloween"). Open it. Use **+ Add posters** to fill it.
3. **Displays** → create one named after your TV (e.g. "Living Room TV"). Open it.
4. In the display settings, set **Active collection** to the one you just made and click **Save**.
5. Click **Copy full URL** in the display settings card.

## 6. Open MovieWall on your TV

1. Mount the TV in portrait orientation.
2. Open the TV's browser, paste the URL: `https://<your-domain>/display/<displayId>`.
3. Put the browser in full-screen / kiosk mode (most smart TV browsers have this).
4. Done — posters will rotate, sleep windows kick in on schedule, and any change you make in the admin appears within a second.

> **Tip:** Browsers like Fire TV's Silk and Vewd support `?fullscreen` add-ons. For a cleaner experience, point a Raspberry Pi / Fire Stick at the URL in Chrome/Firefox kiosk mode.

### My TV is mounted sideways and the poster is rotated wrong

Smart TV browsers don't know the panel was physically rotated 90°. Append `?rotate=90` (or `180`/`270`) to the URL and the page rotates its content to match:

```
https://<your-domain>/display/<displayId>?rotate=90    # most common: TV turned clockwise
https://<your-domain>/display/<displayId>?rotate=270   # TV turned counter-clockwise
```

The page swaps width/height after rotating so it fills the physical screen edge-to-edge.

## 7. Deploy

Any host that runs Next.js works. The easy path:

1. Push this repo to GitHub.
2. Import it on [Vercel](https://vercel.com).
3. Add the two env vars in **Project Settings → Environment Variables**.
4. Deploy.

---

## File structure

```
/app
  /(admin)
    /dashboard          # overview, status cards
    /posters            # poster library + uploads
    /collections        # list
    /collections/[id]   # detail + add/remove/reorder
    /displays           # list
    /displays/[id]      # settings + preview + copy URL
    /schedules          # rule builder
    layout.tsx          # AdminLayout wrapper
  /display/[displayId]  # TV view (no admin UI)
  layout.tsx            # root
  page.tsx              # redirects to /dashboard
/components             # AdminLayout, SidebarNav, TopBar, PosterCard,
                        # PosterUploadForm, CollectionCard, DisplayStatusCard,
                        # DisplayPreview, SettingsForm, ScheduleRuleCard,
                        # FullScreenPosterDisplay, PosterSlideshow, Modal
/lib
  supabaseClient.ts
  utils.ts
/types
  index.ts
/styles
  globals.css
/supabase
  schema.sql
```

---

## How the TV display stays live

| Concern | How it's handled |
|---|---|
| Realtime updates | `supabase.channel(...)` subscribes to `displays`, `posters`, `collections`, `collection_posters`, `schedules`. Any change triggers a reload. |
| Auto-reconnect | The supabase-js Realtime client reconnects automatically. We also re-fetch on the browser `online` event and `visibilitychange`. |
| Offline cache | The current playlist + display settings are written to `localStorage` (`moviewall:display:<id>`). The slideshow boots from cache before the network responds and keeps playing if Supabase is unreachable. |
| Heartbeat | Every 60s the TV writes `is_online = true` and `last_seen = now()` so the admin can show online status. |
| Sleep windows | If `sleep_enabled` and the wall clock is inside `[sleep_time, wake_time]`, the screen goes black. Re-evaluated every 30s. |
| Scheduled mode | When `display_mode = 'scheduled'`, the slideshow picks the first active schedule whose day/date/time matches. If none match, it falls back to the display's `active_collection_id`. |

---

## Schedule rules

Three rule types are shipped in V1:

- **Weekly** — pick days of the week and an optional start/end time.
  - Example: *Friday night* → Family Movie Night collection (`fri`, 18:00–23:59)
- **Date range** — pick a start + end date, with an optional time window.
  - Example: *October* → Halloween collection (2026-10-01 → 2026-10-31)
- **Daily time** — applies every day during a time window.
  - Example: *After 11 PM* → sleep mode is the cleaner option, but you can also point a rule at a "calm" collection.

To use schedules, set the display's **mode** to `scheduled` in its settings page.

---

## Admin password

The admin lives behind a password set via env vars. The **TV display page** (`/display/[id]`) stays public — TVs never need to log in.

Set these in `.env.local` (or in Vercel → Settings → Environment Variables):

```
ADMIN_PASSWORD=pick-something-long
AUTH_COOKIE_SECRET=long-random-string
```

Generate `AUTH_COOKIE_SECRET` with:
```bash
openssl rand -hex 32
```

Behavior:

- **If `ADMIN_PASSWORD` is set:** every admin route redirects to `/login` until you enter the password. After login, a signed `HttpOnly` cookie keeps you signed in for ~1 year on that device. Click **Sign out** in the sidebar to clear it.
- **If `ADMIN_PASSWORD` is empty / unset:** the admin is open (no login). Useful for local dev.

Notes:

- `ADMIN_PASSWORD` is a **server-only** env var (no `NEXT_PUBLIC_` prefix), so it never ships in the client bundle.
- The cookie value is an HMAC of the password using `AUTH_COOKIE_SECRET` — it can't be forged without that secret.
- Public routes that bypass the gate: `/login`, `/display/*`, `/api/login`, `/api/logout`, Next.js assets.

After adding these env vars on Vercel, **redeploy** so the new build picks them up.

## Customizing the look

Tailwind tokens in [`tailwind.config.ts`](tailwind.config.ts):
- `ink` palette — backgrounds (`ink-950` is the page bg)
- `gold` accent — primary action color, MovieWall logotype
- `teal` accent — secondary status accent

Swap `gold` for any hex you like to retheme the admin.

---

## Troubleshooting

- **"NEXT_PUBLIC_SUPABASE_URL is not set"** — you forgot `.env.local`. Restart `npm run dev` after editing it.
- **Uploads fail with a storage error** — re-run `supabase/schema.sql`. The bucket policies are part of it.
- **Realtime updates don't arrive** — confirm the tables are in the `supabase_realtime` publication (the SQL does this) and that you used the *anon* key, not the service role.
- **TV shows "Display not found"** — the `displayId` in the URL doesn't exist. Recreate the display from the admin and copy the new URL.

---

## License

MIT

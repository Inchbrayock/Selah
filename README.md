# Selah

**A local-first Bible reading tracker for web and Android.**

Log daily Scripture readings across all **66 books (1,189 chapters)**, build custom or guided reading plans, keep private study notes, earn reading milestones, and optionally sync across devices or read together with friends.

**Live Web App:** [inchbrayock.github.io/Selah](https://inchbrayock.github.io/Selah/)

---

## Highlights

- **Local-First & Offline-Ready** — Works immediately in the browser with no account required, storing readings, plans, and preferences in IndexedDB (`Dexie`) with timezone-safe `Temporal.PlainDate` calendar math.
- **Full Canonical Tracking** — Track progress across the Whole Bible (`1,189` chapters), Old Testament (`929`), and New Testament (`260`) with a proportional 66-book Canonical Spine Bar and a 1,189-chapter Mosaic.
- **12 Built-in Plans + Custom Plan Builder** — Follow canonical, chronological, or paired plans automatically synced to your logged chapters, or design your own plan by books, chapter ranges, and pace.
- **Private Reading Journal** — Searchable monthly reading history with reflection notes that always stay private.
- **Milestones** — **28** core reading milestones across Bronze, Silver, Gold, and Luminous tiers (including hidden milestones), plus **4** separate optional Fellowship bonus milestones.
- **Friends & Read Together** *(Optional)* — Connect by `@username`, start shared reading plans with up to 12 people, send quiet encouragements, and control exactly what friends can see.
- **Cross-Platform** — Responsive desktop and mobile web UI, iPhone Safari PWA ("Add to Home Screen"), and native Android APK via Capacitor 8 with SHA-256 verified in-app updates.

---

## Features

### Home Dashboard
- **Quick Log & Continue Reading**: Log chapters in seconds—automatically advancing as you finish books—resume in-progress books, or check off the next day of your active reading plan in one tap.
- **Canonical Spine Bar**: Visualizes completion across all 66 books proportionally (stacking cleanly into Old and New Testament rows on smaller screens).
- **Reading Streak & Heatmap**: Tracks your active streak with the animated **Sanctuary Lamp**, optional **Rest Day Grace** (1 rest day per 7-day window), and a 52-week **Reading Heatmap** with daily inspection.
- **Sample Data**: Load a sample reading journey from the empty state or **Settings** to explore the app right away.

### Books (Library & Mosaic)
- Switch between the **Bookshelf** card grid and the **1,189-Chapter Whole-Bible Mosaic**.
- Filter by Testament, canonical division, completion status (`Unread`, `In Progress`, `Completed`), or search by book name and theme.
- Open any book sheet to toggle individual chapters, select chapter spans using touch-friendly **Range** mode or desktop `Shift+Click`, increment re-read cycles (`+1 Re-read`), and attach notes.

### Journal & Reading Plans
- **Reading Journal**: Chronological reading history grouped by month with search, division/lens filters, inline chapter/note editing, and deletion.
- **12 Built-in Reading Plans**:

  | Plan | Length | Style |
  | :--- | :---: | :--- |
  | Gospel of John in 21 Days | 21 days | Canonical |
  | Paul's Letters in 30 Days | 30 days | Canonical |
  | Daily Proverbs | 31 days | Canonical |
  | Psalms & Proverbs Month | 31 days | Paired |
  | Gospels & Acts Journey | 45 days | Canonical |
  | Torah & Covenant Foundations | 50 days | Canonical |
  | Israel's Kingdom & Exile | 60 days | Canonical |
  | New Testament in 90 Days | 90 days | Canonical |
  | Voice of the Prophets | 90 days | Canonical |
  | Canonical Bible in 1 Year | 365 days | Canonical |
  | Chronological Bible in 1 Year | 365 days | Chronological |
  | Old & New Testament Together | 365 days | Paired |

- **Custom Plan Builder**: Assemble custom plans from division presets, individual books, or specific chapter slices, distributed automatically by target days or chapters per day.

### Milestones
- **28 Core Milestones** spanning chapter thresholds (from *Open the Scroll* to *Alpha & Omega*), books and divisions, streaks and Sunday rhythms, reading habits, and 2 secret milestones (*Psalm 119* and *Second Pass*).
- **4 Optional Fellowship Milestones** (*Iron Sharpens Iron*, *Two Are Better Than One*, *Word in Season*, and *A Threefold Cord*) kept strictly separate so solo and offline readers can always reach `28/28`.
- Includes custom SVG medallions, celebration toasts (with optional confetti toggle), and a detail modal with Scripture echoes.

### Friends & Read Together *(Optional Cloud Account)*
- **Reader Discovery**: Pick a `@username`, search for friends by display name or handle, and manage incoming/outgoing requests and blocked users.
- **Read Together Cohorts**: Start a shared plan from any built-in or custom plan and invite up to 11 friends (12 readers max per group) to track progress side by side.
- **Quiet Encouragements**: Send preset or custom encouragement notes (up to 280 characters, with a 12-hour per-friend cooldown).
- **Granular Privacy**: Pause sharing globally, toggle search discoverability, and individually toggle visibility for Bible progress, streak, last read book, active plan, milestones count, and profile picture. Personal journal notes and email addresses are never shared.
- **Profile Picture Studio**: Choose from 8 built-in SVG emblems, link a photo URL or Google avatar, or crop and zoom a local device image.

### Appearance, Backups & Cloud Sync
- **Themes**: **System**, **Light** (Warm Alabaster), and **Dark** (Midnight Slate) modes with dynamic status bar / `theme-color` adaptation and OS reduced-motion support.
- **JSON Backups**: Export and import your full reading history as JSON (with native file sharing on Android).
- **Optional Firebase Sync**: Sign in with Email/Password or Google to sync logs, preferences, custom plans, and theme settings to Cloud Firestore. Signing in on a device with existing local entries offers clean reconciliation (**Merge into my account** or **Keep cloud only**).

---

## Getting Started

### Prerequisites
- **Node.js 24+** (matches CI workflows) and **npm**

### Run Locally

```bash
git clone https://github.com/Inchbrayock/Selah.git
cd Selah
npm install
npm run dev
```

Selah runs fully offline using browser IndexedDB storage even without Firebase configured.

---

## Optional: Firebase Auth & Cloud Firestore Setup

To enable cloud accounts, multi-device sync, and **Friends / Read Together**:

1. Copy `.env.example` to `.env.local` and fill in your Firebase web app configuration:

   | Variable | Description |
   | :--- | :--- |
   | `VITE_FIREBASE_API_KEY` | Firebase Web API key |
   | `VITE_FIREBASE_AUTH_DOMAIN` | Firebase Auth domain (`<project-id>.firebaseapp.com`) |
   | `VITE_FIREBASE_PROJECT_ID` | Firebase project ID |
   | `VITE_FIREBASE_STORAGE_BUCKET` | Firebase storage bucket |
   | `VITE_FIREBASE_MESSAGING_SENDER_ID` | Cloud Messaging sender ID |
   | `VITE_FIREBASE_APP_ID` | Firebase Web App ID |

2. In **Firebase Console → Authentication → Sign-in method**, enable **Email/Password** and **Google**.
3. If hosting on a custom domain or GitHub Pages, add your host (for example `inchbrayock.github.io`) under **Authentication → Settings → Authorized domains**.
4. Deploy the included security rules and indexes via the Firebase CLI:

   ```bash
   firebase deploy --only firestore:rules,firestore:indexes
   ```

---

## Deployment & Mobile Builds

### Web Hosting (GitHub Pages)
Pushing to `main` triggers [`.github/workflows/deploy-pages.yml`](.github/workflows/deploy-pages.yml), which builds the Vite bundle with `VITE_BASE_PATH` and the `VITE_FIREBASE_*` repository secrets and publishes `dist/` to GitHub Pages.

### Android APK & In-App Updates (Capacitor 8)
Selah packages the compiled Vite bundle (`dist/`) as a native Android app (`com.selah.bible`).

#### Automated Releases (GitHub Actions)
Pushing a version tag (`v*`, e.g. `v1.6.0`) or manually running [`.github/workflows/android-apk.yml`](.github/workflows/android-apk.yml) builds the Android APK on `ubuntu-latest`:

- **Signed releases** attach the `.apk` and a SHA-256 `update.json` manifest to the GitHub Release.
- Installed Android builds include a native `SelahUpdater` plugin (`SelahUpdaterPlugin.java`) that checks GitHub Releases, downloads and verifies the APK checksum, and prompts to install updates (configurable under **Settings → App updates**).
- Manual workflow runs without keystore secrets automatically fall back to a debug-signed APK.

Repository secrets for signed release builds with Google Sign-In:

| Secret | Purpose |
| :--- | :--- |
| `VITE_FIREBASE_*` | Firebase web app environment variables |
| `GOOGLE_SERVICES_JSON_BASE64` | Base64-encoded `android/app/google-services.json` (with release keystore SHA-1 registered in Firebase) |
| `ANDROID_KEYSTORE_BASE64` | Base64-encoded `.jks` release keystore |
| `ANDROID_KEYSTORE_PASSWORD` | Keystore password |
| `ANDROID_KEY_ALIAS` | Signing key alias |
| `ANDROID_KEY_PASSWORD` | Signing key password |

#### Local Android Studio Builds
1. Place your gitignored `android/app/google-services.json` (with your debug/release keystore SHA-1 registered in Firebase if using Google Sign-In).
2. Optionally create a gitignored `android/keystore.properties` (`storeFile`, `storePassword`, `keyAlias`, `keyPassword`) for local signed release builds.
3. Build web assets, sync Capacitor, and open Android Studio:

   ```bash
   npm run cap:sync
   npm run cap:android
   ```

### iOS (Safari PWA)
On iPhone, open the deployed web app in **Safari** and choose **Share → Add to Home Screen**. `index.html`, `public/manifest.webmanifest`, `public/apple-touch-icon.png`, and the web-only offline service worker (`public/sw.js`, bypassed inside native Capacitor builds) provide a standalone home-screen experience with no Apple Developer account required.

---

## Scripts

| Command | Description |
| :--- | :--- |
| `npm run dev` | Start the Vite development server |
| `npm run build` | Type-check (`tsc -b`) and build the production bundle (`dist/`) |
| `npm run preview` | Serve the production build locally |
| `npm test` | Run the Vitest unit and component test suite once |
| `npm run test:watch` | Run Vitest in interactive watch mode |
| `npm run cap:sync` | Build web assets and sync the Capacitor Android project |
| `npm run cap:android` | Open the Android project in Android Studio |
| `npm run cap:assets` | Regenerate native Android icons and splash screens from `assets/` |

---

## Project Structure

```text
.
├── .github/workflows/       # GitHub Pages deployment & Android APK release pipelines
├── android/                 # Capacitor Android project + native SelahUpdaterPlugin
├── public/                  # PWA manifest, icons, and web-only offline service worker
├── firestore.rules          # Cloud Firestore security rules for private data & social features
├── firestore.indexes.json   # Firestore composite index definitions
├── capacitor.config.ts      # Capacitor 8 configuration (com.selah.bible)
├── vite.config.ts           # Vite 7 + Vitest configuration & version manifest plugin
└── src/
    ├── App.tsx              # Root shell, hash routing, dialogs, and Android back handling
    ├── components/
    │   ├── achievements/    # Milestones grid, SVG medallions, detail modal
    │   ├── auth/            # Account menu, sign-in/merge flow, Profile Photo Studio
    │   ├── dashboard/       # Quick Log, Continue Reading, Canonical Spine Bar, Heatmap
    │   ├── friends/         # Friends hub, discovery, privacy controls, encouragements
    │   ├── journal/         # Journal log, Plans workspace, Plan Finder, Custom Plan Builder, Read Together
    │   ├── library/         # Bookshelf, 1,189-Chapter Mosaic, Book detail sheet
    │   ├── settings/        # Settings page (account, privacy, theme, streak rules, backups, updates)
    │   └── ui/              # Responsive navigation header/dock, modals, Sanctuary Lamp, update banner
    ├── data/                # 66-book Bible canon, 12 reading plans, 28+4 milestones catalog
    ├── db/                  # Dexie IndexedDB schema, local repository, Firestore sync adapters
    ├── lib/                 # Progress math, Temporal dates, plans, friends, fellowship, avatar, updater
    ├── store/               # React context store (useBibleStore)
    ├── styles/              # Design tokens and bundled Newsreader + IBM Plex Sans fonts
    ├── types/               # Shared TypeScript domain types
    └── __tests__/           # Vitest + Testing Library unit and UI test suites
```

---

## Tech Stack

| Layer | Technologies |
| :--- | :--- |
| **UI & Styling** | React 19, TypeScript, Tailwind CSS v4, Motion (`motion/react`), Lucide React, `canvas-confetti` |
| **Typography** | `@fontsource-variable/newsreader`, `@fontsource/ibm-plex-sans` |
| **Local Data & Dates** | Dexie 4 (IndexedDB), `temporal-polyfill` |
| **Cloud & Auth** | Firebase 13 (Firebase Auth & Cloud Firestore) |
| **Mobile (Android)** | Capacitor 8 (`app`, `filesystem`, `haptics`, `share`, `splash-screen`, `status-bar`), `@capacitor-firebase/authentication`, custom `SelahUpdaterPlugin` |
| **Build & Testing** | Vite 7, Vitest 4, React Testing Library, jsdom |

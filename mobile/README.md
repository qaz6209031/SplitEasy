# SplitEasy (Expo / React Native)

The SplitEasy app rebuilt with Expo SDK 57, Expo Router and TypeScript. It uses the same Supabase backend as the Swift app (`../supabase/`), so nothing on the server changed.

- **iOS first**, written cross-platform so Android only needs its Google sign-in setup and testing.
- **Over-the-air updates** with EAS Update. JavaScript and asset changes reach users without an App Store release (see below).

## Run (development build)
```sh
cd mobile
npm install
npx expo run:ios                 # builds the dev client into the simulator and starts Metro
```
- **`.env`** (committed) holds the Supabase URL and publishable key. Both are public by design; Row Level Security protects the data.
- **`.env.development.local`** (git-ignored) holds `EXPO_PUBLIC_DEV_ACCOUNT_PASSWORD` for the Debug-only Alice/Bob/Carol buttons. Production builds and `eas update` never load this file, and the `__DEV__` branch that reads it is stripped from release bundles.

## Checks
```sh
npm test            # Jest: money, equal split, balances, debt simplification
npx tsc --noEmit    # typecheck
npx expo lint
npx expo-doctor
```

## Over-the-air updates (EAS Update)
- **How the app updates:** on every cold start (`checkAutomatically: ON_LOAD`) and whenever the app returns to the foreground, it checks for an update and downloads it in the background. A "A new version of SplitEasy is ready, Restart" banner appears; otherwise the update applies on the next launch. Settings shows which version is running and has **Check for Updates**.
- **Runtime version:** `runtimeVersion.policy = "fingerprint"`. Expo hashes the native project, so an update only reaches builds with the same native code. Adding a native module or changing `app.json` native settings produces a new fingerprint, which needs a new store build.
- **Channels:** `eas.json` maps build profiles to channels: `development`, `preview`, `production`.

### One-time setup
```sh
npx eas-cli@latest login
npx eas-cli@latest update:configure   # adds updates.url + extra.eas.projectId to app.json
```

### Ship an update
```sh
npx eas-cli@latest update --channel production --message "Fix balance rounding" --environment production
```
- **What can ship:** anything in `src/`, images and other assets.
- **What can't:** new native modules, permissions, `app.json` native settings or an SDK upgrade. Those need a new `eas build` and an App Store release.
- **Apple's rule (3.3.1(B)):** updates must not change the app's primary purpose.

### Builds
```sh
npx eas-cli@latest build --profile development-simulator --platform ios   # dev client for the simulator
npx eas-cli@latest build --profile production --platform ios             # App Store build (channel: production)
npx eas-cli@latest submit --platform ios
```

## Structure
```
src/app/            Expo Router screens (sign-in, name-setup, groups, group/[id], expense form, settings)
src/auth/           AuthProvider: Apple, Google (PKCE), Debug dev accounts, account deletion
src/data/           Supabase queries and RPC calls (repository.ts), row types
src/domain/         Pure money logic + Jest tests
src/features/       Screen hooks (useGroupDetail)
src/lib/            Supabase client, OTA update helpers, public links
src/components/     Theme and small UI kit, update banner
```

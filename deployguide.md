# HabitFlow — Complete Deployment & App Store Guide

## ─────────────────────────────────────────
## PART 1: DEPLOY AS A WEBSITE (do this first)
## ─────────────────────────────────────────

### Step 1 — Install tools (once)
```bash
npm install -g firebase-tools
```

### Step 2 — Login & init
```bash
firebase login
firebase init
# Choose: Hosting, Functions, Firestore
# Use existing project or create new one
```

### Step 3 — Set your Paystack secret keys
```bash
firebase functions:config:set paystack.secret="sk_live_YOUR_LIVE_SECRET_KEY"
firebase functions:config:set paystack.webhook_secret="YOUR_WEBHOOK_SECRET_HASH"
```

### Step 4 — Install function dependencies
```bash
cd functions
npm install
cd ..
```

### Step 5 — Generate icons
```bash
pip install cairosvg Pillow
python3 generate_icons.py
```

### Step 6 — Deploy everything
```bash
firebase deploy
```

Your app is now live at: https://YOUR_PROJECT_ID.web.app

### Step 7 — Add webhook in Paystack
- Paystack Dashboard → Settings → Webhooks
- Add URL: https://YOUR_REGION-YOUR_PROJECT_ID.cloudfunctions.net/paystackWebhook
- OR using Firebase rewrites: https://YOUR_PROJECT_ID.web.app/api/paystack-webhook

---

## ─────────────────────────────────────────
## PART 2: MAKE IT INSTALLABLE (PWA)
## ─────────────────────────────────────────

Your app is already a PWA! After deploying:

### On Android (Chrome):
1. Open your app URL in Chrome
2. Tap the 3-dot menu → "Add to Home Screen"
3. Tap "Install" → it installs like a real app ✓

### On iPhone (Safari):
1. Open your app URL in Safari
2. Tap the Share button (bottom)
3. Scroll down → "Add to Home Screen"
4. Tap "Add" ✓

### Users see your HabitFlow icon on their home screen
### App opens full-screen with no browser bars
### Works offline via service worker

---

## ─────────────────────────────────────────
## PART 3: PUBLISH TO GOOGLE PLAY STORE
## (Android downloadable app)
## ─────────────────────────────────────────

### Option A — TWA (Trusted Web Activity) — EASIEST ✅
This wraps your PWA directly into an Android APK.
No code changes needed.

#### Step 1 — Install Bubblewrap (Google's official tool)
```bash
npm install -g @bubblewrap/cli
```

#### Step 2 — Init the Android project
```bash
mkdir habitflow-android && cd habitflow-android
bubblewrap init --manifest https://YOUR_PROJECT_ID.web.app/manifest.json
```
Fill in when prompted:
- Package ID: com.habitflow.app
- App name: HabitFlow
- Start URL: /dashboard.html
- Icon: (it reads from manifest.json automatically)

#### Step 3 — Build the APK
```bash
bubblewrap build
```
This generates: `app-release-signed.apk`

#### Step 4 — Upload to Google Play Console
1. Go to https://play.google.com/console
2. Create developer account ($25 one-time fee)
3. Create new app → Upload APK
4. Fill in store listing (description, screenshots)
5. Submit for review (takes 2-7 days)


### Option B — Capacitor (more control) ✅
Wraps the app into a full native Android app.

#### Step 1 — Install Capacitor
```bash
npm install @capacitor/core @capacitor/cli @capacitor/android
npx cap init HabitFlow com.habitflow.app --web-dir .
```

#### Step 2 — Add Android platform
```bash
npx cap add android
npx cap sync android
```

#### Step 3 — Open in Android Studio
```bash
npx cap open android
```
In Android Studio: Build → Generate Signed APK → Upload to Play Store

---

## ─────────────────────────────────────────
## PART 4: PUBLISH TO APPLE APP STORE
## (iPhone downloadable app)
## ─────────────────────────────────────────

### Requirements:
- Mac computer (or rent a Mac with MacinCloud.com ~$1/hr)
- Apple Developer account ($99/year at developer.apple.com)
- Xcode installed

### Steps:

#### Step 1 — Add iOS with Capacitor
```bash
npm install @capacitor/ios
npx cap add ios
npx cap sync ios
npx cap open ios
```

#### Step 2 — In Xcode:
1. Set Bundle ID: com.habitflow.app
2. Set your Apple Developer Team
3. Add your app icons (from icons/ folder)
4. Product → Archive
5. Distribute App → App Store Connect

#### Step 3 — In App Store Connect (appstoreconnect.apple.com):
1. Create new app
2. Upload screenshots (required sizes: 6.7", 6.5", 5.5")
3. Write description, keywords, category: Health & Fitness
4. Submit for review (takes 1-3 days)

---

## ─────────────────────────────────────────
## PART 5: EASIER ALTERNATIVE — PWA STORES
## ─────────────────────────────────────────

You can list your PWA in these stores WITHOUT building a native app:

### PWADirectory (free)
- https://pwa.directory — submit your PWA URL

### Microsoft Store (Windows)
- Free listing for PWAs
- https://developer.microsoft.com/en-us/microsoft-store/pwa

### AppScope
- https://appsco.pe — PWA showcase directory

---

## ─────────────────────────────────────────
## CHECKLIST BEFORE GOING LIVE
## ─────────────────────────────────────────

Firebase:
- [ ] Firebase config added to firebase.js
- [ ] Firestore rules deployed
- [ ] Authentication enabled (Email + Google)

Paystack:
- [ ] Account verified
- [ ] Monthly plan created (PLN_xxx)
- [ ] LIVE keys in payment.js (pk_live_xxx)
- [ ] LIVE secret key set in Firebase config
- [ ] Webhook URL added in Paystack dashboard

App:
- [ ] Icons generated (python3 generate_icons.py)
- [ ] Tested on mobile browser (PWA install)
- [ ] Made a real GH₵1 test payment end-to-end
- [ ] firebase deploy completed successfully

---

## YOUR LIVE URLS (after deploy)

| What | URL |
|------|-----|
| App | https://YOUR_PROJECT_ID.web.app |
| Webhook | https://YOUR_PROJECT_ID.web.app/api/paystack-webhook |
| Revenue stats | https://YOUR_PROJECT_ID.web.app/api/revenue-stats |
| Cancel sub | https://YOUR_PROJECT_ID.web.app/api/cancel-subscription |
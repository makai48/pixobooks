---
name: Yellow login skill
description: Yellow Login — the implemented PixoBooks V3 auth design system (login, register, auth modals, toasts, skeletons) with every applied amendment. Use when building, reviewing, or extending the yellow auth UI.
---

# Yellow Login skill

Authoritative, implementation-matching guide to the PixoBooks auth experience.
It describes what is in the code today — not an aspirational redesign.
Scope: `/login`, `/register`, auth modals, auth toasts, register skeleton.
Operations screens keep the existing Paper & Ink theme.

Source of truth files:

- `src/styles/auth.css` — all auth surface styles
- `src/styles/toaster.css` — global V3 toast skin
- `src/components/auth/AuthShell.tsx` — canvas, spotlight, brand, footer
- `src/components/auth/AuthHighlights.tsx` — rotating slogan
- `src/components/auth/AuthField.tsx` — label / icon / hint / error field
- `src/components/auth/AuthModal.tsx` — legal + password-help modal
- `src/components/auth/RegisterSkeleton.tsx` — instant-skeleton body
- `src/pages/Login.tsx`, `src/pages/Register.tsx`

---

## 1. Tokens (oklch only — never hex in new work)

Light:

| Token | Value | Use |
| --- | --- | --- |
| Brand | `oklch(0.86 0.175 92)` (#FFCC08) | CTA, highlight tile, focus ring |
| Brand foreground | `oklch(0.18 0 0)` | Text/icons on brand |
| Background | `oklch(0.935 0.004 106)` | Page canvas |
| Card | `oklch(1 0 0)` | Auth cards, modals |
| Foreground | `oklch(0.18 0 0)` | Primary text |
| Muted | `oklch(0.56 0 0)` | Ledes, hints, footer |
| Border | `oklch(0.925 0.004 106)` | Card / modal borders |
| Secondary surface | `oklch(0.95 0.003 106)` | Subtle fills |
| Danger | `oklch(0.577 0.245 27.325)` | Invalid fields, errors |
| Field border | `oklch(0.18 0 0 / 0.5)` | Input outline |
| Field hover | `oklch(0.18 0 0 / 0.7)` | Input hover |

Dark (`[data-theme="dark"]` / `.dark`):

| Token | Value |
| --- | --- |
| Background | `oklch(0.129 0.042 264.695)` |
| Card | `oklch(0.208 0.042 265.755)` |
| Foreground | `oklch(0.984 0.003 247.858)` |
| Muted | `oklch(0.704 0.04 256.788)` |
| Border | `oklch(1 0 0 / 10%)` |
| Field border | `oklch(0.984 0.003 247.858 / 0.32)` |

Shadows:

- Card: `0 1px 2px oklch(0 0 0 / .03), 0 12px 32px -12px oklch(0 0 0 / .08)`
- Brand: `0 8px 20px -8px oklch(0.86 0.175 92 / .6)`
- Modal: `0 40px 80px -30px oklch(0 0 0 / .7)`

Radii: controls/brand CTA `12px`, checkbox `5px`, cards/modals `20px`,
highlight tile `12px`, icon button `10px`.

---

## 2. Typography

- Display: **Manrope** (`--reg-font-display`), 600–700. Body/controls: **DM Sans**
  (`--reg-font-sans`). Mono: JetBrains Mono (`--reg-font-mono`) only for OTP codes.
- Page title: `clamp(1.5rem, 4vw, 2.125rem)`, weight 700, `line-height 1.08`,
  tracking `-0.03em`, `text-wrap: balance`.
- Lede: 15px, `line-height 1.5`, muted, `max-width: 30ch`, centred.
- Field label: 14px, weight 500, sentence case (never uppercase). Required star
  is a separate danger-coloured `*` with a leading space.
- Overline/kicker (`reg-step`): 10px, 600, uppercase, `0.18em` tracking.
- Group label (`reg-group-title`): 10px, 700, uppercase, `0.16em`.
- Hints/errors: 12px. Error icon 13px.
- Remember me / Forgot password?: 13px → 14px at `≥640px`, weight 600,
  foreground. Only the link is underlined (brand 2px, offset 4px).
- Brand wordmark: Manrope 20px/700, `-0.025em`. Subtitle: 9px, 600, uppercase,
  `0.14em` tracking, muted.
- Slogan text: 12px (500) → 13px at `≥640px`, `oklch(0.18 0 0 / 0.8)`.

---

## 3. Page shell

- Page: `height/min-height: 100dvh`, vertical scroll allowed, horizontal hidden,
  centred flex, safe-area padding
  `max(clamp(0.75rem, 4vh, 4rem), env(safe-area-inset-top)) 1rem max(1rem, env(safe-area-inset-bottom))`.
- Auth column: `min(100%, 420px)`. Register adds `register-wide`:
  `min(100%, 720px)` at `≥768px`.
- Background: warm canvas + ~55 hand-placed Lucide business icons,
  `strokeWidth 1.25`: base `foreground/9%`, accents `brand/50`. Only the `m`
  subset renders below 768px. Icons drift ±8px over 7s with staggered delays.
- `reg-deco-quiet`: radial ellipse (`min(520px,60vw) × min(460px,55vh)`) at 50%
  50%, background 35% → transparent, keeps the centre calm.
- Cursor spotlight (hover + fine pointer + motion allowed): 280px brand/16 glow
  and a 200px icon mask, driven by `--mx/--my` and `data-spot`. No spotlight on
  touch or reduced-motion.
- Brand row: 40px circular `app-logo.png` (`object-fit: cover`) over/next to
  Manrope wordmark and subtitle. Login shows it; **Register hides it**
  (`hideBrand`). Brand copy is centre-aligned; name and subtitle sit on the
  screen centre axis (measured offset 0).
- Footer: `register-footer` 14px muted, centred; copyright 12px muted, hidden
  under 700px height.

---

## 4. Login composition (exact copy)

1. Brand row (logo, `PixoBooks`, `BUSINESS OPERATING SYSTEM`).
2. Highlights carousel (slogan line + pill dots).
3. Intro: `Welcome back` (H1) + `Sign in to access your business workspace.`
   No kicker.
4. White card containing:
   - `Email address *` with mail icon, placeholder `you@company.com`,
     `autoComplete="email"`.
   - `Password *` with lock icon, placeholder `Enter your password`,
     `autoComplete="current-password"`, show/hide eye button.
   - Caps-lock note `Caps Lock is on` (ArrowBigUp, 11px) when active.
   - Row: `Remember me` (custom checkbox) left, `Forgot password?` right.
   - Primary `Sign in` brand CTA.
   - Security line: shield icon + `Your business data is protected and secure.`
5. Footer: `New to PixoBooks? Create a new business` → `/register?mode=create`.

Behaviour:

- Form wrapped in `<fieldset disabled={loading} aria-busy={loading}>`.
- Submit validates: empty email → `Enter your email address.`, invalid format →
  `Enter a valid email address.`, empty password → `Enter your password.`
- Auth failure → one inline message under Password
  (`Wrong Email/Password combination. Passwords are case-sensitive.`), and
  **both** Email and Password get `aria-invalid="true"` (danger outline), because
  either value may be wrong. Editing either field clears it.
- Blocked/approval states render the tonal panel (badge, title, body, actions):
  `pending_first`, `pending_still`, `rejected`, `expired`, `request_failed`.
- Forgot password opens the shared modal (see §8).
- Approved users auto-redirect to `/` or `/change-password`.

---

## 5. Register composition

- No logo, no wordmark, no slogan/carousel (`hideBrand`, highlights removed).
- Intro: `Step 1 of 2`, `Create your business`,
  `One workspace for sales, stock, and books. Verify your email next.`
- Card groups:
  - **Account**: Email address*, Your name (`Admin name` placeholder).
  - **Business**: Business name* (spans 2), Country*, Business type, Time zone,
    Currency, collapsed `Regional and number format` (Digit grouping, Decimal
    places, Separator format).
  - **Contact**: Mobile number*, Office number, WhatsApp.
  - Terms checkbox with Terms / Privacy buttons, brand `Continue`.
  - Security line: `The first account becomes the workspace admin.`
- OTP step: `Step 2 of 2`, `Verify your email`; verification code (mono, 18–20px,
  `0.32em`), Password, Confirm password with inline mismatch error; CTA
  `Create workspace` / `Create account`; `Back to details`.
- Wide layout (≥768px): `.reg-fields` becomes a 2-column grid
  (`1fr 1fr`, 12px gaps). `reg-span-2` items: Business name, WhatsApp, OTP.
  The regional settings block is also 2-column; Separator format spans both.
- Register-wide control heights: **27px at ≥768px**, **35px at ≥1024px**
  (20% shorter than the standard 33/44 rhythm). Login stays 33/44.
- Time zone options are GMT-first: `GMT+03:00 Africa/Kampala` via
  `timezoneLabel()` / `TIMEZONE_OPTIONS` in `src/lib/referenceData.ts`.
- Mode is derived from `?mode=signin|create` + `hasAdmin`; the step resets when
  the mode changes. Cross-links: sign-in prompt → `/login`, footer →
  `/register?mode=create`.
- Loading: `RegisterSkeleton` renders immediately (route Suspense fallback and
  admin-status wait), never a bare “Loading…”.

---

## 6. Fields

- Height: 33px below 1024px, 44px at ≥1024px (register-wide: 27/35px).
- Radius 12px; 1px field border; background card; DM Sans.
- 16px text below 1024px (prevents iOS zoom), 14px at ≥1024px.
- Leading icon 18px at `left: 16px`; icon inputs use `padding-left: 44px`.
- Eye button 28px (32px at ≥1024px) at `right: 4/6px`, `padding-right: 48px`.
- Focus: foreground border + `0 0 0 4px brand/25`.
- Invalid (`aria-invalid="true"`): danger border; focus ring
  `oklch(0.577 0.245 27.325 / 0.15)`.
- OTP: centred mono, letter-spacing `0.32em`, `text-indent` equal to tracking.
- Country dropdown popover: card surface, 12px radius, deep shadow; its search
  input 36px.
- Disabled: `cursor: not-allowed`, 60% opacity.

---

## 7. Buttons & interactions

- Primary CTA: brand fill, ink text, 12px radius, 600, 33px → 48px at ≥1024px.
  Hover `brightness(.96)` + brand shadow; active `scale(.99)`; focus ring
  `brand/40`; disabled 55% opacity.
- Login submit while loading: `cursor: wait`, 80% opacity; spinner replaces the
  arrow (Login has no arrow).
- Secondary/outline: transparent, 1px field border, 33px → 44px; hover keeps the
  foreground border with 4% ink wash.
- Text actions: brand underline 2px, offset 3–4px; hover turns the underline
  foreground.
- Terms checkbox: 16px, 5px radius, brand fill + ink tick when checked.
- Light hairlines use the border token; transitions 160–200ms.

---

## 8. Modals (legal + password help)

- Shared `AuthModal`: backdrop `oklch(0.18 0 0 / .5)`, 160ms fade.
- Panel: card surface, 20px radius, 24px padding, max-height 85dvh,
  420px wide (560px when `wide`, used for legal text).
- Header: 10px kicker, Manrope 18px title, 32px close button.
- Body: flex column, `overflow: auto`, 13px/1.6.
- Legal text: `<pre class="reg-modal-text">`, 12px, `white-space: pre-wrap`.
- Footer: full-width brand button.
- Escape and backdrop click close; content click stops propagation.
- Forgot-password body: explanatory copy, `Registered work email *` field, CTA
  `Send request to admin`; success state shows badge, `Request sent`, copy.

---

## 9. Blocked / approval panels

- Rendered inside the standard card.
- 52px circular badge, 1px border; warning = brand tint/border, danger = danger
  tint/border and danger icon.
- Title: Manrope 19px/700. Body 13.5px/1.6 muted with bold foreground emphasis.
- Actions: primary `Back to sign in`; `Request a new one` (outline) when the
  temp password expired.

---

## 10. Toasts (global, V3)

- Sonner `position="top-center"` plus CSS to place it at the **true screen
  centre**: track top `calc(50% - var(--front-toast-height,0px)/2)`, each toast
  `left: 50%` with `translate: -50% 0`.
- Glassmorphism: **45% transparent** = `oklch(1 0 0 / 0.55)` light,
  `oklch(0.208 0.042 265.755 / 0.55)` dark; border 55% white / 28% in dark;
  `backdrop-filter: blur(14px) saturate(160%)`; card shadow.
- Width hugs content: `width: max-content; max-width: min(360px, 100vw - 32px)`.
- Padding `10px 14px 10px 12px`, gap 8px, radius 12px.
- Icon: 28px brand tile, 12px radius, Lucide icons centred
  (`display:flex; align-items:center; justify-content:center; line-height:0`;
  svg `display:block; 15px`). Error/warning/info get tinted tiles.
- Title: Manrope 14px/700, `-0.02em`. Description: 13px muted.
- Sign-out is centralised in `useAuth().logout()`: success `Signed out`, failure
  `Could not sign out`. Do not fire a second toast in the caller.
- Reduced motion disables toast animation.

---

## 11. Register skeleton

- `RegisterSkeleton` wraps `RegisterSkeletonBody` in the real shell so the final
  2-column shape paints before JS/fonts finish.
- Shimmer blocks (`.reg-skel`) 8px radius, foreground/8% fill, 1.6s moving
  highlight; mirrors intro, 3 groups, 2-column field grid, actions and footer.
- Shimmer disabled under `prefers-reduced-motion`.
- Never show a bare spinner/“Loading…” on `/register`.

---

## 12. Naming: Admin, not Owner

- User-facing copy and identifiers say **Admin** (workspace admin, shop admin,
  admin invite/approval, Admin audit log, Admin drawings, `isAdmin`,
  `isAppAdmin`, `useAppAdminStatus`, `hasAdmin`, `LegacyAdminAccess`).
- Preserve stored-data contracts:
  - Postgres columns/RPC params: `legacy_owner_access`, `legacy_owner_emails`,
    `p_legacy_owner_*`.
  - Legacy role value `"owner"` (centralised as `LEGACY_ADMIN_ROLE` in
    `src/types/index.ts`) and the membership tier `"owner"`.
  - Historical SQL in `supabase/migrations/**` — never rewrite.
- Admin checks accept both `Admin` and legacy `owner`; tests cover this.

---

## 13. Accessibility & motion

- Every animation has a `prefers-reduced-motion` opt-out (drift, carousel,
  spotlight, shimmer, toast).
- Focus-visible rings on all interactive elements; never remove outline without
  a replacement ring.
- Inputs use real labels, `aria-invalid`, `aria-describedby` to the error id,
  `aria-busy` on the fieldset, `role="alert"` on errors and `role="status"` for
  caps lock.
- Carousel exposes `aria-roledescription="carousel"`, labelled dots and
  `aria-live="polite"`.
- `100dvh` + safe-area padding keeps the CTA reachable with the keyboard open.
- Touch targets: 28–32px eye/close buttons, 33px mobile CTA, 16px checkbox.

---

## 14. Rules

1. Scope auth styles to `.register-page`; never change the global Paper & Ink
   theme to force V3 elsewhere.
2. No hex in new work — use the oklch tokens.
3. Keep Login and Register as one continuous experience: same shell, card,
   field rhythm, modal and footer.
4. Do not reintroduce the brand row, carousel or workplace switch on Register.
5. Keep required fields asterisked; warn inline and never block silently.
6. Wrong credentials invalidate both fields with a single message under
   Password.
7. Keep the primary CTA brand-yellow with ink text; no arrows on Login.
8. Keep the logo circular and on `/app-logo.png`.
9. Keep copy generic and business-focused.
10. Verify at <768px, 768–1023px, 1024–1279px, ≥1280px, light and dark,
    keyboard-only and reduced-motion.

---

## 15. Verification checklist

- [ ] `/login` reads: Welcome back, Sign in to access your business workspace,
      Email address, Password, Remember me, Forgot password?, Sign in, security
      note, New to PixoBooks? Create a new business.
- [ ] `/register?mode=create` shows no brand/carousel, 2-column fields at
      ≥768px, compact 27/35px controls, GMT-first time zones.
- [ ] Empty submit warns only the empty field; wrong credentials outline both.
- [ ] Remember me and Forgot password? share 13→14px/600/foreground type.
- [ ] Sign out shows one centred glass toast (45% transparent).
- [ ] `/register` first paint is the skeleton, not a spinner.
- [ ] No user-visible “owner” anywhere.
- [ ] `npm run typecheck`, `npm run lint`, `npm run test`, `npm run build` pass.

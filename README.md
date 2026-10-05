# Stroy Bazar

A marketplace catalog of construction and renovation products for Uzbekistan: bathroom
fixtures, tiles, doors, paint, flooring, plumbing, heating, electrical, building materials,
tools and more. It works in **Uzbek (Latin)** by default and **Russian** via the header toggle.

**Stroy Bazar does not sell anything.** There is no cart, checkout or online payment. Every
product belongs to a shop, and the main action is **Contact the shop**: call, Telegram,
WhatsApp or Instagram. The buyer and the shop agree on purchase, delivery and payment
directly.

- **Shops** apply online and get a seller cabinet. They add products, prices, stock and photos.
- **Moderators** approve shops and products before anything becomes public.
- **Customers** browse, filter, compare, save favourites and leave moderated reviews.

Built with **Node.js 22 + Express + MongoDB (Mongoose)** and **vanilla ES modules**. There is
no build step and there are only three runtime dependencies (`express`, `mongoose`, `dotenv`).

| Storefront | Back office |
| --- | --- |
| ![Home page](docs/screenshots/storefront-home.png) | ![Admin dashboard](docs/screenshots/admin-dashboard.png) |
| ![Catalog with filters](docs/screenshots/catalog.png) | ![Moderation queue](docs/screenshots/admin-moderation.png) |
| ![Product page](docs/screenshots/product.png) | ![Seller cabinet](docs/screenshots/seller-dashboard.png) |
| ![Shop page](docs/screenshots/shop.png) | ![Mobile, Russian](docs/screenshots/mobile-home-ru.png) |

> All shops, people, brands, phone numbers, addresses and reviews in the demo data are
> **fictional** and exist only to demonstrate the platform. The only real contacts are the
> marketplace owner's, shown in the header, footer and contact page.

---

## Contents

1. [Quick start](#quick-start)
2. [Demo accounts](#demo-accounts)
3. [Scripts](#scripts)
4. [Features](#features)
5. [Workflows](#workflows)
6. [Roles and permissions](#roles-and-permissions)
7. [Security model](#security-model)
8. [Configuration](#configuration)
9. [Internationalisation](#internationalisation)
10. [Data model](#data-model)
11. [API overview](#api-overview)
12. [Project layout](#project-layout)
13. [Product images and brand assets](#product-images-and-brand-assets)
14. [Production checklist](#production-checklist)

---

## Quick start

### Option A: demo (no MongoDB needed)

```bash
npm install
npm run demo                 # http://localhost:5000
```

The demo starts a small bundled MongoDB-compatible server (`tools/mini-mongo`). It seeds the
following demo data and creates the demo accounts listed below:

- 14 category groups with 51 subcategories, and 27 brands
- 12 approved shops plus 1 shop application waiting for approval
- 135 approved products, plus 3 products waiting for approval and 1 rejected product
- Reviews, 30 days of shop statistics and promo banners

Data is saved to `.data/demo-db.json`, so it survives restarts. Run `npm run demo -- --fresh`
to start over. **The demo database is not for production.**

- Site: <http://localhost:5000>
- Admin panel: <http://localhost:5000/admin>
- Seller cabinet: <http://localhost:5000/seller> (log in on the normal login page)

### Option B: real MongoDB

Requirements: Node.js 22+ and MongoDB 6+.

```bash
npm install
npm run setup                          # creates .env with a random APP_SECRET
# edit .env → MONGODB_URI, APP_ORIGIN, contacts (SUPPORT_PHONE, SUPPORT_TELEGRAM …)
npm start
```

**On the first start with an empty database, the server loads the demo marketplace by
itself.** That means the 12 shops, 135 products, reviews and banners appear right away.
Outside production it also creates the demo accounts. Set `SEED_DEMO_DATA=false` for a
clean start without demo content. The data is never loaded twice and never overwrites
existing data.

In production (`NODE_ENV=production`) demo **accounts** are not created unless you set
`SEED_DEMO_ACCOUNTS=true`. Create your own super-admin with `npm run create-admin`.
`npm run seed` is still available, for example `npm run seed -- --reset` to reload the demo
catalog.

With Docker:

```bash
cp .env.example .env && npm run setup
docker compose up --build              # demo data is loaded on the first start
docker compose exec app npm run create-admin
```

### Option C: Render (render.com)

The site is a **Node.js web service** with a **MongoDB database**. It cannot run as a Render
"Static Site" or on GitHub Pages: without the server, no shops or products load and no login
works.

1. **Database.** Create a free cluster on [MongoDB Atlas](https://www.mongodb.com/atlas):
   - Add a database user.
   - Under *Network Access*, allow `0.0.0.0/0`, because Render has no fixed IP on the free plan.
   - Copy the connection string (`mongodb+srv://USER:PASSWORD@cluster…/stroy-bazar`).
2. **Web service.** On Render, choose *New → Web Service* and connect the GitHub repository.
   An existing service must be a *Web Service*, not a *Static Site*.
   - Branch: `main`
   - Runtime: Node · Build command: `npm ci --omit=dev` · Start command: `npm start`
   - Health check path: `/healthz`

   Alternatively, *New → Blueprint* reads `render.yaml` from the repository and fills these settings in.
3. **Environment variables** (*Environment* tab):

   | Key | Value |
   | --- | --- |
   | `NODE_ENV` | `production` |
   | `MONGODB_URI` | the Atlas connection string |
   | `APP_SECRET` | 32+ random characters (*Generate* in Render, or `npm run setup` locally) |
   | `APP_ORIGIN` | your domain with `https://`, e.g. `https://stroybazar.uz`; leave unset to use the `….onrender.com` address |
   | `ADMIN_EMAIL` | the email you will log in with |
   | `ADMIN_PASSWORD` | 12+ characters, upper and lower case, a digit and a symbol. Avoid common or site words (`admin`, `bazar`, `stroy`, `qurilish`, `parol`, `password`) and your name or email, e.g. `Sariq#Gisht2026` |

4. **Deploy.**
   - On the first start the server fills the empty database with the demo shops and products.
   - It also creates the super-admin from `ADMIN_EMAIL` / `ADMIN_PASSWORD`; the Render log shows `Super-admin … is ready`. If the password is rejected, the log says why.
   - Sign in at `https://YOUR-SITE/admin/login`, then **delete `ADMIN_PASSWORD`** from the environment. Change the password later in the admin panel under *My account*.

Notes for Render:
- **Proxy and cookies.** `TRUST_PROXY` defaults to one hop on Render, so rate limits see the real visitor IP, and cookies are `Secure` because the address is `https://`.
- **Uploads on the free plan.** The disk is temporary: uploaded photos are lost on every deploy or restart. Attach a Render **Disk** (paid) mounted at `/opt/render/project/src/uploads`, or set `UPLOAD_DIR` to the disk's mount path. The bundled product photos are part of the repository and are never lost.
- **Demo shop-owner accounts.** These are not created in production. To try them on Render anyway, set `SEED_DEMO_ACCOUNTS=true` and remove them before launch.

## Demo accounts

These accounts are for **testing only**. They are created by `npm run demo`, on the first
`npm start` with an empty database (outside production), or by
`npm run seed -- --demo-accounts`.

| Role | Login page | Email | Password |
| --- | --- | --- | --- |
| Super-admin | `/admin/login` | `admin@stroybazar.uz` | `Sb-Control#2026` |
| Manager (moderator) | `/admin/login` | `manager@stroybazar.uz` | `Moder#Demo2026` |
| Customer | `/login` | `customer@stroybazar.uz` | `Mijoz#Demo2026` |

Shop owners use the normal login page `/login` and land in the seller cabinet `/seller`:

| Shop (fictional) | Speciality | Email | Password |
| --- | --- | --- | --- |
| AquaLux Santexnika | Bathroom, showers, bathtubs | `aqualux@stroybazar.uz` | `Vanna#Demo2026` |
| Unitaz Markazi | Toilets and sinks | `unitaz@stroybazar.uz` | `Kompakt#Demo2026` |
| Keramika Plaza | Tiles and porcelain | `keramika@stroybazar.uz` | `Kafel#Demo2026` |
| PortaNova Eshiklar | Interior and entrance doors | `portanova@stroybazar.uz` | `Eshik#Demo2026` |
| ColorMix Boʻyoqlar | Paint, primers, wallpaper | `colormix@stroybazar.uz` | `Rang#Demo2026` |
| ParketHaus | Parquet, laminate, flooring | `parkethaus@stroybazar.uz` | `Parket#Demo2026` |
| Quvur Servis | Pipes, fittings, plumbing | `quvur@stroybazar.uz` | `Truba#Demo2026` |
| TeploDom | Radiators, boilers, water heaters | `teplodom@stroybazar.uz` | `Issiq#Demo2026` |
| Volt Elektr | Electrical and lighting | `volt@stroybazar.uz` | `Rozetka#Demo2026` |
| StroyOptom Sergeli | Cement, drywall, blocks, insulation | `stroyoptom@stroybazar.uz` | `Sement#Demo2026` |
| Usta Asboblari | Tools, adhesives, sealants | `usta@stroybazar.uz` | `Asbob#Demo2026` |
| KitchenStone | Kitchen sinks, countertops, hoods | `kitchenstone@stroybazar.uz` | `Oshxona#Demo2026` |
| Mozaika UZ *(pending approval)* | Mosaic and decor | `mozaika@stroybazar.uz` | `Dekor#Demo2026` |

Change or delete these accounts before a real launch. In the admin panel go to *Users*;
deleting the owner of a shop is blocked until the shop is reassigned.

## Scripts

| Command | Purpose |
| --- | --- |
| `npm start` | Start the server (`server.js`) |
| `npm run dev` | Start with auto-restart when `src/` changes |
| `npm run demo` | Demo with the bundled in-memory database (`-- --fresh` resets it) |
| `npm run setup` | Create `.env` from `.env.example` with a fresh `APP_SECRET` |
| `npm run seed` | Seed the catalog. Flags: `-- --reset` (replace catalog data), `-- --demo-accounts` |
| `npm run create-admin` | Create or reset a super-admin (interactive, or via `ADMIN_EMAIL` / `ADMIN_NAME` / `ADMIN_PASSWORD`) |
| `npm test` | 60 integration and unit tests (`node:test`, in-memory database) |
| `npm run check:i18n` | Fail if the uz/ru dictionaries have different keys |
| `npm run lint` | ESLint |
| `npm run check` | Lint, i18n check and tests |
| `npm run brand:assets` | Regenerate the logo, favicons, shop monograms, placeholder and Open Graph images |
| `npm run render:jobs` / `npm run render` | Rebuild the product photo job list / re-render product photos (see below) |

## Features

### Storefront

- **Home page.** It includes:
  - A hero with large search and popular searches, plus live counters.
  - A "product → shop → contact" card.
  - Category tiles with photos and promo banners.
  - Rows of featured products, discounts, new arrivals and popular products, plus featured shops and brands.
  - A "how it works" section, benefits, recently viewed products and a call to action for sellers.

  Admins can switch every section on or off and edit the hero texts.
- **Catalog.**
  - Two-level categories and full-text search in both languages. Search ignores Uzbek apostrophe variants and treats ё as е.
  - Filters for subcategory, brand, shop, colour, availability, price range, discounts only and rating.
  - Live facet counts and filter chips; the state is kept in the URL.
  - Sorting: recommended, popular, newest, price, biggest discount, rating, name.
  - Mobile filter drawer.
- **Product page.**
  - Photo gallery, price with old price and discount, SKU, brand and category.
  - Availability and stock, plus lead time for made-to-order items.
  - Colours, sizes, description and a specifications table.
  - Shop card with rating, address and hours, and a prominent **Contact the shop** box with call / Telegram / WhatsApp / Instagram.
  - A ready-made Telegram message (product name, SKU and link) is copied to the clipboard.
  - Moderated reviews, more products from the same shop, similar products, and a sticky contact bar on mobile.
- **Shops.**
  - Directory with search, category and city filters, and sorting.
  - Shop page with cover, logo, brand colour, description, address with map link, working hours, all contact channels, rating and reviews, product count, categories and the full product list.
- **Favourites and recently viewed.** Favourites are stored locally and synced to the account after login; the favourites page groups them by shop. Recently viewed products are stored locally.
- **Accounts.** Registration with the password policy and a strength meter, favourites, "my reviews" with moderation status, profile, password change and active sessions.
- **Sell on Stroy Bazar.** A page for shops plus an application form that creates the owner account and a pending shop.
- **About and Contact pages** with the marketplace owner's contacts, all clickable.
- **SEO and accessibility.**
  - Server-rendered titles and descriptions per language, `hreflang`, canonical URLs and per-language Open Graph images.
  - JSON-LD (`Product`, `HardwareStore`).
  - Keyboard support, skip links, ARIA live regions and `prefers-reduced-motion`.
- **Mobile-first.** Two-column product grid, bottom tab bar, off-canvas menus, and touch-sized contact buttons.

### Seller cabinet (`/seller`)

- **Dashboard.**
  - Product counts by moderation status.
  - Views and contact clicks over 30 days, as a chart and per channel.
  - Most-contacted products, low stock and latest reviews.
  - The shop's own moderation status, with the moderator's note.
- **My products.** A searchable list with inline stock status and visibility switches. The editor covers bilingual name and description, subcategory, brand, unit, price and old price (the discount is computed), colours, sizes, specs, stock, lead time and photo upload with drag-and-drop.
- **Moderation rules.**
  - New products go to moderation.
  - On approved products, price, stock and visibility changes apply immediately.
  - Changing content (name, photos, description, category, specs …) sends the product back to moderation.
  - Rejected products show the moderator's reason.
- **Shop profile.** Name, tagline, description, logo and cover upload, brand colour, phones, Telegram, Instagram, WhatsApp, email, website, address, landmark, map link, working hours and days, payment methods and delivery.

### Admin panel (`/admin`)

- **Dashboard.** Moderation backlog, products, shops, out-of-stock items, 30-day views, contacts and new users, an activity chart, pending products, top shops and recent activity.
- **Moderation.** One queue for pending products, shop applications and reviews, with approve or reject actions (rejections need a reason). The sidebar badge shows the backlog.
- **Products.**
  - Every shop's products, with filters by status, shop, category and stock.
  - Inline stock and publish controls, and a "featured" flag.
  - The full editor, plus duplicate, history and delete.
- **Categories and brands.** A two-level category tree with icons, photos, sort order and visibility; empty or hidden categories never appear on the site. Brands have a country.
- **Shops.** Create shops or edit everything about them, assign the owner by email, set verified and featured flags, and approve, reject, suspend or restore shops. A suspended shop and its products disappear from the site at once.
- **Reviews.** Approve, reject or delete; ratings are recalculated automatically.
- **Homepage and settings.** Public contacts (owner, phone, Telegram, Instagram, email, address, hours), hero texts, popular searches, the announcement bar and home sections on/off. Editing the public contacts needs super-admin; managers can edit the rest.
- **Banners.** Home-page promo banners with theme, image, link and an optional schedule.
- **Interface texts.** Override any public UI string per language without a deploy.
- **Users (super-admin).** Create accounts with a generated one-time password, then change roles, activate or deactivate, reset passwords, unlock, end sessions or delete.
- **Activity log (super-admin).** Field-level diffs of every change, logins, lockouts and access denials, with filters.

## Workflows

```
Shop application ── /sell form ──► shop: pending ──► admin approves ──► shop: approved (public)
                                                   └► rejected (owner sees reason) / suspended later

Owner adds product ──► product: pending ──► moderator approves ──► approved (public)
                                         └► rejected + reason ──► owner fixes ──► pending again

Customer review ──► pending ──► moderator approves ──► public, rating recalculated
```

A product is public only when it is **approved**, **published** (`isActive`), its
**subcategory and parent category are active**, and its **shop is approved**.

Contact clicks (phone, Telegram, Instagram, WhatsApp) and page views are counted per shop and
day (`ShopStat`). They power the seller and admin statistics. No personal data is stored.

Optional: set `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID` to get a Telegram message when a shop
applies or a product waits for moderation.

## Roles and permissions

| Permission | Super-admin | Manager | Shop owner | Customer |
| --- | :-: | :-: | :-: | :-: |
| Admin panel, dashboard, moderation queue | ✔ | ✔ | — | — |
| Products of all shops: view / edit / approve | ✔ | ✔ | — | — |
| Products: delete | ✔ | ✔ | own only | — |
| Categories and brands: create / edit | ✔ | ✔ | — | — |
| Categories and brands: delete | ✔ | — | — | — |
| Shops: create / edit / approve / suspend | ✔ | ✔ | own profile | — |
| Shops: delete | ✔ | — | — | — |
| Reviews: moderate | ✔ | ✔ | — | — |
| Banners, home texts, sections | ✔ | ✔ | — | — |
| Site contacts and settings | ✔ | — | — | — |
| Interface translations | ✔ | — | — | — |
| Users and roles, activity log | ✔ | — | — | — |
| Seller cabinet (own shop, products, stats) | — | — | ✔ | — |
| Image uploads | ✔ | ✔ | ✔ | — |
| Write reviews, favourites, own account | ✔ | ✔ | ✔ | ✔ |

The matrix lives in `src/security/rbac.js`. Routes check **permissions**, never role names.
Every seller query is scoped to the owner's shop on the server
(`src/services/sellerService.js`). Another shop's product returns 404, never 403, so IDs
cannot be probed.

## Security model

| Threat | Mitigation |
| --- | --- |
| Session theft / fixation | **Sessions:** server-side, with a 256-bit random token in the cookie and only its SHA-256 hash stored. **Cookies:** `HttpOnly`, `SameSite=Strict` for staff and shop owners, `Lax` for customers, and `Secure` with the `__Host-` prefix on HTTPS. **Timeouts:** idle / absolute timeouts per role (staff 30 min / 12 h, sellers 8 h / 7 days, customers 14 / 30 days). **Revocation:** `tokenVersion` revokes all sessions after a password, role or status change. |
| CSRF | HMAC-signed token bound to the session (`X-CSRF-Token` header), `Origin` and `Sec-Fetch-Site` checks, and SameSite cookies. |
| Brute force and spam | **Login:** per-IP and per-email limits, account lockout after 5 failures, and identical responses with equalised timing for unknown emails. **Forms:** limits on shop applications, product creation, reviews and contact tracking, plus a honeypot field. **Store:** limits are kept in MongoDB, so they work across instances. |
| Weak passwords | **Policy:** 12+ characters with upper case, lower case, digit and symbol; common passwords, site words and the user's own name or email are blocked; the last 5 cannot be reused. **Hashing:** scrypt. **Temporary passwords:** must be changed before any other action. |
| XSS | **Input:** text is sanitised. **Rendering:** client rendering goes through an escaping `html` template and one Trusted Types policy. **CSP:** strict — `script-src 'self'`, no inline scripts or style attributes, `require-trusted-types-for 'script'`. **URLs:** checked with `safeUrl`. |
| NoSQL injection | **Schemas:** each one builds a new object with declared fields only; `$`-keys, dotted keys and `__proto__` are rejected. **Mongoose:** runs with `sanitizeFilter`, and operators are added server-side only via `mongoose.trusted()`. **Regex:** input is escaped. |
| Mass assignment / escalation | **Unknown fields:** stripped, so `role`, `status`, `isFeatured`, `shop` and `owner` are ignored when sent by sellers or customers. **Staff:** admins cannot change their own role, and the last super-admin cannot be removed. |
| Broken access control | **RBAC:** deny-by-default permission matrix on every API route. **Seller scope:** enforced in the service layer. **Audit:** denials are logged. **Visibility:** public queries only return approved and visible data. |
| File upload abuse | **Accepted files:** JPEG/PNG/WebP up to 5 MB, verified by magic bytes; SVG is never accepted. **Storage:** random file names, served with `nosniff` and a sandbox CSP. |
| Secrets | **Server only:** secrets live in environment variables (`.env`, never committed), and the Telegram token never reaches the browser. **Production config:** `src/config.js` refuses to start in production with a short `APP_SECRET` or without secure cookies. |
| Headers | `frame-ancestors 'none'`, HSTS on HTTPS, COOP/CORP, `Permissions-Policy`, `Referrer-Policy`, `X-Powered-By` removed, and admin/seller pages `noindex` + `no-store`. |
| Accountability | **Audit log:** append-only, recording logins, lockouts, every create/update/delete with field diffs, approvals, rejections, suspensions, settings and translation changes, and access denials. |

See [SECURITY.md](SECURITY.md) for operational guidance.

## Configuration

All settings are environment variables; `.env.example` documents every one.

| Variable | Default | Notes |
| --- | --- | --- |
| `APP_SECRET` | — (required in production) | 32+ random characters (`npm run setup`) |
| `APP_ORIGIN` | `http://localhost:5000` | Public URL; must be `https://…` in production |
| `MONGODB_URI` | `mongodb://127.0.0.1:27017/stroy-bazar` | |
| `PORT`, `HOST` | `5000`, `0.0.0.0` | |
| `TRUST_PROXY` | off | Hop count behind nginx / a load balancer |
| `SITE_NAME` | `Stroy Bazar` | |
| `OWNER_NAME` | `Alisherbek Bobokulov` | Default public contact (editable later in admin) |
| `SUPPORT_PHONE` | `+998 90 098 00 23` | " |
| `SUPPORT_TELEGRAM` | `iafys` | Username without `@` |
| `SUPPORT_INSTAGRAM` | `xifpebo` | Username without `@` |
| `DEFAULT_LANG` | `uz` | `uz` or `ru` |
| `FONT_PROVIDER` | `local` | `local` (self-hosted, default), `google` or `system` |
| `SESSION_IDLE_MINUTES_STAFF` / `SESSION_ABSOLUTE_HOURS_STAFF` | `30` / `12` | Admin panel |
| `SESSION_IDLE_HOURS_SELLER` / `SESSION_ABSOLUTE_DAYS_SELLER` | `8` / `7` | Seller cabinet |
| `SESSION_IDLE_DAYS_USER` / `SESSION_ABSOLUTE_DAYS_USER` | `14` / `30` | Customers |
| `LOGIN_MAX_ATTEMPTS`, `LOGIN_LOCK_MINUTES`, `PASSWORD_HISTORY` | `5`, `15`, `5` | |
| `RATE_LIMIT_STORE` | `mongo` | `memory` only for a single process |
| `UPLOAD_DIR`, `UPLOAD_MAX_MB` | `uploads`, `5` | Put uploads on persistent storage |
| `AUDIT_RETENTION_DAYS` | `365` | `0` keeps entries forever |
| `SEED_DEMO_DATA` | `true` | Load the demo shops/products when the database is empty |
| `SEED_DEMO_ACCOUNTS` | `true` (dev) / `false` (production) | Create the demo accounts with the README passwords on that first load |
| `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` | empty | Optional moderation notifications |
| `ADMIN_EMAIL`, `ADMIN_NAME`, `ADMIN_PASSWORD` | empty | Super-admin created (or repaired) on start-up; also used by non-interactive `npm run create-admin`. Remove `ADMIN_PASSWORD` after signing in |

## Internationalisation

- **Languages:** Uzbek Latin (`uz`, default) and Russian (`ru`). The toggle adds `?lang=` and remembers it in the `sb_lang` cookie.
- **Server-rendered text:** uses `{{t:key}}`. The browser uses the same dictionaries (`/i18n/{public|admin}/{lang}.json`); the public bundle has no admin strings.
- **Dictionaries:** `src/i18n/locales/uz.json` and `ru.json`. `npm run check:i18n` (and the tests) fail when keys differ.
- **Overrides:** admins can change any public text in *Interface texts*; overrides are stored in MongoDB and applied without a restart.
- **Database content:** stored as `{ uz, ru }` (names, descriptions, specs, addresses …).
- **Reviews:** written in one language. A page lists reviews in its own language, and reviews in the other language load only on request, so pages don't mix languages.
- **Uzbek spelling:** uses the correct letters `oʻ gʻ` (U+02BB) and `ʼ` (U+02BC); search treats all apostrophe variants alike.

## Data model

| Model | Purpose |
| --- | --- |
| `Category` | Two levels (`parent`), bilingual name/description, icon, image, sort order, active flag |
| `Brand` | Name, country, description |
| `Shop` | Owner, status (`pending/approved/rejected/suspended`) and note, texts, address, city, map link, all contact channels, hours and days, delivery, payment methods, accent colour, logo, cover, verified/featured, rating |
| `Product` | Shop, SKU, slug, bilingual name/description, category, brand, unit, price, old price → `discountPercent`, colours, sizes, specs, stock and lead time, images, status (`draft/pending/approved/rejected`) and note, featured, published, rating, views, contacts |
| `Review` | Product or shop, author, rating, text, language, status |
| `ShopStat` | Per shop and day: product views, shop views, contact clicks per channel |
| `Banner`, `Setting`, `Translation` | Home-page banners, site settings, UI text overrides |
| `User`, `Session`, `AuditLog`, `RateLimitHit` | Accounts (roles `superadmin/manager/shop_owner/user`, favourites), sessions, audit trail, rate limits |

## API overview

Write requests need JSON and the `X-CSRF-Token` header from `GET /api/auth/session`. Errors
are returned as `{ error: { code, message, fields?, requestId } }` in the request language.

| Area | Endpoints |
| --- | --- |
| Auth | `GET /api/auth/session`, `POST /api/auth/login`, `POST /api/auth/admin/login`, `POST /api/auth/register`, `POST /api/auth/register-shop`, `POST /api/auth/logout`, `POST /api/auth/password`, sessions list / end / `logout-others` |
| Catalog (public) | `GET /api/catalog/home`, `/stats`, `/categories`, `/brands`, `/products` (filters, `facets=1`), `/products/:slug`, `/lookup?ids=`, `/suggest?q=`, `/shops`, `/shops/:slug`, `/reviews`; `POST /api/catalog/track` |
| Reviews, account | `POST /api/reviews`; `PATCH /api/account/profile`, `GET/PUT /api/account/favorites`, `GET /api/account/reviews` |
| Seller | `GET /api/seller/stats`, `/options`, `GET/PUT /api/seller/shop`, `/api/seller/products` (list, get, create, put, patch, delete) |
| Admin | `/api/admin/dashboard`, `/options`, `/products` (+ `/:id/moderate`), `/categories`, `/brands`, `/shops` (+ `/:id/status`), `/reviews`, `/banners`, `/settings` (+ `/settings/home`), `/translations`, `/users`, `/audit` |
| Uploads | `POST /api/uploads` (raw image body; staff and shop owners) |
| Misc | `GET /api/meta` (enumerations), `GET /healthz` |

## Project layout

```
server.js                 entry point (config → logger → DB → HTTP, graceful shutdown)
src/
  app.js, config.js       Express app factory; validated env config
  domain/constants.js     units, colours, statuses, regions, icons, sorts …
  security/               sessions, CSRF, rate limits, RBAC, passwords, headers, cookies
  middleware/             auth guards, locale, request logging, errors
  models/                 Category, Brand, Shop, Product, Review, ShopStat, Banner, Setting, Translation, User …
  services/               catalog (public), adminCatalog, seller, reviews, content, users, auth, audit, uploads, notify
  validation/             request schemas (dependency-free validator in lib/schema.js)
  routes/api/             auth, catalog, reviews, account, seller, admin, uploads
  routes/pages.js         server-rendered pages (SEO, hreflang, JSON-LD)
  views/                  template engine, layouts, partials, pages
  i18n/                   dictionaries and helpers
  seed/                   demo taxonomy, shops, products, reviews (data/*.js)
public/
  css/app.css, admin.css  storefront design system; back-office shell
  js/site.js, js/pages/   storefront pages
  js/admin/               admin + seller SPA (boot.app = admin | seller)
  js/lib/                 shared modules (safe HTML, API, i18n, forms, favourites, contact, reviews …)
  img/products/           rendered product photos (WebP)
  img/shops/              shop logos (SVG) and covers (WebP)
  fonts/                  self-hosted Oswald and IBM Plex (OFL)
scripts/                  demo, setup, seed, create-admin
tools/
  mini-mongo/             in-memory MongoDB wire server (demo/tests only)
  render/                 Blender product photo pipeline
  generate-brand-assets.js
test/                     node:test suites
```

## Product images and brand assets

The product and shop-cover photos in `public/img/products` and `public/img/shops` are
**computer-generated studio renders** made for this project. They contain no watermarks,
no text, and no third-party photos or trademarks. Each image is generated from the product's
own data (type, colour, finish, size), so it always matches the product. Shops can replace
them with their own photos at any time.

The pipeline lives in `tools/render`. It is plain Python for Blender's `bpy` module, rendered
with Cycles:

- `studio.py`: studio lighting and materials.
- `models_bath.py`, `models_build.py`, `models_eng.py`: parametric models.
- `render.py`: the batch driver.

```bash
python3 -m venv .venv && .venv/bin/pip install bpy==4.5.*   # Python 3.11
npm run render:jobs                                          # tools/render/jobs.json from the seed data
                                                             # (-- --missing: only absent images, -- --only SKU1,SKU2)
.venv/bin/python tools/render/render.py --samples 64 --size 1000
```

`npm run brand:assets` regenerates the logo mark, favicons, app icons, shop monograms, the
placeholder image and the Open Graph images. The PNG step needs Playwright with Chromium; set
`PLAYWRIGHT_MODULE` to use a global install.

## Production checklist

- [ ] Serve over HTTPS and set `APP_ORIGIN=https://…`. Secure `__Host-` cookies and HSTS turn on automatically.
- [ ] Generate a strong `APP_SECRET` (`npm run setup`) and keep `.env` out of version control.
- [ ] Put the app behind a reverse proxy and set `TRUST_PROXY` to the exact hop count.
- [ ] Use MongoDB with authentication, TLS, a least-privilege user and backups.
- [ ] Create your own super-admin with `npm run create-admin`, then remove the `ADMIN_*` variables.
- [ ] **Do not** create the demo accounts in production. If the demo data was used, delete the demo shops and accounts, or reset with `npm run seed -- --reset` on a fresh database.
- [ ] Check the public contacts in *Admin → Homepage and settings*.
- [ ] Put `uploads/` on persistent storage and back it up.
- [ ] Optionally restrict `/admin` and `/api/admin` by IP or VPN at the proxy.
- [ ] Ship JSON logs to your log system and alert on `auth.locked` and `access.denied`.
- [ ] Run `npm audit` and keep Node.js and dependencies patched.

`tools/mini-mongo` is a small MongoDB wire-protocol server written so that the demo and tests
run without a database. **It is not a database; never use it in production.**

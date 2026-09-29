# KitchenX

B2B supplies platform prototype — a set of static HTML/CSS/JS screens for the customer app, admin console, and role-specific dashboards. No backend, no build step; everything runs client-side.

## Requirements

- A modern browser (Chrome, Edge, Firefox).
- Node.js is **not** required to view the prototype. It's only used for an optional PDF/font tooling dependency (`pdf-lib`, `opentype.js`) that isn't currently wired into any page.

## Getting started

**Step 1 — clone and enter the project folder**

```bash
git clone <this-repo-url>
cd kitchenx
```

**Step 2 — do you need `npm install`? No.**
This is a static HTML/CSS/JS prototype — no backend, no build step, no JS modules. There is nothing to compile and nothing that needs to run in Node. Skip `npm install` entirely unless you're specifically working on the PDF/font tooling mentioned under Requirements — that dependency isn't wired into any page.

**Step 3 — open the app**
Just double-click [kitchenx-v2.html](kitchenx-v2.html) (or open it via your browser's File > Open). That's the entry point — home page + login. It'll open straight in your browser and works immediately, no server required.

**Optional — serve it locally instead**
Opening the file directly is enough for this prototype. If you ever hit a browser quirk with local file access, you can serve the folder instead:

```bash
# from the kitchenx project root
npx serve .
# or
python -m http.server 8000
```

Then visit `http://localhost:3000` (or `:8000`) and open `kitchenx-v2.html` from there.

## Logging in

Click **Login** on the home page, then pick **Customer** or **Admin**.

- **Customer tab** — any username/password works, opens [customer.html](customer.html).
- **Admin tab** — needs one of the fixed demo accounts (role, username, password, and which dashboard it opens) listed in [credentials.md](credentials.md).

## Pages

| File | Purpose |
|---|---|
| [kitchenx-v2.html](kitchenx-v2.html) | Home / marketing page + login & signup overlay |
| [customer.html](customer.html) | Customer-facing ordering app |
| [admin.html](admin.html) | Platform Admin console |
| [finance.html](finance.html) | Finance Admin dashboard |
| [technical.html](technical.html) | Technical Admin dashboard |
| [rm.html](rm.html) | Relationship Manager dashboard |
| [warehouse.html](warehouse.html) | Warehouse Supervisor/Manager dashboard |

## Notes

- Brand webfonts (Gabriel Sans, Degular) are licensed and not committed — see [assets/fonts/DROP-FONTS-HERE.txt](assets/fonts/DROP-FONTS-HERE.txt). Until they're added, the prototype falls back to Inter Tight + Source Sans 3.
- `node_modules/` is gitignored; run `npm install` only if you're working on the PDF/font tooling.

# kitchenx.tech → GitHub Pages

GitHub is configured: **Settings → Pages → Custom domain** = `kitchenx.tech` (repo `CNAME` file matches).

## Namecheap → Advanced DNS (`kitchenx.tech`)

Remove parking / old host records for `@` and `www`, then add:

| Type  | Host | Value                 |
|-------|------|-----------------------|
| A     | `@`  | `185.199.108.153`     |
| A     | `@`  | `185.199.109.153`     |
| A     | `@`  | `185.199.110.153`     |
| A     | `@`  | `185.199.111.153`     |
| CNAME | `www`| `suryavirata.github.io` |

Save, wait up to ~1 hour (often minutes).

## GitHub (after DNS propagates)

1. [Pages settings](https://github.com/SuryaVirata/kitchenx-prototype/settings/pages) — confirm green check on `kitchenx.tech`.
2. Enable **Enforce HTTPS**.

## Expected URLs

- `https://kitchenx.tech/` → `index.html` → prototype (`kitchenx-v2.html`)
- `https://www.kitchenx.tech/` → same site (via `www` CNAME)
- Legacy: `https://suryavirata.github.io/kitchenx-prototype/` still works

Direct link: [Namecheap Advanced DNS](https://ap.www.namecheap.com/domains/domaincontrolpanel/kitchenx.tech/advancedns)

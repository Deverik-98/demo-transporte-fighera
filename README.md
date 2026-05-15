# Transporte Fighera - Prototipos Sincronizados

Este repositorio contiene:

- `Panel Administrativo ERP` (web admin)
- `Prototipo App Choferes Transporte` (mobile web)

Ambos comparten datos con `localStorage`, por lo que deben abrirse bajo el mismo origen.

## URLs esperadas en deploy

- `/admin/`
- `/mobile/`

## Publicar en GitHub Pages

1. Crea un repositorio publico en GitHub.
2. Sube este proyecto y usa `master` como rama estable.
3. En GitHub, ve a **Settings > Pages** y selecciona **GitHub Actions** como source.
4. Cada push a `master` ejecuta `.github/workflows/deploy-pages.yml`.
5. Al terminar, abre:
   - `https://<tu-usuario>.github.io/<tu-repo>/admin/`
   - `https://<tu-usuario>.github.io/<tu-repo>/mobile/`

## Desarrollo local sincronizado

Build de ambos:

```bash
npm run build --prefix "Panel Administrativo ERP"
npm run build --prefix "Prototipo App Choferes Transporte"
```

Servidor unificado local:

```bash
node serve-unified-prototypes.cjs
```

(En la raíz del repo hay `"type": "module"`; el servidor unificado usa CommonJS y por eso el archivo es `.cjs`.)

Abrir:

- `http://localhost:5180/admin/`
- `http://localhost:5180/mobile/`

## Build para GitHub Pages (manual)

```bash
npm run build:gh
```

Esto genera `gh-pages-dist/` con:

- `gh-pages-dist/admin`
- `gh-pages-dist/mobile`
- `gh-pages-dist/index.html`

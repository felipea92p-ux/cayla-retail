---
paths:
  - "apps/tienda/**"
  - "packages/shared/**"
---

## La tienda y el ERP no comparten estilos (regla — ADR-0616, Felipe 2026-11-06)

**`apps/tienda` y `apps/web` tienen cada una sus estilos: ninguna importa una hoja ni usa una variable de la otra** (`--color-*` son del ERP, `--dn-*` de la tienda). Cambiar el diseño de una no toca a la
otra. Lo común es lógica (`packages/shared`), nunca aspecto; el único CSS repetido, `campana-efectos.css`, es una copia en cada app con su prueba. En la tienda, **una pieza cuya única línea es un borde de un
lado no lleva esquinas redondas** (el borde se curva y se ve un arco). Lo vigila `apps/tienda/lib/css-de-la-tienda.test.ts`.

---
paths:
  - "apps/web/components/**/*.tsx"
  - "apps/web/app/**/*.tsx"
  - "apps/web/app/**/*.css"
  - "apps/web/app/estilos/tema.css"
  - "apps/web/tema/**"
---

## Modo oscuro (regla — ADR-0336, Felipe 2026-10-05)

**El ERP tiene modo oscuro, y una pantalla que usa solo tokens lo alcanza sin hacer nada.** Es una preferencia del APARATO
(`localStorage["cayla-tema"]`, arranca en claro, un script en el `<head>` pone `data-tema` antes de pintar), y se cambia en
**«Apariencia»**, la fila al pie del menú que junta los ajustes del aparato (modo oscuro, animaciones y modo liviano; Felipe 2026-11-17,
ADR-0674 act.); lo ve toda cuenta, también una terminal, y **no es un módulo** (ADR-0306). Los MISMOS tokens se redefinen bajo
`:root[data-tema="oscuro"]` en `apps/web/app/estilos/tema.css`, con `tinta` y `crema` intercambiados (texto `#f5f0e8` y un fondo de negro cálido, `#1c1a17`, el oscuro de la familia CAYLA que comparte con Dynamic: ADR-0336, act. 2026-10-26):
`bg-papel`, `text-tinta` y `border-sand` se invierten solos. Imprimir sale SIEMPRE en claro (el oscuro vive en `@media screen`).

Lo que se exige a toda pantalla, modal o pieza nueva o editada:
1. **Solo tokens: nunca un hex, un `rgb()`/`rgba()` (tampoco dentro de una clase de Tailwind, `shadow-[0_8px_rgba(…)]`), `bg-white` ni
   `bg-gray-*`.** Lo hace cumplir `lib/tema-colores.test.ts` (definición única: `apps/web/tema/colores-sueltos.mjs`). Una línea legítima
   se exime con `// tema-fijo: <motivo de 10 caracteres o más>`, y un archivo entero se declara permanente, con su motivo, en
   `lib/tema-colores-archivos.ts`. Hoy la deuda es **0**: un archivo nuevo no puede nacer con un color suelto.
2. **Un velo y una sombra de elevación son `--color-sombra`** (`bg-sombra/25 dark:bg-sombra/55`, `shadow-[…color-mix(in_srgb,var(--color-sombra)_35%,transparent)]`),
   nunca `tinta`: en oscuro `tinta` es crema y el velo ACLARARÍA la pantalla. Una tarjeta de vidrio es `--color-vidrio`; un filo o un anillo
   que debe invertirse es `tinta`.
3. **Papel físico y color de dato no se oscurecen.** Lo que se imprime o se ve como saldrá impreso (boleta, ticket, etiqueta, QR, cartel
   del club) lleva `.papel-fijo` (vuelve a declarar los tokens claros) o, si ya es blanco por sí mismo, `data-papel`. El color de una
   PRENDA (la baldosa de `MosaicoPrenda`, la muestra de un tejido) es dato: no cambia, lleva `data-color-dato`, y el texto que se
   escribe encima usa `--color-tinta-fija` / `--color-crema-fija` (idénticos en los dos temas), nunca `tinta`/`crema`. Una pantalla
   de cámara sobre el video es negra en los dos temas (`bg-tinta-fija` + `.papel-fijo`, como los tres visores).
4. **Un texto tenue de Tailwind ya sube solo, en los dos temas** (dos pisos en `tema.css`, con `:where` para no ganarle a `hover:` ni a
   `disabled:`): en oscuro, `text-tinta/35` a `/50` al 60 %; en claro (desde el 2026-10-14, Felipe lo eligió mirando), `text-tinta/35` a
   `/60` al 64 %; `text-taupe/50` a `/70`, al taupe pleno en los dos; y sus marcadores (`placeholder:text-tinta/…`) igual. `/25` y `/30` son
   fantasmas a propósito. No escribas `dark:` por costumbre, solo donde una medida lo pida (`dark:text-tinta/55`). `dark:` sigue el atributo, no el
   sistema operativo. **No apagues un texto con `opacity-*` solo en claro** (`opacity-60 dark:opacity-85` en un conteo): el piso no lo ve y
   en claro se pierde; usa el tono del texto o la misma opacidad en los dos temas. **El piso tampoco alcanza al texto tenue escrito en un
   CSS** (`color:` o una variable `--x:` hecha de `color-mix(… var(--color-tinta) N%, transparent)`): desde el 64 % pasa en todo fondo y
   tema; por debajo, la línea lleva `/* contraste: texto|texto grande|gráfico sobre <fondos> */` o `no aplica — <motivo>`, y
   `lib/tema-tokens.test.ts` la mide (solo en oscuro si vive en un bloque `[data-tema="oscuro"]`), junto con los dos pisos (ADR-0336, act.
   2026-10-14).
5. **Un token de color nuevo** va en el `@theme` de `globals.css`, en el bloque oscuro de `tema.css` y en `.papel-fijo` (si es de papel);
   `lib/tema-tokens.test.ts` falla si no coinciden, mide el contraste de cada texto sobre cada superficie y exige que toda
   `var(--color-…)` del código exista (Tailwind v4 solo emite un token que ve usado en CSS: el bloque de la paleta es `@theme static`).

**Cómo se verifica (antes de dar una pantalla por terminada):** `pnpm --filter web tema:auditar -- --cuenta <cuentas> --ruta <rutas> --escenarios`
(`apps/web/tema/`, su README explica todo): entra con cada cuenta de prueba, mide el contraste WCAG real de cada texto, detecta manchas
claras y velos que aclaran, y separa **lo que falla solo en oscuro** (lo rompió el tema: urgente) de lo heredado del claro. **Solo
corre contra localhost**, y hay que MIRAR las capturas: no ve todo (una 404 blanca, un visor de cámara sin cámara, un texto negro
sobre blanco «pasa»). Cada modal, hoja o estado nuevo se agrega como escenario en `tema/escenarios/registro.mjs` (con su `abre`, para
que un escenario no pase en verde sin haber abierto nada). Y donde la regla de celular lo exige (Vender, Cambios, Devoluciones), a 375 px.
Los números exactos y el porqué de cada decisión: `docs/adr/0336-modo-oscuro-del-erp.md`.

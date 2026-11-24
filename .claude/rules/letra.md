---
paths:
  - "apps/web/components/**/*.tsx"
  - "apps/web/app/**/*.tsx"
  - "apps/web/app/**/*.css"
  - "apps/web/tema/letra-suelta.mjs"
  - "apps/web/lib/letra-*"
---

## La letra sale de una escala (regla — ADR-0691, Felipe 2026-11-19)

**Felipe: «hay cosas con fuente demasiado pequeña y son imposibles de leer».** La letra de menos de 22 px sale de cinco escalones, que viven en el
`@theme` de `apps/web/app/globals.css`, y **nada se escribe por debajo de 13 px**:

| px | Utilidad | En una hoja de estilos | Para qué |
|---|---|---|---|
| 13 | `text-xs` | `var(--text-xs)` | lo más chico: etiquetas, chips, conteos |
| 14 | `text-detalle` | `var(--text-detalle)` | la segunda línea de una fila, lo denso de una tabla, los botones |
| 16 | `text-sm` | `var(--text-sm)` | lo que se lee |
| 18 | `text-lg` | `var(--text-lg)` | el título de una fila o de una tarjeta |
| 21 | `text-xl` | `var(--text-xl)` | el título de una sección |

**Nunca un tamaño a mano** (`text-[11px]`, `font-size: 11px`, `fontSize: 11`): un archivo nuevo no puede nacer con uno y la deuda de antes solo baja
(`lib/letra-suelta.test.ts`; definición única: `tema/letra-suelta.mjs`; `pnpm --filter web tema:letra` lista lo que queda). Desde 22 px es exhibición
(títulos de pantalla, cifras grandes) y todavía no se vigila. Mientras se migra módulo por módulo, `app/estilos/letra.css` (**el puente**) lleva en
pantalla cada `text-[Npx]` a su escalón: no es un destino, y cada tamaño que ya no usa nadie se borra de ahí. Lo que de verdad no es letra de la
interfaz —el papel que se imprime, las iniciales dentro de un círculo, el rótulo de una baldosa— lleva `letra-fija: <por qué>` en un comentario de su
línea (y `data-letra-fija` si es una clase, para que el puente no la toque). Una clase con variante se escribe con la utilidad (`sm:text-xs`), nunca
`sm:text-[11px]`: el puente no puede repetir su condición.

**Las cifras cuadran en columna (ADR-0691):** DM Sans no trae cifras de ancho fijo, así que los diez dígitos salen de otra letra
(`lib/letra-cifras.ts`: Inter con `unicode-range` de solo dígitos, primera en `--font-sans`); las letras siguen en DM Sans y la serif no cambia. Una
columna de dinero solo pide `tabular-nums`, como siempre. El papel que se imprime conserva sus dígitos (`app/estilos/cifras.css`). No se le quita el
`unicode-range` ni se la mueve de lugar: lo cuida `lib/letra-cifras.test.ts`.

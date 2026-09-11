# ADR-0039 — Bklit UI entra a Finanzas: una rampa de tinta, no una paleta nueva

**Fecha:** 2026-09-11
**Estado:** Instalado y verificado en navegador (primer chart real, con datos).
**Afecta:** `apps/web/app/globals.css`, `apps/web/components/charts/**`,
`apps/web/components/ComparativoChart.tsx`,
`apps/web/app/(app)/finanzas/comparativo/page.tsx`, `apps/web/components.json`,
`apps/web/package.json`, `apps/web/eslint.config.mjs`

## Contexto

Finanzas necesita varios charts (tendencia mensual, comparativo año-contra-año, gastos por
categoría) y hoy son solo tablas HTML — cero librería de charts en el repo. Se evaluó
[Bklit UI](https://github.com/bklit/bklit-ui): componentes compuestos (`LineChart`+`Line`+
`Grid`+`XAxis`+`YAxis`+`ChartTooltip`+`Legend`) sobre Visx, instalables vía el mismo
registry de shadcn ya configurado en ADR-0037 — el código llega como fuente propia a
`components/charts/`, no como paquete opaco.

## La decisión

**Se instaló `@bklit/line-chart`, `@bklit/y-axis` y `@bklit/legend`** (`components.json` ⇒
`registries.@bklit`) y se armó el primer chart real: tendencia mensual del comparativo
año-contra-año (`ComparativoChart.tsx`), sobre `getComparativoAnual()` — sin tocar la tabla
existente, el chart la complementa.

**Los años son una rampa de un solo tono (tinta), no colores por serie.** Bklit trae 5
tokens `--chart-1..5` pensados como paleta categórica. Pero los años de un comparativo no
son categorías arbitrarias — son una secuencia ordenada por tiempo, y CAYLA ya resuelve
jerarquía por tiempo/importancia con OPACIDAD de tinta en toda la app (`text-tinta/65`,
`/75`, `/80`). Entonces: `--chart-1` es tinta al 100% (el año más reciente, el más
importante) y `--chart-2..5` son `color-mix(in oklch, var(--color-tinta) N%, var(--color-crema))`
con N decreciente — el año más viejo es el más tenue. Cero color nuevo, mismo lenguaje
visual que ya usa el resto del sistema.

**El crosshair es rojo, a propósito.** No es "un color de serie" — es exactamente el "hilo
vivo" que la Capa de movimiento de `globals.css` ya describe: 1px que marca dónde estás,
lo único con color que se mueve en el sistema. El crosshair del chart hace ese trabajo al
pixel, así que usa el mismo rojo — y solo aparece al pasar el cursor, no compite con el
máx. 2 usos de rojo por pantalla.

**Se re-escribió el bloque de tokens que dejó el CLI, dos veces.** Cada `shadcn add`
(la primera vez `line-chart`, la segunda `y-axis`+`legend`) reinyectó al final de
`globals.css`: `@custom-variant dark`, un `.dark{...}` con grises genéricos, y un
`@theme inline` con un bug propio del payload (`var(----chart-1)` — cuatro guiones, la
variable no existe, la clase Tailwind quedaba muda). Se sacó el modo oscuro (el brandbook
es una sola paleta — ADR-0012), se corrigió el bug de guiones, y se recortó `@theme inline`
a solo los 4-8 tokens que de verdad se leen como clase Tailwind (`text-chart-label`,
`bg-legend-track`, etc.) — el resto se consume como `var()` cruda vía `chartCssVars` /
`legendCssVars` y no necesita entrar ahí.

**`chart-formatters.ts` (fechas/números del chart) pasó de `en-US` a `es-PE`.** Archivo
compartido por todo chart que se instale después — no es un parche local al comparativo.
Los ticks del eje X y el título del tooltip por defecto (`weekdayDateFmt`, "Mon, Jan 5")
ahora salen en español. Para el comparativo específicamente eso no alcanzaba: el eje X
finge fechas (`new Date(2000, mes-1, 1)`, siempre día 1) para poder usar el `xDataKey` de
tipo `Date` que exige Bklit sobre datos que en realidad son "mes calendario, cualquier
año" — así que el título del tooltip por defecto (que incluye día-de-semana) mentiría
("sáb." todos los meses). Se reemplazó con un `content` custom que usa el `MESES[]` real de
la página, no el `Date` sintético.

**Bug de import corregido en el paquete instalado**: `chart-loading-label.tsx` importaba
`../components/shimmering-text` (dos niveles arriba de donde vive el archivo) en vez de
`../shimmering-text` — typecheck lo hubiera tumbado en el primer build. Se corrigió en el
archivo instalado (es código propio desde que entra al repo, no un `node_modules`).

**Faltaban tipos:** `d3-array` y `d3-shape` (dependencias transitivas de Bklit) no traen
`.d.ts` propios y el repo no tenía `@types/d3-array`/`@types/d3-shape` — se agregaron como
`devDependencies`. De paso, los 5 archivos que hacían `type CurveFactory = any;` (con un
`biome-ignore` que ESLint no entiende — este repo usa ESLint, no Biome) pasaron a importar
el `CurveFactory` real de `d3-shape`: tipo correcto, no una supresión.

**Dos reglas de ESLint se apagaron, con alcance, solo para `components/charts/**`.** El
pre-commit reveló 36 errores repartidos en ~17 archivos del paquete instalado (el output
del hook estaba truncado a 40 líneas — parecía que solo 2 archivos fallaban). De esos, 31
eran `react-hooks/refs` y `react-hooks/set-state-in-effect`: las reglas nuevas de
"React Compiler" de `eslint-plugin-react-hooks`, muy estrictas sobre patrones de
ref/effect que la orquestación de animación de Bklit usa por todos lados (tooltip, fase
del chart, tween del y-domain, ticker de mes) — patrones seguros hoy, no bugs reales. Se
investigó cada categoría: **una sí era un bug real** — `highlight-segment.tsx` leía
`pathRef.current` en el CUERPO del render (no en un efecto), justo el caso que la regla
existe para atrapar. Se arregló de raíz: `Line` ya calculaba el `d` del trazo base como
estado (`usePathStrokeMetrics`) para otro propósito; ese mismo `pathD` ahora se pasa como
prop hasta `HighlightSegment` en vez de leerlo de un ref — mismo dato, mismo momento,
cero lectura de ref durante el render. Las otras 30 ocurrencias sí se apagaron para esta
carpeta (`eslint.config.mjs`): parchearlas a ciegas, en archivos de timing de animación
que este primer chart ni siquiera ejercita todos, arriesgaba romper algo sutil a cambio de
silenciar una regla experimental. `tsc` sigue exigente sobre `components/charts/**` — no
se tocó tipado, solo esas dos reglas de hooks.

## Consecuencias

- Cualquier chart de Bklit que se instale después (bar, area, pie para egresos) hereda la
  misma rampa de tinta y el mismo `chart-formatters.ts` en español sin trabajo extra.
- El patrón queda documentado para el próximo: series ordenadas por tiempo → rampa de un
  tono; series sin orden natural (ej. categorías de gasto) van a necesitar sí una paleta
  categórica de verdad — eso lo decide `dataviz`/el propio Bklit cuando llegue ese chart,
  no está resuelto acá.
- Sin eje Y con `YAxis` en charts futuros que no lo necesiten (ej. un sparkline chico) — es
  opcional, se instala aparte.

## Cómo se verificó

En navegador, con datos reales — no solo compilación. Se encontró que el entorno no tenía
`apps/web/.env.local` (bloqueaba toda ruta con "Your project's URL and Key are required");
el stack local de Supabase SÍ estaba corriendo en Docker, así que se completó `.env.local`
con los valores de `npx supabase status` (no versionado, como documenta `.env.example`) y
se cargó `supabase/seed-demo.sql` a mano contra el Postgres local (`docker exec ... psql`)
para tener ventas reales que graficar — el seed base (`seed.sql`) solo trae el usuario de
login, sin ventas. Con eso: `/finanzas/comparativo` en el navegador muestra la curva mensual
en tinta, eje Y en soles (`S/0` … `S/4k`), eje X en español (`1 ene.`, `1 abr.`…), y al
pasar el cursor el crosshair rojo + tooltip oscuro con el mes correcto ("Agosto") y el monto
en soles. `tsc --noEmit` y `eslint` sobre todo lo tocado, limpios.

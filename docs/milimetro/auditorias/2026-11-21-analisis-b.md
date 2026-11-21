# Auditoría al milímetro — Gestión ▸ Análisis, cara B «Una respuesta por pregunta» · 2026-11-21 · `claude/analisis-design-improvement-6bc529` (sobre aaa758d40)

Medido: 1440×900 claro vivo · 375×812 claro · 1440×900 oscuro · 1440×900 quieto, con los siete medidores del set (`milimetro` también con `{ foco: true }`),
en las cinco pestañas (Hoy, Se acaba, No se vende, Sin salir, Qué pedir), la ficha de una prenda y la hoja de un tipo. Servidor: la web de la rama en local.
Las mediciones van sobre una página de prueba con datos inventados (todas las pestañas con tarjetas); lo que dependía del marco del ERP (el ancho real a 375 px) se
midió en un banco Supabase propio con el seed local, entrando con la cuenta Admin del seed.

Resumen: 0 graves abiertos (3 graves corregidos) · 0 medias · 3 leves · 7 decididos a propósito o de una pieza del sistema

## Graves (corregidos en esta rama)

1. **«o pedir a Arequipa» mide 117 × 20,3 px dentro de la tarjeta**, que también se toca (blanco dentro de otro blanco: no le alcanza la excepción de separación) —
   `.an-tarj-acc` en «Se acaba» (`components/analisis/PestanaAcaba.tsx`, `app/estilos/analisis-b.css`) — medido 20,3 px de alto — regla ≥ 24 px —
   `[Norma]` WCAG 2.5.8 (AA) — /espacio. **Corregido:** `.an-tarj-acc > :is(a, button) { min-height: 24px }`; medido de nuevo: 24 px, sin blancos bajo 24.
2. **El paso de días de «Sin venderse desde» tiene el borde en `sand`** (la línea decorativa) — `.paso-dias` y su `input` (`app/estilos/analisis-quieta.css:7,13`) —
   medido borde 1,16:1 — regla ≥ 3:1 para el límite de un control — `[Norma]` WCAG 1.4.11 (AA) y regla del repo (lo que se toca lleva `borde-control`, ADR-0169) —
   /color. **Corregido:** `--color-borde-control` en los dos; medido de nuevo en claro y en oscuro: sin fallas.
3. **«te queda» de la leyenda de la ficha a 4,37:1** (14 px, 600) — `.m-leyenda .queda` (`app/estilos/analisis.css:192`) — regla 4,5:1 — `[Norma]` WCAG 1.4.3 (AA) —
   /color. **Corregido:** `--color-verde-profundo` (existe en los dos temas); medido de nuevo en claro y en oscuro: sin fallas.

## Medias

Ninguna.

## Leves

1. **«Arequipa tiene 12 (vendió 6 en sus últimos 30 días)…» de la ficha ronda 78 caracteres por línea a 1440 px** (`.m-otras`) — medida cómoda 45–75 — `[Práctica]` — /tipografia.
2. **La frase del modelo en la ficha, 19/23,8 px = 1,25 a 375 px** (`.m-frase`, dos líneas en la serif) — `[Práctica]` — /tipografia.
3. **En la hoja de un tipo, cada fila de «Lo que más se vende» ocupa dos líneas a 375 px** (el medidor la lee como «botón en dos líneas»): es una fila de lista con su nombre y su detalle, no la palabra de un botón — /textos, revisar solo si Felipe la ve apretada.

## Decidido a propósito o de una pieza del sistema

- **Las barras de «Vendidas cada semana» en arena (1,59:1):** cada barra escribe su cifra (`cifras="todas"`), y la pieza decidida solo pide el gris de 3:1 a la barra que no la escribe (CLAUDE.md, `grafico.barras`, Felipe 2026-11-16).
- **El globito de las pestañas y de los títulos a 10,5 px en versalita:** pieza `contador` decidida (`<Globito>`).
- **La pestaña elegida («Hoy»), gota contra pozo 1,24:1 «solo cambia el color»:** pieza `pestanas` decidida (su filo de `borde-control`, 2026-11-16). Si el medidor no ve ese filo, se revisa en `/unificar`, no en esta pantalla.
- **`.barra-t:hover` y `.parecidas-punto:hover::after` fuera de `(hover: hover)`:** son de piezas del sistema; `lib/hover-con-mouse.test.ts` en verde (leen su `hover-tactil`).
- **DM Sans sin cifras tabulares:** propuesta 1 de `/tipografia`, de todo el ERP.
- **El paso de días dibujado a mano** (y no `<PasoCantidad>`): exento en `apps/web/unificar/familias.mjs` por ADR-0357; aquí solo se corrigió su borde.
- **Chips y enlaces de 20–22 px separados** («Datos confiables», los tipos de «Te alcanzan:» en «Qué pedir»): pasan por la excepción de separación de 2.5.8 y los segundos van dentro de una frase.

## Sin medir

- **«Ordenar por» cortado a 375 px** («Más días sin vend…»): lo marcó el medidor en la página de prueba, que agrega su propio margen (fila de 295 px). En la pantalla real,
  con el marco del ERP, la fila mide 343 px y la píldora no se corta (medido en el banco: 301 px de píldora, sin texto cortado). No es hallazgo.
- **Lo que dura poco del movimiento** (`__mov.grabar`): solo se tomó la foto; no hay bucles, y lo que se anima usa los tiempos con nombre y `--ease-cayla`.
- **Los estados que guardan** (el «Guardar para todos» de «Sin venderse desde» abre `HojaLiquidarDesde`): no se abrieron; `/chaos` no los probó en esta rama.
- **1024 px y tablet:** no se midieron (le toca a `/multi-view-responsive`).

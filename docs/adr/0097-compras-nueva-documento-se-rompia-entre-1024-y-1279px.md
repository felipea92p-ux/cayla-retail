# ADR-0097 — `/compras/nueva`: Serie/Número/Fecha se superponían entre 1024 y 1279px

**Fecha:** 2026-09-17
**Estado:** Aplicado y verificado en navegador (1024px, 1280px, 375px). `tsc`, `lint` y
`vitest` en verde (297/297). No toca esquema ni RPC — solo clases Tailwind en
`CompraFormV2.tsx`.
**Afecta:** `apps/web/components/CompraFormV2.tsx` — el bloque Serie/Número/Fecha de
emisión y el breakpoint del layout de 2 columnas (formulario + Resumen).

## El problema

El rediseño de Compras (14-sep) pasó `tsc`/`eslint` pero **nunca se vio renderizado**
(así quedó anotado en BACKLOG.md). Al abrirlo por primera vez en el navegador:

En **1024px** (el breakpoint `lg` de Tailwind, donde `CompraFormV2` activa el layout de
2 columnas `lg:grid-cols-[minmax(0,1fr)_19rem]` para el panel "Resumen"), la tarjeta del
formulario se queda con solo ~287-329px de ancho. El campo "Número" (`grid-cols-[7rem_1fr]`,
sin `minmax(0,…)`) desbordaba su columna y quedaba dibujado ENCIMA del campo "Fecha de
emisión" — texto ilegible, ambos campos mezclados. El mismo patrón (`sm:grid-cols-[…fr…]`
sin `minmax(0,…)`) existe en la grilla de líneas de factura (`PLANTILLA_LINEAS`), pero ahí
no se manifestó porque las columnas fijas (24rem en total) ya eran mayores que el ancho
disponible — el navegador simplemente truncó sin superponer.

## Decisión

**DECIDÍ: Serie + Número + Fecha de emisión pasan a ser una sola fila de 3 columnas
(`minmax(0,1fr)` en las flexibles) que ocupa el ancho completo de la tarjeta a partir de
`sm:`, y en móvil (<640px) Serie+Número se quedan pareados en su propia fila con Fecha
de emisión debajo, a todo lo ancho — el mismo comportamiento que ya tenía el diseño
original en móvil.**

DESCARTÉ dejar Fecha de emisión como columna hermana de "Serie+Número" dentro de la
grilla de 2 columnas del documento (el diseño original) porque ese arreglo obliga a
Serie+Número a compartir la MITAD del ancho de la tarjeta con Fecha ocupando la otra
mitad — no hay forma de que eso quepa cuando la tarjeta mide menos de ~400px, que es
exactamente lo que pasa en la franja 1024-1279px por culpa del Resumen fijo al costado.

**DECIDÍ: mover el breakpoint del layout de 2 columnas (formulario + Resumen) de `lg:`
(1024px) a `xl:` (1280px), y mover el `sticky` del Resumen al mismo breakpoint.** Medido
en el navegador: a 1024px la tarjeta del documento solo tiene ~287-329px de ancho útil —
ni con el fix de arriba alcanza para Serie+Número+Fecha con comodidad. A 1280px sí hay
espacio real. Quedó una tarjeta a todo lo ancho con Resumen debajo entre 1024-1279px, en
vez de una columna angosta para "ganar" un layout de escritorio que en la práctica no
entra. Encontré esto porque revisar el `<aside>` del Resumen después de mover el `grid`
mostró `position: sticky` activo (heredado de su propio `lg:sticky lg:top-24`, un
breakpoint separado que el cambio de arriba no tocaba) mientras el formulario ya estaba
apilado a una columna — un Resumen "pegajoso" en medio de un flujo de una sola columna se
ve roto (se queda fijo tapando contenido al hacer scroll sin que haya una columna angosta
al lado que lo justifique). Ambos breakpoints tienen que moverse juntos.

DESCARTÉ angostar más los campos (reducir aún más el `5rem` de Serie, o el padding del
selector de fecha) para intentar que quepan a 1024px sin tocar el breakpoint del layout:
es pelear contra el síntoma. El ancho real no alcanza para tres campos de fecha/serie/
número legibles en ~300px sin importar cuánto se recorten — la causa es que el Resumen se
vuelve columna fija demasiado pronto, no que los campos sean anchos.

## Se rompe si

Alguien copia el patrón `sm:grid-cols-[Xfr_Yfr_…]` sin `minmax(0,…)` en otra fila de este
mismo formulario (o de otro) asumiendo que "ya se vio en el navegador" — el mismo defecto
sigue latente en `PLANTILLA_LINEAS` (línea 36), sin manifestarse hoy solo porque sus
columnas fijas (24rem) son más anchas que el desborde que las dispara; si algún día se
agranda el Resumen o se angosta más el nav lateral, puede volver a aparecer ahí. Vale la
pena una pasada futura que le sume `minmax(0,…)` también, aunque hoy no esté rota.

También se rompe si otra sesión toca `lg:grid-cols-[minmax(0,1fr)_19rem]` en
`ProductoForm.tsx` (mismo patrón, mismo archivo de columnas) sin verificar si sufre el
mismo problema — no se tocó acá porque no es parte de Compras y otra sesión ya lo tiene
asignado (Catálogo/taxonomía, 17-sep).

## Cómo se verificó

Servidor local (`npx supabase start` + `pnpm dev`), sesión como Felipe (líder, Tienda
Lima). Con el navegador de Claude Code:

1. **1024px (el punto donde se rompía):** Serie/Número/Fecha de emisión sin superposición,
   `18/09/2026` visible completo, sin recorte. Formulario a una sola columna, Resumen
   debajo, `position: static` (no `sticky` huérfano).
2. **1280px:** layout de 2 columnas activo, Resumen con `position: sticky` confirmado por
   `getComputedStyle`.
3. **375px (móvil):** Serie+Número pareados, Fecha de emisión debajo a todo lo ancho,
   `18/09/2026` visible completo — mismo comportamiento que tenía el diseño original.
4. Recorrido funcional en `/compras/nueva`: buscar "falda" en Producto → seleccionar
   "Falda Renata" → escribir costo → Enter agrega una línea nueva vacía (confirmado
   contando los inputs "Costo unit." en el DOM antes/después).
5. `/compras` (chips, tarjeta "Por pagar" → enlaza a `/compras/por-pagar?vencidas=1`).
6. `/compras/por-pagar?vencidas=1`: filtro "Solo vencidas" aplicado por la URL, botón
   "Pagar" en la fila abre modal sin navegar (confirmado: la URL no cambió).
7. `/compras/recibir`: tocar una factura arma la guía a la derecha, curva de tallas
   (filas color × columnas talla) con scroll horizontal propio, sin desborde.

`pnpm --filter web typecheck`: limpio. `pnpm --filter web exec eslint
components/CompraFormV2.tsx`: limpio. `pnpm --filter web test`: 297/297 en verde.

## Lo que falta

1. **"Todo llegó" y "+ Sumar otra factura" en `/compras/recibir`**, y el caso "barra fija
   choca con las pestañas móviles en celular" (la nota del BACKLOG apunta a
   `RecepcionCompraFormV2.tsx:bottom-[calc(4.25rem+…)]`) — no se probaron en esta sesión.
2. **`PLANTILLA_LINEAS` sin `minmax(0,…)`** (ver "Se rompe si") — mismo defecto latente,
   no disparado hoy. Vale una pasada dedicada.
3. Confirmar si `ProductoForm.tsx` (mismo patrón `lg:grid-cols-[minmax(0,1fr)_19rem]`)
   sufre el mismo problema — pertenece a la sesión de Catálogo/taxonomía de hoy, no se
   tocó acá.

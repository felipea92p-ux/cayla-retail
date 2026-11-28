# Auditoría al milímetro — «Liberar en Apartados» (ApartadosModal) y la hoja «Venta anulada» (AnularVentaForm) · 2026-11-28 · `claude/audit-workshop-inventory-sales-purchases-c19a93` (10fb5558e, PR #2057)
Medido: 1440×900 claro vivo · 375×812 claro táctil (`pointer: coarse`) · 1440 oscuro · quieto     Servidor: http://localhost:3010 (pila privada `cayla-auditoria`, cuenta felipe@cayla.local)
Resumen: 0 graves · 0 medias abiertas (2 medias corregidas en el camino) · 4 leves · 0 decididos a propósito

Cómo se midió: Playwright sin pantalla, con los seis medidores (`milimetro`, `espacio`, `tipografia`, `color`, `movimiento`, `textos`) leídos
del repo y evaluados en la página con `window.__milimetro = { raiz: '[role="dialog"]:last-of-type' }`. El foco se midió con Tab de verdad
hasta la pieza (`:focus-visible` encendido). Sin gráficos: `graficos/medir.js` no aplica.

- **Pieza 1 — «Liberar en Apartados».** `/inventario?condicion=apartadas` → Blusa Emma Beige talla S → «1 apartada: ver cuáles» → hoja
  Apartados, fila del apartado APT-LIM-0002 de Tienda Lima. `apps/web/components/ApartadosModal.tsx:170-183`.
- **Pieza 2 — la frase de «Venta anulada».** Dos ventas de hoy en Tienda Lima creadas en la pila privada con `retail.registrar_venta` como el
  líder del seed y anuladas desde `/devoluciones` → «Anular venta»: una de 1 prenda con «Dañada — para donar» (1440: «La prenda quedó en
  Dañadas, en Existencias.») y una de 2 prendas, una dañada y otra vendible (375: «Lo vendible volvió al stock y lo dañado quedó en Dañadas,
  en Existencias.»). `apps/web/components/AnularVentaForm.tsx:131-136`, `apps/web/lib/devoluciones-reglas.ts:102`.

Capturas: `capturas/2026-11-28-audit-workshop-inventory-sales-purchases-c19a93/` (Apartados a 375 antes y después del arreglo, Apartados
en oscuro con el foco, «Venta anulada» a 1440 y a 375).

## Graves
Ninguno. Contraste del texto 0 fallas en claro y en oscuro (`color/medir.js`, 11 textos en la hoja); foco del enlace 2 px sólido, 15:1 en
claro y 12,61:1 en oscuro, no tapado (WCAG 2.4.7, 2.4.11, 2.4.13); ningún blanco bajo 24 px que falle AA; ningún apagado, ocupado ni error.

## Medias (corregidas en este PR)
1. **El enlace nuevo estaba dibujado a mano en vez de la pieza decidida** — `ApartadosModal.tsx:176` — medido: `a.label-cayla` con
   `underline underline-offset-2 hover:text-tinta`, versalitas de 13 px y 184 px de ancho — regla: llevar a otra pantalla desde una fila de
   una lista es el enlace del sistema, `btn-cayla btn-enlace` (familia `accion.ver`, elegida 2026-10-14, como los pendientes de Caja en
   `CajaTablero.tsx:404`); `lib/unificar.test.ts` no lo ve porque ninguna firma calza con esta forma — regla del repo (ADR-0358), sin prueba
   que la atrape → media — va a /unificar. **Arreglado:** `className="btn-cayla btn-enlace shrink-0 text-xs leading-tight"`. Medido después:
   `a.btn-cayla` de 129,5 × 19,5 px, el subrayado tenue y el hilo rojo del sistema al pasar el mouse (dentro de `@media (hover: hover)`).
2. **Con el dedo, el enlace medía 19,5 px de alto y, a 375 px, apretaba la columna de la izquierda** — misma línea — medido antes, a 375×812
   táctil: blanco de 184,1 × 19,5 px sin área de 44 (`espacio/medir.js` → `blancosBajo44`), y `textos/medir.js` → `cortados: p «Blusa Emma ·
   1 prenda»` (el nombre salía «Blusa Emma · 1 …», el SKU en tres renglones y «Apartado APT-LIM-0002» partido en dos, ver
   `apartados-375-antes.png`) — regla: con el dedo todo se toca en 44 px (`.claude/rules/vidrio.md`, ADR-0611 mejora 5; se mide con
   `tacto:medir`, sin prueba del CI) — media — va a /espacio y /textos. **Arreglado con el mismo cambio:** `.btn-enlace` ya está en
   `app/estilos/tacto.css:49` (su `::after` de 44 px) y el enlace en letra normal ocupa 129,5 px en vez de 184. Medido después a 375 táctil:
   `blancosBajo44ConDedo: 0`, `blancosBajo44: []`, `textos`: «Sin fallas de texto medibles» (`apartados-375-despues.png`). El área de 44 no
   pisa a nadie: en esa fila el enlace y el botón «Liberar» se excluyen (`puedeLiberarApartado`, `lib/apartados.ts`), y arriba solo está el
   `<Chip>`, que no se toca.

## Leves
1. **«Se libera en Apartados» (quien no ve el módulo Apartados) no se distingue de una nota** — `ApartadosModal.tsx:181` — leído en el
   código, no medido en vivo (ver «Sin medir»): `text-xs text-secundario`, 13 px, el tono `secundario` que `lib/tema-tokens.test.ts` ya mide
   ≥ 4,5:1. Correcto que no parezca enlace; si se quiere que diga más, que nombre el APT («Se libera en Apartados, APT-LIM-0002») — [Práctica]
   — va a /textos. Del PR.
2. **La frase de éxito centrada llega a 3 renglones a 1440 y a 3–4 a 375** — `AnularVentaForm.tsx:131` — medido: 16 px / 24 px, centrada, 325
   px de ancho; a 375, 3 líneas con una prenda dañada («Vestido Sofía VES-0001-NEG-M», 72 px de alto) y 4 con la frase mixta de dos prendas
   (`anulada-375.png`); antes del PR eran 2 — un bloque centrado de más de 2–3 renglones se lee peor que alineado
   a la izquierda [Práctica] — va a /tipografia. El centrado es de antes; el largo lo suma el PR.
3. **El código de la prenda se parte en el guion** — `AnularVentaForm.tsx:132` (`codigoPrenda(linea)`) — medido a 375: «CMS-0001-» / «NEG-L»
   en dos renglones — un código se lee entero (`whitespace-nowrap` en su `<span>`) [Práctica] — va a /textos. De antes del PR.
4. **CORREGIDO después de la auditoría (ahora «está en Dañadas»): «quedó anulada. … quedó en Dañadas»** — `devoluciones-reglas.ts:102` — el verbo se repite en dos frases seguidas; «La prenda pasó a
   Dañadas, en Existencias.» lo evita sin perder el lugar — [Práctica] — va a /textos. Del PR.

Además, de antes del PR y solo anotado: la frase de éxito usa `text-tinta/75` (`AnularVentaForm.tsx:131`), una opacidad de antes que
`tema.css` ya traduce a `secundario` (medido: tinta al 80 %); en código nuevo sería `text-secundario` (ADR-0694). El botón «Liberar» de la
misma columna (`ApartadosModal.tsx:188`) sigue con el subrayado en versalitas a mano y sin área de 44 con el dedo: es la acción que libera
(otra familia: `btn-enlace` si corrige una cosa) y no lo toca este PR. La cabecera de la fila sigue separando con «·» (`ApartadosModal.tsx:139-143`,
ADR-0716): Inventario todavía no está en la lista de `lib/sin-punto-medio.test.ts`.

## Decidido a propósito
Nada en estas dos piezas. El `marco-lienzo-entra` de 1 400 ms que marca `movimiento/medir.js` es del marco de la página, no de las hojas.

## Estados
- **Liberar en Apartados** (`<Link>` + `btn-cayla btn-enlace`, forma decidida de `accion.ver`): default tinta con subrayado tenue (contraste
  sin fallas) · hover dentro de `@media (hover: hover)` (`globals.css:697`) · focus-visible 2 px tinta, separación 2 px · active rojo
  (`globals.css:703`) · selected, disabled, loading, error, read-only y vacío: no aplican (enlace que navega, no guarda) · quieto: 0
  animaciones, sigue respondiendo por color.
- **Venta anulada**: la frase es texto; el único control es «Listo» (`autoFocus`, de antes): foco 2 px, 15:1 claro y 12,61:1 oscuro, 44 px
  con el dedo. Quieto: 0 animaciones.

## Segunda medición (escéptico)
Lo volvió a medir otra pasada, con Playwright sin pantalla en la misma pila privada:
- **El enlace a 375×812 táctil:** `a.btn-cayla.btn-enlace` de 129,5 × 19,5 px, con un `::after` de 129,5 × 44 px. `elementFromPoint`
  da el enlace desde 22 px arriba hasta 18 px abajo de su centro. `espacio`: `blancosBajo44ConDedo: 0`. `color`: 0 fallas en 10 textos y
  el foco con Tab de verdad (`:focus-visible`) de 2 px sólido a 15,25:1, no tapado. `textos`: sin fallas. El enlace y «Liberar» se excluyen
  (`puedeLiberarApartado` devuelve `false` con `esDeSeparacion`, `lib/apartados-reglas.ts:43`), así que el área de 44 no le quita el
  toque a nadie.
- **El enlace a 1440 oscuro:** 0 fallas en 11 textos; foco 2 px en `rgb(245, 240, 232)` a 12,61:1, no tapado.
- **«Venta anulada» a 375 táctil:** se crearon y anularon dos ventas más de Vestido Sofía VES-0001-NEG-M, «Dañada — para donar» (pila
  privada). Se vio «La venta de Vestido Sofía VES-0001-NEG-M quedó anulada. La prenda quedó en Dañadas, en Existencias.». `color`,
  `espacio`, `textos` y `tipografia` sin fallas. «Listo» mide 325 × 44 px y su foco con Tab es de 2 px a 15,35:1. Tras el `autoFocus`
  que sigue a un clic, el navegador no enciende `:focus-visible`: es lo esperado, no una falla.
- Pasan `hover-con-mouse`, `tema-colores`, `tema-tokens`, `unificar`, `letra-suelta`, `esquina-suelta`, `devoluciones-reglas`,
  `apartados-reglas`, `guias`, `sin-select-nativo` y `relleno-silencioso` (11 archivos, 525 pruebas).

## Sin medir
- «Se libera en Apartados»: necesita una cuenta de Tienda Lima con Existencias y sin el módulo Apartados; la pila privada solo trae felipe,
  micaela y sandra. Se leyó en el código.
- Las otras dos frases de `dondeQuedoLaAnulacion` («La prenda volvió al stock.» y «No movió stock: la prenda no estaba registrada.»): las
  cubren las pruebas de `lib/devoluciones-reglas.test.ts`; en pantalla se vieron solo las dos de arriba.
- `tacto:medir` y `tema:auditar` del repo no se corrieron: el 44 y el contraste se midieron con `espacio/medir.js` y `color/medir.js` en la
  hoja abierta.
- El «active» se leyó en el CSS, no se apretó en vivo.

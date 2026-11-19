# Auditoría al milímetro — «Prendas parecidas» a pantalla completa: la reserva y el buscador pegado · 2026-11-19 · `claude/brave-shirley-0f83f3` (sobre 84a4b8513)

Medido: 1440×900 claro quieto y vivo · 1440×900 y 1024×768 oscuro · 375×812 claro con puntero táctil. Servidor: `localhost:3011` contra la base local,
cuenta Admin en Tienda Lima. La hoja se abrió como la abre una persona: Nuevo producto ▸ «jeans» ▸ Jeans ▸ marca CAYLA ▸ «Ver» (o «Ver y comparar»
desde 1280 px). Marcar una tarjeta es estado de la pantalla: nada se guardó en la base.
Los medidores se corrieron en un Chromium de prueba manejado con Playwright y la sesión local de `apps/web/tema/` (el panel del navegador estaba
oculto, y oculto todo mide 0): `milimetro` (estados, y una segunda pasada con `{ foco: true }`), `espacio`, `color` y `movimiento`, con
`window.__milimetro = { raiz: ".parecidas-hoja .parecidas-busqueda" }` y la hoja corrida 900 px (el buscador pegado, con tarjetas pasando por detrás).
Alcance: lo que cambió. El buscador pegado (dónde queda, su fondo) y la reserva de la hoja bajo 1280 px. Letra y textos no cambiaron: `tipografia`,
`textos` y `graficos` no se corrieron.

Resumen: **0 graves · 0 medias · 1 leve heredada** · la hoja a pantalla completa ya reserva (la vista no se mueve al plegar una tarjeta: antes subía 208 px a 1024 × 768 y 229 px a 375 × 812) y el buscador pegado llega al borde de la hoja de vidrio (antes, 4 px corto) con el vidrio del pie.

## Lo que se midió

«Vista» es el `scrollTop` de la hoja; «pie» y «borde», píxeles desde arriba de la pantalla; «encima», cuánto tapa el pie a la lista al fondo y
después de subir 60 px con la reserva puesta.

| Vista | Reserva al plegar la última tarjeta | Pie | Borde de abajo | Encima | Buscador pegado | Estados y foco | Espacio | Color |
|---|---|---|---|---|---|---|---|---|
| 1024×768 claro | vista 5980 → 5980; relleno 236 px, `--reserva-abajo: 208px` | 686..767 | 768 (1 px es el borde de la hoja) | 0 y 0 | 1..1023 en una hoja de 0..1024 (borde de 1 px), arriba en 1 | — | — | — |
| 1024×768 oscuro | las mismas cifras | 686..767 | 768 | 0 y 0 | 1..1023, arriba en 1 | — | — | 35 textos, 0 bajo su mínimo; 0 controles bajo 3:1 |
| 375×812 claro, dedo | vista 8799 → 8799; relleno 253 px, reserva 229 px | 699..811 | 812 | 0 y 0 | 1..374 en una hoja de 0..375; arriba en 7; la caja del buscador desde 25, justo bajo la franja del asa (1..25) | sin hallazgos; 1 control medido con foco: con indicador, no tapado | 0 blancos bajo 44 px en el buscador | 27 textos y 1 control medidos, 0 bajo su mínimo |
| 375×812 oscuro | las mismas cifras | 699..811 | 812 | 0 y 0 | 1..374, arriba en 7 | — | — | — |
| 1280×720 claro (la hoja no es pantalla completa: control) | ya reservaba, y sigue: vista 6110 → 6110, 208 px | 613,8..694,8 | 696 | 0 y 0 | 257..1023 en una hoja de 256..1024; arriba en 58,6 con la hoja en 57,6 | — | — | — |
| 1440×900 claro | — | — | — | — | — | sin hallazgos; 1 control medido con foco: con indicador, no tapado | 0 blancos bajo 24 px | 46 textos, 0 bajo su mínimo; 0 controles bajo 3:1 |
| 1440×900 oscuro | — | — | — | — | — | — | — | 46 textos, 0 bajo su mínimo; 0 controles bajo 3:1 (13 en «segunda mirada» APCA, que informa y no reprueba) |

Movimiento (animaciones encendidas y apagadas, 1024×768, 1280×720 y 375×812): la hoja, el buscador y el pie no tienen ninguna animación durante el
clic que pliega la tarjeta (0/0/0 en todos los cuadros), y el pie no se mueve de 767, 695 y 811. Muestreado después de pintar cada cuadro, con las
animaciones apagadas, la vista estuvo siempre donde estaba antes del clic (30 de 30 muestras a 1024, 32 de 32 a 375). Las 20 animaciones que lista
el medidor a 1440×900 son de la pantalla de atrás.

Al subir hasta arriba, la reserva se suelta en todos los casos (relleno de vuelta a 28 o 24 px, sin variable).

## Leves

1. El relleno de arriba del buscador pegado es de 18 px (`padding: 1.125rem …` en `.parecidas-busqueda`, `app/estilos/alta-parecidas.css`) — medido
   18 px — regla: escala de 4 px — `[Práctica]` — ya estaba: cancela los 18 px de margen que `<Modal>` le pone a su bajada (`mb-[18px]`), para que en
   reposo la caja no se mueva — va a `/espacio` (la medida es de `<Modal>`, no de esta hoja).

## Decidido a propósito

- **El fondo del buscador pegado es el vidrio del pie pegado** (`--fondo-hoja`, que en la hoja de vidrio es `--vidrio-pie-fondo`, con su mismo
  desenfoque de 14 px). Antes era papel sólido. Es la receta decidida para lo que se pega dentro de una hoja (ADR-0596); no se dibujó otra.
- **En reposo el buscador se ve como una banda apenas más clara**, igual que el pie pegado al fondo de la hoja. Antes era una banda de papel macizo.
  Quitarle el relleno (como al asa del celular) dejaría el contador «24 prendas» sobre las fotos borrosas de las prendas.
- **En el celular se pega 6 px más abajo que en escritorio** (arriba en 7 y no en 1): los primeros 24 px de la hoja son la franja del asa, que desenfoca
  lo que le pasa por debajo, y pegado al borde el buscador quedaba con su canto de arriba 6 px dentro de esa franja, borroso. Lo que pasa por esos
  6 px lo desenfoca el asa, como en toda hoja del celular.
- **El foco del buscador es el halo de los campos**, sin `outline` (ADR-0351): el medidor de color lo deja «a ojo»; el de estados lo da por bueno.

## Heredado, fuera de la pieza

- Con el dedo, «¿Qué pasa al abrirla?» (`.parecidas-que-pasa`, en cada tarjeta) mide 144,6 × 29 px: pasa los 24 px de WCAG 2.5.8 y no llega a los
  44 px del repo (ADR-0611, mejora 5). No es del buscador ni lo trajo este cambio. Va a `/espacio`.
- En la pantalla de atrás (Nuevo producto): 14 px de relleno en `.hilo-fila-in` y una proximidad rota («Marca y proveedor»). No son de la hoja.
- «revisar» del medidor de estados: los mismos dos `:hover` de siempre (`.barra-t`, `.parecidas-punto`); `lib/hover-con-mouse.test.ts` pasa.
- A 1024×768 la hoja a pantalla completa conserva las esquinas redondas y el borde de 1 px de la hoja de vidrio (su `border: 0` y `border-radius: 0`
  pierden contra `.hoja-serena`, que va sin capa). Ya estaba; por eso las cifras de arriba traen 1 px de borde.

## Sin medir

- Safari y un iPhone real; una tablet de 640 a 1279 px en la mano (a 640×900 emulado el buscador va de 1 a 639).
- El contraste de «24 prendas» sobre el vidrio con una prenda oscura pasando por detrás: el medidor no mide el desenfoque. Es la misma receta que el
  pie, y la vigila `lib/vidrio-contraste.test.ts`.
- Si el salto llega a pintarse en un aparato lento: se muestreó después de pintar en un Chromium de prueba, no en un teléfono.

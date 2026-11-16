# Ficha al milímetro — Firma del cierre y aviso «Envío recibido» (Recibir)

**2026-11-16** · Pieza nueva sobre piezas decididas: las dos son `<Modal>` (familia `modal`, ADR-0358 / ADR-0596) con botones del sistema.
Maqueta aprobada por Felipe: `docs/maquetas/recibir-cierre-recibo-2026-11/` (pantalla 2, forma B). Felipe pidió «mucho texto → menos» y, al cerrar,
un aviso con «Ver lo recibido» y «Volver a Recibir mercadería»; eligió la variante con «Imprimir».

**Árbol (regla 1):** decidida. Hoja = `<Modal tamano="angosta">` (448 px, la de fábrica). Pie = `pie-acciones` con «Cancelar» `peso="fantasma"` antes del
principal (familia `accion.cancelar`). Principal = `<Boton peso="primario" cargando textoCargando>` (familia `accion.guardar`). Imprimir =
`<BotonImprimir peso="primario">` (familia `accion.imprimir`: es EL paso de esa pantalla). El sello = `<Lacre />` (ADR-0136 act., «el sello de lacre que cae»,
Recibir «B»). Avatar = `<AvatarPersona tamano={32}>`. No se dibuja ninguna pieza a mano.

## Espacio (de /espacio, heredado de las piezas)
- Hoja: la de `<Modal>` angosta (448 px; 32 px de radio; padding de la hoja Serena). En el celular, hoja de abajo con asa (ADR-0479).
- Filas del resumen: una tabla de dos columnas (palabra · número), 12 px arriba y abajo, separadas por `border-sand`, dentro de una placa (`nota-cayla` no:
  la placa ya es la de la hoja). Número a la derecha, en serif 22 px, `tabular-nums`.
- Aviso: contenido centrado; sello de 88 px; tres botones apilados a todo el ancho, 10 px entre ellos (≥ 44 px de alto con el dedo: `tacto.css`).

## Tipografía (de /tipografia, heredado)
- Título de la hoja: serif 27 px (el de `<Modal>`). Filas: 15 px DM Sans semibold la palabra; serif 22 px el número.
- Aviso: título serif de la hoja; la línea bajo el título en `text-sm`/15 px taupe (≥ 14 px, regla «La letra de lectura»).

## Color (de /color)
- Solo tokens: `tinta`, `taupe`, `sand`, `crema`, `rojo` (el lacre, `--color-rojo`, ya probado en `recepcion-viva.css`). Nada de hex.
- El número de «De más» y «Faltan» en `text-ambar` (dato que pide atención, no error). Contraste ámbar sobre la hoja: lo mide `lib/tema-tokens.test.ts`.

## Estados (de /milimetro)
Pieza: `<Modal>` + botones · rama del árbol: decidida
| Estado | Qué se ve | Qué se anuncia | Cómo se mide | Nivel · fuente |
|---|---|---|---|---|
| default | hoja Serena, título, filas, pie | `role="dialog"`, `aria-labelledby` (título) | medir.js · contraste | [Norma] 1.4.3, 4.1.2 |
| hover | el de `btn-cayla` (solo `@media (hover: hover)`) | — | hover-con-mouse.test.ts | [Norma] MQ4 |
| focus-visible | el anillo único de los botones; el foco entra a la hoja (Radix) | — | medir.js `{ foco: true }` | [Norma] 2.4.7 |
| active | `scale 0.97` + onda (`.mov-boton`) | — | a ojo | [Práctica] M3 |
| selected | no aplica: nada se elige | — | — | — |
| disabled | «Cerrar y firmar» no se apaga por lo que falta (lo que falta ya frenó antes de abrir la hoja); solo mientras guarda | `disabled` | /chaos (doble clic) | regla del repo ADR-0611 |
| loading | «Cerrando…» con el hilo, sin cambiar de ancho; la hoja `bloqueado` (Escape y velo no la cierran) | `aria-busy` | /chaos | ADR-0358 `accion.guardar` |
| error | si el cierre falla, la hoja se cierra y el error queda en `<Aviso tono="error">` del pie de la pantalla, como hoy | `role=alert` | navegador | familia `aviso` |
| read-only | no aplica | — | — | — |
| vacío | no aplica: la hoja solo abre si hay algo que no cuadró | — | — | — |
| quieto | sin la subida ni la caída del lacre (el sello ya está puesto); queda el color | — | `data-movimiento="quieto"` | [Norma] 2.3.3 · ADR-0625 |

**Aviso «recibido»:** los mismos estados; no guarda nada (selected, loading, error: no aplica). Escape, el velo y «atrás» = «Ver lo recibido»
(quedarse en el envío): ninguna salida pierde nada.

## Movimiento (de /movimiento)
- La hoja: la entrada y salida del sistema (`--t-hoja`, `--ease-cayla`, cascada de 18 ms). Nada propio.
- El aviso: el lacre cae una vez sobre la hoja (`rc-lacre-cae`, 600 ms, `--ease-cayla`, sin rebote ni bucle, ADR-0136 act. «sello de lacre que cae»).
  Quieto: el sello ya está puesto.

## Texto (de /textos) — Felipe 2026-11-16: «hay mucho texto»
- Firma: título «¿Cerrar ENV-000023?». Sin bajada. Filas: «Al almacén», «De más · a Compras», «Faltan · a Compras», «Para después» (solo las que
  tienen cifra). La firma: avatar + nombre de quien cierra. Botones: «Cancelar» · «Cerrar y firmar».
- Aviso: «ENV-000023 recibido»; una línea: «227 al almacén · 203 de más a Compras» (o «· llegó completo»); botones «Imprimir 227 etiquetas»,
  «Ver lo recibido», «Volver a Recibir mercadería». Si nada entró al stock, no hay «Imprimir»: el primero es «Ver lo recibido».

## Accesibilidad
- 2.4.3 orden del foco: el foco entra a la hoja y vuelve al cerrar (Radix + `alCerrarEnfocar` no hace falta: la pantalla cambia).
- 4.1.2 nombre: cada botón dice su acción completa; el número del resumen va con su palabra en la misma fila (no solo el número).
- 2.5.8 blanco ≥ 24 px (44 con el dedo): botones del sistema.

## Fuentes
Todo lo de arriba sale de piezas decididas (regla del repo); no se agregó ningún valor nuevo.

## Propuestas
Ninguna.

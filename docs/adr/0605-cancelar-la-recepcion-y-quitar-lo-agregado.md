# ADR-0605 · Cancelar la recepción de un envío sin aviso

- **Fecha:** 2026-11-03 · **Estado:** construido y probado en local (pruebas de reglas y de Postgres con datos inventados). Migración `20261103173000` SIN pegar en producción (pide el OK de Felipe).
- **Decide:** Felipe, 2026-11-03: «se debe poder cancelar alguna recepción de mercadería» y, sobre Recibir ▸ Contar: «los únicos cambios que se requieren son la ✕, el anular recepción y el
  total de Abrigos». Primero pidió lápices para editar nombre, categoría y marca; al verlos en la maqueta (`docs/maquetas/recibir-editar-cancelar-2026-11/`) los dejó fuera y se quedó con la ✕.
- **Toca:** ADR-0393 (recepción contando primero).
- **Alcance final (2026-11-03, al fusionar con `main`):** Felipe pidió tres cosas —la ✕, anular la recepción y el «Total de Abrigos»—, pero otra sesión entregó las dos primeras de Contar en el PR #1617
  (ADR-0604: el tacho que quita lo agregado y Contar sin fila «Total»). Aquí se descartó mi versión de esas dos y se dejó la de `main`; **este ADR es solo la cancelación**.

## El problema primero

Alguien abría «Sin aviso» en la sede por error, o la mercadería llegó a otra sede, y no había cómo deshacerlo: un envío abierto solo se podía seguir, cerrar y, cerrado, reabrir. `anular_envio` existía,
pero solo para uno en camino y desde Órdenes de compra. Quedaba un envío fantasma en la lista de la sede para siempre.

## Qué se decidió

| Pieza | Decisión | Dónde |
|---|---|---|
| Cancelar la recepción | `cancelar_recepcion_envio(despacho, versión, motivo)`: abierto → **anulado** con quién, cuándo y por qué. Solo un envío SIN AVISO que nunca se cerró. Lo contado queda como historia; lo pendiente se anula; no toca stock. Se niega uno de Compras (`envio_con_aviso_no_se_cancela`), uno cerrado (`envio_cerrado`), uno en camino (`envio_sin_abrir`) y uno que ya metió stock (`envio_ya_tuvo_stock`). | `supabase/migrations/20261103173000_cancelar_recepcion_sin_aviso.sql`, `CancelarRecepcion.tsx`, menú «Más» de la cabecera |

## Lo que se descartó

- **Un estado nuevo «cancelado».** `anulado` ya significa «ya no llega» en todas las lecturas; uno más las rompería.
- **Borrar lo contado.** Nunca se borra historia; queda atado a un envío anulado que ninguna lectura de la sede muestra.
- **Lápices para editar nombre, categoría y marca de lo agregado.** Felipe los vio en la maqueta y no los quiso (2026-11-03).
- **Mi ✕ y mi fila de categoría como total.** Duplicaban el tacho y el Contar sin «Total» de #1617; se tomó la versión de `main` para no tener dos piezas que hacen lo mismo (ADR-0358).
- **Devolver a «en camino» un envío CON aviso.** Exige borrar quién y cuándo lo abrió y revisar cada candado de la recepción. **Queda pendiente** y es decisión de Felipe (anularlo también, o volverlo a en camino).

## Lo que nunca debe existir (y quién lo impide)

- Un envío anulado sin quién, cuándo y por qué → `despachos_anulacion`.
- Pasar de abierto a anulado por otro camino que la función → `fn_despachos_camino`. **Cuidado con el NULL**: sin la marca puesta `current_setting(…) = 'si'` es NULL y un `AND` con lo demás
  verdadero dejaba pasar el cambio; la prueba F2 (un `UPDATE` a mano) lo cazó y la condición lleva `coalesce`.
- Cancelar lo que ya metió stock → la función se niega.

## Cómo se pega en producción (con el OK de Felipe)

Una sola parte, después de `20261014205000`: cambia un candado de `despachos` (`despachos_apertura`: un anulado puede recordar quién lo abrió), reemplaza `fn_despachos_camino` con ancla y crea la función.
Sin políticas ni `drop trigger` (ADR-0195). Se puede pegar dos veces; el bloque final comprueba todo. **Ojo con el lugar de la cláusula (2026-11-03, tras el CI):** la primera versión pegaba la cláusula de cancelar al final de la lista de caminos
permitidos de `fn_despachos_camino`, y eso rompía el ancla de «reabrir» (`… = 'si')) then`): cinco tandas de Postgres se pusieron en rojo porque varias pruebas viejas recargan esa migración. La cláusula
va ahora como un `and not (…)` aparte, ANTES de la lista, y la migración quita la versión vieja si está (idempotente). Como el check «SQL pegado» compara el texto de las funciones con producción, producción se
alinea con la misma migración corregida (`cancelar_recepcion_sin_aviso_clausula_al_frente`).

## Pruebas

`pnpm pruebas:cancelar-recepcion` (9 casos, en la tanda de Postgres del CI), `lib/guia-de-foco.test.ts`, `lib/guias.test.ts` (huella aceptada: la guía no abre
ni guarda esta hoja, así que no lleva paso nuevo) y `lib/enter-no-guarda.test.ts`.

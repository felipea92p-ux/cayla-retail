# ADR-0414 · El detalle de un apartado: su historial completo, abonar y aplazar desde ahí

- **Fecha:** 2026-10-15 · **Estado:** construido y verificado en local (suite de base, vitest completo, la hoja en el navegador).
  **La migración `20261015151000` está en producción desde el 2026-10-15** (versión `20261015161341`, con el OK de Felipe: sonda, ensayo
  revertido y huellas md5 `aplazar_separacion` 8269c00f…, `extender_separacion` 42dd994d…, `fn_detalle_separacion` 0864d2dd…). Rama `claude/apartados-details-management-e49c2c`.
- **Decisión de Felipe (2026-10-15):** «debería poder hacer clic para que te despliegue todos los detalles de ese apartado, si hubo más
  abonos, cuándo fueron, con la hora y fecha exacta, cómo los abonó, y que desde ese modal se puedan registrar abonos y aplazar la fecha de
  vencimiento». Al preguntarle: aplazar con **+3 días, +7 días o una fecha elegida**, con tope (**2 aplazamientos, nunca más de 30 días
  desde que se apartó**), y el detalle muestra **quién cobró cada pago** y quién aplazó.
- **Cambia:** D3 de ADR-0166 (extender: +7 días, una vez, solo vencido). **Complementa:** ADR-0236 (abonos), ADR-0367 (Historial),
  ADR-0161 (Responsable), ADR-0284 (guía de foco), ADR-0358 (las hojas: una cara, una salida a la vista).

## El problema

Una fila del Historial decía «S/60.00 de S/89.90 · 1 abono» y nada más. Si el cliente decía «yo ya pagué dos veces» o la caja no cuadraba,
no había dónde ver cuándo pagó cada cosa, con qué ni quién lo cobró. Y el plazo solo se estiraba de una forma —+7 días, una vez, después de
vencer—, así que el cliente que avisaba «la recojo el sábado» no tenía cómo.

## La decisión

**Toda la fila del Historial abre el detalle** (con el teclado, el nombre es su botón). Es UNA hoja que cambia de modo:

- **Ver** (con la ×): el estado, cuánto pagó de cuánto, las prendas y el **Historial**: se apartó, cada pago (adelanto o abono) con su día y
  hora exactos, su medio, con cuánto pagó y el vuelto si fue en efectivo, «se le esperó N días» si al abonar se eligió esperarla, y quién
  lo cobró; cada aplazamiento (de qué fecha a cuál), cada aviso por WhatsApp, y la entrega, liberación y devolución. Abajo: **Aplazar**,
  **Registrar abono** y **Entregar**.
- **Registrar abono**: el mismo formulario de siempre (`AbonarFormulario`, sacado de `AbonarModal` sin cambiar lo que hace).
- **Aplazar**: +3 días, +7 días u otra fecha, con la guía de foco (hasta cuándo, quién atiende). Con «Cancelar» vuelve al detalle.

El botón «+7 días» de la fila vencida pasa a **«Aplazar»** y abre la hoja directo en ese modo.

**En la base** (`20261015151000_apartados_aplazar_y_detalle.sql`):

| Pieza | Qué hace |
|---|---|
| `separacion_aplazamientos` | Una fila por aplazamiento: de qué fecha a cuál, cuándo y quién (`fn_actor_persona_id(true)`). RLS sin políticas. |
| `separaciones_extensiones_check` | De `≤ 1` a `≤ 2`. |
| `aplazar_separacion(id, fecha)` | Mueve el vencimiento del apartado y de sus reservas, suma 1 y anota la fila, todo o nada. La fecha tiene que ser posterior a hoy y al vencimiento, y no pasar 30 días desde que se apartó. **La misma fecha dos veces no cuenta dos** (doble clic, reintento tras un corte). |
| `extender_separacion(id)` | Queda como «aplazar 7 días», para las pestañas abiertas con la pantalla anterior. |
| `fn_detalle_separacion(id)` | Solo lectura: el historial con los nombres de quién hizo cada cosa. |

Quién puede aplazar no cambia: quien gestiona la caja (líder o cuenta de ventas, D5), igual que liberar.

## Lo que se descartó

- **Solo +7, como hoy, pero también antes de vencer.** Sin migración, pero el cliente que pide 3 días o dos semanas seguía sin camino.
- **Aplazar sin tope.** Una prenda guardada meses no se vende ni vuelve al piso, y nadie lo frena.
- **El tope de 30 días como candado de la tabla.** «Esperarla 2 o 3 días» al abonar (`abonar_separacion`) puede pasarlo y es legítimo: el
  tope es una regla de aplazar y vive en la función que aplaza.
- **Una hoja por acción (detalle, abonar, aplazar apiladas).** Tres capas de hoja confunden; una hoja con modos tiene una sola salida a la vista.

## Se rompe si

- **Se aplaza dos veces seguidas a fechas distintas por error** (dos personas a la vez): la segunda gasta el último aplazamiento. La fila
  queda anotada con quién lo hizo, pero no se deshace sola: hoy no hay «deshacer un aplazamiento».
- **Abonar con «esperarla» empuja el vencimiento más allá del día 30**: después ya no se puede aplazar (el detalle lo dice), y es correcto.

## Cómo se degrada

Si `fn_detalle_separacion` no responde (o la base todavía no la tiene), el Historial se arma con lo que la lista ya trae —cada pago con su
día, hora, medio y monto— y avisa que no pudo leer quién cobró. Si `aplazar_separacion` no existe, el aviso dice el error de la base y no se
guarda nada; el apartado no cambia.

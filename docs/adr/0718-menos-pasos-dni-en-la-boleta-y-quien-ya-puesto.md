# ADR-0718 — Menos pasos: DNI de la boleta, «Quién» ya puesto y devolución en un solo viaje

**Fecha:** 2026-11-28. **Estado:** aceptado (Felipe, sobre la maqueta `docs/maquetas/flujos-mas-cortos-2026-11/`). Solo web: sin
migración, sin cambios de RPC, permisos ni datos. Sale del análisis `docs/investigacion/2026-11-28-flujos-para-acortar.md`.

## 1 · El DNI escrito en la boleta une la ficha del cliente

**Problema.** Había dos entradas para el mismo dato: «Agregar cliente» en el ticket y «DNI del cliente» en el cobro. Solo la primera
mandaba `p_cliente_id`: con el DNI tecleado al cobrar, la venta no entraba en la ficha ni sumaba puntos.

**Decisión.** Con 8 dígitos en boleta o nota de venta y sin cliente elegido, se busca en la libreta (`buscar_clienta`) y, si el DNI es
exacto, la ficha se une sola. Felipe eligió «se une sola» sobre «preguntar antes». Reglas en `lib/clienta-ticket-reglas.ts`
(`dniDelComprobante`, `fichaDeEseDni`, `seSueltaLaFicha`); la búsqueda, en `punto-de-venta/useFichaPorDni.ts`.

- La ficha unida sola se marca (`porDocumento`) y **se suelta** si el DNI se corrige, si se pasa a factura o a otro documento. La
  elegida a mano no se suelta: la boleta puede ir a otro nombre.
- «Quitar» deja el DNI en la boleta y no vuelve a unir mientras ese número siga escrito.
- Sin el módulo Clientes no se busca. Si la búsqueda falla (sin red), no se une y la venta se cobra igual.
- No crea fichas ni inscribe a nadie en el club.

DESCARTÉ: preguntar «¿unir con María?» (un toque más en cada venta con DNI). SE ROMPE SI: alguien teclea por error el DNI de otra
persona registrada y no mira la línea «La venta queda en su ficha»: los puntos van a quien no compró.

## 2 · Con el responsable ya puesto, «Quién» no es un paso

**Problema.** En el panel de la talla (Existencias), colgar, subir, pedir y reportar dañada terminaban en un paso «Quién» aunque el
nombre ya viniera elegido: solo servía para confirmar.

**Decisión.** Si el responsable llega puesto sin que nadie toque el combo (`useResponsable().vinoPuesto`: persona de la sesión, Admin o
firma de respaldo), el combo va en el último paso de datos y «Quién» desaparece (`quienJunto` en `lib/existencias-flujos.ts`). Se decide
una vez y no se vuelve a partir al cambiar de nombre. En la terminal compartida «Quién» sigue siendo su paso: el responsable obligatorio
de ADR-0161 no cambia. «Enviar a otra sede» no firma aquí.

DESCARTÉ: firmar sin mostrar el combo (nadie vería a nombre de quién queda). SE ROMPE SI: la lista de quién está de turno llega después
de que la persona ya pasó a «Quién»: en ese caso los pasos se quedan como antes, que es el lado seguro.

## 3 · Registrar y aprobar una devolución en el mismo paso

**Problema.** Registrar y aprobar eran dos viajes: pantalla de éxito, pestaña «Por aprobar», buscar la tarjeta, y firmar otra vez. Desde
ADR-0534 la misma persona puede hacer las dos cosas.

**Decisión** (Felipe, sobre la maqueta: «Registrar y aprobar» es el botón principal). El último paso muestra el reembolso y ofrece
«Registrar y aprobar», con una sola firma, y «Dejar pendiente». Son las mismas dos funciones de siempre, una tras otra
(`crear_devolucion` y `aprobar_devolucion`): ningún candado cambia.

- Con la boleta o factura sin aceptar por SUNAT solo se ofrece «Registrar y dejar pendiente», con el motivo.
- Si la venta no se puede leer, no se ofrece aprobar.
- Si se registra y la aprobación falla, queda pendiente y la pantalla lo dice; si no se sabe si aprobó, manda a mirar antes de repetir.
- Los campos del reembolso son una sola pieza (`components/devoluciones/Reembolso.tsx`) para esta puerta y para «Por aprobar».
- De paso, los textos que decían «transmítela desde Facturación» ahora dicen cuándo sale la nota de crédito a SUNAT.

DESCARTÉ: una función nueva en la base que hiciera las dos cosas en una transacción (migración y un segundo camino que mantener para el
mismo efecto). SE ROMPE SI: la conexión se corta entre registrar y aprobar: queda pendiente, que es un estado válido y visible.

## Lo que quedó fuera

- El botón «Guardar como cliente» para un DNI sin ficha.

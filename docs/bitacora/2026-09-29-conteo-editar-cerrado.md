## 2026-09-29 (Editar un conteo cerrado — ADR-0282, actualización)
Qué hice: en el resultado de un conteo cerrado («Conteo terminado») hay un botón «Editar conteo» que lo reabre con todas sus variantes; se corrige lo que hizo falta y se cierra de nuevo. Base: `reabrir_conteo` (nueva) y una línea en `conteo_contar` (migración `20260930020100`, pegada en producción el 2026-09-29).
Por qué así: el segundo cierre no deshace el primero (`movimientos` es solo-agregar y Finanzas lee cada ajuste como merma o sobrante): ajusta solo lo que se volvió a contar, como diferencia sobre el stock de ese momento. Contó 5 y eran 4: esperaba 6 → −1 (stock 5); se reabre y se corrige a 4 → −1 más (stock 4).
Qué se rompería sin esto: la única salida a un número mal tecleado era un ajuste manual suelto en Existencias, sin relación con el conteo.
Cómo verificas tú: Inventario ▸ Conteo, «Ver» en un conteo cerrado, «Editar conteo» (si hay otro conteo abierto en la sede dice que lo cierres o canceles antes), cambia una cifra, Revisar, Confirmar y cerrar; en Movimientos («Ver movimientos del conteo») aparecen los dos ajustes.


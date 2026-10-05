## 2026-10-05 (Se retira la lectura vieja de pedidos a otra sede, que le daba el celular del cliente a la tienda que envía — ADR-0328 act. 17, cierre)
Qué hice: una migración nueva (`20261005170000`) borra `retail.fn_pedidos_para_apartar(p_ubicacion_id uuid)`, la lectura de Apartados
que #799 reemplazó por `fn_pedidos_con_cliente`. Antes de escribirla, producción en solo lectura: ninguna función, vista, política,
disparador ni trabajo programado la llama, y su firma es esa. Las dos pruebas que la usaban (`pedir_a_otra_sede.mjs`, `separaciones.mjs`)
leen ahora la nueva con las mismas verificaciones: 71/71 y 79/79 en un Postgres desechable, antes y después de pegar la migración dos
veces. Las versiones de `main` de esas pruebas fallan contra la base sin la función, justo en las dos líneas cambiadas.
Por qué así: la vieja seguía viva y le entregaba a la sede que ENVÍA el nombre y el celular del cliente, lo que la decisión de privacidad
del 2026-10-04 le quitó; cualquiera que opere esa sede podía leerlo llamándola directo. Dos lecturas del mismo pedido que ya divergen
son además una trampa para quien toque Apartados después.
Felipe se lleva: el SQL va SIN pegar; se pega solo, tal cual, cuando quiera (no hay web que dependa de él). Si una rama vieja anterior a
#799 todavía la llama, su lista «Pedidos a otra sede» queda vacía y el resto de Apartados sigue funcionando.

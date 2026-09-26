# ADR-0239 · Traslados: recibir sin perder nada (entra lo que coincide, conteo a ciegas y guardado, piso o almacén, anular)

- **Fecha:** 2026-09-26 · **Estado:** Aprobado por Felipe («Tomo todas tus recomendaciones», sobre las cuatro decisiones de
  `docs/pantallas/traslados.md` §6). Acta: `docs/datos/DECISIONES-2026-09-26-traslados.md` (D-129 a D-132).
- **Producción:** `20260927160000_traslados_recibir_sin_perder_nada.sql` **aplicada el 2026-09-26** con el OK de Felipe
  (ensayo revertido antes; verificada por md5 de las 14 funciones contra local). Fue ANTES de la web: la web vieja siguió
  funcionando con la base nueva (los parámetros nuevos tienen valor por defecto y las columnas son aditivas).
- **Nace de:** el recorrido de usabilidad del 2026-09-26 (`docs/pantallas/traslados.md`, PR #498).
- **Complementa:** ADR-0068 (traslado en dos fases), ADR-0113 (Recibir por envío), ADR-0173 (se cuenta, no se asume),
  ADR-0190 (doble clic y candados en orden), ADR-0233 (pedido para apartar que llega por traslado), ADR-0231 (regla de piso).

## Problema

El recorrido como persona sin contexto encontró que el flujo falla justo al recibir:

1. Si falta una prenda, no entra ninguna: 79 de 80 prendas quedan fuera del stock hasta que aparezca un líder.
2. El botón «Coincide» copia lo enviado de un toque: invita a no contar (ADR-0173 dice «se cuenta, no se asume»).
3. Lo que llega entra al almacén y Vender descuenta del piso: «entraron al stock» y, en la caja, «está en el almacén».
4. Un envío equivocado no se puede deshacer: hoy la única salida es que la otra sede registre 0 y un líder lo dé por
   perdido. Eso es una pérdida falsa.
5. Lo contado vive solo en la pantalla: si recargas, lo pierdes.
6. Con la caja en la mano, el sistema dice «Nada requiere tu acción» si todavía no pasó la hora que estimó quien envió.

## Decisiones

### D-129 · Entra lo que coincide; solo la línea con diferencia espera

```
DECIDÍ: `confirmar_traslado` hace entrar al stock, en la misma transacción, cada línea cuya cantidad contada es IGUAL a
        la enviada. Las líneas con diferencia (de más o de menos) quedan sin movimiento y el traslado pasa a
        `recibido_con_diferencia`; `cerrar_traslado_con_diferencia` (líder) hace entrar solo esas. Si todas coinciden,
        queda `cerrada` como antes.
DESCARTÉ: (a) todo o nada, lo de hoy: una prenda perdida congela toda la caja; (b) hacer entrar la parte contada de una
        línea con diferencia (2 de 3): parte la línea en dos historias y el líder ya no puede decidir sobre la línea
        entera.
SE ROMPE SI: alguien corrige el conteo de una línea que YA entró al stock. `registrar_recepcion_traslado` lo rechaza
        («esa prenda ya entró al stock»), y `fn_traslado_lineas` dice cuál entró (`ingresado`).
```

Un traslado «a medias» es un estado nuevo en los hechos, pero no en la tabla: `recibido_con_diferencia` ya existía. Lo que
cambia es que algunas de sus recepciones ya tienen `movimiento_id`. `cerrar_traslado_con_diferencia` ya recorría solo las
recepciones con `movimiento_id is null`, así que no cambia su lógica, solo su destino (ver D-131).

### D-130 · Conteo a ciegas, guardado línea por línea

```
DECIDÍ: quien recibe cuenta sin ver lo enviado. La tabla muestra prenda, código y «Contado»; no muestra «Enviado», ni el
        total de unidades, ni el botón «Coincide». Cada casilla se guarda sola al cambiar
        (`registrar_recepcion_traslado`, sin el loader global: header `x-espera: no`) y al volver a la pantalla se
        recupera lo contado. «Terminé de contar» muestra la comparación con lo enviado, marca las líneas que no cuadran
        para volver a contarlas y recién ahí se confirma. La pistola (escanear la etiqueta: `codigo`) suma de a uno.
DESCARTÉ: (a) mostrar lo enviado con «Coincide» (lo de hoy): se asume en vez de contar; (b) ocultar lo enviado también
        después de «Terminé de contar»: quien encontró 2 de 3 no sabría que tiene que buscar la tercera en la caja;
        (c) un borrador en el navegador (localStorage): se pierde al cambiar de tablet y la base ya tiene la tabla
        exacta para esto (`transferencia_recepciones`, una fila por prenda, se pisa sin duplicar).
SE ROMPE SI: quien recibe mira el traslado desde la sede que ENVIÓ (ahí sí se ve lo enviado). Es un control de proceso,
        no de seguridad: la base no esconde la cantidad enviada a la sede destino.
```

`registrar_recepcion_traslado` deja de marcar `confirmado_por`/`confirmado_en`: ahora se llama al contar cada casilla, y
«confirmado» tiene que seguir diciendo «alguien apretó Confirmar recepción», no «alguien tocó una casilla».

### D-131 · Piso o almacén, se pregunta al confirmar (piso marcado)

```
DECIDÍ: `confirmar_traslado(p_transferencia_id, p_destino)` con `p_destino` en ('piso_venta', 'almacen_tienda') o null.
        Null = almacén, como antes (así siguen iguales Recibir por envío y la web vieja). La sububicación elegida se
        guarda en `transferencias.sububicacion_destino_id` y la usa también `cerrar_traslado_con_diferencia`: toda la
        caja termina en el mismo lugar. Si la sede destino no tiene esa sububicación (el Taller solo tiene `rack`), se usa
        la de siempre. La pantalla pregunta solo si la sede destino tiene piso de venta, con «Piso de venta» marcado.
DESCARTÉ: (a) cambiar `fn_sububicacion_por_defecto(…, 'traslado_entrada')` a piso para todos: cambia en silencio Recibir
        por envío, el pedido para apartar (ADR-0233) y cualquier otro llamador; (b) un aviso después con «Bajar todo al
        piso»: son dos pasos y el segundo se olvida.
SE ROMPE SI: una tienda cuelga lo que llega en el piso, pero la mitad de la caja se queda en el almacén (sobra
        espacio). Entonces se elige «Almacén» y se baja lo que se cuelga, con Reponer, como hoy.
```

El pedido para apartar (ADR-0233) se aparta donde la prenda entró de verdad, no donde entraría por defecto. Y se aparta
cuando SU línea entra al stock, aunque otra línea del traslado siga esperando al líder: así ninguna otra caja puede vender
la prenda que la clienta pidió.

### D-132 · Anular un envío: quien envió o un líder, mientras nadie haya empezado a contar

```
DECIDÍ: `anular_traslado(p_transferencia_id, p_motivo, p_token)`: solo con el traslado `en_transito` y sin ninguna fila en
        `transferencia_recepciones` (nadie contó nada). Puede anularlo quien opera la sede de origen o un líder. El motivo
        es obligatorio. Cada línea vuelve al origen con un movimiento de entrada `traslado_anulado`, en la misma
        sububicación de la que salió. El traslado queda `anulada` (con quién, cuándo y por qué), y un pedido para apartar
        que iba en él vuelve a «pedido», para enviarlo de nuevo.
DESCARTÉ: (a) borrar el traslado: se pierde la historia y `movimientos` es append-only; (b) dejar que la sede destino lo
        rechace: la caja ya salió, y rechazar sin contar es asumir; (c) anular después de empezar a contar: la caja ya
        está en la otra sede, y eso se resuelve contando (lo que no llegó lo cierra el líder).
SE ROMPE SI: la otra sede abre la caja y empieza a contar mientras se anula. Las dos funciones toman el traslado con
        `for update`: gana la primera y la segunda recibe un mensaje claro («ya empezaron a contar» / «ese traslado se
        anuló»).
```

## Lo que no es decisión (arreglos del mismo PR)

- **«Por recibir» no depende de la hora estimada:** todo traslado en camino hacia mi sede pide recibirse, y su fila lleva
  «Recibir». La hora estimada queda como dato («llega hoy», «atrasado»).
- **La lista dice «Cerrado con diferencia»**, no «Completado» en verde, cuando se cerró con faltante. Y «Anulado», cuando
  se anuló.
- **«Cerrar con esta diferencia» pide confirmación** con la consecuencia escrita (cuántas prendas se dan por perdidas).
- **El formulario de envío no decide por ti:** destino y prendas vacíos hasta que los elijas; «+ Agregar línea» agrega una
  línea vacía.
- **Anchos fijos en las columnas de la recepción:** los botones no se mueven mientras cuentas.

## Contrato (lo que la web puede asumir)

| Función | Promete | Asume |
|---|---|---|
| `confirmar_traslado(p_transferencia_id uuid, p_destino text default null)` → `(resultado, lineas_ok, lineas_con_diferencia, unidades_ingresadas)` | `resultado` es `cerrada` o `recibido_con_diferencia`; `lineas_ok`/`unidades_ingresadas`: lo que entró al stock en esta llamada. | Todas las líneas enviadas tienen su conteo (aunque sea 0). |
| `cerrar_traslado_con_diferencia(p_transferencia_id, p_nota)` | Hace entrar solo las líneas que aún no entraron, en `sububicacion_destino_id`. | Líder; traslado en `recibido_con_diferencia`. |
| `registrar_recepcion_traslado(p_transferencia_id, p_variante_id, p_cantidad_recibida)` | Fija (no suma) el conteo de una prenda; se puede llamar muchas veces. No marca `confirmado_*`. | Traslado abierto y esa línea todavía no entró al stock. |
| `anular_traslado(p_transferencia_id, p_motivo, p_token default null)` → `uuid` | Devuelve el stock al origen y deja `anulada`; con el mismo token, un segundo intento no hace nada. | `en_transito`, sin conteos; origen o líder; motivo no vacío. |
| `fn_traslado_lineas(p_transferencia_id)` | Suma `codigo` (el código de barras de la etiqueta) e `ingresado` (esa línea ya entró al stock). `cantidad_recibida` null = todavía no contada. | — |
| `transferencias` | Columnas nuevas: `sububicacion_destino_id`, `anulado_por`, `anulado_en`, `motivo_anulacion`; estado nuevo `anulada`. | — |

## Verificación

- `scripts/pruebas/traslados_recibir_sin_perder_nada.mjs` (en CI): entra lo que coincide, cierre del líder solo con lo
  restante, piso vs almacén, anular (y sus rechazos), el conteo que ya entró no se corrige, el pedido para apartar.
- Las pruebas que ya existían siguen verdes: `recibir_envio.mjs`, `concurrencia_orden_y_doble_clic.mjs`,
  `caja_cierre_traslado.mjs`, `fn_movimientos_referencias.mjs`.
- En el navegador, en local: enviar de Trujillo a Lima, contar a ciegas, recargar a mitad, confirmar con una prenda de
  menos y vender la que llegó; y anular un envío.

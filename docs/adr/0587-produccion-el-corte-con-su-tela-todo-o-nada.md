# ADR-0587 · Producción: el corte con su tela, todo o nada

- **Fecha:** 2026-10-30 · **Estado:** construido y probado contra una base desechable con las 985 migraciones de `main` más la
  siembra. La nueva suite pasa 20/20 y las 32 suites de Producción e Insumos siguen en verde encima. **La migración
  `20261031014000` NO está pegada en producción** (espera el OK de Felipe) y **la pantalla no se probó en el navegador**: el
  clasificador de seguridad no dejó conectar la web a la base desechable (ver «Lo que falta»).
- **Decide:** Felipe, 2026-10-30. De las 21 mejoras de `docs/pantallas/produccion-modulo-21-mejoras.md` eligió primero «Integridad
  (1–4)». Respondió «Deshacer devuelve la tela: sí» y pasó la 4 (ajustes por lote) a #1499.
- **Toca:** ADR-0570 (actividades 2 y 4: «Terminé» con falla y la tela al cortar), ADR-0190 (token y candados), ADR-0400 (Salida,
  Vuelta y «Deshacer»), ADR-0362 (órdenes de insumos y Recibir), principio 2 (cero estados inconsistentes).

## El problema primero (medido, no supuesto)

1. **Dos cortadoras a la vez podían dejar el estante en negativo.** `anotar_insumos_de_la_orden` leía cuánto «había» sin candado.
   Medido en la base desechable con dos sesiones reales: un estante de 60 m con un ajuste de conteo de −15 m (quedan 45 m). A anota
   «quedaron 20» en la orden 1 y tarda 3 s; B anota lo mismo en la orden 2, un segundo después.
   - **Con la función de `main`, el estante queda en −5 m.** Es un estado imposible: B leyó «había 45» antes de que A confirmara.
   - Sin el ajuste, el mismo choque daba un error falso: «el estante tiene un ajuste que los lotes no ven. Avisa al líder».
   - **Con el candado de esta ADR, queda en 20 m**, y B recibe «Con eso no se usó nada», que es lo cierto.
2. **«Terminé» y su tela eran dos llamadas.** Si el wifi del Taller se cortaba entre las dos, el corte quedaba anotado y la tela no
   (`AnotarAvanceModal`, y lo mismo la Salida a un corte de afuera en `AnotarSalidaModal`). La pantalla lo admitía: «El corte quedó
   anotado, pero la tela no».
3. **Ninguna llevaba token.** Tras un corte de red, apretar otra vez anotaba otras 30 prendas o descontaba la tela dos veces.
4. **«Deshacer» no devolvía la tela** («Deshacer no la devuelve»). Además, deshacía avance por avance con llamadas sueltas: si la
   tercera fallaba, quedaba a medias.
5. **Una factura registrada suelta no preguntaba por el pedido del proveedor.** Recibir mostraba después las dos cosas, el pedido y la
   «factura sin orden», por la misma tela, que así se podía recibir dos veces.

## Lo que se decidió

**DECIDÍ:** un candado por (tela, sede), tomado ANTES de leer lo que había y en orden de id. Va en `fn_produccion_anotar_tela`, la regla
única de «quedó/usado» que usan las tres puertas: la hoja «Tela», «Terminé» y la Salida.
**DESCARTÉ:** el candado de la orden, que ya existía. No ve el choque real, que es entre DOS órdenes que cortan del mismo rollo.
**SE ROMPE SI:** una función nueva descuenta del estante leyendo el saldo sin pasar por `fn_produccion_anotar_tela`, por ejemplo una
reescritura de `anotar_insumos_de_la_orden` copiada de la versión de `20261029190000`. La suite `produccion-corte-con-su-tela` (S2) lo
marca.

**DECIDÍ:** `anotar_termine_con_tela` y `registrar_salida_con_tela`: el envío y su tela en una transacción, con token (ADR-0190,
`fn_intento_con_huella`). Un reintento con el mismo token y lo mismo responde `repetido` sin anotar nada, y con otro contenido se
rechaza (`token_reusado`). `anotar_termine` pasa a ser la puerta sin tela de la misma función: una sola regla de «Terminé», y
`registrar_avance`, que la llama, no cambia.
**DESCARTÉ:** guardar cada envío en una tabla propia para recordar sus ids. La pantalla los recibe en la respuesta, y `deshacer_termine`
valida cada uno por separado. Sería una tabla más sin ningún estado imposible nuevo que evitar.
**SE ROMPE SI:** la pantalla cambia el contenido después de un corte de red y reenvía con el mismo token. La base lo rechaza
(`token_reusado`), la pantalla renueva el token y el siguiente envío va como uno nuevo: si el primero sí se había guardado, quedan dos.
El mensaje de la base lo advierte; no se resolvió con `fn_resolver_intento` porque esa pieza es de Ventas y Caja.

**DECIDÍ:** `deshacer_termine` deshace las prendas, las fallas y la tela en una sola llamada. La tela vuelve al MISMO lote y al mismo
costo, con una devolución que apunta al consumo que deshace (`movimientos_insumo.deshace_id`). Un CHECK solo deja que una devolución
diga qué deshace, y un índice único impide devolver un consumo dos veces. Si ya se devolvió a mano parte de esa tela, se frena entero.
**DESCARTÉ:** que «Deshacer» devuelva solo las prendas, como hasta hoy. Felipe eligió que vuelva la tela: el error se borra completo, y
nada se borra del libro.
**SE ROMPE SI:** alguien devuelve con «Devolver lo que sobró» parte de la tela de un corte y después aprieta «Deshacer». La base lo frena
(`deshacer_tela_ya_devuelta`) y pide corregir desde «Tela»: no devuelve de más, pero tampoco lo resuelve solo.

**DECIDÍ:** la factura suelta pregunta, no bloquea. Al elegir el proveedor, si tiene un pedido con metros sin facturar, la hoja lo dice
con un `<Aviso>` y un enlace para registrarla desde el pedido. La regla es `pedidosSinFacturaDe` y la lectura la de Recibir
(`fn_ordenes_insumo_por_recibir`): no hay función nueva en la base.
**DESCARTÉ:** un candado en la base. Una factura de otra compra del mismo proveedor es normal.
**SE ROMPE SI:** un proveedor se renombra entre que la página se carga y la factura se registra. El cruce es por nombre, que la base
guarda único (`proveedores_produccion_nombre_clave_unica`), porque la lectura de Recibir no trae el id del proveedor.

## Cómo se verificó

- `pnpm pruebas:produccion-corte-con-su-tela` da 20/20 en la base desechable: todo o nada, el token (repetido, reusado y sin token),
  la puerta vieja, «Deshacer» (mismo lote, dos veces, parte ya devuelta, otra orden, los CHECK, orden cerrada), la Salida, la hoja «Tela»
  y la forma.
- Con la migración aplicada siguen en verde las 32 suites de Producción e Insumos: las 26 que aceptan `--contenedor` y las 6 con el
  contenedor fijo, corridas con una copia temporal que se borró.
- La carrera real con dos sesiones se corrió a mano dos veces (sin y con ajuste) contra la función de `main` y contra la nueva. Está
  descrita arriba.
- Al abrir el PR, sobre `main` fusionado (con #1499) y la base desechable reconstruida desde cero, se corrieron 41 suites de Producción e
  Insumos. Una cayó: `candado-dinero-produccion` (guardia 6). La columna nueva `deshace_id` no tenía su permiso de lectura. Las columnas de
  `movimientos_insumo` se abren una por una por el candado del dinero, así que una pantalla que leyera la tabla entera habría recibido «permission
  denied». La migración ahora la abre con `grant select (deshace_id)`, como hizo #1499 con `anulado_at`.
- En la web: `tsc` limpio, toda la suite de vitest (748 archivos, 164.762 casos), `knip`, `knip:produccion` y los candados de migraciones del CI.

## Lo que falta

1. ~~Ver las dos hojas y el aviso en el navegador~~ **Hecho el 2026-10-30**, con la web conectada a la base desechable (Felipe dio el
   OK) y la cuenta de prueba del seed: «Terminé» con la tela anota el corte y la tela juntos (estante de 20 a 10 m, costo real S/ 100);
   «Deshacer» devuelve el corte a 0 de 10 y la tela a 20 m, con la devolución enlazada a su consumo; la salida a un corte de afuera
   manda 10 prendas y 10 m juntos; el aviso de la factura suelta sale al elegir un proveedor con pedido abierto y su botón lleva a la
   factura del pedido con la tela y el costo puestos. Escritorio, 375 px y modo oscuro. Al mirarlo a 375 px apareció un defecto: el botón a
   la derecha del aviso (`accion`) apretaba el texto en una columna angosta. Ahora va bajo el texto, como los enlaces de varios pedidos.
   El mismo defecto vive en la pieza `<Aviso>` para todo aviso con botón en una pantalla angosta (Plan del piso ya lo parchó solo para
   el suyo): arreglarlo en la pieza es decisión de Felipe (`/unificar`).
2. **Pegar `20261031014000` en producción, con su OK.** Es una sola parte: un `alter table` sin valor por defecto y funciones, sin
   políticas. Después, refrescar el diccionario (`pnpm datos:generar:produccion`).
3. `datos:comparar` va a marcar las tres funciones nuevas hasta que estén en producción. Es lo esperado.
4. Avisar a la sesión de ADR-0570: una actividad suya que reescriba `anotar_insumos_de_la_orden` o `anotar_termine` tiene que partir de
   esta versión.

# ADR-0503 · Recibir: «Costos y precios» aparte del conteo, y el precio de venta se cambia desde la recepción

- **Fecha:** 2026-10-24 · **Estado:** construido y probado en local (migración `20261024225000`); **no está en producción**: pegarla exige el OK de Felipe.
- **Decidió:** Felipe (el qué y quién, 2026-10-24); Claude (cómo se guarda).
- **Relacionados:** ADR-0393 (recibir contando primero), ADR-0067 (costo promedio ponderado), ADR-0183 (el costo es dato con permiso), ADR-0370 (precio propio por sede), ADR-0384 (el precio 0 solo en empaque).

## El problema

En el cierre de un envío el costo de cada línea era una celda más de la tabla: quien recibe puede corregirlo con la factura en la mano, pero pasaba desapercibido siendo dinero. Y el precio de venta de la prenda que llegó solo se cambia en Catálogo ▸ Productos, que no todo el que recibe ve.

## Decisión

```
DECIDÍ:    (1) Poner el precio de compra y el de venta como las dos últimas columnas de la tabla del cierre, con un aviso de que es dinero y una
               confirmación antes de guardar. (2) Cambiar el precio de venta desde el cierre, solo de las prendas YA
               identificadas en este envío (`despacho_conteos.separado`), eligiendo «todas las sedes» o «solo esta sede». (3) Quien recibe
               (módulo Recibir mercadería) puede hacerlo, sin Productos. Lo nuevo (que aún no existe) lleva su precio al crearse (pendiente «crear»).
DESCARTÉ:  (a) Reescribir precios o costos anteriores: no se toca nada; lo vendido ya guarda su precio en `venta_items` y el cambio rige hacia
               adelante. (b) Un permiso nuevo solo-líder: Felipe eligió «todo el que recibe». (c) Cambiar `poner_precio_sede` para quitarle Productos:
               se hizo un guardián con marca de transacción en `fn_precio_sede_exigir`, de un solo punto de entrada. (d) Un precio de lo nuevo al
               cerrar: lo nuevo se cuenta por cantidad y no existe todavía (decisión 8 de ADR-0393).
SE ROMPE SI: (i) `retail.precio_desde_recepcion` pudiera ponerse desde fuera de `cambiar_precio_en_recepcion` (hoy solo con `set_config(...,
             true)` dentro de esa función; PostgREST no ejecuta SET): se saltaría el módulo Productos. La prueba F1 vigila que no quede puesta.
             (ii) El costo de la línea se corrige a un número absurdo: sigue valiendo la confirmación de ADR-0298; esta tarjeta no la cambia.
```

## Cómo queda

- **Costo:** igual que antes (`cerrar_conteo_envio` con `costo_unitario`; alimenta el promedio hacia adelante y deja su fila en `costo_historial`). Solo cambió dónde se escribe.
- **Precio general («todas»):** `update variantes.precio` de las tallas activas (menos la de obsequio). El disparador `variantes_registrar_cambio` deja la fila en `historial_producto_cambios` (campo `precio`, quien firma, antes y después), la que ya muestra Catálogo ▸ Productos ▸ Historial.
- **Precio de esta sede:** `poner_precio_sede` con todos sus candados (piso del costo, «igual a la grilla» lo quita, historial), motivo «Recepción ENV-000123».
- **Candados nuevos de la función:** envío abierto, de tu sede, que no lo compraste tú (`fn_recepcion_exigir`), prenda de ESTE envío, precio de 0.01 a 5000 y nunca bajo el costo (el mensaje no dice cuánto cuesta). El responsable firma con el combo, como toda función que guarda.
- **Pantalla (ajuste del mismo día):** el precio de compra (de toda la línea: así se guarda el costo, por línea y no por prenda) es la última columna de la tabla del cierre, y el de venta de cada prenda identificada vive en la fila desplegable de esa línea (cerrada: un chip «Precio de venta cambiado» si hay un cambio escondido). **Nada se guarda al teclear:** al pulsar «Cerrar» sale una confirmación que lista lo que cambia (compra y venta); al confirmar, primero se aplican los precios de venta (`cambiar_precio_en_recepcion`, uno por prenda; la base lo pide con el envío abierto) y después se cierra. Si un precio falla, no se cierra y el mensaje dice cuál; un reintento no repite los ya aplicados.

## Límites conocidos

- El historial dice quién, cuándo, antes y después; **no** dice «desde Recepción ENV-…» en el cambio general (la tabla no tiene columna de origen). En el de sede sí, por el motivo. Agregar el origen al general es un cambio de esa tabla inmutable: se deja para Felipe.
- En una recepción donde nada se separó antes de cerrar, la sección de precio dice que no hay prenda concreta todavía. El precio se cambia cuando se separa.

## Cómo verificarlo

`pnpm pruebas:precio-desde-recepcion` (8 casos, ROLLBACK) y `pnpm pruebas:precio-sede` (el guardián sigue igual para Productos). En el navegador: `/recibir/envio/<id>` en el paso Cerrar.

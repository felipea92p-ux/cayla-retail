## 📦 Recibir ▸ Cerrar: costo y precio por color y talla — rama `claude/shipments-date-filters-497b4b`

- [x] Capa de precio de tienda por combinación en la base (`20261028230000`) y su escritura, limpieza y lectura (`20261028232000`).
- [x] Costo y precio por combinación en la recepción (`20261028234000`).
- [x] Reglas puras de la matriz y la pantalla de «Cerrar» (matriz, interruptor, barra de alcance, confirmación).
- [x] Productos y la ficha de la prenda dicen el precio de una tienda talla por talla.
- [x] **PEGADAS en producción** (comprobado en solo lectura el 2026-10-29: la tabla `precios_sede_variante`, el candado `otro` y 18 de las 19 funciones con el mismo `md5(prosrc)` que en local; `fn_producto_historia` difiere solo por otra migración que local no tiene y lleva la marca del parche). Antes: **Pegar en producción, con el OK de Felipe y en este orden, UNA parte cada una:** `20261028182000` (cambió de texto: no estaba en producción), `20261028230000`, `20261028232000`, `20261028234000`; antes, comprobar que están `20261026164000` y `20261026180000`. Verificar el md5 de `fn_precio_en_sede`, `poner_precio_sede`, `cerrar_conteo_envio`, `fn_envio_costos_prendas` y `fn_recepcion_costos_a_variantes`. **Nada de esto está en producción.**
- [x] Refrescar el diccionario de datos: hecho el 2026-10-29 (`pnpm datos:refrescar`, 47 grupos; `precios_sede_variante` entra al pájaro Loro).
- [ ] Cerrar de verdad un envío con costo y precio por combinación desde la pantalla: en la base local el cierre se detiene en `fn_dueno_de_entrada_sin_elegir` (elegir si lo que entra es de CAYLA o de CLAURE); probar con una prenda con empresa elegida en el flujo real.
- [ ] `cambianEnCajaAlGuardar` (ficha de la prenda) sigue mirando el precio por prenda: con una excepción por talla puede no ofrecer reimprimir etiquetas.
- [ ] «Hacer ahora» (Para después) sigue poniendo el precio por prenda, no por combinación: decidir si también.
- [ ] Pruebas que ya fallaban en la base local compartida (con y sin estos cambios): `registrar-venta` (17), `cambio-sin-precio` (6), `precio-sede` (3), `eliminar-producto` (2), `tienda-rapida` (7), `vitrina-web` (38) y otras; el recorredor de la guía de Editar producto («Revisar y guardar» sin alto). Investigar el estado de esa base.
- [ ] «Precio de venta opcional» para una prenda creada completa al contar: sigue sin decidir (ADR-0384).

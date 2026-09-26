# ADR-0167 — Proformas con prendas del catálogo, cobradas en el Punto de Venta y con hoja A4

**Fecha:** 2026-09-22 · **Estado:** aceptado (Felipe, sección por sección en el chat; maqueta C). Migración
`20260923094700_proformas_con_prendas.sql` aplicada en local; **producción espera el OK explícito** · Diseño:
`docs/superpowers/specs/2026-09-22-proformas-con-prendas-design.md` · Plan: `docs/superpowers/plans/2026-09-22-proformas-con-prendas.md`
· Relacionado: ADR-0007 (la proforma no es comprobante de pago), ADR-0141 (apartados), ADR-0165 (series y envío automático).

## Contexto

Una proforma era un total suelto: una línea «Venta» con un monto escrito a mano. No decía qué prendas se cotizaron ni
había documento que entregarle a la clienta. Dos defectos más, encontrados al diseñar esto:

- **Convertir no movía stock.** `convertir_proforma_a_comprobante` (0010) creaba un comprobante sin `ventas` ni
  `movimientos`: con prendas reales, la clienta se llevaría ropa sin que el inventario bajara (principio 2).
- **Error de IGV.** La proforma guardaba el total CON IGV en `items[].precio_unitario`, y para una línea sin prenda ese
  campo se lee SIN IGV (`itemsParaLucode`, `emitir_comprobante`): el comprobante declaraba un 18 % de más.

En producción había una sola proforma (vigente, S/ 7,000, de prueba): no había historia que migrar.

## Decisión

1. **Las líneas son prendas del catálogo y se guardan como copia** en `proformas.items` (jsonb), con la convención de
   `registrar_venta` (precio de etiqueta CON IGV, descuento por línea, motivo) más `descripcion` y `codigo`. El papel
   no cambia si mañana cambia el catálogo. Se descartó una tabla `proforma_lineas`: igual habría que copiar precio y
   nombre, y sumaba tabla, RLS y consultas sin ganar nada.
2. **La base valida y calcula** (`crear_proforma` v2, firma nueva; la vieja se borra en la misma migración para no
   dejar dos sobrecargas): prenda activa, cantidad entera > 0, precio = catálogo de hoy (`venta_precio_cambiado`),
   descuento de 0 a **20 %** con motivo de la lista de `registrar_venta`; copia descripción y código; calcula subtotal,
   IGV y total. Número propio (`numero`, «PRO-000123»), `nota` (≤ 500) y `venta_id`.
3. **Se cobra en el Punto de Venta** (`/vender?proforma=<id>`), no se «convierte». El carrito llega armado; se cobra
   como cualquier venta (stock, caja, comprobante automático D-60). Después, `marcar_proforma_cobrada(proforma, venta)`
   la deja «convertida» y enlazada (idempotente; exige vigente, venta completada y misma tienda).
   `convertir_proforma_a_comprobante` queda sin `grant` (no se borra).
4. **No reserva stock:** congela el precio, no la prenda.
5. **Si la prenda subió de precio, se cobra el de la proforma** (`precioAlCobrarDeLaProforma`): el carrito lleva la
   etiqueta de hoy (lo exige `registrar_venta`) y la diferencia como descuento «Otro: Precio de la proforma PRO-…».
   Si bajó, paga lo menor. Si la campaña del día da más, gana la campaña. Una proforma vencida pide confirmar el precio
   (`confirmacionDeConversion`, opción B del 2026-09-21).
6. **Hoja A4 con la foto de cada prenda** (maqueta C, elegida entre tres): `ProformaA4`, impresa por la misma raíz
   `#boleta-a4-print` que la boleta A4; «Guardar como PDF» es la opción del navegador. Sin foto, un recuadro del color.
7. **«Nueva proforma» vive en la pestaña Proformas** (necesita el catálogo); sale del shell y se borra
   `useFacturacionAcciones`.

## Alternativas descartadas

- **Convertir directo desde Proformas** registrando venta y stock: duplicaba lo que ya hace el Punto de Venta (pago,
  topes de descuento, cola sin conexión).
- **Meter la proforma dentro de `registrar_venta`** para que el cobro sea atómico: es la función más delicada del
  sistema (también la usa la cola sin conexión) y el costo de no ser atómico se corrige con un clic (ver abajo).
- **Apartar el stock** mientras la proforma vale: una proforma olvidada congela ropa; se prefirió congelar solo el precio.
- **Guardar en la proforma el argumento de un descuento > 20 %:** reusarlo al cobrar saltaría el candado de
  `registrar_venta`. Más de 20 % lo decide un líder al cobrar.

## Consecuencias

- **Cobrar son dos llamadas** (`registrar_venta` y luego `marcar_proforma_cobrada`). Si se corta la red entre las dos,
  la venta y el stock quedan bien y la proforma sigue «vigente»; el Punto de Venta lo avisa. Sin conexión, la venta
  se encola y la proforma queda vigente (también se avisa).
- **Una colaboradora que cobra una proforma con descuento** necesita el código de descuento, como cualquier descuento
  manual: el candado de `registrar_venta` no cambia.
- **Solo se carga lo que hay en el piso** de la tienda (la venta descuenta el piso): lo que está en almacén o
  cuarentena se avisa con nombre y no entra al carrito.
- Las proformas de formato anterior se ven con el chip «formato anterior», sin Cobrar, Duplicar ni imprimir.
- El correlativo `numero` puede tener huecos (una inserción fallida o un ensayo con `rollback` consumen número): es
  interno, no es de SUNAT.

## Se rompe si

- Se pega en producción el código de esta rama **sin** la migración: la pestaña Proformas lee `numero`, `nota`,
  `venta_id` e `items` y la lectura falla (`exigir`) → la vista cae a `error.tsx`.
- Se vuelve a crear `crear_proforma` con la firma vieja sin borrar la nueva: dos sobrecargas y PostgREST no sabe
  cuál llamar.
- Una tienda no tiene nada en el piso de venta: «Cobrar» abre el carrito vacío (con el aviso de qué falta).

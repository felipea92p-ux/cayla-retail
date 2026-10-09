# ADR-0369 — Corregir lo anotado de una venta sin registrar

- **Fecha:** 2026-10-09
- **Estado:** aceptada (pedido de Felipe, 2026-10-09: «debería poder haber una opción de cambiar color, tallas o categorías incluso
  luego de registrada la venta, ya que es muy relativo»). Migración `20261010150000_corregir_prenda_sin_registrar.sql`
  **aplicada solo en local**; falta producción con el OK de Felipe (pegar ANTES de publicar la web).

## Contexto

Cuando una prenda llega a piso sin pasar por almacén, la caja la vende igual y anota a ojo categoría, talla, color y una
descripción (ADR-0179). Esa anotación queda en `retail.prendas_por_regularizar` y, hasta hoy, no se podía tocar. Pero es muy
relativa: beige o crema, blusa larga o vestido, una talla adivinada de la percha. Y de ella dependen tres cosas:

1. **La mesa de Ventas sin registrar** ofrece primero las prendas que calzan en categoría + talla + color (`calceDe`,
   `fn_candidatas_de_venta`). Un color mal anotado esconde la prenda real.
2. **El motor del piso y el de demanda** cuentan esa venta en su categoría/talla/color, también las `cerrada_sin_prenda`.
3. **El cierre de arranque** cierra con lo anotado.

Lo que se verificó antes de decidir: **el comprobante no depende de esta tabla.** Lo enviado a SUNAT guarda su propio texto
(`descripcion_libre` del pedido, `lib/transmision-reglas.ts`), y `venta_items` no tiene descripción. Corregir lo anotado no
cambia ningún documento legal.

## Decisión

- **Qué se corrige:** descripción, categoría, talla y color. **El precio no** (es lo que entró a caja y lo que dice el
  comprobante: se cambia con nota de crédito). No mueve stock ni toca la venta.
- **Cuándo:** mientras la venta está `pendiente` o `cerrada_sin_prenda` (esta sigue contando en la demanda con lo anotado).
  Una `regularizada` no: ahí manda la prenda real. Una `anulada` tampoco.
- **Quién:** quien ve el módulo Existencias (donde vive la pantalla, ADR-0306) y opera la tienda de la venta, como
  `regularizar_prenda`. Firma el «Responsable» del combo (ADR-0162).
- **Rastro:** la foto de antes y después en `retail.prendas_por_regularizar_correcciones` (solo se agrega: un disparador
  impide editar o borrar) y una línea en Actividad (módulo Existencias, acción `prenda_sin_registrar_corregida`). En la mesa,
  bajo lo anotado: «Corregido por … el … · caja anotó «…»».
- **Dónde y con qué:** botón «Corregir lo anotado» en el puente de la mesa (pendientes) y en el resumen de una cerrada. Abre
  **la misma hoja con que la caja anotó** (`PrendaSinRegistrarModal`, modo `corregir`): mismas listas (ahora en
  `lib/prenda-sin-registrar-listas.ts`, compartido con Vender), misma guía de foco y misma etiqueta. Arranca con lo anotado,
  el precio se ve fijo, pide responsable y «Guardar cambios» solo se enciende si algo cambió.

## Alternativas descartadas

- **`update` sin rastro.** Lo anotado es lo que dijo caja en el momento de la venta; borrarlo sin foto pierde la pista de un
  error de caja que se repite.
- **Dejar corregir una regularizada.** La anotación ahí ya es historia; si la prenda real es la equivocada, eso no se arregla
  con este botón.
- **Una hoja nueva para corregir.** Habría dos formas de elegir categoría/talla/color (ADR-0358, «una función, una pieza»), y
  lo corregido podría ser algo que la caja nunca ofrece.

## Consecuencias

- La corrección se refleja sola en todo lo que lee la fila en vivo (mesa, candidatas, motores): nadie tiene que saber que hubo
  corrección.
- Una corrección y un `regularizar_prenda` sobre la misma fila se turnan (`for update`): si almacén regularizó primero, la
  corrección falla con `prenda_no_corregible` y la pantalla relee.
- Pruebas: `pnpm pruebas:corregir-prenda-sin-registrar` (12 casos, en el CI) y `lib/corregir-prenda-sin-registrar-reglas.test.ts`.

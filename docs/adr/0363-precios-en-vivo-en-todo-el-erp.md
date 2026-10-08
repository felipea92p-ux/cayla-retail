# ADR-0363 — Precios en vivo en todo el ERP

- **Fecha:** 2026-10-08
- **Estado:** aceptada (pedido de Felipe: «quiero que todo lo que muestre precios se actualice en tiempo real»)

## Contexto

Felipe cambió el precio de una prenda y le quitó una etiqueta de descuento desde otra pestaña; Vender siguió mostrando
lo de antes hasta recargar. Ninguna pantalla volvía a leer precios mientras seguía abierta. La base nunca cobró mal
(`registrar_venta` rechaza con `venta_precio_cambiado` / `venta_campana_no_vigente`), pero la cajera se enteraba al
cobrar, con el cliente delante.

Lo que decide un precio en pantalla son dos cosas que cambian por caminos distintos:
- el precio de etiqueta (`variantes.precio`): toda escritura del catálogo sube `fn_catalogo_version` (20260923184300);
- la campaña de hoy (`campanas_vigentes()`): poner o quitar una etiqueta, o que una campaña empiece o termine, **no**
  sube esa versión.

## Decisión

1. **`<PreciosEnVivo />`, montado una vez en `app/(app)/layout.tsx`.** Cada 10 s, al volver a la pestaña y al volver la
   red, lee la versión del catálogo y las campañas de hoy y arma una firma (`lib/precios-en-vivo-firma.ts`). Si cambió,
   hace `router.refresh()`: los Server Components releen y lo que la persona tiene en el navegador se conserva. Una
   pantalla nueva que muestre precios no tiene que hacer nada.
   - El refresco no enciende el loader (`navegacionSinEspera`): nadie lo pidió.
   - Con el foco en un campo de texto espera a que la persona salga de él.
   - Pestaña oculta o sin red: no hace nada.
2. **Vender con caja abierta relee por su cuenta** (`usePreciosEnVivo`), porque además corrige el ticket ya armado
   (`ticketConPreciosAlDia`: una línea sin descuento o con el de campaña toma el precio nuevo y se avisa; una con
   descuento a mano o de proforma no se toca y se pide quitarla y volver a agregarla). Mientras está, el refresco general
   se aparta (`registrarPreciosPropios`): rehacer ~1 MB de Vender por algo ya aplicado no se hace.
3. **Una pieza que guarda la prenda en su estado** la vuelve a leer de lo que llega del servidor. Hoy: la hoja «Nueva
   proforma» (`NuevaProformaModal`: sus filas toman la prenda del catálogo de ahora; el descuento es un %).

## Descartado

- **Supabase Realtime:** activarlo es un `alter publication` en el proyecto compartido con Dynamic (ADR-0018); queda
  como mejora si el sondeo pesa.
- **Una versión de precios en la base (migración con disparadores en etiquetas):** cambio de esquema en producción para
  ahorrar una lectura de campañas; y no vería las campañas que empiezan o terminan por fecha sin que nadie escriba.
- **Recalcular un descuento a mano sobre el precio nuevo:** es un monto que alguien decidió sobre el precio de antes;
  cambiarlo en silencio puede cobrar más de lo prometido.

## Se rompe si

- Una pantalla nueva guarda en su estado una copia de la prenda con su precio (como hacía «Nueva proforma»): el refresco
  le cambia las props, pero no lo que copió. Debe leer la prenda de las props por su `varianteId`.
- Alguien agrega una forma de cambiar precios que no pasa por las tablas del catálogo ni por `campanas_vigentes`.
- `campanas_vigentes()` pasa de 1.000 filas (corte de PostgREST, igual que al cargar Vender): la firma vería solo una parte.

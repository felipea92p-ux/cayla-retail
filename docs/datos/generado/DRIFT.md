# Diferencias — lo que la pantalla llama vs. lo que producción acepta

> ⚠️ **ARCHIVO GENERADO.** Se reescribe con `pnpm datos:comparar --md`.
> Comparadas 27 llamadas de `apps/web` contra 47 funciones del schema `retail` en producción.

---

## Roto en producción — 0

Nada. Todas las llamadas encajan con la firma real.
## Avisos — 8

- `anular_comprobante` · `apps/web/app/api/lucode/consultar-anulacion/route.ts:72` — no manda `p_motivo` (normal si tienen valor por defecto)
- `actualizar_transmision_comprobante` · `apps/web/app/api/lucode/emitir/route.ts:159` — no manda `p_entorno`, `p_motivo_rechazo` (normal si tienen valor por defecto)
- `emitir_comprobante` · `apps/web/components/ComprobantesPanel.tsx:218` — no manda `p_venta_id`, `p_items` (normal si tienen valor por defecto)
- `registrar_serie_comprobante` · `apps/web/components/ComprobantesPanel.tsx:243` — no manda `p_siguiente_numero` (normal si tienen valor por defecto)
- `crear_proforma` · `apps/web/components/ProformasPanel.tsx:99` — no manda `p_items`, `p_cliente_num_doc` (normal si tienen valor por defecto)
- `convertir_proforma_a_comprobante` · `apps/web/components/ProformasPanel.tsx:129` — no manda `p_venta_id` (normal si tienen valor por defecto)
- `registrar_venta` · `apps/web/components/PuntoDeVenta.tsx:246` — no manda `p_cliente_id` (normal si tienen valor por defecto)
- `registrar_venta` · `apps/web/components/VenderFormV2.tsx:114` — no manda `p_cliente_id` (normal si tienen valor por defecto)

## No analizadas — 5

Estas llamadas arman sus parámetros fuera de la propia llamada, así que no se
pueden revisar leyendo el texto. **No están aprobadas: están sin revisar.**

- `registrar_pago_compra` · `apps/web/components/CompraDetallePanel.tsx:64` — el objeto se arma con «...», no se puede leer entero
- `registrar_compra` · `apps/web/components/CompraFormV2.tsx:132` — el objeto se arma con «...», no se puede leer entero
- `recibir_compras` · `apps/web/components/RecepcionCompraFormV2.tsx:112` — el objeto se arma con «...», no se puede leer entero
- `recibir_lote` · `apps/web/components/RecepcionFormV2.tsx:71` — el objeto se arma con «...», no se puede leer entero
- `listar_compras` · `apps/web/lib/compras.ts:134` — el objeto se arma con «...», no se puede leer entero

## Funciones que nadie llama — 15

Existen en producción y ninguna pantalla las usa. Cada una es una de dos cosas:
una pantalla que falta construir, o una función que sobra y habría que retirar.

- `abrir_conteo`
- `aprobar_devolucion`
- `cerrar_conteo`
- `conteo_contar`
- `crear_devolucion`
- `emitir_nota`
- `listar_compras`
- `recalcular_compras`
- `recalcular_stock`
- `rechazar_devolucion`
- `recibir_compras`
- `recibir_lote`
- `registrar_compra`
- `registrar_movimiento`
- `registrar_pago_compra`

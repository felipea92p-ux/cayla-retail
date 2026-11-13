## «Por definir» en Mis compras (ADR-0660) — 2026-11-13

- [ ] **Pegar `20261113211000_mis_compras_por_definir.sql` en producción** (una parte, ANTES de publicar la web; con el OK de Felipe). Verificación en su cabecera.
- [ ] Después de pegarla: `pnpm datos:generar:produccion` (columna `orden_compra_items.precio_por_definir`, categorías nulas).
- [ ] Anotar la proforma de Miyan que quedó en espera (las dos docenas, con «Por definir» y el precio en espera).
- [ ] `/chaos` completo de la hoja «Definir» y de «Algo nuevo» con «Por definir» (hoy cubiertos por la prueba de Postgres: doble guardado con el mismo token, dos personas sobre la misma prenda —la segunda recibe «ya dice qué es»—, definir con el envío ya abierto, montos raros).
- [ ] Hoy la tienda tiene que elegir una categoría aunque no le haya llegado nada de esa línea (`despacho_diferencias.categoria_id not null`). Si pasa seguido, revisar con Felipe si el faltante de una prenda por definir puede quedar sin categoría.

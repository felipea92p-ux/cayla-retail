# Backlog · 2026-10-24 · Proveedores: lo que compré y lo que no ves

- [x] `20261024221000_proveedor_prendas_compradas_y_vendidas.sql` pegada en producción el 2026-10-24 y verificada con datos reales.
- [ ] **POR PEGAR (2026-10-24):** `20261024231000_proveedor_prendas_origen_compras_y_carga.sql` (dos orígenes: Compras / Carga inicial; Taller aparte). Una parte, solo lectura, re-pegable; reemplaza las 4 funciones de la anterior. La web nueva la necesita: la base ANTES que la web. Verificar tras pegar con datos reales (Compras debe dar 0 % de costo real casi en todos).
- [ ] Ver la ficha y la lista en el navegador con datos de producción tras publicar la web.
- [ ] `tema:auditar` (modo oscuro) y `/chaos` sin correr sobre las pantallas nuevas (solo lectura: `/chaos` se declara de solo lectura).
- [ ] Revisar a 375 px la ficha y la lista de Proveedores (solo se probó a 1440 y a ancho de tarjeta angosto).
- [ ] Felipe ajusta los umbrales de `proveedor-analisis-reglas.ts` mirando avisos reales.
- [ ] El Taller («CAYLA SAC») entra hoy al ranking y a los avisos como un proveedor más: separarlo cuando exista el tipo de proveedor (Mercadería / Servicios).
- [ ] Foto de cada prenda en la tabla «Lo que le compré».
- [ ] Costo real por compra (no el vigente de la prenda): cuando haya facturas con líneas, la evolución de precio por prenda y por marca.
- [ ] Ventas por semana desde que llegó cada prenda (la historia de ventas es corta: carga inicial del 29-sep).
- [ ] Cumplimiento de entrega y descuentos por volumen: esperan más facturas con líneas.
- [ ] Decidir si `COSTO_REAL_MIN_PCT = 50` (mitad o más de lo comprado por Compras para hablar de dinero) es el umbral que Felipe quiere.
- [ ] Marca de «Taller» en `proveedores` (hoy `fn_proveedor_es_taller` lo reconoce por el nombre «CAYLA SAC»).
- [ ] La prueba de Postgres no maneja el despacho entero hasta `fn_recepcion_entrar`: ampliarla cuando haya un helper para armar un despacho.

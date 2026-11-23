---
paths:
  - "supabase/**"
  - "apps/web/lib/**/*motor*"
  - "apps/web/lib/**/*precio*"
  - "apps/web/components/punto-de-venta/**"
  - "scripts/pruebas/motores*"
---

## Familias fuera de los motores (regla — ADR-0377, Felipe 2026-10-10)

**Lo que se vende pero no es mercadería de piso (bolsas, cajas, empaque) vive en una familia con el interruptor «Cuenta en Análisis, Frescura y el plan del
piso» APAGADO** (`familias.entra_a_motores`, Catálogo ▸ Familias). **Todo motor de decisión que cuente ventas, stock o anotadas por categoría tiene que preguntar
`retail.fn_categoria_entra_a_motores(categoria_id)`** (sin dato responde sí): hoy lo hacen el motor del piso, la demanda, el plan de campaña, Análisis, Frescura y la preparación del motor de demanda («¿ya puede recomendar?», 20261012220000)
(`pnpm pruebas:motores-familias-apagadas` es su caso por motor; uno nuevo suma el suyo). **Dinero, comprobante, Ventas, Finanzas y Resumen NO preguntan: la bolsa es una
venta real.** Las bolsas se venden desde el ticket con «+ Agregar bolsa» (`punto-de-venta/BolsaDelTicket.tsx`) y llevan stock como cualquier producto: la base no deja
vender en cero. Una línea de precio de etiqueta 0 (la bolsa de obsequio) no se declara a SUNAT (`itemsParaLucode`). **Y el precio 0 solo vale ahí,
también en la base (ADR-0384):** la regla única es `retail.fn_categoria_admite_precio_cero(categoria_id)` (sin dato: no), y la preguntan `registrar_venta`
(`venta_sin_precio`; la centinela de «Prenda sin registrar» queda fuera por su id), `revisar_producto_censo`, `crear_producto_con_variantes` y
`catalogo_actualizar_producto` (`sin_precio`); en la web, `precioValido`. Toda función nueva que venda o fije un precio de catálogo la pregunta. Un parche a una de esas cinco funciones es un
reemplazo anclado (`reemplazar_anclado`, formato que las suites de Frescura leen para deshacerlo) y se suma a sus listas `DESHACER_*`.

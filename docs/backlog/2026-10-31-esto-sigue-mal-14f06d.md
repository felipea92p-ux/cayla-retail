## ⚡ Producción · el estimado de la tela de una orden (2026-10-31) — migración `20261031194000`; rama `claude/esto-sigue-mal-14f06d`

- [x] Diagnóstico con la base de producción en solo lectura: el estimado de `fn_orden_produccion` medía contra el lote con saldo y el Forro y el Arena (lotes gastados) valían 0 (ADR-0400, act. n).
- [x] Parche anclado (`20261031194000_produccion_estimado_de_tela_consumida.sql`) y prueba `pnpm pruebas:produccion-estimado-de-tela` (15 casos) en el CI; huellas medidas: producción = `main` = `0f27ca2f…` antes, `1375b6a3…` después, camino de vuelta probado.
- [ ] **POR PEGAR en producción** (una sola parte, `lock_timeout 3s`, re-ejecutable). Después: la orden del Chaleco Cayla debe mostrar Tela Estimado 765.04, Total estimado 2,876.50 y 50.46 por prenda.
- [ ] Decidir con Felipe los S/ 34.80 «por prenda» de Ojales y botones de esa orden (¿total del trabajo o precio por prenda?). Se corrige desde «Cambiar quién» de ese paso.
- [ ] Decidir si todo servicio puede cobrarse como «Total de la orden» (hoy solo el ploteo): la base exige tarifa por prenda > 0 en los que no son hito; un total exacto pide otra migración, la hoja con el selector en Nueva orden, Cambiar quién y Agregar un paso, y un aviso cuando un paso cuesta más que la tela de toda la orden.

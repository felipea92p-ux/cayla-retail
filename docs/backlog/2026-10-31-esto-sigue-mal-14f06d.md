## ⚡ Producción · el estimado de la tela de una orden (2026-10-31) — migración `20261031194000`; rama `claude/esto-sigue-mal-14f06d`

- [x] Diagnóstico con la base de producción en solo lectura: el estimado de `fn_orden_produccion` medía contra el lote con saldo y el Forro y el Arena (lotes gastados) valían 0 (ADR-0400, act. n).
- [x] Parche anclado (`20261031194000_produccion_estimado_de_tela_consumida.sql`) y prueba `pnpm pruebas:produccion-estimado-de-tela` (15 casos) en el CI; huellas medidas: producción = `main` = `0f27ca2f…` antes, `1375b6a3…` después, camino de vuelta probado.
- [x] **En producción desde el 2026-10-31** (Felipe la pegó en el SQL Editor; el historial la anota con la hora del pegado, no con la del archivo). Comprobado: huella de `fn_orden_produccion` `0f27ca2f…` (21546) antes y `1375b6a3746b880c412c6edb19ac7a82` (22456) después, la esperada.
- [ ] Mirar en pantalla la orden del Chaleco Cayla: Tela Estimado 765.04, Total estimado 2,876.50 y 50.46 por prenda.
- [ ] Refrescar el diccionario (`pnpm datos:generar:produccion`) cuando se pueda: la función cambió de cuerpo, no de firma.
- [ ] Decidir con Felipe los S/ 34.80 «por prenda» de Ojales y botones de esa orden (¿total del trabajo o precio por prenda?). Se corrige desde «Cambiar quién» de ese paso.
- [ ] Decidir si todo servicio puede cobrarse como «Total de la orden» (hoy solo el ploteo): la base exige tarifa por prenda > 0 en los que no son hito; un total exacto pide otra migración, la hoja con el selector en Nueva orden, Cambiar quién y Agregar un paso, y un aviso cuando un paso cuesta más que la tela de toda la orden.

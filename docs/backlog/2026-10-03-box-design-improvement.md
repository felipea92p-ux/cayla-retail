# Backlog — Caja: botón de cierre y comparativa (2026-10-03)

- [ ] Cargar `hora_cierre` de AQP, TRU y LIM en Configuración ▸ Tiendas y caja (sin eso, ni la Isla ni la barra suben de nivel).
- [ ] Probar el botón a 375 px y con una cuenta real (líder e integrante).
- [ ] Comparativa vs ayer: Felipe elige diseño (A/B/C de la maqueta) → migración con `fn_comparativa_caja(sede, día)` → pantalla. Sin metas diarias: la referencia es el total de ayer.
- [ ] **Pegar `20261003230000_comparativa_de_caja_ventas_del_dia.sql` en producción** (Felipe da el OK). Sin ella, Caja usa el diseño anterior.
- [ ] Decidir quién ve la comparación (hoy: todo el que ve Caja).

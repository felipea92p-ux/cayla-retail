## 🧾 Impuestos: aviso de 250 UIT, ventas de antes del sistema y composición del IGV (2026-10-22, ADR sin número aún) — migración `20261023161000` sin pegar; rama `claude/impuestos-alerta-250-uit`

- [x] Parámetros `aviso_umbral_uit` (250, por año, se hereda), `ventas_previas_erp` (por año exacto, 0 «por confirmar») e `igv_general` / `igv_ipm` (Ley 32387: 16+2 hasta 2025, 15,5+2,5 en 2026, 15+3, 14,5+3,5, 14+4). La nota falsa del IGV se corrige con una fila nueva.
- [x] `fn_impuestos_panel` trae las ventas del año (comprobantes + lo cargado de antes), el aviso en soles y si se alcanzó o se cruzó; `guardar_parametro_tributario` valida los dos nombres nuevos.
- [x] Web: frase única en `avisoUmbral` (Impuestos ▸ límite, «Antes de declarar», Resumen ▸ Para decidir hoy), columna «Aviso (UIT)» y bloque «Ventas de antes del sistema» en Configuración, guía de Configuración al día.
- [x] Pruebas: `pnpm pruebas:impuestos` (121), vitest completo (586 archivos), 8 mutaciones del SQL atrapadas; `no_deducible.mjs` adaptado a re-pegar su migración sobre esta.
- [ ] **Falta pegar el SQL en producción** (dos partes, en orden; reservar antes la versión con `pnpm reservar migracion` y renombrar el archivo y el ADR).
- [ ] **Sin probar en el navegador:** las pantallas de Impuestos, Resumen y Configuración con la base nueva (a 1440 y 375 px, claro y oscuro) y `pnpm --filter web guias:recorrer` de la guía de Configuración.
- [ ] **Decisión de Felipe:** pasar la tarjeta de 300 UIT (12 meses móviles, sin lo de antes del sistema) al año calendario; de dónde sale lo vendido de enero a agosto de 2026; si el aviso cuenta ventas sin boleta ni factura.
- [ ] Cuando se tenga el dato: cargar `ventas_previas_erp` de 2026 en Configuración ▸ Impuestos (y ponerlo en 0 si algún día esas ventas se cargan como comprobantes).
- [ ] Tras pegar en producción: refrescar el diccionario (`pnpm datos:generar:produccion`).


## 📌 Empresas aliadas (ADR-0683, Felipe 2026-11-21) — rama `claude/multi-empresa-rus-tienda-c7129a`, 8 actividades aprobadas

- [x] **1 · Crear, editar y dar de baja una aliada desde Configuración.** Migración `20261121152000` (solo local, NO en producción: va con las de 2 a 7), `pnpm pruebas:empresas-aliadas` 35/35, la hoja con guía de foco, la guía interactiva y su huella, el cron `/api/empresas/bajas` (3:50 de Lima).
- [x] **2 · El Balance y el Diario con cualquier aliada** (migración `20261121160000`, `pnpm pruebas:aliadas-balance` 11/11). Lo de abajo era el diagnóstico: Hoy `fn_asientos_claure`, `fn_claure_ventas` y `fn_movimiento_es_de_claure` miran `clave = 'claure'`, y `fn_bal_stock` ya resta a cualquier dueña: con una segunda aliada, la 201 deja de cuadrar. Además, la regla «¿es de una aliada?» no debe preguntar `activo` (hoy `fn_item_es_de_claure` lo hace): al dar de baja, su pasado volvería a ser de CAYLA. Y los traslados que llegan desde una sede sin dos empresas quedan como de CAYLA (`fn_dueno_de_una_entrada`).
- [ ] **Sin verificar en la base completa del CI:** `pruebas:finanzas-alcance` y `pruebas:redondeo-efectivo` fallan en la copia local con y sin la actividad 2 (le faltan migraciones). Mirar el CI del PR.
- [x] **3 · La cuenta con cada dueña** (migración `20261121162000`, `pnpm pruebas:aliadas-cuenta` 12/12, pestaña por aliada y cierre con cada una). Lo de abajo era el diagnóstico.
- [ ] **Borrar las `fn_claure_*` de la cuenta** cuando la web nueva esté publicada (quedan sin uso; sus pruebas y `_deshacer_claure.mjs` también).
- [x] ~~**«De eso, S/ X es de Claudia»** en Dónde está y **«de eso, CLAURE»** en Impuestos siguen leyendo solo a CLAURE~~: hecho en la actividad 6.
- [ ] **Ver en el navegador** la pestaña de una segunda aliada y el cierre con dos: necesita la base local al día con `main` (orden de Felipe, `/actualizar-flujo`).
- [ ] ~~3 · La cuenta con cada dueña~~ (`fn_claure_*`, `pago_claure` sin empresa, `caja_traslados` «claudia», la pestaña CLAURE de Cuentas y dinero). La baja debe exigir su saldo en cero.
- [x] **4 · Vender con cualquier aliada** (migración `20261121164000`, `pnpm pruebas:aliadas-cobro` 11/11): «¿A qué número pagó?» en la hoja de cobro, con la cuenta de la dueña propuesta; la transferencia entra a la cuenta bancaria de una aliada. Visto en el navegador a 375 px con CLAURE en Lima (la función de números se creó y se quitó en la base local solo para mirarlo).
- [ ] **Un ticket de dos empresas pagado TODO por Yape a dos números** se corrige con «Corregir pagos» (la hoja tiene una línea por medio). Si pasa seguido, partir la línea.
- [ ] **La venta sin conexión** llega sin `x-cuentas-pagos` y se sella en CAYLA: guardar la elección en la cola si Lima lo necesita.
- [x] **5 · Campañas y gastos por aliada** (migración `20261121171000`, `pnpm pruebas:aliadas-campanas-gastos` 17/17): interruptor «Entra a las campañas de CAYLA» por aliada (nace apagado), «Reparto con <aliada>» en Configuración ▸ Gastos. Probado contra una base con TODAS las migraciones (igual que el CI, `supabase_db_ensayo-aliadas-ci`): las 96 pruebas de base de Finanzas, Caja, CLAURE, ofertas y campañas pasan; `campana-reglas` y `ofertas-por-variante` necesitaron el deshacer de las aliadas antes de volver a pegar sus migraciones.
- [ ] **El nombre `deClaure`** de las prendas de una campaña ya significa «de una aliada que entra»: renombrarlo con la actividad 7.
- [ ] **Sumarle una tienda a una aliada** no revisa que el reparto de gastos de esa tienda siga bajo 100 %.
- [x] **6 · Las cifras de CAYLA sin aliadas** (migración `20261121173000`, `pnpm pruebas:aliadas-cifras` 9/9): la regla de línea y sus seis usuarios, lo vendido en un período, lo de hoy del Inicio y «De eso es de …» en Dónde está valen para cualquier aliada, activa o dada de baja.
- [ ] **Con varias aliadas, algunos textos quedan en singular** («Lo que las empresas aliadas vendió»): se arma con el texto de CLAURE cambiando dos palabras.
- [ ] **7 · Filtros por empresa en toda tienda con más de una** y quitar «CLAURE» escrito a mano (valor del inventario, reportes, colores, la casa por `clave === "cayla"`).
- [ ] **8 · Producción y PR:** `/milimetro auditar /configuracion`, `/formidable`, `/chaos` sobre la hoja; Felipe pega las migraciones en orden; `pnpm datos:generar:produccion`.
- [ ] **En producción, CLAURE no tiene RUC ni régimen:** su tarjeta dirá «Sin RUC» hasta que el Admin la edite.
- [ ] **Contador:** que un Nuevo RUS opere en un solo local (hoy es un candado de la base); el contrato y lo que CAYLA les cobra a las aliadas.

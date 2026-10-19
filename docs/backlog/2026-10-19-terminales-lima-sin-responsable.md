## Terminales de Lima sin responsable (ADR-0454, temporal)
- **No está en producción:** pegar en orden `20261019185000` (el mecanismo; no cambia nada solo) y `20261019190000` (lo activa en Caja Lima y Almacén Lima a nombre de Felipe). Con el OK de Felipe. Después de pegar: recargar las terminales de Lima y probar un ajuste, una bajada al piso y un cierre de caja.
- **Por probar con la terminal real:** solo se probó la base (22 casos, `pnpm pruebas:terminal-sin-responsable`) y las reglas de la web. Falta ver las pantallas con la cuenta de Caja Lima y Almacén Lima (no hay cuenta de terminal de Lima en el seed local).
- **Costo conocido — regularizar en Lima:** firma Felipe en la venta y en la regularización → la base lo rechaza por «es tu propia venta». Decidir con Felipe: hacerlo con una cuenta de persona, o una excepción a la regla (es de Felipe: dinero/control).
- **Costo conocido — metas:** las ventas de Lima no llevan asesora mientras dure (el «¿Quién está atendiendo?» no se rellena con el respaldo).
- **Para volver (cuando Lima se integre con Dynamic):** `update retail.terminales set firma_respaldo_id = null where firma_respaldo_id is not null;` y decidir qué hacer con las filas firmadas «Felipe» por el aparato.
- **Quizá:** mostrar en Colaboradores ▸ Terminales cuáles tienen firma de respaldo (hoy solo se ve en la base).
- **Pendiente tras pegar:** `pnpm datos:generar:produccion` (columna nueva en `terminales`).

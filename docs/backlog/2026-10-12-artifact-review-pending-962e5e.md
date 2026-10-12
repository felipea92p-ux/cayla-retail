## Victorias rápidas de la revisión del 11-oct (2026-10-12)
- [x] Pago de Producción: el token se mira después del `for update` (`20261012214000`). Prueba con dos conexiones y COMMIT:
  `BASE_DESECHABLE=1 pnpm pruebas:pago-produccion-concurrencia -- --base <copia>` (rojo sin la migración, verde con ella); en el CI,
  `pruebas:produccion-punta-a-punta` vigila la forma.
- [x] Baja ante SUNAT: líder, nota vigente y baja en trámite se revisan antes de Lucode (`app/api/lucode/anular/route.ts`,
  `lib/anular-comprobante-reglas.ts` con su prueba).
- [x] La familia del padre baja a sus subcategorías (`20261012215000`, disparador `categorias_familia_a_las_hijas`); casos en
  `pruebas:categorias-candados`.
- [x] `fn_motor_demanda_preparacion` ignora las familias apagadas (`20261012220000`); caso E1 en `pruebas:motores-familias-apagadas`.
- [x] Borrada `fn_historial_producto_cambios`, sin uso (`20261012213000`).
- [ ] **Pegar en producción, con el OK de Felipe:** `20261012213000`, `20261012214000`, `20261012215000` y `20261012220000`. Cada una
  es una sola parte, sin políticas. Antes de la 215000, correr la consulta de solo lectura de su encabezado (cuántas hijas quedan
  desalineadas). Después: refrescar el volcado y `docs/datos/generado`.
- [ ] **`pruebas:motores-familias-apagadas` M1 y M2 fallan en `main`** (no es de este cambio): en el plan de campaña, `vendido` del
  polo sale 0 dentro de la campaña. Lo más probable es que venga de las migraciones del plan de campaña del 2026-10-12 (161000–164000).

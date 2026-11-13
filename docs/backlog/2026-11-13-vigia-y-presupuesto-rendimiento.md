## 📈 La lentitud se mide sola (2026-11-13, ADR-0656) — migración `20261113194000` + web + CI; rama `claude/vigia-y-presupuesto-rendimiento`

- [x] Vigía de rendimiento: `rendimiento_corridas`, `rendimiento_fotos`, `rendimiento_estado`, `fn_foto_rendimiento()` (diferencias consulta por consulta, nunca reinicia, cuenta entero tras un reinicio) y `fn_rendimiento_antes_despues()`. Probado en Postgres local (`pnpm pruebas:vigia-rendimiento`, 23 casos).
- [x] Cron horario `/api/salud/rendimiento` (a los 7 minutos), en `vercel.json` y `RUTAS_DE_CRON`, con su prueba de ruta.
- [x] Presupuesto de bloques en el CI: `scripts/rendimiento/presupuesto.mjs` + `presupuesto-volumen.sql` + `presupuesto.json`, en `PRUEBAS` (`pnpm pruebas:presupuesto-rendimiento`); se acepta con `pnpm rendimiento:aceptar`.
- [ ] **Pegar en producción** (Felipe): antes, `select pg_has_role('postgres', 'pg_read_all_stats', 'member');` → `true`; después la migración entera en una parte, y `select retail.fn_foto_rendimiento();` para la primera foto. Ver «Cómo se pega» en el ADR-0656.
- [ ] Refrescar el diccionario (`pnpm datos:generar:produccion`) cuando esté pegada: tres tablas nuevas.
- [ ] Aceptar el presupuesto desde la primera corrida verde del CI (`pnpm rendimiento:aceptar -- --desde-ci <id>`): el de este PR salió de la base local, que lee más.
- [ ] La lente del Observatorio: «se volvió lenta» (lo que más subió en 24 h contra la semana) y «el vigía no corre» (más de 2 h sin foto). Con `/milimetro` y las demás reglas de interfaz.
- [ ] Compactar las fotos de más de 90 días cuando el vigía cumpla un año (~1.000 filas al día).

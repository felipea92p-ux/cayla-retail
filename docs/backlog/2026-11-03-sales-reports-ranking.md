## Ventas ▸ Reportes (2026-11-03, ADR-0606)

Hecho y probado en local; **no está en producción**.

- [ ] **Pegar en producción las cinco migraciones** `20261103224000` (módulo), `…230000` (mes), `…232000` (series), `…233000` (cortes) y `…235000` (ranking), en ese orden. Necesita el OK de Felipe. Cada una es un `create or replace function` y permisos, o un `insert` en `modulos`: ninguna altera una tabla en uso ni crea políticas.
- [ ] **Darle el módulo a un rol.** Nace solo para el líder; el líder lo asigna desde Colaboradores ▸ Roles y accesos.
- [ ] **Refrescar el diccionario de datos** después de pegar (`pnpm datos:generar:produccion`): no se creó ninguna tabla, solo funciones y una fila de `modulos`.
- [ ] **Rendimiento** (decisión de Felipe, aparte): retirarlo del menú conservando las reglas de metas, o dejarlo. Hoy se siente que «estorba».
- [ ] **`/formidable`** con 3 a 5 colaboradoras o encargadas reales y una pasada de `/chaos` (las pantallas solo leen; el ataque que vale es URL ajena y permisos).
- [ ] **Vs el año pasado** en Ventas del mes, cuando exista ese mes (el ERP vende desde 2026-09-30).
- [ ] **Ventas de la tienda web** en los reportes, cuando entren a `retail.ventas`.
- [ ] **Más de 1.000 filas en la descarga del ranking:** hoy se niega y pide un filtro; si estorba, se revisa el tope.

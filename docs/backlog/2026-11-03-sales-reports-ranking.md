## Ventas ▸ Reportes (2026-11-03, ADR-0606)

Hecho y probado en local; **las 5 migraciones se pegaron en producción el 2026-11-03** (OK de Felipe) y se verificaron. El PR #1623 espera su fusión.

- [ ] **Darle el módulo a un rol.** Nace solo para el líder; el líder lo asigna desde Colaboradores ▸ Roles y accesos.
- [ ] **Refrescar el diccionario de datos** (`pnpm datos:generar:produccion`): no se creó ninguna tabla, solo 4 funciones y una fila de `modulos`.
- [ ] **Rendimiento** (decisión de Felipe, aparte): retirarlo del menú conservando las reglas de metas, o dejarlo. Hoy se siente que «estorba».
- [ ] **`/formidable`** con 3 a 5 colaboradoras o encargadas reales y una pasada de `/chaos` (las pantallas solo leen; el ataque que vale es URL ajena y permisos).
- [ ] **Vs el año pasado** en Ventas del mes, cuando exista ese mes (el ERP vende desde 2026-09-30).
- [ ] **Ventas de la tienda web** en los reportes, cuando entren a `retail.ventas`.
- [ ] **Más de 1.000 filas en la descarga del ranking:** hoy se niega y pide un filtro; si estorba, se revisa el tope.

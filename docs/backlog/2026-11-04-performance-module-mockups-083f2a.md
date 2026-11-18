# 2026-11-04 — Rendimiento con superpoderes

**Estado:** construido y probado en local. Rama `claude/performance-module-mockups-083f2a`, sin PR. ADR-0610.

- [x] Cuatro rondas de maquetas; Felipe eligió `docs/maquetas/rendimiento-superpoderes-2026-11/`
- [x] Las 9 actividades construidas, cada una con su commit
- [x] **Pegada en producción el 2026-11-05:** `supabase/migrations/20261104213000_rendimiento_persona_por_dia.sql` (lo pegado coincidió con el archivo por SHA-256; existe, `security definer`, `authenticated` puede y `anon` no). No se pudo ejecutar con una sesión de líder: la primera lectura real será la de la pantalla.
- [ ] Probar con ventas de un mes más avanzado: el 4 de noviembre el gráfico muestra pocos días; la lógica de fin de mes está en las pruebas
- [x] `/formidable` y sus 3 cambios: leyes 7.3, oficio 5 (`docs/formidable/rendimiento.md`)
- [ ] Al abrir una fila desde la tabla, su panel queda fuera de la vista; al cancelar, la pantalla salta
- [ ] Decidir si la meta debe bajar sola con una ausencia aprobada: hoy cambiarla a mano multiplica todos los días del mes
- [x] `/chaos`, semilla 20261104: 2 hallazgos, arreglados y atacados de nuevo; sin violaciones nuevas
- [ ] Pasada de `/formidable` con encargadas reales
- [ ] Contarle a Dany: el tablero decía que aquí solo cambiaba el material
- [ ] Refrescar el diccionario (`pnpm datos:generar:produccion`) cuando la migración esté en producción
- [ ] Más adelante: selector de mes (ver el mes pasado entero), si hace falta

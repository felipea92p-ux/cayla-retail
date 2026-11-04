# 2026-11-04 — Rendimiento con superpoderes

**Estado:** construido y probado en local. Rama `claude/performance-module-mockups-083f2a`, sin PR. ADR-0610.

- [x] Cuatro rondas de maquetas; Felipe eligió `docs/maquetas/rendimiento-superpoderes-2026-11/`
- [x] Las 9 actividades construidas, cada una con su commit
- [ ] **Antes de publicar:** pegar `supabase/migrations/20261104213000_rendimiento_persona_por_dia.sql` en producción, de una sola vez (no toma tablas). La web no va antes
- [ ] Probar con ventas de un mes más avanzado: el 4 de noviembre el gráfico muestra pocos días; la lógica de fin de mes está en las pruebas
- [ ] Correr `/chaos` y `/formidable` completos; se atacó a mano, pero no es la corrida del catálogo
- [ ] Contarle a Dany: el tablero decía que aquí solo cambiaba el material
- [ ] Refrescar el diccionario (`pnpm datos:generar:produccion`) cuando la migración esté en producción
- [ ] Más adelante: selector de mes (ver el mes pasado entero), si hace falta

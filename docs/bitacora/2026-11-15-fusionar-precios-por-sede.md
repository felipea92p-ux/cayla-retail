# 2026-11-15 · Fusionar: cada sede conserva su precio (ADR-0650, act. 2026-11-15)

- **Qué:** al fusionar, el precio propio de cada sede viaja a la ficha que queda (de fábrica) o se junta en uno; una terminal también elige. Migración
  `20261115153000`, `PreciosPorSede.tsx`, `preciosSedeParaLaBase` y su guía.
- **Verificado:** `tsc` limpio y 269 pruebas de la web (reglas, guías, unificar). **No verificado:** la migración contra Postgres (sin Docker en el entorno
  y el servidor de Supabase no recibió la confirmación del ensayo) ni la hoja en el navegador.
- **Riesgo:** ninguno en producción hasta pegar la migración; la web nueva funciona con la base de antes (no manda las claves si no hay sedes).

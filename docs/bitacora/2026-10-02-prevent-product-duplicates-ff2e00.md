# 2026-10-02 · prevent-product-duplicates-ff2e00

- Fases 2b y 2c de ADR-0294 escritas en `20261002120100_nombre_unico_por_marca_y_carrera_entre_sedes.sql`: nombre único por marca (índice `(marca_id, clave)` NULLS NOT DISTINCT), carrera entre sedes con `nombre_duplicado` + id del ganador, y `buscar_productos_parecidos` con marca opcional. **Sin pegar en producción.**
- Web: `useParecidos({ marcaId })` en Nuevo y Editar producto para frenar lo mismo que la base; el error del índice nuevo tiene su frase. `tsc` 0, vitest completo verde.
- Probado en un Postgres desechable con funciones esqueleto (anclas verificadas contra producción); falta ensayo con `begin; …; rollback;` en producción y una alta real.

## Memoria y carga de la base de producción (2026-11-09)

Contexto: instancia Small (2 GB, 2 núcleos) compartida con Dynamic. El pico de las 09:07 de Lima lo hizo Finanzas ▸ Resumen; la
provisión de planilla ya se lee una vez por mes y por carga (`lib/planilla-provision.ts`). Lo que sigue:

- [ ] **`fn_resumen_finanzas`**: una corrida desde el SQL Editor tardó 53 s recorriendo ~6,4 millones de páginas, y por el API se corta a
      los 8 s en horas de carga. Es SQL de producción: diagnosticar con `explain` y proponer a Felipe antes de tocarla.
- [ ] **Resumen lanza ~12 lecturas pesadas a la vez** (`app/(app)/finanzas/resumen/page.tsx`): escalonarlas o guardar el estado de
      resultados del mes de comparación, que ya está cerrado. Medir primero cuánto pesa cada una ahora que la provisión no se repite.
- [x] **Catálogo completo (`leerCatalogo`, `lib/catalogo-v2.ts`)** — hecho el 2026-11-09 (rama `claude/catalogo-copia-por-partes-cb64df`): la copia
      pesaba ~2,8 MB y no entraba en la caché de Vercel (tope 2 MB), así que cada visita lo leía en vivo. Ahora se guarda por páginas de 1.000
      y cada página se pide después del último id. Queda medir en producción, una semana después, cuántas lecturas del catálogo hay por día.
- [ ] **Decide Felipe:** subir la máquina de Small a Medium (4 GB) y bajar el pool de PostgREST (~31 conexiones abiertas por días).

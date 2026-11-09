## Memoria y carga de la base de producción (2026-11-09)

Contexto: instancia Small (2 GB, 2 núcleos) compartida con Dynamic. El pico de las 09:07 de Lima lo hizo Finanzas ▸ Resumen; la
provisión de planilla ya se lee una vez por mes y por carga (`lib/planilla-provision.ts`). Lo que sigue:

- [ ] **`fn_resumen_finanzas`**: una corrida desde el SQL Editor tardó 53 s recorriendo ~6,4 millones de páginas, y por el API se corta a
      los 8 s en horas de carga. Es SQL de producción: diagnosticar con `explain` y proponer a Felipe antes de tocarla.
- [ ] **Resumen lanza ~12 lecturas pesadas a la vez** (`app/(app)/finanzas/resumen/page.tsx`): escalonarlas o guardar el estado de
      resultados del mes de comparación, que ya está cerrado. Medir primero cuánto pesa cada una ahora que la provisión no se repite.
- [ ] **Catálogo completo (`leerCatalogo`, `lib/catalogo-v2.ts`)**: ordena por `sku` (vacío en casi todas) antes de cortar cada página de
      1.000, así que cada página arma las 3.676 variantes con sus fotos y códigos y escribe ~2 MB a disco. Desde el 6-nov sumaban
      ~34 GB de archivos temporales. Ordenar solo por `id`. Además, la copia guardada falla mucho más de lo que debería: se leyó ~2.150
      veces en 3 días con la versión del catálogo quieta. Investigar si la llave con el commit (cada publicación y cada preview) es la causa.
- [ ] **Decide Felipe:** subir la máquina de Small a Medium (4 GB) y bajar el pool de PostgREST (~31 conexiones abiertas por días).

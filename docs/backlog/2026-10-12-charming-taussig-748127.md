## 🧹 Cuatro afirmaciones viejas corregidas en documentos y comentarios (2026-10-12, ADR-0161 act.) — solo texto, sin migración; rama `claude/charming-taussig-748127`

- [x] **Nextail:** la fila de `docs/investigacion/2026-10-05-algoritmo-de-inventario.md` y el comentario de `lib/demanda-reglas.ts` ya dicen que las 200 unidades al año son el umbral de las curvas de talla (fuente: página oficial de Nextail, leída el 2026-10-12).
- [x] **`docs/pantallas/inventario-bajar.md` y `traslados.md`:** cifras de producción al 2026-10-12 con nota «Corrección de cifras» al final; el SHA analizado no se tocó.
- [x] **`lib/plan-piso-colores.ts`:** la cabecera ya no dice que Estampado y Multicolor no tienen hex.
- [x] **ADR-0161 «Actualización 2026-10-12» y comentario de `SIEMPRE_SOLO_LIDER`** (`lib/modulos.ts`): el costo y `fn_resumen_variantes.en_red` siguen cerrados al líder; el stock de otras sedes, no. Verificado en las funciones vivas de producción y en `lib/inventario-v2.ts`.
- [ ] **Decisión de Felipe:** reescribir en `SIEMPRE_SOLO_LIDER` el texto «Ver el costo y el stock de las otras sedes en Existencias» (se muestra en Roles y accesos). No se tocó porque cambia lo que ve el equipo.
- [ ] **Volver a puntuar con `/pantalla`:** `inventario-bajar` (la *Frecuencia* y la tarea #6 se apoyaban en «3 bajadas») y `traslados` (la pantalla ya está marcada como vencida, ADR-0355).
- [ ] **Corregir `docs/backlog/2026-09-29-frescura-registro-discipline-signal-0cd4b5.md:26`:** dice «hoy Trujillo tiene 3 bajadas en toda su historia»; el backlog `2026-09-29-capacity-suggestion-formula-f54521.md` del mismo día ya decía 23 bajadas desde el 26-sep. Fuera de los cuatro puntos de esta rama.
- [ ] **Traslado n.º 4 (Taller → AQP) en tránsito desde el 2026-09-17, sin líneas:** decidir si se anula. Dato de producción, no se tocó.

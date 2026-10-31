## 🧵 Producción · Agregar un paso que se olvidó y reabrir pasos (2026-10-30, ADR-0586) — rama `claude/button-steps-comments-4e6091`

- [x] Actividad 1, base: `agregar_paso_tarde` (solo el líder, motivo y día; entra ya hecho: «Terminé» en el Taller, salida y vuelta afuera; `produccion_cambios.accion = 'paso_tarde'`). Da por hecho solo lo que el paso siguiente ya usó (revisión independiente del 2026-10-30: la primera versión daba por hecho todo lo del paso anterior). Prueba `pnpm pruebas:produccion-paso-tarde` 22/22; las vecinas (agregar y quitar paso, catálogo, «Terminé» con falla, tela al cortar, correcciones) siguen en verde.
- [x] Actividad 1, web: la hoja «Agregar un paso» ofrece al líder «entra ya hecho» con su aviso, día y motivo; chip «Agregado tarde» y entrada en la historia; quien no es líder lo ve apagado. Guía interactiva (2 pasos) y huella aceptada.
- [ ] **Pegar `20261031002000` en producción** (una parte; amplía dos CHECK de `produccion_cambios` y crea la función) ANTES de publicar la web. Después, la orden del Short: «+ Agregar un paso» ▸ Ojales y botones ▸ afuera con su proveedor.
- [ ] **No verificado en el navegador:** la base local compartida está atrasada (llega a `20261023190000`). Se probó en una copia (`prueba_paso_tarde`, en el mismo contenedor) con las migraciones que faltaban.
- [x] Hallazgo aparte (preexistente, ADR-0566): `agregar_paso_orden` no miraba `produccion_fallas` al decidir si un paso de después empezó. Arreglado en `20261031031000` (caso R5b de `pnpm pruebas:produccion-agregar-paso`, 25/25).
- [ ] **Pegar `20261031031000` en producción** (una parte; solo `create or replace` de `agregar_paso_orden`). Va después de `20261029051000`; no depende de `20261031002000`.
- [ ] Actividad 2: desmarcar Ploteo, solo el líder y con motivo.
- [ ] Actividad 3: «Corregir lo anotado» a un toque desde el paso (sigue para quien opera; confirmar con Felipe).
- [ ] Actividad 4: prendas que vuelven a arreglo (bajan en ese paso y en los de después; «¿cobra este arreglo?» se decide cada vez).
- [ ] Actividad 5: anotar más de lo planeado en el primer paso, sin tope para el líder y con motivo.

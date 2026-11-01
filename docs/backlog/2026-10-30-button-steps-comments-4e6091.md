## 🧵 Producción · Agregar un paso que se olvidó y reabrir pasos (2026-10-30, ADR-0586) — rama `claude/button-steps-comments-4e6091`

- [x] Actividad 1, base: `agregar_paso_tarde` (solo el líder, motivo y día; entra ya hecho: «Terminé» en el Taller, salida y vuelta afuera; `produccion_cambios.accion = 'paso_tarde'`). Da por hecho solo lo que el paso siguiente ya usó (revisión independiente del 2026-10-30: la primera versión daba por hecho todo lo del paso anterior). Prueba `pnpm pruebas:produccion-paso-tarde` 22/22; las vecinas (agregar y quitar paso, catálogo, «Terminé» con falla, tela al cortar, correcciones) siguen en verde.
- [x] Actividad 1, web: la hoja «Agregar un paso» ofrece al líder «entra ya hecho» con su aviso, día y motivo; chip «Agregado tarde» y entrada en la historia; quien no es líder lo ve apagado. Guía interactiva (2 pasos) y huella aceptada.
- [x] **`20261031002000` ya está en producción** (comprobado el 2026-10-31: misma huella de `agregar_paso_tarde` que en local; los CHECK ya aceptan `paso_tarde`). Después, la orden del Short: «+ Agregar un paso» ▸ Ojales y botones ▸ afuera con su proveedor.
- [ ] **No verificado en el navegador:** la base local compartida está atrasada (llega a `20261023190000`). Se probó en una copia (`prueba_paso_tarde`, en el mismo contenedor) con las migraciones que faltaban.
- [x] Hallazgo aparte (preexistente, ADR-0566): `agregar_paso_orden` no miraba `produccion_fallas` al decidir si un paso de después empezó. Arreglado en `20261031031000` como reemplazo anclado (casos R5b y R5c de `pnpm pruebas:produccion-agregar-paso`, 26/26).
- [x] **`20261031031000` pegada en producción** (2026-10-31; misma huella de `agregar_paso_orden` que en local, con el candado «proceso apagado» y las fallas).
- [x] Actividad 2: quitar la marca de Ploteo, solo el líder y con motivo (2026-10-31; base `20261031160000` + web; `produccion_ploteo` L1–L4, `produccion_correcciones` S4). Restaurar también es del líder; volver a marcar sigue abierto; se quita aunque Corte haya empezado.
- [x] Pegar `20261031160000` en producción (2026-10-31, verificada: las dos funciones con `marca_solo_lider`, `deshacer_marca_fase` borrada, permisos intactos).
- [ ] Refrescar el volcado (`docs/datos/generado/COMO-REFRESCAR.md`): `funciones-produccion.txt` y `DRIFT.md` todavía nombran `deshacer_marca_fase`.
- [ ] Para el día que haya una tablet en el Taller (hoy no puede existir): sumar al candado de la marca la regla «terminal sin firma de respaldo + líder de turno en Responsable» (ADR-0586, act. 2, punto 5).
- [ ] Decisión de Felipe al verlo: «Quitar la marca» y «Quitar este paso» del paso abierto son enlaces; la tabla de piezas pide `btn-peligro` para «quitar» (la firma de `lib/unificar.test.ts` no mira «Quit»). Lo decide `/unificar`.
- [ ] Actividad 3: «Corregir lo anotado» a un toque desde el paso (sigue para quien opera; confirmar con Felipe).
- [ ] Actividad 4: prendas que vuelven a arreglo (bajan en ese paso y en los de después; «¿cobra este arreglo?» se decide cada vez).
- [ ] Actividad 5: anotar más de lo planeado en el primer paso, sin tope para el líder y con motivo.

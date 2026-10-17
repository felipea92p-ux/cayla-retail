## 👗 «Arma el tuyo» — el probador de looks de la tienda online (2026-10-16, ADR-0434) — rama `claude/tienda-arma-el-tuyo`

PR 1 (ERP, actividades 1 a 3), #1151. Las tres migraciones están **en producción** desde el 2026-10-16 (con el OK de Felipe; verificado contra la base: 14 típicos sin VES/FAL/CON/ENT, `recorte_foto` en la lista, las 6 funciones).

- [x] Actividad 1: `retail.foto_recortes` (20261017003000) y Vitrina ▸ Probador con «Preparar recortes» y «Revisar». Probado en un banco local con 10 fotos reales: 10 recortes en ~25 s, 4 por revisar con su motivo real (fondo no blanco, huecos), usar y descartar en la Actividad, modo oscuro, demo sin guardar.
- [x] Actividad 2: cada foto nueva sube su recorte sola (`recortarAlSubir` desde `subirFotoProducto`), sin el combo: `recorte_foto` en `acciones_sin_responsable` (20261017013000; Felipe 2026-10-16). Probado subiendo una foto en Editar producto.
- [x] Actividad 3: `vitrina_productos.largo_cm`, `retail.vitrina_largos_tipicos` (sin típico para VES, CON, ENT, FAL) y la lista viva (20261017015000). Probado anotando un largo y poniendo y quitando un típico.
- [x] `pnpm pruebas:vitrina-probador`: 35 de 35 en el banco; `vitrina-web` 78/78, `vitrina-looks` 68/68, `responsable-omitido` 18/18 y `roles-cobertura` 32/32 contra el banco con todas las migraciones.
- [x] **Pegadas en producción** el 2026-10-16, en orden: `20261017003000_foto_recortes.sql`, `20261017013000_recorte_foto_sin_responsable.sql`, `20261017015000_vitrina_largos_del_probador.sql`.
- [ ] Después de pegar: una persona aprieta «Preparar recortes» en Vitrina ▸ Probador (unos 15 min para las 463 fotos) y revisa las dudosas (con gancho o fondo colado: descartar).
- [ ] Anotar el largo de vestidos, faldas, conjuntos y enterizos (56 prendas el 16-oct): sin él no entran al probador.
- [ ] `/formidable` y `/chaos` de Vitrina ▸ Probador (pendientes en sus tableros): hoy solo se probó a mano el doble clic, la pausa por fallas y los rechazos de la base.
- [ ] La demo con `?demo=1` no arranca en `next dev` (también las guías que ya existían): tarea aparte. La guía se recorrió abriéndola con el evento del botón «Demo».
- [ ] Actividades 4 a 10 (la tienda): PR 2 y PR 3.

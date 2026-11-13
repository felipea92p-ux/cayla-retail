# Backlog — «Catálogo con IA» (rama `claude/photoroom-retail-integration-0e131e`, ADR-0659)

## Para que se vea en producción
- [ ] **Felipe:** poner `OPENAI_API_KEY` en Vercel (producción). Sin ella la opción no se dibuja. Opcional: `OPENAI_IMAGEN_MODELO`.
- [ ] Poner un tope de gasto mensual en la cuenta de OpenAI (platform.openai.com ▸ Limits): el freno de 12/min por persona no limita el mes.

## Lo que no se cubrió
- [x] `/formidable` en Editar y Nuevo producto (2026-11-13: 3 cambios hechos; la ciega no se repitió).
- [ ] `/chaos`, 3 de gravedad 4 abiertos (esperan el OK de Felipe): el foco no vuelve al botón al cerrar la hoja de ángulos; `/api/fotos/catalogo` no rechaza un archivo que no es imagen antes de llamar a OpenAI; el aviso de Nuevo no nombra el color.
- [ ] Recibir ▸ «Crear la prenda que llegó» con una cuenta que recibe pero no edita el catálogo: debe crearse sin la sección de fotos (sin probar en el navegador).
- [ ] Recibir ▸ «Sumar tallas o colores» a una prenda que ya existe: hoy no pide la foto del color nuevo.
- [x] Guardar o salir mientras una foto se prepara: ahora pregunta y espera (2026-11-13, /formidable).
- [ ] Permisos con otra cuenta sin Productos y un teléfono real (no cubierto por /chaos).
- [ ] Guía de Editar producto: el paso «Revisar y guardar» (`barra-guardar`) mide 0 de alto sin cambios y el recorredor lo da por roto. No lo tocó esta rama; ver si falla igual en `main`.
- [ ] «Agregar colores» (`AgregarColoresModal`) no usa la opción: sus fotos se suben tal cual.
- [ ] Las fotos que ya están en el catálogo: hoy solo se pasan a IA eligiéndolas de nuevo. Una acción «Pasar a catálogo» sobre una foto ya subida evitaría volver a buscar el archivo.

## Para después (maquetadas, sin decidir)
- [ ] Forma B: toda la prenda de una vez (todos los colores en una hoja).
- [ ] Forma C: la bandeja del día para preparar varias prendas.

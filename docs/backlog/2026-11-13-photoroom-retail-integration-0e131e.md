# Backlog — «Catálogo con IA» (rama `claude/photoroom-retail-integration-0e131e`, ADR-0659)

## Para que se vea en producción
- [ ] **Felipe:** poner `OPENAI_API_KEY` en Vercel (producción). Sin ella la opción no se dibuja. Opcional: `OPENAI_IMAGEN_MODELO`.
- [ ] Poner un tope de gasto mensual en la cuenta de OpenAI (platform.openai.com ▸ Limits): el freno de 12/min por persona no limita el mes.

## Lo que no se cubrió
- [ ] `/formidable` en Editar y Nuevo producto con la opción encendida.
- [ ] `/chaos`: guardar la ficha mientras una foto se prepara (llega después como cambio sin guardar) y salir de la pantalla a mitad (se pierde sin aviso: ¿avisar con `useSalidaSinGuardar`?). Permisos con otra cuenta sin Productos. Probar en un teléfono real.
- [ ] Guía de Editar producto: el paso «Revisar y guardar» (`barra-guardar`) mide 0 de alto sin cambios y el recorredor lo da por roto. No lo tocó esta rama; ver si falla igual en `main`.
- [ ] «Agregar colores» (`AgregarColoresModal`) no usa la opción: sus fotos se suben tal cual.
- [ ] Las fotos que ya están en el catálogo: hoy solo se pasan a IA eligiéndolas de nuevo. Una acción «Pasar a catálogo» sobre una foto ya subida evitaría volver a buscar el archivo.

## Para después (maquetadas, sin decidir)
- [ ] Forma B: toda la prenda de una vez (todos los colores en una hoja).
- [ ] Forma C: la bandeja del día para preparar varias prendas.

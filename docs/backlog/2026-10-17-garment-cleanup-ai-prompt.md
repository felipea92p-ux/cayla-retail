## Prompt para fotos y recorte desde el PNG de la IA (ADR-0442; `docs/investigacion/2026-10-17-prompt-estandar-fotos-armador.md`)

- [x] Prompt único (detecta ARRIBA / PANTALÓN / CARTERA / OTRO) con fondo transparente real, aberturas de diseño que se conservan y espalda descubierta.
- [x] ERP: la foto se sube tal cual; sin MODNet, luz, enfoque ni encuadre; `RevisarFotosModal`, `preparar-foto.ts`, `foto-luz.ts` y el worker borrados. El recorte del
  probador sale del alfa de la foto, limpiado (`limpiarAlfa`). `tsc`, `eslint`, `pnpm knip`, 556 archivos de pruebas y el limpiador sobre imágenes reales, en verde.
- [ ] **Probar con sesión real** (no se pudo aquí): subir el PNG del polo con ojal y la «Falda Jean» en Editar producto; mirar su miniatura y la ficha en la lista de
  Productos, en la tienda, y el recorte en Vitrina ▸ Probador, también en modo oscuro y a 375 px. Riesgo: un PNG transparente sobre fondo claro (prendas blancas) y la
  proporción 4:5 de la grilla.
- [ ] **Largos de las faldas:** las 20 faldas no tienen largo propio y usan el típico de 55 cm (ADR-0434 decía que no tendrían típico); «Falda Jean» sale ancha por eso.
  Decisión de Felipe: quitar el típico de Faldas y medir el largo de las 8 que ya tienen recorte.
- [ ] **Alinear el probador con la regla de 3 prendas** (arriba, pantalón, cartera; sin vestidos, enterizos ni conjuntos): hoy `/looks/arma` acepta vestido y «encima».
- [ ] Probar el prompt con 8 fotos reales (un polo, una casaca, un jean, una falda, una cartera, un vestido, una correa y un conjunto) y ajustar la redacción.
- [ ] Las manchas de los 338 recortes que ya hizo MODNet siguen en producción; se corrigen subiendo la foto nueva de cada prenda, no con un script.

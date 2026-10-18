# 2026-10-17 · La foto se sube tal cual y el recorte sale del PNG de la IA (ADR-0442)

- **Qué:** prompt único para las fotos (`docs/investigacion/2026-10-17-prompt-estandar-fotos-armador.md`) y, en el ERP, se quitó MODNet, la luz, el enfoque, el encuadre 1200×1500 y `RevisarFotosModal`: la foto sube tal cual y el recorte del probador es el alfa de la propia foto, limpiado.
- **Por qué:** medido con «Basic Ori» (POL-0034): la IA entregó un PNG limpio, pero el ERP lo guardaba como JPEG (la transparencia pasaba a negro) y MODNet recortaba esa imagen, con manchas y `por_revisar con_fondo`.
- **Verificado:** `tsc`, `eslint`, `pnpm knip`, 556 archivos de pruebas, y el limpiador sobre las imágenes reales. **No verificado:** subir una foto con sesión real y verla en Productos, la ficha y la tienda.

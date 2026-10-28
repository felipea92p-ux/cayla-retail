## 🧾 Finanzas a ancho completo y barra de sede arriba (2026-10-26, ADR-0493 act. d) — solo web, sin migración; rama `claude/finanzas-visual-improvement-8bc77a`

- [x] `/finanzas` fuera de `CON_TOPE_DE_ANCHO`; marcador del Resumen quitado; la prueba de grupo «finanzas» en `lib/ancho-completo.test.ts`. Suite web entera, `tsc` y eslint en verde.
- [x] Barra de sede pegada a la cabecera (margen negativo en `telar.css`) y en una sola fila hasta 1280 px (consulta de contenedor `mesa`). Medido en el navegador a 1280, 1440 y 1680 px y a 375 px.
- [ ] **Sin probar:** `pnpm --filter web tema:auditar` y `guias:recorrer` sobre las seis pantallas (la guía del telar ancla `telar.sedes`, `telar.mes` y `telar.registrar`, que no cambiaron de lugar en el DOM).
- [ ] 375 px: «Registrar gasto» (el «+») cae a una tercera fila cuando «Te toca» trae su número; cabe por ~8 px si el selector de mes encoge.
- [ ] Revisar a 2560 px lo que cada pantalla hace con tanto ancho (balanza del IGV a 680 px, cascada del Reportes a 640 px, el vacío de «En qué se va» de Gastos): es decisión de diseño de cada una.

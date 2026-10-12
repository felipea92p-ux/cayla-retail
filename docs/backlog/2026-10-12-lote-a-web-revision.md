## Lote A de la revisión del 11-oct: solo web (2026-10-12)
- [x] 29 · Una sola celda de CSV, sin fórmulas (`celdaCsv`, `exportar-csv.test.ts`).
- [x] 25 · Etiquetas de campañas grandes por tandas (`leerPorTandas`, prueba con 300 ids).
- [x] 24 · Existencias, Compras y Por pagar no se caen por un dato secundario.
- [x] 23 · Historial: el nombre del archivo avisa el recorte; «Por enviar» sin tope de 500 ni de 1.000.
- [x] 26 · Ticket de Vender: 40–44 px con el dedo (medido a 375 px; escritorio igual).
- [ ] La base local no expone `fn_guias_vistas` (404 en `/vender`): la oferta de la guía cae al navegador. Revisar si falta una
  migración en la base local compartida o si es el caché de PostgREST (`notify pgrst, 'reload schema'`).
- [ ] Quedan del informe: 6 y 7 (devoluciones y SUNAT, esperan la decisión de Felipe), 8, 13, 14, 15, 17 (dinero), 11, 12, 18, 30 y lo que
  falta de 5 (permisos), 19, 27, 28 y lo que falta de 2.

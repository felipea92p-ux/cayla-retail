## 2026-10-12 (Lote A de la revisión del 11-oct: cinco arreglos solo de web, sin SQL)
Qué hice: (29) una sola celda de CSV en todo el ERP (`celdaCsv`, `lib/exportar-csv.ts`): había seis copias y tres dejaban que
Excel ejecutara como fórmula un nombre que empieza con «=»; un número puro con signo («-12.50») ya no se vuelve texto. (25) Las
etiquetas de una campaña grande se leen por tandas de 80 ids (`leerPorTandas`), antes de un refactor que dejó una sola forma de
partir ids (`trocear` + `IDS_POR_URL` en `resultado.ts`). (24) Existencias sigue en pie si no se lee el stock de las otras sedes, y
Compras y Por pagar si fallan sus indicadores, la deuda por vencimiento o las salidas de 30 días: su lugar lo dice. (23) Exportar el
historial con más de 5.000 ventas nombra el archivo «…-solo-las-mas-recientes», como Movimientos; «Por enviar» y su contador leen
todas las filas. (26) Los botones del ticket de Vender miden 40–44 px con el dedo y el basurero se separa del importe.
Por qué así: cada arreglo usa la pieza que ya existía (Movimientos ya avisaba el recorte por el nombre; Vender ya tenía su basurero
de 44 px), en vez de inventar otra.
Felipe se lleva: nada que pegar en producción. Sale con el despliegue. Medido en el navegador a 375 px (y en escritorio, sin cambios).

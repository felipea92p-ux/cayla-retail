## Finanzas ▸ Impuestos «E · B++» (rama `claude/impuestos-dise-os-busqueda-32aff4`, ADR-0573)

Hecho: la pantalla nueva sobre `fn_impuestos_panel`, el menú «Descargar», la guía interactiva y sus pruebas.

Esperan una decisión de Felipe o del contador:
- [ ] **La tasa del pago a cuenta de renta:** hoy el parámetro 2026 dice 1 % (provisional). Si el contador confirma 1,5 % siempre, se cambia en Configuración ▸ Impuestos; si es 1 % hasta las 300 UIT y luego 1,5 % o coeficiente, hace falta una tasa por mes en la base.
- [ ] **«Vence en N días» y «Pagado»:** fecha por último dígito del RUC y unir cada pago a SUNAT con su mes (ya estaban en el backlog de El telar).
- [ ] **IGV por sede** («IGV del mes por lugar») y **«Lo que viene en el año»** (renta anual, ITAN, SIRE): salieron de la pantalla.
- [ ] **Barras de meses con IGV + renta:** hoy solo muestran el IGV.

Pendiente técnico:
- [ ] Recorrer la guía con `guias:recorrer` (escritorio y 375 px), `pnpm --filter web tema:auditar`, `/formidable` y probar con una cuenta real.
- [ ] Quitar la palabra «electrónicos» de la frase del límite si el contador no la confirma (ya no está en la pantalla nueva; revisar Configuración).

## Finanzas ▸ Impuestos «E · B++» (rama `claude/impuestos-dise-os-busqueda-32aff4`, ADR-0573)

Hecho: la pantalla nueva sobre `fn_impuestos_panel`, el menú «Descargar», la guía interactiva y sus pruebas.

Esperan una decisión de Felipe o del contador:
- [ ] **La tasa del pago a cuenta de renta:** hoy el parámetro 2026 dice 1 % (provisional). Si el contador confirma 1,5 % siempre, se cambia en Configuración ▸ Impuestos; si es 1 % hasta las 300 UIT y luego 1,5 % o coeficiente, hace falta una tasa por mes en la base.
- [ ] **«Vence en N días» y «Pagado»:** fecha por último dígito del RUC y unir cada pago a SUNAT con su mes (ya estaban en el backlog de El telar).
- [ ] **IGV por sede** («IGV del mes por lugar») y **«Lo que viene en el año»** (renta anual, ITAN, SIRE): salieron de la pantalla.
- [ ] **Barras de meses con IGV + renta:** hoy solo muestran el IGV.

Prueba ciega con dos lectoras simuladas (agentes sin contexto, solo imágenes con datos inventados; NO son personas): 5/10 y, tras ajustar textos, 6/10. Siguen abiertos:
- [ ] **Falta la fecha límite exacta** («Se paga en octubre» no dice el día): depende de la decisión del último dígito del RUC.
- [ ] **«Registrar pago» confunde:** no queda claro si paga o solo anota. Se le puso una ayuda al pasar el mouse; conviene probar otro nombre con colaboradoras reales.
- [ ] **El límite de 300 UIT sigue siendo la parte más difícil** (UIT, 250 vs 300, «habla con tu contador»): ver si una sola frase alcanza.
- [ ] **«Díselo al contador»:** un botón «Avisar al contador» en los pendientes que lo dicen (idea de la prueba; no existe).
- [ ] Probar con 3 a 5 colaboradoras reales (la prueba ciega es un proxy de IA).

Pendiente técnico:
- [ ] Recorrer la guía con `guias:recorrer` y `pnpm --filter web tema:auditar` con una cuenta real (necesitan sesión y base: solo se midió con el mismo escáner sobre datos inventados, 0 hallazgos en claro y oscuro a 1440 y 375 px), y probar con datos reales.
- [ ] Quitar la palabra «electrónicos» de la frase del límite si el contador no la confirma (ya no está en la pantalla nueva; revisar Configuración).

## 2026-10-04 (Inventario por olas: las decisiones de Felipe quedan escritas antes de tocar código)
Qué hice: con los dos artefactos de Felipe («Inventario contra los mejores» y «Rápido por diseño») y tres lecturas de solo lectura
sobre el código y producción, le hice cuatro tandas de preguntas de negocio sobre todo el módulo de Inventario y escribí lo que
decidió: ADR-0328 (rediseño por olas, dato e interfaz juntos, 17 actividades), ADR-0329 (capacidad del piso; era el «0295» de un
commit local que nunca subió y chocaba con el 0295 de `main`) con la «Actualización 2026-10-04» del primer mix, y la investigación
`docs/investigacion/2026-10-04-mix-inicial-del-piso.md`. Rescaté también el diseño y las dos investigaciones del 30-sep que solo
vivían en ese commit local.
Por qué así: la mitad de lo que hoy confunde en Inventario no es la pantalla sino el dato (TRU dice 138 colgadas y cuelgan 600–750;
236 ventas sin registrar; cinco reglas para la misma pregunta), y Felipe pidió que la interfaz se vea espectacular y se entienda sin
capacitación: por eso cada ola arregla dato e interfaz de una pantalla juntos. Las decisiones no pueden vivir solo en el chat
(principio 8): este PR va antes de la primera línea de código.
Felipe se lleva: la lista de 17 actividades aprobada; lo que le toca al equipo sin código (caja real del Taller a TRU, contar AQP,
etiquetar y cargar AQP, crear bolsas/cajas/sorpresas como productos); y la ronda 4 (Análisis y Frescura) pendiente.
Corrección: en la primera tanda le dije que las ventas sin registrar no guardaban talla ni color; sí las guardan (son obligatorias en
`prendas_por_regularizar`). Quedó escrito en ADR-0328.

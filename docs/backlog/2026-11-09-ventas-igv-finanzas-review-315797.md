## 🧾 Revisión de Finanzas y arreglos seguros (2026-11-09) — solo web, sin migración; rama `claude/ventas-igv-finanzas-review-315797`

- [x] 38 tareas seguras de la revisión (barra de Finanzas, Resumen, simulador, Dinero, Impuestos y Cierre, Estados financieros, inversión, Gastos).
- [x] «Cada sede, junta» con «Vendió con IGV» y columna IGV.
- [x] **Lima en «Cada sede, junta»**: decidido y construido el 2026-11-09 (todo lo vendido en la tienda, con la línea de CLAURE sin IGV; ADR-0624, actualización).
- [x] El IGV en el resto de Finanzas: Resumen, «Necesitas vender», la meta, Topes, el cuadro «De Ventas a Finanzas» y Ganancias (tareas 19, 53 y 76). Márgenes, el límite de SUNAT, «Lo que más se movió» y Flujo ▸ ¿Y si…? siguen sin IGV, rotulados.
- [ ] **Facturas de compra de CLAURE**: Felipe decidió (2026-11-09) que, cuando CLAURE facture, se deja de descontarle el IGV (ADR-0560, actualización). Hasta la primera factura se sigue descontando. Falta con el contador: fecha de corte, qué pasa con lo ya descontado y con el efectivo anterior, y cómo se registra sin subir stock ni costo. Construirlo pide migración. Tarea 185 del tablero.
- [ ] Elegir el camino del IGV (A, B o C, tablero) y pedir al contador el PDT de septiembre, el crédito de octubre y la decisión sobre las notas de venta, antes de declarar octubre.
- [ ] Tareas 24, 25, 43, 68, 10 y 96: lo que falta es decisión de Felipe o una migración.
- [ ] Tareas 61 y 159: mirar en pantalla el recorrido con dos sedes y el globo del mes; correr `tema:auditar` y comparar `.fin-control` con el spike.
- [ ] Mirar con datos reales la columna IGV de «Cada sede, junta», su corte a fichas bajo 880 px y el cuadro «De Ventas a Finanzas» dibujado: la base local no trae `fn_igv_de_las_ventas` ni `fn_cuadre_ventas_finanzas`.
- [ ] A 375 px, el párrafo de «Vendido por sede» queda angosto junto a su chip (detalle visual).
- [ ] Función en la base para contar «Quedan N por registrar» con el mismo alcance que la cifra; hoy, a una cuenta no líder que mira otra sede se le dice «no se pudo contar».
- [ ] «Lo demás está al día», que afirma sin saber, sigue en `GastosPanel.tsx:313` y `AnalisisPantalla.tsx:280`.
- [ ] Dynamic: se borró `apps/web/components/ui/CabeceraPantalla.tsx`, carpeta que su vigilante mira. Queda como tarea allá si tiene su copia.

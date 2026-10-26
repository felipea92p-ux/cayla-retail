## Finanzas ▸ Impuestos en El telar (rama `claude/finanzas-impuestos-maquetas-f39c92`, ADR-0493)

Hecho: auditoría v3, «La balanza», una sola lista «Antes de declarar», sobres por mes y la barra común. Plan y decisiones:
`docs/maquetas/finanzas-v3-2026-10/impuestos/PLAN-construir.md` y `README.md`.

Esperan una decisión de Felipe (no se empiezan sin su OK):
- [ ] **Las pesas por sede:** una función de lectura «IGV del mes por lugar». Junta `comprobantes.ubicacion_id`, `compra_parte_por_tienda`,
  `gastos.ubicacion_id` (si es nulo, es de la empresa) y `comprobantes_produccion` (el Taller), con una prueba de que la suma da
  `fn_impuestos_panel`. Se coordina con ADR-0433. Con ella, el orillo de Impuestos aparece y la balanza filtra por sede.
- [ ] **El lacre del sobre:** unir cada `movimientos_dinero.tipo = 'pago_sunat'` con el mes que paga (con Cuentas y dinero). Hasta
  entonces, ningún sobre se sella.
- [ ] **La fecha exacta de vencimiento:** el último dígito del RUC y el cronograma de SUNAT, como parámetro de Configuración ▸ Impuestos.
- [ ] **La excepción de ADR-0136 para Finanzas:** sin ella, la balanza aparece ya inclinada, y las pesas no caen.

Pendiente técnico:
- [ ] Recorrer la guía con `guias:recorrer` en escritorio y a 375 px, y pasar `/formidable` por la pantalla terminada.

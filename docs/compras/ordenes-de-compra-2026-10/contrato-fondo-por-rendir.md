# Contrato · fondo por rendir y gastos del viaje (ADR-0362, fase 6) — BORRADOR, espera a Felipe

Escrito la noche del 2026-10-12 para que la fase 6 arranque apenas Felipe responda. **No se construye sin su OK**: es la fase que más
mueve plata (Finanzas, el Diario, el Balance y el cierre de mes). Parte del diseño del 2026-10-08
(`fondo-y-gastos-del-viaje.md`, «flujo recomendado») y lo ajusta a lo que Felipe decidió después (ADR-0362, decisiones 16, 20, 26,
29, 30, 32–35, 40–46). Donde el anexo y el ADR chocan, manda el ADR.

## Lo que ya está decidido

- **16 y 46:** paga quien compra, desde su fondo por rendir (o administración, desde la cuenta de la empresa). La deuda de una orden
  es de la sede de quien la hizo.
- **20:** los gastos de traer la compra (flete, fardos, carretilla, viáticos) se registran **aparte: nunca entran al costo de la
  prenda** (`variantes.costo`); el costo de traer una compra se ve junto a ella. Incluye el flete de Lima a cada sede. *(Esto reemplaza
  la recomendación del anexo de pasar el flete al costo.)*
- **26:** quien compra paga desde su propio fondo y de ahí salen los gastos adicionales; al final se ve cuánto le queda (control
  contra el fraude).
- **29:** quien compra para el Taller también recibe un monto y lo rinde.
- **30 y 35:** existe un **módulo nuevo `fondos`** (Finanzas ▸ Fondos por rendir; delegable, nace solo para el líder) para entregar
  plata y aprobar rendiciones. Nadie se entrega plata a sí mismo, y quien entrega no aprueba esa rendición.
- **32:** si el fondo no alcanza frente al proveedor, la compradora **paga de su bolsillo** y queda «CAYLA te debe S/ X», que se le
  devuelve al rendir con comprobante o foto. Sin tope.
- **33:** la rendición de un líder la aprueba un Admin distinto de él; «nadie aprueba lo suyo» no tiene excepción.
- **34:** toda persona puede tener un fondo. **Por defecto (ADR):** un fondo por persona, con una rendición por viaje.

## Lo que se construiría (resumen; el detalle de tablas y reglas está en el anexo, secciones D y E)

1. **El fondo** es una cuenta `por_rendir` de `cuentas_dinero` con `persona_id` (una por persona). Entregar y devolver son
   movimientos propios (`entrega_fondo`, `devolucion_fondo`), no gasto: la caja total de CAYLA no cambia.
2. **Pagar desde «Mi fondo»:** en el comprobante de una orden al contado (fase 2) y en Por pagar, «¿De dónde sale la plata?» ofrece
   «Mi fondo» primero a su dueña. El fondo puede quedar en negativo con aviso: ese negativo es el «CAYLA te debe» de la decisión 32.
3. **Gastos del viaje** (`registrar_gasto_viaje`): «Lo que trae la mercadería» (flete, agencia, cargador, embalaje; ligado a las
   órdenes o al envío) o «Gasto tuyo del viaje» (pasaje, hotel, comida, taxi). Con foto del comprobante o «No tengo comprobante» con
   motivo. **Ninguno entra al costo de la prenda (20):** la orden y el envío muestran «Traerla costó S/ X».
4. **Rendición:** «Rendir mi fondo» → Entregado · Pagaste a proveedores · Gastos del viaje · Te queda; cuenta tu efectivo → «Cuadra»
   o «Te faltan S/ 20: escribe por qué»; devuelve lo que sobró (depósito o caja fuerte) o queda «CAYLA te debe S/ X». La aprueba otra
   persona con el módulo Fondos (35); la de un líder, un Admin distinto (33). Cerrada, se congela.
5. **Pantallas:** la tarjeta «Tu fondo» donde compra (Órdenes de compra) y en Inicio; Finanzas ▸ Fondos por rendir (entregar,
   aprobar, tablero) con el kit y el spike de Finanzas (ADR-0195).

## Preguntas que faltan (para el cuadro de preguntas de Felipe; recomendada primero)

1. **Si al rendir falta plata sin explicación:** (a, recomendada) queda como deuda de la persona, visible hasta saldarse, y se le
   descuenta solo con su autorización escrita; (b) la asume CAYLA como gasto; (c) se descuenta por planilla en Dynamic.
2. **Gastos sin comprobante:** (a, recomendada) planilla de movilidad solo para taxi y cargador, con tope diario (a confirmar con el
   contador); hotel y comida, solo con comprobante; (b) todo con motivo; (c) no se aceptan.
3. **Pagos en efectivo de S/ 2 000 o más (Ley 28194):** (a, recomendada) bloquearlos con la salida «págalo por transferencia desde la
   cuenta de CAYLA»; (b) permitirlos marcados «no deducible».
4. **Para el contador:** el fondo en la 101 o en la 1413; si el Yape personal de la compradora vale como bancarización; la planilla de
   movilidad y su tope.

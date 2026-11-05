# Impuestos sobre «El telar de Finanzas»: lista de actividades (`/construir`, 2026-10-23)

Felipe eligió «El telar de Finanzas» para todo Finanzas (23 de octubre). Impuestos es **«La balanza»**: un plato con el IGV que
cobraste, el otro con el IGV de tus compras, la balanza que se inclina y abajo la cuenta que siempre cierra. Al lado van la cuenta
regresiva y «Antes de declarar»; abajo, un sobre por mes. El diseño está en `docs/maquetas/finanzas-telar-2026-10/` (rama
`claude/finanzas-redesign-filters-d154a4`). El diagnóstico de los 15 hallazgos sigue en `README.md`.

**La barra común** (mesa de mando con sede y mes en la URL, orillo, cabecera con la respuesta, dock, ⌘K, «Te toca») **la construye
la sesión de Gastos** en su propio PR. Aquí no se duplica ninguna de sus piezas.

Cada actividad es un corte que se puede ver funcionando y lleva su propio commit `feat(finanzas)` / `fix(finanzas)`.

## Qué trae la base hoy y qué no

- **El plato de compras se puede repartir hoy por tipo**, sin base nueva: mercadería, gastos, activos e insumos del Taller, menos notas
  de crédito. Ya vienen en `fn_impuestos_panel`.
- **El reparto por sede** (las pesas de cada tienda) necesita la función de lectura «IGV del mes por lugar». **La decide Felipe.**
  Mientras no exista, la balanza es de CAYLA entera y, si en la mesa se elige una sede, lo dice con calma.
- **El sobre sellado** necesita saber qué pago a SUNAT (`movimientos_dinero.tipo = 'pago_sunat'`) corresponde a qué mes. Hoy ese
  movimiento no dice de qué mes es. **Lo decide Felipe.** Mientras tanto, ningún sobre se sella: el sistema no afirma lo que no sabe.
- **La fecha de vencimiento** (último dígito del RUC + cronograma de SUNAT) no existe en la base. **La decide Felipe.** Mientras tanto,
  el reloj dice «vence según el último dígito de tu RUC», sin inventar un día.
- **Una factura que se registra con la hoja nueva de gasto ya mueve la balanza**: queda en `compras` (`naturaleza = 'gasto'`), y eso ya
  entra al IGV que descuentas. Solo falta que la pantalla se vuelva a leer al guardar (se verifica en la actividad 6).

## La lista

**Se pueden hacer ya, en archivos propios de Impuestos (sin esperar la barra):**

1. **Arreglar los 4 errores graves.** El enlace que da 404, «a favor S/ 0» en un mes vacío, el total que falta en el «¿Por qué?» y la
   tabla cortada a 375 px. *Se ve:* las pruebas de `impuestos-pulso-reglas` en verde, y en el navegador el «Ir» abre Comprobantes,
   `?mes=2025-08` dice «sin movimiento» y a 375 px no hay corte.
2. **La lógica de la balanza** (`lib/impuestos-balanza-reglas.ts` + su prueba). De lo que trae la base salen:
   - las pesas de cada plato: por sede si la base las trae; si no, las ventas en un plato y el otro por tipo de compra;
   - la inclinación, con un tope;
   - la cuenta que siempre cierra (cobraste − compras + renta = pagas o «baja tu pago»), también con saldo a favor, sin renta o en
     un mes vacío.

   *Se ve:* la prueba recorre esos casos y exige que la cuenta dé exactamente el `a_pagar` de la base.
3. **El componente `<BalanzaIgv>`.** El SVG de la maqueta, hecho con tokens: las pesas caen, el brazo se inclina una vez, sin rebote;
   oscuro; `prefers-reduced-motion`; y una tabla escondida para el lector de pantalla. Se monta en la pantalla de hoy en lugar de la
   cifra grande y las cuatro tarjetas. *Se ve:* en el navegador, a 1440 y 375 px, en claro y oscuro.
4. **«Antes de declarar», una sola lista.** Junta las dos que hoy dicen lo mismo, con los enlaces bien puestos y un botón por cosa, y la
   deja en un formato que «Te toca» pueda leer cuando exista. *Se ve:* una lista en pantalla, sin repetidos, y su prueba.
5. **Un sobre por mes** (`<SobresIgv>` + su lógica). Abierto si falta algo («por declarar», «sin pago registrado»); en curso, punteado;
   sin movimiento, apagado y sin tachar. Tocar un sobre elige ese mes (en la URL), la vista sube a la balanza y una flecha vuelve al mes
   que se declara. Reemplaza la tabla de meses y el combo «Otro mes» del fondo. *Se ve:* en el navegador, cambiar de mes se nota y se
   puede volver.

**Cuando la barra común esté en main:**

6. **Montar Impuestos en la barra.**
   - Sale la cabecera propia y entra la cabecera con la respuesta: «¿Cuánto le pagas a SUNAT?».
   - El orillo muestra el IGV cobrado: de CAYLA entera hasta que exista el reparto por sede.
   - El dock: factura de compra (abre la hoja de gasto), paquete del contador y los dos registros.
   - Sede y mes salen de la URL de la mesa, y «Antes de declarar» alimenta «Te toca».

   *Se ve:* registrar una factura con la hoja nueva y ver que el plato de compras y la cuenta cambian sin recargar.
7. **Cierre de la pantalla.** Al día: la guía interactiva (anclas y huella) y la guía de foco en el registro. Además, `/formidable`, el
   modo oscuro con `tema:auditar`, 375 px, `/unificar`, Knip y bitácora. *Se ve:* las pruebas del CI en verde y las capturas revisadas.

**Esperan una decisión de Felipe (no se empiezan sin su OK):**

8. **Las pesas por sede.** Una función de lectura nueva, «IGV del mes por lugar», con una prueba que exige que la suma de los lugares dé
   el total de `fn_impuestos_panel`. Se coordina con la sesión de ADR-0433. Con eso, cada tienda es su pesa y elegir una sede en la mesa
   filtra la balanza.
9. **El lacre que se estampa.** Unir cada pago a SUNAT con el mes que paga (lo decide Felipe, con la sesión de Cuentas y dinero). Con
   eso, el sobre se sella al registrar el pago.
10. **La fecha exacta de vencimiento.** El último dígito del RUC y el cronograma de SUNAT como parámetro de Configuración ▸ Impuestos.
    Con eso, el reloj cuenta los días de verdad.

Además: **el movimiento rico de la balanza** (pesas que caen, brazo que se inclina, lacre) necesita la excepción de ADR-0136 para
Finanzas, que el telar deja en manos de Felipe. Sin ella, la balanza aparece ya inclinada, con un fundido.

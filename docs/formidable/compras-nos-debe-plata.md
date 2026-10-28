# Formidable · Compras ▸ la plata de «Nos debe» (ADR-0362, fase 5b) — 2026-10-15

Pasada **rápida**: solo se midió, sin prueba ciega. Hojas:
- «Depositó» y «Pasar a saldo a favor», en la ficha del proveedor;
- «Llegó su nota de crédito», en Notas de crédito;
- el panel «Devolver al proveedor», en Existencias ▸ Dañadas.

Banco propio, rama `claude/purchase-order-phase5b-9b0c82`, a 1440×900 y 1024×768, también en oscuro.

## Medido (`medir-oficio.js`, solo dentro de la hoja abierta)

- Contraste: 0 fallas en las cuatro hojas, en claro y en oscuro (capturas). Una sola acción principal por hoja.
- Lo que marca viene de piezas del sistema, no de estas hojas:
  - el botón del calendario de `CampoFecha`, de 20×20 px;
  - «Sigue aquí» de la guía de foco, de 10,5 px;
  - las etiquetas en versalitas de 11 px;
  - desalineaciones de 1 a 3 px entre la caja de valor y los campos;
  - 4 o 5 radios distintos en «Depositó»: la hoja, la caja de valor, los campos y las pastillas.
- La fila de una deuda con tres botones partía el texto en cuatro renglones a 1024 px: arreglado en la actividad 6a (los botones bajan
  según el ancho de la tarjeta).

## Observado (recorridos en el navegador)

- «Depositó» dice cuánto tuvo que depositar el proveedor y compara lo que se escribe. Si todavía se debe el comprobante, explica que no
  hay nada que depositar y qué hacer. El doble clic no repite.
- «Devolver al proveedor» dice a quién vuelve y qué pasa («queda como deuda en su ficha»). La deuda dice «Llegaron con daño en ENV-… · se
  devolvieron hoy».

## Opinión: los 3 cambios de mayor impacto (esperan el OK de Felipe)

1. **Ley 2 · una pregunta, una respuesta.** La fila de una deuda tiene tres botones del mismo peso: «Depositó», «Pasar a saldo a favor» y
   «Llegó la reposición».
   - Propuesta: dos botones, «Llegó la reposición» y «No la va a mandar», que abre una hoja con dos caminos («Te devolvió la plata» →
     depósito; «Descuéntalo del próximo pago» → saldo a favor).
   - Se verifica: la fila a 1024 px en una línea y una prueba ciega que elige bien a la primera.
2. **Ley 8 · quitar antes de agregar.** «Depositó» tiene ocho campos. Propuesta: «Referencia» y «Nota» plegadas bajo «Agregar referencia o
   nota» (opcionales, no se pierden); quedan a la vista cuántas, cuánto, cuándo, cómo, a qué cuenta y quién.
3. **Ley 4 · lenguaje de tienda.** El aviso de éxito dice «DI-000092 por S/ 40.00: te devolvió S/ 40.00».
   - Propuesta: «Quedó registrado: Textiles Andina te devolvió S/ 40.00», con el número del documento interno debajo, más chico.
   - Igual en «Pasar a saldo a favor».

Lo que sobra (ley 8): en Dañadas, un líder ve cinco botones por prenda (Se arregló, Devolver al proveedor, Liquidada, Se botó, Donada).
Agruparlos es de otra pantalla y no se toca aquí.

Lo que Felipe no pidió y quizás importa más: nadie probó todavía estas hojas con una colaboradora real.

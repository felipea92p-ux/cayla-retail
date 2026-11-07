# ADR-0579 — Resumen de Finanzas pulido: una cifra y su detalle juntos, y textos de una sola idea

- **Fecha:** 2026-10-29 · **Estado:** aceptado. Felipe pidió «mejorar la estética y evitar frases largas», eligió entre maquetas
  (la opción 3 para sedes y confianza) y aprobó implementarla. Rama `claude/finance-summary-aesthetics-5db57c`.
- **Relacionados:** ADR-0493 (El telar de Finanzas, del que esto es una actualización del Resumen), ADR-0358 (una función, una pieza),
  ADR-0169 y ADR-0336 (tokens y modo oscuro), ADR-0389 (guías interactivas).
- **Maqueta:** `docs/maquetas/finanzas-resumen-pulido-2026-10/index.html`.

## El problema

El Resumen repetía la misma cifra en varias tarjetas (CLAURE aparte de «¿Cuánto tienes?», sedes en el orillo y confianza en una franja
propia), decía «cuánto debes» sin decir qué ni cuándo vence, y tenía párrafos largos donde bastaba una frase. El recorrido de la plata
en hilos y «¿Y de cada S/ 100?» contaban dos veces lo mismo.

## Qué se decidió

1. **«¿Cuánto tienes?» reparte entre CAYLA y CLAURE** (`disponibleReal`) con su barra; la tarjeta de CLAURE aparte desaparece.
2. **«¿Cuánto debes pagar pronto?» lista cada deuda** con su monto y cuándo vence (hasta 4 y «y N más»), la planilla incluida.
3. **«Vendido por sede» junta el orillo y la confianza** en una sola tarjeta (`VendidoPorSede.tsx`, `ConfianzaChip`, `ConfianzaDetalle`).
4. **La caja marca lo que cae bajo el mínimo** (zona y trazo rojos en `<Linea bajoReferencia minimo>`) y rotula el punto más bajo.
5. **«A dónde va la plata» es un anillo de reparto** (`AdondeVaLaPlata.tsx`) y reemplaza a `RecorridoPlata` y `DeCadaCien` (borrados con
   su lógica). Va con `unificar-fijo` porque `<Anillo>` es de un solo avance, no de varios tramos.
6. **«Inversión en mercadería» va al final y siempre se ve**; sin nada pendiente, una línea con `<Vacio tamano="chico">`.
7. Los textos de los titulares de la caja, «Hoy te toca» y las bajadas se acortaron a una idea cada uno.

Sin migración ni RPC nuevos, y sin token de color nuevo (Taller y Empresa usan los colores de sus sedes).

**DECIDÍ:** juntar cada cifra con su detalle en la misma tarjeta. **DESCARTÉ:** mantener las franjas aparte y solo acortar el texto: dejaba
tres lugares donde mirar lo mismo. **SE ROMPE SI:** una pantalla nueva del Resumen vuelve a poner una cifra en una tarjeta y su detalle en
otra, o si `recorrido.salidas` trae un tipo sin color en `COLOR_HILO` del anillo (saldría sin tramo visible).

## Lo que no se tocó

«¿Ya pagaste el mes?» y «Contra el mes pasado» quedan como estaban; la maqueta los resumía en dos filas, pero eso cambia reglas y lo decide
Felipe aparte.

# ADR-0600 — «Pasar al stock» frena la orden que nunca declaró su tela (candado de pantalla)

**Estado:** aceptada y construida en local (2026-11-02). Solo pantalla: **no hay migración** (la versión `20261102173000` quedó reservada y sin usar; un hueco no rompe nada, ADR-0381).
**Decide:** Felipe, 2026-11-02 («en la pantalla»). Sale del análisis del módulo Taller (artefacto «Análisis del Taller», problema P01).

## Contexto

En las pruebas locales del 2026-11-02, la orden OP-003652 (720 prendas) se abrió sin declarar tela. Corte, Habilitado, Costura y Planchado se marcaron en dos minutos y «Pasar al stock» pidió
confirmar «el costo por prenda es cero». Con un clic de un líder entraron 720 prendas al Taller con costo 0.00 y la nota «Costo atípico confirmado por un líder (sin costo)». Ese costo entra al
promedio de la prenda en todas las sedes.

El cierre ya frena cuando la tela **sí se declaró y no se anotó** (`cierre_sin_tela`, ADR-0570, actividad 4). Pero `fn_produccion_exigir_tela` solo mira las telas declaradas: una orden que no declaró
ninguna no tiene nada que exigir y pasa. El ADR-0570 descartó cerrar ese hueco **en la base**: 23 suites de otros módulos (Frescura, plan del piso, costos) cierran órdenes sin tela para armar su
escena, y toda orden abierta sin tela declarada quedaría trabada. Dejó escrito que volverlo candado era decisión de Felipe.

## Decisión

**DECIDÍ:** la hoja «Pasar al stock» frena la orden que no declaró ninguna tela, igual que frena la de tela sin anotar. La persona sale por «Declarar la tela», o un líder la deja pasar con su motivo
(`permitir_pasar_sin_tela`, que queda en la historia de la orden y en Actividad). La regla es pura y vive en `lib/orden-tela-sin-anotar-reglas.ts` (`frenoSinTelaDeclarada`), con su prueba. No frena una
muestra (no toca el stock) ni una orden marcada «ya estaban registradas» (el costo se queda en la orden y no mueve el de la prenda).

**DESCARTÉ:** (1) el candado en la base (`fn_produccion_exigir_tela` exigiendo tela declarada): es lo más fuerte, pero obliga a reescribir unas 20 suites antes de ver cualquier beneficio y traba las
órdenes abiertas en producción de una vez. Queda como segundo paso posible. (2) Frenar ya en Corte: toca varias hojas y el cierre concentra el riesgo.

**SE ROMPE SI:** alguien llama `cerrar_produccion` sin pasar por esa hoja (un script, otra pantalla futura): ese camino sigue abierto. También si el Taller hace con frecuencia órdenes sin tela de verdad
(reparaciones): cada una pedirá un permiso con motivo.

## Qué no cambia

El costo atípico («el costo por prenda es cero») sigue pidiendo confirmación al final. P19 del informe (pedir motivo escrito y guardar el nombre al confirmarlo) queda pendiente: cambia la firma de
`cerrar_produccion` y es otra migración.

## Cómo se verificó

- `lib/orden-tela-sin-anotar-reglas.test.ts`: 6 casos nuevos (primero fallaban, luego pasan).
- Navegador, local: en OP-003652 (sin tela) la hoja muestra el freno con «Declarar la tela» y «¿La dejas pasar sin tela?», «Falta: La tela», y el botón queda apagado; al elegir un motivo se enciende.
- La guía `produccion.ordenes.numero` y su huella se actualizaron.

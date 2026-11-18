## Análisis del módulo Taller y primer arreglo, P01 (2026-11-02)
Rama `claude/analisis-modulo-taller-66dd5a`. Informe: artefacto «Análisis del Taller» (19 problemas, por pantalla, con solución). ADR-0600.
- [x] Pruebas locales del Taller de punta a punta; 42 suites de Postgres (37 verdes, 5 con falla explicada) y 1739 de reglas en verde.
- [x] P01: «Pasar al stock» frena la orden sin tela declarada (solo pantalla): `frenoSinTelaDeclarada` + `PasarAlStockModal` + guía y huella de `produccion.ordenes.numero`.
- [ ] **Candado en la base** (`fn_produccion_exigir_tela` exigiendo tela declarada): decisión de Felipe, sería otra migración y obliga a tocar unas 20 suites (ADR-0570, ADR-0600).
- [ ] P19: pedir motivo escrito y guardar el nombre al confirmar un costo atípico (cambia la firma de `cerrar_produccion`).
- [ ] P02 (nota de crédito por faltante), P03 («Ingresar insumo» sin proveedor), P04 (factura mayor que lo pedido), P05 (quién recibe lo que pidió, igual en Compras y Producción): dinero, deciden Felipe y el contador.
- [ ] Resto de los 19 problemas, por olas, en el artefacto.
- [ ] Cómo verificas tú: abre una orden terminada sin tela declarada, «Pasar al stock»: debe verse el freno con «Declarar la tela» y el botón apagado hasta declarar o elegir un motivo (solo líder).

## Producción ▸ fase 7 de las órdenes de compra, parte 1: «Órdenes de insumos» del Taller (2026-10-13) — rama `claude/purchase-order-phase7-9b0c82`

- **Qué:** el Taller pide sus insumos (telas, hilos, botones, avíos) con una orden propia, `OI-000001`, separada de la de tienda: proveedor
  del Taller, destino el taller, cada línea con su insumo, la cantidad en su unidad (hasta 3 decimales) y el precio con hasta 4 decimales.
  Crear, ver, editar, anular e imprimir o guardar el PDF. Entrada nueva «Órdenes de insumos» en Producción ▸ Abastecimiento, con su módulo
  propio que nace solo para el líder. El comprobante y la recepción en el Taller no se construyen: esperan a Felipe.
- **Por qué:** ADR-0362, decisiones 25, 28, 29 y 47; Felipe pidió avanzar de corrido hasta la mañana del 2026-10-13. Lo no decidido va
  marcado provisional en el SQL, en el ADR y en el contrato (`contrato-ordenes-de-insumos.md`, «Cambios al construir»).
- **Cómo:** dos agentes en fila (base y pantallas), copiando la orden de tienda de la fase 1. Migraciones `20261013035000` (módulo, tablas
  y secuencia) y `20261013040000` (7 funciones, una de ellas la lectura de lo que el formulario ofrece elegir, sin la plata del Taller);
  `pruebas:ordenes-insumo` 55/55 y las vecinas en verde; web con su lógica pura probada (1000 × S/ 0.0350 = S/ 35.00), guía de foco,
  4 guías interactivas, modo oscuro, `tsc` limpio; de punta a punta en el banco a 1440 y 375 px. **Sin pegar en producción.**
- **Producción y fila (2026-10-13, tarde):** con el OK explícito de Felipe, `20261013035000` y `20261013040000` pegadas por MCP
  (versiones `20261013174954` y `20261013175242`); 30 de 30 huellas iguales al banco. La #1015 y la #1014 se habían fusionado dentro de
  las ramas de la fila: la rama de la fase 2 se rebobinó (OK de Felipe) y las fases 3 y 4 volvieron en #1034 y #1035; desde entonces
  toda PR de la fila apunta a `main`. #1006 fusionada a las 12:45. Las pantallas de las fases 2–7 pasaron a las piezas únicas de #1026.

# 2026-11-09 — Un color por estampado (ADR-0634)

- **Qué:** cuando la misma prenda vuelve en varios estampados, cada uno es un color con nombre propio («Floral azul petróleo»), marcado con `colores.tipo = 'estampado'`. «Nuevo color» arma nombre, código, tono y familia con el patrón y el color que más se ve; la carta los separa por nombre; Vender, Recibir ▸ Contar, Existencias y Ajustar stock los reconocen por su foto.
- **Por qué así:** sin migración y sin tocar variantes, stock, movimientos ni ventas. Existencias solo lee la foto propia de los estampados: los colores lisos siguen con la principal del modelo.
- **Verificado en local:** alta de dos estampados, recepción (Floral S de 2 a 5, Rayas M de 2 a 4), bajada al piso, venta y etiqueta; a 375 px en Vender y Ajustar stock; doble clic, nombre hostil, `tipo` inválido y 29 invariantes sin violaciones nuevas.

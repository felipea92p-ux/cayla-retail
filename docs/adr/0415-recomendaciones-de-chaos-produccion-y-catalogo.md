# ADR-0415 · Recomendaciones de /chaos aplicadas: la entrega no es pasada, las buenas tienen techo, el precio de una prenda también

- **Fecha:** 2026-10-15 · **Estado:** construido y verificado en local (suite de base con controles, suites vecinas, vitest). **Las dos
  migraciones NO están en producción:** esperan el OK de Felipe. Rama `claude/recomendaciones-prod-catalogo-5c56e1`.
- **Pedido:** Felipe, 2026-10-15: «pega las migraciones y aplica tus recomendaciones para el resto». Las preguntas abiertas de ADR-0405
  (Catálogo) y ADR-0409 (Producción) se resuelven aquí con la recomendación, medida contra los datos de producción del 2026-10-15.
- **Cierra:** «Lo que queda para Felipe» de ADR-0405 y de ADR-0409.

## Las cuatro preguntas y lo que se decidió

| Pregunta | Datos de producción (2026-10-15) | Recomendación aplicada |
|---|---|---|
| ¿Una orden del Taller puede prometer la entrega en el pasado? (PRO-06) | 0 órdenes todavía | **No.** `abrir_produccion` y `abrir_produccion_con_modelo_nuevo` rechazan una entrega anterior a hoy (`entrega_pasada`), después de mirar el token (un reintento de ayer devuelve su orden). Sin fecha sigue valiendo. Nueva orden lo dice antes y su calendario empieza hoy. |
| ¿Se cierra una orden con más buenas que las pedidas? (PRO-08) | 0 órdenes todavía | **Sí, con techo:** hasta el doble de lo pedido por talla, o 5 más si la talla es chica (`greatest(plan × 2, plan + 5)`, `buenas_de_mas`). Que el corte rinda algo más es real; un 60 por un 6 son 54 prendas que no existen. Cerrar orden lo dice antes (`topeDeBuenas`). |
| ¿Un tope para el precio de una prenda? | la más cara: S/ 169.90; costo más alto: S/ 85 | **S/ 5 000** de precio (catálogo, por sede y Liquidación) y de costo, en la tabla (`<tabla>_precio_con_tope`): 30 veces la más cara y frena el punto que falta («5990» por «59.90») en todo precio de S/ 50 o más. El costo también lo escriben Compras y Producción: la tabla es el último guardián. La pantalla corta antes (`MAX_PRECIO_PRENDA`). |
| ¿Un aviso si el costo pasa al precio? | 7 prendas de 1708 ya están así | **Un aviso, no un candado:** la ficha dice cuánto se pierde por prenda y deja guardar (liquidar es legítimo). En el alta ya se veía el margen negativo en la ficha previa. |
| ¿El precio de catálogo es solo del líder? | 36 cambios de precio de integrantes y 40 de terminales en dos semanas (el último el 13); 12 integrantes con Productos | **No se restringe.** Hoy es trabajo diario de las tiendas: cerrarlo al líder cortaría ese flujo. Cada cambio ya queda con quién lo hizo en el Historial de la prenda (`historial_producto_cambios`), y el precio por sede ya está limitado a su tienda (ADR-0370). Si Felipe quiere revisarlos, lo que falta es un aviso al líder, no un candado. |

## Cómo se pega en producción

Dos partes, cada una en su llamada y en este orden: `20261015152000` (solo `alter table`; `variantes` la lee Vender: mejor fuera de
horario) y `20261015153000` (solo funciones, tres reemplazos anclados verificados en local y en producción; se detienen sin tocar nada si
un ancla cambió). Ninguna lleva políticas. Antes: ninguna fila sobre S/ 5 000 (verificado el 2026-10-15).

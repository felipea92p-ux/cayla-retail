# ADR-0262 — Una sola cifra de stock para Catálogo e Inventario, y un solo candado de estado

**Fecha:** 2026-09-28
**Estado:** Aceptado (decisiones de Felipe). El plan y el orden están en
[`docs/pantallas/catalogo-inventario.md`](../pantallas/catalogo-inventario.md) (12 tareas).
**Construido (rama, sin pegar):** tareas #2, #3, #5 y #7, y la parte de la base de la #4. Tres migraciones **por pegar en
orden**: `20260929010000` (la cifra única: `fn_existencias_base` + `fn_existencias`), `20260929020000` (Catálogo, cabecera y
«Dónde más hay» la leen; `fn_existencias_productos` para la tarjeta) y `20260929030000` (una talla con prendas no se
retira). Pruebas: `fn-existencias` 15/15, `catalogo-cifra-unica` 14/14 y `talla-con-prendas` 11/11, todas con control y
mutaciones detectadas; batería completa del CI 107/108 (la que falla, falla igual sin estos cambios). Web: la tarjeta por
sede, «Ver en Existencias» en vez de Ajustar, «En camino» sin doble conteo y la guardia `lib/stock-una-sola-cifra.test.ts`.
**Decide:** Felipe, 2026-09-28, en 32 preguntas con opciones («hay un montón de problemas relacionados a catálogo y cómo
converge con inventario», «sospecho que algo anda mal y bastante mal»).
**Sobre:** ADR-0151 (Productos, tareas #1-#4), ADR-0179 (prendas por regularizar), ADR-0212 (alta con stock, puerta
temporal), ADR-0224 (purga de prueba con venta), ADR-0237 (Existencias), ADR-0252 (eliminar con historia de stock).

## Problema

Con los datos de producción del 2026-09-28 (solo lectura), el stock **no** está desincronizado: al reconstruir `stock` desde
los 188 movimientos salen 0 descuadres contra las 160 filas. Lo que falla es que **cada pantalla define «stock» a su manera**:

| Dónde | Sedes | Cuarentena | Apartadas | Tallas retiradas | Pruebas |
|---|---|---|---|---|---|
| Catálogo (`fn_productos`, `fn_productos_resumen`) | toda la red + Taller | suma | no resta | suma | suma |
| Existencias (`lib/inventario-v2.ts`) | la elegida | fuera | resta | fuera | fuera |
| «% vs. semana» y valor por categoría (`fn_resumen_variantes`) | la elegida | fuera | no resta | fuera | suma |
| «Dónde más hay» / «En la red» (`fn_stock_por_sede`) | todas | suma | no resta | suma | suma |
| Buscar y Etiquetas | según el rol / la sede | suma | no resta | fuera | suma |
| Ajustar desde el Catálogo | la de la persona | según sububicación | no resta (la base sí) | suma | suma |

Y **ninguna escritura revisa el estado del catálogo**. `registrar_venta`, `iniciar_traslado`, `confirmar_traslado`,
`registrar_recepcion_traslado`, `ajustar_inventario`, `recibir_lote`, `recibir_compras`, `conteo_contar`, `cerrar_conteo`,
`mover_interno` y `mover_entre_piso_y_almacen` operan igual sobre una talla retirada, un producto descontinuado, uno pendiente
de aprobación o uno de prueba. Solo filtran algunas pantallas.

Casos reales del día:
- «Test de Produto 2»: 78 u., no marcado como prueba.
- «Prueba Pantalon»: 6 u. en tallas desactivadas.
- «Falda Milagros»: 60 u. en LIM, que el Catálogo muestra desde TRU como «Stock total 60».
- Existencias habla de «50 prendas» (producto + color) y el Catálogo de 33 productos.

## Decisiones de Felipe (2026-09-28)

**Qué es «stock»**
1. La tarjeta del Catálogo muestra **la sede elegida arriba, y aparte el resto** («+60 en LIM»).
2. **Se restan los apartados, y se avisa** («77 disponibles · 1 apartado»).
3. **Las dañadas (cuarentena) quedan fuera, con aviso aparte.**
4. **El Taller va aparte** («40 en taller»), no sumado a lo vendible.
5. **Lo que viene en camino se muestra aparte** («+6 en camino»).
6. **«Prenda» = el modelo** (el producto), con colores y tallas adentro, en las dos pantallas.
7. **El selector de sede cambia solo los números del Catálogo**, no qué productos se ven: el catálogo es de toda la empresa.
8. **Dos pantallas y un solo número:** Catálogo = qué vendemos; Existencias = cuánto hay y dónde. Las dos leen UNA función de la
   base y se enlazan entre sí. Una sola pantalla se descartó.
9. **La dueña de responder «cuánto hay» es Existencias.** Ajustar stock se hace **solo en Inventario**; se quita del Catálogo.
10. Desde el Catálogo, una prenda que está en otra sede se ve **y se pide** («Pedir a otra sede», que ya existe).

**Estados**

11. **Descontinuado = se vende lo que queda.** No se repone, no se compra ni se produce, no dispara «Reponer» ni «Pedir».
12. **Un descontinuado que llega a 0 en toda la red sale solo de las listas.** Queda en el filtro «Descontinuados» y reaparece
    si vuelve una unidad.
13. **Una talla con unidades o apartados no se retira:** primero se vende, se traslada o se ajusta.
14. **Pendiente de aprobación: se vende, y nada más** (no se compra, no se traslada ni se repone) hasta que el líder lo apruebe.
15. **Los candados de estado van en la base**, no en las pantallas.
16. **Palabras:** producto «Activo / Descontinuado»; talla «Activa / Retirada»; «Archivado» queda para lo que ya no se ve.

**Pruebas**

17. Son prueba: «Test de Produto 2», «Fhfh», «Prueba Pantalon», «Fdhh», «Y.j.j» (más «Producto de Prueba», ya marcado); «la mayoría», dijo Felipe.
18. Sobre si deben verse, Felipe no eligió ninguna de las opciones: **«hay que eliminarlos luego, pero dame la opción»**.
    Interpretación (Felipe la corrige si no es así):
    - mientras existan, las pruebas marcadas no suman en ninguna cifra (como hoy en Existencias);
    - el Catálogo tiene un filtro para encontrarlas y eliminarlas.
19. El botón elimina **solo si la prueba no tocó ventas reales**. Eso ya existe desde el ADR-0252 (en producción) para 5 de las
    6 pruebas.

**Operación**

20. **Primer stock:** la carga desde el alta (ADR-0212) queda abierta **hasta el 15 de octubre** («opción 2 o antes»).
    Después, solo por Recibir o Producción.
21. **Stock bajo = mínimo por talla y por sede**, con un valor por defecto de la categoría. Reemplaza las tres reglas de hoy.
22. **Venta de una talla en 0:** se permite, y queda **«por regularizar»**. Felipe lo vio pasar en caja: «alguien vendió algo
    diferente… o puso 2 en lugar de 1».
23. **Precio:** uno por producto que se aplica a todas sus variantes, con la posibilidad de cambiar el de una talla o un color. Hoy
    31 de 32 productos tienen un solo precio.
24. **Rebajas temporales** («prenda selecta», Halloween): **descuento con fechas mediante la etiqueta de campaña**, sin editar el
    precio. Ya está modelado (`20260918160000`, `20260918170000`) y es como lo hacen Shopify y Odoo (ver «Referentes»).
25. **Historial del producto:** todas las sedes, con filtro de sede.
26. **Color obligatorio** en toda talla (hoy los 5 Bodys no tienen).

## Decidí (técnico)

### 1 · `retail.fn_existencias(p_ubicacion_id uuid default null)` — contrato antes que código

- **PROMETE:** para cada talla (variante) y sede, los números que ninguna pantalla vuelve a calcular:
  - `fisico`: lo que hay;
  - `danado`: lo que está en cuarentena;
  - `apartado`;
  - `disponible` = físico − dañado − apartado, nunca negativo;
  - `piso_libre` y `almacen_libre`;
  - `en_camino`: lo enviado hacia esa sede y todavía no recibido. No incluye lo ya recibido de un traslado con diferencia.
- **ASUME:** `stock` es el reflejo exacto de `movimientos`. Lo garantiza `fn_aplicar_movimiento`, y el 2026-09-28 se verificó con 0
  descuadres. La cuarentena es la sububicación de tipo `cuarentena`.
- **DEJA AFUERA:** los productos de prueba y la pieza «Monto manual» (`11111111-…`). Incluye una talla retirada **solo si tiene
  unidades**, porque después de la decisión 13 eso es un estado imposible: si aparece, es alarma, no dato.

Todas las lecturas (`fn_productos`, `fn_productos_resumen`, `fn_stock_por_sede`, el `disponible` de `fn_resumen_variantes`, y en
la web `lib/inventario-v2.ts`, Buscar y Etiquetas) se rehacen encima de ella. Una prueba de CI falla si `apps/web` vuelve a sumar
`stock.cantidad` por su cuenta.

**Números:** 160 filas de stock hoy. En 3 años, como techo, ~400 productos × ~20 tallas × 4 sedes ≈ 32 000 filas. Sumarlas
agrupadas tarda milisegundos, así que no lleva caché ni vista materializada.

### 2 · `retail.fn_exigir_variante_operable(p_variante_id, p_operacion)`

Una sola regla, dentro de la transacción de cada escritura:

| Operación | Talla retirada | Descontinuado | Pendiente de aprobación | Prueba |
|---|---|---|---|---|
| vender, apartar | no | sí | sí | sí |
| contar | no | sí | sí | sí |
| trasladar | no | sí | no | sí |
| ajustar | solo a la baja | solo a la baja | no | sí |
| recibir de proveedor, producir | no | no | no | sí |
| reingreso por devolución o cambio | **sí, y reactiva la talla con aviso al líder** | sí | sí | sí |

Las pruebas pasan todo porque sirven para practicar. Se excluyen de las **cifras** (punto 1), no de las **operaciones**.

## Descarté

- **Una vista materializada o una columna calculada en `stock`:** con 32 000 filas como techo, la suma directa sobra, y una copia más
  es otra cosa que se puede desincronizar.
- **Arreglar pantalla por pantalla:** ya son seis definiciones; la séptima volvería a divergir.
- **Un trigger sobre `movimientos` para el candado de estado:** no sabe si el movimiento es una venta, una devolución o un traslado, y
  la regla depende de eso.
- **Hacer funcionar la casilla «Permitir venta sin stock» por producto** (la opción literal de Felipe en la pregunta 22): el desfase
  que él describe le pasa a cualquier producto, no a los que alguien marcó antes. En su lugar va un flujo general, con el visto del
  responsable, que reutiliza `prendas_por_regularizar` (ADR-0179). El stock nunca queda negativo. **Objeción registrada: Felipe
  confirma.**
- **Un botón que borre también ventas de prueba:** cambia la historia de una caja cerrada. La venta de prueba se marca
  (`ventas.es_prueba`) o se purga con la receta del ADR-0224, venta por venta.
- **Una sola pantalla fusionada:** Felipe eligió dos pantallas y un número.

## Se rompe si

- **Una pantalla nueva hace `from stock` directo.** Lo cubre la prueba de CI del punto 1.
- **Una clienta devuelve una prenda de una talla ya retirada.** La devolución no puede rechazarse: entra, reactiva la talla y avisa
  al líder (tabla del punto 2).
- **Dos personas: una retira una talla mientras la otra la recibe, en el mismo segundo.** El trigger de la decisión 13 y el
  candado del punto 2 leen `stock` y `variantes` con `for update` de la variante, así que gana la primera y la segunda recibe el
  mensaje.
- **Nadie resuelve las ventas «por regularizar».** Se acumulan y el stock se aleja de la percha. Por eso cada pendiente aparece
  en Inicio del líder con su antigüedad.

## Referentes (verificados el 2026-09-28)

- **Shopify** (help.shopify.com, «Discounts» y «Setting sale prices»): las promociones van como descuento automático con fecha
  de inicio y fin; el «compare-at price» se reserva para cambios permanentes, porque no se programa y hay que revertirlo a mano.
- **Odoo** (odoo.com/documentation, «Pricelists»): las reglas de precio por producto, categoría o variante tienen «válido
  desde/hasta» y aplican en el punto de venta.
- **En CAYLA** las dos ideas ya existen como etiqueta de campaña con % y fechas. Lo que falta es mostrarlo («antes S/90 · ahora
  S/70») en la tarjeta, la etiqueta y Vender (tarea #12).

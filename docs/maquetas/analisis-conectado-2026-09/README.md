# Análisis conectado: spike (2026-09-26)

`spike.html` se abre directo en el navegador: computadora (1440 px) y celular (375 px) lado a lado. La barra oscura
(no existe en el ERP) alterna lo que Felipe pidió **ver** antes de elegir: cómo se lista la tabla, qué va arriba, qué
pasa con Comparar, y quién mira (líder / integrante). ★ = lo recomendado. Datos inventados; los botones no navegan,
muestran a qué pantalla irían y con qué lista.

**Un spike no cambia la pantalla.** `/inventario/resumen` sigue igual hasta que Felipe elija y se implemente.

## Lo que Felipe pidió

Conectar Análisis con las pantallas nuevas, agilizar a la colaboradora y hacerla usable en el celular. Eligió las
cuatro conexiones (Bajar al piso/Trasladar, Etiquetas para rebajar, Pedidos no atendidos, Reponer por Compras/
Producción) y pidió analizar cuál conviene en cada caso. Tabla, «Arriba» y Comparar: pidió verlas en el spike.

## Diagnóstico de la pantalla actual (capturas del 2026-09-26, TRU)

Defectos (se arreglan elija lo que elija):
1. Las pestañas Desempeño/Comparar muestran una barra de scroll y cortan el texto en Safari
   (`overflow-x-auto` de `Pestanas`, `components/ResumenCabecera.tsx`).
2. En «Comportamiento del inventario» se pisan columnas: «Nunca vendió (1 día expuesto)» sobre Tendencia; «1 / 0»
   sobre el SKU.
3. Comparar con un período A anterior al historial muestra 0 y N/D→ en todo, sin decir por qué.

Fricción:
4. **La lectura dice qué hacer y no deja hacerlo** («liquidar o trasladar» es texto). `lib/resumen-acciones.ts`
   (`resolverAccion`, ADR-0121) ya arma esos enlaces y **ninguna pantalla lo usa** desde el rediseño.
5. 10 columnas por talla, casi todas N/D; la misma lectura repetida en todas las filas.
6. Cinco medidas parecidas (rotación valorizada/piso/total, sell-through clásico/de exposición), y el Top rotación
   dice 32× junto a la cifra de 0.25×: jerga sin salida para una colaboradora (principio 10).
7. Gráficos que no dicen nada con poco historial (Tendencia vacía; Distribución con todo en una barra).
8. Por talla, cuando Existencias ya lista por prenda (ADR-0237).
9. Celular: la tabla mide 81 rem de ancho mínimo (1296 px); filtros en dos lugares; no se puede escanear.

## Qué propone el spike

- **Cifras en palabras del negocio:** Vendido · Vendió de lo colgado (sell-through de exposición) · Piden algo hoy
  (lleva a «Qué hacer») · Quieto sin vender (unidades; el líder ve además el costo).
- **«Qué hacer»:** cinco grupos de trabajo que filtran la tabla y traen su acción: Se agotaron, Duermen en almacén,
  Estancadas, Pidieron y no había (Pedidos no atendidos), Las que más venden. «Recién colgada» no entra a ningún
  grupo: una línea lo dice una vez, en vez de repetirlo en cada fila.
- **La acción más adecuada por caso** (nunca cantidades, ADR-0231; nunca mueve stock, ADR-0121):

  | Lo que dice la prenda | Acción | A dónde lleva |
  |---|---|---|
  | Se agotó y hay en almacén | Bajar al piso | `/inventario/bajar?lineas=` |
  | Se agotó, no hay en almacén, otra sede tiene | Pedir traslado (solo líder: Mover solo le deja elegir origen a él, ADR-0237) | `/inventario/mover?destino=&lineas=` |
  | Se agotó y nadie tiene | Pedir a Producción / Reponer en Compras, según `origenAbastecimiento` y si el rol ve el módulo | `/produccion/ordenes`, `/compras/nueva` |
  | Duerme en almacén | Bajar al piso | `/inventario/bajar?lineas=` |
  | Estancada y otra sede sí la vende | Trasladar a esa sede | `/inventario/mover?origen=&destino=&lineas=` |
  | Estancada y nadie la vende | Rebajar (etiquetas nuevas) | `/etiquetas-de-precio?variantes=` |
  | Vende bien y una talla se corta | Bajar al piso esa talla | `/inventario/bajar?lineas=` |
  | Pidieron y no había | Según dónde hay | `/pedidos-no-atendidos` |

- **Marcar varias** (casilla o «Marcar las N» de un grupo) → barra abajo con Bajar al piso, Trasladar, Etiquetas y
  Reponer (líder). Mismos enlaces que Existencias (`enlaceBajar`/`enlaceMover` en `lib/existencias-prendas.ts`).
- **Detalle de la prenda** (panel en computadora, hoja en celular): por qué, 3 cifras, tallas con «Bajar» por talla,
  acciones, dónde más hay, y las rotaciones técnicas solo para el líder.
- **Celular:** tarjetas por prenda con su acción a la vista, grupos en lista, «Escanear prenda» fijo abajo (el mismo
  `EscanerBusqueda` de Existencias) para preguntar en el piso «¿esta se vende?».

## Lo que se compara en la barra

- **Tabla:** por prenda con curva de tallas ★ · por talla (menos columnas, acción por fila) · interruptor.
- **Arriba:** «Qué hacer» reemplaza los gráficos ★ · «Qué hacer» + gráficos plegados (ventas por semana, qué tallas
  salen, las que más venden) · solo gráficos.
- **Comparar:** en cada cifra («↑ 22 % vs 30 d antes») y A vs B a medida solo para el líder ★ · dos pestañas (arregladas,
  con el aviso honesto cuando A no tiene historial) · sin comparar.

## Pendiente de decidir (Felipe)

- Las tres de la barra.
- Si «Quieto sin vender» muestra costo al líder (hoy la pantalla ya muestra «Sin capital a costo»).
- Si «Pedir traslado» (traer de otra sede) queda solo para el líder o se abre a la integrante (pregunta abierta desde
  ADR-0231).
- Si Compras/Producción aceptan una lista inicial (`?variantes=`): hoy no la leen; el spike la supone.

# ADR-0513 — La ficha de consumo del modelo: una hoja, tres puertas

**Estado:** aceptada, **web y base en su PR; las 4 migraciones `20261026150000`…`20261026153000` esperan el OK de Felipe para pegarse en producción (en ese orden, y después de `20261026035000`, ADR-0510)** · **Fecha:** 2026-10-26 ·
**Decidió:** Felipe («ok hazlo» a la recomendación C del README de las maquetas, con sus valores por defecto; lista de 8 actividades aprobada con «ok avancemos») ·
**Sigue a:** ADR-0400 (decisión 6: la tela de la orden), ADR-0510 (editar la tela y los avíos de una orden abierta) · **Maquetas:** `docs/maquetas/consumo-modelo-2026-10/`

## Contexto

Cuánta tela lleva una prenda y qué avíos lleva solo se escribía de rebote, con una orden. Cuatro fallas, medidas en el código el 2026-10-26:

1. **`cerrar_produccion` pisaba lo declarado.** Con la primera orden cerrada escribía lo medido (metros ÷ buenas) en `producto_consumos.tela_por_prenda`: la cifra de Audaces
   se perdía, «volver a Audaces» era imposible y se contradecía P-21 (lo medido manda desde la 3.ª orden). Había 0 órdenes cerradas, así que todavía no se perdió nada.
2. **La tela era una sola cifra por prenda.** Una S y una M no gastan igual (en el ejemplo, +4,3 %), y la orden no podía saberlo.
3. **Los avíos se reescribían en cada orden**: el modelo no se acordaba de ellos.
4. **Corregir lo que el modelo ya decía exigía el permiso de Catálogo**, aunque quien sabe cuánta tela gasta es el Taller (el mismo error de ADR-0306).

## Decisión

DECIDÍ: **una sola hoja «Ficha de consumo» (`FichaDeConsumoHoja`) con tres puertas** —Nueva orden, la página de la orden abierta y Editar producto— que escribe la ficha DEL MODELO
con `guardar_ficha_consumo` (tela por talla o una cifra, y los avíos, todo o nada), y la lee con `fn_ficha_consumo` (una sola lectura). Producción edita (módulo parado en el Taller);
Catálogo la ve. Lo medido se escala sobre la forma de Audaces y manda solo desde la 3.ª orden cerrada **después** de la última declaración.

Las cuatro migraciones, apiladas:
- **`150000` — lo medido no pisa lo declarado.** `producto_consumo_medido` (una fila por orden cerrada) y `fn_consumo_efectivo` (qué manda: «declarado» o «medido» con ≥ 3 órdenes cerradas
  después de `producto_consumos.updated_at`). `cerrar_produccion` deja de escribir `producto_consumos`; declarar de nuevo reinicia la cuenta; una orden revertida deja de contar sola.
- **`151000` — tela por talla.** `produccion_insumos.consumo_por_talla` (jsonb `{talla: metros}`) y `producto_consumos.por_talla`. El plan por color es Σ(cifra de la talla × prendas de esa talla) × (1 + merma);
  `consumo_por_prenda` queda como el promedio ponderado (lo leen las pantallas de siempre). Una talla ajena a la orden se avisa (`insumo_talla_ajena`, solo en la base).
- **`152000` — avíos del modelo.** `producto_avios` con la forma de una fila de la orden; reemplazar la lista archiva las filas anteriores (no se borra); la primera orden con avíos los declara,
  y las siguientes los proponen solos (`fn_nueva_orden_opciones.avios_modelo`).
- **`153000` — la ficha.** `guardar_ficha_consumo`, `fn_ficha_consumo` y `reiniciar_consumo_medido` («Volver a Audaces»: las órdenes cerradas hasta hoy dejan de contar; no se borran).
  «Dejar como el del modelo» en abrir una orden deja de pedir el permiso de catálogo: quien abre la orden en el Taller es quien edita la ficha (una regla en las tres puertas, Brooks).

Contrato (Liskov), en el encabezado de cada migración. Lo que NO hace: no toca órdenes abiertas ni cerradas (su plan sigue congelado), no mueve stock ni costos, y los avíos **no** son por talla.

## DESCARTÉ

- **A · Declarar en Editar producto solamente**: la persona que sabe el número está parada en Nueva orden, no en el catálogo; seguiría reescribiéndolo en cada orden.
- **B · Que la orden «enseñe» al modelo sin hoja propia**: no hay dónde ver ni corregir la ficha, y lo medido no tiene dónde explicarse.
- **Bandeja en Catálogo para aceptar lo medido** y **preguntar al pasar al stock**: dos puntos de decisión nuevos para algo que P-21 ya decidió (3 órdenes). Se dejó automático, con «Volver a Audaces».
- **Pisar lo declarado con lo medido** (lo que hacía `cerrar_produccion`): pierde la cifra de Audaces y aplana S y M en un promedio.
- **Guardar un contador de «órdenes que cuentan»** en `producto_consumos`: se desencuentra con la realidad al primer revertir. Se cuenta al leer, contra la fecha de la declaración.
- **Dos funciones para guardar (tela y avíos)**: dos lugares donde la ficha queda a medias y donde un doble clic repite la mitad.
- **Avío por talla / por «familia» de avío**: Insumos no tiene familia de avíos; inventarla es otro módulo. Una fila por (avío, color) ya dice lo mismo.
- **Borrar las órdenes medidas al volver a Audaces**: pierde el historial. Solo se mueve la fecha de la declaración.

## SE ROMPE SI

- Dos personas guardan la ficha del mismo modelo a la vez: se forman en fila (candado por modelo); gana la última y lo de la primera queda archivado, no perdido. **Probado el 2026-10-26** con dos sesiones
  contra Postgres local: la segunda esperó 3 s a que la primera confirmara y ambas terminaron bien.
- Se renombra una talla en el catálogo: la cifra por talla guardada deja de calzar con las tallas del modelo (la hoja la muestra vacía y guardar pide reescribirla).
- Un avío de la ficha se archiva en Insumos: Nueva orden no lo propone y guardar la ficha de nuevo lo rechaza (`insumo_archivado`) hasta que se quite.
- Alguien edita `producto_consumos.updated_at` a mano hacia el pasado: contaría órdenes viejas. No hay camino de la API que lo haga.
- Se cambia el 3 de P-21 solo en un lado: la base lo tiene en `fn_consumo_efectivo` y la web en `ORDENES_PARA_QUE_MANDE_LO_MEDIDO`; la prueba de paridad los compara.

## Comprobaciones (2026-10-26)

- Postgres con `ROLLBACK`: `pruebas:produccion-cierre`, `pruebas:produccion-consumo-por-talla`, `pruebas:produccion-avios-modelo` y `pruebas:produccion-ficha-consumo` (20 casos, 3 con mutación comprobada: quitar el
  `clock_timestamp()` o la guarda «nada que reiniciar» hace fallar `O1`; el candado por modelo solo se prueba con dos sesiones, arriba).
- Web: reglas puras con su prueba (`orden-tela-reglas`, `orden-tela-editar-reglas`, `ficha-consumo-reglas`, `ficha-consumo-guia`), guías y huellas de las tres puertas, knip.
- Navegador (claro y oscuro, 1440 px): Nueva orden por talla, avíos que se proponen, la hoja guarda, la orden muestra «S 1.15 m · M 1.2 m», Editar producto abre la misma hoja, y con 3 órdenes
  cerradas de prueba la hoja muestra el historial y «Volver a Audaces» (con su pregunta). Un doble clic en «Guardar en la ficha» manda UNA llamada.

## Pendiente

- **Pegar las 4 migraciones en producción** (Felipe), en orden, cada una como una sola parte; después `pnpm datos:generar:produccion` para sumar `producto_avios` y `producto_consumo_medido` al diccionario.
- `/formidable` de la hoja (la califica Felipe con un agente ciego) y `/chaos` completo; aquí solo se probaron el doble clic y la edición simultánea.
- Avío por talla (una etiqueta de la S y otra de la M): hoy son dos avíos de Insumos.

# ADR-0515 — Corregir el costo de la última compra de una prenda

**Estado:** aceptada; migración `20261026160000` **en el repo, sin pegar en producción** (espera el OK de Felipe) ·
**Fecha:** 2026-10-26 · **Decidió:** Felipe (2026-10-24: solo la última compra; el costo que mueve la evolución son solo las compras y los cierres del Taller; el 2026-10-26: un solo costo para todas las variantes de la compra y las ventas ya hechas no se tocan) ·
**Sigue a:** ADR-0067 (costo promedio ponderado), ADR-0183 (el costo solo lo ve quien ve el dinero), ADR-0161/0162 (responsable), ADR-0195 (políticas y deadlocks), `20261024223000` (la pestaña «Costo» del Historial)

## Contexto

El costo de una prenda es el promedio ponderado de sus compras: cada «Recibir mercadería» deja una fila por variante en `costo_historial` (cuántas había, a
cuánto, cuántas llegaron, a cuánto, en cuánto quedó) y mueve `variantes.costo`. Si quien recibió tecleó mal lo que costó lo que llegó, el promedio queda mal:
la ficha no deja editar el costo de una prenda que ya tuvo compras (`variantes_costo_hasta_la_primera_compra`) y `costo_historial` es de solo lectura. La
pestaña «Costo» (PR #1335) hizo visible el error y no daba cómo arreglarlo.

## Decisión

**Un líder puede corregir el costo de lo que llegó en la ÚLTIMA compra de una prenda, con un motivo.** Lo demás se queda como está.

- **Solo la última.** Una compra más vieja ya está mezclada con todo lo que llegó después: corregirla reescribiría el promedio de las siguientes.
- **Es una corrección, no una compra nueva.** La línea del costo no se mueve por ella: sale aparte, en «Errores arreglados», como «costo de la compra ②»,
  con su antes, su después, el motivo y quién (decisión de Felipe, 2026-10-24).
- **Un solo costo para todas las variantes de la compra** (Felipe, 2026-10-26): la pantalla dice UN «llegaron a S/ X» por compra.
- **Las ventas ya hechas no se tocan** (Felipe, 2026-10-26): guardaron el costo con el que salieron y un cierre ya reportado no cambia. El margen de lo vendido
  entre la compra y la corrección queda calculado con el costo equivocado; si Felipe lo quiere recalculado, es una decisión aparte (toca más de un módulo).
- **Solo compras, no cierres del Taller.** El costo de un cierre sale de su orden de producción, no de un monto tecleado: se corrige allá (`costo_del_taller`).
- **La factura no cambia.** Lo que se debe al proveedor es lo que dice el documento; esto corrige el costo con que la mercadería entra al inventario. Si la
  factura misma está mal, es otro arreglo.
- **Solo un líder** (`fn_es_lider`), firma el responsable del combo (`fn_actor_persona_id(true)`) y el motivo es obligatorio (3 a 300 letras).
- **Un costo fuera de lo normal se confirma** (ADR-0298; lo encontró `/chaos` el 2026-10-26 y Felipe pidió aplicarlo): corregir a S/ 1950 una prenda de S/ 18
  se guardaba sin preguntar, el mismo error que esta función existe para arreglar. La corrección llama a `fn_costo_fuera_de_banda`, la regla de Recibir y del
  Taller, contra el costo vigente y el precio de cada variante de la compra; si sale de la banda y no llega `p_confirma_costo`, rechaza con `costo_atipico`
  (el dato en `detail`, lo que ya lee `lib/costo-atipico-reglas.ts`) sin escribir nada. La hoja lo muestra con `AvisoCostoAtipico` («Corregir el costo» o
  «Confirmar y guardar») y la línea queda anotada (`costo_atipico_confirmado`).

### Cómo (20261026160000)

| Pieza | Qué hace |
|---|---|
| `costo_correcciones` | Tabla nueva, solo agrega (candado `create or replace trigger`), RLS encendido y sin políticas (la lee y escribe solo código `security definer`). Una fila por fila corregida de `costo_historial`: su antes, su después, el costo anterior y el resultante recalculados, el motivo y la persona. `creado_en` usa `clock_timestamp()` para que dos correcciones en una transacción sigan en orden. |
| `fn_costo_historial_efectivo(producto)` | `costo_historial` con la última corrección de cada fila aplicada. Es lo que lee `fn_costo_de_la_prenda`: el gráfico y la tabla usan el costo bueno y `costo_historial` queda idéntico para siempre (principio 4). |
| `fn_costo_correccion_calculo(producto, compra, costo)` | La cuenta de corregir, compartida por la vista previa y el guardado: la misma fórmula de `fn_recalcular_costo_variante`, `(stock_previo × costo_anterior + cantidad × costo) / (stock_previo + cantidad)`; una variante que llegó dos veces en la misma compra (dos facturas) encadena. |
| `fn_costo_compra_corregible(producto, compra)` | Las reglas de «¿se puede?» y el candado de las variantes. |
| `corregir_costo_de_compra(producto, compra_en, costo, motivo, confirma)` | Guarda: escribe las líneas, recalcula `variantes.costo` y anota Actividad (sin montos). |
| `previsualizar_correccion_de_costo(...)` | Solo lectura: «Hoy cada prenda te cuesta S/ 19.57; con la corrección, S/ 19.49», para la hoja. |
| `fn_costo_de_la_prenda` | Nueva versión (`create or replace`): lee el historial efectivo y devuelve `correcciones[]` y `puede_corregir`. |

**Estados imposibles que se cierran:**

- *Una compra nueva y una corrección a la vez.* Se toman las variantes de la prenda `for no key update`, en orden de id: las mismas filas que bloquea
  `fn_recalcular_costo_variante` al recibir. Si la compra nueva gana, la corrección ve que ya no es la última y falla (`costo_no_es_la_ultima`): nunca corrige una
  compra a la que ya se le sumó otra. Si ganan dos correcciones, la segunda cae en `costo_sin_cambios`, que la web toma como hecho (un doble clic).
- *Un costo que no es el que dejó su última compra.* Antes de escribir se comprueba que `variantes.costo` de cada variante sea el resultante de su última fila
  (`costo_desalineado`): si algo lo movió por fuera, no se pisa.
- *Reescribir la historia.* `costo_historial` no se toca (huella idéntica en la prueba) y `costo_correcciones` no se edita ni se borra.

### En la web

- La fila de la **última** compra de una prenda (solo si es una compra, y solo para un líder) lleva un «⋯» que abre la hoja `CorregirCostoModal`
  (`<Modal tamano="angosta">`): el costo correcto, ¿qué estaba mal?, la vista previa que pide a la base, el combo «Responsable» y Cancelar / Guardar.
- Guía de foco (`lib/costo-correccion-guia.ts`, una prueba exige que «se puede guardar» según la guía sea exactamente `problemaDeLaCorreccion === null`) y guía
  interactiva (cuatro pasos nuevos que abren la hoja y la cierran sin guardar).
- La lógica es pura y probada (`lib/costo-correccion-reglas.ts`): las mismas reglas que repite la base.

## Descarté

- **Corregir cualquier compra.** Reescribiría el promedio de lo que llegó después y lo vendido.
- **Editar `costo_historial` o sobrescribir la fila.** Es el registro de lo que pasó; se agrega la corrección, no se reemplaza.
- **Un costo por variante.** La pantalla dice un «llegaron a S/ X» por compra; Felipe prefirió uno solo.
- **Recalcular las ventas ya hechas.** Cambiaría cifras ya cerradas; queda como decisión aparte.
- **Corregir un cierre del Taller.** Su costo sale de su orden de producción.
- **Un módulo nuevo en Roles y accesos.** Es una acción dentro de una pantalla que ya existe (ADR-0306), y el candado es «solo del líder» en la función.

## Verificación

- `pnpm pruebas:costo-corregir-compra` (en el CI): sin sesión nadie corrige; costo y motivo inválidos; solo la última; el Taller no; encadena dos líneas de una
  misma variante; las demás variantes no cambian; `costo_historial` idéntico; la tabla solo agrega; la web no lee la tabla ni llama a las funciones auxiliares; la
  vista previa coincide con lo guardado; el doble clic cae en «sin cambios»; una segunda corrección parte de la primera. Corre como el rol `authenticated`.
- `lib/costo-correccion-reglas.test.ts`, `lib/costo-prenda-reglas.test.ts`.
- `/chaos` (semilla 515, 2026-10-26): inyección en el motivo, motivos de 0 a 301 letras, 12 costos hostiles, ids raros, una integrante y la sesión anónima, stock en cero, variante nueva o desactivada, 30 correcciones seguidas y 5 escenarios de concurrencia (corregir ‖ compra nueva en los dos órdenes, dos correcciones iguales y distintas, leer mientras se corrige) con la base restaurada. Resistió todo salvo el costo sin banda, ya arreglado.
- Navegador: la hoja abre desde el «⋯» de la última compra y de ninguna otra, la guía pasa del costo al motivo y a quién firma.

## Pendiente

- Pegar `20261026160000` en producción **con el OK de Felipe** (una sola parte, sin políticas ni `alter` de tablas en uso: ADR-0195 no aplica) y refrescar el
  diccionario de datos (`costo_correcciones`).
- Probar con una cuenta de líder real: la hoja contra la base de producción.
- Los arreglos de costo hechos entre el 23 y el 26 de septiembre quedaron anotados como `costo` y no salen en «Errores arreglados».

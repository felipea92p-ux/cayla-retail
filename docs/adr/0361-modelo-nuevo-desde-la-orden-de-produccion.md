# ADR-0361 · Modelo nuevo desde la orden de producción: ida a Nuevo producto y vuelta con la orden lista

- **Fecha:** 2026-10-07 · **Estado:** **primera parte construida; la decisión de fondo está REABIERTA** (ver «Actualización 2026-10-09»). Lo construido se
  verificó en una copia de `main` (tipos, lint, las 381 pruebas del web y el recorrido en el navegador con datos de ejemplo). **Sin migración de base de
  datos.** Falta probarlo contra datos reales en local y pasar `/chaos` y `/formidable` (ver el backlog de la rama).
- **Pedido:** Felipe, 2026-10-07: «debemos rescatar la forma en que se creaban las órdenes» y «obviamente mejorarlo». De las tres formas que se le
  propusieron eligió la 1, **«alta rápida dentro de la orden»**; este ADR explica por qué se construyó como **atajo y retorno** y no como un
  formulario dentro de la hoja, y qué queda abierto.
- **Complementa:** ADR-0133 (Producción), ADR-0109 y ADR-0284 (Nuevo producto y su guía), ADR-0294 (un nombre por marca), ADR-0347 (motor de demanda
  en Nueva orden), ADR-0161 (módulos y roles), ADR-0358 (una función, una pieza).

## El problema

El 22-jul-2026 una corrida se registraba en un solo formulario: modelo nuevo o existente, tela, avíos, precio a tienda, tallas y colores escritos
a mano, y el costo por prenda con su semáforo al instante. Desde el 2026-09-15 una orden **solo puede producir un modelo que ya existe en el
catálogo con sus variantes** (`abrir_produccion` recibe `variante_id`; las variantes nacen en Productos, con su código y su precio, nunca al vuelo
desde una orden: en V1 eso dejó colores duplicados y prendas sin precio). Hoy, para producir un modelo nuevo, la persona tenía que **salir de
Producción, adivinar que se crea en Productos, crearlo y volver a abrir la orden a mano**. Ese era el hueco.

## Qué cambió (y qué no)

**No cambió ninguna regla del catálogo, de dinero, de stock ni de permisos, ni ninguna función de la base.** Cambió el recorrido.

| Antes | Ahora |
|---|---|
| «¿Falta una talla o un color? Se agrega en Productos» (un enlace a la lista, sin retorno) | Bajo «Modelo»: «¿El modelo es nuevo? Créalo en Productos y vuelves aquí con la orden lista» → Nuevo producto con `?desde=produccion&tipo=…` |
| Al guardar el alta, las salidas eran fotos, otro parecido o la lista de productos | Si venía de una orden, la **salida principal es «Abrir la orden de producción/muestra»**: vuelve a Órdenes con `?nueva=<modelo>&tipo=…`, el modelo ya elegido y su matriz de tallas y colores lista. Las fotos pasan a secundaria |
| Sin modelos en el catálogo: un aviso y el botón apagado | El mismo aviso con **«+ Crear el primer modelo»** (o a quién pedírselo, si la cuenta no edita el catálogo) |
| El margen y el semáforo de «Nueva orden» desaparecían para el líder si fallaba la lectura de la red (`decision.datos` nulo) | El líder los ve siempre: dependen del precio y del costo, no de la red |
| Un modelo sin precio no decía nada: el margen simplemente no salía | «Este modelo no tiene precio en el catálogo, así que no hay margen que calcular» con enlace a Editar producto (solo líder) |
| La pista de la matriz enviaba a `/productos` | Envía a **Editar producto de ese modelo** (quien edita el catálogo) o dice a quién pedirlo |

## Decisiones

1. **No se copia el alta del catálogo dentro de la hoja de «Nueva orden»** *(reabierta el 2026-10-07: ver la actualización al final)*. Se evaluó y se descartó por cuatro hechos del propio repo: (a) Nuevo
   producto es **página propia y no modal por decisión escrita** (la tabla talla × color puede llegar a 9 × 8; mismo criterio que `/compras/nueva`);
   (b) la base **exige tejido y patrón en Indumentaria**, con sus catálogos habilitados por categoría (`tejido_obligatorio`, `patron_obligatorio`);
   (c) el nombre es **único por marca** y la pantalla avisa mientras se escribe (ADR-0294); (d) las tallas deben estar **habilitadas para la categoría**.
   Un formulario paralelo duplicaría esas reglas y se desfasaría de ellas (principio 3; «una función, una pieza», ADR-0358).
2. **Todo viaja por la URL**, no por estado escondido (`lib/modelo-nuevo-orden-reglas.ts`): `desde=produccion` marca el origen y `tipo` conserva si
   era producción o muestra (una muestra suele ser la **primera** orden de un modelo nuevo). Un parámetro roto cae al valor de siempre, nunca
   rompe la pantalla (probado). La pantalla de éxito lee la URL por sí misma, así `NuevoProductoForm.tsx` —el archivo más disputado del repo según
   `SESIONES-ACTIVAS.md`— **no se toca**.
3. **Permiso:** el enlace de ida y el de «Editar producto» solo se ofrecen con `puede(persona, "editarCatalogo")` (en la base, `fn_puede_editar_catalogo()`:
   el líder **o un rol que ve Productos o Atributos**, no solo el líder). Es visibilidad: el candado real sigue en la base y en la página de destino,
   que ya redirige a quien no lo tiene.
4. **El margen sigue siendo solo del líder.** No se amplió ningún permiso: `decision` solo le llega al líder, y esa es la señal que decide si se ve el
   margen. Lo único que cambia es que ya no depende de que la red responda. Quien no es líder sigue viendo el costo por prenda, como antes.
5. **El costo por prenda sale de la fórmula de siempre** (`costoUnitario` y `semaforoMargen` de `lib/produccion-reglas.ts`), la misma que usa la base
   (`producciones.costo_unitario`, a 2 decimales) y la tarjeta de la orden, en vez de una cuenta propia del formulario.
6. **Sin conexión no hay enlace de vuelta:** el producto aún no tiene `id` (queda en la cola, ADR-0210). La pantalla de éxito lo dice y manda a abrir la
   orden desde Producción cuando el producto suba.

## Alternativas descartadas

- **Mini-alta dentro de la hoja** (nombre, categoría, tallas, colores, precio): la opción que se imaginó primero; ver la decisión 1.
- **Una RPC atómica `abrir_produccion_con_modelo_nuevo`** (crear el modelo y abrir la orden en una transacción): sería lo más limpio contra «cero estados
  inconsistentes», pero exige **una migración en producción** (decisión de Felipe) y reimplementar las exigencias del alta. Hoy no hace falta: crear un
  modelo sin abrir su orden no deja ningún estado imposible (es solo catálogo, sin stock), y el alta es idempotente por su token. Queda como endurecimiento
  posible si algún día el recorrido de dos pasos resulta lento para el Taller.
- **Ampliar el margen a todo el Taller:** es un permiso sobre dinero y precios; es de Felipe.

## Actualización 2026-10-09 — Felipe reabre la decisión 1

Al ver «Nueva orden» con la pestaña **Muestra** y un modelo ya existente, Felipe dijo: «el Taller no necesariamente crea productos ya existentes». Tiene razón,
y lo que esta primera parte resuelve es menos de lo que parecía:

- **Qué sí resuelve:** quien edita el catálogo (el líder, o un rol con Productos) ya no tiene que adivinar el camino ni volver a abrir la orden a mano.
- **Qué no resuelve:** quien opera el Taller pero no edita el catálogo ni siquiera ve el enlace «Créalo en Productos», así que sigue dependiendo de un líder.
  Y una **Muestra** (patronaje → muestra → escalado, donde el escalado define las tallas) es por definición el desarrollo de un modelo que **todavía no existe**:
  exigir que esté completo en el catálogo antes de desarrollarlo invierte el proceso real.
- **De dónde venía la regla:** ADR-0051 punto 5 (2026-09-15, «al comparar con V1»), que prohibió crear variantes desde la orden por tres problemas reales —prendas sin
  precio, colores duplicados («Negro»/«negro») y SKUs a ciegas—. El remedio quitó también una necesidad legítima: el problema era el **texto libre**, no el momento
  de crear el modelo.
- **Precedente en el propio repo:** la alta al vuelo del censo (`20260918020000_censo_alta_al_vuelo.sql`, Felipe 2026-09-18) resolvió lo mismo para las
  encargadas: `censo_crear_variante` sin el candado del líder, con tallas y colores del vocabulario (talla activa y habilitada para la categoría, color activo), el
  producto nace `pendiente` por el disparador `productos_estado_alta_biut` y se puede usar de inmediato, y un líder lo revisa después.
- **Lo que sigue (pendiente de aprobar por Felipe, no construido):** «+ Modelo nuevo» dentro de la orden, con una función nueva
  `abrir_produccion_con_modelo_nuevo` que crea el modelo y abre la orden en **una sola transacción** (un solo token) siguiendo ese precedente y llamando a
  `abrir_produccion` sin tocarla. Es la «RPC atómica» que esta ADR dejó como alternativa descartada: queda **reabierta**. Cuando se construya, este ADR se
  reescribe y se ajusta el punto 5 del ADR-0051.
- **Esta primera parte se conserva** como el camino de la alta completa (con fotos, tejido y patrón) para el líder.

## Cómo se verifica

- Pruebas: `lib/modelo-nuevo-orden-reglas.test.ts` (14): tipo y origen desde la URL con basura y con parámetros repetidos, ida y vuelta conservan el
  tipo, el id se codifica igual que los otros enlaces a «nueva orden» (Análisis, Resumen), y las dos rutas existen y leen esos parámetros.
- En el navegador (copia de `main`, componentes reales, datos de ejemplo): el tipo llega preelegido; el líder ve margen y «Gana» con la red caída; el
  modelo sin precio avisa; quien no edita el catálogo no ve ningún enlace de alta ni de edición; la pantalla de éxito ofrece la orden como salida
  principal (`/produccion/ordenes?nueva=<id>&tipo=muestra`) y, sin origen o sin conexión, queda como antes.

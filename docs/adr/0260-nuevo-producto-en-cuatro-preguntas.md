# ADR-0260 · Nuevo producto en cuatro preguntas, una sola tabla y crear sin salir

- **Fecha:** 2026-09-28 · **Estado:** aceptado (implementado; falta probarlo con una cuenta real). Sin migración.
- **Pedido:** Felipe, 2026-09-28: «siento que puede tener un mejor diseño y distribución y ser más intuitivo». Se
  hizo un spike (`docs/maquetas/producto-nuevo-v2-2026-09/`, PR #548), Felipe lo ajustó en la misma conversación y
  pidió implementarlo «así como el diseño».
- **Sucede a:** ADR-0197 (Nuevo producto en cuatro pasos). Conserva ADR-0109 (árbol de decisión, marca y proveedor),
  ADR-0212 (stock de hoy), ADR-0228 (fotos revisadas), ADR-0246 (temporada) y ADR-0256 (foto o dibujo del tejido y
  del patrón).

## Qué había

Después del ADR-0197 se sumaron temporada, etiquetas con dibujo, fotos revisadas y el stock de hoy. Todo cayó en el
paso 3 o en un quinto paso: «Cómo se hace» tenía 7 campos, la tabla talla × color se dibujaba dos veces (variantes en
el paso 4, stock en el 5), cada color aparecía 4 veces y había tres marcadores de avance a la vez. Un color que faltaba
se creaba en otra pestaña.

## Decisión

**Cuatro preguntas** (`PASOS_ALTA = [1, 2, 3, 4]`, `pasoDeProblema` en `lib/alta-producto.ts`):

| Paso | Qué lleva |
|---|---|
| 1 · ¿A qué categoría pertenece? | Buscador + familias (sin «las que más usas»). Avanza solo. |
| 2 · ¿Cómo es? | Nombre, descripción (a la vista, opcional), marca y proveedor, tejido y patrón (`ElegirMuestra`); temporada y etiquetas en «Temporada y etiquetas · opcional» (`PlegableAlta`; abierto al llegar al paso, plegable — Felipe 2026-09-29). |
| 3 · ¿En qué tallas y colores? | `ElegirTallas`, `ElegirColores` y UNA tabla (`MatrizVariantes`) con la foto de cada color en su fila. |
| 4 · ¿Cuánto cuesta y cuántas hay? | Precio, costo y margen; la misma tabla con cantidades o «¿Alguna cuesta distinto?» (`MatrizCantidades`), «Llenar todas con», dónde están, «Quién lo registra» y «Crear producto» en el pie. |

Reglas que valen para cualquier lista larga del alta (volumen de producción al 2026-09-28: 47 categorías, 76 colores,
27 tallas, 24 tejidos, 9 patrones, 84 marcas, 78 proveedores):

- **A la vista, nunca más de 5–6 opciones por campo**: las de la categoría. El resto va detrás de **«Ver todos · N»**,
  una hoja (`<Modal variante="hoja">`) con buscador sin tildes. **Lo elegido nunca se esconde**: si vino de la hoja,
  pasa al primer lugar.
- **Sin «lo más usado»** en categoría, marca y proveedor, ni colores (Felipe): se busca o se toca en la carta.
- **Crear va primero y fijo** en la lista (`ComboBuscable crearArriba`), además de un enlace siempre visible
  («¿No está? + Registrar una marca o un proveedor nuevo», «+ Nuevo color», «+ Proveedor nuevo»).
- **Un elegido se ve en un solo lugar y de una sola forma** (colores: píldoras con ×), y **hay una sola forma de quitar
  cada cosa** (la talla arriba, el color con su ×, la combinación que no existe tocando su celda).
- Palabras de tienda: sin «obligatorio» en rojo (se marca lo opcional), «Solo las de siempre» en vez de «curva
  habitual», «Ninguna» en vez de «sin temporada propia», «Buen margen»/«Margen bajo».

**Crear sin salir del alta**, con lo que la base ya tenía:

- **Marca o proveedor** (`NuevaMarcaForm`, «Registrar marca o proveedor»): marca nueva con proveedor existente o
  nuevo, y un proveedor nuevo para una marca que ya existe (`crear_marca` suma el vínculo en `marca_proveedores` si la
  marca existe; `registrar_proveedor` antes si el proveedor es nuevo). Una pareja que ya existe se avisa y no se
  duplica.
- **Color** (`NuevoColorAlta`, con el mismo `SelectorColor` de Atributos: muestra + #hex o RGB; actualización 2026-09-28): `POST /api/productos/colores` (el mismo de Catálogo → Atributos) con nombre, código
  sugerido (`sugerirCodigoColor`), familia y tono; nace pendiente si quien lo crea no es Líder, y se puede usar ya.
- **Tejido, patrón o talla del catálogo que la categoría no ofrece**: se ofrece a la categoría (`guardarEjesCategoria`)
  desde la hoja, con su combo Responsable, igual que el «Ver más» de `main`. La base exige que la talla esté en la
  categoría (`crear_producto_con_variantes`).

**Cabecera:** la de Ventas (`EncabezadoPagina`), igual que Productos desde ADR-0254 (Felipe, 2026-09-28): sede y hora
con el hilo, «Nuevo producto» y su frase; la vuelta «← Productos» va bajo la frase (`pie`), como «← Existencias» en
Bajar al piso.

## Efecto fuera de Nuevo producto (revisado)

- `ComboBuscable` ganó `crearArriba?` y `crear.pista?`, opcionales: ningún otro uso los pasa, no cambia nada para ellos.
- `ElegirMarcaProveedor` lo usan también **Editar producto** y el **censo de Conteo**. Allí se conservan los chips
  «Lo más usado» (prop `sugerencias`, por defecto `true`; el alta pasa `false`): Felipe pidió quitarlos en el alta, y en
  el censo son el atajo de cientos de escaneos. Ahí sí cambia que el buscador muestra parejas marca·proveedor de la A a
  la Z y que registrar abre el formulario nuevo.
- `NuevaMarcaForm` lo usa también **Catálogo → Marcas**: ve el formulario nuevo y su botón dice «Registrar».

## Diferencias con el spike (a propósito)

- «+ Nuevo color» abre su formulario bajo el buscador, no al pie de la carta: con la carta abierta de entrada, al pie
  quedaba fuera de la vista.
- La hoja de tejidos no agrupa «Del catálogo» por familia (Naturales, De punto…): la base no tiene ese dato.
- Sumar un tejido/patrón/talla del catálogo pide el Responsable dentro de la hoja (ADR-0161): es un guardado.
- La foto «para todos los colores» va en una línea bajo la tabla; «N fotos» abre una hoja para quitar fotos.
- El stock inicial arranca en almacén con el chip «En piso de venta» (`062f14af`, posterior al spike), y se conservan el
  aviso al salir sin crear (`1f48f9d5`) y la imagen real de tejidos y patrones (`5f5dd580`).

## Cómo se verificó

`tsc` limpio, `vitest` completo en verde (219 archivos), reglas nuevas con pruebas (`muestras-alta-reglas`,
`color-alta-reglas`, `marca-proveedor-reglas`, `tabla-alta-reglas`, `alta-producto`). Recorrido completo en el navegador
(escritorio y 375 px) con una página temporal y un catálogo de ejemplo, sin sesión: por eso no se probó guardar.

## Actualización 2026-10-06 — los 4 puntos de avance en lugar de los números, las líneas plegadas y la lista «Avance»

**Pedido de Felipe** (mockup aprobado en la lámina «E · El registro de hoy, con la barra de avance» del lienzo
https://claude.ai/artifact/WSGQs3a9bH2L5hLtqakSh6): quitar el marcador de avance de hoy y poner arriba una barra de puntos,
**sin cambiar nada más del formulario** («la información del formulario no quiero que cambie en nada»).

**Qué cambió (solo esto):**
- **Arriba de los pasos, 4 puntos** unidos por una línea (`components/alta-producto/PuntosAvance.tsx`, lógica pura en
  `lib/puntos-avance.ts` con su prueba, estilos en `app/estilos/puntos-avance.css`). Van de borde a borde del formulario y quedan
  pegados bajo la cabecera de la app mientras se baja. Debajo de cada punto, su nombre (Categoría · Cómo es · Tallas y colores ·
  Precio y cantidad; en celular «Tallas» y «Precio») y su estado: **Listo** (verde con ✓, que se dibuja una vez), **Estás aquí**
  (verde, más grande, **late todo el tiempo**: excepción de ADR-0136, act. 2026-10-06), **Sigue** (el próximo, con borde verde) o
  **Por revisar** (viene armado tras «Crear otro parecido»). La línea verde se llena hasta el punto donde está la persona.
- **Un punto hecho se toca para volver a su paso**; al dejar el mouse encima dice lo contestado («Indumentaria › Vestidos»), que antes
  decía la línea plegada.
- **Se dibuja solo el paso abierto**, sin número: se quitaron el círculo 1–4, las líneas plegadas de los pasos hechos («… Cambiar») y
  las punteadas de los que vienen. El contenido del paso usa todo el ancho de la tarjeta (antes empezaba 56 px adentro, alineado con
  el título tras el número).
- **«← Atrás»** al pie de los pasos 2, 3 y 4, antes de «Seguir →» / «Crear producto»: vuelve al anterior sin borrar nada.
- **Sin la lista «Avance» de la ficha** (escritorio y la hoja «Ver» del celular): repetía lo mismo que los puntos.
- **La vuelta a Productos es la flecha junto a la sede** (ADR-0220, act. 2026-10-06), igual que en las demás pantallas con esa cabecera.

**Lo que NO cambió:** los campos, su orden y sus textos; lo que arranca abierto («Temporada y etiquetas» y la carta de colores); la guía
de foco (marcas, «Sigue aquí», «Falta: …» tocable); las reglas de qué falta y qué se puede abrir (`lib/alta-producto.ts`, sin tocar);
la ficha de la derecha («Cancelar», «Crear producto», «Siguiente: …»); y el guardado (misma RPC, sin migración).

**Descarté:**
- **Rayas en vez de puntos** (la primera versión de la lámina): Felipe pidió puntos que se iluminen con su texto al lado.
- **Dejar las líneas plegadas de los pasos hechos:** con los puntos eran dos marcadores para lo mismo; lo contestado se lee en la ficha
  y en el `title` de cada punto. Lo que se pierde a la vista es el resumen de tallas y patrón de un paso hecho (está en su punto y al
  volver a él).
- **Un latido de unos segundos y quieto:** Felipe eligió que lata todo el tiempo.

**Cómo se verificó:** `tsc` y `eslint` limpios; `lib/puntos-avance.test.ts` (8 casos) y la suite completa de `vitest`. Recorrido en
el navegador contra el ERP local con la cuenta de prueba `admin` (Playwright, sin crear el producto): paso 1 → 2 → 3, «← Atrás»
conserva el nombre, 3 → 4, el punto «Categoría» vuelve al 1; la barra queda pegada bajo la cabecera (62 px en escritorio, 56 en
celular) y el título del paso abierto cae bajo ella (`scroll-mt-[11.5rem]`). A 1440 px y a 375 px, en claro y en oscuro, sin
desborde ni nombres encimados. `tema:auditar` en `/productos/nuevo`: 0 hallazgos solo en oscuro (los 6 «heredados» son del buscador
de la cabecera y de las tarjetas de familia, anteriores a este cambio). La base local no tiene patrones en ninguna categoría, así que
el recorrido completo se hizo con Bisutería (no exige tejido ni patrón).

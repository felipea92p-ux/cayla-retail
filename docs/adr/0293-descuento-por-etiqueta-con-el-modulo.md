# ADR-0293 · El descuento por etiqueta deja de ser solo del líder

- **Fecha:** 2026-09-30 · **Estado:** implementado y probado en local (base de copia: `pruebas:roles`, `pruebas:terminales` y `pruebas:etiquetas-aprobar`
  en verde; suite web y `tsc` en verde). Migraciones `20261001130000` (funciones y catálogo) y `20261001130100` (política), **aplicadas en
  producción el 2026-09-30** (cada una en su llamada, verificadas después); **la web falta por fusionar**.
- **Decide:** Felipe, 2026-09-30, al ver que «Para liquidar» y «Últimas unidades» no aparecían al crear un producto desde la cuenta
  «Almacén Trujillo»: *«que aparezca para todos; también las configuraciones tienen que aparecer para todos los que tengan el módulo».*
- **Reemplaza en parte:** ADR-0160 (etiquetas con descuento «solo del líder», `fn_puede_dar_descuento_por_etiqueta`) y la excepción B2b del
  ADR-0161 («poner etiquetas con descuento a una prenda» en la lista «siempre solo del líder»). El resto de esa lista sigue igual.

## Problema

«Para liquidar» (20 %) y «Últimas unidades» (15 %) son las dos etiquetas de Rotación que llevan descuento. Desde el ADR-0160 poner o
configurar un descuento por etiqueta era solo del líder, y **la regla se hacía cumplir escondiendo, no explicando**:

- Al crear una prenda, `repartirEtiquetas` quitaba de la lista las etiquetas con descuento si quien creaba no era líder. Una terminal de
  almacén veía Nuevo, Top ventas, Hecho a mano… y **nunca** «Para liquidar» ni «Últimas unidades». El único rastro era una línea de letra
  chica al pie del campo.
- En Catálogo ▸ Atributos ▸ Etiquetas esas dos tarjetas salían **sin «Prendas» ni «Configurar campaña»** para quien no era líder, y en el
  editor de campaña la casilla de descuento venía deshabilitada («Solo un líder pone descuento»).

La gente concluía que las etiquetas faltaban. El diseño anterior evitaba un estado imposible (una terminal colgando un descuento) pero dejaba
a la persona sin saber que existía.

## Decisión

1. **Al crear una prenda** cualquiera que pueda darla de alta (`fn_puede_editar_catalogo()`, el candado de la primera línea de
   `crear_producto_con_variantes`) le pone **cualquier etiqueta aprobada, con descuento o sin él**. La lista ya no se filtra por rol.
2. **La configuración** —descuento, fechas y categorías de la campaña, aprobar y archivar, «Prendas» de una etiqueta con descuento, crear una
   etiqueta ya con descuento— es de quien tiene el módulo **Etiquetas** (`fn_puede_editar_etiquetas()`), sea líder o no. Desde el ADR-0161
   «quien ve un módulo hace todo lo que hay en él»; esta era la última excepción dentro de ese módulo.
3. **`fn_puede_dar_descuento_por_etiqueta()`** deja de ser `fn_es_lider()` y pasa a ser `fn_puede_editar_etiquetas()`. Conserva su nombre y su
   lugar de «punto único» para no tocar a sus llamadores: la política `etiquetas_update`, el `with check` de `etiquetas_insert_autenticado`
   (migración aparte, parte 2) y las funciones de campaña.
4. **El costo no se abre.** `fn_costos_variantes_json` sigue detrás de `fn_puede_ver_dinero_de_compras()`. Quien configura una campaña sin ese
   permiso la guarda sin el aviso de «por debajo del costo» (la pantalla le pasa costo 0 y `prendasBajoCosto` no avisa).

### Qué cambió en la base (`20261001130000` + `20261001130100`)

| Pieza | Antes | Ahora |
|---|---|---|
| `fn_puede_dar_descuento_por_etiqueta()` | `fn_es_lider()` | `fn_puede_editar_etiquetas()` (líder o rol con Etiquetas) |
| `fn_puede_tocar_etiqueta(uuid, numeric)` | líder, o módulo si la etiqueta no lleva descuento | `fn_puede_editar_etiquetas()` |
| `crear_producto_con_variantes` | guardia «Solo un líder puede asignar una etiqueta con descuento» | sin guardia: basta poder dar de alta el producto |
| `actualizar_variantes_etiquetas` (la ficha) | guardia: lo que se pone o se quita no puede llevar descuento | sin guardia: su puerta (`editar_etiquetas` o `editar_catalogo`) ya decide |
| `actualizar_campana_etiqueta`, `etiquetar_variantes` | mensajes «solo un líder…» | mensajes que dicen lo cierto («necesita el módulo Etiquetas») |
| `etiquetas_insert_autenticado` (parte 2) | con descuento: `fn_es_lider()` | con descuento: `fn_puede_dar_descuento_por_etiqueta()` |
| `retail.modulos.incluye` de `etiquetas` | «…etiquetas sin descuento» | «…configurar su campaña y descuento, y ponérselas a las prendas» |

Cada cambio se hace sobre la **definición viva** de la función (`pg_get_functiondef`), exigiendo que la guardia coincida exactamente una vez;
si producción la tiene distinta, aborta sin aplicar nada. Es re-ejecutable. La política va en su propia parte por la regla de deadlocks del
ADR-0195.

### Qué cambió en la web

- `NuevoProductoForm`/`ElegirEtiquetas`: sin `esLider`; `repartirEtiquetas` solo separa lo que se elige de lo que «ya aplica sola»; se fueron
  `ocultasPorDescuento`, el motivo `solo_lider` y la frase «Las que llevan descuento las pone un líder».
- `productos/atributos/page.tsx`: `puedeDarDescuento = puede(persona, "editarEtiquetas")`. Con eso las tarjetas con descuento traen «Prendas»
  y «Configurar campaña», y el editor de campaña habilita el descuento. Como el selector de prendas de «Prendas» se cargaba solo con
  `puedeDarDescuento`, un rol con Etiquetas que no era líder lo veía vacío: queda arreglado de paso.
- `lib/modulos.ts`: sale «Poner etiquetas con descuento a una prenda» de `SIEMPRE_SOLO_LIDER`; cambia el «incluye» del módulo.

## Consecuencia que se acepta a propósito

Una etiqueta con descuento baja el precio **en caja** de las prendas que la llevan, mientras dure su vigencia. Desde hoy lo puede provocar quien
crea una prenda (marcándola «Para liquidar») y quien tiene Etiquetas (configurándola). Lo que sigue acotándolo es la **vigencia** de la campaña
(fechas y categorías) y el tope de descuento que ya aplica la caja; este ADR no agrega otro candado. Si en tienda aparece un descuento que nadie
esperaba, el rastro es `variante_etiquetas` + el historial de la prenda.

## Quién tiene el módulo Etiquetas HOY en producción (consultado el 2026-09-30, después de aplicar)

Los tres roles con cuentas —**Integrante, Terminal administrativa y Terminal de ventas**— traen el módulo Etiquetas encendido; el líder lo ve
todo. Con esta decisión eso significa que **toda cuenta de esos tres roles** (las seis terminales: Almacén y Caja de Lima, Arequipa y Trujillo,
y todo Integrante) puede configurar un descuento por etiqueta, no solo la cuenta de almacén. Es lo que pidió la regla («todos los que tengan
el módulo»), pero el alcance real es ese. Si se quiere acotar, se hace en Roles y accesos quitando Etiquetas a los roles que no deban
(p. ej. a la Terminal de ventas); no requiere código.

## Descartado

- **Mostrar las dos etiquetas con candado para quien no es líder** (primera versión, hecha y retirada el mismo día): resolvía «no aparecen» pero
  mantenía la regla que Felipe quiso abrir. Habría dejado código de candados sin ningún caso real.
- **Abrir solo la lista de Nuevo producto y dejar la configuración del líder:** partía la regla en dos y dejaba «Prendas» y «Configurar campaña»
  ocultas a quien tiene el módulo, justo lo que se pidió corregir.
- **`fn_puede_dar_descuento_por_etiqueta() = true` para todos:** abriría además `etiquetas_update` y la creación directa por la API a cualquiera
  que cree productos. La configuración es del módulo, no de «quien crea prendas».
- **Quitar el concepto `puedeDarDescuento` de toda la web:** hoy vale lo mismo que `puedeEditarEtiquetas`. Quitarlo toca `EtiquetasLista`,
  `AtributosHub`, `etiqueta-campana-guia` y sus pruebas para no ganar nada de comportamiento; queda como parámetro que la pantalla pasa igual.

## Cómo se verifica

- `pnpm pruebas:roles`, `pnpm pruebas:terminales` y `node scripts/pruebas/etiquetas_aprobar_con_comentario.mjs` contra una base con las dos
  migraciones: un rol con Etiquetas crea una etiqueta con descuento, le pone campaña y la pone a una prenda; Productos sin Etiquetas cambia las
  etiquetas de la ficha con descuento; la terminal administrativa crea una prenda con una etiqueta con descuento y queda colgada de ella.
- A mano: con «Almacén Trujillo», Nuevo producto ▸ Etiquetas ▸ «Ver todos» muestra «Para liquidar» y «Últimas unidades» marcables; en
  Catálogo ▸ Atributos ▸ Etiquetas esas dos tarjetas traen «Prendas» y «Configurar campaña» y el editor deja escribir el descuento.

## Se rompe si

- Se vuelve a pegar `20260923130000` o `20260923140000`: sus verificaciones finales exigen «solo líder» y abortan (falla cerrado). No se repiten.
- Otra migración recrea `crear_producto_con_variantes` o `actualizar_variantes_etiquetas` copiando un cuerpo anterior a esta: la guardia vuelve.
  La verificación final de `20261001130000` y `pnpm pruebas:terminales` lo detectan.
- Se despliega la web antes que la base: quien no es líder vería las etiquetas pero el guardado fallaría con «Solo un líder puede asignar una
  etiqueta con descuento». **El orden es primero la base, después la web.**

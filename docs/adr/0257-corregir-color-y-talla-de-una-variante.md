# ADR-0257 · Corregir el color y la talla de una variante que ya existe (y editar variantes como matriz)

- **Fecha:** 2026-09-28 · **Estado:** aprobado por Felipe (tres preguntas, 2026-09-28); construido (base y ficha), SQL sin
  pegar en producción.
- **Pedido:** Felipe, 2026-09-28, con captura de BOD-0003 «Body Amir»: «una vez creado el producto la edición es muy
  limitada, no me deja editar color y demás variantes de una forma adecuada o mejor de lo que haría Shopify».
- **Número:** nació como ADR-0254 y migración `20260928233000` (reservados el 2026-09-28 y subidos a la rama); el 0254 lo
  tomó en `main` la Tabla de Productos (#561) antes de fusionar esta rama, y la migración tiene que correr después de
  `20260928235000`, que ya estaba en `main` y en producción. Cede quien llega después a `main`: pasó a 0257 y `235500`.
  Después pasó a `235900`: la migración rival de ADR-0258 usaba `235500` y dejó esa misma marca en dos funciones de
  producción, y el parche de esta migración la habría leído como «ya estaba» (ver «Actualización: ADR-0258»).
- **Migración:** `20260928235900_corregir_color_y_talla_de_variantes.sql` (sin pegar en producción). Antes, en su propia
  parte: `scripts/migraciones/retirar-adr-0258-de-produccion.sql`.
- **Reemplaza:** ADR-0243 D-133 («color, talla y código de una variante existente son de solo lectura») y ADR-0258
  (PR #572, «solo sin historia»), que llegó a pegarse en producción.
- **Actualiza:** ADR-0025, invariante 1 (el código «nunca se recalcula, ni al corregir el color»).
- **Complementa:** ADR-0069 (identidad de la variante), ADR-0193 (edición simultánea), ADR-0212 (alta con stock),
  ADR-0218 (qué es «historia»), ADR-0246 (temporada por color), ADR-0228 (fotos).

## Problema

1. **BOD-0003 nació «Sin color» y no hay forma de ponerle el color.** D-133 dice «si está mal, desactívala y agrega la
   correcta», pero sus 3 variantes ya tienen su carga inicial (8/5/4 = 17 u. en TRU, ADR-0212). La receta obliga a:
   desactivar 3, crear 3, ajustar −17 y cargar +17 que nunca pasaron (y ajustar es solo del líder, ADR-0250), volver a
   poner la etiqueta «Nuevo», y reimprimir 17 etiquetas: las pegadas apuntan a la variante desactivada y en Vender salen
   «no encontrada». El «SE ROMPE SI» de D-133 era justo este caso.
2. **Agregar un color a S/M/L es escribir 3 filas a mano**, cada una con color, talla, SKU y precio. El alta arma la
   tabla talla × color en un clic: las dos pantallas resuelven lo mismo de dos formas (falla de integridad conceptual).
3. **La base no protege nada de esto.** D-133 es un candado de pantalla: por la API, cualquier cuenta que edita el
   catálogo cambia color, talla o código sin dejar rastro («hueco 3»). Y el candado de identidad dejó de tratar «Sin
   color» como un color el 17-sep (el índice `nulls not distinct` de ADR-0069 se fue con la columna `talla`).

Hechos que lo hacen seguro (medidos el 2026-09-28): las 19 tablas que citan una variante lo hacen por su id; SUNAT
declara `referencia · sku`, sin color ni talla; la pistola resuelve por `codigos_barras`. Corregir en su lugar no mueve
ni una unidad ni un sol: cambia cómo se LEE la historia de esa prenda, que es justo lo que se quiere cuando se registró
mal.

## Decisiones de Felipe (2026-09-28)

### D-136 · Se corrige siempre; si la variante ya se vendió, solo un líder

```
DECIDÍ: el color y la talla de una variante que ya existe se corrigen desde su ficha, en el mismo «Guardar cambios».
        Es la misma prenda física mal registrada: conserva su id, su stock, su historia y sus etiquetas. Si ya se vendió
        o una clienta la apartó, solo un líder la corrige (el permiso se le pregunta a la cuenta, no al responsable).
        Todo cambio queda en el historial de la prenda, con quién lo hizo.
DESCARTÉ: (a) «solo si nunca se vendió»: un error que se descubre tras la primera venta seguiría costando desactivar,
        agregar y ajustar stock a mano; (b) «siempre, cualquiera»: sin freno sobre variantes ya vendidas.
SE ROMPE SI: alguien «recicla» una variante vendida para OTRO producto (vendió 20 Negro S; llega Azul y le cambia el
        color en vez de agregarla). El análisis diría que se vendieron 20 Azul. El freno es humano (solo líder, y la
        pantalla separa «Corregir» de «Agregar color»), y el rastro queda en el historial.
```

### D-137 · Al corregir, el código se recalcula y el viejo sigue sonando

```
DECIDÍ: al corregir el color o la talla, la variante recibe el código de su identidad nueva (BOD-0003-S →
        BOD-0003-NEG-S) y el código anterior se queda en `codigos_barras` apuntando a la MISMA variante: toda etiqueta ya
        pegada sigue sonando en Vender, Conteo, Cambios y Traslados; las nuevas salen con el código correcto. Si el código
        nuevo ya lo tiene otra variante, se le agrega -2, -3… (lo mismo al crear una variante cuyo código ya existe).
DESCARTÉ: dejar el código igual para siempre (ADR-0025 tal cual): tras Negro→Azul la etiqueta nueva diría «…-NEG-S»
        con «Azul» al lado, y crear después una Negro S real chocaría igual con ese código.
SE ROMPE SI: se corrige Negro→Azul y después se crea una Negro S de verdad: nace BOD-0003-NEG-S-2, porque BOD-0003-NEG-S
        sigue siendo el código viejo (pegado en percha) de la que ahora es Azul.
```

### D-138 · Si la corrección cae sobre una variante que ya existe, se bloquea (unir, después)

```
DECIDÍ: corregir «Sin color S» a «Negro S» cuando Negro S ya existe (activa o no) se rechaza con un aviso que nombra la
        variante que ya está y qué hacer. No se unen variantes en esta entrega.
DESCARTÉ: unir las dos ahora (pasar el stock con un movimiento nuevo y redirigir los códigos): toca el motor de stock y
        hoy hay 0 casos reales (solo una prenda de prueba).
SE ROMPE SI: aparece un duplicado real con stock en las dos: hasta la fase «Unir variantes», se desactiva una y se ajusta
        su stock como hoy.
```

## Decisiones técnicas

Base: `supabase/migrations/20260928235900_corregir_color_y_talla_de_variantes.sql` (su cabecera tiene el detalle y cómo
se deshace). Web: `apps/web/lib/variantes-ficha-reglas.ts` (reglas puras, con su contrato en la cabecera) y
`apps/web/components/ficha-producto/`. Prueba de la base: `pnpm pruebas:corregir-variantes` (en el CI).

### T1 · La corrección va DENTRO de `catalogo_actualizar_producto`

```
DECIDÍ: una variante existente que llega en p_variantes con la clave color_codigo o talla_id pasa por
        fn_corregir_identidad_variante (SECURITY DEFINER) antes de su update, en la misma transacción que el resto de la
        ficha. La ficha manda esas claves SOLO en las corregidas ("" = sin color / sin talla), en orden: primero las
        corregidas (una cadena S→M, M→L se ordena sola), después las demás, al final las nuevas (así una nueva puede ocupar
        la combinación que una corregida deja libre).
DESCARTÉ: una RPC aparte que la ficha llama antes de guardar: dos llamadas no son todo o nada (la corrección quedaba
        hecha y el precio no, o al revés) y la versión de la prenda (ADR-0193) se desfasaba entre las dos.
SE ROMPE SI: la web llega a producción antes que el SQL: la función vieja ignora esas claves SIN error, pero sí guarda
        las fotos que se movieron con el color. Por eso la página pregunta si existe `fn_variantes_estado` (del mismo SQL;
        `esFuncionAusente`: PGRST202 o 42883) y, si no, pasa `puedeCorregir = false`: la ficha no ofrece corregir (ni
        chips, ni «Corregir color», ni la opción del menú, ni darle color a una «Sin color» al agregar) y lo dice en una
        línea. Como red, al guardar relee las variantes y, si una corrección no se aplicó, lo dice sin jerga («avisa a un
        líder») y la deja pendiente en pantalla. El orden sigue siendo: primero el SQL, después la web.
```

### T2 · El candado es de la TABLA, no de la pantalla (cierra el «hueco 3» para variantes)

```
DECIDÍ: el disparador variantes_identidad_solo_por_funcion rechaza (42501, hint identidad_variante) un update directo de
        color_codigo, talla_id, codigo o producto_id hecho por una sesión de la API (current_user authenticated o anon).
        Las funciones SECURITY DEFINER corren como su dueño y pasan. Mismo patrón que el costo (20260927190000).
DESCARTÉ: revocar el UPDATE de esas columnas: en Supabase exige revocar el UPDATE de toda la tabla y volver a darlo
        columna por columna; una columna nueva nacería sin permiso y la ficha fallaría sin aviso.
SE ROMPE SI: alguien escribe una función SECURITY INVOKER que cambie la identidad: el candado la frena. Es lo correcto
        (obliga a pasar por fn_corregir_identidad_variante, que deja rastro y recalcula el código).
```

### T3 · La identidad vuelve a tratar «Sin color» como un color

```
DECIDÍ: índice único variantes_identidad_unica (producto_id, talla_id, color_codigo) NULLS NOT DISTINCT, con una guarda
        previa que aborta nombrando los duplicados si los hubiera; se borra el UNIQUE variantes_producto_talla_color_unico
        (estrictamente más débil). La talla ya se compara por id (lista cerrada), no por texto.
DESCARTÉ: dejar el UNIQUE común y revisar «Sin color» en las funciones: el camino que no pase por ellas (una inserción
        directa, el censo) dejaba entrar dos «Sin color S».
SE ROMPE SI: una carga masiva trae dos filas «sin talla, sin color» del mismo modelo (dos códigos de fábrica de lo mismo):
        ahora la segunda se rechaza; el censo lo dice con palabras (error-escritura.ts).
```

### T4 · Fotos y temporada siguen al color solo cuando el color viejo se queda sin variantes

```
DECIDÍ: al corregir, si ninguna variante que EXISTE (activa o no) conserva el color viejo, sus fotos pasan al color nuevo
        (a «Sin color»: quedan generales; las generales no se mueven nunca) y su temporada propia también, salvo que el
        nuevo ya tenga la suya (manda la del nuevo). La ficha calcula lo mismo SIEMPRE desde lo guardado
        (`mudanzasAlGuardar`), no gesto a gesto, y manda en p_fotos el color nuevo (el bucle de fotos corre después de
        las correcciones y escribe el color que llega). Todo lo que tiene color en la ficha —la foto guardada, la recién
        subida o recoloreada a mano, la temporada elegida a mano para un color— se guarda con su COLOR DE ORIGEN (`anclar`)
        y se ubica en cada pintada con `colorTrasMudanzas(origen, mudanzasAlGuardar(filas))`; nada se mueve al corregir.
        Si una temporada elegida cae en otro color que ya tiene la suya guardada, manda la guardada y la elegida se deja de
        lado sin borrarse (`ubicarTemporadas`). Así «Deshacer» una corrección devuelve todo a su lugar solo.
DESCARTÉ: calcularlo gesto a gesto en la pantalla (así se construyó primero): «Deshacer» tras fundir Negro S en un Azul
        que ya existía dejaba las fotos del Negro en el Azul, y el guardado las mandaba así; y corregir todo el Negro y
        agregar en el mismo guardado una Negro nueva, la pantalla creía que el Negro seguía y la base lo mudaba igual.
        La revisión del 2026-09-28 encontró el mismo desfase en las fotos NUEVAS y en la temporada elegida a mano (se
        quedaban en el color en que se fundieron y pisaban la temporada guardada del otro color): de ahí el color de origen.
SE ROMPE SI: alguien vuelve a mover fotos o temporadas dentro de un `setFilas` (gesto a gesto) en vez de derivarlas: la
        propiedad que lo vigila es `ubicar(anclar(c, filas), mudanzasAlGuardar(filas)) === c` (elegir algo nunca lo mueve
        de donde se eligió), probada en `variantes-ficha-reglas.test.ts`.
```

### T5 · «Sin color» junto a colores se revisa al final del guardado, no en cada corrección

```
DECIDÍ: catalogo_actualizar_producto rechaza (hint mezcla_sin_color) una prenda que QUEDARÍA con variantes activas «Sin
        color» y otras activas con color; la ficha lo avisa antes con la misma frase. Las desactivadas no cuentan.
DESCARTÉ: revisarlo en fn_corregir_identidad_variante: BOD-0003 (S, M, L «Sin color» → Negro) pasa por la mezcla entre
        la primera corrección y la última del mismo guardado.
SE ROMPE SI: alguien arma la mezcla por fuera de la ficha (insertar una variante o reactivarla con un update directo, o
        llamar fn_corregir_identidad_variante suelta): la base no lo frena por esos caminos. Hoy no los usa ninguna
        pantalla; si aparece uno, el candado tiene que ser un disparador diferido sobre `variantes`.
```

### T6 · Lo que la ficha necesita saber de cada variante, en una lectura

```
DECIDÍ: fn_variantes_estado(producto) SECURITY DEFINER devuelve por variante {variante_id, stock, apartado, sedes[],
        vendida}; '[]' a quien no edita el catálogo. La ficha trata '[]' como «no se sabe» (sin columna de stock), no
        como «0 u.». vendida = la variante salió (o está comprometida con dinero) con una clienta, por cualquiera de los
        tres caminos que hay hoy: una línea de venta (`venta_items`), una separación con abonos (`separacion_items`) o la
        prenda que se llevó en un cambio (`cambios.variante_nueva_id`). Es la MISMA regla que el candado de líder de
        fn_corregir_identidad_variante (D-136).
DESCARTÉ: leer stock y ventas con los permisos de quien abre la ficha: `stock` y `venta_items` tienen RLS por sede y
        una integrante de Trujillo vería 0 en Lima. Y mirar solo `venta_items` y `separacion_items` (la primera versión):
        `registrar_cambio` escribe `cambios` y el movimiento de salida de la prenda nueva, no una línea de venta, así que
        la Azul S que una clienta se llevó a cambio de su Negro S pasaba por «nunca vendida» y cualquiera la corregía.
SE ROMPE SI: se agrega un cuarto camino por el que una prenda sale con una clienta sin escribir ninguna de esas tres
        tablas: hay que sumarlo aquí y en fn_corregir_identidad_variante, o la regla de líder no lo ve. Revisado el
        2026-09-28 (toda función que inserta en `movimientos` o en `venta_items`): `entregar_separacion` y
        `liquidar_prenda_danada` escriben `venta_items`; `regularizar_prenda` reescribe la `venta_items` de la prenda sin
        registrar; `liberar_apartado` «entregada» solo suelta la reserva (la venta pasa por Vender); `registrar_movimiento`
        (salida) es Ajustar stock, sin clienta; `separacion_items_retirados` y `separacion_pedidos` vuelven o no salen del
        stock; devoluciones y `anular_venta` son entradas.
```

### T7 · Una prenda apartada sin dinero no cuenta como «vendida»

```
DECIDÍ: la regla de líder (D-136) y `vendida` miran `venta_items`, `separacion_items` (la clienta ya pagó abonos) y
        `cambios.variante_nueva_id` (T6). Un apartado de «Apartar prenda» (`retail.apartados`, ADR-0141 fase 1) NO
        cuenta: es una reserva física sin dinero ni historia de venta, y corregir su color es justo corregir un dato mal
        cargado de la prenda que la clienta ya vio.
DESCARTÉ: contar también los apartados abiertos: frenaría a la encargada que descubre el error justo cuando una clienta
        pidió la prenda, sin proteger nada del análisis (un apartado no es una venta).
SE ROMPE SI: la fase 2 de apartados (adelanto ligado a Caja) empieza a guardar dinero en `apartados.adelanto_monto`: ese
        día un apartado con adelanto es una venta a medias y debe sumarse a la regla.
```

### T8 · Los candados de una corrección se toman ANTES que `catalogo_version`, y solo si hay algo que corregir

Cambiar el color o la talla toca columnas de un índice único, así que Postgres bloquea la fila de la variante en su modo
más fuerte (FOR UPDATE), que choca con el FOR KEY SHARE que toma toda inserción que cita la variante (el movimiento de una
venta, de un traslado, de un cierre de producción). Guardar precio y activo nunca chocaba con eso. Y el `update
productos` de la ficha toma, con su disparador por sentencia, la fila única de `catalogo_version` hasta el final.

```
DECIDÍ: un solo orden de candados para corregir: la prenda (FOR UPDATE, el de la versión, ADR-0193) → las variantes que
        DE VERDAD cambian de color o de talla, por id → catalogo_version. catalogo_actualizar_producto los toma antes de
        su update de la prenda; fn_corregir_identidad_variante decide SIN candado si hay algo que cambiar y, si no, sale
        sin bloquear nada (la ficha vieja manda el color y la talla de todas; lo protege la versión de la prenda). Por la
        misma razón, la migración pide `variantes` en exclusiva como primera sentencia: espera 3 s o falla limpia, y ya no
        tumba con 40P01 una operación de la tienda que leyó `variantes` antes de que se pegara.
DESCARTÉ: bloquear la variante dentro de fn_corregir_identidad_variante, después del update de la prenda (la primera
        versión): un cierre de producción que ya insertó su movimiento y después recalcula el costo (que también toma
        catalogo_version) cerraba un círculo con la ficha y caía con 40P01, perdiendo el cierre (dos psql reales con
        COMMIT, 2026-09-28; después del cambio los dos terminan y la ficha espera ~1 s). Tampoco FOR NO KEY UPDATE: el
        update de color o talla lo sube solo a FOR UPDATE, ya con catalogo_version tomada.
SE ROMPE SI: una operación cita VARIAS de las variantes que se corrigen en el mismo guardado y lo hace en otro orden que
        el id (una venta de M y S en la misma ventana de milisegundos en que la ficha corrige S y M): una de las dos cae
        con 40P01 y la base la deshace entera (medido: en el orden del id no cae; al revés, sí). Cerrarlo del todo pide que
        fn_bloquear_en_orden tome `for key share` de las variantes por id en todas las operaciones (Ventas, Traslados,
        Compras, Producción): es otra decisión, que toca varios módulos.
```

### Lo que queda abierto

- **El historial nombra la variante por su talla y color de HOY** (`fn_historial_producto_cambios` devuelve `sku`, vacío
  en casi todas, y no `codigo`). Devolver el código cambia el tipo de retorno de la función (hay que borrarla y
  recrearla): va en otra migración.
- **Unir variantes** (D-138) queda para otra fase.
- **El círculo que T8 no cierra** (una operación de varias tallas en otro orden que el id contra una corrección de esas
  mismas tallas): hasta que `fn_bloquear_en_orden` tome `for key share` de las variantes por id, si cae la venta, la
  cola de Vender ya trata 40P01 como error pasajero y la reintenta (`esErrorPasajero`, `apps/web/lib/error-escritura.ts`);
  si cae la ficha, repite el guardado UNA vez (`conUnReintentoSiChoca`: la base deshizo todo, repetir es seguro; medido
  en psql: el segundo intento pasa en ~20 ms) y, si vuelve a caer, lo dice con palabras (`FRASE_CHOQUE_DE_CANDADOS`) en
  vez de «deadlock detected».

## Actualización 2026-09-28 (noche): ADR-0258 llegó primero a producción y se retira

**Qué pasó.** Otra sesión construyó en paralelo lo mismo (ADR-0258, rama `claude/product-sizes-colors-edit-a83b77`,
PR #572) con la regla «solo sin historia» (D-139) y «el código viejo deja de leerse» (D-140). Su migración usaba el
número `20260928235500` —el mismo que esta tenía entonces— y se pegó en producción por el SQL Editor (sin fila en
`schema_migrations`) poco antes de pegar esta. La sonda previa lo detectó: `catalogo_actualizar_producto` y
`fn_registrar_cambio_producto` ya no tenían la huella medida esa mañana.

```
DECIDÍ (Felipe, 2026-09-28: «Opción 1 y permíteme limpiar todo porque solo hemos estado en fase prueba»): se queda
        ADR-0257 (D-136/D-137/D-138). Lo de ADR-0258 se retira de producción con un script propio
        (scripts/migraciones/retirar-adr-0258-de-produccion.sql), que se pega SOLO y ANTES de 20260928235900: deshace sus
        dos parches por texto exacto, borra su disparador (drop trigger: por eso va aparte, regla de ADR-0195) y sus tres
        funciones, y comprueba que las dos funciones volvieron a su huella de la mañana (a66ff20a…, c4f2676e…) o aborta.
        No toca datos (la web del 0258 nunca se publicó). La migración pasó a 20260928235900 para que su marca sea única.
DESCARTÉ: (a) quedarse con ADR-0258: no arregla BOD-0003 (su propio SE ROMPE SI lo dice) y deja de leer las etiquetas
        pegadas; (b) pegar esta migración encima tal cual: su parche con ancla ve la marca «20260928235500» del 0258 y
        habría dicho «ya estaba» sin aplicar nada, en silencio; (c) meter la limpieza en la migración: el drop trigger
        junto al `lock table variantes` es justo la mezcla que ADR-0195 prohíbe.
SE ROMPE SI: alguien vuelve a pegar el SQL del 0258 después (su rama sigue existiendo): la limpieza se puede re-pegar,
        pero la migración de esta ADR ya no la deshace. Por eso el PR #572 se cierra y su SQL no entra a `main`.
```

**Cómo se probó.** Una réplica privada con `main` + la migración del 0258 dio las MISMAS cuatro huellas que producción
(`8d5e64ea`, `8727cba4`, `da6b205a`, `102076a4`); sobre ella, la limpieza devolvió las dos funciones a su huella de la
mañana y es re-pegable; la migración parchó las cuatro, y las ocho huellas finales son idénticas a las de una base
limpia; `corregir_variantes` 44/44 y las suites de catálogo en verde sobre esa réplica.

**Lo que había de más en el 0258 en producción mientras tanto:** su corrección bloqueaba cada variante (`for update`)
antes de mirar si cambiaba algo, y la ficha actual manda color y talla de todas: cada guardado de una ficha bloqueaba
todas sus variantes y podía chocar con una venta (40P01). La limpieza lo quita.

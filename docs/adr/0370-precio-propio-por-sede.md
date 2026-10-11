# ADR-0370 — Precio propio por sede

- **Fecha:** 2026-10-09
- **Estado:** aceptado y **en producción** (las 4 migraciones, 2026-10-09, por el MCP de Supabase)
- **Decidió:** Felipe (qué y quién); Claude (cómo se guarda y se aplica)

## Contexto

En Arequipa a veces se vende una prenda a otro precio que en Trujillo. El ERP tenía un solo precio por variante
(`variantes.precio`) para todas las sedes, y las dos salidas que quedaban mentían: cambiar el precio de todas las tiendas, o
dar un «descuento» en la caja donde no lo hay. Felipe pidió que el precio por sede fuera **notorio y no confuso**.

## Decisión

**Un precio de sede reemplaza al general en esa tienda. No es un descuento ni un recargo: el cliente ve un solo precio.**

Decisiones de Felipe (2026-10-09):

1. **Quién:** quien ve el módulo «Productos» lo pone, **solo en su propia tienda** (el líder, en cualquiera). Es una acción dentro
   de Editar producto: no es un módulo (ADR-0306). La cuenta de almacén de la tienda puede hacerlo si su rol ve Productos.
2. **Alcance:** la prenda entera (todas sus variantes al mismo precio). Se guarda por variante para que el candado de la venta
   compare variante contra variante, como siempre.
3. **Duración:** vale hasta que alguien lo quite. Lo temporal ya lo cubren las campañas.

Candados que acompañan la decisión 1: motivo obligatorio, firma del Responsable (ADR-0162), aviso (sin bloquear) si el precio se
aleja más de un 30 % del general, y todo queda en el Historial de la prenda y en Actividad.

## Cómo se construyó

- **Base** (`20261010100000`): `retail.precios_sede`, con una fila vigente por variante y sede (índice parcial). Nunca se borra ni
  se edita: cambiar archiva la vigente y crea otra, y quitar la archiva. RLS está encendido y sin políticas: solo se lee y escribe por
  funciones `security definer`. La única regla del precio es **`fn_precio_en_sede(variante, sede)`**: el de la sede si existe, si
  no el general. Se escribe solo con `poner_precio_sede` y `quitar_precio_sede`, que bloquean la prenda (`for update`) para que dos
  pestañas a la vez se pongan en fila. Se lee con `fn_precios_sede_producto` (la ficha) y `fn_precios_en_sede` (las pantallas de
  una tienda).
- **Todo lo que fija o compara un precio usa `fn_precio_en_sede`**, cada función con un reemplazo anclado de una línea:
  `registrar_venta` (`20261010100200`), `separar_prendas`, `editar_separacion`, `registrar_cambio`, `crear_proforma` y
  `regularizar_prenda` (`20261010100300`). La campaña, el club y los topes de descuento se calculan sobre ese precio. Sin precios
  propios, todo es idéntico a antes. `pnpm pruebas:precio-sede` trae un guardián que falla si una de las seis deja de usarla.
- **Actividad** (`20261010100100`): `fn_actividad_precio_sede` dice «precio propio en Tienda Trujillo S/ 79.90 → S/ 89.90» en vez
  del JSON crudo.

## Cómo se ve (notorio, no confuso)

| Lugar | Qué se ve |
|---|---|
| Editar producto ▸ Variantes y precios | El bloque «Precio por tienda»: «Se vende a S/ 79.90 en todas las tiendas», o una fila por tienda con su precio, la insignia «Precio propio», el general, desde cuándo, quién y por qué, con «Cambiar» y «Quitar». La hoja «Precio distinto en una sede» tiene guía de foco y un ejemplo de motivo que sigue la tienda elegida (`/sugerir`). |
| Vender | El precio de la tienda; bajo él, «Precio de Lima», solo para la colaboradora. La boleta no cambia. El sondeo de 10 s también relee los precios propios (poner uno no sube la versión del catálogo). |
| Apartados, Cambios, Proformas, Ventas sin registrar | El precio de la tienda que corresponde (la de la venta, en Ventas sin registrar; la elegida, en la hoja de Proforma). |
| Catálogo ▸ Productos | «2 precios» junto al precio; al pasar el mouse y para el lector de pantalla, «Otro precio en Lima S/ 84.90». |
| Existencias | El precio de la sede que se mira, con «Precio de esta tienda» debajo. |
| Etiquetas impresas | El precio de la tienda donde se imprime (todos los orígenes, también lotes y producción). |
| Traslados | El pase avisa qué prendas llegan con una etiqueta que en destino no vale. Al recibir, «Imprimir etiquetas con el precio de aquí» va primero. |
| Historial de la prenda y Actividad | «puso precio propio en Tienda Trujillo · S/ 79.90 → S/ 89.90 · «motivo»». |

## Descartado

- **Una regla por porcentaje** («AQP +8 % en blusas»): da precios como S/ 128.29 y nadie sabe de dónde salen. Se fijan precios
  exactos.
- **Precio por talla y color en la sede:** son 12 casillas por blusa, y con una cuenta compartida es fácil dejar una sin cambiar:
  la misma prenda tendría dos precios en la misma tienda.
- **Fecha de término automática:** un día el precio cambiaría sin que nadie lo toque y la etiqueta colgada quedaría mintiendo.
- **Columna nueva en `variantes`:** una por sede no escala y obliga a tocar el núcleo (principio 1). La tabla aparte solo guarda
  las excepciones.

## Producción

Pegar en este orden: `20261010100000` → `20261010100100` → `20261010100200` → `20261010100300` → `20261010100400` (una prenda con precio propio frena «eliminar») → `20261010100500` (poner o quitar un precio de sede sube la versión del catálogo: toda pantalla abierta se pone al día sola). Ninguna tiene políticas ni
`drop trigger`; todas son re-ejecutables y fallan sin tocar nada si una función viva cambió. La web nueva se puede publicar antes o
después: sin la tabla, lee cero precios propios y cobra el general, que es lo mismo que exige la base vieja.

**Aplicadas en producción el 2026-10-09** con `apply_migration` (que registra la hora de aplicación como versión, no la del
archivo): `20261010002553 precio_propio_por_sede`, `20261010002608 precio_sede_en_actividad`, `20261010002617
venta_cobra_precio_de_sede`, `20261010002633 apartados_cambios_proformas_precio_de_sede`. Antes de aplicarlas se comprobó que cada
ancla calzaba en producción (1, 1, 1, 1, 1, 2 apariciones). Después: las seis funciones usan `fn_precio_en_sede`, `precios_sede`
vacía y con RLS encendido. El 2026-10-10 se sumaron `20261010125615 precio_sede_frena_eliminar_producto` y `20261010125617
precio_sede_sube_version_del_catalogo`, verificadas (renglón 22 en `fn_producto_historia`, disparador de versión en `precios_sede`). Y `20261010130947
precio_sede_cambiar_solo_el_motivo` (archivo `20261010100600`): corregir solo el motivo no se guardaba; lo destapó la prueba ciega de
`/formidable` (`docs/formidable/catalogo-precio-por-tienda.md`).

## Cómo se verifica

`pnpm pruebas:precio-sede` (20 escenarios: permisos, archivo, historial, Actividad, venta real en Trujillo, proforma, guardián),
`pnpm pruebas:registrar-venta`, `pruebas:separaciones`, `pruebas:registrar-cambio`, `pruebas:prendas-por-regularizar`. En el
navegador: Editar producto (poner, avisar, quitar), Vender a escritorio y a 375 px, Apartados a 375 px, Productos, Existencias,
Etiquetas y un traslado en camino.

## Actualización 2026-10-10 — el precio es de la PRENDA, no de cada variante (FAL-0008)

**Qué pasó.** En producción, con FAL-0008 «Falda Short Lois Rayas»: 22:35 Felipe puso AQP a S/ 79.90 (la prenda estaba a 69.90);
22:36 la tabla de precios pasó a 79.90 en sus 9 variantes; 22:37 puso TRU a S/ 69.90. Felipe quería «AQP 79.90 y TRU 69.90» y vio
«3 precios» y 79.90 en todas partes. La caja cobraba bien (AQP 79.90, TRU 69.90); lo que fallaba era el diseño y la pantalla:

- El precio de una tienda se guardaba **una fila por variante** y nada lo mantenía al día: cambiar la tabla dejaba un «precio propio»
  igual al de la prenda (AQP), y una talla o un color nuevo, una talla reactivada o un alta al vuelo del Conteo nacían sin fila y se
  vendían en esa tienda al precio de la prenda (dos precios de la misma prenda en la misma caja, lo que este ADR quería impedir).
- Toda pantalla mostraba el precio de la prenda, no el de la tienda elegida: en TRU la tarjeta decía 79.90 y la caja cobraba 69.90.
- «3 precios» contaba tiendas más uno, no precios distintos; «Las demás tiendas: S/ 79.90» bajo AQP era falso (TRU estaba a 69.90).
- Además, la auditoría de ese día encontró que **Apartar** guardaba la línea al precio de la prenda aunque cobraba el de la tienda (la
  venta del apartado nacía descuadrada al entregarse; 0 casos en producción) y que un **cambio de talla** de la misma prenda cobraba o
  devolvía la diferencia entre tiendas.

**Decisiones de Felipe (2026-10-10).** Al cambiar el precio de la prenda, **preguntar al guardar** qué pasa en cada tienda con precio
propio. Mostrar grande **el precio de la tienda elegida arriba** (catálogo, vista rápida, cabecera de la ficha, orden y filtro). Un
**cambio de la misma prenda vale lo que se pagó**: otra talla o color se cobra al precio de la tienda donde se compró; otra prenda, al
de la tienda donde se cambia. En pantalla no se dice «general» ni «sugerido»: «precio de la prenda» (el de la tabla) y «precio propio»
(el de una tienda).

**Cómo se arregló.**
- `20261011100000_precio_de_tienda_por_prenda.sql`: tabla `precios_sede_prenda` (una por prenda y tienda; se archiva, nunca se borra
  ni se edita; `vigente_desde` no se reinicia al corregir solo el motivo). `fn_precio_en_sede` (misma firma) busca por la prenda: toda
  variante, también la que nazca mañana, vale ese precio. Un disparador **diferido** en `variantes` (`fn_precio_sede_depurar`) quita al
  final de la transacción el precio de tienda que quedó igual al de la prenda en todas sus tallas activas («Quedó igual al precio de la
  prenda»); diferido para no quitarlo en un estado intermedio de un guardado talla por talla. `precios_sede` queda como historia (sus
  vigentes pasan a la tabla nueva y se archivan; un disparador impide escribirle). Actividad: «puso precio propio en TRU: S/ 69.90 (antes
  S/ 79.90, el de la prenda)».
- `20261011100100_apartar_con_el_precio_de_la_tienda.sql`: la segunda lectura de `separar_prendas` (se puede pegar antes de la
  web). `20261011100200_cambiar_y_filtrar_con_el_precio_de_la_tienda.sql`: `fn_precio_para_cambio` en `registrar_cambio` y
  `fn_productos_filtro` con el precio de la tienda (el listado ordena y las facetas cuentan sobre él); va JUNTO con la web nueva.
- Web: la ficha muestra **cada tienda con su precio** (`preciosEnCadaTienda`); la hoja «Revisa y guarda» dice qué pasa en cada tienda y
  deja **igualar** las que tienen precio propio (`tiendasAlCambiarPrecio`, `quitar_precio_sede` después del guardado); la insignia cuenta
  precios distintos y dice «AQP y LIM S/ 79.90 · TRU S/ 69.90»; la tarjeta, la tabla, `/buscar` y la cabecera de la ficha muestran el
  precio de la tienda elegida; poner o quitar un precio dice cuántas prendas de esa tienda llevan la etiqueta vieja y ofrece imprimirlas.

**Revisión adversaria (2026-10-10, antes de pegar en producción).** Se corrigió: la migración anota en el historial las tallas cuyo
precio de tienda cambia al pasar a la tabla nueva (POL-0023: Blanco y Tostado, de 45.90 a 39.90 en AQP); «Eliminar producto» nombra la
tabla vieja y la nueva en una sola fila; `fn_precios_en_sede` sigue devolviendo solo las variantes que cambian de precio (para que
Vender y Existencias no marquen «Precio de AQP» donde no cambia nada); las anclas de los reemplazos no llevan la palabra que el SQL
Editor confunde con una tabla nueva; y las migraciones van en tres partes: `100000` y `100100` (Apartar) antes de la web, `100200`
(Cambios y filtro) junto con ella. En la web: el paso «¿Qué se lleva?» de Cambios muestra el mismo precio que la diferencia;
«Igualar» corre justo después del guardado principal (si después falla el stock, no se pierde); agregar o desactivar una talla al
mismo precio no se toma por un cambio de precio; la vista previa de etiquetas usa el precio de la tienda que queda; la insignia cuenta
el rango de una prenda con precio por talla como un precio aparte; Cambios lee también el precio de una tienda cerrada.

**Descartado.** Mantener la fila por variante y reconciliarla desde cada función que escribe `variantes` (catalogo_actualizar_producto,
censo_crear_variante, crear_producto_con_variantes, abrir_produccion_con_modelo_nuevo…): son ocho puertas y la siguiente que se abra
lo vuelve a romper; con la fila por prenda el estado imposible deja de existir.

**Datos en producción.** Las vigentes de FAL-0008 (AQP 79.90, TRU 69.90) y POL-0023 (AQP 39.90) pasan una a una; la de AQP en FAL-0008
es igual al precio de la prenda y se archiva sola. En la caja no cambia ningún cobro.

**En producción (2026-10-11):** Felipe pegó `20261011100000` y `20261011100100`; verificado con lecturas: FAL-0008 TRU 69.90 y AQP 79.90
(sin precio propio), POL-0023 AQP 39.90 en sus 9 colores (Blanco y Tostado anotados), disparador activo, `precios_sede` sin vigentes.
`20261011100200` (Cambios y filtro) también se pegó el 2026-10-11 y se verificó (`registrar_cambio` usa `fn_precio_para_cambio`).

**Parte 4 (2026-10-11, del CI del PR #948):** el disparador diferido se encolaba en cualquier cambio de `variantes` y dejaba eventos
pendientes: un `alter table variantes` en la misma transacción fallaba («pending trigger events»; dos suites de pruebas, y lo haría una
migración que toque `variantes` y después la altere). `20261011100300_depurar_precio_de_tienda_solo_si_la_prenda_tiene.sql` lo cambia
por uno con `when (fn_producto_tiene_precio_de_tienda(new.producto_id))`: en un disparador de restricción el WHEN se evalúa al momento,
así que solo las prendas con precio de tienda dejan algo pendiente. El viejo queda apagado, no borrado (`drop trigger` está vedado en
producción y Postgres no reemplaza un disparador de restricción). Pegada en producción el 2026-10-11 y verificada.

**Pendiente (decisión de Felipe, no se tocó):** un precio de tienda no tiene piso de costo ni el tope de descuento que sí tiene un
descuento en la caja (la auditoría lo marcó como el riesgo de dinero más alto que queda).

**Cómo se verifica.** `pnpm pruebas:precio-sede` (32 escenarios; nuevos: talla nueva y reactivada, igual a la prenda se quita solo y no
a medio guardado, Apartar, cambio de la misma prenda, filtro), `pruebas:separaciones` (80), `pruebas:registrar-cambio` (21),
`pruebas:registrar-venta` (28), `eliminar_producto.mjs` (40). En el navegador (local): Lima 89.90 y TRU 69.90 en Blusa Emma, subir la
tabla a 89.90 → la hoja dijo «Lima ya estaba a S/ 89.90: queda igual…» y «Trujillo se queda en S/ 69.90» con su casilla; en TRU la
tarjeta dijo «S/ 69.90 · 2 precios».

## Actualización 2026-10-11 — las pantallas de UNA tienda usan el precio de ESA tienda

La auditoría del 2026-10-10 dejó cinco pantallas que mostraban o calculaban con el precio de la prenda donde debía ir el de la tienda.
Cuatro se corrigieron, **solo en la web, sin migración**, con las piezas que ya existen (`getPreciosPorSede`, `fn_precios_en_sede`):

| Pantalla | Qué cambia |
|---|---|
| Inicio de Almacén ▸ «Nuevo en el catálogo» | El precio de la tarjeta es el de la sede de la cuenta, con céntimos (S/ 69.90, no «S/ 70»), y dice «Precio de esta tienda» cuando es el propio, como Existencias. `armarNuevos` recibe el mapa entero y elige la sede aquí: ninguna pantalla puede pasar el de otra tienda por error. |
| Análisis de la sede | «a precio de venta» (Piso y Quieta), «Ganas por cada una» y el precio del subtítulo usan el precio de MI tienda (`conPreciosDeMiTienda`); de las otras tiendas no se lee precio. Si no se puede leer el precio propio, la pantalla lo dice en sus «fallas» y usa el de la prenda. `fn_analisis_sede` no cambia (una función viva con tres parches y suites que los deshacen). |
| Dañadas (Liquidada) | El «precio de liquidación» que se precarga es el de la caja de esa tienda, que es donde se cobra (`precioEnLaSede`). Sigue sin piso de costo, a propósito (ADR-0071). |
| Campañas ▸ aviso «Por debajo del costo» | Mide el precio MÁS BAJO entre la prenda y las tiendas con precio propio (la campaña vale en todas) y dice cuál es ese precio y dónde: «Falda Emma (FAL-0008) · precio más bajo: S/ 69.90 en Trujillo» (un hecho, no una causa: si la prenda sola también queda bajo el costo, el texto no insinúa que arreglar esa tienda basta). Sigue sin bloquear (decisión del 2026-09-18). El supuesto del «peor caso» —que `precio − descuento` no decrece con el precio— lo prueba una propiedad exhaustiva en céntimos. |

**Pendiente de decisión de Felipe:** Producción mide el margen con el precio MÁS ALTO de la prenda. El Taller fabrica y varias tiendas venden:
las opciones son dejarlo (la regla de Felipe para pantallas de red ya se cumple), medir con el precio más bajo de cualquier tienda, o un
promedio. No se tocó.

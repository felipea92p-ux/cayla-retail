# ADR-0254 — Productos: la Tabla rediseñada para todos, la cabecera de Ventas, filtros plegables y descontinuar en bloque con la regla de Editar

**Fecha:** 2026-09-28
**Estado:** Construido y verificado en local: navegador a 1.440, 768 y 375 px; descontinuar y reactivar dos prendas de punta a punta
contra la RPC nueva; prueba SQL 16/16. **Migración `20260928235000` SIN pegar en producción** (la web funciona sin ella: cae al `update`
directo de antes).
**Decide:** Felipe, 2026-09-28. Primero preguntó si la Tabla hacía falta, con la Grilla mostrando todo con fotos. Le propuse tres caminos
(quitarla, solo cambiarle el look, o dejarla solo para el líder). Eligió el tercero y pidió la maqueta
(`docs/maquetas/productos-administrar-2026-09/`). Al construir lo ajustó: **«para todo el mundo que pueda visualizar catálogo, ya que
tengo la opción de ocultarlo por mi cuenta a las colaboradoras; que se siga llamando Tabla»**, margen bajo en **45 %**, la cabecera
**«con el mismo diseño que las de Ventas, como Cambios y Devoluciones»**, los filtros **«colapsables e idénticos a los de la Grilla»**
y **«lo más responsive posible»**.
**Sobre:** [ADR-0077](0077-productos-gana-vista-de-grilla-con-swatches-de-color.md) (nació la Grilla junto a la Tabla), ADR-0220 (la
cabecera `EncabezadoPagina`), ADR-0169 (paleta y orden de pantalla), ADR-0161 (el rol decide qué módulos ve cada cuenta).

## Contexto

La Tabla (`ProductosAgrupados.tsx`) era la pantalla de antes de la Grilla: una lista sin fotos, con filtros en una tarjeta de nueve
campos que la Grilla ya había plegado. Cada arreglo de Productos había que hacerlo dos veces (análisis `docs/pantallas/productos.md`,
tareas #4 y #6). Aun así, la Tabla tenía cosas que la Grilla no tiene: **marcar varias prendas** y cambiarles el estado de una vez,
**costo y códigos de barra por variante**, el **estado a la vista** y comparar decenas de precios de un vistazo.

Hallazgo al revisar el camino de «Descontinuar/Activar» en bloque: escribía con un `update productos set estado` directo, mientras que
«Editar» (`catalogo_actualizar_producto`) revisa al **reactivar** que la marca y el proveedor sigan activos y se lleven entre sí
(`fn_validar_marca_proveedor`). Eran dos caminos con dos reglas: desde la Tabla una prenda volvía a «Activo» con una marca dada de baja.
Además, sin permiso, la RLS dejaba el `update` en cero filas y la pantalla decía «listo» sin haber cambiado nada.

## Decisiones

**1. La Tabla se queda, rediseñada, para todos los que ven Productos.**
- DECIDÍ: una fila por modelo con miniatura (la foto del color, o su tinte con la percha), nombre, código y categoría, marca y
  proveedor, colores (pasar el mouse cambia la miniatura, como en la Grilla), tallas en orden de curva, precio, costo, **margen con
  barra**, stock con su ritmo de venta, y estado. Un clic abre la ficha de variantes: talla, color, código, barras, precio, costo y
  margen de cada una, con todas las acciones. Editar, Ajustar, Etiquetas e Historial aparecen además al pasar el mouse, flotando
  sobre el estado. Lo que escribe se esconde a quien no puede, y el costo y el margen a quien no ve el dinero (`verDineroCompras`).
- DESCARTÉ dejarla solo para el líder (mi recomendación inicial, opción C): Felipe ya decide por rol quién ve Productos (ADR-0161).
  Esconder la Tabla desde el código sería una segunda llave encima de la suya.
- DESCARTÉ quitarla: se perdía marcar varias y el costo y margen de un vistazo.
- SE ROMPE SI: una colaboradora con el módulo Productos ve costo y margen. No debería pasar, porque eso lo decide `verDineroCompras`
  (y la base ya manda el costo vacío a quien no lo ve), pero es lo primero que hay que mirar si alguien reporta «veo el costo».

**2. Responsive por el ancho de la TABLA, no de la ventana (`@container`).**
- DECIDÍ: debajo de 768 px de tabla, una tarjeta por prenda (celular y tablet vertical, con el menú lateral abierto). Desde ahí, filas,
  y las columnas entran de a una: colores y costo desde 896 px; tallas y marca/proveedor desde 1.152 px. Lo que no cabe baja a la
  línea de la prenda o a la ficha: nunca se pierde. En 1.440 px de ventana la tabla mide 1.071 (medido); con tallas y marca como
  columnas medía 1.142 y cortaba la columna de estado.
- DESCARTÉ el scroll horizontal: en una tablet nadie lo descubre, y el estado quedaba fuera de la vista.
- En la tarjeta de celular no hay hover: las acciones viven en la ficha, y la barra de lo marcado ocupa el ancho con cada botón
  rotulado. Un ícono solo no le dice nada a quien lo ve por primera vez.

**3. Margen: la misma fórmula del alta, umbral de 45 % PROVISIONAL.**
- DECIDÍ: `margenDe` (`lib/productos-vista.ts`) usa `margenPorcentaje` del alta de producto ((precio − costo) / precio, sin descontar
  IGV: es una alerta, no contabilidad). Muestra el rango entre variantes y avisa en ámbar por la variante que **menos** deja. Un
  costo en **cero** no es un costo, es «no se cargó», así que no entra: antes daba «100 %», el mejor margen de la tabla sobre la prenda
  de la que menos se sabe.
- **Objeción abierta:** el ERP ya tiene dos cortes de margen y no coinciden. El alta avisa bajo **30 %** (`nivelMargen`) y Producción
  usa **40/60 %** sobre costo directo (`semaforoMargen`). El 45 % es un tercero. Unificarlos, o decir por qué cada pantalla mira otra
  cosa, queda en BACKLOG como decisión de Felipe.
- SE ROMPE SI: un producto tiene tallas con precios distintos y una sola sin costo. El rango se calcula con las que sí tienen, y la
  ficha dice «sin costo» en la que falta.

**4. La cabecera de Ventas en Productos.**
- DECIDÍ: `EncabezadoPagina` (sede y fecha con el hilo, «Productos» en 46 px, frase) con `ResumenSede` a la derecha: Productos, Para
  pedir, Stock bajo y Sin stock. Las tres de stock filtran al tocarlas, y Para pedir y Stock bajo se pintan en ámbar si hay alguna. Las
  acciones (Grilla/Tabla y «+ Nuevo producto») bajan solas bajo la frase. La nota «Stock total» (`NotaStockTotal.tsx`, borrada) pasó a
  la frase: «el stock es el total de todas las sedes y el Taller; para una sola sede, mira Existencias».
- Arreglo de paso en la pieza compartida: `ResumenSede` pedía desde 640 px un mínimo por cifra, y con cuatro cifras en una tablet con el
  menú abierto desbordaba la página 29 px en horizontal (también en Devoluciones). Ahora el mínimo corre desde 1.024 px; debajo, las
  cifras se reparten el ancho. En escritorio no cambia nada.
- `CLAUDE.md` («Paleta y orden de pantalla») suma Catálogo ▸ Productos a los módulos con esta cabecera. El resto de Catálogo sigue sin
  decidir.

**5. Filtros: una sola forma, la plegable de la Grilla, en las dos vistas.**
- DECIDÍ: se borra la tarjeta de nueve campos de la Tabla y la prop `compacto` de `FiltrosProductos`. Se aparta a propósito de ADR-0169
  («filtros y tabla en UNA tarjeta»): cambiar de vista no debe parecer cambiar de sistema.

**6. Descontinuar y reactivar en bloque con la regla de Editar.**
- DECIDÍ: RPC `retail.cambiar_estado_productos(p_producto_ids uuid[], p_estado text) returns integer` (`20260928235000`),
  **todo o nada**. Al reactivar pasa cada prenda por `fn_validar_marca_proveedor` y por la regla de la rechazada en el censo, y el
  mensaje nombra la prenda que falla («Blusa Aurora»: esa marca ya no está activa). Sin permiso, lo dice en palabras. Es security
  invoker: la RLS de `productos` sigue siendo el candado real. La firma la pone el disparador de historial, que ya usa
  `fn_actor_persona_id(true)`. Bloquea las filas en orden fijo por id para que dos personas no se esperen en círculo.
- DESCARTÉ reactivar las que se pueda y saltar las demás: marcar 12 y que vuelvan 9 sin decir cuáles es peor que no reactivar ninguna
  y decir cuál corregir.
- SE ROMPE SI: alguien desactiva una marca en el mismo instante en que otra persona reactiva prendas de esa marca. La revisión lee la
  marca sin bloquearla, igual que «Editar». Es un caso aceptado, no nuevo.
- Degradación: si la web se publica antes de pegar la migración (`PGRST202`/`42883`), la hoja cae al `update` directo de antes. Sigue
  funcionando, con el hueco de siempre, hasta que se pegue.

**7. Limpieza.** `ProductosAgrupados.tsx` pasa a llamarse `ProductosTabla.tsx`. Se borran «Duplicar» y «Archivar» del menú «···»:
eran placeholders que abrían un `alert("todavía no está conectado")`, y «Archivar» es lo mismo que Descontinuar. «Editar», en la Tabla, deja de
mostrarse a quien no puede editar (tarea #6 del análisis). Lo que comparten la Grilla y la Tabla vive una sola vez:
`components/ProductoPiezas.tsx` (percha, colores, miniatura) y `lib/productos-vista.ts` (colores, tallas en curva, variantes ordenadas,
rangos, margen), con sus pruebas.

## Cómo se verificó

- `pnpm pruebas:productos-estado-en-bloque` (nueva, en el CI): 16/16. Descontinuar firma el historial; reactivar con una marca caída se
  rechaza, nombra la prenda y no cambia ninguna; la que ya estaba activa no cuenta; sin permiso da un mensaje claro; estado inválido;
  `anon` no ejecuta.
- `lib/productos-vista.test.ts` (9) y `lib/etiqueta-precio-reglas.test.ts` (etiquetas por `?variantes=`).
- Navegador, sesión de Felipe en local: a 1.440 px, la tabla mide 1.071 dentro de una tarjeta de 1.071; las acciones aparecen al pasar
  el mouse; la ficha se abre; se marcan dos prendas, «Reactivar» se apaga porque las dos están activas, se descontinúan
  (`POST /rpc/cambiar_estado_productos` → 200), se ven «Descontinuado» y se reactivan. A 768 y 375 px, sin scroll horizontal y con
  tarjetas; la ficha y la barra funcionan en el celular.

## Pendiente

- Pegar `20260928235000` en producción (se pega sola, no toca tablas ni políticas) y refrescar el diccionario.
- Decidir el umbral de margen único (30 / 40–60 / 45 %).

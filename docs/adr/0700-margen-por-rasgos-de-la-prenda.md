# ADR-0700 — El margen del precio sugerido sube por lo que la prenda tiene

- **Fecha:** 2026-11-24 · **Estado:** construido en local (actividades 1 a 6, con la base de Recibir pero no su pantalla); nada en
  producción. Seis migraciones esperan el OK de Felipe (`20261124170000` → `20261124190000`, en ese orden y antes de fusionar).
- **Pidió:** Felipe, 2026-11-24: «margen 30 a 36 %; producto nuevo, tendencia, referencia y que aumente +3 %… casillas donde marquemos si es
  un producto nuevo, si tiene algo que lo diferencia, si es en tendencia». Solo para el precio de venta; el Taller va aparte.
- **Maqueta e investigación:** https://claude.ai/artifact/H769t9La8QMYkJEv4QZQUx (privada; trae cifras agregadas de producción, por eso
  no vive en el repo, que es público).
- **Sigue a:** ADR-0668 (la cuenta única: costo y precio con IGV, margen sobre el precio sin IGV). **Se cruza con:** ADR-0480 y ADR-0660
  («Compré ropa»: ahí quien compra escribe el precio de venta), ADR-0180 (la etiqueta de precio sale sola al recibir).

## El problema

El ERP sugería el precio de venta con una sola vara para toda prenda: el piso que aguanta una rebaja de 35 % (≈ costo × 2.27, 48 % de
margen). Un polo liso que el cliente compara con otras tiendas y una blusa que nadie más tiene salían igual. Medido en producción el
2026-11-24 (525 modelos de proveedor con stock y costo, margen de lista): mediana 36 % en Trujillo, 42 % en Arequipa y 29 % en Lima; 130
modelos bajo 30 % y 303 sobre 36 %.

## Decisión

1. **Margen objetivo = base + puntos de lo que la prenda tiene.** El margen es lo que queda del precio sin IGV (la cuenta de «Te quedan»),
   nunca un recargo sobre el costo («costo + 30 %» daría × 1.53, menos que el × 1.77 de hoy).
2. **La lista de Felipe (2026-11-24), seis:**
   - suman puntos, +3 cada una: «Nadie la tiene» y «En tendencia» (las marca quien compra), «Tela que se nota» (llega marcada si el tejido
     está en la lista del Admin; quien compra puede quitarla) y «Marca que el cliente conoce» (sale sola de la lista de marcas del Admin);
   - no suman puntos: las parecidas (si se venden más caras, se sugiere ese precio) y el precio que se vio afuera (un techo: el sugerido queda
     en el .90 justo debajo).
   - Quedaron fuera, a propósito: «Se vendió a precio lleno», «Pocas unidades» y acabado, calce y detalle de diseño.
3. **Base recomendada: 37 %** (Felipe pidió verla, 2026-11-24). Con los gastos y la planilla de octubre, Trujillo —la tienda que más gasta—
   paga su propia tienda desde × 1.87 el costo (36.9 %), y Arequipa paga tienda y oficina desde 36.2 %. Es la de fábrica y la pantalla la
   muestra con «Usar 37 %»; es un número con fecha (`MARGEN_BASE_RECOMENDADO`): si los gastos cambian, se rehace el análisis. Por defecto,
   mientras Felipe no diga otra cosa: el ámbar es «bajo el objetivo» (base + casillas) y no el piso de 48 %; las casillas nacen en «Compré
   ropa» y viajan a Recibir y al producto.
4. **En pantalla, «%» y no «puntos»** (Felipe 2026-11-24): «+3 %» suma al margen (37 % pasa a 40 %), no al precio. En la base y el código
   siguen siendo puntos de margen (`puntos_*`).
5. **Solo un Admin** cambia la base, los puntos y las listas (Felipe 2026-11-17: «las colaboradoras no deben saber ni pensar gastos»). Vive en
   Configuración ▸ Precios, sin módulo nuevo; cada función de escritura exige `fn_es_admin()`.
6. **Las reglas se guardan con fecha** (una fila por cambio): en 3 a 6 meses se calibran los puntos con las ventas (precios hedónicos), y
   para eso hay que saber qué regla regía cuando se fijó cada precio.

DECIDÍ: base + casillas con puntos, en filas que solo se agregan, con la cuenta de ADR-0668 en un solo archivo (`lib/margen-por-rasgos.ts`).
DESCARTÉ: (a) sumar las casillas encima del piso de 48 %: precios de × 2.3 a × 2.6, sobre los S/ 60 donde la venta de Trujillo cae; (b) las
casillas solo en Catálogo: casi todo entra por Recibir y la etiqueta ya va impresa cuando alguien las marca; (c) los puntos en un jsonb: un
candado por columna hace imposible un punto negativo o una casilla que falta.
SE ROMPE SI: alguien marca las cuatro casillas por costumbre en toda prenda (el +3 se vuelve +12 parejo); por eso dos salen de listas y no se
marcan a mano, y las casillas se guardarán con la prenda para medirlo.

## Qué se construyó (actividad 1)

- **Base** (`20261124170000_reglas_de_precio_por_rasgos.sql`, en producción desde el 2026-11-24): `retail.reglas_de_precio` (una fila por cambio; candados: base
  20–60, casillas 0–10, base con todas ≤ 75 %; fila de fábrica 37 % y +3), `tejidos.se_nota`, `marcas.conocida`, `fn_reglas_de_precio()`,
  `fn_listas_de_precio()`, `guardar_reglas_de_precio`, `marcar_tejido_que_se_nota` y `marcar_marca_conocida` (solo Admin, firmadas con el
  responsable, anotadas en `configuracion_historial` y en Actividad). Prueba: `pnpm pruebas:reglas-de-precio` (38 casos).
- **La cuenta** (`lib/margen-por-rasgos.ts`): `sugerirPrecio` (regla → parecidas → techo de afuera → nunca perder) y `rebajaQueAguanta`,
  en céntimos enteros y con `pierdeConElPrecio` para que «Pierdes» diga lo mismo en todas partes. 19 pruebas, incluidas todas las de costo
  de S/ 1 a S/ 500.
- **Pantalla:** Configuración ▸ Precios (`VistaPrecios`): la base (con la recomendada y «Usar 37 %») y el % de cada casilla (se guardan al
  salir), «Así queda» con un costo de ejemplo,
  y las dos listas con buscador. Quien no es Admin la ve sin poder cambiarla. Su guía interactiva tiene cuatro pasos nuevos.

## Qué se construyó (actividad 2)

- **El ámbar contra el objetivo:** `margenALaVista(costo, precio, margenObjetivo)` compara exacto en céntimos (`llegaAlObjetivo`); la línea
  «Te quedan», el nivel de Nuevo producto («Bajo tu objetivo») y el aviso «Revisa el precio» de Recibir dicen lo mismo. La regla llega a
  toda hoja desde el layout de la app (`ReglasDePrecioProveedor`, `useMargenObjetivo`); si no se puede leer, vale la de fábrica. El .90 de
  CAYLA pasó a la cuenta única (`aNoventaCts`). La propuesta con IA sigue con su piso de 48 % hasta la actividad 5.

## Qué se construyó (actividad 3)

- **«Compré ropa» con las casillas** (`20261124174000_compra_con_rasgos_de_la_prenda.sql`, en producción desde el 2026-11-24): `orden_compra_items.rasgos` (los
  códigos de ADR-0700, en el orden de la hoja) y `precio_visto_afuera` (techo del sugerido), con sus candados y sus lectores
  (`fn_rasgos_de_linea`, `fn_precio_visto_de_linea`). Las escribe `fn_registrar_compra_rapida_base` en la misma transacción que crea la línea,
  con un reemplazo anclado que NO toca el bloque que ancla 20261113211000 (las pruebas que la vuelven a pegar siguen pasando). No es
  `sugerido_motivos`: lo que la prenda tiene es de la prenda, y una prenda «a la espera de precio» también lo guarda. `fn_reglas_de_precio`
  trae además las listas (ids). Prueba: `pnpm pruebas:compra-con-rasgos` (18 casos).
- **La hoja de prenda** (`mi-plata/HojaPrenda.tsx`): «¿Qué tiene esta prenda?» (tres casillas a mano y la marca sola, cada una con su «+3 %»),
  «Sugerido S/ …» que se escribe de un toque, «¿La vieron más cara afuera?» y la línea «Te quedan» de la cuenta única. Se fue «Por cada una
  ganas» (`gananciaPorPrenda`): era la resta simple con IGV que ADR-0668 descartó (S/ 30.90 → S/ 54.90 decía «ganas S/ 24.00»; quedan S/ 15.63).
- Aquí no se pregunta el tejido: «Tela que se nota» la marca quien compra; llega sola por el tejido donde se elige (actividad 4).
- «Editar orden» del escritorio reescribía las líneas sin estas columnas: lo cierra la sección siguiente.

## Qué se construyó (actividad 4, la base)

- `20261124180000_prenda_con_rasgos_al_recibir.sql` (en producción desde el 2026-11-24): `retail.producto_rasgos` (una fila por prenda: «Nadie la tiene» y «En
  tendencia» sí/no; «Tela que se nota» sí/no o nula = por su tejido; la marca NO se guarda, sale siempre de la lista) y
  `fn_rasgos_de_producto(uuid)` (lo que tiene en efecto). `fn_envio_detalle` trae `rasgos` y `precio_visto_afuera` de cada línea, y
  `preparar_prenda_al_recibir` deja en la prenda (nueva o ya existente) las casillas de su línea si todavía no tiene las suyas: lo de Catálogo
  no se pisa. Los dos parches son bloques nuevos: no mueven texto que anclen otras migraciones (con el primer intento, que cambiaba la
  lectura de la línea, `envio_sin_aviso` bajaba a 40/44 porque vuelve a pegar 20261107191000). Prueba: `pnpm pruebas:recibir-con-rasgos` (14).
- **La pantalla de Recibir espera:** la hoja donde se le pone precio a un modelo nuevo (`recepcion-envio/HojaPrenda.tsx`) y sus reglas las
  está cambiando el PR #2001 (ADR-0699). Se hace sobre main cuando ese PR se fusione, para no chocar.

## «Editar orden» no pierde lo de cada línea (2026-11-24, junto a la actividad 4)

- **El hueco:** «Editar orden» borra las líneas y las vuelve a escribir con lo que manda la pantalla. El escritorio nunca leyó el sugerido ni
  sus motivos, y la base nunca escribió la prenda del catálogo, «a la espera de precio», las casillas ni el precio visto afuera: corregir una
  cantidad de una orden de «Compré ropa» (sin comprobante ni envío, que es cuando se ofrece «Editar») le borraba todo eso. En producción
  ninguna de las 42 órdenes con sugerido estaba en esa ventana (2026-11-24): no llegó a pasar.
- `20261124181000_editar_orden_conserva_lo_de_la_linea.sql` (en producción desde el 2026-11-24): `fn_orden_compra_detalle` trae `producto_id`,
  `precio_por_definir`, `rasgos` y `precio_visto_afuera` por línea, y `fn_orden_compra_escribir_lineas` los escribe en el mismo `insert`,
  revisados: la prenda solo si sigue siendo de la misma categoría y marca; «a la espera» solo sin sugerido ni prenda; casillas y precio visto
  con los lectores de «Compré ropa». Van al principio de las listas del `insert` (20261022080000 ancla el final) y no en un `update` aparte
  (el candado `por_definir_no_vuelve` de 20261113211000 no deja que una línea pase de «con precio» a «a la espera»).
- La web (`lib/ordenes-compra-reglas.ts`, `lib/orden-compra-alta.ts`): cada línea del detalle guarda `deLaCompra` y el editor lo devuelve
  tal cual al guardar; una línea nueva no lo tiene. Guardar sin cambiar nada sigue sin subir la versión (la huella no cambió).
- Pruebas: `pnpm pruebas:editar-orden-conserva` (23; con la función de antes fallan 7) y la S4 de `orden_compra_sugerido` mide ahora su
  propio parche, no la palabra `precio_venta_sugerido`.

## Qué se construyó (actividad 5, Catálogo)

- `20261124183000_rasgos_de_la_prenda_en_catalogo.sql` (en producción desde el 2026-11-24): `fn_producto_rasgos(uuid)` (lo guardado tal cual, con la tela nula =
  por su tejido) y `guardar_rasgos_de_producto(uuid, boolean, boolean, boolean)` (quien ve Productos; firma el responsable; devuelve lo que
  tiene en efecto). Prueba: `pnpm pruebas:rasgos-en-catalogo` (14).
- Una sola pieza para las casillas: `components/QueTieneLaPrenda.tsx` («Compré ropa», Nuevo y Editar producto).
- **Nuevo producto:** «¿Qué tiene esta prenda?» bajo el costo y el precio; el ámbar dice «Bajo tu objetivo de N %»; «Sugerido S/ …» escribe
  el precio de la regla de un toque. Las casillas se guardan después de crear la prenda, como «cómo la llama el proveedor»: si esa segunda
  llamada falla (o la prenda se creó sin conexión), la prenda queda creada, se mide con la base y se avisa que se marquen en Editar producto.
- **Editar producto:** en «Variantes y precios», las casillas (solo quien ve el costo: sin costo el objetivo no se ve en ninguna parte) se
  guardan al marcarlas (`ficha-producto/QueTieneEnLaFicha.tsx`), aparte del «Revisar y guardar», y nunca cambian un precio. La tabla de
  tallas en «Costos» mide con la cuenta única y el objetivo de la prenda: antes era la resta con IGV adentro y el ámbar fijo en 30 %
  (`margenDeFila` y `nivelMargen` se borraron).
- **La IA:** su piso ya no es ×2.27 (`pisoDelPrecio`, borrado): es el menor .90 que llega al objetivo de la prenda, nunca bajo costo + 30 %.
  La ruta recibe lo que la prenda tiene (o lo lee de la base en una revisión), se lo dice a la IA (`margen_objetivo`, `precio_minimo`) y
  la pantalla dice «Es el mínimo para tu objetivo de N %».
- **La lista de Productos** (mismo día): medía con la resta con IGV adentro (`margenPorcentaje`, borrado) y un ámbar fijo en 45 %
  (`UMBRAL_MARGEN_BAJO`, «provisional» desde 2026-09-28, borrado): la misma prenda decía un % en la lista y otro al abrirla. Ahora
  `margenDe` usa la cuenta única (`margenALaVista`) contra el objetivo de cada prenda; una talla que pierde se ve en rojo profundo. Lo que
  tiene cada prenda de la página llega en una sola consulta más (`fn_rasgos_de_productos(uuid[])`, `20261124190000`, ≤ 20 por página,
  hasta 200), como la de las descripciones; si falla, la lista mide con la base. `fn_rasgos_de_producto` pasó a ser esa misma consulta.
  Una prueba cruza la lista con la ficha talla por talla. Producción («40/60 % sobre costo», `semaforoMargen`) sigue aparte a propósito.
- **Queda aparte:** la hoja de Recibir no manda las casillas a la propuesta hasta que se haga su parte web (después del PR #2001).

## Actualización 2026-11-24 (b): las casillas son una lista que edita el Admin (`20261124201000`)

**En producción desde el 2026-11-26** (pegada por el SQL Editor a las 16:31 de Lima, antes de fusionar el PR #2004; por eso no figura en
`supabase_migrations.schema_migrations`). Comprobado el 2026-11-28: las diez funciones que crea o cambia dan el mismo md5 que el repo (sin
las líneas de comentario en los dos lados), con los mismos permisos; la tabla con RLS y sin acceso directo; Recibir escribe la lista nueva.
La migración es idempotente: pegarla otra vez no cambia nada.

**El problema.** Felipe pidió más casillas (2026-11-24: «dame más variedad de opciones») mirando «¿Qué tiene esta prenda?» en Nuevo
producto. Las cuatro vivían fijas: una columna de puntos por casilla en `reglas_de_precio`, una sí/no por casilla en `producto_rasgos`, los
códigos escritos en el candado de `orden_compra_items` y en ocho funciones y siete pantallas. Cada casilla nueva era una migración, su ensayo
y su pegado en producción. Eligió la opción «Lista que edita el Admin» y sumar ya «Detalle de diseño» y «Acabado y confección».

**Lo que cambió.**
- `retail.rasgos_de_precio`: una fila por casilla (código, nombre, ayuda, puntos 0–10, origen, orden, prendida). Nace con seis, a +3 %:
  las cuatro de antes y las dos que eligió Felipe. El origen dice de dónde sale: `a_mano` (la marca quien compra), `por_tejido` (llega por
  la lista de tejidos y se puede quitar) o `por_marca` (sale sola de la lista de marcas); hay a lo más una de cada una de las dos últimas.
- Una casilla **no se borra ni cambia de código ni de origen** (un disparador lo frena aunque alguien escriba directo): se apaga. Apagada no
  suma en ninguna prenda; las prendas y las líneas de compra conservan su código y vuelve a contar si se prende. Guardar una prenda en
  Editar producto sin ver la casilla apagada no se la quita.
- `producto_rasgos` guarda dos listas: `marcados` y `quitados` (lo que llegaba por el tejido y alguien quitó). Lo de las columnas sí/no
  se pasó a las listas antes de quitarlas. Otro disparador exige que todo código de una prenda o de una línea de compra esté en la lista.
- `reglas_de_precio` queda solo para la base (sus columnas de puntos son historia). `guardar_reglas_de_precio(p_margen_base, p_puntos)` pide
  los puntos de cada casilla prendida, por código. Nueva: `guardar_casilla_de_precio(p_codigo, p_nombre, p_ayuda, p_puntos, p_activa)`
  (solo Admin; sin código crea una a mano con su código sacado del nombre; frena el nombre repetido y el tope de 75 %). `fn_reglas_de_precio`
  trae `casillas` (las prendidas, en orden) y `apagadas`. `guardar_rasgos_de_producto(uuid, text[], text[])` reemplaza a la de tres sí/no.
- **Web:** `QueTieneLaPrenda` dibuja las casillas de la lista (de a dos con la columna ancha), cada una con su «?» que dice cómo
  reconocerla. En Configuración ▸ Precios, cada casilla con su lápiz y «Agregar casilla» abren `CasillaDePrecioModal` (con «Existe
  también», guía de foco y el responsable); las apagadas se ven debajo y se prenden desde su lápiz. Si la base todavía tiene la función de
  antes (sin `casillas`), la web arma la lista con las de fábrica que nombran sus puntos: nada se cae.

DECIDÍ: una tabla con la lista, y los códigos guardados como texto en la prenda y en la línea, con disparadores que exigen que existan.
DESCARTÉ: (a) seguir sumando columnas: cada casilla nueva costaba una migración que tocaba ocho funciones; (b) una tabla puente prenda ×
casilla con llave foránea: una fila por casilla marcada para un dato que se lee y se escribe entero, y la lista de la línea de compra
igual tendría que validarse aparte.
SE ROMPE SI: un Admin apaga una casilla que muchas prendas tienen: deja de sumar en todas a la vez (es lo que pide «apagar»), y el ámbar de
esas prendas cambia sin que nadie toque una ficha.

**Lo que pesa más que sumar casillas (análisis del 2026-11-24):** con más casillas, una
prenda suma más veces el mismo motivo («Nadie la tiene», «Pocas unidades», «No se repite» miden lo mismo). El tope de 75 % frena el
exceso, pero lo que de verdad lo corrige es medir: comparar después de una temporada si las prendas con cada casilla se vendieron más a precio
lleno. Las casillas que calcularía el ERP solo («Llega a inicio de temporada», «Pocas unidades») necesitan un origen nuevo y código.

## Actualización 2026-11-26: las casillas se van con la prenda y pasan al fusionar (`20261126211000`)

En la revisión del PR #2004, las pruebas de deriva de eliminar y fusionar productos frenaron `producto_rasgos`: una prenda sin historia con
casillas no se podía eliminar, y al fusionar dos fichas las casillas del duplicado se quedaban en él. La llave a `productos` pasó a
`on delete cascade` (las casillas son configuración de la ficha, como `producto_taller`) y `fusionar_productos` las trata «uno por
producto»: mandan las del que queda; las del duplicado pasan solo si el que queda no tiene. En producción desde el 2026-11-26.

## Lo que falta

- **Producción:** al día. Las seis primeras desde el 2026-11-24 y `20261124201000` y `20261126211000` desde el 2026-11-26. Falta
  `pnpm datos:refrescar` para el diccionario.
- **Llenar las listas:** en producción, «Tejidos que se notan» y «Marcas que el cliente conoce» siguen vacías (2026-11-28): hasta que un
  Admin las marque en Configuración ▸ Precios, ninguna prenda suma esas dos casillas sola.
- **La pantalla de Recibir** (la web de la actividad 4), cuando se fusione el PR #2001 (ADR-0699 toca la misma hoja).
- **Calibrar los +3 %** con las ventas de 3 a 6 meses de casillas guardadas: hoy son una hipótesis.
- El detalle, en `docs/backlog/2026-11-24-margen-ganancia-atributos-2fe4df.md`.

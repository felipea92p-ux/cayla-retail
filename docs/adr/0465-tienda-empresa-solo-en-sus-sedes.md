# ADR-0465 — Tienda online: una prenda de CLAURE solo se ve y se separa en las tiendas donde CLAURE opera, y cada tarjeta dice su empresa

**Estado:** construido y verificado en local (base + web de la tienda). **Las 7 migraciones están EN PRODUCCIÓN desde 2026-10-21** (Felipe: «súbelo, no esperes confirmación»; pegadas con `apply_migration`, una por una, con las anclas contadas antes; la web sigue en el PR #1228) ·
**Fecha:** 2026-10-21 · **Decidió:** Felipe · **Continúa:** ADR-0463 (empresas CAYLA y CLAURE)

## Contexto

ADR-0463 puso `productos.empresa_id` y `empresa_sedes` (qué empresa opera en qué sede; hoy CLAURE solo en Lima), pero la tienda online no los
leía: una prenda de CLAURE publicada en la Vitrina salía igual en el catálogo de Trujillo, su ficha se abría con el enlace y se podía separar
para recoger allá. Felipe (2026-10-20): «los productos de CLAURE solo se muestran cuando la sede que se está mostrando es Lima», y «todas las
tarjetas deben indicar la empresa a la que pertenecen: la insignia de “Nuevo” con el nombre de la empresa, debajo de “Nuevo” si la tarjeta lo
tiene, y si no, arriba». La tienda ya no tiene «Todas» (Felipe 2026-10-19: «siempre se debe elegir una tienda»).

## Decisión

- **La regla vive en la base, no en la pantalla.** La tienda solo habla con `retail.tienda_*`; un filtro de pantalla deja abiertos el enlace directo
  y «Separar». `fn_tienda_empresa_se_ve(producto, sede)` (nueva, solo la llaman las `tienda_*`) responde si la empresa de la prenda opera en esa
  tienda, leyendo **`fn_empresas_de_sede`**, la misma regla que decide qué empresas se ofrecen al crear un producto: una sola fuente. CAYLA se ve
  siempre (también sin tienda); una sede sin filas en `empresa_sedes` es solo-CAYLA; sin tienda válida, CLAURE no se ve.
- **Dónde se aplica** (reemplazos anclados, ninguna función reescrita): `tienda_catalogo` (de ahí salen Lo nuevo, Más vendidos, ofertas),
  `tienda_ficha` (responde `null`, igual que una prenda sin publicar: la web dice «Esta prenda ya no está en la tienda»), `tienda_probador`,
  `tienda_separar` (rechazo de siempre `tienda_separar_no_se_vende`), `tienda_bolsa` (`se_vende` de cada tienda: la prenda de CLAURE sigue en la
  bolsa pero dice «no se vende en esa tienda») y `tienda_separadas_por_otros`.
- **El catálogo dice la empresa SOLO en una tienda donde operan dos o más empresas** (Felipe 2026-10-21: «la insignia con la empresa solo debe aparecer en la
  sede Lima»): `'empresa': {clave, nombre}` por prenda, de `empresas.nombre` tal cual, si `fn_empresas_de_sede(tienda)` trae más de una; en Trujillo (todo es
  CAYLA), sin tienda o con una tienda inventada, `empresa` va `null` y no hay insignia. La regla es «más de una empresa», no «Lima» por su nombre: si CLAURE abre
  otra sede, la insignia aparece ahí sola. La tarjeta la dibuja con la misma cara
  de «Nuevo» (`insigniasDeTarjeta`, `apps/tienda/lib/catalogo.ts`): de arriba abajo puesto, oferta, «Nuevo» y la empresa; **sin «Nuevo» (por
  ejemplo en Lo nuevo, donde no se repite), la empresa sube al principio**. Sin el dato (base vieja), no hay insignia ni error.
- **Looks con CLAURE (Felipe 2026-10-21):** «validar si un look contiene algún producto CLAURE: si es así, ese look solo debe estar disponible cuando la sede
  sea Lima». La tienda ya mostraba un look solo si TODAS sus prendas están en el catálogo de esa tienda, así que «solo en Lima» sale solo de la regla de arriba: el look
  con una prenda de CLAURE no sale en Trujillo ni por su enlace. Lo que faltaba era el **editor de la Vitrina**: `fn_vitrina_looks`, `vitrina_guardar_look` y
  `vitrina_mostrar_look` usaban el catálogo sin tienda (que ya no trae CLAURE), así que no ofrecían sus prendas y rechazaban el look. Ahora usan
  `fn_vitrina_catalogo_de_looks()`: las prendas que se ven en alguna tienda de la web (sin tienda + cada tienda), sin marcar el look con una tienda.
  **Cada prenda del look dice su empresa encima de su nombre** (Felipe 2026-10-21; la frase del look no se usa para eso: la escribe quien arma el look):
  `fn_tienda_looks_json` copia el `empresa` del catálogo de esa tienda a cada prenda (`20261021014000`), así que sigue la misma regla —solo en Lima— y la página del
  look y su hoja de tallas lo escriben como una línea chica sobre el nombre (`.t-look-empresa`).
- **La bolsa (Felipe 2026-10-21):** (1) la bolsa también muestra la tienda en que se está: el selector de tienda de la cabecera (el mismo del catálogo; cambiar de
  tienda vacía la bolsa y lo avisa antes) y su dirección `/bolsa?sede=` (con prendas, manda la tienda de la bolsa; sin ellas, la de la dirección o la última elegida);
  (2) la bolsa vacía ofrece Lo nuevo y los favoritos **de esa tienda** (antes leía el catálogo sin tienda, que no trae CLAURE ni la empresa): en Lima salen con su
  insignia; (3) cada línea de la bolsa dice su empresa encima del nombre (`tienda_bolsa` suma `empresa`, `20261021011000`, con la regla de siempre: solo en Lima).
- **Toda tarjeta, en Lima (Felipe 2026-10-21):** la insignia de empresa sale solo si la página lee el catálogo DE UNA TIENDA. Mi perfil («Favoritos» y «Novedades para ti»)
  y la página «Esta prenda ya no está» leían el catálogo sin tienda (que no trae CLAURE ni la empresa); ahora leen el de la tienda que la persona eligió la última vez
  (`sedeRecordada`, `lib/sede-servidor.ts`: la cookie del selector; sin ella, la primera tienda; no redirige). Queda con el catálogo sin tienda solo lo que no dibuja tarjetas
  (los menús de la cabecera).
- **El pedido (Felipe 2026-10-21):** el detalle de un pedido (`/cuenta/pedidos/<n>`) y la página «Separado» dicen la empresa de cada prenda encima de su nombre
  (`PrendaDelPedido`). `tienda_mis_pedidos` (de la que sale `tienda_pedido`) suma `empresa` a cada línea, con la regla de siempre pero mirando la tienda DEL PEDIDO (donde
  se recoge): un pedido a Lima la dice; uno a Trujillo, no (`20261021013000`).
- **Migraciones** (todas idempotentes, una parte, sin tablas en exclusiva ni políticas): `20261021000000_tienda_empresa_solo_en_sus_sedes`,
  `20261021001000_tienda_catalogo_trae_la_empresa`, `20261021002000_tienda_separar_y_bolsa_empresa_por_tienda`, `20261021003000_vitrina_looks_con_claure_solo_en_lima`, `20261021014000_tienda_looks_trae_la_empresa_de_cada_prenda` (el 004 lo tomó otra rama), `20261021011000_tienda_bolsa_trae_la_empresa_de_cada_prenda`, `20261021013000_tienda_pedidos_traen_la_empresa_de_cada_prenda`. Requieren `20261020225000` (ya en
  producción). El orden con la publicación de la web no importa.

## Alternativas descartadas

- **Filtrar en `apps/tienda`:** deja el enlace directo y «Separar» abiertos.
- **Marcar cada look con una tienda (`vitrina_looks.ubicacion_id`):** dos datos que se contradicen; la regla de las prendas ya decide dónde sale.
- **Reescribir `fn_vitrina_publicable` con una sede:** es de la Vitrina del ERP, que tiene que ver todo lo publicado de cualquier empresa.
- **Tocar `fn_variante_permitida_en_sede`:** la usan también la caja y los traslados del ERP; qué empresa va a qué sede allí es otra decisión.
- **Decir «solo en Lima» en una ficha de CLAURE abierta desde otra tienda:** obliga a un caso más en la web; se trata como una prenda que no está.
- **Sacar de la bolsa la prenda de CLAURE al elegir otra tienda:** la persona perdería lo que guardó por mirar otra tienda.

## Lo que se rompe si…

- Una función nueva de la tienda arma su lista con `fn_vitrina_publicable` sin llamar a `fn_tienda_empresa_se_ve`: la vigila `pnpm pruebas:tienda-empresas`
  (45 comprobaciones; dos mutantes —el ayudante siempre responde sí, el editor mira solo el catálogo sin tienda— la ponen en rojo).
- CLAURE abre otra sede y nadie suma su fila en `empresa_sedes`: no se ve ahí (es seguro).

## Lo que queda (decisión de Felipe)

- **Editor de looks:** el aviso «solo en Lima» en la pantalla de Vitrina web ▸ Looks (hoy el editor ofrece las prendas de CLAURE y deja publicar el look, pero no
  dice que ese look saldrá solo en Lima). Es una pantalla del ERP y se pide aparte.
- **«Novedades para ti» del Club** (`tienda_mi_club` → `fn_tienda_novedades`) no recibe tienda: su cifra `total` puede contar una prenda de CLAURE que
  quien mira Trujillo no ve (las tarjetas salen del catálogo de la tienda y la omiten). No filtrado aún.
- **Favoritos y «Avísame»:** se guardan por id; una de CLAURE guardada desde Lima no se dibuja con otra tienda elegida.
- **La ficha de la prenda** no muestra la empresa (las tarjetas y las prendas de un look, como se pidió). Tampoco el probador («Tu look»).
- **El texto del rechazo en «Separar»:** una prenda de CLAURE con Trujillo dice «no se vende en esa tienda» (el de siempre).
- **Producción (2026-10-21):** las 7 migraciones pegadas en orden (`…000`, `…001`, `…002`, `…003`, `…011`, `…013`, `…014`). Las filas del historial llevan la hora del pegado, no el número del archivo
  (`20261021011806`…`20261021011919`): para saber si están, comprobar el efecto (`fn_tienda_empresa_se_ve`, `'empresa'` en `tienda_catalogo`, `fn_vitrina_catalogo_de_looks`…). Verificado en solo lectura: las 11
  funciones parchadas; Lima trae la empresa en sus 327 prendas y TRU, AQP y «sin tienda» no; `anon` y `tienda_web` no ejecutan los ayudantes. Hoy los 407 productos son de CAYLA: nada cambia de lo que
  se ve hasta que alguien cree uno de CLAURE.

## Verificación

`pnpm pruebas:tienda-empresas` (45/45: catálogo, ficha, probador, una tienda inventada, sin tienda, CLAURE abriendo en Trujillo con una fila, puerta de
`tienda_web`, pegado dos veces, empresa en el catálogo, bolsa, «Separar» y looks: el editor ofrece y deja publicar una prenda de CLAURE, el look con CLAURE sale en Lima y no en Trujillo, el solo de CAYLA sale en las dos); `tienda-bolsa`, `tienda-probador`, `tienda-club`, `tienda-puerta`,
`tienda-separadas`, `tienda-looks-guardados`, `tienda-lugares` en verde; `tienda-ficha` y `tienda-inicio` aceptan la clave `empresa` en la lista exacta del catálogo
(`tienda-ficha`, `vitrina-looks` y `vitrina-web` dejan un escenario en rojo SOLO en esta base local, por las fotos y publicaciones de demo que se cargaron). Tienda: 741 pruebas, tipos y lint en verde (6 nuevas
de las insignias). Navegador: Lima muestra 13 prendas con «NUEVO / CLAURE» y «NUEVO / CAYLA»; Trujillo, solo CAYLA y SIN insignia de empresa, y el enlace de una prenda de CLAURE
abre «Esta prenda ya no está en la tienda»; en Lo nuevo la insignia de la empresa queda arriba; a 375 px cabe. La bolsa se vio en el navegador vacía (Lima y Trujillo, con su selector y las tarjetas con insignia solo en Lima) y con prendas pidiendo la página al servidor
con la cookie de la bolsa (Lima: «CAYLA» y «CLAURE» sobre cada nombre y «Tienda: Lima»; Trujillo: selector y sin empresa). El detalle de un pedido de Lima (W-0925, creado en local con `tienda_separar`) se vio en el navegador con la empresa sobre cada prenda. No recorrido con clics: agregar a la
bolsa y separar (el servidor de desarrollo no hidrata la ficha por avisos de `Date.now()` ya existentes; cubierto por la prueba de la base).

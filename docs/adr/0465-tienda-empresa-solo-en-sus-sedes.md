# ADR-0465 — Tienda online: una prenda de CLAURE solo se ve y se separa en las tiendas donde CLAURE opera, y cada tarjeta dice su empresa

**Estado:** construido y verificado en local (base + web de la tienda). **Las 3 migraciones NO están en producción** (esperan el OK de Felipe) ·
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
- **Migraciones** (todas idempotentes, una parte, sin tablas en exclusiva ni políticas): `20261021000000_tienda_empresa_solo_en_sus_sedes`,
  `20261021001000_tienda_catalogo_trae_la_empresa`, `20261021002000_tienda_separar_y_bolsa_empresa_por_tienda`, `20261021003000_vitrina_looks_con_claure_solo_en_lima`. Requieren `20261020225000` (ya en
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
  (38 comprobaciones; dos mutantes —el ayudante siempre responde sí, el editor mira solo el catálogo sin tienda— la ponen en rojo).
- CLAURE abre otra sede y nadie suma su fila en `empresa_sedes`: no se ve ahí (es seguro).

## Lo que queda (decisión de Felipe)

- **Editor de looks:** el aviso «solo en Lima» en la pantalla de Vitrina web ▸ Looks (hoy el editor ofrece las prendas de CLAURE y deja publicar el look, pero no
  dice que ese look saldrá solo en Lima). Es una pantalla del ERP y se pide aparte.
- **«Novedades para ti» del Club** (`tienda_mi_club` → `fn_tienda_novedades`) no recibe tienda: su cifra `total` puede contar una prenda de CLAURE que
  quien mira Trujillo no ve (las tarjetas salen del catálogo de la tienda y la omiten). No filtrado aún.
- **Favoritos y «Avísame»:** se guardan por id; una de CLAURE guardada desde Lima no se dibuja con otra tienda elegida.
- **La ficha de la prenda** no muestra la empresa (solo las tarjetas, como se pidió).
- **El texto del rechazo en «Separar»:** una prenda de CLAURE con Trujillo dice «no se vende en esa tienda» (el de siempre).
- **Pegar a producción:** pendiente del OK de Felipe (partes y orden en cada migración).

## Verificación

`pnpm pruebas:tienda-empresas` (38/38: catálogo, ficha, probador, una tienda inventada, sin tienda, CLAURE abriendo en Trujillo con una fila, puerta de
`tienda_web`, pegado dos veces, empresa en el catálogo, bolsa, «Separar» y looks: el editor ofrece y deja publicar una prenda de CLAURE, el look con CLAURE sale en Lima y no en Trujillo, el solo de CAYLA sale en las dos); `tienda-bolsa`, `tienda-probador`, `tienda-club`, `tienda-puerta`,
`tienda-separadas`, `tienda-looks-guardados`, `tienda-lugares` en verde; `tienda-ficha` y `tienda-inicio` aceptan la clave `empresa` en la lista exacta del catálogo
(`tienda-ficha`, `vitrina-looks` y `vitrina-web` dejan un escenario en rojo SOLO en esta base local, por las fotos y publicaciones de demo que se cargaron). Tienda: 741 pruebas, tipos y lint en verde (6 nuevas
de las insignias). Navegador: Lima muestra 13 prendas con «NUEVO / CLAURE» y «NUEVO / CAYLA»; Trujillo, solo CAYLA y SIN insignia de empresa, y el enlace de una prenda de CLAURE
abre «Esta prenda ya no está en la tienda»; en Lo nuevo la insignia de la empresa queda arriba; a 375 px cabe. No recorrido en el navegador: agregar a la
bolsa y separar (cubierto por la prueba de la base).

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
- **El catálogo dice la empresa** (`'empresa': {clave, nombre}` por prenda, de `empresas.nombre` tal cual) y la tarjeta la dibuja con la misma cara
  de «Nuevo» (`insigniasDeTarjeta`, `apps/tienda/lib/catalogo.ts`): de arriba abajo puesto, oferta, «Nuevo» y la empresa; **sin «Nuevo» (por
  ejemplo en Lo nuevo, donde no se repite), la empresa sube al principio**. Sin el dato (base vieja), no hay insignia ni error.
- **Migraciones** (todas idempotentes, una parte, sin tablas en exclusiva ni políticas): `20261021000000_tienda_empresa_solo_en_sus_sedes`,
  `20261021001000_tienda_catalogo_trae_la_empresa`, `20261021002000_tienda_separar_y_bolsa_empresa_por_tienda`. Requieren `20261020225000` (ya en
  producción). El orden con la publicación de la web no importa.

## Alternativas descartadas

- **Filtrar en `apps/tienda`:** deja el enlace directo y «Separar» abiertos.
- **Reescribir `fn_vitrina_publicable` con una sede:** es de la Vitrina del ERP, que tiene que ver todo lo publicado de cualquier empresa.
- **Tocar `fn_variante_permitida_en_sede`:** la usan también la caja y los traslados del ERP; qué empresa va a qué sede allí es otra decisión.
- **Decir «solo en Lima» en una ficha de CLAURE abierta desde otra tienda:** obliga a un caso más en la web; se trata como una prenda que no está.
- **Sacar de la bolsa la prenda de CLAURE al elegir otra tienda:** la persona perdería lo que guardó por mirar otra tienda.

## Lo que se rompe si…

- Una función nueva de la tienda arma su lista con `fn_vitrina_publicable` sin llamar a `fn_tienda_empresa_se_ve`: la vigila `pnpm pruebas:tienda-empresas`
  (28 comprobaciones; un mutante —el ayudante siempre responde sí— la pone en rojo: 9 de 27 fallan).
- CLAURE abre otra sede y nadie suma su fila en `empresa_sedes`: no se ve ahí (es seguro).

## Lo que queda (decisión de Felipe)

- **Looks:** `vitrina_guardar_look` valida cada pieza contra `tienda_catalogo(null)`, que ya no trae CLAURE, así que **un look publicado no puede llevar una
  prenda de CLAURE** (se rechaza con «tiene que verse en la web en ese color»). Un look de CLAURE solo para Lima pide un look por tienda.
- **«Novedades para ti» del Club** (`tienda_mi_club` → `fn_tienda_novedades`) no recibe tienda: su cifra `total` puede contar una prenda de CLAURE que
  quien mira Trujillo no ve (las tarjetas salen del catálogo de la tienda y la omiten). No filtrado aún.
- **Favoritos y «Avísame»:** se guardan por id; una de CLAURE guardada desde Lima no se dibuja con otra tienda elegida.
- **La ficha de la prenda** no muestra la empresa (solo las tarjetas, como se pidió).
- **El texto del rechazo en «Separar»:** una prenda de CLAURE con Trujillo dice «no se vende en esa tienda» (el de siempre).
- **Pegar a producción:** pendiente del OK de Felipe (partes y orden en cada migración).

## Verificación

`pnpm pruebas:tienda-empresas` (28/28: catálogo, ficha, probador, una tienda inventada, sin tienda, CLAURE abriendo en Trujillo con una fila, puerta de
`tienda_web`, pegado dos veces, empresa en el catálogo, bolsa, «Separar» y looks); `tienda-bolsa`, `tienda-probador`, `tienda-club`, `tienda-puerta`,
`tienda-separadas`, `tienda-looks-guardados`, `tienda-lugares` en verde; `tienda-ficha` y `tienda-inicio` aceptan la clave `empresa` en la lista exacta del catálogo
(`tienda-ficha` deja un escenario de fotos en rojo SOLO en esta base local, por las fotos de demo que se cargaron). Tienda: 741 pruebas, tipos y lint en verde (6 nuevas
de las insignias). Navegador: Lima muestra 13 prendas con «NUEVO / CLAURE» y «NUEVO / CAYLA»; Trujillo, solo CAYLA, y el enlace de una prenda de CLAURE
abre «Esta prenda ya no está en la tienda»; en Lo nuevo la insignia de la empresa queda arriba; a 375 px cabe. No recorrido en el navegador: agregar a la
bolsa y separar (cubierto por la prueba de la base).

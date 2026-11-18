# ADR-0677 — Campañas y ofertas, más simple: los descuentos van primero, en la lista

**Fecha:** 2026-11-18 · **Estado:** aceptado por Felipe (la cara A el 2026-11-17; la lista de 9 actividades, «Aprobada»; las dos reglas de la
actividad 4 el mismo día). Construye sobre ADR-0669 (los cajones de «Poner un %») y ADR-0655 (Campañas y ofertas). Este ADR cubre las
actividades 1 a 5; la campaña abierta, la hoja de ofertas en una sola hoja y la compra de ejemplo (6 a 8) van en el PR siguiente y lo amplían.

## Contexto

ADR-0669 dejó «Poner un %» en producción el 2026-11-16: un escáner arriba, una hoja con tres preguntas y, debajo, «Rebajas de tu tienda» en
tarjetas. Felipe, al verlo: «ese diseño está horrible… parecen 3 tarjetas sueltas al azar». Se dibujó la maqueta del módulo entero
(`docs/maquetas/campanas-simple-2026-11/`, corregida con una prueba ciega) con dos caras para los descuentos: **A · En la lista** (el descuento y
la campaña son la misma fila) y **B · Etiquetas colgadas** (un riel con una etiqueta por %).

## Decisión

Felipe, 2026-11-17:

| Pregunta | Decisión |
|---|---|
| Qué cara | **A · En la lista**: se aprende una vez, el descuento y la campaña se ven igual |
| Las campañas que hoy hacen de descuento («Para liquidar», «Top ventas») | Quedan como campañas: no se migra nada |
| El mismo % en la tienda y en todas | Dos filas («−20 %» y «−20 % · Todas las tiendas») |
| «Regalo» y «Club» en la hoja de ofertas | Salen (actividad 7) |
| Cambiar un descuento a un % que ya existe en la tienda | Las prendas **se juntan** ahí y el de antes se apaga |
| Desactivar un descuento con prendas | Sus prendas **vuelven a su precio**, con «Deshacer» |

1. **La lista.** Arriba de las campañas, «Descuentos»: una fila por cajón encendido que rige en la tienda (los suyos y los de todas), con su %,
   de dónde es y cuántas prendas (modelo y color) tiene; la última fila es «Nuevo descuento». Lee `campanas_descuentos(sede)` (solo lectura, pide
   ver Campañas y ofertas). La fila es `FilaDeLista`, la misma que tomarán las campañas en la actividad 6. Las piezas, al milímetro:
   `docs/milimetro/fila-de-lista-campanas.md`.
2. **El panel de un descuento.** Tocar la fila lo abre al costado (en una columna, debajo de su fila): el % en grande, quién lo hace, sus prendas en
   grilla con el precio que queda y «Bajo costo» si corresponde, y una × por prenda que quita y ofrece «Deshacer». «Más»: Cambiar el %, Imprimir
   etiquetas (la pantalla de siempre, con esa campaña) y Desactivar. Ficha: `docs/milimetro/panel-de-descuento.md`.
3. **Agregar.** Un buscador bajo la cabecera: con la pistola, un código exacto pregunta solo **«Solo esta» o «Todo el modelo · N colores»** (el % ya
   lo dice el descuento abierto) y Enter repite la última respuesta; por nombre, las sugerencias de siempre (`ListaSugerencias`). En el celular, la
   cámara lee una prenda tras otra (`EscanerBusqueda` continuo). Agregar sale de `poner_rebaja` (una prenda) o `poner_rebaja_varias` (todo el modelo, en
   una transacción); antes, `campanas_rebaja_de_variantes` dice en qué % estaba cada talla, para que «Deshacer» la devuelva a ese % y no solo la quite.
4. **Nuevo, cambiar el % y desactivar** (`20261118030000`), las tres con el módulo, la tienda donde se trabaja, «todas» solo un líder, la firma del
   responsable (`fn_actor_persona_id(true)`) y el mismo candado de transacción que `poner_rebaja`, para que dos personas a la vez no dejen un estado
   imposible:
   - `crear_descuento`: el cajón de ese % en la tienda (o en todas), vacío. Si ya existe, lo devuelve; si estaba apagado, lo enciende vacío.
   - `cambiar_pct_de_descuento`: si no hay otro con ese %, cambia su % y su nombre; si lo hay, junta las prendas ahí y apaga el de antes. Devuelve qué
     tallas se movieron, para «Deshacer».
   - `desactivar_descuento`: quita sus marcas y lo apaga (si conservara sus prendas, volver a crear ese % las rebajaría a todas). Devuelve las tallas.
5. **Lo que se fue.** El escáner suelto (`PonerUnPct`), la hoja de tres preguntas (`HojaRebaja`) y las tarjetas de «Rebajas de tu tienda»: el escáner
   vive ahora en el panel de cada descuento. Las funciones de ADR-0669 siguen igual y se reusan.
6. **Avisos después de releer.** Lo que cambia la lista (crear, cambiar, desactivar y sus «Deshacer») relee la pantalla dentro de una transición y el
   aviso sale después: un aviso que se ve mientras la pantalla se ocupa se retira solo (ADR-0146, ADR-0149) y se perdía su «Deshacer». Quitar y agregar
   dentro del panel no releen: la fila toma la cifra del panel.

## Alternativas descartadas

- **B · Etiquetas colgadas**: más «de tienda», pero dos formas en la misma pantalla para lo mismo (ADR-0358, «una función, una pieza»).
- **Migrar «Para liquidar» y «Top ventas» a cajones**: tocaba 1.199 tallas en producción y su historia, para que se vieran distinto. Felipe: quedan como campañas.
- **Una sola fila para el mismo % de la tienda y de todas**: escondía de dónde viene el %, y quitar ahí habría tocado otras tiendas.
- **Confirmar antes de desactivar**: es reversible, así que se perdona con «Deshacer» (ley 7 de Formidable) en vez de preguntar.
- **Al cambiar a un % que ya existe, rechazar**: obligaba a mover las prendas una por una. Felipe eligió juntarlas.

## Consecuencias

- **Base:** tres migraciones, solo funciones (ninguna tabla ni columna nueva): `20261118001000_campanas_descuentos`,
  `20261118010000_campanas_rebaja_de_variantes` y `20261118030000_descuentos_crear_cambiar_desactivar`. Van a producción en ese orden, después de las
  de ADR-0669 (ya pegadas), y **solo con el OK de Felipe**, **antes de fusionar el PR** (pegadas el 2026-11-18 por orden de Felipe, con los 9 md5
  idénticos a la base de la rama): la web nueva ya no trae el escáner de ADR-0669, así que
  publicada sin ellas la tienda se quedaría sin «Poner un %» (la lectura falla, la lista de descuentos no se dibuja y quedan solo las campañas).
- **Pruebas:** `pnpm pruebas:rebaja-rapida` (55 escenarios, sale de una tienda sin cajones dentro de su transacción), `lib/rebaja-rapida-reglas.test.ts`.
- **Guía:** la de Campañas suma «Un descuento nuevo» y «Agregar prendas a un descuento» (29 pasos recorridos en escritorio y a 375 px). La guía de foco
  de la hoja trata el % que llega puesto como «sugerido» hasta que la persona lo toca (ADR-0284 act. h).
- **Chaos (2026-11-18, semilla 1118):** 0 estados imposibles. Los dos hallazgos se cerraron con el OK de Felipe: el % de un descuento empieza en 1
  (`fn_pct_de_descuento` y `pctDeDescuento`; antes un −0,5 % pasaba) y, si la base dice que el descuento o el % ya no están, la pantalla vuelve a
  leer la lista y avisa «la lista ya está al día» (`avisoDeListaVieja`). `poner_rebaja` (ADR-0669, en producción) sigue aceptando más de 0, pero
  desde esta pantalla solo recibe el % de un descuento que ya existe.
- **Formidable (2026-11-18):** la prueba ciega terminó en 5 toques y dejó tres dudas que se arreglaron con el OK de Felipe: la prenda dice
  «todas las tallas» con palabras, el aviso al agregar dice «Antes tenía −20 %» (nunca el nombre interno del cajón) y tocar una prenda con todas sus
  tallas muestra cuáles (S · M · L).
- **Dynamic:** no cambia `vidrio/recetas.css` ni `components/ui/`: no le llega nada.

## Actualización 2026-11-18 (b) — abrir una campaña, la hoja de una oferta y «En caja» (actividades 6 a 8)

Rama `claude/campanas-abrir-campana`. Solo pantalla: ninguna migración, ninguna RPC nueva ni cambiada. Felipe partió la actividad 7 en tres
(7a, 7b, 7c) al verla demasiado grande para un solo paso.

1. **Abrir una campaña (6).** La campaña es la misma fila que un descuento (`FilaDeLista` con su insignia) y se abre al costado en
   `PanelDeCampana`: el nombre, tres chips (estado, fechas, tiendas, `chipsDeCampana`), «Editar» y «Más» (repetir, imprimir, web, desactivar),
   **sus ofertas como carteles** («3 x 2 · Toda la campaña», `cartelesDeCampana`) y sus prendas. Salen las «tres preguntas» del pase y la barra de
   días. Si sus ofertas eligen las prendas, ya no dice «Sin prendas» (`prendasLasEligenSusOfertas`).
2. **«Qué le das» (7a).** Cinco opciones (−20 %, 3 x 2 · 2 x 1, 2 por S/ 59.90, 2.ª −50 %, −S/ 30) y el ejemplo **es** la opción: la elegida dice sus
   números de ahora (`lib/oferta-que-le-das.ts`). Salen las ayudas y «Regalo» y «Club».
3. **Una sola hoja (7b).** Las cuatro preguntas una debajo de la otra; las tres de abajo aparecen al elegir qué le das. Sin pasos, sin
   «Siguiente», sin atajo: el pie siempre dice lo que falta, «Guardar como borrador» y «Activar».
4. **La oferta se abre desde su cartel (7c).** La hoja es de UNA oferta: «Nueva oferta» la abre vacía y un cartel la abre editando. Sale «Ya
   registradas» (la lista estaba dos veces: en el panel y en la hoja) y la franja de la campaña. **Guardar, activar o retirar cierran la hoja**: lo
   que quedó se ve en su cartel. «Retirar» va a la izquierda del pie, con su «Sí, retirar · No, dejarla»; el historial («1 cambio · antes: …») pasa a
   «Revisa». La hoja baja de 78 a 70 rem.
5. **«En caja» (8).** La columna de la derecha deja la etiqueta de la campaña y cobra **una compra de ejemplo** con prendas que la oferta alcanza,
   con la misma cuenta de Vender (`lib/compra-de-ejemplo.ts`: `descuentoDeCampana` para un %, `ejemploDeGrupo` / `ejemploDeMonto` para grupos y
   montos), con su foto, lo que paga cada una, el total y el ahorro. Sale el ejemplo suelto de «En qué prendas».

**Descartado:**
- **«Gratis» en la prenda que regala un 3 x 2** (como la maqueta): la caja reparte el ahorro del grupo entre sus prendas (`ofertasDeGrupo`); el ejemplo
  mostraría otro ticket que el que imprime la caja.
- **Volver a «Nueva oferta» después de guardar** (lo que hacía 7b): sin la lista adentro, la persona no veía lo que acababa de guardar.
- **«En caja» arriba en el celular**: empujaba «¿Qué le das?» medio alto de pantalla; va después de las preguntas.

**Después de Formidable y del caos (con el OK de Felipe, «Sí, los cuatro»):** el cartel dice sus tiendas, fechas y días cuando no son los de su
campaña (las fechas, comparadas desde hoy); con un choque, el pie dice «Puedes guardarla como borrador. Para activarla: …»; «Retirar» cambia el pie
entero a «¿Retirar la oferta «3 x 2»?» con «No se puede deshacer» (la base no reactiva una oferta retirada) y el foco va a «No, dejarla» sin mover la
hoja; guardar y retirar pasan por `unSoloEnvio`.

**Pendiente de Felipe** (backlog `2026-11-18-campanas-abrir-campana.md`): imprimir y «Ver en la web» de una campaña sin descuento de siempre;
desactivar una campaña con prendas marcadas; si el cartel dice también «Todas las tiendas».

**Verificado:** guía de Campañas (34 pasos, escritorio claro y celular oscuro), `/milimetro auditar` (0 graves,
`docs/milimetro/auditorias/2026-11-18-campanas-abrir-campana.md`), `/chaos` (0 estados imposibles), `/focus` al día. **Dynamic:** no cambia
`vidrio/recetas.css` ni `components/ui/`: no le llega nada.

# Maqueta · Ofertas y promociones, dentro de Catálogo ▸ Insignias (2026-10-21, rehecha el 2026-10-23 por la tarde)

> **Estado: propuesta para revisar con Felipe. Espera su aprobación antes de tocar el código del ERP.** Solo maqueta: no hay migración, ni código del ERP, ni cambio en producción.
> «Hoy» dentro de la maqueta es el **viernes 23 de octubre de 2026**. Los nombres, las fechas y las prendas marcadas de las 13 campañas, y el −10 % de Aniversario CAYLA, salen de
> **producción** (solo lectura, 2026-10-23). Las cifras de ventas y todas las demás ofertas y promociones son **inventadas**.

> **Actualización (2026-10-23, por la noche): el formulario para registrar una oferta es «Tres preguntas»** (lo eligió Felipe entre cinco opciones), con **días de la semana**. Está en
> `formulario/opcion-3-tres-preguntas.html` (y las otras cuatro, más la comparación, en `formulario/index.html`). **`index.html` todavía trae el formulario largo de la mañana**: el de «Tres preguntas» lo reemplaza
> cuando Felipe apruebe esta versión. La hoja y la pantalla de Insignias de `index.html` no cambian.

> **Actualización (2026-10-23, noche): «Tres preguntas» ya está construido en el ERP, solo en local** (ADR-0496): `components/sellos/OfertasHoja.tsx`. Hoy cubre «un % menos» con fechas, días de la semana y categorías; las otras formas de la maqueta están apagadas con «Pronto».

`index.html`: un solo archivo, se abre con doble clic. La barra negra cambia **escritorio / celular** y **claro / oscuro**; la fila de pasos recorre la historia:
1 Catálogo ▸ Insignias (las campañas, como hoy) → 2 La hoja «Configuración» de una campaña (donde se registran las ofertas y promociones) → 3 Liquidación → 4 En la caja → 5 En la tienda web → 6 Finanzas ▸ Campañas (el resultado).
La caja y la tienda comparten el mismo carrito. «Reiniciar» deja todo como al abrir.

## Lo que cambió el 2026-10-23 por la tarde: las campañas ya no viven en Atributos

Felipe pidió, en este orden: (1) **actualizar el repositorio** (hubo cambios en producción), (2) **leer cómo funcionan hoy las campañas** y (3) **integrar el registro de ofertas y promociones dentro de la configuración de las campañas**, que ahora viven en Insignias. Primero la maqueta; el código espera su aprobación.
Entre la versión anterior de esta maqueta y hoy entraron 318 commits a `main`. Los que importan (todo lo de abajo está verificado en el código y en producción, no de memoria):

| Qué cambió en el ERP | Dónde |
|---|---|
| Las etiquetas de prenda se llamaron «Sellos» (2026-10-22) y desde el 2026-10-23, **«Insignias»**; las campañas salieron de Atributos | ADR-0473, ADR-0481 |
| **Catálogo ▸ Insignias** (`/productos/insignias`) reemplazó a «Campañas» y a la pestaña de Atributos: una **billetera de pases** con cuatro vistas (**Campañas**, Rotación, Artesanal y General). Campañas es la que abre | `components/sellos/SellosPantalla.tsx`, `lib/sellos-pases.ts` |
| Una sola llave para guardar una campaña: `fn_puede_campanas` (líder, o el módulo Insignias, Campañas o Campañas de la tienda web) | ADR-0476, migración `20261022203000` |
| La hoja de una campaña se llama **«Configuración»** y su botón, **«Configurar»** (o «Repetir» si ya pasó) | `CampanaModal` en `components/EtiquetasLista.tsx` |

**Cómo funciona hoy una campaña** (lo que la maqueta NO debe romper):

| Pregunta | Respuesta |
|---|---|
| ¿Qué es? | Una fila de `retail.etiquetas` con estilo `campana`: nombre, fechas, **categorías** (`etiqueta_categorias`), **prendas marcadas a mano** (`variante_etiquetas`) y **un solo** `descuento_pct` opcional |
| ¿Qué dice la hoja «Configuración»? | **Descuento (%)** (con atajos 5 · 10 · 15 · 20…), **Cuándo rige** (Desde y Hasta) y **Categorías** (con cuántas prendas trae cada una). Las prendas sueltas se eligen en «Prendas» |
| ¿Cómo la cobra la caja? | `fn_campanas_por_variante`: de las campañas activas y vigentes que alcanzan a la prenda gana la de **mayor %**. `registrar_venta` rechaza la venta si lo cobrado no coincide (`venta_campana_omitida`, `…_monto_no_coincide`) |
| ¿Dónde la lee más? | La tienda online, la etiqueta de papel, Catálogo ▸ Productos, Finanzas ▸ Reportes ▸ Campañas y el Plan de campaña |
| ¿Qué muestra la pantalla? | Un **pase** por campaña: sello de tinta, días que faltan, recorrido, **vendidas en 30 días**, **en las tiendas**, **descuento**; al lado, el pase abierto en grande con sus prendas y «Lo que ya tiene» (fechas, prendas, descuento opcional) |
| En producción hoy (2026-10-23) | **13 campañas.** Solo **Aniversario CAYLA** tiene descuento (10 %, del 1 al 25 oct, **339 tallas marcadas**). Halloween: 47 marcadas + 1 categoría, sin descuento. Día del Gato: 7. Black Friday: 0 prendas |

**Lo que cambia en la maqueta** (una sola cosa en la pantalla de hoy):

| | Hoy | En la maqueta |
|---|---|---|
| Menú de Catálogo | Productos · Categorías · Marcas · Atributos · Insignias · Liquidación | **Igual.** No hay fila ni pestaña nueva |
| Pantalla Insignias | Billetera de pases | **Igual** (copia fiel). La tercera cifra del pase de una campaña pasa de «descuento» a **«ofertas y promociones»**; «Lo que ya tiene» suma una fila **Ofertas y promociones**; un pase con borradores lo dice |
| La hoja «Configuración» de una campaña | Descuento (%) · Cuándo rige · Categorías | **La campaña** arriba (cuándo rige y qué prendas lleva, sin el campo de descuento) y **Ofertas y promociones** abajo: lo ya registrado y el selector **Oferta \| Promoción** |
| El campo «Descuento (%)» | Un solo porcentaje por campaña | Es la primera opción de Oferta: **«Descuento en %»**. El −10 % de Aniversario aparece ya registrado como «Toda la campaña · −10 %» |
| Rotación, Artesanal, General | Su hoja de siempre | **Igual.** Su descuento de siempre se queda; las ofertas y promociones son de las campañas |

**Lo que se quitó** de la versión anterior de esta maqueta: los tres modos de Atributos (Tarjetas · Calendario · Ofertas), sus cifras y sus tres sugerencias. La billetera de Insignias ya ordena lo que rige, lo que viene y lo guardado, y Felipe
la eligió mirando (ADR-0481) después de rechazar un tablero con línea del año. Quitar antes de agregar: si el panorama hace falta, se pide aparte y con evidencia.

### Sexta decisión (propuesta, 2026-10-23 por la tarde): el registro vive en la hoja «Configuración» de la campaña, en Insignias

```
DECIDÍ: las ofertas y promociones se registran dentro de la hoja «Configuración» de cada campaña de Catálogo ▸ Insignias ▸ Campañas, con el selector Oferta | Promoción.
        El campo «Descuento (%)» se convierte en la primera opción de Oferta. La pantalla Insignias no cambia de forma.
DESCARTÉ: (1) una quinta vista «Ofertas» en Insignias: las cuatro vistas responden «qué es la prenda»; esa quinta respondería «qué pasa con su precio» y mezclaría dos preguntas en una pestaña.
          (2) dejar «Descuento (%)» junto a las reglas nuevas: serían dos formas de poner el mismo descuento y la caja solo mira una.
          (3) devolver el calendario y las sugerencias: ADR-0481 rechazó el tablero y Felipe eligió los pases.
SE ROMPE SI: (a) dos personas configuran la misma campaña a la vez: hoy `actualizar_campana_etiqueta` no bloquea la fila y gana la última; (b) la hoja ofrece un tipo que la caja todavía no cobra
             (hoy solo existe el porcentaje): por eso los tipos se habilitan por oleadas; (c) una campaña vigente con ofertas no tiene prendas: el pase dice «Sin prendas», pero no avisa fuera de la pantalla.
```

### Séptima decisión (propuesta mía, necesita tu OK): las prendas de una oferta son las de su campaña

Antes (en la versión de Atributos) una oferta elegía sus prendas libremente: «las marcadas», una categoría o **todo el catálogo**. Ahora la campaña ya tiene su propio selector de categorías en la hoja de siempre, y dos selectores con sentidos distintos en la misma hoja
son justo lo que no debe pasar (integridad conceptual). Lo que propongo:

```
DECIDÍ: una oferta de prendas alcanza a las prendas de SU campaña (las marcadas a mano + las de sus categorías), todas o solo algunas categorías de ellas.
        Una promoción de compra (monto, regalo, cupón de bienvenida, puntos) no mira prendas: mira la compra entera, y la hoja lo dice («Toda la compra»).
DESCARTÉ: dejar que una oferta apunte a prendas que su campaña no tiene. El pase, la vitrina y la portada web leen las prendas de la campaña: el pase diría «61 prendas» mientras una oferta
          baja el precio de todo el catálogo, y la web mostraría una campaña vacía con precios rebajados.
SE ROMPE SI: Felipe quiere una oferta «en toda la tienda» sin que la campaña la tenga: el costo es sumar las categorías a la campaña (hay un botón «Todo el catálogo» en «La campaña»).
```

### Octava decisión (Felipe, 2026-10-23): el formulario es «Tres preguntas», con días de la semana

Felipe eligió la opción 3 de las cinco (`formulario/`) y pidió sumar **días de la semana**: una oferta o promoción que rija, por ejemplo, **solo martes y jueves**.

```
DECIDÍ: «Tres preguntas» es el formulario: ¿Qué le das al cliente? · ¿En qué prendas y dónde? · ¿Cuándo?. Los días de la semana van en la pregunta 3, junto a las fechas:
        «Todos los días» (de fábrica) o «Solo algunos días», con los siete a un toque y dos atajos (Lun–vie, Sáb y dom). Rige los días elegidos DENTRO de sus fechas.
DESCARTÉ: (1) una cuarta pregunta solo para los días: alargaría el asistente para el 95 % que rige todos los días; (2) escribir los días como texto: se presta a error;
          (3) dejar guardar una oferta cuyos días no caen en sus fechas (Aniversario CAYLA ya solo tiene viernes, sábado y domingo por delante: «martes y jueves» nunca regiría):
          es un estado imposible, así que no deja guardar, lo dice, y los días que no caen en las fechas se ven apagados.
SE ROMPE SI: (a) el papel colgado: hoy la etiqueta dice el precio que cobra la caja el día que se imprime (ADR-0180) y, con días sueltos, el papel miente casi todos los días;
             (b) la caja y la web no saben el día de la semana: `fn_campanas_por_variante` recibe una fecha, no un día, y la tienda online debe decir «solo martes y jueves»
             (Indecopi pide decir las condiciones). Las dos tocan la venta y la web: OK de Felipe.
```

**Lo que hace la maqueta con los días:** la frase dice «Rige en las 3 tiendas, los martes y jueves, del 26 al 31 oct · 2 de 6 días»; el nombre automático suma «· mar y jue»; la lista de «Ya registradas» los muestra; «Lo que cedes» se calcula solo con los días que caen; dos ofertas solo se cruzan si comparten días; un aviso dice que el papel no cambia cada día.
**Para probarlo, abre Halloween o el Día del Gato** (Aniversario no sirve para martes y jueves). **Y una consecuencia que cambia el plan por etapas:** la **etapa 0** (un solo tipo, sin migración) **no puede llevar días**: la fila de la campaña (`etiquetas`) no tiene dónde guardarlos. Los días llegan con la **etapa 1**, la tabla propia de reglas.

**Un error que encontré y arreglé en esa maqueta:** el campo «lleva N» del 3x2 compartía nombre (`n`) con el nombre de la oferta; al guardar, un 3x2 quedaba como «3x2x2» y no se podía editar. Ahora «lleva» es su propio campo. **`index.html` tiene el mismo error en el formulario largo:** desaparece al reemplazarlo; si no se reemplazara, hay que arreglarlo igual.

### Cómo se construiría, por etapas (nada de esto se hace hasta que apruebes)

| Etapa | Qué | Toca dinero | Migración |
|---|---|---|---|
| **0** | La hoja nueva con **«Tres preguntas»** pero con **un solo tipo**: «Descuento en %» (lo único que la caja cobra hoy) y **sin días de la semana** (no hay dónde guardarlos). Se reordena «La campaña» y «Ofertas y promociones»; la tercera cifra del pase y «Lo que ya tiene». Guarda lo mismo de siempre, por `actualizar_campana_etiqueta` | **No** | **No** |
| 1 | Una tabla propia de reglas por campaña (`etiqueta_id`, tipo, términos congelados, **días de la semana**, estado borrador / activa, quién y cuándo); `fn_campanas_por_variante` lee las reglas **y el día de la semana en Lima**; varias reglas % por campaña; **borrador y «Activar»**; historial al editar | **Sí: OK de Felipe** | Sí |
| 2 | Soles menos y Precio único; luego N por un precio, La N.ª con descuento, Lleva N paga M | **Sí** (cambia `registrar_venta`) | Sí |
| 3 | Por monto; Club y regalo (necesitan al contador) | **Sí** | Sí |

Antes de cada etapa que toque la venta: `/chaos`, el número de ADR y de migración reservados con `pnpm reservar`, y la guía interactiva de Insignias puesta al día en el mismo PR (`productos.sellos`).

## Lo que ya estaba decidido en otras sesiones (traído el 2026-10-23 por la mañana)

Esta maqueta se hizo en una sola sesión y **no tenía** dos cosas que Felipe decidió el 2026-10-21 en otras: (1) la sesión **«Campañas con ofertas y promociones»**
(sus 20 decisiones están en `docs/investigacion/2026-10-21-campanas-ofertas-promociones.md`, §7, en el árbol de esa sesión, sin commit) y (2) la sesión
**«R-Trabajando en liquidacion»**, que maquetó aparte la liquidación del catálogo (`docs/maquetas/liquidacion-catalogo-2026-10/`, también sin commit). Lo que sigue es lo que se trajo aquí.

**Del documento de campañas (decisiones de Felipe):**

| # | Decisión | Dónde está ahora en la maqueta |
|---|---|---|
| 1, 2 | 10–14 campañas al año atadas a festividades, más una liquidación por temporada; «Para liquidar» sigue siendo una campaña con fechas | En producción «Para liquidar» es una insignia de **Rotación** (−20 %, 1 sep – 31 dic, sin prendas), no una campaña: sigue como hoy (ver «Lo que necesito de Felipe») |
| 3 | La etiqueta sigue siendo la campaña, con historial | **«Repetir» ya no crea una campaña nueva:** reabre la misma con las fechas de 2027 y la edición de 2026 queda en su historial (la hoja lo muestra); cada oferta editada guarda el suyo |
| 4 | Cuatro mecánicas: soles o precio fijo, cantidad, **look o combo**, monto | Se agregó **«Conjunto (look)»**: prendas distintas a un precio (blusa + falda). Lo demás ya estaba |
| 5 | Extras: regalo con compra y acceso anticipado para el Club | «Regalo desde un monto» y «Compra privada» |
| 6 | Dos ofertas en una prenda: gana la mejor; una sola por prenda | Dicho en la hoja y en la revisión |
| 7 | Ticket y Club se suman sobre la oferta, salvo «no acumulable» | Campo **«Con las demás ofertas»**: Se suma / No acumulable. Lo puse en cada oferta, no en la campaña: una campaña puede tener varias y no todas se comportan igual |
| 8 | Exclusiones de fábrica: ninguna | «Dejar fuera» es opcional; nada viene excluido |
| 9 | Cada campaña elige sus sedes; la web siempre cobra lo mismo que las tiendas | **La web dejó de ser una sede** (solo TRU, AQP, LIM); la hoja lo dice. Sin resolver: qué precio muestra la web si la oferta rige en una sola tienda |
| 10 | Claurè no entra por categoría salvo a propósito | «Incluir las prendas de Claurè» viene apagado y avisa si se enciende |
| 11 | El precio «antes» es siempre el normal, tachado | Revisión «El precio antes fue el normal los últimos 30 días» (objeción abierta: con campañas casi todos los meses el precio tachado deja de haber regido antes) |
| 12 | Etiquetas de papel: aviso la víspera de empezar y de terminar | Línea en «Lo que pasa después de vender» |
| 13 | Quien ve Insignias crea la oferta como **borrador**; solo un líder la activa | «Guardar como borrador» y «Activar» (solo el líder); estado **Borrador**; «espera a un líder»; ejemplo: Navidad |
| 14 | Editar en marcha: vale desde ese momento, lo vendido no cambia, queda historial | Tocar una oferta ya registrada la edita («Guardar cambios») y su historial aparece debajo |
| 16 | Sin límites: bastan las fechas | **Se quitó el «Tope de unidades».** La hoja dice cuántas unidades hay (Indecopi pide la cifra; el sistema la da sin ponerle tope) |
| 17 | Devolución de una oferta por cantidad, combo o ticket: **se pierde la oferta** (lo que se queda vuelve a su precio y se descuenta del reintegro) | **Resuelto.** Yo había recomendado «devolver al precio pagado»; Felipe decidió lo contrario y la revisión ya lo dice |
| 18, 19 | Cambio de talla o color a precio normal; apartado al precio del día en que retira | Línea «Lo que pasa después de vender» (las dos tienen objeción abierta) |
| 20 | Medición: contra semanas normales (restando devoluciones, por sede), qué se movió y qué no, y contra la edición anterior | Texto de «¿Valió la pena?» |

**De la sesión de liquidación (decisiones de Felipe):** liquidar una prenda **del catálogo**, por color y talla, con un precio por variante y por tienda, **sin depender de la campaña**
(una capa dentro de `fn_precio_en_sede`), venta final también en el catálogo, termina sola al agotarse y, si llega mercadería, quien la recibe decide si se mantiene.

| Cambio en esta maqueta | Por qué |
|---|---|
| **«Liquidación» salió del selector Oferta / Promoción** de la hoja de campaña | La liquidación definitiva no es una regla de campaña: no tiene fechas, ni campaña, y su alcance es variante × tienda. La hoja lo avisa y lleva a «Liquidación» |
| **Liquidación vuelve a ser su fila propia del menú** (quinta decisión, 2026-10-23), con dos pestañas: **«Prendas del catálogo»** (variantes, tienda, precio con el normal tachado, estado «Vigente» o «Revisar») y **«Piezas sueltas»** | Es lo que esa sesión decidió; el botón «Liquidar una prenda» remite a su maqueta, que no se copió aquí |

**Sobre «Para liquidar»:** en las dos sesiones se lo trató como una campaña con fechas. En producción (2026-10-23) **no lo es**: es una insignia del grupo **Rotación** con un 20 %,
del 1 de septiembre al 31 de diciembre y sin ninguna prenda. Esta maqueta lo deja **como hoy** (su descuento de siempre, en Rotación) y la liquidación definitiva, por color y talla, sigue siendo
el otro mecanismo, en su propia fila. Si quieres que «Para liquidar» pase a ser una campaña, es una decisión aparte (ver «Lo que necesito de Felipe»).


## La idea en una frase

**Vocabulario (decidido el 2026-10-21):** una **campaña** es la de Catálogo ▸ Insignias ▸ Campañas (hasta el 2026-10-22 vivía en Atributos ▸ Etiquetas): un evento con nombre, fechas y prendas marcadas (Halloween, Black Friday, Aniversario CAYLA…).
Lo que pasa con el precio dentro de ella es una **oferta**, una **promoción** o una **liquidación**. Hasta la versión anterior de este documento llamé «campaña» a cada una de esas reglas; ya no.

**Oferta y promoción no son dos módulos: son una sola pieza, la regla de precio, y toda regla vive dentro de una campaña.** Una regla es:

| Parte | Pregunta | Ejemplo |
|---|---|---|
| Campaña | ¿En qué evento vive? (obligatoria) | Aniversario CAYLA, 1 al 25 oct |
| Alcance | ¿A qué prendas, en qué sedes? | Casacas · TRU, AQP, LIM y web |
| Beneficio | ¿Qué recibe el cliente? | −30 % / 2 por S/ 59.90 / S/ 30 menos / un regalo |
| Condición (opcional) | ¿Qué tiene que hacer? | nada / llevar 2 / comprar desde S/ 300 / ser del Club |
| Vigencia | ¿Cuándo y cuánto? (dentro de la de la campaña) | 12 al 31 oct · primeras 40 unidades |

**Si la condición está vacía es una oferta; si tiene algo, es una promoción.** No se guarda como un campo más: se deduce de la
condición, así no puede haber una «oferta con condición» ni una «promoción sin condición». Una **liquidación** es una oferta que no vuelve (venta final,
hasta agotar, no se junta con otras).


## Lo que ya existe hoy (verificado en el repo y en producción el 2026-10-23, no de memoria)

| Pieza | Dónde vive | Qué cubre |
|---|---|---|
| Campaña con % | ADR-0107, ADR-0108, ADR-0473, ADR-0481; **Catálogo ▸ Insignias ▸ Campañas ▸ «Configurar»** | **Oferta**: % + fechas + categorías; Vender la aplica sola; un solo descuento por prenda, el mayor |
| Precio rebajado al .90 | ADR-0182, `fn_descuento_campana` | El precio de campaña baja al .90 más cercano, igual en la caja y en la base |
| Diseño de la campaña en la web | ADR-0471, Tienda web ▸ Campañas | Cómo se ve la campaña en la tienda online |
| ¿Valió la pena? | Finanzas ▸ Reportes ▸ Campañas (`CampanasPanel`, `fn_campanas_reporte`) | Lo vendido **con** cada campaña; la maqueta lo enlaza, no lo duplica |
| Códigos de descuento | `codigos_descuento` | *Quién* puede descontar a mano (no es una campaña) |
| Piezas de liquidación | ADR-0379, Catálogo ▸ Liquidación | **Oferta** de prenda suelta, venta final, fuera del catálogo |
| Puntos y cupón del Club | maqueta `puntos-2026-10`, migraciones `club_puntos_*` | **Promoción** de fidelidad (en revisión) |
| Plan de campaña | ADR-0349 | Cuánto comprar para diciembre y a cuánto se vende lo que sobra |

**Lo que no existe:** una promoción que dependa de lo que el cliente lleva (2 por un precio, monto mínimo, regalo), varias reglas en una misma campaña, un alcance por sede o por canal, y el historial de cómo cambió el descuento de una campaña.

## Casos de uso

### Ofertas (bajan el precio; el cliente no hace nada)

| # | Caso | Situación (ejemplos inventados para ilustrar) | Qué ve el cliente | Estado |
|---|---|---|---|---|
| O1 | **Fecha especial** | Día de la Madre, Navidad: −15 a −25 % en blusas, vestidos, pantalones | Precio tachado + nuevo, hasta el día X | Existe (etiqueta de campaña) |
| O2 | **Fin de temporada** | Una categoría pasó de moda: −30 % hasta que salga | Igual | Existe, pero a mano |
| O3 | **Lo parado en el piso** | Frescura ya sabe qué prendas llevan 90+ días: el sistema sugiere −20 % y la líder aprueba con un toque | Igual | **Nuevo** (la maqueta lo muestra como «Sale de Frescura») |
| O4 | **Solo en una sede** | Arequipa tiene faldas de más que Lima no: −25 % solo en AQP | Solo ve el precio rebajado quien compra ahí | **Nuevo** (hoy las ADR-0107/0108 no hablan de sede) |
| O5 | **Solo en la web** | Probar −15 % en blusas solo online sin tocar las tiendas | Solo en la tienda web | **Nuevo** |
| O6 | **Pieza suelta** | Queda 1 unidad guardada que nunca entró al sistema | Etiqueta «LIQUIDACIÓN» con su precio | Existe, **se queda en su pantalla** (venta final) |
| O7 | **Prenda con defecto** | Cuarentena → liquidada | Precio de liquidación | Existe, se queda aparte |

### Promociones (un beneficio a cambio de algo)

| # | Caso | Situación (ejemplos inventados para ilustrar) | Qué hace el cliente | Qué recibe | Estado |
|---|---|---|---|---|---|
| P1 | **N por un precio** | Polos básicos del taller: 2 por S/ 59.90 (lista S/ 79.80); la cantidad se elige (2 a 6) y el precio sugerido la sigue | Lleva N del mismo modelo | S/ 19.90 de ahorro | **Nuevo** |
| P1b | **La N.ª con descuento / lleva N, paga M** | Mismo objetivo, otra forma de decirlo; N se elige (2 a 6), y el descuento llega hasta «gratis» | Lleva N del mismo modelo | La 4.ª al 50 % / 3x2 / 2x1 | **Nuevo** |
| P2 | **Descuento por monto** | El ticket promedio es S/ 142 y 1 de cada 4 compras queda a menos de S/ 40 de S/ 200. El monto y los soles se ajustan en la hoja de Configuración; la sugerencia de ventas lo abre con S/ 20 menos desde S/ 200 | Pasa del monto elegido | S/ X menos | **Nuevo** |
| P3 | **Regalo con la compra** | Bolsa de regalo o **arreglo de basta del taller** | Compra desde S/ 200 | Un regalo que a CAYLA le cuesta ≈ S/ 6, no el precio de lista del servicio | **Nuevo** |
| P4a | **Cupón de bienvenida** | Captar miembros nuevos del Club | Se registra | 10 % en su primera compra | **Nuevo**, ligado al Club |
| P4b | **Venta privada** | Lo que hace el lujo: no baja el precio, da *acceso* | Ser del Club | Compra la colección 24 h antes | **Nuevo** |
| P4c | **Puntos dobles** | Un fin de semana | Ser del Club | x2 puntos | **Nuevo** (hoy el Club da 1 punto por S/ 1) |
| P5 | Envío gratis desde un monto (web) | — | — | — | **No dibujado**: depende de cómo cobra envío la tienda |
| P6 | Descuento por medio de pago (tarjeta, Yape) | — | — | — | **Descartado por ahora**: Culqi se investigó pero no se integró |
| P7 | Combo de prendas distintas (blusa + pantalón) | La tienda ya tiene «looks» | Lleva las dos | Precio de conjunto | **Fase 2**: precio de conjunto entre modelos distintos es la parte difícil |

### Cuatro casos a fondo

**O3 · Lo parado en el piso.** *Problema:* Frescura dice qué prendas llevan meses sin moverse, pero nadie convierte ese aviso en una
rebaja; la decisión se pierde. *Cómo funciona:* en la lista de campañas aparece «20 prendas llevan 90 días o más» con el botón «Crear
oferta». Al tocarlo, se abre la Configuración de la campaña, con −20 % y las prendas elegidas por el sistema. La líder ajusta y guarda.
*Lo que el sistema no decide:* el porcentaje es una sugerencia; la líder siempre aprueba.

**P1 · 2 polos por S/ 59.90.** *En la caja:* al escanear el segundo polo, la línea baja sola y dice «2 por S/ 59.90» con «¿Por qué?». Con
3 polos paga 59.90 + 39.90, y la caja sugiere «un polo más y los 2 salen a S/ 59.90». *Por qué es promoción:* el beneficio exige llevar 2.
*Lo difícil:* en la boleta SUNAT la rebaja tiene que repartirse entre las dos líneas.

**P2 · S/ 30 menos desde S/ 300.** *En la caja y en la tienda:* una barra dice «te faltan S/ 87.20 para S/ 30 de descuento» y propone una
prenda que lo completa. *Regla de la maqueta:* el monto se cuenta sobre **lo que el cliente paga después de las demás campañas**, igual
que los puntos del Club. *Lo difícil:* qué pasa si devuelve una prenda y baja de S/ 300 (ver «Lo difícil»).

**P3 · Basta gratis del taller.** *Por qué es el caso más CAYLA:* una cadena sin taller no puede regalar un servicio; CAYLA sí, y a un
costo real mucho menor que bajar el precio. *Lo difícil:* un regalo es una transferencia gratuita, y cómo se declara en la boleta lo
decide el contador, no el sistema.


## Lo que muestra cada pantalla

**No hay fila ni pestaña «Ofertas y promociones»** (sexta decisión): Catálogo queda con las mismas 6 hijas de hoy.

1. **Catálogo ▸ Insignias** (copia fiel de la pantalla de hoy; las cuatro pestañas de vidrio con su cuenta, la frase en cursiva, las pilas **Rigen hoy · Lo que viene · Guardadas · Desactivadas**, y el pase abierto en grande). Lo que cambia:
   - La **tercera cifra** del pase de una campaña dice **«ofertas y promociones»** (cuántas están vigentes o por empezar), no «descuento».
   - **«Lo que ya tiene»** suma una fila opcional, **Ofertas y promociones**, con cada una listada debajo (y «borrador» si espera a un líder).
   - Un pase con borradores trae el chip **«1 borrador espera a un líder»**.
   - Una campaña que ya pasó y tuvo ofertas ofrece **«¿Valió la pena?»**, que abre su reporte en Finanzas ▸ Reportes ▸ Campañas.
   - **Desactivar** avisa lo que de verdad pasa: las ofertas dejan de cobrarse en la caja y en la web desde ese instante, y el papel colgado hay que reimprimirlo.
   - «+ Nueva campaña» pide solo el nombre (y busca una parecida: dos «Black Friday» partirían el resultado). Después se le ponen fechas, prendas y ofertas en «Configurar».
2. **La hoja «Configuración «Aniversario CAYLA»»** (la abre «Configurar»; si la campaña ya pasó, «Repetir» la abre como «Repetir «Día de la Madre» en 2027», con las fechas del año siguiente):
   - **La campaña** (arriba, en dos celdas): *Cuándo rige* (con «Cambiar fechas» o «Ponerle fechas») y *Prendas de la campaña* (con «Prendas» y «Categorías»; «Todo el catálogo» marca todas las categorías de un toque).
   - **Ofertas y promociones** (con su cuenta): una línea que explica que el campo «Descuento (%)» de antes es ahora «Descuento en %»; **Ya registradas** (tocar una la edita: vale desde ahora, lo vendido no cambia, queda su historial; un borrador dice «espera a un líder» o, si eres líder, trae «Activar»); y el **selector Oferta | Promoción**.
     - **Oferta**: *Descuento en %*, *Soles menos por prenda* y *Precio único*.
     - **Promoción**: *Por cantidad* (N por un precio, La N.ª con descuento, Lleva N paga M, % desde N prendas, Conjunto), *Por monto* (Soles menos desde un monto, % menos desde un monto, Regalo desde un monto) y *Para el Club* (% para miembros, Cupón de bienvenida, Compra privada, Puntos extra).
     - Debajo, los campos del tipo (cada número con un contador) y los comunes: ***Prendas*** (**todas las de la campaña** o solo algunas categorías de ellas; *dejar fuera*; *Claurè* apagado por defecto; *solo lo que lleva tiempo sin moverse*; las promociones de compra dicen «Toda la compra»), *Dónde* (solo tiendas: la web cobra lo mismo), *Cuándo rige* (dentro de las fechas de la campaña), *Cuántas unidades hay* (sin tope) y *Con las demás ofertas* (se suma / no acumulable).
   - A la derecha: cómo lo verá el cliente, **«Antes de guardar»** y **«Lo que cedes»**.
   - Pie: **Cancelar** y, según quién seas: el líder tiene **«Guardar como borrador»** y **«Activar»**; quien solo ve Insignias o Campañas, **«Guardar como borrador»**. Editando, **«Guardar cambios»**.
   - Es una hoja **más ancha que las de hoy** (1080 px, no 768) porque lleva la vista previa al lado. Es un ancho a medida; al construirla va con su `unificar-fijo` y se revisa a 375 px (en el celular la hoja es de pantalla completa y la vista previa baja).
3. **Rotación, Artesanal y General** (copia fiel): su hoja de siempre, con su descuento de siempre. **Para liquidar** (−20 %, Rotación) y **Sorteo** (100 %) siguen como hoy.
4. **Liquidación** (la fila de siempre; **no es de ninguna campaña**): *Prendas del catálogo* y *Piezas sueltas*.
5. **En la caja** (375 px): la colaboradora no escribe nada; cada descuento dice por qué. Con la campaña **Halloween** y su regla de casacas.
6. **En la tienda web:** precio tachado, «quedan 11 de 40» y una barra «te faltan S/ X».
7. **Finanzas ▸ Reportes ▸ Campañas** (**ya existe**; no es una pantalla nueva de Catálogo): veredicto por categoría con la ganancia con la oferta contra una estimación sin ella, para la campaña completa.

**Roles** («Ver como»): *Líder* hace todo. *Con Insignias* ve las cuatro vistas y guarda borradores, pero no ve Liquidación. *Solo Campañas* entra por la misma fila y ve **solo** la vista Campañas (sin pestañas). *Con Liquidación* no ve Insignias («Sin acceso»). Nadie gana ni pierde un permiso: la maqueta usa los dos módulos de hoy (`etiquetas` y `campanas`).


## La revisión «Antes de programar» (lo que hace distinta a esta propuesta)

| Revisión | Por qué existe |
|---|---|
| Dice cuándo empieza y termina | Indecopi exige que la promoción sea excepcional y temporal |
| Si limita unidades, las dice («quedan N») | Indecopi pide informar la cantidad disponible |
| **El «antes» fue el precio normal** | Rebajar un precio recién subido es el engaño que Indecopi sanciona. La maqueta lo ilustra con «Jean Palazzo subió de S/ 119 a S/ 129 hace 6 días» y un botón para sacarla de la campaña. **Cuántos días de precio estable hacen falta lo confirma un abogado; la maqueta no inventa el número.** |
| Por debajo del costo | No bloquea (puede ser liquidación), pero avisa, como hoy (ADR-0108) |
| Se cruza con otra campaña | En cada prenda gana el mejor precio para el cliente; no se suman (ADR-0107) |
| Qué pasa si devuelve | Hoy sin regla: el sistema lo avisa en vez de callar |
| Liquidación: «hasta agotar», con fecha límite | Una liquidación termina cuando se acaba el stock; la fecha límite cubre lo que Indecopi pida (duración) y obliga a decidir qué hacer con lo que sobre |
| **Liquidación: venta final** | Sin cambio ni devolución por gusto; si llega con falla, la garantía sigue. **Hoy Devoluciones y Cambios no distinguen una venta final de una normal** (solo las piezas sueltas lo son, por no estar en el inventario): la maqueta lo marca en ámbar como pendiente |
| Liquidación bajo el costo | Se espera y no se bloquea, pero es pérdida de valor del inventario: el contador debe saber cuánto. Las piezas sueltas hoy no guardan costo |

## Historia de las decisiones (2026-10-21 al 2026-10-23)

> **Esta parte es el razonamiento de las versiones anteriores y está superada en lo que se ve.** Las cifras de producción de abajo son del 2026-10-21; las de hoy están arriba. Lo que sigue valiendo: una campaña es el contenedor de las ofertas (tercera decisión), el registro vive en la hoja «Configurar» (cuarta), la liquidación definitiva va por su camino (segunda y quinta) y una sola regla de precio en vez de dos módulos.
> Dos cosas cambiaron el 2026-10-23: la campaña **ya no vive en Atributos ▸ Etiquetas** sino en **Catálogo ▸ Insignias** (sexta decisión), y el **tablero** (Tarjetas · Calendario · Ofertas) de la quinta decisión se quitó.

### Campañas y la sección «Campaña y festividad» (así era Atributos ▸ Etiquetas el 2026-10-21)

Hoy la pestaña Etiquetas hace **dos trabajos en una sola pieza**: *marca prendas* (Nuevo, Halloween, Hecho a mano…) y *guarda una regla de
precio* (porcentaje, fechas, categorías: «Configurar campaña»). Se agrupan en cuatro secciones por `estilo`, que es solo visual:
Rotación, Artesanal, **Campaña y festividad** y General.

**Lo que había en producción el 2026-10-21** (solo lectura; esta cifra envejece, vuelve a preguntarla antes de decidir):

| Hallazgo | Dato |
|---|---|
| Etiquetas | 26, todas aprobadas; **13 en «Campaña y festividad»** (San Valentín, Día de la Madre, Halloween, Black Friday, Navidad, CyberWow…) |
| ¿Esas 13 llevan descuento? | **Ninguna.** Son *ocasiones del calendario* con fechas, y sirven para marcar qué prendas son de cada una (Halloween: 45 prendas; Día Internacional del Gato: 7) |
| Etiquetas con porcentaje hoy | **1**: «Para liquidar», 20 %, 1 sep – 31 dic, sin categorías ni prendas marcadas: está armada y no alcanza a nada |
| ¿Se usó el descuento de campaña? | **Sí: 28 líneas de 1,609** (S/ 157.50 en total), por tres etiquetas de **tres grupos distintos**: Estreno (General, 16 líneas), Aniversario CAYLA (Campaña y festividad, 10) y Últimas unidades (Rotación, 2) |
| Esas tres hoy | **Con el porcentaje vacío.** La etiqueta no recuerda cuánto fue |
| Historial de la configuración de una etiqueta | **No existe** (solo el historial de cada prenda, ADR-0354) |

Lo que esto cambia:

1. «Campaña y festividad» **no es donde viven los descuentos**: es un calendario de ocasiones. Un descuento puede colgar de cualquier etiqueta (Estreno estaba en «General»).
2. **La regla de precio se pierde cuando termina la campaña.** Una línea de venta apunta a la etiqueta, pero el porcentaje que valía no se guarda en ningún lado. Con eso no se puede construir «¿Valió la pena?» ni comparar un Aniversario con un Black Friday. La regla necesita su propio registro, congelado al terminar.
3. **El único mecanismo de alcance que existe hoy es la etiqueta** («las prendas marcadas con Para liquidar») además de categorías. **La primera versión de la maqueta lo omitió; la segunda ya lo trae** (paso «prendas y dónde», grupo «Por etiqueta»): el alcance de una campaña también debe poder ser «las prendas con la etiqueta X».

**Vocabulario: «campaña» hoy significa tres cosas.** (a) una *ocasión* del calendario (Atributos), (b) un *descuento* («Configurar campaña») y (c) el *plan de compra* de una ocasión (Compras ▸ Plan de campaña, ADR-0349).
Mi primera propuesta fue renombrar la sección de Atributos a «Ocasiones» y dejar «campaña» para el descuento. **Felipe lo resolvió al revés (2026-10-21, tercera decisión, más abajo):** «campaña» se queda con la de Atributos y el descuento pasa a llamarse oferta, promoción o liquidación. La sección de Atributos **no se renombra**.

```
DECIDÍ: la etiqueta dice QUÉ prendas y CUÁNDO es el evento; la oferta (regla de precio) dice QUÉ PASA con su precio y guarda sus
        términos congelados. Toda oferta apunta a una campaña (tercera decisión). El «Configurar campaña» se muda a Ofertas y promociones por etapas.
DESCARTÉ: (1) dejar las dos configurando el mismo descuento: dos formas de resolver lo mismo, y alguien pondrá el −20 %
          en la que no mira la caja. (2) Fundir Campañas dentro de Atributos: ahí está enterrada, y un calendario, un
          resultado y promociones con condición no son atributos de una prenda.
SE ROMPE SI: se apaga el «Configurar campaña» antes de que la pantalla nueva lea las mismas etiquetas (la fila de
             «Para liquidar», vigente hasta el 31 dic, dejaría de rebajar), o si se toca `fn_campanas_por_variante` /
             `registrar_venta` sin el OK de Felipe (es dinero con comprobante).
```

**Etapas** (cada una se prueba sola, y solo la 3 toca dinero):

1. **Leer, sin tocar la venta.** La lista de Ofertas y promociones se agrupa por las campañas de hoy (las 13 etiquetas de «Campaña y festividad») y muestra como oferta heredada lo que hoy lleva porcentaje («Para liquidar», 20 %); el calendario se arma con sus fechas, con su aviso: «Black Friday empieza en 19 días y no tiene ofertas». Cada campaña de Atributos gana su línea «Ofertas y promociones (n)». La regla de la caja no cambia.
2. **Crear dentro de una campaña.** «Crear oferta» parte de una campaña, con sus fechas y sus prendas marcadas. **Solo cabe lo que la caja de hoy ya entiende: una oferta de porcentaje por campaña** (la etiqueta guarda un único %). Todo lo demás (2 por un precio, monto, regalo, varias reglas en una campaña) espera la etapa 3.
3. **Registro propio (dinero: OK de Felipe).** Las reglas nuevas (con condición, tope, sede, canal; varias por campaña) viven en su propia tabla, con una columna `etiqueta_id` (la campaña, obligatoria) y sus términos congelados; `registrar_venta` las lee y cada línea de venta apunta a la regla y a la campaña; «Para liquidar» migra; `etiquetas.descuento_pct` queda congelado (no se borra).

### Campañas y Liquidación: ¿una fila del menú o dos?

> **Superada el 2026-10-23 (quinta decisión).** No hay fila nueva: las ofertas y promociones viven dentro de las campañas de Atributos y **Liquidación conserva su fila de hoy**. Lo de abajo es el razonamiento de las versiones anteriores.

Las dos «bajan un precio», pero no son lo mismo. Lo que las separa es lo que se vende, no el porcentaje:

| | **Liquidación** (ADR-0379) | **Campañas** (esta propuesta) |
|---|---|---|
| Qué se vende | Una **pieza suelta que no es un producto**: no existe en `productos`, `stock` ni `movimientos` | Prendas **del catálogo**, con stock y movimientos |
| De dónde sale el precio | Se escribe **prenda por prenda**; cada rebaja imprime una etiqueta nueva con otro código | Lo calcula **una regla** (`fn_campanas_por_variante`): el mismo beneficio para muchas prendas |
| Cómo llega a la caja | Se **escanea el código** de la etiqueta (`LQ…`) | Se aplica sola si la prenda cae en una campaña vigente |
| Duración | Hasta que se vende o se retira; sin fechas | Con inicio y fin |
| Después de vender | **Venta final**: sin cambio ni devolución | Cambio y devolución permitidos (con el hueco de regla ya señalado) |
| Otros descuentos | Ninguno, ni regalo del Club | Un descuento de precio por prenda: el mejor para el cliente |
| Cuenta en Análisis, Frescura y demanda | No (son prendas viejas: ensuciarían lo que hay que reponer) | Sí, es venta normal |
| Radio de impacto | **Una prenda** (piso de S/ 10) | **Toda una categoría, en todas las sedes** |

**Qué sí tiene que estar separado** (y lo sigue estando en la lista única): la **tabla de piezas sueltas**, su regla de venta (código, sin stock) y su llave de permisos. **Lo que ya no hace falta separar:** el tipo. Una liquidación es una oferta (ver la «Segunda decisión» más abajo), y «−70 % hasta agotar» sí tiene dónde vivir: es una campaña de tipo «Liquidación».
**Qué NO tiene que estar separado:** la puerta de entrada. Las dos son «a cuánto se vende».

### Propuesta de Felipe (2026-10-21): una sola fila con las dos adentro, y se adopta

La primera versión de este documento recomendaba **dos filas** (Campañas y Liquidación) con el argumento de que una fila del menú es un módulo y mezclaría
dos llaves. **Ese argumento no se sostenía:** Atributos ya es una fila con dos módulos (`exigirModulo("atributos", "etiquetas")`, `moduloAlterno` en
`menu.ts`) y su pantalla muestra solo las pestañas de los módulos que el rol tiene. Además, lo que pesa a favor de una sola fila:

| Razón | Dato (producción, consultada el 2026-10-21, solo lectura; envejece) |
|---|---|
| **Mover Liquidación hoy casi no cuesta** | **0 piezas** en `piezas_liquidacion` y **1 rol** con el módulo `liquidacion`: nadie ha aprendido esa fila. Cada semana de uso sube el costo |
| **El menú** | Catálogo queda en **5** hijas en vez de 6 de 6 (`TOPE_HIJAS`); la próxima forma de bajar un precio (cupones, venta privada) tiene casa sin regrupar |
| **Una sola pregunta** | «¿Dónde bajo un precio?» tiene una respuesta; la pantalla pregunta después «¿una prenda suelta o varias?» |

**Condiciones, para que unir la entrada no vuelva a entrelazar lo que sí debe estar separado** (versión vigente tras la segunda decisión):

1. **Fila «Ofertas y promociones»** con `modulo: "etiquetas"` y `moduloAlterno: "liquidacion"`. Cada **fila de la lista** se ve solo si el rol tiene el módulo de su origen: las campañas (incluida la liquidación del catálogo) son de Etiquetas; la fila «Piezas sueltas» es de Liquidación. Un rol con solo `liquidacion` entra directo a la tabla de piezas, sin una lista de una sola fila. La palabra «categorías» se evita: ya significa blusas, vestidos…
2. **Las piezas sueltas conservan su tabla, su regla y su llave.** Se abren desde su fila; arriba de su tabla, su regla en una línea («Venta final: sin cambio ni devolución»).
3. ~~Nunca una lista única que mezcle piezas y campañas.~~ **Cambió (2026-10-21):** la lista es única, pero la pieza suelta entra como **una fila resumen**, no una fila por pieza. Lo que escondía la venta final era mezclar *cada pieza* con las filas de campaña, no compartir la lista.
4. `/productos/liquidacion` sigue funcionando (redirige a Ofertas y promociones ▸ Piezas sueltas) para no romper enlaces ni la guía interactiva.

**Nombre:** «Ofertas y promociones». Se descartó «Promociones» a secas (la palabra también es un tipo dentro de la pantalla: dos niveles con el mismo nombre) y «Precios especiales» (no dice regalo ni Club).

**Lo que cuesta:** segunda vez que se usa `moduloAlterno` (conviene generalizarlo como «una fila, varios módulos» en vez de repetir el parche); poner al día la guía interactiva, su huella y `guia-de-foco-pantallas.ts` de Liquidación; y la fila queda menos específica para quien solo hace liquidación.

**Se rompe si** Liquidación crece a algo propio (outlet físico, remates por lote): ahí merece su fila otra vez.

### Segunda decisión de Felipe (2026-10-21): la liquidación es un tipo de oferta, no una pestaña

> **Acotada el 2026-10-23.** Sigue valiendo en lo que se ve (una lista, tres tipos), pero la liquidación definitiva **ya no se registra dentro de una campaña**: la sesión de liquidación
> decidió que la del catálogo es un precio por variante y tienda, sin campaña ni fechas. La línea «(a)» y la tabla de abajo son la versión anterior; ver «Lo que cambió el 2026-10-23».

Felipe preguntó si una liquidación es un tipo de oferta o algo distinto. En el comercio general **es una oferta, la más extrema**: lo que la distingue no es el
porcentaje sino el propósito (sacar ese stock **para siempre**: el precio no vuelve, no se repone, suele ser venta final y no se junta con otras). No hay una
definición oficial de «liquidación» en Indecopi que se haya encontrado; sí rigen las reglas de toda rebaja (precio normal como «antes», duración, cantidad), y
lo confirma un abogado. Con eso la pantalla deja de tener dos pestañas: **una lista, tres tipos — Oferta · Promoción · Liquidación.**

```
DECIDÍ: «Liquidación» es un tipo de la lista única, junto a Oferta y Promoción. Tiene dos orígenes con el mismo tipo:
        (a) prendas del catálogo = [reemplazado el 2026-10-23] su propio mecanismo, fuera de la campaña: un precio por color y talla en cada tienda;
        (b) piezas sueltas = una fila fija «Piezas sueltas» que resume y se abre en su tabla (ADR-0379 no cambia).
DESCARTÉ: dejar las dos pestañas, porque cada una refuerza la idea de que son cosas distintas y «¿dónde bajo un precio?» seguiría
          con dos respuestas; y una fila por pieza suelta dentro de la lista, porque las columnas de una campaña (alcance, sedes,
          vigencia, tope) no aplican a una prenda con código y la lista se llenaría de filas que no son campañas.
          Tampoco convertí las piezas en «campañas de una sola prenda»: obligaría a crear ficha y stock, justo lo que ADR-0379 evitó.
SE ROMPE SI: una prenda cae en una liquidación y en otra campaña a la vez. La maqueta dice que gana la liquidación y la prenda sale de la otra,
             pero la base hoy elige «el mejor precio» (ADR-0107): hay que cambiar `fn_campanas_por_variante` y `registrar_venta`.
             O si Devoluciones y Cambios no leen «venta final» de una campaña: hoy solo las piezas sueltas la tienen, y por no estar en el inventario.
```

**Lo que esta decisión obligaba a construir** (versión del 2026-10-21; con el cambio del 2026-10-23 pasa a ser lo de la sesión de liquidación: venta final **por línea de venta**, una capa en `fn_precio_en_sede`, y una línea liquidada que no admite campaña, Club ni descuento a mano):

| Cambio | Dónde toca | Quién decide |
|---|---|---|
| «Venta final» pasa de ser una consecuencia de «no está en el inventario» a ser un **término de la campaña**, guardado congelado en su registro | `registrar_venta`, `registrar_cambio`, devoluciones | **Felipe** (dinero + stock) |
| «No se junta con otras» rompe la regla «gana el mejor precio» (ADR-0107) | `fn_campanas_por_variante` | **Felipe** (precio) |
| «Hasta agotar» con fecha límite | Esquema de la campaña; qué pasa con lo que sobra | Felipe + abogado (Indecopi) |
| Liquidar bajo el costo es pérdida de valor del inventario | Contabilidad; hoy las piezas sueltas **no guardan costo** | Contador |
| La etiqueta «Para liquidar» (−20 %, 0 prendas) pasa a ser el **alcance natural** de una liquidación, y su % deja de mandar | Etapa 2 de la migración de etiquetas | Felipe |

### Tercera decisión de Felipe (2026-10-21): toda oferta se registra dentro de una campaña de Atributos

Felipe preguntó cómo adaptar la sección para que las ofertas y promociones **se registren a través de las campañas de Atributos**. Se compararon tres opciones y se eligió la 1:

| | **1. Campaña obligatoria; la oferta es una regla dentro** (elegida) | 2. Campaña opcional | 3. La etiqueta guarda el tipo de beneficio |
|---|---|---|---|
| Ganas | Una sola respuesta a «¿qué pasa en noviembre?»; «¿Valió la pena?» por campaña; nombre y fechas se escriben una vez; la venta ya apunta a la etiqueta | Cero fricción | Ningún modelo nuevo |
| Pagas | Toda oferta necesita campaña (habrá campañas sin prendas marcadas); un paso más | Dos caminos para lo mismo; análisis por campaña a medias | Renombrar o mover fechas de una etiqueta mueve dinero; una campaña no puede tener tres beneficios |

```
DECIDÍ: la campaña de Atributos ▸ Etiquetas es el contenedor obligatorio; la oferta, la promoción y la liquidación del catálogo son reglas de precio
        dentro de ella. Los beneficios con fecha solo viven aquí; los permanentes del Club siguen en Clientes ▸ Beneficios del club; las piezas sueltas
        siguen aparte (su fila «Liquidación»), porque no son del catálogo.
DESCARTÉ: la campaña opcional, porque mantiene dos formas de registrar lo mismo y rompe el análisis por campaña (lo que dice si valió la pena);
          y la etiqueta con tipo de beneficio, porque entrelaza taxonomía con dinero: renombrar «Halloween» movería el precio de las casacas.
SE ROMPE SI: alguien crea «Black Friday» y «Black Friday 2026» (al crear una campaña, la maqueta busca una parecida y ofrece usarla); alguien mueve las fechas
             de la campaña esperando mover las de una oferta ya programada (la regla congela las suyas al crearse); o una campaña no tiene prendas marcadas y
             nadie la completa (Black Friday: 9 nov, 0 prendas): la oferta entonces solo puede ir por categorías.
```

**Actualización 2026-10-23 («Repetir»):** Felipe decidió que *la etiqueta sigue siendo la campaña, con historial de cada cambio de fechas, % y alcance*. Por eso «Repetir» ya no crea «Día de la Madre 2027»: reabre la misma campaña con las fechas de 2027 y guarda la de 2026 en su historial. Lo registrado el año pasado queda como edición anterior.

**Por qué es viable:** «campaña» en Atributos ya no es solo festividad. En producción, Estreno, Últimas unidades y Para liquidar son del mismo grupo y se usaron como campaña; y una oferta con fecha de término (lo que pide Indecopi) *es* un evento.
**Lo que cambia en la base** (solo diseño; no se ha construido): tabla nueva de reglas con `etiqueta_id` obligatorio (a `retail.etiquetas`), fechas de la regla ⊆ fechas de la campaña con un `check`, línea de venta con `regla_id` además del `descuento_etiqueta_id` que ya existe,
y la restricción `venta_items_campana_coherente` (ADR-0108) ampliada. **`registrar_venta` es dinero con comprobante: el OK de Felipe va antes.**
**Lo que cuesta:** mantener «Atributos ▸ Etiquetas» al día es ahora condición para vender ofertas por prendas marcadas (hoy esa tarea no tiene dueño).

### Cuarta decisión de Felipe (2026-10-21): las ofertas se registran dentro de la Configuración de la campaña

Felipe aclaró qué quería decir con «registrar a través de las campañas»: **dentro de la hoja «Configuración» de cada campaña de Atributos**, con un selector «Oferta | Promoción» (con el diseño de las pestañas de Atributos) que cambia los campos, y contemplando todos los casos. Eso reemplaza el asistente de 5 pasos («Nueva oferta»), que desaparece: la campaña ya está elegida porque la hoja se abre desde ella.

```
DECIDÍ: el registro vive en la hoja «Configuración» de la campaña: selector Oferta | Promoción, el tipo, sus campos y, debajo, lo ya registrado.
        «Ofertas y promociones» queda como la vista de conjunto (lista, calendario, resultados) y sus botones abren esa misma hoja.
DESCARTÉ: mantener el asistente de 5 pasos al lado de la hoja, porque serían dos formas de registrar lo mismo (y el asistente repetía la elección de campaña
          que la hoja ya trae); y un solo formulario sin lo ya registrado, porque una campaña puede tener varias ofertas y editarla a ciegas
          repetiría la que ya existe.
SE ROMPE SI: la hoja ofrece tipos que la caja todavía no sabe aplicar (hoy solo existe el porcentaje por etiqueta): la colaboradora vería «3x2» en la tienda y la caja
             cobraría el precio entero. Los tipos se habilitan por oleadas, y el selector no debe mostrar lo que la venta no entiende.
```

**Todos los casos que la hoja contempla** (15; la liquidación salió de aquí el 2026-10-23; «hoy en la caja» = lo que `registrar_venta` ya aplica el 2026-10-21):

| Selector | Tipo | Ejemplo | Campos | Hoy en la caja |
|---|---|---|---|---|
| Oferta | Descuento en % | −20 % | porcentaje | **Sí** (es lo único que existe) |
| Oferta | Soles menos por prenda | S/ 10 menos | soles | No |
| Oferta | Precio único | todas a S/ 29.90 | precio | No |
| Promoción · cantidad | N por un precio | 2 por S/ 59.90 | cantidad, precio, qué prendas cuentan | No |
| Promoción · cantidad | La N.ª con descuento | la 2.ª al 50 % · la 4.ª gratis | cuál prenda, porcentaje (hasta gratis), qué prendas cuentan | No |
| Promoción · cantidad | Lleva N, paga M | 3x2 · 2x1 | cuántas lleva, cuántas paga, qué prendas cuentan | No |
| Promoción · cantidad | % desde N prendas | 3 o más, 15 % menos | cantidad, porcentaje, qué prendas cuentan | No |
| Promoción · cantidad | Conjunto (look) | blusa + falda por S/ 149.90 | qué prendas lo forman (2 o 3), precio | No |
| Promoción · monto | Soles menos desde un monto | S/ 20 desde S/ 200 | monto, soles | No |
| Promoción · monto | % menos desde un monto | 10 % desde S/ 300 | monto, porcentaje | No |
| Promoción · monto | Regalo desde un monto | basta gratis desde S/ 200 | monto, qué se regala | No (y el contador decide cómo se declara) |
| Promoción · Club | % para miembros | 10 % menos | porcentaje | No |
| Promoción · Club | Cupón de bienvenida | 10 % en la 1.ª compra | porcentaje | Parcial (el Club ya tiene cupón) |
| Promoción · Club | Compra privada | 24 h antes | horas | No |
| Promoción · Club | Puntos extra | puntos x2 | multiplicador | Parcial (el Club ya tiene puntos, no multiplicadores) |

Comunes a todos: campaña, prendas (marcadas y/o categorías, dejar fuera, Claurè y días en el piso), tiendas (la web cobra lo mismo), fechas dentro de las de la campaña, «con las demás ofertas» (se suma / no acumulable) y nombre. **Sin tope de unidades** (decisión 16).

**Casos que NO están y por qué** (dependen de decisiones de negocio que no son mías): *envío gratis desde un monto* (¿se cobra envío en la tienda web?), *regalo al comprar una prenda concreta*, *cupón por código* (los códigos de descuento que existen son para autorizar a una colaboradora, no una campaña) y *descuento de cumpleaños* (es del Club).

### Quinta decisión de Felipe (2026-10-23): ya no existe la fila «Ofertas y promociones» del menú *(el tablero que proponía se quitó por la tarde; ver la sexta decisión arriba)*

Felipe: la fila deja de existir porque todo vive dentro de las campañas de Atributos. Con las decisiones anteriores (la hoja «Configurar» registra, la liquidación va por su camino), la fila ya no tenía nada propio salvo el **tablero** (lista, calendario, sugerencias) y el **resultado**. Ambos tienen casa:

```
DECIDÍ: sin fila nueva en el menú. El tablero pasa a Atributos ▸ Etiquetas ▸ «Campaña y festividad», como tres modos del mismo grupo (Tarjetas · Calendario · Ofertas).
        El resultado ya existe en Finanzas ▸ Reportes ▸ Campañas y se enlaza desde cada campaña que terminó. Liquidación conserva su fila (módulo `liquidacion`).
DESCARTÉ: dejar la fila solo como tablero, porque repetía lo que Atributos ya muestra y obligaba a un módulo más para algo que no tiene reglas propias;
          y mover el tablero a Análisis o Finanzas, porque lo que rige hoy (y cuándo) lo necesita quien programa las ofertas, que es quien ve Etiquetas.
SE ROMPE SI: Atributos se vuelve la pantalla donde todo compite por el espacio (hoy tiene 6 pestañas y 4 grupos de etiquetas): el modo «Ofertas» es largo y, con muchas campañas
             al año (10 a 14, más las de fábrica), se tiene que poder filtrar por campaña y por tipo; o si un rol necesita ver lo que rige sin poder configurar.
```

**Lo que ahorra:** ningún módulo nuevo (ADR-0306: un módulo es una entrada del menú, y la hoja «Configurar» es una función de Etiquetas), ningún `moduloAlterno` nuevo y ningún cambio en `menu.ts`: Catálogo sigue en 5 hijas de 6 posibles (`TOPE_HIJAS`).
**Lo que cuesta:** quien configura una campaña ya no tiene un lugar propio; entra por Atributos. El modo «Ofertas» y el «Calendario» heredan los permisos de Etiquetas: un rol sin ese módulo no los ve.
**Efecto en la liquidación:** vuelve a ser la fila propia de hoy. Ya no hay un grupo «Sin campaña» ni un filtro «Liquidaciones» en el tablero de ofertas (no eran de una campaña). «Liquidación» sigue siendo un *tipo de oferta* en el lenguaje (Felipe, 2026-10-21), pero su pantalla y su permiso son los suyos.

## Decisión estructural (propuesta)

```
DECIDÍ: una sola entidad, la regla de precio (campaña de Atributos + alcance + beneficio + condición opcional + vigencia). Oferta y
        promoción se deducen de si hay condición; no se guardan como dos tipos.
DESCARTÉ: dos módulos, «Ofertas» y «Promociones», porque cada uno repite alcance, vigencia, tope y cruces, y el
          primer día que una promoción también baje un precio habría que decidir en cuál vive.
          También descarté meter los beneficios nuevos dentro de `etiquetas`: la etiqueta es un atributo de la
          prenda (taxonomía) y una campaña es una regla de precio; mezclarlos hace que renombrar una etiqueta pueda
          mover dinero.
SE ROMPE SI: dos cajas venden en el mismo segundo la última unidad de una campaña con «primeras 40 unidades»
             (el contador necesita bloqueo, como `piezas_liquidacion … for update`), o si una devolución
             parcial de una promoción de monto no tiene regla (el cliente cobra el descuento y devuelve la prenda
             que lo causaba).
```

Estados imposibles que el esquema debe cerrar (no la validación de la pantalla): fecha de fin anterior a la de inicio; % fuera de (0, 100];
precio de combo mayor o igual al de lista; descuento por monto mayor o igual al monto mínimo; un regalo de precio 0 fuera de empaque
(ADR-0384); una venta con descuento «de campaña» sin la campaña que lo respalda (como `venta_items_campana_coherente`, ADR-0108).

## Lo difícil, que la maqueta NO resuelve

1. **Devoluciones y cambios con promoción de cantidad o de monto.** **Decidido (Felipe, 2026-10-21): se pierde la oferta** (lo que se queda vuelve a su precio y esa diferencia se descuenta del reintegro). Falta construirlo: hoy `registrar_cambio` ni siquiera aplica las campañas (ADR-0108, «No cubre»), y la regla se esquiva devolviendo y comprando de nuevo a precio de campaña.
2. **Boleta y SUNAT.** Cómo se reparte «2 por S/ 59.90» entre dos líneas, y cómo se declara un regalo. Es dinero con validez legal: no se toca sin el OK de Felipe.
3. **Sin tope de unidades (decisión 16).** Ya no hay un contador que dos cajas puedan pasarse, pero Indecopi pide decir cuántas unidades hay: el sistema da la cifra y el anuncio la lleva.
4. **El veredicto de «¿Valió la pena?».** «Sin campaña» es una estimación con los mismos días de antes. Con pocas ventas no debe afirmarse nada: antes de producción hay que definir cuántas ventas hacen falta para decir «funcionó» (lente de `/rigor`: estadística de poca muestra).
5. **Dónde viven los beneficios del Club.** Ya existe Clientes ▸ Beneficios del club. Propuesta: las reglas de fidelidad se quedan allá, y aquí solo entran las campañas con fecha (puntos dobles, venta privada). Si no, quedan dos pantallas decidiendo lo mismo.
6. **Módulo y roles (corregido el 2026-10-21).** La primera versión de este documento decía que «Campañas» sería un módulo nuevo (`campanas`) que nace solo para el líder. **Eso era un error:** hoy configurar una campaña es de **quien tiene el módulo Etiquetas**, sea líder o no (ADR-0293, Felipe 2026-09-30: «para todos los que tengan el módulo»). Un módulo nuevo solo-líder le quitaría a esos roles algo que hoy hacen. La fila nueva del menú (que ya no se hace) habría usado el módulo `etiquetas` (como Categorías, Marcas y Atributos comparten `atributos`); un módulo propio solo se justifica el día que una promoción con regalo o con dinero deba ser más restringida. Liquidación sigue con su módulo (`liquidacion`).
   **Menú (2026-10-23, tarde):** Catálogo tiene hoy **6 hijas** (Productos, Categorías, Marcas, Atributos, **Insignias**, Liquidación), que es el tope (`TOPE_HIJAS`, `menu.test.ts`). **No se agrega ninguna fila:** las ofertas y promociones viven dentro de la hoja de las campañas de Insignias (módulo `etiquetas`, con `campanas` como `moduloAlterno`, ADR-0481) y Liquidación sigue en la suya. Nada que tocar en `menu.ts`. Si un día hace falta otra fila de Catálogo, no cabe: habría que juntar o mover una.
7. **Piezas del ERP.** La maqueta dibuja con sus propios estilos; en el ERP real se arma con las piezas únicas de ADR-0358 (`<EncabezadoPagina>`, `<TarjetaCifra>`, `<Pestanas>`, `<Chip>`, `<PasoCantidad>`, `<Aviso>`…), con `<Modal>` para las hojas y con la guía interactiva de ADR-0389.

## Lo que necesito de Felipe

1. **Aprobar «Tres preguntas» con los días de la semana, o decir qué cambia.** Es lo que desbloquea el código. Mira `formulario/opcion-3-tres-preguntas.html` (con Halloween para los días) y, de `index.html`, el pase (tercera cifra y «Lo que ya tiene»). *Si no respondes, no toco el código.*
   **1 bis. ¿Qué dice la etiqueta de papel de una oferta con días sueltos?** Hoy dice el precio de la caja el día que se imprime. Con «solo martes y jueves» hay dos caminos: que diga el precio normal y, aparte, «Mar y jue: S/ X»; o que una oferta con días sueltos no imprima precio rebajado. Recomiendo el primero. Es tuyo: toca lo que el cliente lee.
2. **Confirmar la séptima decisión** (las prendas de una oferta son las de su campaña). Si prefieres que una oferta pueda apuntar a todo el catálogo sin que la campaña lo tenga, se cambia, pero el pase y la web dejan de decir la verdad sobre esa campaña.
3. **¿Por dónde empezar?** Recomiendo la **etapa 0**: la hoja nueva con un solo tipo («Descuento en %»), sin migración y sin tocar la caja. Es verificable de punta a punta y no mueve dinero. *Si no respondes, es la etapa 0.*
4. **Las otras insignias con descuento:** «Para liquidar» (−20 %, Rotación, **sin ninguna prenda**) y «Sorteo» (100 %, una talla que la caja regalaría) siguen como hoy en la maqueta. ¿Se quedan así, o pasan a ser campañas con ofertas? Recomiendo dejarlas: son otra decisión.
5. **Tope del %.** La base deja un descuento de campaña de hasta **100 %**; en la hoja, «Descuento en %» va de 5 a 70 y «La N.ª con descuento» llega a «gratis». ¿Ese tope de 70 % es el que quieres, o dejas el 100?
6. **¿En qué orden se habilitan los 15 tipos?** Solo «Descuento en %» funciona hoy en la caja. Recomiendo: oleada 1, Descuento en %, Soles menos y Precio único; oleada 2, N por un precio, La N.ª con descuento y Lleva N paga M; oleada 3, por monto; oleada 4, Club y regalo (necesitan al contador). *Si no respondes, esa es la secuencia.* Mientras un tipo no esté habilitado, la hoja no debe ofrecerlo.
7. **«Cuáles prendas cuentan»** en las promociones por cantidad: ¿«mismo modelo» o «cualquiera de las elegidas»? Recomiendo «mismo modelo» (da menos).
8. **Abogado y contador** antes de la promoción de regalo y antes de fijar cuántos días de precio estable hacen falta para que el «antes» sea el normal.
9. **¿Quién marca las prendas de Black Friday?** Empieza el 9 de noviembre y tiene **0 prendas**: con la séptima decisión, una oferta de esa campaña no alcanzaría nada hasta que alguien las marque o sume categorías. Hoy esa tarea no tiene dueño.
10. **Tres objeciones que siguen abiertas** (de la sesión de campañas): el precio tachado con campañas casi todos los meses (11), «cambio a precio normal» que no fue una decisión sino un hueco de la migración `20260918170000` (18), y el apartado que se cobra más de lo que se le dijo al apartar (19).
11. **Antes de invertir más en las piezas sueltas:** en producción llevaban 11 días y **0 piezas** (2026-10-21). ¿La liquidación de prendas sueltas ya empezó o espera un evento?
12. Resueltas: ~~regla de devolución~~ (se pierde la oferta, decisión 17), ~~venta final en el catálogo~~ y ~~una liquidación y otra oferta sobre la misma prenda~~ (sesión de liquidación), ~~dónde va en el menú~~ (en ningún lado nuevo).

## Cómo verla

Abre `index.html`. (Si el navegador te muestra una versión vieja, recarga con Ctrl+Shift+R: un archivo abierto directamente es una copia del momento en que se abrió.) Pruébala así:

1. **La pantalla.** Paso 1: es Catálogo ▸ Insignias, con **Campañas · Rotación · Artesanal · General**. El pase de **Aniversario CAYLA** está abierto: dice «4 ofertas y promociones» y, abajo, «Lo que ya tiene» las lista. Abre **Halloween** o **Black Friday** (sin prendas, sin ofertas) y compara.
2. **La hoja.** Toca **«Configurar»** en Aniversario CAYLA (o el paso 2). Arriba, «La campaña»: prueba «Cambiar fechas» y «Categorías» (con «Todo el catálogo»). Abajo, lo ya registrado: el **−10 %** es el descuento real que la campaña ya tenía.
3. **Registrar.** Cambia entre **Oferta** y **Promoción**; prueba «Lleva N, paga M» (3x2 y 2x1), «La N.ª con descuento» (la 4.ª gratis), «Soles menos desde un monto» y «Conjunto (look)». En «Prendas» elige «Solo algunas categorías». Mira «Dejar fuera», «Claurè», «Con las demás ofertas», que no hay tope de unidades y que la tienda web no está entre las tiendas.
4. **Borrador y líder.** **Navidad** trae un borrador. Con «Ver como» ▸ **Con Insignias**, la hoja solo deja guardar como borrador y el borrador dice «espera a un líder». Con **Líder** aparece **«Activar»**.
5. **Editar en marcha.** En «Configurar» de **Halloween**, toca «Casacas · −30 %», sube el porcentaje y «Guardar cambios»: queda su historial.
6. **Repetir.** En **Día de la Madre** (ya pasó), «Repetir» abre «Repetir «Día de la Madre» en 2027»: la misma campaña pasa a 2027 y guarda la de 2026 en su historial. «¿Valió la pena?» abre su reporte en Finanzas.
7. **Una campaña nueva.** «+ Nueva campaña»: escribe «Black» y avisa que ya existe «Black Friday»; escribe «Cyber Days» y se crea sin fechas, en «Guardadas».
8. **Desactivar.** Mira lo que dice el aviso.
9. **Roles.** «Con Insignias» ve las cuatro vistas pero **no** Liquidación; «Solo Campañas» ve solo la vista Campañas, sin pestañas; «Con Liquidación» ve solo Liquidación y en Insignias sale «Sin acceso».
10. **Celular y oscuro.** El botón «Celular» muestra la billetera en una columna (el pase en grande queda justo debajo del pase abierto) y la hoja de pantalla completa.
11. **Caja y tienda.** En «En la caja», toca «¿Por qué?»; en la tienda web el carrito es el mismo.

La barra negra cambia escritorio/celular y claro/oscuro. Los nombres y las fechas de las 13 campañas, sus prendas marcadas y el −10 % de Aniversario salen de producción (2026-10-23, solo lectura); lo demás es inventado.

# ADR-0313 — Editar producto usa el ancho que dejó libre ADR-0257: el panel del taller

**Fecha:** 2026-10-02
**Estado:** Construido y verificado en local (navegador, puerto 3070): ajuste real de stock con motivo «Reposición»,
toast + banner en el orden correcto (ADR-0149), banner persistente al navegar dentro de Productos y descartado al
salir a Inventario. `tsc`, `eslint`, `lib/guia-de-foco.test.ts` y `lib/sugerir.test.ts` en verde. Tres commits
(`941d3f4f`, `6f6a823a`, `1ca9f941`). **Sin migración.**
**Decide:** Felipe, 2026-10-02. Pidió aprovechar el espacio vacío a la derecha de Editar producto (la pregunta que
ADR-0257 dejó abierta: «si Felipe la prefiere a todo el ancho, es una línea») y que la ficha guarde concordancia
visual con Nuevo producto. Vio 3 maquetas (`docs/maquetas/producto-editar-rediseno-2026-10/`) y eligió **B · Panel
del taller**. Al construirla tal cual chocó con dos piezas reales más sofisticadas que la maqueta; respondió
`AskUserQuestion` con las dos opciones recomendadas (abajo). Después pidió que el aviso de «Imprimir etiquetas» sea
persistente, no un toast que se apaga solo.
**Sobre:** ADR-0257 (la barra/hoja de guardado — este ADR no la toca), ADR-0284 (guía de foco — `TiraFicha.tsx` sigue
intacta), ADR-0149 (orden loader → aviso), ADR-0270 decisión 9 / principio 4 de `CLAUDE.md` (stock = snapshot
derivado de `movimientos`, nunca editable directo).

## Contexto

ADR-0257 quitó el panel de guardado de la derecha (`ProductoForm.tsx` quedó en `max-w-[1080px]`) para que la barra
fija fuera el único camino de guardar. Dejó anotado, sin resolver, qué hacer con el ancho libre. Felipe lo pidió
ahora: la ficha se veía «pobre y desordenada» comparada con Nuevo producto, que sí usa el ancho completo con un panel
derecho (`FichaPrevia.tsx`).

## Decisiones

**1. El panel del taller es de solo lectura, salvo el lápiz de ajuste que YA existe.**
- DECIDÍ: `PanelDelTaller.tsx` nuevo — foto por color (reusa `vistaDeFotos()` de `fotos-por-color-reglas.ts`),
  swatches, identidad (código/nombre/categoría·marca·tejido), stock por talla y precio. El único control interactivo
  es el lápiz de `AjusteDeStock` (forma="lapiz") junto a cada talla — el MISMO componente que ya usa
  `VariantesFicha.tsx` más abajo, que abre el MISMO `AjustarInventarioModal` (motivo, sede, responsable, modo
  conteo/suma-resta, reporte CSV).
- DESCARTÉ el stepper simplificado (−/N/+ directo en la celda) de la maqueta: era una simulación de lo que
  `AjustarInventarioModal` ya hace mejor (motivo obligatorio, firma del responsable), y un stepper sin motivo
  reabriría el hueco que ADR-0270 (decisión 9) cierra a propósito — stock nunca se pisa directo, siempre pasa por
  `movimientos`. Confirmado con Felipe vía `AskUserQuestion` («Mantener AjustarInventarioModal», recomendada).
- «Cambiar foto» no reimplementa el subidor: lleva el scroll hasta `#fotos` (mismo ancla que ya usa la guía de foco)
  con un flash de fondo, nada más.
- **SE ROMPE SI** alguien le agrega a `PanelDelTaller` un campo que escribe stock directo (un `<input>` de cantidad,
  un stepper propio): vuelve a abrir el hueco de ADR-0270. El panel solo lee `ctx.estado` y delega el único punto de
  escritura al `AjusteDeStock` compartido.

**2. La columna izquierda sigue siendo lista agrupada por color, no grilla.**
- DECIDÍ: no tocar `VariantesFicha.tsx` (693 líneas, probado). La maqueta dibujaba las variantes como grilla
  color×talla; el componente real ya agrupa por color con su propio header (`AjusteDeStock forma="enlace"`) y
  `CambiarEnBloque` para precio/costo en bloque. Convertirlo a grilla era puro remaquetado visual sin beneficio
  funcional, sobre un componente grande y ya verificado. Confirmado con Felipe vía `AskUserQuestion` («Mantener la
  lista agrupada por color», recomendada).
- El grid de la ficha pasa a `minmax(0,1fr) 340px` (`lg:items-start`); por debajo de `lg` el panel se oculta
  (`hidden lg:block`) — a 375 px la ficha es la misma de siempre, sin el panel.

**3. «Producto» se parte en dos bloques numerados, sin colapsar.**
- DECIDÍ: dentro de la misma `<section>`/card, «① Identidad y categoría» y «② Tejido, patrón y estado», ambos
  siempre visibles — ningún acordeón.
- DESCARTÉ un acordeón real (`<details>` o `PasoAlta` colapsable): habría escondido `data-campo="tejido"` y
  `data-campo="patron"` detrás de un clic, rompiendo el scroll-to-campo-pendiente de `TiraFicha.tsx` (ADR-0284) la
  primera vez que alguien abre la ficha con «Tejido» pendiente. Agrupar solo visualmente (números, sin ocultar nada)
  da el mismo orden sin ese riesgo.

**4. El recordatorio de «Imprimir etiquetas» vive y muere con el módulo Productos, no con la visita a una ficha.**
- DECIDÍ: `RecordatorioEtiquetasProvider` (Context de React) montado en `app/(app)/productos/layout.tsx`, que ya se
  queda vivo mientras se navega DENTRO de Productos (lista, una ficha, Nuevo producto…) y se desmonta al salir a
  otro módulo del menú lateral. `AjustarInventarioModal.tsx` llama a `agregar()` con las variantes que subieron de
  stock, justo antes de `router.refresh()`; el banner (franja ámbar, no sticky, con `role="status"`) se dibuja una
  vez, arriba de toda pantalla de Productos, con el detalle de color·talla y un enlace a
  `/etiquetas-de-precio?variantes=…`.
- DESCARTÉ `localStorage`: esto es «de la visita», no «de mañana» — si el recordatorio sobreviviera un refresh o un
  día, una prenda ya etiquetada por otra persona seguiría apareciendo como pendiente.
- DESCARTÉ extender `Avisos.tsx` con un modo permanente: ese sistema es a propósito un toast que se apaga solo
  (4-8 s, ver su propio comentario); nunca tuvo un modo persistente y dárselo solo para este caso mezcla dos
  arquitecturas (notificación efímera vs. estado de la visita).
- Fuera del `Provider` (Existencias: `InventarioPanel.tsx`/`SelectorDeAjuste.tsx`, donde `AjustarInventarioModal`
  también vive pero sin este recordatorio) `useRecordatorioEtiquetas()` devuelve un no-op seguro — ningún caller
  necesita comprobar si hay Provider.
- **SE ROMPE SI** un módulo nuevo necesita el mismo patrón de «persistente hasta cambiar de módulo»: el Provider no
  es genérico a propósito (vive en `productos/layout.tsx`, no en `app/(app)/layout.tsx`) — copiar el patrón
  (Context + Provider en el `layout.tsx` del módulo), no generalizarlo a un Provider global, que perdería el
  desmontaje automático al cambiar de módulo.

## Consecuencias

- Sin migración ni RPC nueva: el ajuste de stock sigue siendo `ajustar_inventario`; el panel solo agrega una
  superficie más que lo invoca.
- `ProductoForm.tsx` pierde su `max-w-[1080px]` y gana el grid de dos columnas, igual que `FichaPrevia.tsx` de Nuevo
  producto — concordancia visual cumplida.
- Primer uso real del patrón «Context en el `layout.tsx` de un módulo, vive y muere con la navegación dentro de él»
  en este repo. **Regla para lo que viene:** un aviso que debe sobrevivir la navegación dentro de un módulo pero no
  cruzar a otro se hace así, no con `localStorage` ni estirando `Avisos.tsx`.

## No cubierto todavía

- El panel del taller no se probó con lector de pantalla.
- `RecordatorioEtiquetasProvider` no se probó con dos pestañas abiertas a la vez (cada pestaña tiene su propio
  Context — un ajuste en una no avisa a la otra; aceptable, es estado de la visita de esa pestaña).

## Cómo verificas tú

1. Abre Catálogo ▸ Productos ▸ Editar una prenda: a la derecha, el panel del taller con foto, swatches, stock por
   talla y precio.
2. Click en el lápiz de una talla: abre el `AjustarInventarioModal` real (mismo que en la lista de variantes).
3. Sube una talla con motivo «Reposición» y confirma: sale el toast «N variante(s) ajustada(s)» y, debajo de la
   cabecera, la franja «N prenda(s) nueva(s) sin etiquetar · color · talla».
4. Click en «← Productos» (o cualquier enlace del menú dentro de Productos): la franja sigue ahí.
5. Click en «Inventario» (u otro módulo) en el menú lateral: la franja desaparece.

## Actualización 2026-10-02 (tarde): la B tal cual, con el stepper

Felipe vio la ficha construida y dijo que no era la maqueta: «Quiero tal cual la maqueta B construida en local y así ir realizando los
cambios». Las decisiones 1 y 2 de arriba (lápiz al modal, lista agrupada por color) quedan **reemplazadas** por la maqueta
(`docs/maquetas/producto-editar-rediseno-2026-10/b-taller.html`):

- **Cuatro secciones plegables** (`SeccionFicha.tsx`): Producto, Tejido/patrón/estado, Fotos, Variantes y precios; ✓ en verde cuando
  no les falta nada, abiertas al entrar. Plegada, una sección no saca nada de la página (`visibility: hidden`), y quien lleva a un
  campo (la guía del panel, el foco de un error en `revisar()`) la abre antes. La decisión 3 de arriba (no plegar por la guía) se
  cumple así: se pliega, pero nunca se apunta a algo plegado.
- **La matriz color × talla** (`MatrizStockFicha.tsx`, reglas en `lib/matriz-ficha-reglas.ts` con su prueba): stepper −/N/+ en cada
  celda con el stock de HOY en el lugar que se ajusta, totales por color y por talla, el precio debajo (o el costo, si «Cambiar en
  bloque» está en Costo) que se toca para corregirlo y espera a «Revisar y guardar».
- **El stepper ES el ajuste de inventario, no un campo** (`useStockFicha.ts`): cada toque se junta en un lote (900 ms) y viaja por
  `ajustar_inventario` (ADR-0240) con el motivo, el lugar y el responsable de la visita («Registrar los ajustes de stock de esta visita
  como…»), sin el loader de pantalla completa (`x-espera: no`). Si la base dice que no o la respuesta no llega, se vuelve a leer el
  stock y nada se reenvía solo. La lectura es la MISMA del modal (`leerVariantesParaAjuste`): sigue habiendo una sola lectura de
  `stock` para ajustar (ADR-0270, `lib/stock-una-sola-cifra.test.ts`). Una talla que faltó en un conteo abre el modal (ADR-0291: no
  se adivina). Lo puesto en una variante NUEVA entra como stock inicial justo después de «Revisar y guardar», y la hoja lo dice.
- **Lo que la maqueta no muestra y el ERP necesita** (corregir color o talla, agregar talla, etiquetas, margen, desactivar) sigue en
  «Más de cada variante», plegado, con la misma `VariantesFicha` en modo `detalle`.
- **El panel** es el de la maqueta: foto del color con su nombre y «Cambiar foto» (sube con la revisión de siempre y queda como portada
  de ese color), colores de 28 px con el borde punteado quieto si no tienen foto (la maqueta lo hacía girar; un bucle no está permitido,
  ADR-0136), barras de stock por talla (verde, ámbar con 3 o menos, gris en 0) con su stepper, precio, «Falta …» que lleva al lugar.
- El recordatorio de etiquetas se entrega al SALIR de la ficha (al guardar y volver a Productos), no con cada toque: «luego de guardar
  los cambios, no antes».

Motivos del ajuste: los reales (`MOTIVOS_AJUSTE`: Reposición, Merma, Conteo físico, Otro), no los cuatro inventados de la maqueta; viene
elegido «Conteo físico», como en la maqueta.

## Actualización 2026-10-02 (noche): la tabla de «Unidades de hoy» y el stock que espera a guardar

Felipe pidió que «Variantes y precios» tenga **el diseño de «Unidades de hoy» de Nuevo producto**, con todo lo que Editar ya hace, y que
**el stock tocado con − / + muestre el botón de guardar**: «luego de guardados, el sistema te sugiere imprimir ese ticket en caso hayas
añadido cantidad». Eso reemplaza el punto «El stepper ES el ajuste de inventario, no un campo» de la actualización de la tarde:

- **La tabla** (`MatrizStockFicha.tsx`) es la de `MatrizCantidades`: cabecera y columna «Color» fijas, franja y punto del color,
  filas alternadas, la caja − N + (que también se escribe: `fijarCelda` en `lib/matriz-ficha-reglas.ts`), columna y fila «Total».
  Encima, las pestañas **Unidades de hoy · Precios · Costos** (Costos solo si la cuenta ve el dinero); en Precios y Costos va
  «Cambiar en bloque» sin su selector propio (lo decide la pestaña) y cada celda es una caja de precio o de costo. Se mantiene lo de
  Editar: variante nueva en ámbar punteado, el color que se toca para verlo en el panel, la talla que faltó en un conteo (su «+»
  abre el modal, ADR-0291) y lo que cambió en ámbar hasta guardarlo.
- **El stock espera a «Revisar y guardar»** (`useStockFicha.ts`): ya no hay lote a los 900 ms. Lo tocado cuenta en la barra
  («Tienes N cambios sin guardar»), va en la hoja como grupo «Stock» («S · Plateado 3 → 5», con el motivo y el lugar) y sale en UNA
  llamada a `ajustar_inventario` al confirmar, con el motivo, el lugar y el responsable de la visita (si falta el responsable,
  «Revisar y guardar» lo pide antes de abrir la hoja). Si solo cambió el stock, no se llama a `catalogo_actualizar_producto`.
  «Descartar» lo suelta (y «Deshacer» lo devuelve). Si la respuesta no llega, se relee la base y lo tocado se suelta (no se
  reenvía a ciegas); si la base dice que no, lo tocado queda para volver a guardar. El modal «Ajustar stock» sigue guardando al
  confirmarlo: es su propio formulario.
- **Etiquetas de lo que entró:** el aviso de «guardado» ofrece «Imprimir N etiquetas» y, al volver a Productos, queda la franja
  «prendas nuevas sin etiquetar». Las dos llevan a `/etiquetas-de-precio?unidades=id:n` (nuevo, `unidadesDeParam`): **una etiqueta
  por unidad que entró**, no por todo el stock de la talla (las que ya estaban en la tienda ya tienen la suya). La pantalla lo dice
  («Productos · Lo que entró», columna «Entraron») y vuelve a Productos.

Por qué cambió de opinión el diseño: con el guardado al instante, la barra de cambios no aparecía al tocar el stock y no había un
momento claro de «listo, guardé»; tampoco había dónde ofrecer las etiquetas. Ahora la ficha entera, stock incluido, se guarda con el
mismo gesto. Lo que se pierde: un ajuste ya no queda registrado si la persona cierra la pestaña sin guardar (la ficha lo pregunta
antes de salir, `useSalidaSinGuardar`, igual que con un precio).

Cómo verificarlo: en una ficha con stock, + dos veces en una talla y escribir un número en otra → barra «Tienes 2 cambios» → «Revisar y
guardar» → la hoja lista «Stock 2» con «3 → 5» → confirmar → aviso «stock ajustado en 2 tallas · Imprimir 4 etiquetas» y franja en
Productos → la página de etiquetas propone 2 + 2.

## Actualización 2026-10-03: todo se hace desde la matriz; «Más de cada variante» desaparece

Felipe pidió poder editar las **etiquetas de cada variante (una o todas)** y que la sección plegada «Más de cada variante» desaparezca:
«todo se debe poder hacer desde la tabla de arriba […] lo único que falta es poder borrar un color». Sin migración ni RPC nueva: cada
gesto cambia las filas de la ficha y viaja con «Revisar y guardar» (ADR-0257), como el precio.

- **Pestaña «Etiquetas»** en la matriz (`MatrizStockFicha.tsx`), junto a Unidades de hoy · Precios · Costos. Se elige UNA etiqueta
  (chips con su cuenta, «Nuevo 4/12») y cada celda es un ✓ que se toca para ponérsela o quitársela a esa talla; «Poner «X» en todas» /
  «Quitar «X» de todas» para las activas. Lo que cambió contra lo guardado lleva anillo ámbar. Reglas puras en
  `lib/matriz-ficha-reglas.ts` (`cuentaEtiqueta`, `ponerEtiqueta`, `etiquetaCambiada`, con prueba). Se guarda por la misma
  `actualizar_variantes_etiquetas` de siempre.
  DESCARTÉ un popover por celda con todas las etiquetas: una lista flotante dentro de una tabla con scroll pide `useDestinoFlotante` y
  esconde lo que importa (qué tallas llevan «Nuevo»). Con una etiqueta a la vez, la matriz entera responde «¿quién la lleva?» de un vistazo.
- **«⋯» de cada color** (`MenuAcciones` en la cabecera de la fila): «Corregir color (se registró mal)» y **«Quitar color»**. Quitar NO
  borra (regla de `CLAUDE.md`): las variantes que ya existen se desactivan y conservan stock e historia (`desactivarColor`); las nuevas
  simplemente no se crean; lo tocado en su stock se suelta (`useStockFicha.soltar`). Bajo la tabla queda «Rojo deja de venderse al
  guardar… · Deshacer» (`coloresQueSeQuitan`, `devolverColor`), con la advertencia si tiene unidades. Los colores que ya no se vendían
  se nombran («vuelven con + Agregar color», que los reactiva con su historia: `agregarCombinaciones`).
- **Lo que solo vivía en «Más de cada variante» no se pierde:** corregir una talla (lápiz en la cabecera de su columna), «+ Agregar
  talla» (al lado de «+ Agregar color»), el margen (debajo de cada costo, en Costos) y las correcciones pendientes con su «Deshacer»
  («Se corrige al guardar: Talla S → XS (4 colores)», `correccionesPendientes`). El texto del costo fijo vuelve a decir la verdad
  cuando no se pudo comprobar (`textosCostoFijo`; la matriz tenía «viene de compras» escrito a mano).
- **Lo que sí se pierde, a propósito:** reactivar UNA talla suelta de un color que sigue a la venta (ahora es «+ Agregar talla», que
  la reactiva) y el detalle por fila («Antes: Gris XS», «Precio: antes S/ 90»): la matriz marca en ámbar lo que cambió y la hoja de
  «Revisar y guardar» lo lista con su antes.
- `VariantesFicha.tsx` se borra; con él, las reglas que solo él usaba (`agruparPorColor`, `quitarNueva`, `textoSedes`,
  `avisoDesactivar`, `cambiosDeVariante`, `textoPendienteDeVariante`; lo exige `lib/reglas-sin-uso.test.ts`).
- **SE ROMPE SI** alguien agrega a la matriz un gesto que guarda al instante (un «Quitar color» que llame a la base): la ficha entera
  se guarda con UN gesto y se deshace hasta entonces; el stock de la matriz ya pasó por eso (actualización de la noche del 2026-10-02).

Verificado en local (puerto 3070, «Blazer Demo Franja», 4 colores × 3 tallas): Etiquetas → «Nuevo» en todas, quitado en Rojo M →
barra «11 cambios» → hoja con las 11 líneas → guardado (11 filas en `variante_etiquetas`) y revertido igual (0). «Quitar color» Rojo →
la línea con 9 u. → «Deshacer». Lápiz de la talla S → «Corregir talla» a XS → línea «Talla S → XS (4 colores)» → «Deshacer». Costos con
margen. A 375 px las cuatro pestañas caben (303/303 px) y la página no se desplaza de lado. `tsc`, `eslint` y las 312 pruebas en verde.

### Segunda vuelta del 2026-10-03 (Felipe vio la primera en local)

- **Quitar un color suelta lo que se le tocó (opción B).** Precio, costo y etiquetas tocados en la visita vuelven a lo guardado
  (`quitarColor` de `lib/matriz-ficha-reglas.ts`, que reemplaza a `desactivarColor`). Así, si ese color vuelve meses después con
  «+ Agregar color», no vuelve con un precio o un «Nuevo» de una visita que nadie recuerda, y la hoja no pide confirmar líneas sobre un
  color que se está quitando. Lo que se pierde: «Deshacer» la vuelve a la venta tal como está guardada, sin esos toques.
- **Lápiz y tacho en vez del «⋯».** Cada color lleva dos botones a la vista: lápiz (corregir el color) y tacho en `rojo-profundo` (el
  token de lo destructivo, no el acento `rojo` de la marca). Un lápiz bloqueado (ya se vendió y no eres líder) no se apaga en silencio:
  al tocarlo dice por qué (`aria-disabled` + aviso), porque un `title` no llega al celular.
- **Al entrar, todo plegado menos «Variantes y precios»**, que es lo que más se usa. Llegar con `#fotos` (el éxito de Nuevo producto)
  abre también Fotos, y la guía («Falta …») abre la sección a la que lleva, como ya hacía.
- **Las etiquetas, debajo de la tabla y dibujadas como en Atributos** (`EtiquetasDeLaMatriz.tsx`: `MuestraEtiqueta`, los grupos de
  `lib/etiqueta-grupos.ts`, «2 de 12 tallas» y una barra que se llena). La celda que la lleva se pinta con el tono de su grupo. Al abrir
  la pestaña, la vista baja hasta la tabla para que se vean la tabla y las tarjetas juntas. La página trae `etiquetas.estilo`.
- **«Etiquetas de lo que entró»** (`ImprimirLoQueEntro.tsx`): al terminar un guardado en que entraron unidades (una talla que subió o
  un color nuevo con stock) y sin correcciones, sale una hoja grande en vez del botón chico del aviso: la cifra que cuenta, el «visto»
  que se dibuja y una etiqueta de papel por talla (color, talla, precio, sus etiquetas comerciales, «× 2») que sale de la ranura de la
  impresora. «Imprimir N etiquetas» lleva a `/etiquetas-de-precio?unidades=…` (una por unidad que entró); «Más tarde» vuelve a Productos,
  donde sigue la franja del recordatorio. Tras una corrección de color o talla se reimprime todo: eso sigue en el aviso.
  Movimiento: solo respuesta al guardado (ADR-0136): cada pieza entre 200 y 500 ms, sin rebote ni bucle, quieto con reduced-motion. Felipe
  pidió «muchas animaciones»; las que la regla no permite (en bucle o decorativas) no se hicieron.

Verificado en local: Etiquetas «Nuevo» en todas → Rojo con tacho → la hoja lista 9 etiquetas y ninguna de Rojo. +2 Blanco S y +1 Verde L
→ guardar → aviso y hoja «3 etiquetas por imprimir» con dos etiquetas (× 2, × 1) → «Imprimir» abre `/etiquetas-de-precio?unidades=…:2,…:1`.
El stock de prueba se devolvió (−2, −1; al bajar no sale la hoja). A 375 px, lápiz, tacho y tarjetas caben sin desplazamiento lateral.

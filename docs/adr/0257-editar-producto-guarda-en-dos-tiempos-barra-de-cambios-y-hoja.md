# ADR-0257 — Editar producto guarda en dos tiempos: la barra «Tienes N cambios sin guardar» y la hoja «Revisa y guarda los cambios»

**Fecha:** 2026-09-28
**Estado:** Construido y verificado en local, sin migración: navegador a 1.440, 820 y 375 px; guardado real contra la base local (un
precio cambiado y devuelto), rechazo por versión vieja (ADR-0193), botón Atrás, enlaces del menú, deshacer por fila y por campo;
`tsc`, `eslint` y la suite de `apps/web` en verde. **PR abierto, sin fusionar a `main`** (fusionar publica la pantalla en las
tablets de las tiendas: lo decide Felipe).
**Decide:** Felipe, 2026-09-28. Pidió mejorar «Editar producto» porque una colaboradora desactiva una talla o cambia un precio y no
sabe qué paso sigue, ni si se guardó, y puede salirse y perder lo hecho. Respondió dos preguntas (`AskUserQuestion`): al salir con
cambios, **«Preguntar antes de perder»**; al guardar, **«Aviso detallado y volver»**. Las otras dos las pidió ver: el spike
`docs/maquetas/producto-guardar-cambios-2026-09/` y, con él delante, eligió **«1 · A · Barra fija»** y **«2 · A · Hoja al guardar»**.
**Sobre:** ADR-0161 y ADR-0162 (el responsable de cada operación), ADR-0193 (versión: «otra persona cambió esto»), ADR-0136 (los
modales y la hoja), ADR-0111 (`BarraFija`), ADR-0149 (el loader global) y `ConfirmarConResponsable` (Catálogo, Felipe 2026-09-23).

## Contexto

`ProductoForm.tsx` editaba la ficha en pantalla y guardaba con un panel «Guardar cambios» a la derecha. Cuatro causas hacían que se
perdiera lo hecho, todas verificadas en el código de entonces:

1. **Lo que se toca no se marca.** Un interruptor «Activa» o un precio solo cambian en pantalla; nada dice «pendiente». Un interruptor
   parece una acción que ya ocurrió.
2. **El botón gris no explica nada.** «Guardar cambios» esperaba al «Responsable» y el único motivo era una línea chica bajo el combo.
3. **Se sale sin preguntar.** «Cancelar» y el menú lateral navegaban directo.
4. **En la tablet el panel cae al final de la página** (`lg:sticky`): solo se pegaba a la pantalla en un escritorio ancho.

## Decisiones

**1. Lo pendiente se dice donde se toca y en una barra que no se va de la vista.**
- DECIDÍ: cada variante tocada se marca en **ámbar** con lo que va a pasar («Se desactiva al guardar», «Precio: antes S/ 90») y un
  «↺ Deshacer»; cada dato de la prenda cambiado dice «antes: X · Deshacer» en el pie de su campo. Abajo, una `BarraFija` con
  `visible` (sube 420 ms, baja 240): «Tienes 3 cambios sin guardar. Aún no se guardó nada. Cuando termines, pulsa «Revisar y
  guardar»», con [Descartar] y [Revisar y guardar]. El panel de la derecha **desaparece**: la barra es el único camino para guardar.
- Ámbar y no rojo: la paleta reserva el ámbar para «en proceso», y el rojo ya lo pintan los interruptores encendidos.
- DESCARTÉ el panel vivo (B) —solo se ve desde 1280 px— y la franja de arriba (C) —desaparece en cuanto se baja a las tallas—.
  La barra es la única que se ve en la tablet de la tienda, y el ERP ya usa ese patrón en Recibir y Por pagar.
- **SE ROMPE SI** se agrega un campo editable que la cuenta de cambios no mira: la barra no aparece y no hay cómo guardar. Por eso
  `lib/producto-cambios-reglas.ts` lleva `CAMPOS_CUBIERTOS: Record<keyof FichaEditable, true>` (agregar un campo a la ficha sin
  decidir cómo se compara **no compila**) y una prueba que recorre cada clave y verifica que un cambio en ella suba el conteo.

**2. «Revisar y guardar» abre una hoja; ahí se elige quién hace la operación.**
- DECIDÍ: la hoja «Revisa y guarda los cambios» (`ConfirmarCambios.tsx`, `<Modal variante="hoja">`) lista lo que va a cambiar,
  agrupado (se desactivan, se activan, se agregan, precios, costos, etiquetas, fotos, datos de la prenda, temporada por color), con
  el combo «Responsable» adentro y [Volver a editar] /
  [Confirmar y guardar]. Con una cuenta de persona, el combo trae su nombre (o «Eres admin: no necesitas autorización») y son dos
  toques; en la tablet de la tienda, elegir quién es, que ya era obligatorio (ADR-0161/0162). Es el mismo patrón que Felipe aprobó
  para Catálogo el 23-sep.
- La hoja se cierra si guardó bien, o si lo que falló se arregla en la ficha (un nombre repetido, una versión vieja). **Se queda
  abierta solo si falló por el responsable** (dejó de estar de turno): ahí se elige a otra persona sin perder el lugar.
- «Revisar y guardar» valida primero lo que la base exigiría igual (referencia, variante con precio, stock mínimo, marca y proveedor,
  tejido y patrón que ya tenía) y enfoca el campo: la hoja solo se abre con todo en orden.

**3. Salir con cambios pregunta.** Se reutiliza `useSalidaSinGuardar` (`components/ui/useSalidaSinGuardar.tsx`, el mismo de Compras,
Recibir y Nuevo producto): enlaces del ERP, «← Productos», Atrás y cerrar la pestaña. Solo se le da la frase propia
(`textoDeSalidaDeFicha`: «Tienes 3 cambios sin guardar en «Camisa Lino». Si sales ahora, se pierden.»). Cerrar la pestaña muestra el
aviso del navegador, cuyo texto no se puede cambiar.
- Esta rama había construido su propio aviso (`AvisoDeSalida`); el mismo día otra sesión fusionó el de `main` (PR #560). Se **borró el
  duplicado** y se conservó el de `main`, que es el que ya usan las otras pantallas.

**4. Al guardar, el aviso dice qué quedó hecho y quién lo firmó, y se vuelve a Productos.** «Blusa Valentina guardado» y, debajo,
«Por Rosa · 1 variante desactivada, 1 precio cambiado» (`avisar.exito` con `detalle`; las frases salen de la misma cuenta que la hoja,
`frasesPasado`). Después `router.replace("/productos")` + `router.refresh()`, igual que antes.

**5. «Descartar» no pregunta; ofrece «Deshacer» 7 s.** Un mensaje más antes de descartar sería otro paso; el aviso «Cambios
descartados · Deshacer» alcanza para arrepentirse. Si ya se guardó algo (el guardado principal salió y una etiqueta o la temporada por
color falló), la foto de «al abrir» ya no es lo que tiene la base: «Descartar» recarga en vez de volver a ella.

**6. Versión vieja (ADR-0193).** Si otra persona guardó la prenda mientras se editaba, la base contesta `PT409`: la hoja se cierra, lo
escrito **sigue a la vista** y la barra cambia: «Otra persona cambió esta prenda mientras la editabas…» con [Recargar la prenda] en
lugar de guardar (guardar de nuevo chocaría igual).

## Cómo se compara (`lib/producto-cambios-reglas.ts`)

Función pura `resumenDeCambios(inicial, actual, nombres)`. Los números se comparan como números («90» = «90.00»), un vacío **no** es
cero, las etiquetas como conjuntos, las fotos por `id ?? url` (agregada, quitada, principal, color, orden) y las variantes por `id`;
una fila nueva es UN cambio («Se agrega al guardar»). Comparar contra lo de «al abrir» (`useState(capturar)`) y no contra un
indicador de «tocado» hace que deshacer a mano un cambio apague la barra sola.

## Consecuencias

- Sin migración ni RPC nueva: el guardado sigue siendo `catalogo_actualizar_producto` y, después, `actualizar_variantes_etiquetas` y
  `asignar_temporadas`, en el mismo gesto.
- La ficha, sin el panel de la derecha, se limita a **1080 px** de ancho (`max-w-[1080px]`) para que las filas no se estiren. Es la
  medida del spike; si Felipe la prefiere a todo el ancho, es una línea.
- Nueva pieza reutilizable: `BarraFija` gana `resumenMinimo` (piso de ancho del resumen; en una tablet con el lateral abierto la barra
  mide ~550 px y sin piso el mensaje se aplastaba contra los botones).
- **Regla para lo que viene:** un formulario de edición largo (Proveedor, Cuenta, Colaborador…) que guarda al final se hace igual: lo
  pendiente marcado donde se toca + barra fija + hoja al guardar. No se copia esta pantalla: se copian `resumenDeCambios` como
  patrón, `BarraDeCambios`, `ConfirmarCambios` y `useSalidaSinGuardar`.

## No cubierto todavía

- **Probar en una tablet real** el botón Atrás y el aviso de cerrar la pestaña (en el escritorio funcionan; el gesto de Atrás del
  teléfono no se pudo ejercitar).
- Lector de pantalla: la barra tiene `role="status"` y, oculta, `aria-hidden` + `inert`, pero no se probó con uno.
- Tras guardar, «Atrás» vuelve a la ficha (ya estaba así antes de este cambio, porque el guardado hace `router.replace`). Medido en
  local: la ficha que reaparece trae lo guardado, no lo viejo. Si un día mostrara datos viejos, guardar de nuevo lo frena la versión
  (decisión 6).

## Cómo verificas tú

1. Abre una prenda en Catálogo ▸ Productos ▸ Editar. Sin tocar nada, no hay barra.
2. Apaga una talla y cambia un precio: sube la barra «Tienes 2 cambios sin guardar» y las dos filas se marcan en ámbar.
3. Pulsa «Revisar y guardar»: la hoja lista los dos cambios y pide el responsable. «Confirmar y guardar» te lleva a Productos con el
   aviso «… guardado · Por … · 1 variante desactivada, 1 precio cambiado».
4. Vuelve a editar, cambia algo y toca el menú lateral o «Atrás»: pregunta «¿Salir sin guardar?». «Seguir editando» no pierde nada.
5. «Descartar» devuelve todo y el aviso ofrece «Deshacer».

# ADR-0305 — Editar producto usa el ancho que dejó libre ADR-0257: el panel del taller

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

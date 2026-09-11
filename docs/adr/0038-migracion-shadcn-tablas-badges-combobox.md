# ADR-0038 — Migración a shadcn: tablas, badges, tooltip y combobox — sin tocar la pistola

**Fecha:** 2026-09-11
**Estado:** Construido y verificado en local con datos reales (login real, Supabase local
reseteado desde cero, `tsc`/`eslint`/`vitest` (227 tests) y `next build` limpios).
**Deriva de:** ADR-0037 (el puente de tokens que hizo posible esto).
**Afecta:** ~20 archivos con `<table>` cruda, ~9 con pastillas de estado, `Ayuda.tsx`, y 5
buscadores (`RegistrarVentaModal.tsx`, `ConteoPanel.tsx`, `RecibirLoteForm.tsx`,
`OrdenesProduccion.tsx`, `EtiquetasGenerator.tsx`). Nuevo: `components/ui/{badge,table,
popover,command}.tsx`.

## Contexto

Con shadcn ya configurado (ADR-0037) pero sin un solo componente instalado, Felipe pidió
auditar toda la app y reemplazar lo que tuviera sentido. Un agente de exploración
(read-only) catalogó el repo entero y encontró el patrón repetido: ~20 archivos con
`<table>` a mano (mismo `className` copiado letra por letra), ~9 con la misma pastilla de
estado (`rounded-full border ... verde/ambar/rojo`), una sola implementación de tooltip
sin colisión de viewport (`Ayuda.tsx`), y 5 buscadores con "escribe, filtra, elige" que
iban de un combobox ARIA completo a mano hasta un `<input>` con `onChange` simple.

## Lo que se hizo

### Table, Badge, Popover — mecánico, verificado con datos reales

`Table`/`TableHeader`/`TableBody`/`TableRow`/`TableHead`/`TableCell` reemplazan `<table>`
en los ~20 archivos, conservando el `className` exacto de cada celda (alineación,
`tabular-nums`, colores). Dos ajustes a la base generada por el CLI, no a cada tabla:
quitar `whitespace-nowrap`/`h-10` por defecto (las tablas de CAYLA envuelven texto —
justificaciones, descripciones — y cada una ya trae su propio padding) y no forzar
`border-b` en header/filas (la convención de este repo es `divide-y` en el `tbody`;
forzarlo también habría duplicado la línea entre filas).

`Badge` centraliza la pastilla repetida en 9 archivos con 4 variantes: `verde`/`ambar` usan
el color "-profundo" para el texto (no el base — `text-verde` sobre `bg-verde/10` reprueba
contraste AA, es la misma razón por la que existen esos tokens en `globals.css`), `rojo` es
nuevo (tinte para "malo/rechazado", distinto de `destructive` que es el rojo-profundo
sólido para acciones). De paso se corrigieron dos bugs de deriva de marca reales: el chip
de stock en `producto/[varianteId]/page.tsx` usaba `bg-red-50`/`text-neutral-600` (Tailwind
crudo, no un token CAYLA) y el historial de movimientos de esa misma página usaba
`text-neutral-900`/`border-neutral-200`/`bg-white` en vez de tinta/sand/papel.

`Ayuda.tsx` pasó de un `span` + `useState` + listeners de `mousedown`/`Escape` a mano a
`Popover` de Radix: mismo ícono "!", misma animación `anim-globo`, pero ahora con
colisión/flip de viewport y `aria-expanded`/`aria-controls` reales en vez de un botón que
solo reacciona a click.

Verificado en el navegador con datos reales (no solo el estado vacío): "Qué reponer ya" y
"Rotación por familia" en Comercial, "Registrar gasto" en Finanzas, el Popover de Ayuda
abriendo sin desbordar el viewport.

### El combobox: 2 de 5 buscadores se dejaron intactos, a propósito

Leer el código real (no el resumen de la auditoría) encontró algo que cambiaba la
recomendación: `RegistrarVentaModal.tsx` y `ConteoPanel.tsx` tienen su Enter cableado para
la pistola de código de barras — coincidencia EXACTA de código primero, después la lista
filtrada, nunca un envío de formulario. `cmdk` (la librería detrás de `Command`)
intercepta Enter/flechas para su propia selección, exactamente el mismo tipo de teclado
que estos dos archivos ya resuelven a mano con el caso especial que a `cmdk` le falta.
Presentado el trade-off, Felipe decidió migrar los 5 igual, asumiendo el riesgo — y con
eso en la mesa, el diseño de cada uno se ajustó a lo que realmente necesitaba:

- **`RecibirLoteForm.tsx`, `OrdenesProduccion.tsx`, `EtiquetasGenerator.tsx`** — sin
  restricción de escáner (`onChange` simple, sin `onKeyDown` previo). `Command` +
  `CommandPrimitive.Input` (el input crudo de `cmdk`, no el `CommandInput` de shadcn —
  ese trae un ícono de lupa y un borde que no calzan con el campo CAYLA) controlando
  filtrado y resaltado; cmdk se encarga de las flechas y de Enter solo, sin código nuevo.
  `EtiquetasGenerator` tiene dos acciones por fila (elegir una prenda, o "+ el modelo" para
  sus hermanas) — el botón secundario lleva `stopPropagation` en su `onClick`, sin eso el
  click también dispara el `onSelect` del `CommandItem` que lo envuelve y agrega la
  variante suelta de más.

- **`RegistrarVentaModal.tsx`** — si migró, pero con `shouldFilter={false}` (el filtro real
  sigue siendo el `useMemo` que ya existía) y un `onKeyDown` propio en el input que
  intercepta Enter ANTES que `cmdk` (`preventDefault` + `stopPropagation`): coincidencia
  exacta de SKU primero, si no hay, el resaltado que `cmdk` ya trae en su propio estado
  (`value`/`onValueChange`). Las flechas las mueve `cmdk` solo — se pudo borrar el `activo`
  numérico y su aritmética de índices que el código de antes llevaba a mano.

- **`ConteoPanel.tsx`** — el buscador (`<input>` dentro de `<form onSubmit={resolver}>`)
  **se dejó completamente intacto**. Envolverlo en `Command` habría hecho que `cmdk`
  interceptara el Enter que hoy dispara `resolver()` vía submit nativo — exactamente lo que
  hace escaneable el censo. Solo la lista de "varias coincidencias" (un camino secundario,
  no el de un escaneo con código exacto) pasó a `Command`/`CommandItem`, sin tocar el input
  ni el submit: gana semántica de `listbox`/`option` sin arriesgar nada.

**Verificado con teclado real, no supuesto** (equivalente exacto a lo que hace una pistola:
tipear y mandar Enter): en `RegistrarVentaModal`, escribir "blusa" resaltó el primer
resultado solo, `ArrowDown` lo movió, `Enter` agregó el resaltado; escribir el SKU exacto
completo (`DEMO-BLU-S`) y `Enter` agregó esa prenda. En `RecibirLoteForm` y
`EtiquetasGenerator`, `ArrowDown`+`Enter` seleccionó correctamente, y en este último el
botón "+ el modelo" agregó las 3 hermanas sin duplicar la fila madre.

## El hallazgo que no estaba en el plan: Escape en un Modal con `cmdk` no cerraba nada — y el original tampoco lo hacía bien

Probando Escape con texto escrito en `RegistrarVentaModal` (debía limpiar la búsqueda, no
cerrar el modal — así lo pedía el comentario original), el modal se cerró igual pese a
`e.preventDefault(); e.stopPropagation()` en el `onKeyDown` del input. Causa raíz, medida
con el código fuente de Radix (`@radix-ui/react-use-escape-keydown`), no supuesta:

```js
ownerDocument.addEventListener("keydown", handleKeyDown, { capture: true });
```

Radix escucha Escape con un listener de **captura** sobre `document`. La fase de captura
corre de arriba hacia abajo ANTES de que el evento llegue al `<input>` y dispare cualquier
`onKeyDown` normal (fase de burbuja). Para cuando mi handler llamaba `preventDefault()`,
Radix ya había visto el Escape y decidido cerrar — `stopPropagation()` en una fase
posterior no puede desactivar un listener que ya corrió antes, en una fase distinta.

**Esto no lo introdujo `cmdk`: es un defecto que ya vivía en el código anterior**, solo que
nadie lo había probado con un teclado real — el comentario del código decía que
funcionaba, pero la mecánica en la que confiaba (bubble-phase `stopPropagation`) nunca
podía ganarle a un listener de captura. Arreglado con el gancho que Radix expone para
exactamente este caso: `Dialog.Content` acepta `onEscapeKeyDown`, que si llama
`preventDefault()` sí frena el cierre (corre dentro del mismo callback de Radix, antes de
que decida cerrar — no depende de fases de evento). Se agregó `onEscapeKeyDown` como prop
opcional de `components/ui/Modal.tsx`, y `RegistrarVentaModal` lo usa para limpiar la
búsqueda cuando hay texto y dejar pasar el cierre cuando no.

**Verificado con las dos ramas**: Escape con texto → limpia y el modal queda abierto;
Escape con la búsqueda ya vacía → cierra, como siempre.

## Consecuencias

- Cualquier otro modal de este repo que alguna vez necesite "Escape hace algo especial
  antes de cerrar" tiene ahora el prop `onEscapeKeyDown` de `Modal.tsx` listo para usar —
  antes no existía el camino correcto para eso.
- `ConteoPanel.tsx` y la mitad de `RegistrarVentaModal.tsx` (el manejo de Enter) siguen
  siendo código a mano, a propósito: son los dos lugares donde `cmdk` pelearía contra un
  contrato de hardware real (la pistola), no una preferencia estética.
- No se tocó `Desplegable`/`Boton`/`Campo` de `campos.tsx` (fuera de alcance, decisión de
  ADR-0037) ni el menú "+ Nuevo" de `AppShell.tsx` (animación y typeahead de marca
  entretejidos, según la auditoría original).
- `/produccion` sigue roto en local por un bug de esquema pre-existente
  (`productos_1.material does not exist`, sin relación con esta migración, ya anotado
  aparte) — no se pudo probar `OrdenesProduccion` en vivo por esa causa; su patrón de
  búsqueda es idéntico, ya probado, al de `RecibirLoteForm`/`EtiquetasGenerator`.

## Cómo se verificó

`Supabase local` reseteado desde cero (`npx supabase db reset`, todas las migraciones
0001-0057), login real, `.env.local` apuntando al stack local. `tsc --noEmit`, `eslint .`
y `vitest run` (227 tests, 15 archivos) limpios después de cada archivo tocado — no al
final. `next build` completo compiló las 43 rutas sin errores. Interacción real en
navegador con datos reales de venta/catálogo (no solo estados vacíos): tablas con filas,
badges con las 4 variantes, Popover sin desbordar viewport, y los 5 recorridos de teclado
del combobox descritos arriba, incluida la reproducción exacta del bug de Escape antes y
después del arreglo.

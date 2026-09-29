# ADR-0262 · Catálogo: cabecera de Ventas, Vista rápida y «Desactivar» en la tarjeta

- **Fecha:** 2026-09-29 · **Estado:** aceptado. Solo web, **sin migración** (los dos endpoints que hacía falta
  tocar — `PATCH /api/productos/tallas` y `PATCH /api/productos/tejidos|patrones` — ya aceptaban `valor`/`nombre`;
  solo faltaba la pantalla).
- **Pedido:** Felipe, 2026-09-28/29: estandarizar los submódulos de Catálogo — no solo Productos (ya resuelto por
  ADR-0254) sino Categorías, Marcas y las 6 pestañas de Atributos. Primero un spike visual para aprobar, después
  el código. Spike: `docs/maquetas/catalogo-submodulos-2026-09-28/` (3 archivos: comparación de cabeceras,
  inconsistencias de listado/editar/agregar leídas del código real, y la propuesta final aprobada).
- **Complementa:** ADR-0220/0254 (cabecera de Ventas/Inventario/Productos), ADR-0261 (kit compartido de las 6
  pestañas de Atributos — este ADR solo toca lo que quedaba fuera de esa unificación: la cabecera de página y el
  paso «Vista rápida» antes de editar).

## Qué había

Con el spike visual (`docs/maquetas/catalogo-submodulos-2026-09-28/`) se compararon Productos (ya con
`EncabezadoPagina`, ADR-0254) contra Categorías, Marcas y Atributos, y el listado/editar/agregar de las tres:

1. **Cabecera de página:** Categorías, Marcas y Atributos seguían con el patrón viejo (`label-cayla` + `<h1>` de
   24px + `<Ayuda>`), sin sede/hora ni la jerarquía visual que ya tiene Productos.
2. **Alta de Marcas era la única que no usaba `<Modal>`:** un panel que aparecía inline bajo el buscador
   (`NuevaMarcaForm` sin envoltorio), mientras su propio «Editar» y el resto de Catálogo sí abren una hoja con
   velo (ADR-0136).
3. **Solo Categorías anteponía una «Vista rápida»** antes de entrar a Editar; Marcas y las 5 pestañas de
   vocabulario de Atributos (Colores, Tallas, Etiquetas — Tejidos y Patrones ya tenían su propio detalle,
   ADR-0256) iban directo al formulario de edición.
4. **«Editar nombre» no existía en Tallas, Tejidos ni Patrones** — solo Desactivar/Reactivar; un valor mal
   tipeado se corregía desactivando y creando de nuevo (perdiendo el historial de uso).
5. **«Desactivar» vivía en dos lugares distintos:** dentro del modal de Editar en Categorías y Colores (con un
   segundo clic de confirmación propio en Colores); suelto en la tarjeta (al pasar el mouse, `DesactivarTarjeta`
   del kit) en Marcas, Tallas, Tejidos, Patrones y Etiquetas.

## Decisión

Felipe eligió, sobre el spike:

1. **Cabecera:** `EncabezadoPagina` (sede + hora, título 46px, subtítulo) en Categorías, Marcas y Atributos —
   mismo patrón que Productos/Ventas/Inventario. Las cifras que ya se calculaban (categorías activas, productos
   clasificados; marcas activas, proveedores vinculados) bajan a una línea de texto en el `pie` de la cabecera,
   no a tarjetas `TarjetaCifra` — cambio chico, la lista de abajo no se toca.
2. **Alta de Marcas pasa a `<Modal>`:** `NuevaMarcaForm` ahora acepta `dentroDeModal` (sin su caja/título propios
   cuando lo llama Marcas; el selector de Nuevo producto lo sigue usando inline, sin ese prop).
3. **Vista rápida en las tres.** Nuevo componente compartido `VistaRapidaAtributo` en `components/atributos/kit.tsx`
   (mismo molde que `VistaRapidaCategoria`: título, `muestra`, detalle libre, un botón de acción y «Cerrar») —
   usado por Colores, Tallas y Etiquetas. Marcas tiene el suyo propio (`VistaRapidaMarca` en `MarcasLista.tsx`,
   fuera del kit de Atributos porque Marcas no es una de sus 6 pestañas). Tejidos y Patrones ya cumplían esto con
   `DetalleMuestraModal` (ADR-0256): no se tocó su mecanismo, solo se le agregó el botón de abajo.
4. **«Editar nombre»** se agregó a Tallas (modal nuevo, un campo) y a Tejidos/Patrones (botón «Editar nombre»
   dentro de `DetalleMuestraModal`, que ya comparten). Los tres llaman al mismo endpoint PATCH que ya aceptaba el
   campo — no hizo falta ninguna migración.
5. **«Desactivar» siempre en la tarjeta**, nunca dentro del modal de Editar: se sacó de Categorías
   (`TarjetaCategoria` ahora es un `<div>` con un botón interno que abre Vista rápida + `DesactivarTarjeta` al
   pie, en vez de ser ella misma un único `<button>`) y de Colores (`ColorEditarModal` perdió su «¿Ya no se usa
   este color?» con doble clic; `desactivar()` subió a `ColoresLista` con el mismo patrón
   `ConfirmarConResponsable` que ya usan aprobar/reactivar).
6. **Temporadas queda fuera** — no es una tarjeta que se edita, es el calendario fijo de 9 de ADR-0246; no tiene
   «Agregar» ni «Editar nombre» que unificar.

- **DECIDÍ:** un componente de Vista rápida compartido para las pestañas de Atributos y uno propio para Marcas
  (no forzar a Marcas a depender del kit de Atributos, del que no es parte), y reusar los endpoints existentes
  en vez de tocar la base.
- **DESCARTÉ:** subir las cifras de Categorías/Marcas a `TarjetaCifra` (Opción B del spike) — más piezas nuevas
  sin que Felipe lo pidiera; y unificar la Vista rápida de Tejidos/Patrones con el resto — ya tenían la suya
  (`DetalleMuestraModal`) y agregar una capa encima habría sido dos pasos para llegar al mismo lugar.
- **SE ROMPE SI:** alguien vuelve a poner un botón de acción rápida («Editar», «Configurar campaña») directo en
  el pie de una tarjeta que ya tiene `abrir` — la Vista rápida deja de ser el único camino y las pantallas se
  desalinean otra vez.

## Cómo se verificó

Los componentes reales (no una reconstrucción aparte) montados en una ruta de prueba temporal
(`app/auth/prueba-catalogo-real`, sin sesión, con `AppShell` real y datos de ejemplo — borrada al cerrar, no se
commitea) — con eso se probó cada clic: tarjeta → Vista rápida → Editar en Categorías/Marcas/Colores/Tallas/
Etiquetas, y «Editar nombre» en Tallas/Tejidos/Patrones. `npx tsc --noEmit`, `eslint` y `vitest run` (220
archivos, 152 473 pruebas) en verde.

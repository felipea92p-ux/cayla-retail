# ADR-0173 — Apartados con la guía oficial: el tablero es la portada, Apartar es un flujo y Entregar un modal

> **Número:** nació como ADR-0172; al traer `main` ese número ya lo usaban Colaboradores y Traslados, así que pasó a 0173.

**Fecha:** 2026-09-22 · **Estado:** aceptado (Felipe, 2026-09-22) · **Sin migraciones** · **Sobre:** ADR-0166 (pantallas de Apartados),
ADR-0169 (paleta y orden oficial de pantalla), ADR-0136 (modales) · **Demo:** `docs/maquetas/apartados-rediseno-2026-09/demo.html`

## El problema primero

`/vender/apartados` eran tres pestañas en una sola hoja: **Apartar** (abría por defecto), **Entregar** y **Todos**. En una tienda con poco
movimiento, que es lo normal, dos de las tres abrían en un estado vacío («Nada por apartar todavía», «No hay apartados por recoger»). Lo que
pide acción hoy (un vencido, un adelanto por devolver, lo que vence mañana) solo se veía entrando a «Todos». Además, Entregar y Todos tenían
**cada una su buscador de clientas**, y los dos encontraban lo mismo.

**Analogía CAYLA:** es como que la encargada de sede, al llegar, abra primero la caja registradora vacía en vez de mirar la repisa de bolsas
apartadas con sus fechas. La repisa es lo que dice qué hay que hacer hoy.

## Decisión (Felipe, sobre la demo)

La demo mostró 3 estructuras × 2 listas × 2 formas de cobrar, con escenarios de día normal, tienda vacía y caja cerrada. Felipe eligió:

1. **Tablero + flujo.** La portada es el tablero, en el orden oficial: `CabeceraPantalla` («Ventas» → «Apartados · Tienda …» → bajada, con
   **«+ Nuevo apartado»** como única acción primaria) → franjas (caja cerrada en ámbar; apartados que se liberaron solos en rojo) → cuatro
   `TarjetaCifra` (Por recoger, En custodia, Por devolver, Vencen en 2 días) → **una** tarjeta con píldoras, buscador en caja y la lista →
   nota en hueso (`TableroApartados.tsx`).
2. **Lista agrupada por urgencia** («Hoy, sin falta / Vencen pronto / A tiempo / Cerrados»), no la tabla: los bloques ya dicen por dónde
   empezar. Abre en «Necesitan algo» si hay algo; si no, en «Por recoger» (un tablero que abre en «Todo al día» escondiendo lo vigente
   obliga a un clic para ver lo único que hay).
3. **Entregar en un `<Modal>`** desde cada fila (`EntregarModal.tsx`), como ya eran Devolver, Liberar y +7 días.
4. **Condición de Felipe: el ticket de Apartar y la hoja de cobro del saldo conservan su diseño y sus animaciones.** Por eso `ApartarVista`
   no se tocó (solo el botón «Buscar apartado» pasó a opcional: en el flujo no se dibuja), y el modal de entrega es la misma hoja de la
   pestaña Entregar —la clienta, la línea de tiempo, las prendas y el panel «Saldo» con medios, billetes, vuelto y el botón negro—, sin su
   buscador.

El estado de cada apartado pasa a la insignia oficial (`Chip`): **pizarra** en plazo (informativo, no semáforo), **ámbar** por vencer,
**rojo** para vencido (con el punto vivo, la única animación en bucle permitida) y por devolver, **neutro** cerrado.

## Descarté

- **Tres pestañas, solo visual** (el criterio de Inventario en ADR-0169): sin reaprendizaje, pero dejaba los estados vacíos y los dos
  buscadores.
- **Pestañas con cifras fijas:** la custodia siempre a la vista, pero las cifras empujaban el escáner de Apartar hacia abajo.
- **Tabla oficial con franja de atención:** se lee en columnas, pero Felipe prefirió que la urgencia sea la estructura.
- **Hoja de dos columnas para entregar:** más espacio, pero una vista más de la que hay que volver.

## Se rompe si

- Alguien vuelve a poner un buscador de clientas dentro del modal de entrega: vuelven a ser dos.
- Se agrega un segundo botón primario a la cabecera: la acción principal es una sola.
- `ApartarVista` se rediseña «de paso» en otra pantalla: Felipe pidió conservarla tal cual.

## Cómo se verificó

`tsc`, `eslint` y las 8,009 pruebas de vitest en verde. Sin base local (misma limitación que ADR-0169): se montaron los componentes reales en
una ruta temporal sin commitear con datos de muestra y se revisaron el tablero, el modal de entrega, el flujo de Apartar (escaneo con Enter),
tienda vacía con caja cerrada y el celular a 390 px, sin errores de consola ni scroll horizontal. **Falta verlo con clics reales contra la base.**

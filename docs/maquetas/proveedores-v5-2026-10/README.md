# Proveedores v5 · un ranking visual e interactivo, sin extravagancia (2026-10-26)

> **Elegida por Felipe: la C (Filas con su venta).** Antes de construirla pidió un ajuste: «prendas compradas y dinero gastado deberían
> tener su ícono y mostrarse de la mejor manera». Hecho (abajo, «El ajuste de la C»). La maqueta abre en la C.

Quinta ronda. Felipe, sobre la cuarta (mapa, sol y mapa de calor): «No me gusta ninguno, que sea un ranking más visual e interactivo pero
sin ser demasiado extravagante».

Las tres vuelven a ser **una lista ordenada** (lo que pidió en la tercera ronda), pero cada fila se ve y se toca. Ninguna usa gráficos raros.

## Lo común a las tres

- **El orden:** se ordena por **prendas compradas** o **dinero gastado**, con un botón grande.
- **Al cambiar el orden, la lista se reacomoda deslizándose**, y cada proveedor dice cuántos puestos subió o bajó (↑3, ↓1).
- **Barras neutras:**
  - tinta = lo que ya vendiste;
  - arena = lo que queda.
- **El color solo en la píldora del ritmo**, con su forma y su palabra. ✕ rojo solo para lo vencido.
  - ● verde «Repón»: se agota en 6 semanas o menos.
  - ■ pizarra «A su ritmo».
  - ▲ ámbar «Frena»: 16 semanas o más.
- **Filtros, buscador y paginado:** filtros por ritmo con su cuenta, buscador, 20 a la vista y «Ver los 32 que faltan».
- **El Taller** va aparte.
- **A la derecha, «Lo que no se ve a simple vista»,** como en la v4: lo vencido, las entregas atrasadas, las prendas paradas, la concentración, el
  costo por confirmar, quién se agota y la talla que falta.

## Las tres

### A · Podio y lista
- **Los 3 primeros en tarjetas grandes:**
  - su puesto en grande;
  - cuánto le compraste;
  - qué parte es de todo lo que compras;
  - su barra, su ritmo y su deuda.
- **El resto, en filas:** puesto, iniciales, nombre, barra con el número, % vendido, ritmo y deuda.
- **Al tocar uno**, su detalle aparece a la derecha.

- **Gana:** se ve de un golpe quiénes son tus proveedores grandes, y la lista sigue siendo fácil de recorrer.
- **Paga:** las tarjetas del podio ocupan alto. Las barras de las filas son cortas cuando el primero es mucho más grande que el resto.

### B · Carriles
Cada proveedor es un carril con una **barra grande que dice adentro** «193 vendidas · 204 quedan» y el total al lado, con su píldora de
ritmo. **Al tocarlo, se abre ahí mismo** (uno a la vez) con:
- qué hacer;
- sus tallas y sus sedes en celdas de color;
- la plata;
- «Abrir su ficha».

- **Gana:** es la más clara para leer cada proveedor sin ir a otra parte. La barra se entiende sin leyenda.
- **Paga:** cada carril es más alto que una fila, así que se ven menos a la vez.

### C · Filas con su venta
Cada fila trae:
- **la línea de ventas por día** (promedio de 3 días) con «86 esta semana ↑»;
- **un anillo con el % vendido**;
- la barra de cuánto le compraste;
- su ritmo.

**Se marcan hasta 3 proveedores para compararlos lado a lado** a la derecha: cuánto le compraste, % vendido, semanas, ventas de los últimos
días, margen, deuda y la talla que se acaba.

- **Gana:** se ve si un proveedor va subiendo o bajando, y la comparación responde «¿a cuál de estos le compro?».
- **Paga:** es la que tiene más cosas por fila.
- **Ojo, datos de ejemplo:** la venta por día es inventada; en el ERP saldría de las ventas reales.

## El ajuste de la C: prendas compradas y dinero gastado

- **Dos tarjetas de opción** en lugar del botón doble:
  - el ícono del polo para las prendas y el del billete para el dinero (lucide, 20 px, como una tarjeta de opción del ERP);
  - el nombre;
  - el total de todos los proveedores en grande: 2,694 prendas · ≈ S/ 81,378;
  - una línea que dice qué es: «a 52 proveedores» · «aproximado: el 87 % viene de la carga inicial».
- **La elegida** se marca con su borde de tinta, el ícono sobre tinta y un visto que se dibuja.
- **En el teléfono** van una al lado de la otra, sin el visto.
- **El mismo ícono acompaña cada cifra del ranking:** la barra de cada fila, la línea «del que más le compras al que menos» y «Le compraste»
  en la comparación. Así nunca se confunde si un número son prendas o soles.

## Datos y reglas

- **Los datos:** los mismos 52 proveedores (los 11 reales del ADR-0502 y 41 inventados con semilla fija).
- **Las reglas:** las de `apps/web/lib`, copiadas en `comun.js`.
- **Tallas y sedes:** inventadas y marcadas «Dato nuevo · en construcción».
- **La ficha completa:** se diseña después de elegir.

## Revisión

Revisadas en el navegador a 1440 px en claro y oscuro, y a 375 px sin desborde horizontal. Movimiento de una sola vez, apagado con
`prefers-reduced-motion`:
- las barras crecen;
- las tarjetas entran en cascada;
- el carril se despliega;
- la línea se dibuja;
- al cambiar el orden, todo se desliza a su lugar.

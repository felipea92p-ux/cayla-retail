# ADR-0169 — Paleta oficial «CAYLA Dynamic» en todo el ERP, y el orden oficial de pantalla empezando por Inventario

> **Número:** nació como ADR-0167; al traer `main` resultó tomado por Proformas con prendas, así que pasó a 0169 (0168 también estaba tomado).

**Fecha:** 2026-09-22 · **Estado:** aceptado (Felipe, 2026-09-22) · **Sin migraciones** · **Reemplaza en parte:** ADR-0012 (el valor de `papel`, 2026-09-18) · **Referencia visual:** la «Sala de Diseño CAYLA» (artifact de Felipe, sección «La paleta y las formas que debe llevar CAYLA» y las 15 pantallas de «Rediseño completo · 2026-09-22»)

## Contexto

Felipe armó una guía de estilo oficial compartida con CAYLA Dynamic: once tokens de color, dos familias tipográficas, cuatro radios con función propia, cinco variantes de botón, insignias de estado con punto y tablas con cabecera sand y zebra en hueso. Sobre esa guía redibujó 15 pantallas de Ventas, Catálogo, Inventario e Inicio.

El ERP ya usaba casi todo: las mismas familias (EB Garamond + DM Sans), crema, tinta, rojo y sand idénticos. La diferencia estaba en cuatro tonos, dos tokens que no existían, el peso de la serif y en cómo se ordena una pantalla:

| Token | Antes | Oficial | Nota |
|---|---|---|---|
| `papel` | `#fbf6ec` | `#fbf8f2` | El 2026-09-18 Felipe lo había subido porque `#fbf8f2` «se leía como blanco puro». El 2026-09-22 eligió la paleta oficial completa, este incluido. |
| `taupe` | `#a47865` | `#805c4c` | Es el que ya era `taupe-profundo`. El viejo reprobaba AA como texto (3.39:1). |
| `verde` | `#556e49` | `#48603f` | Más oscuro: sube el contraste. |
| `ambar` | `#8c631f` | `#74501a` | Más oscuro: sube el contraste. |
| `hueso` | — | `#eae1d2` | Nuevo: superficie hundida (inputs en caja, zebra de tabla). |
| `pizarra` | — | `#4c5d6e` | Nuevo: estado informativo (en camino, en revisión). No es semáforo. |
| `radius-2xl` | 22 px | 20 px | El radio «flotante» de la guía. |
| `.font-display` | peso 400 | peso 600 | Títulos, un monto, un nombre. |

## Decisión (Felipe, 2026-09-22)

Se le dieron tres opciones: solo sumar lo nuevo, la paleta oficial completa en todo el ERP, o la paleta completa más modo oscuro. Eligió **la paleta completa en todo el ERP, sumando la tipografía y el orden de pantalla de la guía**, sin modo oscuro por ahora. Para las pantallas eligió **solo visual**: la información de cada una no cambia, cambian la estética y el orden.

1. **Los tokens se cambian en `apps/web/app/globals.css`**, una sola vez. Toda pantalla que ya usa `bg-papel`, `text-taupe`, `bg-verde/10`, etc. hereda el tono sin tocarse.
2. **Piezas nuevas con nombre propio** en `@layer components` de `globals.css`: `eyebrow-cayla`, `btn-cayla` + `btn-primario | btn-secundario | btn-peligro | btn-sutil | btn-enlace` (+ `btn-chico`), `pildora-cayla`, `caja-cayla`, `nota-cayla`, `encabezado-tabla-cayla`, `fila-cayla`. El hover del primario es **rojo profundo**, nunca el rojo de marca (también en `Boton` y `botonPrimario` de `ui/Modal.tsx`).
3. **Primitivas compartidas actualizadas**, así llega a todo lo que las usa:
   - `ui/Tabla.tsx` (`TABLA`): cabecera en sand con los títulos en taupe, sin versalitas; divisiones sand; zebra hueso que cuenta solo las filas de datos (`:nth-child(even of .fila-cayla)`).
   - `ui/Chip.tsx`: la insignia oficial, sin borde, con fondo del estado al 10–15 % y un punto del mismo color. Suma el tono `pizarra`. La prop `versalitas` conserva el nombre por compatibilidad, pero ya no pone el texto en mayúsculas.
   - `ui/TarjetaCifra.tsx`: la etiqueta en taupe y en negrita, la cifra en serif 600 de 28 px y el contexto en taupe.
   - `ui/campos.tsx`: variante **opcional** `caja` en `CampoTexto` y `CampoSelect` (y la forma `caja` de `Desplegable`), para las barras de filtros.
4. **El orden oficial de una pantalla** (`ui/CabeceraPantalla.tsx`, nueva): sobretítulo en rojo → título serif → bajada en taupe, directo sobre el crema. A la derecha van la acción principal y lo que la acompaña. Después vienen las cifras, luego **una sola tarjeta con los filtros y la tabla**, y al final, si hace falta, la nota en hueso.
5. **Primera ronda: las cinco pantallas de Inventario** (Existencias, Movimientos, Traslados, Conteo y Análisis), porque ninguna sesión las estaba tocando. Ventas espera: Caja, Punto de Venta, Cambios, Devoluciones, Facturación e Historial tienen rediseños en curso en otras ramas o PRs abiertos, y tocarlas ahora garantizaba conflictos.

## Contraste (medido, WCAG 2.1)

Todo el texto nuevo pasa AA (≥ 4.5:1):

| Texto | crema | papel | hueso | sand | sobre su tinte |
|---|---|---|---|---|---|
| taupe `#805c4c` | 5.21 | 5.58 | 4.56 | 4.50 | — |
| verde `#48603f` | 6.13 | 6.56 | 5.36 | 5.30 | 5.27 (15 %) |
| ámbar `#74501a` | 6.37 | 6.82 | 5.58 | 5.51 | 5.47 (15 %) |
| pizarra `#4c5d6e` | 5.98 | 6.39 | 5.23 | 5.17 | 5.17 (15 %) |
| rojo profundo `#8b2a1f` | 7.56 | 8.09 | 6.62 | 6.54 | 7.03 (rojo 10 %) |

Al migrar Inventario, el texto secundario (`text-tinta/55`, 3.83:1 sobre papel) pasó a `text-taupe` pleno (5.58:1). Se descartó `taupe/80` (3.66:1).

## Lo que NO se hizo, a propósito

- **Modo oscuro:** la guía lo trae, pero Felipe lo dejó para después. Cuando entre, los tokens ya están nombrados para redefinirse bajo `[data-tema="oscuro"]`.
- **La curva de movimiento:** la guía usa `cubic-bezier(.22,1,.36,1)` y el ERP `--ease-cayla` (`.32,.72,.24,1`), que manda ADR-0136 para modales. No se tocó: cambiarla es una decisión de movimiento, no de paleta.
- **Los formularios de todo el ERP siguen con el «hilo»** (input sin caja). La caja hueso es opcional (`caja`) y solo la usan los filtros de Inventario. Pasarla a todos los formularios cambiaría cada modal de 15 módulos sin verlos.
- **Los botones de los modales** (`botonPrimario` y `botonCancelar`) conservan sus versalitas. Solo cambió el hover.
- **Nada de información nueva:** las tarjetas, columnas y franjas que la maqueta muestra y la pantalla no tenía (por ejemplo «Exactitud» en Conteo como la dibuja la maqueta) no se agregaron. Eso es otra ronda, con su propia decisión.
- Se borró `components/ExistenciasHero.tsx` (la ilustración del encabezado de Existencias): la guía pone el encabezado directo sobre el crema, sin adorno.

## Consecuencias

- **Todo el ERP cambia de tono** (papel, taupe, verde, ámbar y los chips) aunque sus pantallas no se hayan rediseñado: Compras, Producción, Colaboradores y Ventas se ven un punto más oscuros en los estados y con el papel más claro. Es lo que se eligió. Las pantallas de otras ramas heredan el tono al fusionarse, sin conflicto de código, porque no tocan estos archivos.
- Los chips de Compras y Facturación pierden las versalitas y el borde, y ganan el punto.
- `EncabezadoPagina` (Caja, Cambios, Devoluciones) y `CabeceraPantalla` conviven hasta que Ventas pase a la guía oficial.

## Cómo se verificó

Typecheck, lint y las 7,868 pruebas unitarias en verde. En esta sesión no había base local: la política de red bloqueó las imágenes de Docker. Por eso se armó una ruta temporal, sin commitear, que monta los componentes reales con datos de muestra. Se capturaron antes y después a 1440 px, y el después también a 1024 y 390 px. **Falta verlo con clics reales contra la base local o de producción.**

## Se rompe si

- Alguien reintroduce un tono a mano (`#a47865`, `#556e49`…) en lugar del token.
- Una tabla arma sus filas sin `fila()` ni `fila-cayla`: pierde la zebra.
- Un rojo nuevo se suma a la cabecera: el sobretítulo ya gasta uno de los dos rojos por pantalla.

## Actualización 2026-09-26

Inventario, que conservaba una foto en la cabecera (`InventarioHero`, 2026-09-22), pasó también a `CabeceraPantalla`: ver ADR-0216.

## Actualización 2026-09-26 (b)

La convivencia de las dos cabeceras se resolvió al revés de lo que decía «Consecuencias»: Ventas no pasó a
`CabeceraPantalla`; Felipe eligió la de Ventas (`EncabezadoPagina`) y **Inventario pasó a ella** (ADR-0220). El punto 4
(«el orden oficial de una pantalla» empieza con `CabeceraPantalla`) queda para Finanzas, que la usa como su spike
aprobado (ADR-0195). Lo demás de esta guía (tokens, botones, chips, tablas, notas) sigue igual.

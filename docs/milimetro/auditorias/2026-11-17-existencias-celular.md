# Auditoría al milímetro — `/inventario` en el celular: la cabecera con «Ajustar stock» y «Resumen», la hoja «Resumen» y la hoja de la prenda · 2026-11-17 · `claude/existencias-hoja-prenda-movil`

Medido: 375×812 claro vivo · 375 oscuro · 375 quieto · foco con teclado · 1440×900 claro (que no cambie). Servidor: `localhost:3010` (base local, sede Lima).
Todo el cambio vive bajo 640 px: desde 640 px la cabecera, las cifras, el valor a costo y la hoja de la prenda se ven como antes (medido a 1280 y 1440).

Resumen: **0 graves · 0 medias · 0 leves abiertas** · 1 media propia corregida · 3 heredados de piezas del sistema · 1 falso positivo confirmado.

## Lo que se midió

| Pieza | Medida | Regla | Resultado |
|---|---|---|---|
| Cabecera a 375: «Ajustar stock» y «Resumen» | dos íconos de 44 × 44 px; el buscador sube de ~430 a 262 px | 44 px con el dedo (ADR-0611 mejora 5) | pasa |
| Hoja «Resumen» | 281 px de alto con las cifras (abre a su medida); con el valor a costo abierto, 731 y se desplaza | — | pasa |
| «Colgadas» dentro de la hoja | filtra la lista (24 → 20 productos, `?condicion=colgadas`) y cierra la hoja | — | pasa |
| Estados (cabecera y hoja) | 0 apagados, 0 ocupados que se pulsan, 0 elegidos solo por ARIA, 0 bucles; quieto, 0 animaciones en bucle | `referencia/estados.md` | pasa |
| Foco en la hoja «Resumen» | 4/4 con anillo, 0 tapados; al cerrar vuelve a «Resumen» | WCAG 2.4.3, 2.4.7 `[Norma]` | pasa (tras el arreglo de abajo) |
| Botones de la prenda a 375 | grilla de 2 × 151 px de borde a borde, 44 de alto | — | pasa |
| Casillas «En piso · En almacén · apartadas · dañadas» a 375 | de a dos, 153 px, cifra de 28 px, cada palabra entera (antes 74 px y tres palabras desbordadas) | — | pasa |
| Color de la tabla de «Todas» | «Azul marino» en dos líneas (antes «Azul m…») | — | pasa |
| Espacio y letra a 375 | 0 blancos bajo 44 con el dedo, 0 lecturas bajo 14 px en lo que cambió | WCAG 2.5.8 · regla del repo | pasa |
| Guía interactiva | `guias:recorrer` en verde a 375 (35 pasos) y 1440 (37); el paso «El resumen de la tienda» enciende el ícono; huella aceptada | ADR-0389 | pasa |

## Corregido en esta pasada

1. **(Media) Al cerrar «Resumen» el foco caía al `body`.** Quien va con teclado o lector de pantalla perdía su lugar. Ahora `alCerrarEnfocar` lo devuelve al botón
   (`components/existencias/ResumenExistencias.tsx`). Medido: tras Escape, `document.activeElement` es `existencias.resumen`. `[Norma]` WCAG 2.4.3.

## Heredado (piezas del sistema; no lo trae este cambio)

1. **La bajada de una hoja en claro da 4,35:1** (`text-taupe`, 15 px, sobre el vidrio «Serena»): «Tienda Lima» bajo «Resumen», y lo mismo en la frase «6 en piso · 0 en
   almacén» de la hoja de la prenda. Pide 4,5 `[Norma]` WCAG 1.4.3. Es la frase de toda `<Modal>` con `subtitulo` → va a `/color` (¿`taupe-profundo` en la bajada?). Decisión de Felipe.
2. **En oscuro, la pestaña «Todas» sin elegir casi no se lee** (vista a ojo en la hoja de la prenda; el medidor no la marcó). Pieza `<Pestanas>` → va a `/color`.
3. **«Colgadas en el piso» es un botón de varias líneas** (`textos` → `botonEnDos`): es la cifra de `ResumenSede`, una tarjeta de número + nota + nombre, igual que en la cabecera. Decidido.

## Falso positivo confirmado

- En oscuro, el medidor de color dio 1,4:1 a «Etiquetas», «Rótulo», «Historial» y «Catálogo». A la vista son crema (`rgb(245,240,232)`) sobre el vidrio oscuro
  y se leen bien: el medidor compone mal el degradado del vidrio del botón.

## Sin medir

- Con una prenda en el Taller (sin piso ni almacén separados: tres casillas en fila) y con una cuenta que no ve el valor a costo (la hoja trae solo las cifras).
- `tema:auditar`.

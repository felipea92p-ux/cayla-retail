# Auditoría al milímetro — «Venta registrada» con «Imprimir en la caja» y la estación de la caja · 2026-11-16 · `claude/estacion-de-impresion`

Medido: 1440×900 claro y oscuro, 375×812 táctil. Piezas nuevas: el estado «En la cola de la caja» / «Impresa en la caja» (`<Chip>`), los
interruptores del equipo (`<Interruptor>`), «Imprimir aquí» (`<BotonImprimir>`) y la insignia de la estación abajo al centro (`<Chip>` sobre
el vidrio de lo que flota). Base local restaurada a su foto al terminar.

Resumen: **0 graves · 0 medias · 1 leve · 2 decididos a propósito.**

## Graves
Ninguno.

## Medias
Ninguna.

## Leves
1. El estado de la caja y la insignia de la estación miden 13 px: es la letra de `<Chip>` (versalitas, ADR-0358 `estado`), que la regla de
   lectura deja aparte. Va a `/tipografia` solo si Felipe quiere los chips más grandes en todo el ERP.

## Decidido a propósito
- El interruptor mide 23,3 px de alto en escritorio: `<Interruptor>` del sistema, pasa AA por la separación; con el dedo, `tacto.css` lo
  agranda (a 375 px no aparece bajo 44).
- La insignia de la estación va abajo al centro sobre `--vidrio-flota-fondo` / `--vidrio-flota-filtro` (recetas.css): a la izquierda
  tapaba la cuenta del menú lateral y a la derecha queda «Cobrar».

## Medido sin hallazgos
- Hoja «Venta registrada» con «Imprimir en la caja»: 0 textos y 0 controles que fallen contraste en claro y en oscuro; 0 apagados, 0
  errores, 0 etiquetas faltantes; 0 blancos bajo 24 px; a 375 px, ningún control nuevo bajo 44 px.
- Insignia de la estación: centrada (720 de 1440), 12 px del borde, 24 px de alto; los hallazgos de espacio y color de la página son del
  aviso «Caja sin cerrar» y del menú lateral, no de esta pieza.

## Sin medir
- El estado de error («No se pudo mandar a la caja», `<Aviso tono="error">` con «Reintentar»): pide que la base no responda.
- `tema:auditar`: no tiene escenario que abra esta hoja sin registrar una venta (el oscuro se midió con `color/medir.js`).

# Auditoría al milímetro — El barrido en el celular (`/inventario/barrido`, actividad 10) · 2026-11-23 · `claude/keen-turing-w667at`

Medido después de los cuatro cambios de la actividad 10 (orden en el celular, repetidas desde la base, «Lo escaneado» con lo tuyo primero y
textos de tienda). Los medidores de estados, espacio, tipografía, color y textos, inyectados enteros con Playwright con un barrido en curso:
375 × 812 táctil (claro y oscuro), la hoja «Lo escaneado» y la hoja «Revisar» a 375, y 1440 × 900. Animaciones quietas (las de fábrica).

Resumen: **0 graves · 0 medias · 3 leves (de piezas compartidas)** · contraste sin fallas en claro y en oscuro; nada de lectura bajo 14 px a 375; controles de la pantalla a 44 px con el dedo; sin desborde a 375 (scrollWidth 375).

## Lo que se midió

| Medidor | Vista | Resultado (Medido) |
|---|---|---|
| espacio | 375 en curso | 0 blancos bajo 24 px; con el dedo, 1 bajo 44 (la flecha «Volver», 42×42, pieza común); controles de 44 y 46 px |
| espacio | hoja «Lo escaneado» 375 | 0 hallazgos |
| tipografía | 375 y 1440 | 0 textos de lectura bajo 14 px en la pantalla; el globito de `TituloGrupo` en 10,5 px (leve del repo) |
| color | 375 claro y oscuro, 1440, las dos hojas | 0 textos ni controles bajo su contraste |
| textos | 375, 1440 y hojas | «Ver lo escaneado» marcado como cortado: **falso positivo** (medido: `scrollWidth` 168 = `clientWidth` 168, `scrollHeight` 42 = `clientHeight` 42) |
| posición (script propio) | 375 en curso | campo a 391 px, «Última que escaneaste» de 649 a 766 px: los dos en la primera pantalla (antes 645 y 1004) |

## Leves (de piezas compartidas)

1. **La flecha «Volver»** de `EncabezadoPagina` mide 42×42 con el dedo; pide 44. Va a `/unificar`.
2. **El globito con número** de `TituloGrupo` / `TituloSeccion` se dibuja en 10,5 px (propuesta 1 de `/tipografia`).
3. **El chip «Admin · queda a tu nombre»** de `ComboResponsable compacto` va en 13 px. Es la pieza de siempre; solo lo ve una cuenta admin.

## Sin medir

- El teclado virtual abierto (el celular es emulado): con el teclado, la última prenda (649 px) quedaría tapada. Con una pistola Bluetooth o con la cámara no se abre.

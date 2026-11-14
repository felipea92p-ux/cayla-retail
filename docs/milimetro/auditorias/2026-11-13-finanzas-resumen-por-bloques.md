# Al milímetro · auditoría — `/finanzas/resumen` por bloques (2026-11-13)

**Qué cambió:** el Resumen se dibuja por bloques (ADR-0661). Lo nuevo que se ve son los **lugares en espera**: `EsperaBloque` (la tarjeta de vidrio con su
`TituloSeccion` y bandas), la frase en espera (dos bandas), las píldoras en espera de las preguntas, «Hoy te toca» en espera (con su `CabeceraBloque`) y la
regla de CSS que deja a los movimientos a lo ancho cuando no hay tiendas. Los bloques de verdad son las mismas piezas de antes.

**Cómo se midió:** el panel del navegador estaba oculto (React no revela los bloques sin un cuadro de pintura), así que los siete medidores
(`.claude/skills/{milimetro,espacio,tipografia,color,movimiento,textos,graficos}/referencia/medir.js`) se corrieron con Playwright en un Chromium sin pantalla,
como el líder local, contra la copia de un año (`cayla_carga`). Dos momentos: **espera** (con los lugares en espera a la vista) y **final**.

| Medidor | 1440 claro | 375 claro | 1440 oscuro | quieto / vivo |
|---|:-:|:-:|:-:|:-:|
| milimetro (estados; también `{ foco: true }`) | ✓ espera + final | ✓ | ✓ espera + final | ✓ / ✓ |
| espacio | ✓ | ✓ | | |
| tipografia | ✓ | ✓ | | |
| color | ✓ espera + final | | ✓ espera + final | |
| movimiento | ✓ (quieto) | | | ✓ (vivo) |
| textos | ✓ | | | |
| graficos | ✓ | | ✓ | |

## Resultado

**Piezas nuevas: 0 graves, 0 medias, 0 leves.**

- **Color:** ningún texto de los lugares en espera falla en claro ni en oscuro (los títulos son `TituloSeccion` en tinta; las bandas son decorativas,
  `aria-hidden`). El único texto que falla en los dos momentos es «Registrar gasto» de la mesa del telar (ratio 1: un texto escondido detrás de su ícono),
  que ya estaba.
- **Estados — loading:** cada lugar en espera lleva `aria-busy="true"` y dice qué espera («Libre para usar, cargando»); 0 esperas escritas a mano, 0 botones
  «ocupados» que se puedan pulsar. No se enciende el loader global (ADR-0149).
- **Quieto:** con `data-movimiento="quieto"` hay 0 animaciones; las bandas dejan de respirar, como las de `EsqueletoPantalla`. En vivo, las 8 animaciones de la
  pantalla terminan a los 3,5 s; el único bucle es la aurora del aviso de cierre de caja (ADR-0359), que ya estaba.
- **Saltos (CLS del navegador):** 0,003 a 1440 px (claro, oscuro, quieto y vivo) y 0 a 375 px, sin desborde horizontal.

## Lo que marcaron los medidores y ya estaba (no es de este cambio)

- `button.estados-fecha-flecha` «Ver el mes siguiente» apagado sin motivo a la vista (el calendario de Estados financieros en el mes de hoy).
- Texto de lectura a 13 px en la tarjeta del mes (`.mes-a-nota`, `.mes-a-delta`) y en «Lo demás, en sus bolsillos…»; cifras sin tabulares (54).
- Tramos del orillo de 16 px de alto (blancos bajo 24 px pero separados).
- Pista de la `BarraApilada` de «Libre para usar» a 1,15:1 (decorativa) y un tramo ámbar a 1,74:1 en claro.
- 5 botones cuyo texto se parte en dos líneas a 1440 px (las cifras de «Para SUNAT», «IGV de tus ventas», «Lo que costaron las prendas», «Te deja», «Ver la cuenta»).

## Sin medir

- A ojo en un navegador con pantalla (el panel estaba oculto): queda en el backlog de la rama.
- 1024–1920 px: no es un cambio de ancho; `/multi-view-responsive` no hace falta.

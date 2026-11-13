# Foto de catálogo con IA al subir una foto (2026-11-13)

Felipe: «hay que integrarlo al subir una foto al ERP, una opción que por defecto esté desactivada y al activarla haga el efecto sobre las fotos».
Cómo se vería en **Editar producto ▸ Fotos por color**; en **Nuevo producto** es la misma pieza, en el paso de fotos. Textos según la regla «Poco texto a la vista» (CLAUDE.md). Para abrir: `index.html`
(o el servidor «maqueta-referentes» de `.claude/launch.json`). La barra de arriba cambia de paso, de prenda y de tema; no es parte del diseño.

**Las fotos son reales** (dos prendas del almacén y lo que devolvió OpenAI) y viven en `img/`, que **no entra a git** (`.gitignore`): el repo es
público. Sin `img/` la maqueta se abre igual, sin imágenes. La investigación detrás: `docs/investigacion/2026-11-13-fotos-de-prenda-con-ia-opciones.md`.

## Tres formas (elige mirando; la barra de arriba cambia de una a otra)

| | Cómo es | Sirve para |
|---|---|---|
| **A · Por color** | El interruptor es una píldora en la **línea del título** («Catálogo con IA» + «?» + interruptor). Cada color abre su hoja de ángulos y se prepara en su cuadro **sin bloquear**. **Sin paso de revisión** (Felipe 2026-11-13): al terminar, la foto de IA queda sola como la de ese color, con «Con IA»; bajo el cuadro, «Usar mi foto» la cambia por la original en un toque (y «Usar la de IA» la devuelve). | Una foto suelta o una corrección |
| **B · Toda la prenda** | Sueltas **todas las fotos de la prenda de una vez**. El ERP adivina color y ángulo de cada una (compara el tono con cada variante) y solo hay que corregir lo dudoso («¿Celeste?»). «Preparar todo» y una sola pantalla con los pares: cada uno trae «Usar mi foto»; «Guardar» usa el resto. | Dar de alta una prenda con sus colores |
| **C · Bandeja del día** | Una pantalla en Productos, «Fotos por revisar», con todas las de todas las prendas: lista a la izquierda, el par grande a la derecha, y se revisa de corrido con el teclado (↑ ↓, **U** usar, **M** mi foto). | El día que llega una colección |

Recomendación: B en Nuevo y Editar producto, A para corregir un color, C cuando el volumen lo pida. En la maqueta solo hay fotos reales de
una blusa verde y un top gris: **Rosa palo, Celeste y Negro son la misma foto con el tono cambiado** (simulado).

## La misma prenda en todos los colores (Felipe 2026-11-13)

«La IA debe entender que la prenda tiene que ser la misma en todos los colores: la estructura; solo cambia el color o el patrón.» El primer color que se
prepara queda como **molde**; cada color siguiente se le pide a la IA con su foto **y** el molde (`PROMPT_CON_MOLDE`): copia la estructura del molde y toma
de la foto solo el color y el estampado. Medido con la silueta del canal alfa: la blusa pasó de **93,8 % a 99,3 %** igual al molde y el top de **92,5 % a
98,8 %**; sin molde, además, cambió la etiqueta del cuello. Cuesta ~0,061 USD en vez de ~0,051. En la hoja de un color que no es el primero se ve «Misma
forma que Verde limón». En B, «Preparar todo» hace primero el color de molde y después los demás juntos.

## Decisiones que la maqueta propone (para que Felipe confirme)

1. **Apagado por defecto** y recordado por persona en el aparato (como «Animaciones», ADR-0625). No es un módulo: es una opción dentro de las fotos (ADR-0306).
2. **Se guarda sola** (Felipe 2026-11-13, cambió lo propuesto antes): sin «Revisar». El arrepentimiento es «Usar mi foto» bajo cada color, y la original siempre queda guardada.
3. **La original se guarda siempre** (vuelve `originales/`, que ADR-0442 había quitado): para «Ver la original», para volver a prepararla y para comparar.
4. **Una foto basta, tres ayudan**: frente obligatoria; espalda y detalle opcionales (ver la investigación).
5. **Quién puede:** quien edita productos. El costo lo paga CAYLA por foto (~0,05 USD); si hace falta un tope al mes, se agrega en Configuración.

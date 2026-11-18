# ADR-0596 — El ERP pasa al vidrio líquido, componente por componente (2026-10-31)

DECIDÍ (Felipe, 2026-10-31): todo el ERP se rediseña con la estética de vidrio de «Mi perfil» («A · Cristal líquido», ADR-0136
act. 2026-10-31), en su versión **Serena**: la hoja es vidrio esmerilado más opaco (70 %), con su borde de luz, su sombra larga, radio de
32 px y la entrada que se enfoca; **sin** el filo ni el brillo que siguen al mouse (eso queda solo en Mi perfil). Se hace componente por
componente: cada pieza se audita, se dibujan 2 o 3 caras en una maqueta tocable, Felipe elige mirando, y recién ahí se lleva al código.
El avance vive en el tablero `docs/vidrio/README.md`.

Lo que ya eligió Felipe sobre 9 modales de muestra (`docs/maquetas/modales-vidrio-2026-10/`):

| Pieza | Cara elegida | En una línea |
|---|---|---|
| La hoja | Serena | vidrio al 70 %, sin luz que sigue al mouse; tablas sobre lámina casi papel; con botón rojo, papel |
| Campos de texto | A · Hundido | un pozo tallado en el vidrio; al escribir sube como la gota, sin volverse sólido |
| Botones | A · Gota | píldora; secundario = la gota; primario = vidrio ahumado de tinta (72 → 93 %); rojo = vidrio rojo |
| Notas | A · Placa | lámina de vidrio con la «i» en su lente |
| Combo | A · Pozo y gota | cuerpo hundido, la flecha es una gota; la lista también es vidrio |
| Aviso | B · Lente | sin franja: lente ámbar y borde ámbar tenue |
| Planilla de tallas | A · Celdas vivas | números sin cajas, diferencia por talla, total por color, movimiento de Ajustar stock |
| Barra de pagos | A · Tubo de vidrio | pozo con tramos de vidrio de color y cada medio con su monto y su parte |
| Lista de prendas | B · Lámina de vidrio | una placa, ícono de categoría sobre el color, talla como insignia |

El idioma que ordena todo: **lo hundido espera tu dato; lo que sobresale es lo que haces; lo que explica es plano.**

DESCARTÉ: «Completa» para todo el ERP (el filo y el brillo en 275 hojas son ruido, y Mi perfil deja de ser especial); llevarlo de un
salto (un PR que cambie todas las piezas no se puede revisar ni mirar); y que la skill de diseño decida colores o piezas (CLAUDE.md, «Skills
de diseño de afuera»): todo sale de los tokens de `globals.css` y `estilos/tema.css`.

SE ROMPE SI: un texto o el borde de un control deja de pasar su contraste porque detrás del vidrio hay una prenda oscura (el fondo ya no
es fijo); si el desenfoque traba el Mac mini de la tienda con varias capas abiertas; o si una pieza se migra sin que Felipe la haya
elegido mirando.

- **Reglas que cambia** (cada una se reescribe cuando su pieza se lleve al código, no antes): la cara única de hoja de ADR-0358 ronda 12
  («papel, borde fino, sin sombra»), la excepción de vidrio de ADR-0136 (pasa a ser la regla de las hojas), el movimiento de «Ajustar
  stock» (ADR-0494) para toda planilla en una hoja, y la familia `modal` de `lib/unificar.test.ts`.
- **Pendiente de decidir por Felipe:** que en «Celdas vivas» el − y el + se vean recién al apuntar (ley 6 de Formidable y el borde de
  control de ADR-0516 piden lo contrario).
- **Antes de llevar la primera pieza al código:** medir con `tema:auditar` el contraste sobre el vidrio con una prenda oscura detrás
  (Existencias), y el desenfoque en el Mac mini con un cajón y una hoja abiertos a la vez (tres capas de `backdrop-filter`). Respetar
  `prefers-reduced-transparency` (vuelve a papel).
- **Cómo entra al código:** por `/unificar` (familia por familia, módulo por módulo, con el OK de Felipe), sin cambiar qué hace ninguna
  pieza. Lo de diseño propio (vista rápida, Insignias, Ajustar stock, Observatorio, la persiana de Caja, el telar de Finanzas) no se toca
  sin que Felipe lo diga.

## Actualización 2026-10-31 (b) — lo elegido entra al código, de forma modular

Felipe pidió llevar ya al sistema todo lo elegido, «de forma modular para solo tener que cambiar ese componente y que se aplique en todo».

DECIDÍ: una sola fuente de recetas, `apps/web/app/estilos/vidrio/recetas.css` (placa, gota, pozo, ahumado, lente, velo, con su oscuro), y
las piezas armadas con ellas en `app/estilos/vidrio/` (`hoja.css`, `campos-y-botones.css`, `notas-avisos-combos.css`,
`graficos-y-pasos.css`, `marco.css`), importadas al final de `globals.css` y SIN capa: le ganan a `components` y a las utilidades, así que
las ~275 hojas, los 14 cajones, todos los campos (`caja-cayla`), botones (`btn-cayla`), notas (`nota-cayla`), avisos (`aviso-linea`),
listas de combo (`lista-flotante`), segmentos de campo, barras apiladas y pasos de cantidad cambian sin tocar una pantalla. En TSX solo se
cambió la clase de la cara (`hoja-serena` en `Modal`, `cajon-serena` en `Cajon`), los ganchos del segmento (la gota que se estira) y la
forma «pastilla» del combo (`combo-pastilla`); el marco, en `AppShell`.

DESCARTÉ: el `backdrop-filter` en la hoja (como en la maqueta). Vuelve a la hoja el bloque contenedor de todo `position: fixed` de adentro,
y la hoja es la que hace scroll: la lista de cada combo (el Responsable con que se firma casi todo) quedaría recortada y se iría con el
scroll. El desenfoque lo pone el velo (12 px) y la hoja es vidrio translúcido encima: se ve esmerilado y ningún combo cambia de
comportamiento. También descarté que la gota de las listas «viaje» con JavaScript: es la misma `opcion-activa` de siempre (que sigue al
mouse y a las flechas), pintada como gota con un fundido corto; así la tienen todos los combos sin tocar ninguno.

SE ROMPE SI: alguien le pone `backdrop-filter` (o `transform`/`filter` permanentes) a `.hoja-serena` o a `.cajon-serena`; o si una pieza
nueva escribe su propio vidrio en vez de una receta.

## Actualización 2026-11-02 — la tarjeta de producto cambia tres reglas

Al llevar Catálogo ▸ Productos a «A · Catálogo de moda» (la foto al aire y tres renglones: nombre y precio, categoría y color, colores y
stock), Felipe aceptó tres cambios de regla que deshacen decisiones anteriores:

- **El stock de la tarjeta es el de toda la empresa** («34 en stock»); lo que hay para vender en la sede pasa al `title` del stock. Deshace
  la decisión 1 de ADR-0270 (lo de la sede en grande).
- **«Sin stock» va en rojo** (y «Quedan N», bajo su mínimo, en ámbar). Deshace la decisión 3 de `lib/productos-stock.ts` (2026-09-22: sin
  rojo para no llenar la grilla).
- **La tarjeta ya no muestra el chip ámbar de «falta la marca o el proveedor»** (ADR-0283): lo dice el `title` del stock y la vista rápida.

SE ROMPE SI: alguien vuelve a poner lo de la sede en grande en la tarjeta sin leer esto, o usa el rojo de «Sin stock» para algo que no sea
que no queda ninguna en toda la empresa.

## Actualización 2026-11-05 — en qué sede está vuelve a verse en la tarjeta de producto

Felipe, mirando Catálogo ▸ Productos: «ya no me sale lo que está disponible en Trujillo o en Arequipa», y «que especifique si es en Lima
también». Lo de cada sede había quedado solo en el `title` del stock, que en el celular no existe y con el mouse hay que ir a buscar. La
tarjeta suma una cuarta línea, «Trujillo 2 · Arequipa 5 · Lima 1 · Taller 40» (`lugaresDeStock`, `lib/productos-stock.ts`): la sede elegida
primero aunque tenga 0, las demás de más a menos, siempre la ciudad con su nombre y nunca «2 sedes más». Sigue valiendo lo de arriba: el
número grande es el de la empresa, y la línea cuenta solo lo que se puede vender (sin apartadas ni dañadas), por eso puede sumar menos.

## Actualización 2026-11-02 (b) — se cierran las maquetas; la estética es obligatoria

Felipe paró la creación de maquetas de vidrio y pidió dejar la regla escrita: **desde hoy todo lo nuevo o editado sigue esta estética**,
usando las piezas ya elegidas. La constancia de lo elegido, de los módulos analizados y de lo que falta auditar quedó en
`docs/vidrio/README.md` (sección 4); la regla, en `CLAUDE.md` («El vidrio Serena»). Rendimiento y Preguntas del equipo quedaron con su
maqueta y sin elegir. Lo que falta se audita módulo por módulo con las piezas de 4.1, sin maquetas nuevas.

DESCARTÉ seguir con una maqueta por pantalla: con 30 módulos elegidos, las piezas ya cubren casi todo, y cada maqueta nueva repetía lo
mismo con datos distintos. Una pieza que no calce sigue pasando por Felipe, pero mirando la más cercana, no una maqueta nueva.

SE ROMPE SI: una pantalla nueva nace con tarjetas de papel sólido o con su propio vidrio en vez de las recetas; o si alguien vuelve a
abrir maquetas de vidrio sin que Felipe lo pida.

## Actualización 2026-11-05 — una sola hoja, y lo que no se deshace va en negro

Felipe, mirando la lámina que comparaba Retail con Dynamic, preguntó por qué dos hojas se veían distintas y pidió «Anular» en negro, también en
Retail, para que los dos sistemas queden iguales.

DECIDÍ: la hoja es una sola (se fue `.hoja-serena:has(.btn-peligro)`). La acción principal de una hoja de confirmación es negra, aunque anule o
borre (`peso="primario"`), y `<AvisoNoSeDeshace />` queda como la señal, justo sobre los botones y solo donde es verdad. `btn-peligro` pasa a la gota
con letra en rojo profundo y queda para lo que abre la confirmación, va en una fila o convive con «Guardar». «Cerrar caja» y el paso final de Cambios y
Devoluciones pasan al ahumado; `BotonRojo` se fue, porque `BotonPrincipal` hacía lo mismo. El rojo avisa; no se aprieta. Ya no hay receta de vidrio
rojo: `--gota-roja-*` queda solo para el ícono de lo urgente en Proveedores. El borde de lo que se escribe (`.caja-campo-input`, `.buscador`,
`.marco-buscador`, `.combo-pastilla`, `.casilla-input`, `.fin-control`) vuelve a pleno.

DESCARTÉ: el rojo de marca casi lleno (96 → 100 %), que se reconoce como rojo pero pasa con poco margen (4.52:1) y casi no se ve vidrio; y el rojo
profundo de vidrio (78 → 94 %), que pasa bien pero sobre papel se ve café y no se reconoce como alerta. También descarté dejar el negro sin aviso:
sin él, «Aprobar» y «Anular» se ven iguales y quien aprueba toda la mañana puede anular por costumbre.

POR QUÉ: la letra crema sobre el rojo de vidrio daba de 2.87:1 a 4.26:1 en claro (el mínimo es 4.5:1), y al pasar el mouse el negro daba 4.12:1. El
borde al 80 % daba 2.64:1 (el mínimo es 3:1). Nadie lo veía: `tema-tokens.test.ts` mide tokens planos y `tema:auditar` solo suma `background-color`.
Ahora `lib/vidrio-contraste.test.ts` compone cada tramo del degradado sobre la página, la tarjeta y la hoja, en los dos temas; `--ahumado-hover` subió
de 74 → 92 % a 78 → 94 %, y `--gota-peligro-*` lleva menos crema en oscuro para que el rojo se lea. Sobre el vidrio de la hoja la letra da 12.68:1 o
más, así que volver a papel no hacía falta para leer.

SE ROMPE SI: una hoja nueva anula o elimina y nace sin su aviso (la prueba lo detecta si el botón dice «Anulando…», «Eliminando…» o «Borrando…»; otro
verbo no lo ve), o si el aviso se pone donde sí se puede volver a hacer y deja de creerse.

Revierte en Retail: «Lo peligroso, rojo desde el principio» (ADR-0358, 2026-10-07), la hoja que vuelve a papel (esta ADR, 2026-10-31) y la gota roja de
«Cerrar caja» (2026-11-02). Dynamic adopta lo mismo al migrar sus piezas.

## Actualización 2026-11-05 (c): una sola esquina de tarjeta, y lo que puede viajar a Dynamic

**Una esquina.** Felipe cerró la pregunta P10 del contrato de familia v4: una sola esquina de tarjeta, 22 px, en los dos sistemas. Retail tenía tres (20, 22 y 24 px), sin que nadie las hubiera elegido como jerarquía. Hay un token por pieza (`--radius-boton` 999, `--radius-campo` 14, `--radius-tarjeta` 22, `--radius-cajon` 28, `--radius-hoja` 32 px) y las piezas lo leen. Lo que sigue en 20 o 24 px no es una tarjeta (lo que flota, el marco, un control) o tiene diseño propio decidido (Observatorio, Insignias, Las vitrinas, los pases de Traslados, el aviso de cierre, la tarjeta Vitrina, Finanzas): cada uno con su motivo en `lib/familia.test.ts`. Una pieza nueva lee el token.

**Lo que viaja.** `recetas.css` solo lleva variables en tres formas, porque Dynamic lo trae con un vigilante. La versión maciza de ADR-0611 (más contraste, menos transparencia) lleva reglas de clase y redefine `--color-*`, y desde ese día Dynamic rechazaba el archivo entero: salió a `vidrio/aguanta.css`, importado justo después, sin cambiar nada de lo que se ve. Medido en el navegador, en claro y oscuro, con cada preferencia: los mismos valores. Dynamic no recibe el macizo por este camino: traerlo es una decisión aparte.

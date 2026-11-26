# ADR-0681 — El vidrio que dobla y el fondo «Seda»

- **Fecha:** 2026-11-18 · **Estado:** construido en la rama `claude/system-aesthetics-analysis-96733d` (cuatro actividades de `/construir`,
  una por commit). Sin migraciones ni base: entra al fusionar y publicar la web. Número reservado con `pnpm reservar adr`.
- **Pidió:** Felipe, 2026-11-18. Sobre el vidrio del ERP: «actualmente parece una copia barata y sin vida». Sobre el fondo: «no fondos
  planos ni puntos de colores que se desvanecen», y después, de Seda: «debería estar un poco difuminado… debe ser algo sutil». Eligió
  mirando la maqueta `docs/maquetas/vidrio-que-dobla-2026-11/`: el preset «E · Elegido» y el fondo «Seda».
- **Sigue a:** ADR-0596 (el ERP pasa al vidrio), ADR-0623 (lo que se desplaza no se desenfoca), ADR-0611 mejora 7 (el vidrio que
  aguanta), ADR-0625 (animaciones apagadas de fábrica), ADR-0674 (modo liviano), ADR-0136 (movimiento).

> **Actualización 2026-11-26 (ADR-0706):** el fondo Seda se reemplazó por «Lienzo», un degradado sin formas: sus pliegues se veían como
> manchas blancas detrás de las tarjetas. Lo del vidrio que dobla sigue vigente.

## El problema

El vidrio del ERP solo desenfocaba lo de atrás y lo cubría con un 70–88 % de blanco. El vidrio de verdad hace otra cosa: **dobla** la luz
en su canto. Lo que pasa por el borde se ve corrido hacia adentro, como en el borde de una gota. Eso `backdrop-filter: blur()` no lo hace.

Y había un segundo problema, más simple: detrás del vidrio no había nada que doblar. La Aurora eran tres nubes al 10–12 % sobre crema. Un
degradado suave, doblado, se ve igual que sin doblar.

## Las decisiones

### 1. El vidrio dobla con un filtro SVG, como mejora progresiva

DECIDÍ: un filtro SVG de desplazamiento (`feDisplacementMap`) dentro de `backdrop-filter`. El mapa se calcula con la forma del canto y la
ley de Snell (`apps/web/lib/vidrio-dobla.ts`); los tres colores se doblan un poco distinto. Hoy solo Chrome y Edge aceptan un filtro SVG
ahí. La pieza lo pide con `useVidrioQueDobla` (`components/ui/`), que le pone `data-dobla-activa`; el CSS (`estilos/vidrio/dobla.css`)
solo cambia el aspecto con ese atributo. Sin él, la pieza se ve con su vidrio de siempre.

DESCARTÉ:
- **WebGL con una foto de la página** (liquidGL): ignora lo `fixed`, que es justo lo que aquí flota, y hay que registrarle a mano lo que cambia.
- **HTML-in-Canvas:** recién saliendo en Chrome, sus nombres cambiaron hace poco. Se vigila.
- **Empaquetar el ERP como app** (stay-liquid, Capacitor): solo daría la barra de pestañas nativa de iPhone.

SE ROMPE SI: se le pone a algo que se desplaza con el scroll (ADR-0623: es más caro que un desenfoque), o si una sede usa Safari y
espera verlo: ahí queda el vidrio de siempre.

No dobla, y no hace nada, en: Safari y Firefox, el modo liviano, y con «menos transparencia» o «más contraste» en el aparato.

### 2. Dos rellenos, porque no toda pieza puede ser clara

En la maqueta, el relleno claro (casi sin blanco) se veía bien sobre prendas de colores. En el ERP, por detrás de lo que flota pasan fotos
de producto: en oscuro, una foto de fondo blanco bajo la cabecera dejaba la letra en 2,4:1.

DECIDÍ:
- **`claro`**, para una pieza de control cuyo texto va en tinta plena (la cabecera). El filtro recoge la luminosidad de lo de atrás con un
  piso: `salida = entrada × pendiente + corte` (0,48 y 0,50 en claro; 0,31 y 0,05 en oscuro). Con eso la tinta pasa 4.5:1 con una foto
  negra o una blanca detrás: 4,86:1 y 4,83:1 en el peor caso. Lo mide `lib/vidrio-dobla.test.ts`. Mientras dobla, el texto secundario de
  la cabecera («Buscar…», «Actividad») pasa a tinta plena.
- **`propio`**, para una pieza que se lee (un aviso, el cajón de un módulo, la isla, un cajón, una hoja). Conserva su relleno y su
  desenfoque, y solo dobla en el canto. Llevan texto en taupe directo sobre su vidrio, y el piso solo alcanza para la tinta.

DESCARTÉ: los valores de la maqueta tal cual (rompen el contraste en el peor caso), y subir el piso hasta proteger también el taupe
(queda igual al vidrio de siempre: el relleno claro desaparece).

SE ROMPE SI: alguien baja el piso «para que se vea más», o le pone el relleno claro a una pieza con texto en taupe.

### 3. La hoja dobla sin llevar filtro propio: su lente es una hermana

Un `backdrop-filter` en la hoja la vuelve el bloque contenedor de todo lo `fixed` de adentro: la lista de un combo quedaría recortada y
se iría con el scroll (ADR-0596). Esa regla no cambia.

DECIDÍ: `Modal` pone un `<span class="hoja-lente">` justo antes de la hoja, detrás, que copia su caja con posicionamiento por ancla
(la hoja declara `anchor-name`). Con la lente puesta, el relleno pasa a la lente y **el velo deja de desenfocar**: solo oscurece. Si lo
de atrás llegara borroso, el canto no tendría nada nítido que doblar. Solo en escritorio y con la hoja quieta: llega al terminar la
entrada y se va al empezar la salida, porque una caja anclada no sigue una transformación.

DESCARTÉ: un pseudo-elemento dentro de la hoja (la hoja es la que hace scroll: se iría con el contenido); reordenar el `Modal` en una
caja de afuera y un bloque que hace scroll adentro (toca todas las hojas del ERP).

SE ROMPE SI: la lente pasa a `position: fixed`. El navegador exige que la hoja y su lente compartan el bloque contenedor; con `fixed`
descarta el ancla y la lente mide cero.

**Actualización 2026-11-19 (Felipe, al verlo: «¿por qué ya no se difumina lo de atrás?»).** La primera versión dejaba lo de afuera
nítido y atenuado. Felipe lo notó apenas lo vio, y tiene razón: una hoja abierta siempre desenfocó lo de atrás, y perderlo era un
precio que nadie había pedido pagar.

DECIDÍ: una segunda hermana, `.hoja-afuera`, anclada a la misma caja. Su caja de relleno es la caja de la hoja y su borde, transparente,
llega más allá de la pantalla; una máscara deja solo el borde, y ahí va el mismo desenfoque que llevaba el velo. Queda desenfocado todo
menos lo de abajo de la hoja, que es lo único que la lente necesita nítido. El relevo entre el velo y el marco es de un solo cuadro y
sin transición.

DESCARTÉ: devolverle el desenfoque al velo y quitarle la lente a la hoja (se pierde el canto que dobla en la pieza que más se ve); dejar
el velo desenfocando con la lente encima (dobla algo borroso: no se ve y cuesta igual); cuatro franjas alrededor de la hoja (cada una
desenfoca por su cuenta y se notan las uniones).

SE ROMPE SI: el desenfoque del marco deja de ser el mismo del velo (`estilos/vidrio/hoja.css`): el relevo se notaría en toda la pantalla.
Lo cuida `lib/vidrio-dobla.test.ts`, que lee el valor del velo y exige el mismo. O si alguien les pone una transición: los dos
desenfoques a medias suman menos que uno entero y la pantalla «respira».

Medido: fuera de la hoja, la pantalla con el marco y con el velo de antes difieren en 3 de 255 como máximo (media 0,8), en claro y en
oscuro, también en el borde de la pantalla y pegado a la hoja.

### 4. El fondo es Seda, en CSS puro y dentro del rango en que todo se lee

DECIDÍ: cuatro pliegues enormes, cada uno el arco de un círculo mucho más grande que la pantalla, en una sola familia de color. Son nueve
degradados de CSS sobre un elemento fijo (`.marco-seda`, `estilos/vidrio/marco.css`). La suavidad de cada borde va en el propio
degradado: sin `filter` (ADR-0623) y sin JavaScript. Siguen el tema solos.

Sobre el fondo va texto directo (la línea de sede, una bajada, un enlace rojo). Por eso sus tonos no salen del rango en que todo color
de texto se lee: en claro, lo más hondo es media sombra de hueso sobre crema; en oscuro, lo más claro es el papel con una pizca de
ámbar. Lo mide `lib/tema-tokens.test.ts` (16 colores de texto × 4 tonos × 2 temas; el más justo, el rojo: 4,54:1).

**Es más pálida que la maqueta.** Allá el tono más hondo era un tostado donde el rojo quedaba en 2,73:1.

DESCARTÉ: dibujarla en un lienzo como en la maqueta (JavaScript, redibujar al cambiar de tema, colores fuera de los tokens); una imagen;
un sombreador WebGL (una librería antes de su 1.0 y un contexto gráfico encendido en teléfonos de gama baja); los fondos de patrón que se
repite. Las capturas de referencia (Apple, Microsoft, Linear, Stripe) muestran lo mismo: una sola forma grande, en un solo color.

SE ROMPE SI: alguien le sube el tono para que «se note más».

**Actualización 2026-11-19 (Felipe: «el fondo tiene que abarcar el menú lateral de la izquierda también»).** El menú lateral de
escritorio era una columna lisa con fondo propio (`--riel-fondo`, 2026-11-02), y Seda se cortaba en su borde. Ahora no tiene fondo:
Seda sigue por detrás, de borde a borde, y solo queda la línea de límite (`--riel-borde`). Sigue sin vidrio: por detrás del menú no
pasa nada que se desplace, así que no hay nada que desenfocar ni que doblar. Sus letras van directo sobre Seda, como las del
contenido: el medidor de color dio 0 fallas de texto en claro y en oscuro. En modo liviano, que esconde Seda, vuelve a su fondo liso.

## Lo que dobla hoy

| Pieza | Por dónde | Relleno | Cuándo |
|---|---|---|---|
| La cabecera | abajo | claro | siempre |
| El aviso de la esquina | todo el contorno | propio | siempre |
| El cajón de un módulo con el menú plegado | todo el contorno | propio | siempre |
| La isla clara (`<BarraDeAbajo>`) | todo el contorno | propio | solo en el celular |
| El cajón lateral (`<Cajon>`) | todo el contorno | propio | solo en escritorio |
| La hoja (`<Modal>`, la cara «Serena») | todo el contorno | propio | solo en escritorio y quieta |

Lo que entra y sale se asienta al aparecer: dobla 2,2 veces de más y vuelve a su medida en 480 ms, una vez y sin rebote. Con las
animaciones apagadas (ADR-0625) aparece ya asentado.

## Fuera, a propósito

- **El riel del menú en escritorio no lleva vidrio.** Felipe lo dejó liso el 2026-11-02; desde el 2026-11-19 deja ver Seda, pero sigue sin desenfoque y sin doblar.
- **«La hoja nace del botón»**, que la maqueta mostraba. Cambiaría la entrada de todos los modales, que es regla (ADR-0136).
- **La luz que sigue al mouse.** Felipe la apagó en la maqueta.
- **Tarjetas y tablas.** No se decidió si vuelven a ser casi sólidas, como hacen los referentes.
- **Las listas de los combos y el vidrio propio de un módulo** (Rendimiento, Observatorio, el ticket de Vender).

## Verificado y no verificado

**Verificado** (ERP local con Supabase local, Chrome de prueba sin tarjeta gráfica, sesión de prueba del seed):
- 955 archivos de prueba en verde; `knip` y `knip:produccion` limpios; tipos y estilo de código limpios.
- La cabecera, el aviso («Enlace copiado» de Productos), el cajón de módulo, la isla (Caja a 375 px), el cajón lateral (vista rápida de un
  proveedor) y la hoja («Ajustar stock» de Existencias), en claro y en oscuro. En modo liviano, la pieza suelta su filtro sola.
- La hoja: la lente mide lo mismo que la hoja al píxel, también cuando la hoja crece; la hoja no tiene filtro propio; la lista de un combo
  abierto cuelga de la capa de la hoja y todas sus opciones se pueden tocar.
- Fluidez desplazando Existencias: 60 cuadros por segundo y 0 tirones con la lente y con el vidrio de siempre, a 1440 y a 375 px.
- `/milimetro auditar` con el medidor de color: 0 fallas de texto en la cabecera y en la hoja, con la lente y sin ella.

**No verificado:**
- El Mac mini de la tienda y un teléfono de verdad. Si va lento, la salida es el modo liviano de «Apariencia», que apaga la lente.
- Safari y Firefox reales: el respaldo se comprobó por la pregunta al navegador, no abriéndolos. **En Safari falló: ver la actualización 2026-11-24.**
- Qué navegador usa el Mac mini. Si es Safari, verá Seda con el vidrio de siempre.
- El auditor de modo oscuro (`tema:auditar`) no ve fondos hechos con degradados. La garantía de contraste sobre Seda es la prueba de tonos.

## Actualización 2026-11-24 — En Safari, lo de atrás se veía nítido a través de la hoja

Lo que «No verificado» dejaba abierto pasó. Felipe mandó dos capturas desde Safari, «Revisar el barrido» del barrido del piso y «Tallas y
colores» de Recibir, y otra sesión vio lo mismo en «Colgar en el piso». La hoja estaba casi transparente y lo de atrás se leía nítido encima
de los datos. La razón: `CSS.supports("backdrop-filter", "url(#x)")` **no distingue a Safari**. Safari responde que sí, porque la frase es
válida, pero no dibuja el filtro SVG. Como además entiende el ancla, la lente se encendía: la hoja quedaba transparente, el velo soltaba su
desenfoque y el filtro de la lente no hacía nada.

DECIDÍ: además de esa pregunta, se pregunta por el motor. Solo dobla donde `navigator.userAgentData` trae la marca «Chromium»
(`navegadorDibujaDobla`, `lib/vidrio-dobla.ts`, con su prueba; PR #1995). Safari y Firefox no la traen y quedan con el vidrio Serena de
siempre: el velo desenfoca y la hoja tiene su relleno.
DESCARTÉ: buscar «Safari» en `navigator.userAgent`. Chrome también lo dice ahí, y cada navegador nuevo lo cambia. También descarté medir lo
pintado (dibujar la lente y leer sus píxeles): una página no puede leer lo que pinta otra capa.
SE ROMPE SI: Safari o Firefox empiezan a dibujar el filtro. Ahí verían el vidrio de siempre, que es correcto, pero no el doblez, hasta que se
sume su motor. O si Chromium abre el ERP en una página que no es segura (`http://` con una IP): no trae `userAgentData` y tampoco dobla,
lo que también es correcto.

**Verificado en el Safari de verdad del Mac de Felipe (2026-11-24):** con una hoja larga del ERP local («Revisar el barrido» con datos de
prueba, sin sesión), lo de atrás se ve desenfocado. En Chrome, la lente sigue puesta. **No verificado:** Firefox, y Safari con el ERP real y
sesión.

## Dynamic

- **Llega solo:** el bloque «El vidrio que dobla» de `apps/web/app/estilos/vidrio/recetas.css` (cuatro variables nuevas, sin efecto allá
  hasta que tenga la pieza).
- **Queda como tarea allá:** `components/ui/useVidrioQueDobla.ts`, `lib/vidrio-dobla.ts`, `estilos/vidrio/dobla.css`, las dos hermanas de
  `Modal` (la lente y el marco de afuera), el fondo Seda de `estilos/vidrio/marco.css` y el menú lateral sin fondo propio. `BarraDeAbajo`
  pasó a ser un componente de cliente.

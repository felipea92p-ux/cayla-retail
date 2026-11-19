# ADR-0681 — El vidrio que dobla y el fondo «Seda»

- **Fecha:** 2026-11-18 · **Estado:** construido en la rama `claude/system-aesthetics-analysis-96733d` (cuatro actividades de `/construir`,
  una por commit). Sin migraciones ni base: entra al fusionar y publicar la web. Número reservado con `pnpm reservar adr`.
- **Pidió:** Felipe, 2026-11-18. Sobre el vidrio del ERP: «actualmente parece una copia barata y sin vida». Sobre el fondo: «no fondos
  planos ni puntos de colores que se desvanecen», y después, de Seda: «debería estar un poco difuminado… debe ser algo sutil». Eligió
  mirando la maqueta `docs/maquetas/vidrio-que-dobla-2026-11/`: el preset «E · Elegido» y el fondo «Seda».
- **Sigue a:** ADR-0596 (el ERP pasa al vidrio), ADR-0623 (lo que se desplaza no se desenfoca), ADR-0611 mejora 7 (el vidrio que
  aguanta), ADR-0625 (animaciones apagadas de fábrica), ADR-0674 (modo liviano), ADR-0136 (movimiento).

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

Cambio que se ve: con una hoja abierta en Chrome o Edge de escritorio, lo de afuera se ve **nítido y atenuado**, no desenfocado.

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

- **El riel del menú en escritorio.** Felipe lo dejó liso el 2026-11-02.
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
- Safari y Firefox reales: el respaldo se comprobó por la pregunta al navegador, no abriéndolos.
- Qué navegador usa el Mac mini. Si es Safari, verá Seda con el vidrio de siempre.
- El auditor de modo oscuro (`tema:auditar`) no ve fondos hechos con degradados. La garantía de contraste sobre Seda es la prueba de tonos.

## Dynamic

- **Llega solo:** el bloque «El vidrio que dobla» de `apps/web/app/estilos/vidrio/recetas.css` (cuatro variables nuevas, sin efecto allá
  hasta que tenga la pieza).
- **Queda como tarea allá:** `components/ui/useVidrioQueDobla.ts`, `lib/vidrio-dobla.ts`, `estilos/vidrio/dobla.css`, la lente hermana de
  `Modal`, y el fondo Seda de `estilos/vidrio/marco.css`. `BarraDeAbajo` pasó a ser un componente de cliente.

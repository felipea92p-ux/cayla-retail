# Ficha al milímetro · El vidrio que dobla (2026-11-18)

Propósito: que el vidrio del ERP deje de verse como una placa lechosa. El vidrio de verdad dobla la luz en su canto; el de siempre solo
desenfoca. Pedido de Felipe: «actualmente parece una copia barata y sin vida». Eligió mirando el preset «E · Elegido» de
`docs/maquetas/vidrio-que-dobla-2026-11/`: dobla, arcoíris del canto, relleno claro, profundidad, grano y movimiento; sin luz al mouse.
ADR-0681.

Armada con el ERP local (rama `claude/system-aesthetics-analysis-96733d`) en un Chrome de prueba, a 1440 × 900 y 375 × 812, claro y oscuro.

## Árbol (reglas 1–3)

No es una pieza nueva de la tabla de piezas únicas: es una **mejora de las piezas que ya flotan**. Cada una conserva su componente, sus
props y lo que hace. Lo nuevo es un `ref` y una regla en `apps/web/app/estilos/vidrio/dobla.css`.

| Parte | Dónde vive |
|---|---|
| La forma del canto, el mapa y el filtro (números y texto) | `apps/web/lib/vidrio-dobla.ts`, con `lib/vidrio-dobla.test.ts` |
| Lo que toca el navegador | `apps/web/components/ui/useVidrioQueDobla.ts` |
| Las recetas (relleno claro, hondura, grano, el borde que se disuelve) | `apps/web/app/estilos/vidrio/recetas.css`, bloque «El vidrio que dobla» |
| Qué cambia en cada pieza | `apps/web/app/estilos/vidrio/dobla.css` |

DECIDÍ: un filtro SVG de desplazamiento dentro de `backdrop-filter`, como mejora progresiva.
DESCARTÉ: WebGL con una foto de la página (ignora lo `fixed`, que es justo lo que aquí flota); HTML-in-Canvas (recién saliendo, la API
cambió de nombres hace poco); empaquetar el ERP como app (solo daría la barra nativa de iPhone).
SE ROMPE SI: se le pone a algo que se desplaza con el scroll (ADR-0623), o se le baja el piso de luminosidad «para que se vea más».

## Textos

No agrega ni cambia ningún texto.

## Espacio

- El canto de una barra a ras (la cabecera): 14 px, solo por su lado libre. El de una cápsula: su radio, entre 6 y 18 px.
- El borde que se disuelve bajo la cabecera: 24 px. En la maqueta eran 34; se bajó porque por ahí pasan filas con cifras.
- La pieza no cambia de tamaño ni de lugar. El filtro mide exactamente lo que mide ella y se rehace si cambia de ancho.

## Tipografía

No aplica: no toca la letra.

## Color

- Solo tokens. El mapa y la máscara son bytes de un lienzo, no colores del tema.
- **Dos rellenos**, porque no toda pieza puede ser clara:

  | Relleno | Para | Qué cambia |
  |---|---|---|
  | `claro` | piezas de control: la cabecera, la isla | pierde casi todo su blanco (vidrio al 22 → 6 %) y desenfoca 13 px en vez de 24 |
  | `propio` | piezas que se leen: un aviso, una hoja | conserva su relleno y su desenfoque; solo dobla en el canto |

- **El piso de luminosidad** del relleno claro → `[Norma]` WCAG 1.4.3 (4.5:1). El filtro recoge lo de atrás: `salida = entrada × pendiente +
  corte`. En claro 0,48 y 0,50; en oscuro 0,31 y 0,05. Con eso la letra en tinta pasa 4.5:1 con una foto negra o una blanca detrás.
  Medido por `lib/vidrio-dobla.test.ts`: el peor caso da **4,86:1** en claro y **4,83:1** en oscuro.
- **El piso solo alcanza para la tinta entera.** Sobre el vidrio claro, el texto secundario pasa a tinta plena («Buscar…» y «Actividad»
  iban al 70 y al 65 %, y en el peor caso bajaban de 4,1:1 a 2,9:1). Una pieza que lleva texto en taupe directo sobre su vidrio (la isla,
  un aviso) no usa el relleno claro: usa el `propio`.
- Por qué no los valores de la maqueta: allá el piso era más bajo y sobre prendas de colores se veía bien. En el ERP por detrás de la
  cabecera pasan fotos de producto de fondo blanco: en oscuro dejaban la letra en 2,4:1.
- Aun con el piso, pasa cerca del doble de lo de atrás que con el vidrio de siempre (48 % contra 26 % en claro; 31 % contra 12 % en oscuro).

## Estados

La mejora no agrega estados a la pieza. Lo que sí cambia según el aparato:

| Situación | Qué pasa | Cómo se verifica |
|---|---|---|
| Chrome o Edge | dobla | `data-dobla-activa` en la pieza y `backdrop-filter: url(#dobla-N)` |
| Safari, Firefox | el vidrio de siempre | `CSS.supports("backdrop-filter", "url(#x)")` da falso: la pieza no lleva el atributo |
| Modo liviano | el vidrio macizo de siempre | se quita el atributo y el filtro (medido: 0 filtros) |
| «Menos transparencia» o «más contraste» | el vidrio macizo de siempre | la misma pregunta de medios que `vidrio/aguanta.css` |
| Cambio de tema | se rehace con la luminosidad del tema | medido en claro y oscuro |
| quieto (animaciones apagadas) | dobla igual; lo que se mueve (el vidrio que se asienta al abrir una hoja) no corre | `prefiereQuieto()` |

## Movimiento

La cabecera no se mueve. El vidrio que se asienta al abrirse una hoja o al apretar una pieza llega con esas piezas, una vez, sin rebote,
y pregunta `prefiereQuieto()` (ADR-0625).

## Accesibilidad y costo

- El `<svg>` de los filtros va con `aria-hidden` y sin tamaño.
- **Fluidez medida** en un Chrome de prueba sin tarjeta gráfica, desplazando Existencias: 60 cuadros por segundo y 0 tirones con la lente y
  con el vidrio de siempre, a 1440 y a 375 px.
- Un mapa por tamaño de pieza; se guardan los últimos 24.

## Sin medir

- El Mac mini de la tienda y un teléfono de verdad.
- Safari y Firefox reales: el respaldo se comprobó por la pregunta al navegador, no abriéndolos.

## Propuestas de mejora al repo

Ninguna.

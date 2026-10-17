# Prompt único para las fotos de la página y del armador de looks

**Fecha:** 2026-10-17 · **Estado:** propuesta de Felipe para que el equipo la use; falta probarla con fotos reales (ver «Cómo probarlo»).
**Relacionado:** `2026-10-17-prompt-limpieza-foto-prenda.md` (versión anterior, con capas), ADR-0434, ADR-0228.

## La regla (decidida por Felipe, 2026-10-17)

- **Toda prenda** pasa por el mismo prompt: se le quita el fondo, el gancho y la sombra, se endereza y se deja simétrica, **sin alterar el diseño**, para que se vea bien en la página.
- **El armador de looks usa máximo 3 prendas**, una por zona: ARRIBA (top, blusa, polo, camisa, chaleco o casaca; una sola), PANTALÓN (pantalón, jean, falda o short) y CARTERA.
- Lo que no es de esos tres tipos (vestido, enterizo, conjunto, correa, máscara, calzado…) se limpia igual para la página, pero la IA lo marca **OTRO**: no entra al armador.

Hoy el probador construido (ADR-0434) todavía acepta vestido y «encima». Alinearlo con esta regla es un cambio aparte, con el OK de Felipe.

## Por qué el encuadre es tan estricto

El probador dibuja cada prenda a su largo real (cm) y a partir de la proporción de su recorte, y la ubica desde los hombros o la cintura. Por eso la
foto debe tocar los bordes reales de la prenda (sin gancho ni aire de más), ser de frente y sin perspectiva, no traer sombra ni otra prenda, y tener
los hombros y la cintura a nivel. Para la página, lo mismo da un resultado parejo en toda la grilla (ADR-0228: 4:5).

## El fondo: la IA entrega la prenda SIN FONDO (decisión de Felipe, 2026-10-17)

- La IA quita el fondo y entrega un PNG transparente. La opción «Sin fondo / Con fondo» del ERP (ADR-0228, recorte con MODNet) se va a quitar: es la que deja
  manchas y huecos en las prendas.
- La primera versión de este prompt pedía fondo gris claro (#EDEDED) para prendas blancas. Fue un error: el ERP da por «subida con su fondo» toda foto cuyo fondo
  no es blanco (`TONO_BLANCO = 245` en `apps/web/lib/recorte-probador-reglas.ts`; #EDEDED es 237) y la marca «Por revisar» con el motivo `con_fondo`. Pasó con
  «Basic Ori» (POL-0034): `foto_recortes.estado = por_revisar`, `motivo = con_fondo`.
- **Hecho en el ERP (ADR-0442, en la rama, falta probar con sesión real):** la foto se sube tal cual y el recorte del probador sale directo del canal alfa del PNG, limpiado. Una imagen sin transparencia (un JPG) se sube igual pero queda «sin recorte» y no entra al armador.
- Muchas IA dibujan cuadritos grises y blancos como si fueran transparencia. Eso es fondo, no transparencia: se revisa abriendo la imagen sobre un color (ver la revisión).

## El prompt (uno solo: la IA detecta el tipo)

Se pega completo en la IA con la foto de UNA prenda o producto.

```
Esta es la foto real de UN producto de mi tienda de ropa. Quiero una imagen limpia y estandarizada para mi página web, SIN cambiar el producto. Primero clasifícalo; después, límpialo.

PASO 1. CLASIFICA (solo uno)
- ARRIBA: top, blusa, polo, camisa, body, buzo, cárdigan, chaleco o casaca. Una sola prenda.
- PANTALÓN: pantalón, jean, falda o short.
- CARTERA: cartera, bolso o mochila pequeña.
- OTRO: vestido, enterizo, conjunto de dos piezas o más, ropa interior o pijama, correa o cinturón, máscara, gorro, bufanda, joyas, calzado, medias, lentes, o cualquier otra cosa. También OTRO si la foto trae dos prendas a la vez que se venden juntas.
Responde primero una línea: "TIPO: [ARRIBA | PANTALÓN | CARTERA | OTRO]". Si es OTRO, agrega entre paréntesis qué es (por ejemplo "OTRO (vestido)").
Los cuatro tipos se limpian igual; no te niegues a limpiar por ser OTRO. Solo si la foto está tan borrosa o cortada que habría que inventar partes, no generes imagen y responde "NO SE PUEDE: [motivo]".

PASO 2. IMAGEN DE SALIDA (siempre igual)
- Vertical 4:5, de frente, sin perspectiva ni inclinación.
- SIN FONDO: entrega un PNG con fondo TRANSPARENTE real (canal alfa), no un fondo blanco ni cuadritos de transparencia dibujados. Solo es transparente lo que en la foto original es el fondo: el exterior de la silueta, el espacio entre las piernas, entre el asa y la cartera. Una abertura DEL DISEÑO de la prenda (ojal o gota en el pecho, escote, cut-out, espalda abierta) NO es fondo: lo que se ve por ahí en la foto original (la tela de atrás de la prenda, el forro, el interior del cuello) se queda tal cual, opaco; no lo vacíes ni lo rellenes. El producto queda 100 % opaco, sin zonas medio transparentes ni grises, sin manchas, sin huecos dentro de la tela y sin halo ni borde claro o de otro color; solo el borde exterior puede estar suavizado 1 o 2 píxeles. Solo las transparencias reales de la tela (encaje, tul, malla) se respetan. Si la prenda tiene espalda descubierta o abierta, decide por lo que muestra la foto original: si por la abertura se ve el fondo, es transparente; si se ven tirantes, amarres, cierres o tela, se quedan tal cual. No inventes tela, tirantes ni espalda que no se ven.
- Si no puedes entregar transparencia real, dímelo y entrega la imagen con fondo blanco puro #FFFFFF, liso, sin degradado, sin sombra y sin reflejo.
- Solo el producto. Sin gancho, pinzas, maniquí, persona, manos, otra prenda que no se venda con él, etiqueta colgante ni texto.
- Centrado, con el eje vertical recto, y ajustado al encuadre: toca casi los bordes (margen de 3 % como máximo) por el lado más largo. No cortes ninguna parte. Sin sombra proyectada debajo.
- Endereza y deja simétrico el producto: lados a la misma altura, mangas o piernas con el mismo ángulo. Quita solo las arrugas de la toma; los pliegues del diseño (plisados, fruncidos, vuelos) se quedan. Luz pareja y colores fieles al producto real.

SEGÚN EL TIPO
- ARRIBA: el borde superior es la línea de los hombros o el cuello, con los hombros a nivel. El escote, el cuello y cualquier abertura del diseño (ojal, gota, cut-out) quedan como son; lo que se ve por ahí en la foto original (el interior o la parte de atrás de la prenda) se queda, sin piel ni maniquí y sin convertirlo en transparente. Las mangas caen rectas a los lados, apenas separadas del cuerpo. El borde inferior es el bajo, recto. Una casaca o un chaleco se muestra CERRADO, como se llevaría puesto solo, sin nada debajo. Una prenda abierta de diseño (cárdigan, kimono) se queda abierta y con su interior como es, sin rellenarlo.
- PANTALÓN: la pretina, recta y horizontal, es el borde superior. Las piernas caen rectas, paralelas y del mismo ancho, sin cruzar; entre ellas hay fondo. El bajo toca el borde inferior. Una falda cae con su vuelo natural, parejo a los dos lados.
- CARTERA: el asa o la correa en su posición natural (sin estirar), sin contenido ni etiqueta colgante. Si tiene correa larga, recógela para que la cartera sea lo principal y quepa sin cortarse.
- OTRO: preséntalo entero, de frente y como se vende. Vestido o enterizo: de los hombros al bajo, con el vuelo natural y parejo. Conjunto o dos prendas que se venden juntas: todas visibles, una al lado o encima de la otra en su lugar natural, sin taparse ni inventar ninguna. Correa o cinturón: extendido recto, con la hebilla y los detalles a la vista. Calzado: el par de frente, lado a lado. Máscara, gorro, bufanda, joyas, lentes u otro accesorio: de frente, completo y centrado.

LO QUE NUNCA HACES
- No cambies el color ni el tono. No cambies estampado, bordado, costuras, botones (cantidad, posición, forma), cierres, bolsillos, cuello, hebillas, largo ni proporciones.
- No conviertas en transparente ni rellenes ninguna parte de la prenda, ni siquiera una abertura de su diseño.
- No inventes lo que no se ve. Simétrico no es espejo: si el producto es asimétrico de diseño (hombro caído, bajo en diagonal, bolsillo de un solo lado, estampado descentrado), se queda asimétrico.
- Si para limpiarlo tendrías que cambiar algo de lo anterior, no lo cambies y dime qué era.

Al terminar, dime en una línea si ajustaste algo que no esté en esta lista.
```

## Qué contesta la IA

| La foto es… | La IA responde | ¿Entra al armador? |
|---|---|---|
| Polo, blusa, casaca, chaleco | `TIPO: ARRIBA` + imagen limpia | Sí |
| Jean, pantalón, falda, short | `TIPO: PANTALÓN` + imagen limpia | Sí |
| Cartera o bolso | `TIPO: CARTERA` + imagen limpia | Sí |
| Vestido, enterizo, conjunto, correa, máscara, calzado… | `TIPO: OTRO (…)` + imagen limpia | No, solo la página |
| Foto muy borrosa o cortada | `NO SE PUEDE: …` y ninguna imagen | No: se vuelve a fotografiar |

## Cómo probarlo antes de dárselo al equipo

Con 8 fotos reales: un polo, una casaca, un jean, una falda, una cartera, un vestido, una correa y un conjunto. Se espera `ARRIBA` ×2, `PANTALÓN` ×2, `CARTERA` ×1 y `OTRO` ×3, todas con imagen limpia. Se mira
que ninguna cambie color, botones o estampado, y que en `OTRO` el conjunto muestre todas sus piezas sin inventar ninguna.

## Revisión de 10 segundos antes de subir

0. ¿El fondo es transparente de verdad? Ábrela sobre un color (en el ERP, la miniatura sobre fondo de color): no deben verse cuadritos dibujados ni un borde claro.
1. ¿Es SOLO el producto, sin gancho, sombra, manchas ni huecos dentro de la tela?
2. ¿Tiene el mismo color, botones, estampado y largo que la foto original? (Se mira con el «Antes» de la revisión del ERP.)
3. ¿Está derecho, centrado y toca casi los bordes?

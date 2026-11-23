# Ficha al milímetro · «Seda», el fondo del marco (2026-11-18)

Propósito: que el vidrio tenga algo que doblar detrás, sin distraer de lo que se lee. Reemplaza a la Aurora. Pedido y decisiones de Felipe
(mirando la maqueta `docs/maquetas/vidrio-que-dobla-2026-11/`): «no fondos planos ni puntos de colores que se desvanecen», y difuminado,
porque las líneas nítidas «distraen de lo importante y debe ser algo sutil». ADR-0681.

Armada con el ERP local (rama `claude/system-aesthetics-analysis-96733d`): los números de Color salen de `lib/tema-tokens.test.ts`, lo demás
de `apps/web/app/estilos/vidrio/marco.css` (`.marco-seda`).

## Árbol (reglas 1–3)

No existía una pieza para «el fondo del marco» en la tabla de piezas únicas: era la Aurora, propia del marco (ADR-0596). Rama 3: se dibujó
como propuesta en la maqueta, con quince fondos lado a lado, y **Felipe eligió mirando** el 2026-11-18. No entra a `components/ui/`: es una
regla de `vidrio/marco.css` y un `<div aria-hidden>` en `components/AppShell.tsx`.

DECIDÍ: hacerla solo con CSS, nueve degradados sobre un elemento fijo.
DESCARTÉ: dibujarla en un lienzo como en la maqueta (necesita JavaScript, hay que redibujar al cambiar de tema y sus colores serían cadenas
`rgba()` fuera de los tokens); una imagen (pesa, y hace falta otra para el oscuro); un sombreador WebGL (una librería antes de su 1.0 y un
contexto gráfico siempre encendido en teléfonos de gama baja).
SE ROMPE SI: alguien le sube el tono para que «se note más». Ver Color.

## Textos

No lleva texto. Va con `aria-hidden`.

## Espacio

- Cubre la pantalla: `position: fixed; inset: 0; z-index: -1`. Queda sobre el crema del `body` y bajo todo el contenido.
- Cuatro pliegues. Cada uno es el arco de un círculo cuyo centro está fuera de la pantalla y que pasa por un punto de ella:

  | Pliegue | Centro | Radio |
  |---|---|---|
  | 1, el de atrás | −30vw, 150vh | `hypot(108vw, 150vh)` |
  | 2 | 135vw, −60vh | `hypot(113vw, 60vh)` |
  | 3 | −15vw, 200vh | `hypot(15vw, 138vh)` |
  | 4, el de adelante | 155vw, 135vh | `hypot(55vw, 85vh)` |

- El borde de cada pliegue se deshace en 44 px y su sombra en 130 px. Ninguna línea de 1 px.
- La zona del título (arriba a la izquierda) queda dentro del pliegue 1, sin bordes que la crucen.

## Tipografía

No aplica: no lleva letra.

## Color

Solo tokens. Una sola familia: crema, papel y hueso, con una pizca de ámbar en el canto del oscuro.

| Tono | Claro | Oscuro |
|---|---|---|
| hondo | hueso 50 % sobre crema | crema |
| medio | hueso 24 % sobre crema | papel 55 % sobre crema |
| claro | papel | papel |
| brillo | vidrio 60 % sobre papel | ámbar 8 % sobre papel |
| sombra | el tono hondo al 85 % (tiñe, no oscurece) | sombra al 40 % |

**Sobre el fondo va texto directo** (la línea de sede, una bajada, un enlace rojo), así que cada tono tiene que dejar leer todo color de
texto → `[Norma]` WCAG 1.4.3 (4.5:1). Medido por `lib/tema-tokens.test.ts`, bloque «el fondo Seda»: 16 colores de texto × 4 tonos × 2 temas.
El más justo es el rojo: **4,54:1** sobre el hondo en claro y **4,83:1** sobre el brillo en oscuro.

Por eso Seda es más pálida en el ERP que en la maqueta: allá el tono más hondo era un tostado (ámbar al 37 %) donde el rojo quedaba en
2,73:1 y el taupe en 2,8:1.

## Estados

No es una pieza interactiva. `pointer-events: none`.

| Estado | |
|---|---|
| default, hover, focus, active, selected, disabled, loading, error, read-only, vacío | no aplica: no se toca ni recibe foco |
| quieto | con las animaciones apagadas aparece de una vez, sin el fundido (`app/estilos/movimiento.css` y el bloque `prefers-reduced-motion` de `marco.css`) |

## Movimiento

Entra una vez con un fundido de 1,4 s en `--ease-cayla` (`marco-seda-entra`), el mismo que tenía la Aurora, y no se mueve más. Sin bucle
(ADR-0136).

## Accesibilidad y costo

- `aria-hidden`: el lector no la anuncia.
- **Modo liviano:** no se dibuja (`app/estilos/liviano.css`, vigilado por `lib/liviano.test.ts`).
- **Imprimir:** no se dibuja.
- **Sin `filter`:** la suavidad va en el degradado. Un `filter: blur()` sobre una capa fija del tamaño de la pantalla es lo que ADR-0623 quitó
  de la Aurora. Lo vigila la misma prueba.
- **`hypot()`:** un navegador que no lo entiende descarta esa declaración y se queda con la anterior, un degradado liso de crema.

## Sin medir

- La fluidez al desplazar, antes y después. El panel del navegador estaba oculto al medir y sus tiempos no valen. Queda para el Mac mini.
- El auditor de modo oscuro (`tema:auditar`) no ve fondos hechos con degradados: mide el texto contra el crema del `body`. La garantía de
  contraste sobre Seda es la prueba de tonos, no el auditor.

## Propuestas de mejora al repo

Ninguna.

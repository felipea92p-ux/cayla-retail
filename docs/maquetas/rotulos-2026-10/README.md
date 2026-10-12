# Maquetas · Rótulos de anaquel (2026-10-12)

> **Estado: elegida la A «Rollo» (Felipe, 2026-10-12), con «Quitar todas», y construida** (ADR-0366, act. 2026-10-12:
> `components/rotulos/TiraBrother.tsx`, `app/estilos/rotulos-brother.css`, `components/ImprimirRotulos.tsx`). Lo que sigue describe
> las tres tal como se mostraron. La luz de la Brother quedó fija (sin el bucle de la maqueta).

`index.html` es una sola página. La barra negra de arriba deja elegir la maqueta (A, B o C), verla en escritorio
o en celular a 375 px, en claro u oscuro, vacía o con 3 prendas. También apaga el movimiento continuo o todo el
movimiento. «↺ Ver la entrada otra vez» repite la llegada. Todo se puede tocar: buscar y sumar prendas con Enter, quitarlas,
«Uno por prenda / Todas en uno», las copias (con − +, con las flechas o con un número) e «Imprimir». La impresión
en la maqueta solo hace la animación y muestra el aviso; no manda nada a una impresora.
Atajos: `?m=B`, `?inicio=lleno`, `?tema=dark`, `?vista=celular`.

## Lo que pidió Felipe

Mejorar el diseño de la vista de Rótulos, con tres maquetas de diseño sofisticado, elegante y con muchas animaciones.
Captura de partida: el estado vacío (`Vacio` con el poste y un buscador al centro, la cabecera `CabeceraPantalla` y la flecha
de volver en su propia fila).

## Las tres

| | A · Rollo | B · Anaquel | C · Molde |
|---|---|---|---|
| La idea | La pantalla **es la Brother**: la tira sale con los rótulos uno bajo otro | El rótulo **ya pegado en el canto** del anaquel, bajo su pila de prendas | El rótulo **en grande sobre el tapete de corte**, con cinta métrica y cotas |
| Responde a | «¿Qué va a salir?» | «¿Cómo se verá en el almacén? ¿Se lee de lejos?» | «¿Está bien hecho? ¿Qué tan grande sale la letra?» |
| Elegir prendas | Fichas + buscador en una tarjeta a la izquierda | Lista numerada (el número es su lugar en el anaquel) con las copias en cada fila | Una sola caja con las prendas como fichas adentro (⌫ quita la última) |
| Copias | Al costado de cada rótulo de la tira | En la fila de cada prenda | En la ficha del rótulo que está sobre el tapete; «× 2» en la tira de contacto |
| Vacía | La Brother asoma un rótulo de ejemplo en gris: «Así sale un rótulo» | El anaquel con los lugares en punteado: «Aquí va el rótulo» | El tapete con el rótulo de ejemplo y sus cotas |
| Lo que solo tiene ella | Cuánto papel usa la tira («unos 16 cm») | **«Mirar desde» 1,5 m y 3 m**: aleja el anaquel y marca en ámbar el rótulo que ya no se lee | **Cuánto mide la letra y desde dónde se lee**, y cuánto bajaría si se juntan, antes de decidir |
| Carácter | La más física y lúdica | La más fácil de entender sin explicación | La más precisa y la más sobria |

## Igual en las tres

- **Qué hace la pantalla no cambia:** buscar y sumar prendas, quitarlas, uno por prenda o todas en uno (hasta 4),
  copias de 0 a 20, imprimir en la Brother con la forma A o B de esa computadora (`useImpresionBrother`).
- **El rótulo se dibuja con las reglas de verdad:** `armarRotulos` y `medidaNombre` copiadas de `lib/rotulos-reglas.ts`,
  y el CSS de `app/estilos/rotulo.css` en milímetros. Lo que se ve es lo que sale. El papel es blanco y negro en los dos
  temas (papel físico, ADR-0336).
- **La cabecera pasa a la de Productos y Existencias** (`EncabezadoPagina`: la flecha de volver junto a la sede, ADR-0358).
  Hoy Rótulos usa `CabeceraPantalla`, la de Finanzas, y la flecha va en una fila aparte.
- **Piezas únicas de ADR-0358:** botones `btn-cayla` con su movimiento (sube, luz que cruza, onda donde tocaste) y la voz
  de cabecera en versalitas; el buscador hundido con lupa, «/» y «×»; «Cómo salen» como `SegmentoDeslizante forma="modo"`;
  la nota en hueso con su «i»; el aviso de éxito arriba a la derecha, después del trabajo (ADR-0149).
- Solo tokens de la guía (ADR-0169) y su oscuro (ADR-0336). El color de cada prenda es dato y no cambia con el tema.
- Con `prefers-reduced-motion` (o «Movimiento reducido») todo aparece quieto.

## A decidir con Felipe (además de elegir A, B o C)

1. **El movimiento (ADR-0136).** Todo lo que se mueve responde a algo que se tocó (sumar, quitar, juntar, imprimir) o
   es la entrada de la pantalla, sin rebote. El único bucle es la luz verde de la Brother en A (interruptor
   «Movimiento continuo»). Si se elige A con esa luz, queda como excepción escrita en ADR-0136, como la persiana de Caja.
   El cabezal rojo que baja al imprimir es señal («se está imprimiendo»), no adorno.
2. **El vacío deja de ser `<Vacio>`.** En las tres, el estado vacío es parte de la escena: la Brother, el anaquel o el
   tapete. Muestran el rótulo de ejemplo en vez del poste. Es apartarse de la pieza única de vacíos (ADR-0358): se decide al elegir.
3. **«Se lee desde» (B y C) es una estimación:** la mayúscula se lee bien hasta unas 350 veces su alto (regla de
   rotulación; `seLeeHasta` en `_comun.js`). Con eso, «Chaleco Valeria» (11 mm) se lee a unos 2,5 m y tres prendas
   juntas (4,8 mm), a un metro. **Antes de mostrarle una cifra a una colaboradora, se calibra con un rótulo impreso
   pegado en el almacén** (¿hasta dónde se lee de verdad?). Si no se calibra, B queda con «Mirar desde» sin cifras y C
   sin la fila «Se lee desde».
4. **«Prenda» en vez de «modelo»** en el título, el buscador y «Uno por prenda»: lo pidió la prueba ciega de
   `/formidable` (docs/formidable/rotulos.md, «modelo» se leyó como una persona).

## Al implementar (lo que se elija)

- Cambia `ImprimirRotulos.tsx` y su CSS. No cambian `lib/rotulos-reglas.ts`, `lib/rotulos.ts`, `RotuloAnaquel.tsx`, la
  hoja de impresión (`#rotulos-print`) ni `useImpresionBrother`.
- La vista previa de A y C usa `zoom` medido como hoy (`VistaQueCabe`); B escala el anaquel con `transform`.
- `/rotulos` está «no-aplica» en `lib/guia-de-foco-pantallas.ts` y así sigue (un buscador y nada obligatorio).
- Antes de darla por terminada: `/formidable`, `/unificar` (el vacío, ver punto 2), `tema:auditar` con la ruta
  `/rotulos` en claro y oscuro, y la prueba en papel en la Brother del almacén.

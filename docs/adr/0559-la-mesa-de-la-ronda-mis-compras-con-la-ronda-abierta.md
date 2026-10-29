# ADR-0559 — «La mesa de la ronda»: Mis compras con la ronda abierta, en PC y en celular

- **Fecha:** 2026-10-28 · **Estado:** construido y verificado en local (sin migración); la maqueta está en `docs/maquetas/mis-compras-pc-mesa-2026-10/`.
  El número de este ADR está reservado para la rama `claude/mesa-de-la-ronda` (`pnpm reservar`).
- **Continúa a:** [ADR-0480](0480-compras-simple-en-cuatro-pasos.md) (Compras simple: Mis compras, la ronda de compras y los envíos).
- **Relacionados:** ADR-0358 (una función, una pieza), ADR-0169 y ADR-0336 (tokens y modo oscuro), ADR-0136 (movimiento), ADR-0389 (guías interactivas).
- **Origen:** Felipe, 2026-10-28, mirando una captura de Mis compras en PC: «¿por qué se ve tan básico?», y después: «en celular también debe verse bien».

## El problema

Mis compras se había diseñado para el celular y en PC solo reacomodaba las mismas piezas en tres columnas angostas con el mismo peso. Con la ronda
abierta pasaban tres cosas: «Envíos de esta ronda» ocupaba una sección entera para decir que no había ninguno; los montos eran cifras sueltas sin un
total; y los estados eran píldoras idénticas, sin distinguir lo que falta hacer de lo que ya pasó.

## Lo que se decidió

1. **Una sola pantalla para PC y celular, con la misma información** (maqueta aprobada por Felipe mirándola, a 1440 y a 375 px, en claro y oscuro). De
   arriba abajo: el camino de la ronda · tu plata y lo que haces · lo que pasó en la ronda y lo que falta mandar · «Cerrar mi ronda» · rondas anteriores.
   El orden del DOM es el del celular y **no usa `order`**; en PC la rejilla reparte filas: de 1024 a 1279 px la lista y «Para mandar» se apilan (la
   tabla necesita el ancho) y desde 1280 px van lado a lado. Vive en `components/mi-plata/MesaDeLaRonda.tsx`, que **solo coloca**: no decide nada.
2. **La billetera dice cuánto de tu plata ya usaste** (`usoDeLaPlata`, regla pura): lo usado (comprado + gastado) sobre lo que tenía (lo dado + lo que ya
   tenía al abrir; si le debían, eso no suma), redondeado **hacia abajo**; sin base no se dibuja. La barra es `<BarraAvance sobreTinta>`: **la misma
   pieza**, con una variante para superficies de tinta (como `<Anillo sobreTinta>`), registrada en `docs/unificar/grafico.avance.md`.
3. **«En esta ronda»** pasa a tabla en PC (`<Tabla>` + `<Encabezado>`, las piezas del ERP) y sigue siendo lista en celular, con la hora bajo el monto. El
   estado de envío sale del detalle y va en un chip: **ámbar «Falta mandar a TRU»**, **verde «Enviada · ENV-…»**, y quién lo revisa en pizarra. Al pie, lo
   que entró y lo que salió (`totalesDeLaLista`, de `valor`, no de los textos). La regla suma `envio` y `resumen` a `MovimientoCompradora`; el `detalle`
   completo se queda para la hoja de la fila.
4. **«Para mandar» junta la franja ámbar y los envíos de la ronda en una tarjeta** (`ParaMandar`): cada tienda con sus prendas, «Mandar a TRU», cuántas
   prendas de la ronda ya salieron (`avanceDeEnvios`, sin los anulados) y al pie los envíos con su código o, sin ninguno, una línea tenue. El botón **abre
   la misma hoja «Mandar a la tienda»** (sigue montada, sin su franja, y se abre con el `EVENTO_MANDAR` que ya usaba «Cerrar mi ronda»): lo que se manda
   y cómo no cambia.
5. **«Cerrar mi ronda»** es el último paso del camino: una franja que dice si antes falta mandar algo (botón secundario) o si ya se puede cerrar (primario).
   El botón siempre se puede tocar; la hoja es la que dice «Antes, manda». Sin compras dice que la ronda sigue abierta.
6. **«Rondas anteriores»**: las tres rondas cerradas más nuevas son tarjetas (número, de cuándo, cuántas compras, lo que salió de tu plata y cómo cerró) que
   abren la hoja de la ronda; lo demás, tras «Ver N más». Usa los datos que ya trae el historial.
7. **El camino de la ronda** gana `enLinea` y `lado` (`CaminoDePasos`): desde `lg`, círculos unidos por líneas del mismo largo y, a la derecha, la ronda y
   desde cuándo; en celular siguen las rayitas de hoy.

## Lo que NO cambió

Sin migraciones, sin RPC nueva y sin cambio de permisos: es solo web. Lo que guarda cada botón (anotar plata, anotar gasto, mandar, cerrar la ronda) y sus
hojas siguen igual. Sin ronda abierta la pantalla es la de siempre (abrir la ronda, «Tu última ronda»). `FranjaFaltaMandar` sigue viva (la usan la hoja de
«Cerrar mi ronda» y Mis envíos).

## DESCARTÉ

- **Una tabla también en el celular**: cuatro columnas no caben en 375 px (lo vio Felipe en la primera maqueta); por eso la lista conserva su forma.
- **Reordenar con `order`** para llevar «Para mandar» antes de la lista en el celular: el DOM, el teclado y el lector de pantalla quedarían en otro orden que
  lo que se ve. En PC se coloca por columna y fila; en el celular, el DOM ya va así.
- **Otra barra de avance** para la billetera: se agregó la variante `sobreTinta` a la pieza decidida (ADR-0358) en vez de dibujar otra.
- **Textos nuevos en los botones de acción** que la maqueta inventó («Anota lo que te mandaron»): se usan los que ya tiene la app.

## Cómo se verificó

`pnpm typecheck`, `pnpm knip`, las pruebas de las reglas (`usoDeLaPlata`, `totalesDeLaLista`, `avanceDeEnvios` y la forma de `MovimientoCompradora`), las
guías con su huella de controles y la suite completa de `apps/web`. En la pantalla real —`MesaDeLaRonda` con los datos de la captura de Felipe, sin base—
a **1920, 1440, 1100 y 375 px**, en claro y oscuro, con los estados «sin envíos», «todo mandado» y «ronda recién abierta».

**Falta:** probarlo con la base local y una cuenta real (`pnpm --filter web tema:auditar` y `guias:recorrer` piden la base), con muchas compras en la
tabla, y la pasada de `/formidable` con una compradora.

# ADR-0346 · Movimientos: los tipos que se ven (sello, color, ruta y una columna de filtros a la derecha)

- **Fecha:** 2026-10-05 · **Estado:** construido en la rama `claude/movimientos-module-redesign-7659ce` (siete actividades, un commit cada una, más
  una ampliación de la base). **Una migración de funciones de lectura (`20261005160000`) aplicada SOLO en la base local; falta pegarla en
  producción, con el ok de Felipe y ANTES o junto con la web.** Verificado: `tsc`, ESLint y las pruebas de `apps/web` en verde, 5 pruebas SQL de
  Movimientos contra el Postgres local (33 + 27 + 72 + 11 + 146 verificaciones) y la pantalla real a 1.100 px y a 375 px con datos locales.
- **Pedido:** Felipe, 2026-10-05: «rediseñar Movimientos para que sea más entendible, que se diferencie por algo más notorio si es una venta, una
  colgada en piso o una subida de almacén». Tres maquetas; eligió la **A · Ruta**, con los siete botones de tipo **en una columna a la derecha**.
- **Maqueta:** `docs/maquetas/movimientos-rediseno-2026-10/` (`a-ruta.html`; B y C quedan como referencia). **Complementa:** ADR-0234 (las cifras
  desde la tienda), ADR-0241 (Movimientos conectado), ADR-0327 (cifras que dicen la verdad), ADR-0136 (movimiento). **Revoca en parte:** la banda
  negra del día y el cajón de «todas las bajadas juntas» (ADR-0241, 2026-09-28 y 2026-10-01).

## El problema

Una venta, una bajada al piso y un retiro del piso se leían casi igual: una fila con un punto de color, un chip y un número. Distinguir una colgada de
una guardada exigía leer el texto, y la base ni siquiera las separaba (las dos son «interno»).

## Decisiones

**1. Trece tipos que se ven, cada uno con su sello** (`lib/movimientos-tipos.ts`, `components/movimientos/SelloTipo.tsx`).
DECIDÍ: cada movimiento se dibuja con **un tipo** —venta, colgada, guardada, llegada, traslado enviado, devolución, cambio, ajuste a mano, conteo,
apartado, dañado, movido, otro— que trae su nombre, su color, su ícono y su grupo del filtro. El tipo NO es una clasificación nueva de la base: sale
de lo que `fn_movimientos` ya devuelve (categoría, proceso, signo y el **par de lugares**). `tipoVisual` es la única función que lo decide.
ES COMO ESTÁ PORQUE una persona sin formación técnica tiene que reconocerlo sin leer: el color solo no alcanza (un daltónico, un celular al sol), así
que cada tipo suma forma (el ícono), texto (el rótulo) y camino (la ruta). DESCARTÉ colorear por categoría de la base (`tonoCategoria`): no separaba
una bajada de un retiro, que era justo lo que Felipe pidió.

**2. Las palabras, para todo el sistema: «Colgada en piso» y «Guardada en almacén»** (Felipe, 2026-10-05). Reemplazan a «Bajada al piso» y «Retiro del
piso» (ADR-0234, `INTERNO_POR_PAR`). Plurales: «Colgadas en piso», «Guardadas en almacén». **En esta construcción solo cambian dentro de Movimientos**
(filas, filtros, cajón, exportación y buscador, que sigue entendiendo «bajadas» y «retiros»). El resto del sistema —el módulo «Bajar al piso», el Punto
de venta, la acción «Colgar en el piso» y «Subir a almacén» de Existencias (ADR-0339, ADR-0344), Frescura— todavía las dice de otro modo (~170 menciones):
**unificarlas es una decisión que toca varios módulos y queda en el backlog.** En particular, la acción de Existencias se llama «Subir a almacén» y el
proceso en Movimientos «Guardada en almacén»: Felipe decide si se alinean.

**3. Colores, solo de la paleta oficial** (ADR-0169). Venta **verde**; llegada **verde oliva**; colgada **ámbar**; guardada **pizarra**; traslado
enviado **tinta**; devolución y cambio **rojo**; ajuste y conteo **taupe con borde punteado** (lo único del módulo sin documento detrás); dañado rojo
profundo. El oliva es el token nuevo `--color-oliva` = verde 66 % + ámbar 34 % (`color-mix`): sale de la paleta y la sigue si la paleta cambia, no es un
hex suelto. El sello es un cuadrado **suave** del color (15 % sobre papel) con el ícono en el color y un aro fino, no un bloque sólido (Felipe pidió «aterrizar
más la paleta a la estética de CAYLA»). El rojo, que hoy es «una alarma», queda para cuando el dinero vuelve.

**4. Los siete botones en una columna a la derecha** (`components/movimientos/TiposMovimiento.tsx`). Cada botón es el filtro de su tipo Y su cifra
(operaciones y prendas, con conteo y barra). Reemplazan a las píldoras de tipo de `FiltrosMovimientos` y a las tres tarjetas de arriba (Entró, Salió,
Ajustes); lo que decían no se pierde: los **ajustes siguen en bruto** («−35 faltaron · +87 aparecieron», ADR-0327), las ventas anuladas se dicen junto a las
ventas («1 se anuló») y el desglose por proceso («80 por traslado · 13 de stock inicial») está en la ayuda de cada botón. Son enlaces: la URL manda (`?cat=`).
Desde `lg` la columna acompaña al bajar; debajo, una fila que se desliza arriba de la lista. La fila de procesos sigue bajo el tipo elegido.

**5. La base separa los tipos** (migración `20261005160000_movimientos_colgada_y_guardada.sql`, solo funciones de lectura, re-pegable). `fn_movimientos`
acepta `p_categoria` = `venta | colgada | guardada | llegada | traslado | cliente` y `fn_movimientos_resumen_procesos` suma esos mismos grupos. Es la
**misma lectura** que hace `tipoVisual` en la web: si se cambia una, se cambia la otra (lo vigila `pnpm pruebas:movimientos-colgada-y-guardada`, 33
verificaciones, cableada en el CI). Hizo falta porque con los filtros de siempre solo las ventas se podían pedir exactas: «Entradas» trae devoluciones,
«Traslados» las dos piernas, y colgada y guardada solo se distinguen por el par de sububicaciones. **Si la web sale antes que la migración**, la lista cae
a `interno` (no se rompe) y los botones muestran cero hasta que se pega.

**6. El día con franja y el mazo** (`EncabezadoDia.tsx`, `FilaBajadas`). El día lleva su nombre y una franja de color por operación (tocar una lleva a su
fila). **Sin la cifra «N operaciones»**: era la de la página cargada, no la del día (ADR-0327). Las colgadas del día van en un **mazo** que se abre en abanico
y las guardadas en otro (`plegarBajadas` ahora separa por par); lo interno de otro par (cuarentena) no se pliega. Cada operación del abanico abre su cajón.

**7. El cajón con su sello, su ruta y «Qué pasó»** (`CajonMovimiento.tsx`, `pasosDeOperacion`). La cabecera lleva el sello y el color del tipo; después de la
frase vienen la ruta y tres pasos. **Los pasos salen solo de lo que el registro respalda** (el lugar, la boleta, lo contado, la diferencia del cambio, el
estado del traslado): la maqueta decía «revisada y aprobada» y la base no lo guarda, así que no se dice; un stock inicial no inventa un origen.

## Movimiento (excepción a ADR-0136, pedida por Felipe)

Los sellos se mueven **una vez** cuando se ven y otra al pasar el mouse por su fila, y el trayecto lleva una prenda que viaja de un punto al otro. El
perchero de la colgada **se mece** (un péndulo que se asienta, como el cartel de ADR-0301). Límites que no cambian: `--ease-cayla`, **nada en bucle, nada con
rebote**, colores solo de la paleta, y con `prefers-reduced-motion` todo se apaga. Vive en `app/estilos/movimientos-sellos.css` (clases `mv-*`). No se
generaliza: otra pantalla que lo quiera lo pide con Felipe.

## Lo que NO se hizo, a propósito

- **No se cambió el resto del sistema** (decisión 2) ni el módulo «Bajar al piso».
- **La fila que se despliega dentro de la lista** (la de la maqueta) no va: el cajón ya cumple ese papel. Se puede sumar.
- **No se pegó la migración en producción.** Falta el ok de Felipe. Al pegarla, correr `pnpm datos:generar:produccion` no hace falta (no hay tablas nuevas).
- **No se movió la pestaña «Pérdidas»** (ADR-0328): sigue donde está.

## Cómo se verifica

`pnpm pruebas:movimientos-colgada-y-guardada` (contra el Postgres local), `pnpm --filter web test`, y en el navegador: `/inventario/movimientos?rango=90` →
tocar un botón filtra y se aprieta; `?cat=colgada` y `?cat=guardada` traen solo lo suyo; abrir una colgada muestra el sello, la ruta Almacén → Piso y tres
pasos. A 375 px la fila de botones se desliza y el trayecto se lee entero.

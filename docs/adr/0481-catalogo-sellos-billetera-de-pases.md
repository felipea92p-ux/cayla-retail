# ADR-0481 — Catálogo ▸ Sellos: los sellos salen de Atributos, las campañas entran como su primera vista, y la pantalla es una billetera de pases

- **Fecha:** 2026-10-22 · **Estado:** aceptado (Felipe eligió la maqueta «II · Pases» el 2026-10-22). Rama `claude/sellos-catalog-submodule-00ddc7`.
- **Relacionados:** ADR-0473 (Catálogo ▸ Campañas y los sellos, del mismo día, que esta decisión reemplaza en lo visual y en el menú),
  ADR-0161 y ADR-0306 (módulos y roles; un módulo es una entrada del menú), ADR-0136 (movimiento, con la excepción de abajo), ADR-0441
  (la lectura de Rotación), ADR-0333 (la prenda sin foto), ADR-0358 (una función, una pieza), ADR-0389 (guías).
- **Maquetas:** `docs/maquetas/sellos-2026-10/` (v1, v2 y v3, con su README).

## El problema

La mañana del 2026-10-22 (ADR-0473) los sellos quedaron como una pestaña de Atributos y las campañas, en su propia fila de Catálogo. Esa
tarde Felipe pidió otra cosa: «separar sellos del módulo de atributos, que se convierta en un submódulo más de catálogo; dentro debe estar
también campañas, campañas ya no sería un submódulo, sellos la debería reemplazar; ese submódulo debe mostrar principalmente las campañas
y luego se pueda elegir con botones las vistas de los demás sellos, como rotación, artesanal y general». Y que se viera distinto.

## Lo que se decidió

1. **Catálogo ▸ Sellos** (`/productos/sellos`) ocupa el lugar de «Campañas» en el menú (después de Atributos, antes de Liquidación). Atributos
   se queda con Colores, Tallas, Tejidos, Patrones y Temporadas.
2. **Cuatro vistas, las cuatro de siempre** (`lib/etiqueta-grupos.ts`): Campañas (la que abre), Rotación, Artesanal y General. Se cambian
   con las pestañas de vidrio (`<Pestanas>`), lo único que Felipe eligió de la v1 («me gusta la forma en que se cambia de sellos en la A»).
3. **La pantalla es una billetera de pases** (la «II · Pases» de la v3, elegida después de rechazar la v1 y la v2): cada sello o campaña es
   un pase; se apilan por pila —rigen hoy (la que termina antes, arriba), lo que viene, guardadas (sin fechas o ya pasaron), desactivadas— y
   se abre uno a la vez, con sus días, un recorrido de su duración, lo vendido en 30 días, lo que queda en las tiendas, su descuento y sus
   botones. Al lado, el pase abierto en grande: su nombre, una frase sacada de los datos («Un 10 % que todavía no llega a ninguna prenda»),
   sus **prendas reales** como lookbook (su foto o, sin foto, su categoría sobre su color: `FotoDePrenda`) y, en una campaña, «Lo que ya tiene»
   (fechas, prendas, descuento opcional).
4. **El sello se dibuja como un sello de tinta** (`components/sellos/SelloTinta.tsx`): redondo, su nombre en el borde, su grupo o su año
   abajo y el mismo dibujo de su tarjeta al centro, en el tono de su grupo (taupe, ámbar, verde, pizarra).
5. **Crear desde una vista nace con su grupo:** «Nuevo sello» desde Rotación nace de Rotación (antes todo sello nacía «General»). La política de
   alta ya aceptaba cualquier estilo.

## Roles y accesos (sin migración)

Siguen los dos módulos: «Sellos» (`etiquetas`) y «Campañas» (`campanas`). La fila Sellos declara `modulo: "etiquetas"` y `moduloAlterno:
"campanas"` (el mecanismo que ya usaba Atributos para los sellos). Quien ve Sellos ve las cuatro vistas (la base ya le dejaba guardar campañas:
`fn_puede_campanas`); quien solo ve Campañas entra a la misma fila y ve solo esa vista. **Nadie gana ni pierde un permiso**: los candados de la
base no cambian. Juntar los dos módulos en uno habría exigido mover roles por migración, y eso el repo no lo permite fuera de la siembra
(`lib/modulos.test.ts`). Felipe no lo pidió; si un día quiere un solo módulo, se decide aparte.

## Movimiento (excepción de ADR-0136)

Felipe pidió «sofisticado, elegante y con full animaciones». Corren UNA vez, con `--ease-cayla`, sin rebote: el sello se estampa (baja,
gira a su lugar y deja un anillo de tinta), el pase se abre y se cierra, el título sube por su ranura, el detalle y las prendas entran en
cascada, las cifras cuentan (`CifraQueCuenta`) y el visto de «Lo que tiene» se dibuja. Todo se apaga con `prefers-reduced-motion`. **Sin
bucles:** el punto que respiraba junto a «rige hoy» en la maqueta quedó fuera (un bucle nuevo lo aprueba Felipe aparte). Lo vigila
`lib/sellos-movimiento.test.ts`.

## Cómo se hizo

- **La base no cambia.** Mismas filas de `retail.etiquetas`, mismas rutas que guardan (`/api/productos/etiquetas`, `actualizar_campana_etiqueta`,
  `PrendasDeEtiquetaModal`), mismas hojas (`CampanaModal`, `NuevaEtiquetaModal`, exportadas de `components/EtiquetasLista.tsx`). La lista de
  tarjetas vieja (`EtiquetasLista`) se borró: su lógica de guardar vive ahora en `SellosPantalla.tsx`.
- **Las cifras** (unidades en tiendas, vendidas en 30 días) son la lectura de Rotación de ADR-0441 (`fn_analisis_sede` por tienda), ahora
  para todos los sellos y solo para quien puede analizar; sin ella, los pases dicen «—». La vitrina lee `colores`, `categorias` y
  `producto_fotos` (`cargarEtiquetasPantalla({ conVitrina: true })`); sin fotos, la prenda sin foto.
- **Lógica pura** en `lib/sellos-pases.ts` (pilas, cabecera del pase, prendas por modelo y color, frase, lo que tiene), con su prueba.
- **Rutas viejas:** `/productos/campanas`, `/productos/etiquetas` y `/productos/atributos?tipo=etiquetas` redirigen a Catálogo ▸ Sellos
  (`next.config.ts`). Los textos que decían «Catálogo ▸ Campañas» o «Atributos ▸ Sellos» dicen «Catálogo ▸ Sellos».
- **Guías:** nueva `productos.sellos`; la de Atributos ya no explica sellos; la de Campañas se fue con su pantalla.

## Descartado

- **Dejar Campañas como fila propia** (ADR-0473): Felipe pidió que Sellos la reemplace.
- **Un tablero con línea del año** (v1 «A»), **tabla con ficha** (v1 «B»), **cifras que eligen** (v1 «C»), **vitrinas, qué toca hacer y cuenta
  regresiva** (v2) y **editorial y pasarela** (v3): Felipe los vio y eligió los pases.
- **Juntar los módulos `etiquetas` y `campanas`:** ver «Roles y accesos».

## Verificado

En local (1440 px, claro y oscuro, y 375 px sin desborde): las cuatro vistas, cambiar de pase, la URL `?vista=`, el lookbook con fotos reales
(con 8 prendas marcadas a mano en la base local y borradas al terminar), las redirecciones, Atributos con sus cinco pestañas y la guía de
Sellos de punta a punta en el navegador (15 pasos, sin escribir nada en la base). Toda la suite de la web, `knip` y `knip:produccion`.

## Sin verificar

Producción. `guias:recorrer` (esta Mac no tiene el navegador de Playwright). Guardar de verdad desde la pantalla nueva (crear, configurar,
desactivar): usa las mismas puertas y hojas de antes, sin cambios, pero no se corrió `/chaos` sobre ella.

## Actualización 2026-10-22 (noche) — dos filas de prendas, el texto centrado y el detalle junto al pase en pantallas angostas

Felipe, mirando la pantalla con 39 prendas: «quiero que solo salgan 2 líneas y en la última de la derecha abajo salga el +28 dependiendo de las
prendas extra que haya, ya que los datos de abajo se pierden de vista muy fácilmente. Y centra mejor el texto de la campaña para que quede justo
en medio de las prendas, y verifica que todo sea lo más responsive posible, también desde teléfono».

- **Dos filas como mucho.** Cuántas prendas entran por fila lo decide el ancho (`repeat(auto-fill, minmax(--sl-min, 1fr))`); la pantalla lee
  esas mismas variables (`--sl-min`, `--sl-hueco`) y hace la cuenta del navegador (`columnasQueCaben`). Si sobran prendas, la última casilla de
  la segunda fila dice «+N» (`lookbookVisible`): 7 por fila y «+26» a 1920 px, 4 y «+32» a 1440, 3 y «+34» a 375.
- **El nombre, su línea de arriba y su frase, centrados sobre las prendas.** Con pocas prendas (no llenan una fila) también ellas se centran.
- **En pantallas angostas el pase en grande va justo debajo del pase abierto**, no al final de toda la pila. Se decide por el ancho de la
  pantalla de Sellos (consulta de contenedor de 56 rem), no por el de la ventana: a 1024 px, con el lateral abierto, dos columnas apretaban
  las prendas. La pantalla lee `--sl-columnas` del mismo CSS.
- **Una cifra de la derecha del pase nunca se parte** («8» / «AGO» con un nombre largo): el nombre se corta con sus puntos.

Verificado en local a 1920, 1440, 1280, 1024, 768, 414, 390, 375, 360 y 320 px: dos filas, el «+N» en la última casilla, el título centrado
exacto sobre las prendas, sin nada que se salga de la pantalla; pocas prendas centradas, una campaña sin prendas y una vista vacía (General).
Con prendas marcadas solo para la prueba en la base local (119 filas), borradas al terminar.


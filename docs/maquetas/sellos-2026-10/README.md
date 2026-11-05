# Maqueta · Catálogo ▸ Sellos (2026-10-22)

Felipe pidió (2026-10-22): sacar **Sellos** de Atributos y hacerlo su propia entrada de Catálogo; **Campañas deja de ser una fila
propia** y vive dentro de Sellos como su vista principal; con botones se ven los otros tres grupos de sellos: **Rotación, Artesanal y
General**. Y que se vea distinto.

Abrir `index.html` en el navegador (no necesita servidor). La barra negra de arriba no es parte del diseño: elige la dirección, el
tema (claro / oscuro) y el ancho (1024 · 1440 · 1920). Todo se puede tocar; nada se guarda.

## Versiones

- **v1** (`v1-tres-estilos.html`): tres estilos (A pestañas y el año, B tabla y ficha, C cifras y lo de hoy). Felipe se quedó **solo con
  cómo se cambia de vista en la A** (las pestañas de vidrio, `<Pestanas>`).
- **v2** (`v2-tres-formas.html`): Vitrinas, Qué toca hacer, Cuenta regresiva. A Felipe no le gustó ninguna.
- **v3** (`index.html`): «sofisticado, elegante y con full animaciones» (Felipe, 2026-10-22). Tres direcciones nuevas, todas bajo las
  pestañas de la A. El botón «↻ Ver la entrada otra vez» de la barra negra repite la coreografía de entrada.

## v3 · lo que comparten

- **Tipografía de revista:** EB Garamond grande (títulos de 58–64 px, cifras de hasta 118 px), una frase en cursiva bajo cada título
  dicha en lenguaje de tienda y sacada de los datos («Un 10 % que todavía no llega a ninguna prenda»), versalitas finas para lo
  pequeño, filetes de 1 px en vez de cajas.
- **El sello de tinta** (redondo, su nombre en el borde) que **se estampa** al aparecer: baja, gira a su lugar y deja un anillo de tinta.
- **Las prendas reales** (la baldosa de `MosaicoPrenda`), con su nombre y unidades al pasar el mouse.
- **Movimiento:** el título sube por una ranura, los filetes se dibujan, las cifras cuentan desde cero, las prendas entran en cascada,
  las esquinas de una página vacía se dibujan, el cambio de pestaña funde una vista en la otra, y los botones llevan su brillo y su
  flecha que avanza. Todo una sola vez y sin rebote (curvas que no se pasan de 1). **El único bucle es el punto verde que respira
  junto a «en tienda»**: dice «está vivo», y como todo bucle lo aprueba Felipe (ADR-0136). Con `prefers-reduced-motion` todo queda quieto.

## v3 · las tres direcciones

| | La idea | Lo que rige hoy | Lo que viene | Lo pasado | Los demás sellos |
|---|---|---|---|---|---|
| **I · Editorial** | Una revista de moda | La portada: dos páginas con el nombre enorme, los días en grande, el collage de prendas y sus cifras; la que no tiene prendas es una página vacía con marcas de corte | Un índice con los días en grande; cada fila se abre en un cajón con sus prendas | Un archivo en dos columnas, con puntos guía y «Repetir» | Una fila por sello: el sello, su frase, lo vendido en 30 días en grande y sus prendas |
| **II · Pases** | Una billetera | Los pases apilados; el abierto muestra sus días, un recorrido con el punto de hoy, sus cifras y sus botones | Pases en su pila, con los días que faltan | Pases en la pila «Guardadas» | Igual: un pase por sello |
| | | Al lado, el pase abierto en grande: su título, sus prendas como lookbook y «Lo que ya tiene» (fechas, prendas, descuento, diseño web) con su visto que se dibuja | | | |
| **III · Pasarela** | Un escenario | Al centro, la de hoy; las tarjetas se deslizan con ‹ › o las flechas del teclado y las prendas se abren en abanico | A la derecha | A la izquierda | La misma pasarela con sus sellos |
| | | Abajo, la elegida en detalle: su título, sus cifras que cuentan, lo que ya tiene y todas sus prendas | | | |

## Lo que queda por decidir (Felipe)

1. **Qué dirección** (o qué mezcla).
2. **Roles y accesos** (es de permisos: lo decide Felipe). Hoy hay dos módulos: «Sellos» (`etiquetas`) y «Campañas» (`campanas`). La
   propuesta: **se quedan los dos, sin migración**, y la fila Sellos se abre con cualquiera de los dos. Quien ve Sellos ve las cuatro
   vistas (la base ya le deja guardar campañas: `fn_puede_campanas`); quien solo ve Campañas ve solo esa vista. Juntarlos en uno
   obligaría a mover roles por migración, y eso el repo no lo permite fuera de la siembra.

## Lo que decido yo al construirlo

- La ruta nueva es `/productos/sellos` (`?vista=rotacion|artesanal|general`; sin nada, Campañas). `/productos/campanas` y
  `/productos/atributos?tipo=etiquetas` redirigen ahí, para que ningún enlace guardado se rompa.
- Las cifras (unidades en tiendas, vendidas) se leen por una función de la base de solo lectura; si no responde, la pantalla se ve
  sin esas cifras y no se cae.
- Guía interactiva, guía de foco, huella de controles y pruebas de menú y módulos se ponen al día en el mismo PR.

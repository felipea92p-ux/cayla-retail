# Maqueta · la casilla, el interruptor, los enlaces y los títulos de sección, con vidrio (2026-11-01)

Piezas de «3. Las pantallas» del tablero `docs/vidrio/README.md` (ADR-0596): `<Casilla>` (38 archivos) e `<Interruptor>` (19);
`btn-enlace` (181) y `<EnlaceVer>` (45); `<TituloSeccion>` (140), `<TituloGrupo>` (60) y `<SeparadorDia>` (6). Van juntas porque son
lo que arma una hoja de ajustes o una lista con días: el título, el grupo, el control y el enlace que lleva a otra parte.

Abrir `index.html` (o con la config `maquetas`). Va sobre el marco y las piezas elegidas (`../vidrio-base-2026-10/`), en una pantalla de
Avisos del club: a la izquierda los avisos automáticos con su interruptor, agrupados con `TituloGrupo`, y los canales con casillas
(una a medias, una apagada); a la derecha «Lo enviado», una lista que corre con sus separadores de día pegados arriba.

## Lo que hay hoy

- **Casilla e interruptor:** caja de papel macizo que, marcada, se llena de tinta sólida; el interruptor se prende en tinta sólida.
- **Enlaces:** ya son planos (subrayado tenue con el hilo rojo; versalitas rojas con la flecha).
- **Títulos:** serif plano; versalitas con una raya arena; el separador de día, una franja de papel al 92 % pegada arriba.

## Las caras

| Pieza | Caras |
|---|---|
| Casilla e interruptor | **A · Pozo y gota** (vacía, hundida; marcada, ahumada con ✓ crema) · B · Gota que se marca (sin relleno: filo y ✓ en tinta) |
| Separador de día | A · Franja de vidrio · **B · Gotas que flotan** (el día y su total en dos gotas; la lista pasa por debajo) |
| Títulos y enlaces | **A · Raya de luz** (todo plano; la raya arena pasa a una ranura tallada y el número del título es la gota elegida) · B · «Ver» en gota |

En negrita, la recomendada. Lo que gana y lo que cuesta cada una, al pie de `index.html`. **El interruptor es el mismo de la maqueta del
Inicio de una líder** (`../inicio-lider-vidrio-2026-10/`): lo que se elija aquí vale para los dos.

## Lo que no cambia

El ✓ que se dibuja, «a medias», la casilla apagada; la perilla que se estira al presionar; el hilo rojo del enlace y la flecha que avanza;
la raya que se dibuja una vez; el separador pegado arriba con «Hoy» y su punto rojo.

## Medido

En Chrome sin ventana: 270 combinaciones (320 a 1440 px, claro y oscuro, todas las caras), nada se desborda; sin errores de JS. Al
mirarlas apareció un error que venía de la maqueta del Inicio: en oscuro, el interruptor encendido con la cara A se pintaba con el fondo
del apagado (las dos reglas pesaban igual y ganaba la del tema). Quedó corregido en las dos maquetas: la regla del oscuro solo toca al apagado.

## Lo que decidió Felipe

**Casilla e interruptor A · Pozo y gota, separador de día B · Gotas que flotan, títulos y enlaces B · «Ver» en gota** (2026-11-01). La B
de títulos y enlaces lleva la raya de luz y la gota del número; además, `EnlaceVer` pasa a una gota chica con borde rojo al 30 %.
El interruptor elegido vale también para el Inicio de una líder.

# Maqueta · la página Configuración con vidrio (2026-11-02)

Página entera del tablero `docs/vidrio/README.md` (ADR-0596): `app/(app)/configuracion/page.tsx` (con el kit de Finanzas: `PestanasFin`,
`Superficie`, `fin-tabla`, `fin-control`) y `components/ConfiguracionTiendas.tsx`. Arma la pestaña Tiendas con lo ya elegido (cabecera,
pestañas en gota, la placa de las tablas, el aviso de la esquina en lente) y pone a elegir lo propio: **la casilla de la planilla** (cada
número se guarda solo al salir de ella) y **cómo responde al guardarse**.

Abrir `index.html` (o con la config `maquetas`). Tocable: cambia un número y sal de la casilla (Tab, Enter o tocando afuera).

## Lo que hay hoy

Cada número es un `fin-control`: una caja hueso maciza con borde arena, siempre a la vista (unas 40 en la pantalla); y lo único que dice
«se guardó» es el aviso de la esquina, lejos de la casilla.

## Las caras

| Pieza | Caras |
|---|---|
| La casilla | A · Pozo en la celda (el campo de las hojas, en chico) · **B · Se hunde al tocar** (en reposo el número es texto con una línea de puntos; al pasar el mouse aparece el pozo; en el celular, el pozo siempre) |
| Al guardarse | **A · Visto en la celda** (un ✓ verde se dibuja junto al número y se va en 1,6 s) · B · Hilo verde (el hilo rojo de la casilla pasa a verde y se recoge) |

En negrita, la recomendada. Lo que gana y lo que cuesta cada una, al pie de `index.html`.

## Medido

En Chrome sin ventana: 54 combinaciones (320 a 1920 px, claro y oscuro, las tres caras de la casilla), nada se desborda; guardar una casilla
dibuja su ✓. La planilla mira el ancho de su placa (`@container cfg`), no el del aparato: al angostarse se van primero WhatsApp y la hora de
cierre, después las metas por día, y bajo 560 px pasa a una tarjeta por tienda con cada casilla nombrada (las metas, de a dos). En Chrome
el subrayado de texto no se dibuja dentro de un `<input>`: la línea de puntos de B es un fondo.

## Lo que decidió Felipe

**Casilla A · Pozo en la celda y al guardarse A · Visto en la celda** (2026-11-02). En la casilla se recomendaba la B.

# Maqueta · las tarjetas de cifra con vidrio (2026-10-31)

Segunda pieza de «3. Las pantallas» del tablero `docs/vidrio/README.md` (ADR-0596): `TarjetaCifra` (`components/ui/TarjetaCifra.tsx`).

Abrir `index.html` en el navegador (o con la config `maquetas` del navegador integrado). Va montada sobre el marco y la cabecera ya
elegidos (`../vidrio-base-2026-10/`). La barra negra elige la cara, la pantalla (Compras: informa, lleva y sin dato; Gastos: filtra, y las
tarjetas se tocan; Inicio: ayuda, acción, barra de reparto y «no se pudo leer»), el tema y el ancho.

## Lo que hay hoy

- 238 usos en 68 archivos; la única pieza de su familia desde el 2026-10-06 (ADR-0358).
- Cuatro conductas que se ven antes de tocar: informa, lleva (la flecha), filtra (32 usos; puesta en arena al 40 %) y sin dato (46: borde
  punteado y «—» con su motivo; 13 «no se pudo leer», con borde entero). 100 llevan su punto de color.
- Sobre el vidrio es papel macizo con filo arena: el bloque más sólido de la pantalla, justo bajo una cabecera que ya muestra sus cifras en
  una placa Serena. Y la puesta apenas se distingue del encima.

## Las caras

| Cara | Cómo es |
|---|---|
| Como ahora | Papel con filo arena; arena al pasar el mouse y en la puesta. |
| **A · Placa Serena** (elegida) | Cada tarjeta es la placa de las cifras de la cabecera; la que lleva se alza y su flecha avanza; la puesta se hunde. |
| B · Plana y gotas | La que informa queda sin caja, con un hilo arriba; la que se toca es una gota; la puesta se hunde. |
| C · Franja de vidrio | La fila entera es una placa con hilos entre cifras; lo que se toca se enciende adentro; la puesta es un pozo. |

Lo que gana y lo que cuesta cada una, al pie de `index.html`.

## Lo que no cambia

Qué hace cada tarjeta y cómo lo dice: el nombre con su punto, el número serif de 28 px (22 si es angosta), la unidad y el contexto, la
flecha de la que lleva, el «—» punteado de la que no tiene dato, el borde entero de la que no se pudo leer, el (!), la acción y el reparto.

## Reglas que respeta

Solo tokens, en claro y oscuro. Movimiento una vez, sin rebote (la fila entra en cascada; la puesta se hunde al tocar); todo se apaga con
`prefers-reduced-motion`. Medido a 375 px en las cuatro caras, las tres pantallas y los dos temas: nada se sale.

## Lo que decidió Felipe

**A · Placa Serena** (2026-10-31): cada tarjeta es la placa de las cifras de la cabecera; la que lleva se alza y su flecha avanza; la
que filtra, puesta, se hunde. Sin dato: el borde punteado sin vidrio; «no se pudo leer»: la placa con su frase en tinta.

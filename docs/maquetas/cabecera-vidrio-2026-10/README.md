# Maqueta · la cabecera de pantalla con vidrio (2026-10-31)

Primera pieza de «3. Las pantallas» del tablero `docs/vidrio/README.md` (ADR-0596): `EncabezadoPagina`
(`components/ui/EncabezadoPagina.tsx`), la cabecera de todo el ERP menos Finanzas.

Abrir `index.html` en el navegador (o con la config `maquetas` del navegador integrado). Va montada sobre el marco ya elegido, que vive en
`../vidrio-base-2026-10/` (fondo Aurora, riel de vidrio con la gota, cabecera en dos islas). La barra negra elige la cara, la pantalla
(Existencias con sus cifras a la derecha, Órdenes de compra con sus acciones, una orden con Volver, detalle y estado), el tema y el ancho.
En la cara C hay que bajar la pantalla para verla trabajar.

## Lo que hay hoy

- 115 archivos la usan. Trae la frase en 123 usos, Volver en 57, acciones en 39, algo a la derecha (cifras de la sede, reloj de Caja) en
  21, un detalle tras la fecha en 20 y un pie de estado en 8.
- Sobre el vidrio, el título y la línea de la sede se leen bien. Lo que choca es lo que se toca: la flecha de Volver es un disco de papel
  macizo y los botones son los sólidos de antes. Las cifras (`ResumenSede`) ya eran casi vidrio (papel al 70 % con 4 px de desenfoque).

## Las caras

| Cara | Cómo es |
|---|---|
| Como ahora | Título plano, Volver de papel, botones sólidos, cifras en papel al 70 %. |
| **A · Plana con gotas** (elegida) | Lo que explica queda plano sobre la Aurora; Volver y las acciones son gotas (los botones «A · Gota», con la voz de la cabecera); las cifras, una placa Serena. |
| B · Placa | Toda la cabecera en una placa de vidrio; las cifras quedan planas adentro, tras un hilo. |
| C · Se acomoda arriba | A en reposo; al bajar, el nombre de la pantalla (y su acción principal, si cabe) entra entre las dos islas y el buscador queda en su lupa. En el celular baja a una isla delgada bajo las dos. |

Lo que gana y lo que cuesta cada una, al pie de `index.html`.

## Lo que no cambia

Qué hace la cabecera y dónde va cada cosa (ADR-0220): la línea «sede · fecha» con el hilo, Volver a su izquierda, el título de 46 px con el
nombre del menú, la frase, la derecha para las cifras o el reloj y si no las acciones, el pie, la voz de la cabecera en los botones.

## Reglas que respeta

Solo tokens, en claro y oscuro; los colores de las prendas son dato. Movimiento una vez, sin rebote (la isla de C entra y se va al cruzar
el título, respondiendo al desplazamiento); todo se apaga con `prefers-reduced-motion`. Medido a 375 px en las cuatro caras, las tres
pantallas y los dos temas: nada se sale.

## Lo que decidió Felipe

**A · Plana con gotas** (2026-10-31): lo que explica queda plano sobre la Aurora; Volver y las acciones son gotas con la voz de la
cabecera; las cifras de la sede (`ResumenSede`), una placa Serena. C (el nombre que se acomoda arriba al bajar) queda como idea aparte.

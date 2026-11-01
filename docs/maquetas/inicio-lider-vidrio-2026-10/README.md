# Maqueta · el Inicio de una líder de tienda con vidrio, entero (2026-10-31)

> Ojo: Felipe se refería al **Observatorio** (el Inicio del Admin): ver `../observatorio-vidrio-2026-10/`. Esta maqueta queda para el
> Inicio de una líder de tienda, que no es Admin; espera hasta que Felipe la mire.

Felipe: «vamos con todos los componentes que se encuentren en el inicio del líder para que quede ya lista esa vista». Pantalla:
`app/(app)/page.tsx` para una líder de tienda.

Abrir `index.html` (o con la config `maquetas` del navegador integrado). Va sobre el marco y las piezas ya elegidas
(`../vidrio-base-2026-10/`). Abre con la cara recomendada de cada pieza; la barra negra cambia cada una por separado, el tema, el ancho
(de 320 a 1920 px) y abre la hoja «Ajustar» (también se abre con «Ajustar», junto a «Te toca»).

## Ya elegido (no se toca aquí)

La cabecera A con «Vender», las cifras de «Hoy» y del piso (tarjetas A), la nota de Claure (A · Placa), la barra apilada del piso
(A · Tubo) y la hoja Serena de «Ajustar».

## Lo que faltaba, con sus caras

| Pieza | Como ahora | Caras |
|---|---|---|
| Títulos de sección (`Etiqueta`) | versalitas de 11 px al 65 % | **A · Serif** (el `TituloSeccion` de /unificar, con la cuenta) · B · Con hilo |
| «Te toca» (avisos) | papel; cantidad en píldora de color sólido | **A · Placa** (cantidad en globito teñido, urgente con la marca del menú) · B · Gotas · C · Lente de urgencia |
| Accesos | tarjetas de papel | **A · Gotas** (ícono en su lente) · B · Una placa |
| Equipo de hoy (avatares) | papel; lo último en caja hueso | **A · Placa** (avatar en lente, monto en serif) · B · Tarjetas |
| Barra de avance (`BarraAvance`) | pista arena, relleno de tinta | **A · Tubo** (la de pagos de las hojas) · B · Hilo con gota |
| Interruptor (hoja «Ajustar») | pista que se prende en tinta sólida | **A · Pozo y gota** (encendido: vidrio ahumado de tinta) · B · Gota que se tiñe |
| Barra de abajo del celular (la Isla) | botón primario sólido | **A · Gota ahumada** · B · Isla de vidrio |

En negrita, la recomendada. Lo que gana y lo que cuesta cada una, al pie de `index.html`.

## Lo que no cambia

Los avisos que elige cada líder (y los urgentes, que salen aunque los apague), «Ver N más» en el celular, «Al día», los accesos según
sus módulos, el equipo con su turno y sus ventas, la meta y su falta, el botón fijo de abajo en el celular.

## Reglas que respeta

Solo tokens, en claro y oscuro. Movimiento una vez, sin rebote; todo se apaga con `prefers-reduced-motion`. Medido en Chrome sin
ventana: 72 combinaciones de la pantalla (nueve anchos de 320 a 1920 px, claro y oscuro, todas las caras) y 6 de la hoja: nada se
desborda (a 320 px los accesos pasan a tres por fila).

## Lo que decidió Felipe

Pendiente.

## Lo que decidió Felipe

**Títulos B · Con hilo, «Te toca» A · Placa, accesos A · Gotas, equipo A · Placa, barra de avance A · Tubo, interruptor A · Pozo y gota y
barra del celular A · Gota ahumada** (2026-11-01, copiado con «Copiar mi selección»). En los títulos se recomendaba la A (serif): quedan
en versalitas con su hilo, como `TituloGrupo`. El interruptor es el mismo que se eligió en `../casilla-enlaces-vidrio-2026-11/`.

# Maqueta · la página de Caja con vidrio (2026-11-01)

Una página entera de la sección 3 del tablero `docs/vidrio/README.md` (ADR-0596): Ventas ▸ Caja (`app/(app)/caja`, módulo `venta.caja`),
en su vista «hoy contra ayer» (`CajaAbiertaPanel` + `CajaComparativa`, ADR-0319).

Abrir `index.html` (o con la config `maquetas` del navegador integrado). Va sobre el marco elegido (`../vidrio-base-2026-10/`) y está armada
**solo con las piezas ya elegidas**: cabecera A, placas Serena, insignia A · Lente de color, gráficos B · Tinta sobre vidrio con el globito
B · Ahumado (pasa el mouse por la línea), barra de avance A · Tubo, «Ver» en gota, íconos A y, en el celular, la barra de abajo A · Gota
ahumada. La barra negra elige la cara de lo propio de Caja, la hora (para ver los tres niveles de la barra de cierre), el tema y el ancho
(de 320 a 1920 px).

## Lo propio de Caja (con caras)

| Pieza | Cara | Cómo es |
|---|---|---|
| El titular «hoy contra ayer» (`VeredictoCaja`) | Como ahora | Bloque de tinta sólida con el halo del efectivo y el anillo grande sobre la tinta. |
| | **A · Ahumado** (recomendada) | El mismo bloque oscuro, de vidrio ahumado como el botón primario, con su luz y su filo; el halo sigue. |
| | B · Placa clara | Una placa Serena más; lo que falta, en el dorado oscuro del efectivo. |
| | C · Al aire | Sin caja: la frase grande sobre el lienzo, como el mapa del Observatorio. |
| La barra de cierre (`BarraCierreCaja`, ADR-0318) | Como ahora | Papel → tinta sólida → rojo profundo; «Cerrar caja» rojo sólido. |
| | **A · Placa que se tiñe** (recomendada) | Placa de vidrio → ahumada de tinta → ahumada de rojo profundo; «Cerrar caja», la gota roja. |
| | B · Isla | Se encoge a una píldora al centro, con los mismos tonos; pierde la frase de abajo. |

Lo que gana y lo que cuesta cada una, al pie de `index.html`. El «Cerrar caja» de la cabecera y el del celular también pasan a la gota roja.

## Lo que no cambia

Lo que dice cada tarjeta y en qué orden, el titular que habla en soles, el anillo que pasa a verde al alcanzar a ayer, las barras verdes
hacia arriba y ámbar hacia abajo (nunca rojo), la hora en curso rayada, los tres niveles de la barra de cierre y su destello al subir, el
«Cerrar caja» siempre a la vista; en el celular, el anillo se oculta y la barra de abajo trae Vender, Gasto, Ingreso y Cerrar.

**Fuera:** la persiana de «Caja cerrada» (diseño propio, ADR-0301), el formulario de abrir caja y las hojas que salen de aquí (cerrar caja,
gasto rápido, registrar ingreso, historial), que ya llevan la hoja Serena elegida.

## Reglas que respeta

Solo tokens: los del marco y los de los medios de pago, copiados de `globals.css` y `tema.css`. Claro y oscuro. Movimiento como hoy: entra
una vez, el anillo se cierra, la línea se dibuja y las barras crecen, sin rebote ni bucle; todo se apaga con `prefers-reduced-motion`. Datos
inventados. Medida de 320 a 1920 px sin que nada se salga.

## Lo que decidió Felipe

Pendiente.

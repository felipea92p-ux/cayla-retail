# Maqueta · Ventas ▸ Historial con vidrio (2026-11-02)

Una página entera de la sección 3 del tablero `docs/vidrio/README.md` (ADR-0596): Ventas ▸ Historial (`app/(app)/vender/historial`).

Abrir `index.html` (o con la config `maquetas` del navegador integrado). Va sobre el marco elegido (`../vidrio-base-2026-10/`) y está armada
**solo con las piezas ya elegidas**: cabecera A con las cifras de la placa, buscador A · Pozo (fijo al bajar en el celular), filtros A ·
Gotas (la puesta, ahumada), insignia A · Lente de color, globito A · Gota, aviso B · Lente, nota A · Placa, paginación A · Gota en su pozo,
gráficos B · Tinta sobre vidrio, separador de día B · Gotas que flotan, «Ver» en gota e íconos A. Al costado, el pulso del período (desde
1180 px de contenido; más angosto, va debajo). La barra negra elige la cara de lo propio, el tema y el ancho (de 320 a 1920 px).

## Lo propio de Historial (con caras)

| Pieza | Cara | Cómo es |
|---|---|---|
| La línea del tiempo (`HistorialVentasLista`) | Como ahora | Hilo taupe a la izquierda, un punto por día, el día y su total sobre una tarjeta de papel. |
| | **A · Hilo de vidrio** (recomendada) | El hilo es una ranura tallada con una gota por día (la de hoy, con su punto rojo); el día y su total, las gotas del separador elegido, que se quedan arriba al bajar; la tarjeta, la placa Serena. |
| | B · Solo los días en gota | Sin hilo: las gotas del día y la placa a todo lo ancho. |
| La pila de prendas | Como ahora | Miniaturas de 40 px encimadas, «×2» en tinta sólida, «+3» en arena. |
| | **A · Lentes apiladas** (recomendada) | Cada prenda, una lente redonda con su luz y un aro de vidrio; «×2», el globito de la esquina elegido; «+3», una gota clara. |
| | B · Bandeja | Las prendas de a una, cuadradas, en una bandeja hundida. |

Lo que gana y lo que cuesta cada una, al pie de `index.html`.

## Lo que no cambia

Qué dice cada venta y en qué orden, la venta anulada tachada y apagada, los totales por día, el buscador que mira todas las fechas, los
filtros, los avisos que no se cierran mientras el problema siga, el pulso al costado y el buscador fijo en el celular. El color de cada
prenda es dato: no cambia con el tema.

## Reglas que respeta

Solo tokens (más los de los medios de pago, copiados de `globals.css` y `tema.css`). Claro y oscuro. Movimiento como hoy: los días entran
en cascada y la pila crece un poco al pasar el mouse, sin rebote ni bucle; todo se apaga con `prefers-reduced-motion`. Datos inventados.
Medida de 320 a 1920 px sin que nada se salga.

## Lo que decidió Felipe

Pendiente.

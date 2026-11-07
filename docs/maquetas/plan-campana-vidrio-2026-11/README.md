# Maqueta · Compras ▸ Plan de campaña con vidrio (2026-11-02)

Una página entera de la sección 3 del tablero `docs/vidrio/README.md` (ADR-0596): Compras ▸ Plan de campaña (`app/(app)/compras/plan` →
`components/plan-compra/PlanCampana.tsx`, ADR-0349).

Abrir `index.html` (o con la config `maquetas` del navegador integrado). La barra negra elige la cara de lo propio, el tema y el ancho (de 320
a 1920 px); «El centro de avisos» lo abre o lo cierra.

Está armada **solo con lo ya elegido**: cabecera A con sus gotas (Descargar y «Empezar»), el selector de campaña en gota, la insignia A del
estado, pestañas A, tarjetas de cifra A · Placa (la del costo con su tubo), tabla B · Placa Serena, buscador A · Pozo, el segmento de modo,
filtros A · Gotas y botones gota.

**Fuera:** la hoja «Configuración» de una campaña es diseño propio (ADR-0488). No está aquí; cuando entre, conserva su movimiento y solo cambia
el material.

## Lo propio de Plan de campaña (con caras)

| Pieza | Cara | Cómo es |
|---|---|---|
| La barra de rango (`BarraRango`) | Como ahora | Arriba una banda taupe del flojo al bueno con la marca del normal; abajo la barra apilada sobre arena; el rombo pizarra, lo vendido. |
| | **A · Banda esmerilada** (elegida) | La banda es una franja de vidrio esmerilado con su filo sobre una pista; el normal, una marca de tinta; la barra apilada sobre un pozo fino; el rombo con aro de vidrio. |
| | B · Banda punteada | La banda es solo su contorno punteado. |
| El centro de avisos (`CentroDeAvisos`, `estilos/centro-avisos.css`) | Como ahora | Campana de papel con número rojo; lo urgente en una píldora roja; lista de papel con tarjetas de franja. |
| | A · Lista de vidrio con filas | Campana en gota (ahumada al abrir), número en gota roja, lo urgente en lente roja; la lista de vidrio de los combos y el menú «Más»; cada aviso una fila con su nivel en una gota al canto. |
| | **B · Lentes del tono** (elegida) | Lo mismo, y cada aviso una lente teñida de su nivel, como los avisos de la esquina. |

Lo que gana y lo que cuesta cada una, al pie de `index.html`.

## Lo que no cambia

Lo que dice cada barra y sus colores, la leyenda, el orden de las categorías, «Empezar» como el único botón negro, lo urgente que asoma junto a
la campana, «Ya lo vi», y la hoja «Configuración» con su movimiento.

## Reglas que respeta

Solo tokens. Claro y oscuro. Sin movimiento nuevo; todo se apaga con `prefers-reduced-motion`. Datos inventados. Medida de 320 a 1920 px sin
que nada se salga. En la maqueta, `marco.css` ya usa `.num` y `.der`, así que aquí se llaman `.pc-num` y `.pc-der`.

## Lo que decidió Felipe

**2026-11-02: la barra de rango A · Banda esmerilada y el centro de avisos B · Lentes del tono** (en los avisos no tomó la recomendada). Al
implementar:
- `BarraRango`: la banda de arriba (`bg-taupe/30`, de flojo a bueno) pasa a una franja de vidrio esmerilado de 12 px (vidrio 85 % → taupe 22 %,
  filo de vidrio al 70 %, su luz arriba) sobre una pista de tinta al 4 %; en oscuro, taupe al 32 % sin luz. La marca del normal, de `bg-taupe` a
  `bg-tinta`. La barra apilada de abajo, sobre un pozo (tinta al 7 % con su sombra adentro) en vez de arena. El rombo de lo vendido conserva su
  pizarra, con un aro de vidrio en vez de `ring-papel`. Los colores de los tramos y la leyenda no cambian.
- `CentroDeAvisos` (`estilos/centro-avisos.css`): `.ca-boton` pasa a gota clara (abierta, gota ahumada); `.ca-n`, gota roja con texto
  `crema-fija` en los dos temas; `.ca-asoma`, lente roja (rojo 8→14 % sobre vidrio, filo al 30 %); `.ca-panel`, vidrio claro (vidrio al 76 %,
  desenfoque 24 y saturación 1,6, esquinas de 20 px). Cada `.ca-aviso` es una **lente del tono de su nivel** (`--c` al 5→10 % sobre vidrio,
  filo del tono al 28 %, esquinas de 16 px), sin la franja de 5 px a la izquierda: el ícono y la etiqueta conservan su color. La hoja
  «Configuración» de la campaña (ADR-0488) no se toca.

# Auditoría al milímetro · `/vender/reportes` y `/vender/reportes/ranking` ▸ la píldora «Empresa» y la nota de «Cómo se pagó» con una empresa

2026-11-14 · rama `claude/reportes-lima-cayla-claure-9ddfad` (PR #1871, ADR-0665) · local, con ventas inventadas en Lima (se borraron al terminar)
Medido: 1440×900 claro quieto · 1440 oscuro · 1440 vivo · 375×812 claro · foco con Tab real. Servidor `cayla-retail-dev-libre`; los medidores de `.claude/skills/*/referencia/medir.js` se
cargaron desde un servidor local de solo lectura (no se pegaron a mano). Alcance: SOLO lo que cambió el PR; el resto de la pantalla es de antes y no se juzga aquí.

**Resultado: 0 graves, 0 medias, 0 leves nuevas.** Todo lo que los medidores marcan sobre lo nuevo es de las piezas compartidas, y el filtro «Tienda» de al lado da el mismo valor.

## Árbol
Pieza del repo, sin dibujar nada a mano: la píldora es `<DesplegablePildora icono etiqueta valor opciones>` (familia `filtro`, decidida 2026-10-13), igual que «Tienda» y los filtros del Ranking;
la nota es `<Vacio tamano="chico" icono>` (familia `vacio`, decidida 2026-10-08) con una línea. Sin colores, medidas ni movimiento propios.

## Medido sobre lo nuevo
| Qué | Resultado |
|---|---|
| Estados (`/milimetro`) sobre la píldora y sobre «Cómo se pagó» | 0 en apagados, cargando, errores, selección y bucles; sin `hover` suelto propio |
| Foco con Tab (píldora) | toma el foco, con anillo, sin quedar tapado |
| Contraste claro y oscuro | 0 textos fallan (la letra de la píldora puesta es «no concluyente»: sobre vidrio oscuro, lo vigila `lib/vidrio-contraste.test.ts`) |
| Letra (`/tipografia`) | 14 px, 500/600; ningún monto partible; nada de lo nuevo bajo el piso |
| 375 px | la píldora baja a su fila (189×34 px); sin scroll horizontal; la nota ocupa los 343 px |
| Movimiento | nada propio: la píldora no anima al verse; la nota tampoco. Quieto es igual de legible |

## Lo que marcan los medidores y NO es de este cambio (heredado de la pieza compartida; «Tienda» de al lado da lo mismo)
- **El ✕ de «Quitar filtro» mide 22×22** (`button.pildora-filtro-quitar`): bajo 24 px sin separación, y bajo 44 con el dedo. Es de `DesplegablePildora` (`components/ui/FiltrosPildora.tsx`, `app/estilos/…`) y lo
  tienen todos los filtros puestos del ERP. La misma acción se puede hacer desde la lista de la píldora («Todas»), así que WCAG 2.5.8 la tiene por su excepción de «control equivalente».
  Arreglarla es tocar `components/ui/`: afecta a varios módulos y a Dynamic, así que no se hace aquí. **Va a `/espacio` como propuesta para Felipe** (agrandar el área del ✕ sin cambiar su dibujo, con `area-dedo`).
- **El anillo de foco de la píldora puesta mide 1:1** contra su relleno oscuro (`button.pildora-filtro-boton`): `[Norma]` AAA 2.4.13, no AA; mismo valor en «Tienda». Mismo destino.
- `Vacio tamano="chico"` tiene un relleno fuera de la escala de 4 px (14): lo decidió la pieza.

## Decidido a propósito / falso positivo
- `textos` marca «CLAURE» como mayúsculas a mano: es el **nombre de la empresa** (`empresas.nombre`, dato), no una palabra escrita en el código; igual que CAYLA en todo el ERP.

## Sin medir
- La píldora a 375 px en oscuro y con el dedo (`pnpm --filter web tacto:medir`): el ✕ es el heredado de arriba.
- `/graficos`: no aplica (con empresa, «Cómo se pagó» no dibuja ningún gráfico).

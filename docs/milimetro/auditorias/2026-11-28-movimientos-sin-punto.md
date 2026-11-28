# Auditoría al milímetro — Movimientos sin «·» (ADR-0716) · 2026-11-28 · claude/sin-punto-medio-panel
Medido: 1440 claro (vivo y quieto) · 1440 oscuro · 375×812 claro, en Movimientos, Pérdidas (90 días) e Ingresos (90 días)     Servidor: `http://localhost:3071` del worktree, solo desde un Chrome sin pantalla (base local compartida, cuenta del seed, solo lectura)
Resumen: 0 graves · 0 medias · 0 leves del PR · 5 de antes, fuera de este PR · 1 sin medir

Cómo se midió: Playwright con el Chrome instalado entró con la cuenta del seed y corrió enteros los medidores de `/milimetro` (también con
`{ foco: true }`), `/espacio`, `/tipografia`, `/color`, `/movimiento` y `/textos` en las tres pestañas, según la tabla de la skill: 42 mediciones.
**El PR cambia cómo se dicen los datos, no los controles:** suma `<LineaDeDatos>` (texto con íconos mudos), `<CabeceraConCuenta>` (un `TituloSeccion`
con su `dato`) y textos sin «·». No agrega ningún control ni estado interactivo.

## Graves
Ninguno. `/color`: ningún texto falla WCAG AA en claro ni en oscuro (70, 69 y 89 textos medidos por pestaña); la línea de datos (`text-secundario`)
no aparece en ninguna lista. `/milimetro` con foco: 80 controles medidos en Movimientos, 0 sin anillo, 0 tapados. `/tipografia`: la línea de datos
de una fila va a 16 px (`text-sm`); fuera de las filas, a 14 px (`text-detalle`), el piso de lectura.

## Medias
Ninguna del PR.

## Leves
Ninguna del PR. A 375 px la línea de datos de una fila muestra como mucho dos renglones de piezas enteras (`renglones={2}`): nunca media palabra.

## De antes, fuera de este PR (no los toca)
1. **«Confecciones del Sur EIRL» a 13 px** en el trayecto de una llegada (`/tipografia`, `lecturaBajo14: 1`): el nombre del proveedor dentro de la
   píldora del trayecto. Va a `/tipografia`.
2. **En oscuro, los conteos de la columna de tipos piden «segunda mirada» por APCA** (6,37:1, pasan AA): `mv-tipo-prendas` y «operaciones». Va a `/color`.
3. **El interruptor de Ingresos sin borde de control** (`/color`, `controlFalla: 2`, relleno 1,11:1). Va a `/color` y `/unificar` (`casilla`).
4. **«CLAURE» en mayúsculas escritas a mano** en el filtro de tienda (`/textos`): es el nombre de la empresa tal como viene de la base.
5. **Dos `:hover` que el medidor pide revisar** (`.parecidas-punto`, `.barra-t`): los vigila `lib/hover-con-mouse.test.ts`, en verde.

## Sin medir
- **La cuenta urgente en rojo con datos reales:** la base local no tiene prendas que «aparecieron» en 90 días. La pieza está probada en
  `lib/sin-punto-medio.test.ts` (HTML y frase).

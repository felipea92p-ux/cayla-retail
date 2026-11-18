# Auditoría al milímetro · 2026-11-17 · Quitar un color con doble toque, y textos de Insumos

Rama `claude/pricing-formula-costs-81abca`. Web local de la rama, 1440 × 900, claro, movimiento quieto (el de fábrica, ADR-0625).

## Qué se auditó

1. **`<QuitarColor doble>`** (`components/orden-produccion/AgregarColor.tsx`) en Producción ▸ Órdenes ▸ Nueva orden ▸ modelo nuevo: el primer toque
   cambia la «×» por «¿Quitar Nude?» en la misma fila; el segundo quita; a los 4 s, al perder el foco o con Escape, vuelve sola.
2. **Textos** de Insumos: «Nuevo avío» (la medida del botón en centímetros: «Un botón de 1.5 cm y uno de 2 cm son dos avíos distintos») y «Nueva tela»
   («Composición · opcional», «Lo que sepas, por ejemplo: Algodón»).

## Resultado: 0 graves, 0 medias, 1 leve

| # | Severidad | Qué | Medido | Regla · nivel |
|---|---|---|---|---|
| 1 | Leve | La fila crece 4 px al armar el «¿Quitar …?» (53 → 57 px): el `btn-chico` mide su alto mínimo. La pantalla no salta bajo el mouse (la fila crece hacia abajo y el botón queda donde se tocó) | `getBoundingClientRect` de la fila, antes y después | `[Práctica]` estabilidad del diseño |

## Estados de la pieza

| Estado | Qué se ve | Qué se anuncia | Medido |
|---|---|---|---|
| default | «×» de 24 px con `area-dedo` (sin cambio) | «Quitar Nude» | sin cambio respecto de `main` |
| armado (confirmar) | `btn-cayla btn-peligro btn-chico`: la gota con letra rojo profundo, 122 × 40 px, 12,5 px | «Confirmar: quitar Nude», con el foco puesto | texto `rgb(139, 42, 31)` sobre papel `rgb(251, 248, 242)`: **8,09:1** (≥ 4,5 `[Norma]` 1.4.3) |
| hover | el de `btn-peligro` (dentro de `@media (hover: hover)`) | — | `medir.js` · hover: 0 sueltos en la matriz |
| focus-visible | el anillo del sistema (`--foco-*`) | — | sin medir con Tab: el foco llega por programa al armarse |
| disabled · loading · error · read-only · vacío | no aplica: no guarda nada (quita una fila del borrador) | — | — |
| quieto | aparece y se va sin animación propia | — | `medir.js` · 0 bucles |

**Pieza del repo:** «Lo peligroso» (`accion.eliminar`, ADR-0358): lo que va en una fila es `btn-peligro`. No se dibujó a mano; `lib/unificar.test.ts` en verde.

## Sin medir

- El oscuro: el cambio de tema por atributo no se reflejó en la medición; el contraste de `btn-peligro` en los dos temas lo vigila `lib/vidrio-contraste.test.ts` (verde).
- 375 px y el anillo de foco con Tab.

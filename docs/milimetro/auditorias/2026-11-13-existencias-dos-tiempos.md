# Auditoría al milímetro — Existencias en dos tiempos (`/inventario`, el estado «calculando») · 2026-11-13 · `claude/existencias-dos-tiempos`

Medido: 1440×900 claro (vivo y quieto) · 1440×900 oscuro · 375×812 claro, con Chromium sin cabeza (Playwright, la sesión del seed local). Servidor:
local (`next dev`), base local compartida, **solo lectura**. Para ver el estado «calculando» el plan del piso se demoró 8 s solo en la copia local
durante la medición (la demora no está en el código). Cada medidor se corrió dos veces: mientras el plan llega y con el plan puesto.

Resumen: **0 graves · 0 medias · 1 leve (arreglada)** en lo que cambió.

## Lo que cambió (ADR-0662)
- `<Calculando>` (`components/Esqueleto.tsx`): una banda `bg-tinta/10` con `animate-pulse`, del tamaño de lo que viene, «Calculando» para el lector.
  En la columna «Hoy» (tabla por talla y por prenda), en la cifra de los atajos «Por colgar» y «Sin stock atrás», en el anillo «hoy» y en el conteo.
- Con `?hoy=` puesto, la sombra de una fila de tarjetas (la rejilla y el alto de `ExistenciasTarjetas`) en lugar de la lista.
- El aviso «El piso de esta tienda nunca se ha cuadrado» sale desde el principio (antes, con el plan).

## Leve (arreglada)
1. El lugar de la cifra del anillo medía `h-[18.75px]` escrito a mano (el interlineado de su texto). → `h-lh` con la letra de 15 px: una línea
   exacta, sin número suelto. `/espacio` · `[Práctica]`.

## Medido en lo nuevo
| Qué | Resultado |
|---|---|
| Saltos al llegar el plan (CLS, `layout-shift`) | 0 en la vista de entrada; 0,0001 con `?hoy=sin_stock_atras`; 0,013 solo si el plan falla (el aviso «"Hoy" no se pudo calcular» entra sobre la lista; reservarle lugar haría que la página se encogiera en el caso normal, ADR-0185) |
| Anillo «hoy» | 160 px calculando → 159 px con «3 pendientes» |
| Atajos | la fila mide lo mismo antes y después (1 línea en la vista de entrada, 2 con `?hoy=`) |
| `/color` | 0 textos nuevos bajo 4,5:1 en claro y oscuro; la banda es decorativa (`aria-hidden`), sin texto que medir |
| `/tipografia` | 0 textos de lectura bajo 14 px en las dos fases |
| `/espacio` | ningún blanco nuevo bajo 24 px (la banda no es un control) |
| `/milimetro` (estados) | igual en las dos fases: lo que marca es de antes (abajo) |
| `/movimiento`, vivo | +3 bucles mientras calcula: el pulso de las bandas, el mismo del esqueleto de pantalla (`Esqueleto.tsx`, ADR-0623). Se apaga al llegar el plan |
| `/movimiento`, quieto (de fábrica, ADR-0625) | 0 animaciones: la banda queda quieta |
| Loader global (ADR-0149) | no aparece en toda la carga, ni entrando con un clic desde Movimientos |

## Decidido a propósito
- **El pulso de la banda en vivo.** Es la «respiración» del esqueleto que ya dibuja cada `loading.tsx` (ADR-0623); la banda «calculando» es la misma
  señal de espera, en chico. Sin `data-senal`, igual que el esqueleto: con las animaciones apagadas no se mueve.

## Lo que marcaron los medidores y es de antes (no de este cambio)
- `/milimetro`: 2 `:hover` fuera de `(hover: hover)` en CSS de otras piezas (`.barra-t`, `.parecidas-punto`), la flecha «Página anterior» apagada sin
  motivo a la vista, 11 puntos de color de las tarjetas cuyo elegido solo cambia el fondo.
- `/color`: la fecha de la cabecera a 4,35:1 sobre la aurora (según el cuadro), los puntos de color de las tarjetas como controles.
- `/espacio`: «Ver los 6 colores» de la tarjeta Vitrina a 22,4×16 px; valores fuera de la escala de 4 en piezas existentes.
- `/tipografia`: las teclas «Ctrl» y «K» del buscador global a 10 px; cifras de DM Sans sin tabulares (propuesta 1 de `/tipografia`).
- `/textos`: tres nombres de prenda cortados en las tarjetas.

## Sin medir
- 375 px en el estado con `?hoy=` y la tabla por talla en el celular (la tabla pasa a su forma apilada; la banda va en la misma celda).
- Un refresco que cambie stock (colgar o vender): no se escribió en la base local compartida. Lo cubre la prueba de `aplicarPlan`.

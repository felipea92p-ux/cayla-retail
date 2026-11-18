# Auditoría al milímetro — Cuadrar con el banco ▸ tarjeta «El banco dijo» · 2026-11-13 · `claude/cuadre-retiro-error-c18c68`

Medido: 1440×900 claro (quieto, de fábrica) · 1440×900 oscuro · 375×812 claro. Servidor: local (`cayla-retail-dev-libre`), base local con la
migración `20261113170000` y el caso de Felipe armado a mano (banco con S/ 1,480.39 anotado hoy y un retiro posterior de S/ 280.39); la base se
restauró a su foto al terminar.

Resumen: **0 graves · 1 media (arreglada) · 0 leves** en lo que cambió.

## Lo que cambió (ADR-0652)
- La frase «Después de anotarlo salieron S/ 280.39 con fecha de ese día: no cuentan aquí, entran al próximo cuadre.» dentro del `p.din-cuad-tenue`
  que ya existía (`CuentasDinero.tsx`), y la ayuda de «¿Qué saldo dice el banco?» según la fecha. Sin piezas, colores ni movimiento nuevos.

## Medias
1. **Decía «Coincide con el sistema» junto a dos cifras distintas** (el sistema dice S/ 1,200.00 en grande; el banco dijo S/ 1,480.39). Alguien
   sin contexto lee que dos números distintos coinciden — `p.din-cuad-tenue` — regla: el texto dice lo que se ve (`/textos`; CLAUDE.md
   «Formidable», ley 1) · `[Práctica]` · **Arreglada:** `textoBancoContraSistema` dice «Coincidía con el sistema cuando se anotó» (o «Diferencia
   de … con lo que el sistema decía cuando se anotó») solo cuando algo se registró después; con prueba en `cuadrar-reglas.test.ts`.

## Medido en la frase nueva
| Vista | Letra | Contraste | Caracteres por línea | Desborde |
|---|---|---|---|---|
| 1440 claro | 14 px / 21 px | 5,44:1 (≥ 4,5 `[Norma]` WCAG 1.4.3) | ~42 | no |
| 1440 oscuro | 14 px / 21 px | 6,72:1 | ~42 | no |
| 375 claro | 14 px | — | — | no (la página no desborda) |

## Lo que marcaron los medidores y es de antes (no de este cambio)
- `/color`: «Registrar gasto» del telar a 1:1 (medición tapada por el dock) y el borde del segmento «Por revisar / Revisadas / Todas».
- `/tipografia`: chips a 13 px y cifras de DM Sans sin tabulares (propuesta 1 de `/tipografia`).
- `/espacio`: valores fuera de la escala de 4 en piezas del telar y del segmento.
- `/textos`: «CLAURE» en mayúsculas a mano en la pestaña.

## Sin medir
- Foco (`medir.js { foco: true }`): la frase no es un control; el botón «Anular este saldo…» no cambió.
- Movimiento: la frase no se anima; con el movimiento de fábrica (quieto) no hay nada que medir.

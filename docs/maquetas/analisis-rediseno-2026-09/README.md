# Análisis de inventario — rediseño con la guía oficial (2026-09-22)

Demo interactiva: `demo.html` (se abre directo en el navegador; publicada como artefacto
privado en https://claude.ai/artifact/WF1Lt8d2Gp6n1M7ANVVPYC). Datos de ejemplo, no de producción.
Capturas: `desempeno.png`, `comparar.png`.

Parte de la «Sala de Diseño» (rediseño oficial de Análisis: Comparar períodos con cifras,
3 gráficos y «Detalle por producto» con «Cambio relevante»). Solo propone: no toca código del ERP.

## Qué ya se decidió
- **«Cambio relevante» por reglas** (Felipe, 2026-09-22): una frase por variante, calculada con
  reglas fijas en orden (gana la primera). Irá en `apps/web/lib/resumen-lectura.ts` con sus pruebas.
  1. Cifras estimadas (el historial no cuadra con el stock, ≈)
  2. Se agotó: vendió y cerró en 0 → pendiente reponer
  3. Sin ventas con stock → liquidar o trasladar
  4. Aceleró / Desaceleró ±25 % de ritmo (Desempeño: 2.ª mitad vs 1.ª; Comparar: B vs A)
  5. Vendió ≥ 80 % de lo disponible
  6. Rota lento: sell-through < 15 % con ≥ 20 u. al cierre (solo Desempeño)
  7. Si ninguna: sin cambio relevante

## Qué se decide mirando la demo (el panel de arriba las intercambia en vivo)
| Decisión | Opciones | Recomendación |
|---|---|---|
| Forma de Desempeño | A · misma anatomía que Comparar (4 cifras + 3 gráficos + tabla) · B · solo tabla | A |
| Aviso de exactitud | franja fina bajo el título · chip junto a «Actualizado» · tarjeta (hoy) | franja |
| Sede sin datos | vacío con salidas (ampliar a 90 días, ver otra sede, ir a Recibir) · estructura en cero | con salidas |

## Qué cambia frente a hoy
- Pestañas subrayadas (guía) en vez del bloque negro; el negro queda para el período elegido.
- Comparar deja de partirse en «Vista general / Detalle por producto»: una sola lectura de arriba
  abajo, y la dona filtra la tabla de abajo (chips Aceleraron / Estables / Desaceleraron).
- En las cifras A → B, A va chica y apagada; la grande es B.
- Gráficos: aceleró/estable/desaceleró en verde / neutro / ámbar con flecha y etiqueta (validado
  con el validador de paletas: ΔE ≥ 26 entre vecinos, con daltonismo incluido). El trío de hoy
  (verde / taupe / ámbar) no pasa: taupe y ámbar se confunden (ΔE 9.8).

## Qué NO cambia
Ninguna fórmula nueva (ritmo, sell-through, rotación y tendencia salen de `lib/resumen-desempeno.ts`
y `lib/resumen-comparacion.ts`) y sin migración: las cifras de 1.ª y 2.ª mitad de Desempeño ya las
trae `fn_resumen_comparacion`.

## Fuera de alcance (global, no de esta pantalla)
La guía dibuja el lateral en tinta oscura; el ERP hoy lo tiene claro. Es una decisión de todo el ERP,
no de Análisis: la demo conserva el lateral actual.

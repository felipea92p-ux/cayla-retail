# Auditoría al milímetro — `/finanzas/dinero/claure` y el aviso «Cuentas con Claudia» del cierre de caja · 2026-11-15 · `claude/claure-igv-lo-pone-cayla`

Medido: 1440×900 claro (animaciones encendidas y apagadas) · 1920×1080 claro (la grilla) · 375×812 claro · 1440 oscuro · foco con teclado.
Servidor: pila local privada con las 1208 migraciones de la rama (`20261115122000` incluida) y datos inventados (dos ventas de CLAURE hoy en Lima,
tarjeta 118 y Yape 59; una de ayer, Yape 59, y un pago de 10). La caja de prueba se cerró en esa base para ver el aviso, que solo sale con la caja cerrada.

Lo que cambió esta rama en pantalla: se fue la ficha «IGV (lo paga CAYLA)» (de seis términos a cinco), la línea del IGV del detalle del cierre y del
«¿Cómo se llega?», y tres frases (el IGV lo pone CAYLA, no se le descuenta).

Resumen: **0 graves · 0 medias en lo que cambió (1 media arreglada) · 2 leves de antes · 2 decididos a propósito**

## Graves

Ninguno. 0 textos que fallan contraste dentro de la pestaña (77 medidos en claro, 79 en oscuro) ni dentro del aviso (30 en claro y oscuro); foco 7/7 con anillo y
sin taparse; 0 blancos bajo 24 px; 0 apagados, 0 errores, 0 bucles con las animaciones apagadas.

## Medias

1. **Arreglada — la grilla de las fichas quedó con un hueco** al irse la ficha del IGV: estaba pensada para la deuda y seis términos (4 columnas con la
   deuda de dos celdas; 7 en una fila). Con cinco, la segunda fila tenía tres tarjetas y una celda vacía. — `.cl-fichas`, `app/estilos/finanzas-dinero.css` —
   ahora 3 columnas (3 + 3), 6 en una fila desde 1150 px de contenedor y, bajo 600 px, la deuda sola arriba y el último término a lo ancho. Medido después:
   1440 → 3 + 3 de 356 × 120 px; 1920 → una fila de 6 × 252 px, todas de 144 px de alto; 375 → 343 / 166+166 / 166+166 / 343, sin scroll horizontal. — `/espacio`

## Leves (de antes de esta rama; no se tocan aquí)

1. El aviso «Cuentas con Claudia» usa `leading-snug` (1,38) en sus tres párrafos de 2–3 líneas; para lectura el piso de práctica es 1,5. — `components/CuentasConClaudia.tsx` — `[Práctica]` — `/tipografia`
2. Su título «Cuentas con Claudia» va en versalitas de 10 px, bajo el piso de 11 px de las etiquetas. — mismo archivo — `[Práctica]` — `/tipografia`

## Decidido a propósito

- Las cifras en DM Sans piden tabulares y la letra no los tiene (17 en la pestaña, 9 en el aviso): es la propuesta 1 de `/tipografia`, de todo el ERP.
- La pestaña CLAURE es del kit de Finanzas (ADR-0493, rediseño del 2026-10-31): sus pasos de 7 y 11 px y «CLAURE» en mayúsculas (es el nombre de la marca).

## Sin medir

- El aviso del cierre a 375 px: Caja es de escritorio (PL-105 no la incluye).
- Los hallazgos de los medidores fuera de la pestaña (menú lateral, la mesa del telar, el selector de mes) no son de esta rama.
- Con datos reales de producción: la pantalla se vio con datos inventados; la cifra de producción (lo que se le debe a Claudia) se comprobó aparte con `fn_claure_saldo_a`.

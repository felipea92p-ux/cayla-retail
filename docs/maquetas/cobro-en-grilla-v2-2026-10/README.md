# Spike v2 · El cobro ocupa la grilla, todo a la vista y sin scroll (2026-10-01)

> **Estado: en revisión con Felipe.** Sin aplicar. Segunda ronda: las propuestas A/B/C
> (`../cobro-en-grilla-2026-10/`) se descartaron por densas y con scroll interno.

`cobro-en-grilla-v2.html`: un solo archivo. La barra negra (que no existe en el ERP) cambia entre las tres propuestas,
entre 1 y 3 prendas, y tiene **▶ Ver demo**. Solo escritorio (1380 × 820 escalado al ancho).

## Reglas de esta ronda
- **Todo a la vez, sin scroll** en la zona de cobro. Se mide con `auditar()` (consola) en el **peor caso**: 3 prendas,
  los cinco medios elegidos, efectivo con billetes y vuelto, factura con RUC consultado. Las tres dan 0 desbordes.
- **Menos marcos:** nada de tarjetas dentro de tarjetas; hilos finos y aire. Un control activo a la vez.
- El ticket sigue a la derecha, igual que en la ronda 1 (líneas compactas, mezcla de medios, total, «Confirmar cobro»).
- La tira «1 Cómo pagó · 2 Comprobante · 3 Confirmar» sigue arriba (Guía de foco, ADR-0284).

| | Idea | Para quién |
|---|---|---|
| **D · Cuenta** | Una hoja con los cinco medios como renglones con puntos guía (estado de cuenta). Tocar uno lo enciende y trae su monto; el efectivo despliega ahí mismo billetes, recibido y vuelto. Derecha: comprobante, documento y «Se emitirá…». | Quien quiere ver todo de un vistazo, como en papel. |
| **E · Teclado** | Medios a la izquierda; el elegido queda activo y el centro es un **teclado numérico grande** (monto; y en efectivo, recibido con billetes y Exacto). Derecha: comprobante y documento. También acepta el teclado físico. | Pantalla táctil, cajera rápida. |
| **F · Frase** | El cobro se lee como oración: «La clienta paga con [Yape S/30] [Efectivo S/29.90] y el total queda cubierto. Emitir una [Boleta] a nombre de [DNI]». Tres capítulos con ✓ y una frase final de «qué se registra». | Quien nunca ha usado el sistema. |

Las tres cierran con «Venta registrada» (vuelto, medios, «Imprimir y nueva venta» con Enter) en la misma zona.

## Movimiento (`--ease-cayla`, sin rebote; se apaga con `prefers-reduced-motion`)
Cascada de entrada; puntos guía que se dibujan al elegir un medio; renglón de efectivo que se despliega; indicador que
se desliza entre medios (E); teclas que se hunden; billetes que vuelan a «Recibido»; píldoras que entran con desenfoque
(F); marco que se desliza entre boleta/factura/nota; cifras que cuentan; nombre de la clienta que se escribe al llegar
la consulta; «visto» que se dibuja al cerrar.

## Decisiones abiertas
1. ¿Cuál? Combinables: D con el teclado de E para montos; F como modo «guiado» para colaboradoras nuevas.
2. Celular (375 px): sin resolver (PL-105). E se adapta mejor (una columna por paso); D y F pedirían reorganizar.
3. Antes de aplicar: declarar la pantalla en `lib/guia-de-foco-pantallas.ts` y pasar `/sugerir`.

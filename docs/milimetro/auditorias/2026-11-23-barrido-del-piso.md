# Auditoría al milímetro — Barrido del piso (`/inventario/barrido`) · 2026-11-23 · `claude/keen-turing-w667at`

Medido: `/inventario/barrido` con los siete medidores del set (estados, espacio, tipografía, color, movimiento y textos; sin gráficos en la
pantalla), con Playwright inyectando cada `referencia/medir.js` entero. Servidor de la rama (`localhost:3100`) contra la base local, cuenta
Líder en Tienda Lima. Estados medidos: «nadie está barriendo» (con «Por resolver»), un barrido abierto con dos prendas escaneadas y la hoja
«Revisar el barrido». Anchos y temas: 1440 × 900 claro, oscuro, quieto y vivo; 375 × 812 claro. El barrido de prueba se descartó al terminar.

Resumen: **0 graves · 0 medias · 3 leves (de piezas compartidas, no de esta pantalla)** · contraste sin fallas en claro y en oscuro, foco visible y sin tapar en los 29 controles, ningún blanco bajo 24 px.

## Lo que se midió

| Medidor | Vista | Resultado (Medido) |
|---|---|---|
| estados (`milimetro`) | 1440 claro, oscuro, quieto; 375; la hoja | 0 apagados, 0 errores, 0 sin etiqueta, 0 bucles; con `{ foco: true }`: 29 controles, 0 sin anillo, 0 anillo flojo, 0 tapados |
| color | 1440 claro / oscuro; la hoja | 59 textos medidos, 0 fallan (WCAG); en oscuro, 21 con APCA más débil, todos sobre 4,5:1 (segunda mirada, no falla) |
| espacio | 1440, 375, la hoja | 0 blancos bajo 24 px; la casilla «Se escaneó todo lo colgado» (22,5 px) pasa por la excepción de separación y su `<label>` la agranda |
| tipografía | 1440, 375 | 0 textos de lectura bajo 14 px; 0 líneas de más de 80 caracteres |
| movimiento | 1440 vivo y quieto | quieto: 0 animaciones; vivo: 8, una vez, sin bucles; todo quieto a los 6,6 s |
| textos | 1440, 375, la hoja | sin fallas |

## Leves (de piezas compartidas, se dejan a su dueño)

1. **Un margen de 1 px** (`mt-px`, dos veces) que se sale de la escala de 4 px. No está en `components/barrido-piso/`: viene de una pieza
   compartida de la cabecera o de las cifras. Va a `/espacio` cuando se toque esa pieza.
2. **El globito de `TituloGrupo`** dibuja su número en 10,5 px y en DM Sans sin cifras tabulares (propuesta 1 de `/tipografia`, del repo entero).
3. **La animación `cayla-trazo-dibuja`** del avatar del combo «Quién escanea» dura 520 ms (más de 500). Es de `ComboResponsable`, no de esta pantalla.

## Decidido a propósito (no son hallazgos)

- «Empezar el barrido» y «Confirmar barrido» salen como «espera escrita a mano» en el medidor de estados: son `<Boton cargando textoCargando>`
  (`PalabraEnEspera`), la pieza decidida (ADR-0358 `accion.guardar`).
- Los 60 «tapados» del medidor de color con la hoja abierta son lo que queda detrás del velo.

## Sin medir

- El área de 44 px con el dedo (`pointer: coarse`): el medidor la omite con mouse. Pendiente con `pnpm --filter web tacto:medir`.
- `/chaos` (5 personas a la vez sobre la pantalla) queda para la actividad 10; la concurrencia de la base la prueba `barrido_piso_concurrencia.mjs`.

# Al milímetro — `/vender/reportes/empresas` («CAYLA y CLAURE», ADR-0667)

- **Fecha:** 2026-11-15 · **Rama:** `claude/ventas-cayla-claure` · **Base:** privada, con ventas inventadas de Lima (54 ventas, 23-oct al 14-nov).
- **Medido:** los medidores de `/milimetro`, `/color`, `/tipografia`, `/espacio`, `/textos` y `/graficos` a 1440 × 900 en claro, raíz `main`.
  Revisado a ojo en oscuro (1440) y a 375 px (sin desborde horizontal: `scrollWidth` 375).

## Resultado: 0 graves, 0 medias, 1 leve

| Qué | Medido | Nivel |
|---|---|---|
| Contraste de texto | 24 textos medidos, 0 fallan; 1 tapado (la cabecera flotante sobre lo que corre) | — |
| Blancos de toque | 0 bajo 24 px | — |
| Letra de lectura | 0 bajo 14 px; las 2 etiquetas bajo 11 px son las teclas «Ctrl K» del marco | — |
| Cifras | 0 columnas sin alinear, 0 montos partibles (todo `tabular-nums`, `solesCentimos`) | — |
| Proximidad | 1 grupo `div.flex` con 24 px adentro y 0 afuera | leve |
| Hover | los 2 que salen son de piezas del sistema (`BarraApilada`, `ExisteTambien`) | — |
| Piezas | todas del sistema: `TarjetaCifra`, `Tabla`, `BarraApilada` + `MuestraTramo`, `SelectorMes`, `CampoFecha`, `Pestanas`, `Chip`, `DesplegablePildora`, `BotonLimpiar`, `BotonVerMas`, `EnlaceVer`, `MiniaturaPrenda`, `TituloSeccion`, `Ayuda`, `Vacio`, `Aviso` | — |

## Sin medir

- El foco con teclado (el medidor no encontró nada enfocado) y el color en oscuro con el medidor (solo a ojo).
- Las filas en su entrada animada: en la primera captura se ven tenues hasta que termina la cascada (`fila-cayla`), igual que en las otras tablas.

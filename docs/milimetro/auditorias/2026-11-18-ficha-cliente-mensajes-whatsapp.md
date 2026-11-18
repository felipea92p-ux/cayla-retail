# Auditoría al milímetro — la tarjeta «Mensajes por WhatsApp» de la ficha del cliente · 2026-11-18 · `claude/revision-legal-tienda-624642`

Medido: 1440×900 claro · 1440×900 oscuro · 1440×900 quieto y vivo · 375×812 claro. Servidor: `localhost:3110` (ERP de esta rama) contra una base
aislada con `main` + las tres migraciones de ADR-0680 y el seed; cliente de prueba unido por el cartel con la casilla de WhatsApp (tiene los dos
permisos). Medidores, cargados tal cual desde `.claude/skills/*/referencia/medir.js`: estados (`milimetro`, también con `{ foco: true }` tras un Tab real),
`espacio`, `tipografia`, `color`, `movimiento` y `textos`, con `raiz = [data-guia="clientas.ficha-club"]` donde el medidor la acepta; en los demás se
filtraron los hallazgos de la tarjeta.
Alcance: solo lo que cambió en `components/ClientaFichaModal.tsx` (ADR-0680): el título «Mensajes por WhatsApp», la fila nueva «Recibe avisos del Club /
Sin avisos del Club», «Registrar su BAJA» también con solo los avisos y la nota de abajo. `NuevaClientaModal.tsx` solo suma un campo al objeto que
devuelve: no cambia nada que se vea.

Resumen: **0 graves · 0 medias · 1 leve (arreglada)** · la nota pasaba de 80 letras por línea; ahora ~76 (`max-w-[48ch]`). El resto usa piezas decididas.

## Lo que se midió

| Medidor | Condición | En la tarjeta |
|---|---|---|
| estados | 1440 claro | 0 errores, 0 apagados, 0 sin etiqueta, 0 bucles. Los 2 «hover» que lista son reglas globales de otras pantallas (`.barra-t`, `.parecidas-punto`); `hover-con-mouse.test.ts` en verde |
| estados `{ foco: true }` | 1440 claro, tras Tab | 1 control («Registrar su BAJA»): con anillo, sin anillo flojo, sin foco tapado |
| espacio | 1440 y 375 | sin hallazgos (el botón cumple el blanco con mouse y con dedo) |
| tipografía | 1440 | la nota: ≈83 letras por línea → **arreglada** a ~76; el chip a 13 px (pieza decidida) |
| tipografía | 375 | solo el chip a 13 px (pieza decidida) |
| color | 1440 claro y oscuro | sin fallas de contraste; «Registrar su BAJA» va al control de vidrio, que mide `vidrio-contraste.test.ts` (verde) |
| movimiento | quieto y vivo | nada se mueve en la tarjeta; sin bucles |
| textos | 1440 y 375 | sin fallas |
| a 375 | — | la tarjeta (313×343) no se desborda |

## Hallazgos

1. **Leve · tipografía · la nota pasaba de 80 letras por línea** — `ClientaFichaModal.tsx`, el `<p>` bajo los permisos. Medido: ≈83 letras a 1440.
   Regla: medida de lectura ≤ 80 (`/tipografia`, `[Práctica]`). Arreglado con `max-w-[48ch]` (el `ch` es el ancho del «0», ~10 px a 15 px; `max-w-prose`
   y `58ch` no alcanzaban). Medido después: 492 px, sin hallazgo.

## Decidido a propósito

- **El chip a 13 px** (`lecturaChica`): es `<Chip>`, la pieza única de «Insignias de estado» (ADR-0358, 2026-10-07); la fila de «Recibe novedades» ya
  la usaba igual. No se corrige en la ficha.

## Lo que no se midió

- El estado «cargando» y el error de «Registrar su BAJA»: el botón abre su hoja, que no cambió en este PR.
- 1024 a 1920 px en todo el módulo (`/multi-view-responsive`): fuera del alcance de un cambio de una tarjeta.

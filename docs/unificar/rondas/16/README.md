# Ronda 16 de `/unificar`: el cierre — el marco, las píldoras y los cierres del mes (fuentes)

Armada el 2026-10-15 (rama `claude/unificar-ronda-16`) con lo que quedó afuera de las rondas anteriores. **Decidida el mismo día, mirando:**
el marco se queda en trazo 1,5 (P2), las 12 píldoras de color a mano pasan a `<Chip>` (P1) y «Cómo cerró cada día» se queda (P1).
Registros: [icono.md](../../icono.md), [estado.md](../../estado.md) y [grafico.barras.md](../../grafico.barras.md). La página vive en
`apps/web/unificar/.salida/elegir-ronda16/` (fuera de git), también en un solo archivo (`empaquetar.mjs`); estas son sus fuentes.

| # | Familia | La pregunta | Opciones |
|---|---|---|---|
| 1 | `icono` | ¿El marco pasa al trazo 2? | P2 (recomendada: se queda en 1,5, tamaños a la escala) · P1 (pasa a 2) · A (hoy) |
| 2 | `estado` | ¿Las 12 píldoras a mano pasan a `<Chip>`? | P1 (recomendada: todas, con o sin punto) · A (hoy) |
| 3 | `grafico.barras` | ¿«Cómo cerró cada día» pasa a las barras por tiempo? | P1 (recomendada: se queda) · P2 (con `<BarrasTiempo>`) |

## Archivos

| Archivo | Qué hace |
|---|---|
| `firmas-estado.mjs` | la firma de una píldora de estado a mano, contra el código de hoy |
| `fotos.mjs` | el lateral y la cabecera de hoy y con cada propuesta aplicada EN VIVO (solo los íconos de 24 × 24: el colibrí no se toca); una píldora y el gráfico de cierres |
| `piezas.mjs`, `demo16.css` | las demos: la lupa del marco, las 12 píldoras hoy y con `<Chip>` (el HTML exacto de la pieza) y un mes con `<BarrasTiempo>`; usan `demo9.css` (ronda 9), `demo15.css` y `svg.mjs` (ronda 15) |
| `bajar-css.mjs`, `construir.mjs`, `ver-demos.mjs`, `empaquetar.mjs` | bajan el CSS real, arman la página, fotografían cada tarjeta y la dejan en un solo archivo |

Los de la página se corren desde `apps/web/unificar/.salida/elegir-ronda16/`; los demás, desde `apps/web`. Si el disco se llena a mitad
(pasó el 2026-10-15 con la caché de Turbopack), Docker Desktop queda en «ExitBadState» y hay que reiniciarlo a mano.

# Auditoría al milímetro — abrir una campaña, la hoja de una oferta y «En caja» · 2026-11-18 · `claude/campanas-abrir-campana`

Medido: 1440×900 claro (quieto, como arranca) · 1440 oscuro (tema guardado y la página recargada) · 375×812 · foco con teclado. Servidor:
`localhost:3012` contra la base propia de la rama (Tienda Lima, datos inventados). Los medidores de `/milimetro` (estados, espacio, tipografía,
textos, color) y el de oficio de `/formidable`, sobre el panel de la campaña abierta y sobre la hoja de una oferta con un 3 x 2 elegido.
Alcance: lo que nace con ADR-0677, actividades 6 a 8 (fichas: `docs/milimetro/panel-de-campana.md` y `docs/milimetro/hoja-de-ofertas.md`).

Resumen: **0 graves · 0 medias · 2 leves** (una opción que parte su ejemplo en dos líneas; dos botones apagados sin su motivo a la vista, de piezas de antes) · los demás avisos son del marco o falsos positivos.

## Lo que se midió

| Medidor | Panel de la campaña | Hoja de una oferta |
|---|---|---|
| Estados (`milimetro`) | 0 apagados, 0 errores, 0 en bucle | 2 apagados sin motivo a la vista (leve, abajo); foco: 0 sin anillo, 0 tapados |
| Espacio | 0 blancos bajo 24 px; 1 proximidad «rota» del marco | 0 blancos bajo 24 px; la proximidad de la grilla de prendas de detrás (tapada por la hoja) |
| Tipografía | 0 de lectura bajo 14 px; «Ctrl», «K» de 10 px del buscador del marco | 2 de 12,5 px en «37 categorías sin prendas…» de `CategoriasDeCampana` (pieza de antes); «En caja» con cifras tabulares |
| Textos | sin fallas | «2 por S/ 59.90» parte en dos líneas (leve, abajo) |
| Color | sin fallas | 42 textos medidos, 0 fallan en claro; en oscuro, 0 en «En caja» |

## Leves

1. **«2 por S/ 59.90» en dos líneas.** Con la hoja de 70 rem caben las cinco formas en una fila (antes 4 + 1), pero ese ejemplo mide más que
   su tarjeta. La grilla las deja del mismo alto; se lee en dos golpes. Anotado en el backlog: el de fábrica podría ser «2 por S/ 60».
2. **Apagados sin motivo a la vista:** «Una pagada más» en un 3 x 2 (no se puede pagar 3 de 3) y «Quitar todas» sin categorías marcadas.
   Las dos son piezas de antes (`PasoCantidad`, `CategoriasDeCampana`) y su motivo es evidente por el número; no se tocan aquí.

## Falsos positivos y heredados

- **La opción elegida en oscuro, «1,04 : 1»:** el medidor lee el color de detrás del ahumado, no el de la tarjeta; en la captura es una tarjeta clara
  con letra oscura. Ya visto en 7a.
- **«Guardando…» escrito a mano:** es `<Boton cargando>`, que guarda las dos palabras para no cambiar de ancho (la pieza del sistema).
- El marco (lateral y cabecera) trae sus versalitas de 10–11 px y sus bordes a 2–3 px: no es de esta rama.

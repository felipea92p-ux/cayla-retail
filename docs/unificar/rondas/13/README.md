# Ronda 13 de `/unificar`: la barra de avance, el anillo, copiar y el menú «Más» (fuentes)

Armada el 2026-10-14 (rama `claude/unificar-ronda-13`) con un censo dirigido a los módulos donde viven (Admin, 172 de 201 vistas, y el
terminal de ventas, 44 de 51, con escenarios: `censo-r13.sh`) y, para los gráficos, un mapa del código: el motor solo ve bien los gráficos
SVG grandes y no distingue una barra de avance ni un anillo chico. **Decidida el 2026-10-15: Felipe eligió P1 en las cuatro tocando las
demos, y se migró el mismo día (deuda 0).** Registros: [grafico.avance.md](../../grafico.avance.md), [grafico.anillo.md](../../grafico.anillo.md),
[accion.copiar.md](../../accion.copiar.md), [accion.menu.md](../../accion.menu.md). La página vive en
`apps/web/unificar/.salida/elegir-ronda13/` (fuera de git); estas son sus fuentes y los scripts de la ronda.

| # | Familia | La pregunta | Opciones |
|---|---|---|---|
| 1 | `grafico.avance` | Cómo se ve y cómo se mueve la barra que se llena | P1 (recomendada: tres altos, se llena al verse y pasa a verde al completarse) · P2 (quieta, siempre en tinta, un solo alto) · A (hoy: 38 maneras) |
| 2 | `grafico.anillo` | Cómo se ve y cómo se mueve el anillo que se cierra | P1 (recomendada: tres tamaños, el arco de tinta que pasa a verde al cerrarse) · P2 (verde y quieto) · A (hoy: 15 anillos, cuatro técnicas) |
| 3 | `accion.copiar` | Cómo se ve copiar y qué dice cuando ya copió | P1 (recomendada: junto a un dato el ícono solo, suelto «Copiar …», los dos «✓ Copiado») · P2 (siempre la píldora con la palabra) · A (hoy: nueve caras) |
| 4 | `accion.menu` | ¿«Más» o «⋯»? | P1 (recomendada: «Más ▾» donde cabe la palabra, «⋯» en una fila de una lista) · P2 (el «⋯» en todas partes) · A (hoy: cuatro caras) |

Quedan para después: las líneas y las barras por hora o por día (ronda 14), los íconos (ronda 15) y `accion.buscar`, que el censo encontró con
una sola forma (el secundario «Buscar»).

## Archivos

| Archivo | Qué hace |
|---|---|
| `graficos.md` | el mapa de los ~120 gráficos del ERP trazado en el código: qué migró la ronda 13 y qué queda para la 14 |
| `censo-r13.sh` | el censo dirigido de las cuatro familias con Admin y el terminal de ventas, vigilando que el disco no baje de 6 GB |
| `bajar-css.mjs` | baja el CSS real del ERP de hoy (con la cuenta `integrante`, para no pisar la sesión de un censo) |
| `piezas.mjs`, `demo13.css`, `demo13.js` | las demos: barras y anillos que se mueven con «−/+», copiar que copia un texto de ejemplo, el menú que abre su lista; usan `demo9.css` y `demo9.js` de la ronda 9 |
| `construir.mjs` | arma `spec.json` y llama a `apps/web/unificar/elegir.mjs` |
| `fotos.mjs` | fotografía las piezas de hoy en su pantalla real (y, con `DESPUES=1`, las de después de migrar) |
| `copiar-despues.mjs` | fotografía «Copiar enlace» de Productos antes y después de tocarlo |
| `ver-demos.mjs` | fotografía cada tarjeta de la página (claro u oscuro) |
| `empaquetar.mjs` | la página en un solo archivo (`elegir-ronda13-un-archivo.html`, ~2 MB) |
| `firmas-antes.mjs` | cuenta cuántos archivos reconoce cada firma nueva en el código de antes de migrar (el candado no está ciego) |

Los de la página se corren desde `apps/web/unificar/.salida/elegir-ronda13/`; los demás, desde `apps/web`.

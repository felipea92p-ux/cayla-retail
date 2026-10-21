# Ronda 11 de `/unificar`: cancelar, limpiar e imprimir (fuentes)

Armada el 2026-10-14 (rama `claude/mystifying-jang-ef15d0`) con un censo nuevo de las tres familias (Admin, 253 de 280 vistas, y el terminal
de ventas, con escenarios) y el código rastreado a mano. **Decidida el mismo día: Felipe eligió P1 · P2 · P1 tocando las demos, y se migró (deuda 0).** Registros:
[accion.cancelar.md](../../accion.cancelar.md), [accion.limpiar.md](../../accion.limpiar.md), [accion.imprimir.md](../../accion.imprimir.md). La página vive en
`apps/web/unificar/.salida/elegir-ronda11/` (fuera de git); estas son sus fuentes.

| # | Familia | La pregunta | Opciones |
|---|---|---|---|
| 1 | `accion.cancelar` | Cómo se ve «Cancelar» en el pie de una hoja y dónde va respecto del botón que guarda | P1 (recomendada: a su medida, a la derecha, antes de «Guardar»; mitades a 375 px) · P2 (siempre mitades) · A |
| 2 | `accion.limpiar` | La fila de los filtros puestos y «Limpiar todo» (también el calendario de una fecha y «Pagar juntos») | P1 (recomendada: la píldora de los vacíos y el enlace) · P2 (la píldora y una píldora punteada) · A |
| 3 | `accion.imprimir` | El botón que abre el cuadro de impresión y qué dice | P1 (recomendada: siempre la impresora, «Imprimir» + qué, negro solo si imprimir es el paso) · P2 (siempre secundario) · A |

Lo que el censo encontró: **Cancelar** es casi siempre el botón secundario (21 de 24), pero se reparte de dos maneras —mitades iguales o
a su medida— y quedan tres caras más (sutil, versalitas sueltas DESPUÉS de «Guardar» en Editar marca, y el del flujo del mostrador en
versalitas de 48 px). **Limpiar**: los filtros puestos son pastillas en versalitas hechas a mano, distintas de la píldora que ya se decidió
para los vacíos (ronda 5), y «LIMPIAR» va en versalitas grises en la fila de filtros, el calendario de una fecha y «Pagar juntos».
**Imprimir**: con o sin la impresora, negro o secundario según la pantalla, y varios textos para lo mismo. «Etiquetas» de Existencias no
imprime (lleva a la pantalla de etiquetas): queda fuera.

## Archivos

| Archivo | Qué hace |
|---|---|
| `piezas.mjs` | el HTML de cada demo (clases reales del ERP: `btn-cayla`, `vacio-filtro`, `btn-enlace`, `pildora-cayla`, `data-voz="cabecera"`) |
| `demo11.css`, `demo11.js` | lo propio de esta ronda (las hojas, la fila de filtros que se quitan en cascada, la hoja que sale de la impresora); usa `demo9.css` y `demo9.js` de la ronda 9 |
| `bajar-css.mjs` | baja el CSS real del ERP de hoy (con la cuenta `integrante`, para no pisar la sesión de un censo) |
| `construir.mjs` | arma `spec.json` (y `guion.js` = demo9 + demo11) y llama a `apps/web/unificar/elegir.mjs` |
| `ver-demos.mjs` | fotografía cada tarjeta (claro u oscuro) |
| `empaquetar.mjs` | la página en un solo archivo (`elegir-ronda11-un-archivo.html`, ~4,6 MB) |

## Regenerar (desde `apps/web`)

Necesita la carpeta de la ronda 9 (su `demo9.css` y `demo9.js`: ver `../9/README.md`) y las comparativas del censo copiadas a `img/`
(`can-1-censo_con_Admin.png`, `can-2-censo_del_mostrador.png`, y lo mismo con `lim-` e `imp-`).

```bash
mkdir -p unificar/.salida/elegir-ronda11/img && cp ../../docs/unificar/rondas/11/* unificar/.salida/elegir-ronda11/
B=http://localhost:<puerto> node unificar/.salida/elegir-ronda11/bajar-css.mjs
(cd unificar/.salida/elegir-ronda11 && node construir.mjs && node empaquetar.mjs)
```

# Ronda 12 de `/unificar`: guardar, editar y las hojas (fuentes)

Armada el 2026-10-14 (rama `claude/unificar-ronda-12`) con un censo nuevo de las tres familias (Admin, 253 de 280 vistas, y el terminal
de ventas, 61 de 135, con escenarios: `censo-r12b.sh`) y el código rastreado a mano. **Decidida el mismo día: Felipe eligió P1 en las cinco
preguntas tocando las demos, y se migró (deuda 0).** Registros: [accion.guardar.md](../../accion.guardar.md),
[accion.editar.md](../../accion.editar.md), [modal.md](../../modal.md). La página vive en `apps/web/unificar/.salida/elegir-ronda12/`
(fuera de git); estas son sus fuentes y los scripts de la migración.

| # | Familia | La pregunta | Opciones |
|---|---|---|---|
| 1 | `accion.guardar` | Qué hace el botón mientras la base responde | P1 (recomendada: «Guardando…» y el hilo sin cambiar de ancho) · P2 (solo el hilo) · A (hoy: cuatro maneras) |
| 2 | `accion.editar` | Cómo se ve el botón que abre la edición de algo entero | P1 (recomendada: el secundario con el lápiz; en una fila, el lápiz solo) · P2 (el lápiz solo en todas partes) · A (hoy: diez caras) |
| 3 | `modal` | La cara de una hoja | P1 (recomendada: papel, sin sombra, título de 24 px) · P2 (crema con sombra, 18 px) · A (hoy: tres) |
| 4 | `modal` | Cuánto mide una hoja | P1 (recomendada: angosta, mediana y ancha) · P2 (angosta y ancha) · A (hoy: 22 anchos) |
| 5 | `modal` | Cómo se sale de una hoja | P1 (recomendada: la × si solo se lee, «Cancelar» si guarda) · P2 (la × en todas) · A (hoy: depende) |

## Archivos

| Archivo | Qué hace |
|---|---|
| `censo-r12b.sh` | el censo de las tres familias con Admin y el terminal de ventas, vigilando que el disco no baje de 8 GB |
| `bajar-css.mjs` | baja el CSS real del ERP de hoy (con la cuenta `integrante`) |
| `piezas.mjs`, `demo12.css`, `demo12.js` | las demos: hojas dibujadas con las clases de `<Modal>` que entran como una de verdad, el botón que espera 2 s, los lápices; usan `demo9.css` y `demo9.js` de la ronda 9 |
| `construir.mjs` | arma `spec.json` y llama a `apps/web/unificar/elegir.mjs` |
| `ver-demos.mjs` | fotografía cada tarjeta (claro u oscuro) |
| `hoja-foto.mjs` | fotografía la hoja que abre un escenario del auditor (las «hoy» de la cara de una hoja) |
| `empaquetar.mjs` | la página en un solo archivo (`elegir-ronda12-un-archivo.html`, ~2,1 MB) |
| `etiquetas.mjs` | lee una etiqueta de apertura JSX respetando llaves y comillas, y sus atributos de nivel 0 (lo usan los de abajo) |
| `anchos2.mjs` | migra `ancho="max-w-…"` de cada hoja a `tamano` |
| `salidas2.mjs` | lista las hojas con la × y «Cancelar» a la vez, o sin ninguna salida a la vista |
| `guardando.mjs` | migra el botón que cambia su palabra a «…ando…» a mano a `<Boton cargando textoCargando>` (con `--escribir`) |
| `verbos2.mjs` | le pone su verbo de espera a cada botón con `cargando` que no guarda (desactivar, anular, eliminar…) |

Los de la página se corren desde `apps/web/unificar/.salida/elegir-ronda12/`; los de migración, desde `apps/web` (en seco por defecto).

# Rondas 6, 7 y 8 de `/unificar`: las páginas de elegir (fuentes)

Armadas el 2026-10-12 (rama `claude/unificar-componentes-animaciones-f811a1`). **Esperan la elección de Felipe**: nada de esto se migró.
Las páginas de elegir viven en `apps/web/unificar/.salida/` (fuera de git); estas son sus fuentes, para que otra sesión las pueda
regenerar sin repetir el trabajo.

| Ronda | Familias | Preguntas | Página |
|---|---|---|---|
| 6 · formularios | `campo` + `combo` (una sola pregunta), la lista del combo, el combo que filtra (`filtro`), `etiqueta-campo`, `casilla` | 5 | `elegir-ronda6/elegir.html` |
| 7 · leer datos | `tabla`, `titulo-seccion` (bloque, grupo dentro de una hoja, separador de día) | 4 | `elegir-ronda7/elegir.html` |
| 8 · enlaces, páginas y caras | `enlace` (en una frase · suelto con flecha), `paginacion`, `avatar` | 4 | `elegir-ronda8/elegir.html` |

Todas las opciones con demo están **vivas** con el CSS real del ERP: los combos se abren y eligen con mouse y teclado, el RUC «consulta»
y queda verde, «Registrar gasto» marca lo que falta sin guardar, las casillas se dibujan, las tablas se ordenan y abren su fila, las
listas por día pegan su día arriba. «Repetir la entrada» vuelve a correr las animaciones y «Ver en oscuro» las muestra con los tokens del
modo oscuro. Las fotos de «Existe hoy» salen de los censos (ver abajo).

## Archivos

| Archivo | Qué hace |
|---|---|
| `ronda6/piezas.mjs`, `ronda7/piezas.mjs`, `ronda8/piezas.mjs` | el HTML de cada demo (hoy y propuestas) |
| `ronda6/construir.mjs`, `ronda7/construir.mjs`, `ronda8/construir.mjs` | arman `spec.json`, llaman a `apps/web/unificar/elegir.mjs` y reescriben los fragmentos de `docs/unificar/propuestas/` |
| `ronda6/demo.css`, `ronda6/demo.js` | el CSS (solo tokens) y el comportamiento de las demos; las rondas 7 y 8 usan los mismos |
| `ronda6/bajar-css.mjs` | baja el CSS real del ERP y sus fuentes (necesita el ERP local arriba) |
| `ronda6/numeros.json` | los usos contados en el código (los textos «Une: …») |
| `armar-fotos-r6r7.mjs`, `armar-fotos-r8.mjs` | copian las capturas de los censos a `img/` de cada página y escriben su `fotos.json` |
| `capturar-propuestas.mjs` | las imágenes chicas de `docs/unificar/capturas/*.propuesta.jpg` (P1, claro y oscuro lado a lado) |

## Regenerar (desde `apps/web`)

```bash
mkdir -p unificar/.salida/elegir-ronda6 unificar/.salida/elegir-ronda7 unificar/.salida/elegir-ronda8/img
cp ../../docs/unificar/rondas/6-8/ronda6/* unificar/.salida/elegir-ronda6/
cp ../../docs/unificar/rondas/6-8/ronda7/* unificar/.salida/elegir-ronda7/
cp ../../docs/unificar/rondas/6-8/ronda8/* unificar/.salida/elegir-ronda8/
cp ../../docs/unificar/rondas/6-8/*.mjs unificar/.salida/
B=http://localhost:<puerto del ERP> node unificar/.salida/elegir-ronda6/bajar-css.mjs
```

Las fotos necesitan los censos en `unificar/.salida/r6-viejo-admin/` (combo, tabla, titulo-seccion; censo del 2026-10-07) y
`unificar/.salida/r6-admin/` (campo, etiqueta-campo, casilla); la ronda 8, en `r8-viejo-1007/` (el censo completo del 2026-10-07:
enlace, avatar, accion.siguiente) y `r8-viejo-1006/` (paginación, 2026-10-06). Si no están, se rehacen con el censo (ver `docs/unificar/CONTINUAR.md`)
y se ajustan las letras de `armar-fotos-r6r7.mjs`. Después:

```bash
cd unificar/.salida && node armar-fotos-r6r7.mjs && node armar-fotos-r8.mjs
for r in 6 7 8; do (cd elegir-ronda$r && node construir.mjs); done
```

Y se sirven con `preview_start` **`unificar-laminas`**: `/elegir-ronda6/elegir.html`, `/elegir-ronda7/elegir.html` y `/elegir-ronda8/elegir.html`.

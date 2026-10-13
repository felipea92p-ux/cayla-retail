# Ronda 10 de `/unificar`: descargar, filtros y ver (fuentes)

Armada el 2026-10-13 (rama `claude/mystifying-jang-ef15d0`) con el censo de después de las rondas 6–9 (Admin, 252 de 277 vistas).
**Espera la elección de Felipe.** La página vive en `apps/web/unificar/.salida/elegir-ronda10/` (fuera de git); estas son sus fuentes.

| # | Familia | La pregunta | Opciones |
|---|---|---|---|
| 1 | `accion.exportar` | Bajar un archivo: cómo se ve y qué dice («Exportar» o «Descargar») | P1 (recomendada: «Descargar …» con la flecha que baja) · P2 · A |
| 2 | `accion.filtrar` | El botón que abre los filtros y cómo cuenta los puestos | P1 (recomendada: una píldora más, con el globito) · P2 · A |
| 3 | `accion.ver` | Llevar a ver algo en otra pantalla | P1 (recomendada: botón secundario con la flecha que avanza) · P2 · A |

Lo que ya está decidido no se vuelve a preguntar: dentro de una frase, el enlace (ronda 8); junto a un resumen, `<EnlaceVer>` («Ver las 9 →»).
`accion.filtrar` ya es una sola pieza (`BotonFiltros`, `components/ui/FiltrosPildora.tsx`) con dos caras (versalitas y el cuadrado de
Existencias); la pregunta es su cara.

## Archivos

| Archivo | Qué hace |
|---|---|
| `piezas.mjs` | el HTML de cada demo (clases reales del ERP: `btn-cayla`, `pildora-filtro`, `titulo-cuenta`, `enlace-ver`, `data-voz="cabecera"`) |
| `demo10.css`, `demo10.js` | lo propio de esta ronda (la flecha que baja, el hilo mientras se arma el archivo, el panel de filtros); usa `demo9.css` y `demo9.js` de la ronda 9 |
| `construir.mjs` | arma `spec.json` (y `guion.js` = demo9 + demo10) y llama a `apps/web/unificar/elegir.mjs` |
| `ver-demos.mjs` | fotografía cada tarjeta (claro u oscuro) |
| `empaquetar.mjs` | la página en un solo archivo (`elegir-ronda10-un-archivo.html`, ~2 MB) |

## Regenerar (desde `apps/web`)

Necesita la carpeta de la ronda 9 armada (su `app.css`, `clase.txt`, `demo9.css`, `demo9.js`: ver `../9/README.md`) y las fotos del censo
(`r9-despues-admin/capturas/accion-*`, copiadas a `img/` con los nombres que usa `construir.mjs`).

```bash
mkdir -p unificar/.salida/elegir-ronda10/img && cp ../../docs/unificar/rondas/10/* unificar/.salida/elegir-ronda10/
(cd unificar/.salida/elegir-ronda10 && node construir.mjs && node empaquetar.mjs)
```

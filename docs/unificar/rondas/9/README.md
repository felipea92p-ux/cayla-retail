# Ronda 9 de `/unificar`: las seis decisiones que dejaron abiertas las rondas 6–8 (fuentes)

Armada el 2026-10-13 (rama `claude/mystifying-jang-ef15d0`), después de la migración de las rondas 6–8 (PR #1026). **Espera la elección de
Felipe.** La página de elegir vive en `apps/web/unificar/.salida/elegir-ronda9/` (fuera de git); estas son sus fuentes.

| # | Familia | La pregunta | Opciones |
|---|---|---|---|
| 1 | `combo` | La lista que sugiere mientras escaneas o buscas (Llegó mercadería, Recibir contra factura, Registrar nota de crédito) | P2 (recomendada) · P1 · A |
| 2 | `tabla` | La planilla de Contar (`ListaConteo` + `FilaConteo`) | P1 (recomendada) · A |
| 3 | `filtro` | Los filtros de Frescura («Estado» con grupos con título) | P1 (recomendada) · P2 · A |
| 4 | `accion.eliminar` | «Desactivar color» en `ColoresLista` | P1 (recomendada) · P2 · A |
| 5 | `titulo-seccion` | El número de un título de bloque o de grupo | P2 (recomendada) · P1 · A · B |
| 6 | `enlace` | Las acciones chicas dentro de una hoja | P2 (recomendada) · P1 · A · B |

Lo que dice «Existe hoy» o «Lo aplicado ahora» es **HTML copiado del DOM real** del ERP (`vivas.json`, de `piezas-vivas.mjs`), así que
se ve y se mueve igual que en la app. Las propuestas usan las clases reales del ERP (`lista-flotante`, `pildora-filtro`, `titulo-seccion`,
`btn-cayla`, `caja-campo-input`…) y `demo9.css` (solo tokens). Todo es vivo: escribir, ↑ ↓ y Enter, contar, abrir filtros, dos toques en
«Desactivar». Nada guarda.

## Archivos

| Archivo | Qué hace |
|---|---|
| `bajar-css.mjs` | baja el CSS real del ERP y sus fuentes (ERP local arriba) |
| `fotos-hoy.mjs` | las fotos de «Existe hoy» en las pantallas reales (`img/`) |
| `piezas-vivas.mjs` | copia el HTML real de cada pieza a `vivas.json` |
| `piezas.mjs` | el HTML de cada demo (hoy y propuestas) |
| `demo9.css`, `demo9.js` | el estilo (solo tokens) y el comportamiento de las demos |
| `construir.mjs` | arma `spec.json` y llama a `apps/web/unificar/elegir.mjs` |
| `ver-demos.mjs`, `probar.mjs` | fotografían cada tarjeta (claro u oscuro) y prueban las interacciones |
| `empaquetar.mjs` | la página en un solo archivo que se abre sin servidor (`elegir-ronda9-un-archivo.html`, ~4 MB) |

## Regenerar (desde `apps/web`)

```bash
mkdir -p unificar/.salida/elegir-ronda9 && cp ../../docs/unificar/rondas/9/* unificar/.salida/elegir-ronda9/
B=http://localhost:<puerto del ERP> node unificar/.salida/elegir-ronda9/bajar-css.mjs
B=http://localhost:<puerto del ERP> node unificar/.salida/elegir-ronda9/fotos-hoy.mjs
(cd unificar/.salida/elegir-ronda9 && node construir.mjs && node empaquetar.mjs)
```

**Ojo con el caché de Turbopack:** el 2026-10-13 el `next dev` de esta worktree servía un CSS sin las piezas de las rondas 6–8 (el
`.next/dev` era del 6 de octubre). Si `bajar-css.mjs` trae un `app.css` sin `titulo-seccion`, toca `app/globals.css` con el servidor
arriba (una línea en blanco y quitarla) y vuelve a bajarlo. Y mira el disco (`df -h ~`): ese `.next` creció 4 GB en media hora.

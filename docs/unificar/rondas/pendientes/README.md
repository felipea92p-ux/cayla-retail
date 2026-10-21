# Pendientes antes de la ronda 12 de `/unificar`: la cabecera, «Etiquetas» y «Ver» (fuentes)

Armada el 2026-10-14 (rama `claude/unificar-ronda-12`) con un censo de qué cabecera dibuja cada pantalla (`censo-cabeceras.mjs`) y fotos de
las pantallas de hoy con la cabecera de Inventario armada en el navegador, sin tocar el código (`cabeceras.mjs`). **Decidida el mismo día:
Felipe eligió P1 · P1 · P1 mirando las fotos y tocando las demos, y se migró (deuda 0).** Registros:
[titulo-pagina.md](../../titulo-pagina.md), [accion.imprimir.md](../../accion.imprimir.md) («Etiquetas») y
[accion.ver.md](../../accion.ver.md) («Ver» en una fila). La página vive en `apps/web/unificar/.salida/elegir-cabeceras/` (fuera de git);
estas son sus fuentes.

| # | Familia | La pregunta | Opciones |
|---|---|---|---|
| 1 | `titulo-pagina` | Qué cabecera llevan Compras, Recibir, Producción, Categorías, Atributos, Configuración, Rendimiento, Etiquetas de precio y Actividad | P1 (recomendada: la de Inventario en todas, menos Finanzas) · P2 (la de Inventario en la tienda y el taller; la de Finanzas en lo de gestión) · A (hoy: cuatro) |
| 2 | `accion.imprimir` | El ícono de «Etiquetas», que lleva a la pantalla de etiquetas (Productos tenía la impresora; Existencias, la etiqueta) | P1 (recomendada: la etiqueta en los dos) · P2 (la impresora en los dos) · A |
| 3 | `accion.ver` | El «Ver» de cada pendiente del turno en Caja (un botoncito de 24 px hecho a mano) | P1 (recomendada: el enlace del sistema) · P2 (`<BotonVer>` chico, que agranda la fila a 44 px) · A |

## Archivos

| Archivo | Qué hace |
|---|---|
| `censo-cabeceras.mjs` | recorre cada `page.tsx` de `app/(app)` con la cuenta que la ve y dice qué cabecera dibuja (`EncabezadoPagina`, `CabeceraPantalla` u otra) |
| `cabeceras.mjs` | fotografía la cabecera de cada pantalla hoy y con la de Clientes puesta en su lugar (mismo título, frase y botones) |
| `piezas.mjs`, `demo-pe.css` | las demos de «Etiquetas» y «Ver» con las clases reales del ERP; usan `demo9.css` y `demo9.js` de la ronda 9 |
| `construir.mjs` | arma `spec.json` y llama a `apps/web/unificar/elegir.mjs` |
| `ver-demos.mjs` | fotografía cada tarjeta (claro u oscuro) |
| `empaquetar.mjs` | la página en un solo archivo (`elegir-pendientes-un-archivo.html`, ~4,5 MB) |
| `fotos-cabeceras.mjs` | después de migrar: la cabecera de las 31 pantallas en claro, oscuro y a 375 px (de ahí salen las capturas del registro) |

Se corren desde `apps/web/unificar/.salida/elegir-cabeceras/` (o `cabeceras-censo/`) con el ERP local levantado: solo leen.

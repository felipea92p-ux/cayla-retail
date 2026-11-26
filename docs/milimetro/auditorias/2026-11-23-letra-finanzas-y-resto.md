# Auditoría al milímetro — lo que quedaba de la letra (Finanzas, Clientes, Tienda web, Configuración y el resto) · 2026-11-23 · `claude/letra-finanzas-y-resto`

Medido: 68 vistas, 55 a 1440 × 900 y 13 a 375 × 812, en un Chrome de prueba contra el servidor de la rama (`localhost:3010`), antes y
después del cambio y con la misma base local. Las vistas solo abren pantallas; ninguna guarda. Son: el Inicio (Observatorio),
Actividad, Buscar, Clientes (Fichas, Avisos, Beneficios y Cartel), Colaboradores, Comercial y Calidad, Configuración, Finanzas
(Resumen, Gastos, Cuentas y dinero con sus cuatro pestañas, Impuestos y SIRE, Cierre de mes y los siete Estados financieros),
Producción (nueve pantallas) y Órdenes de insumos, Tienda web (ocho pantallas), «Sin acceso», las páginas públicas del club, Rótulos,
Etiquetas de precio y Salud del negocio. En cada una: el tamaño, el interlineado y el alto de cada texto, los textos cortados, el
desborde horizontal y el alto del documento. El «después» se repitió en oscuro. Aparte, el login sin sesión, a 1440 y a 375 px.

De las 68, 61 son comparables: llegaron a la misma pantalla antes y después. Las siete de Tienda web salieron redirigidas en el
«antes» (venían de la vista global) y solo se miró su «después».

Resumen: **0 graves · 1 media · 1 leve** · en las 61 vistas comparables los textos de menos de 13 px bajaron de 390 a 114, sin un texto cortado nuevo ni desborde; la deuda de letra del ERP quedó en 25.

## Lo que se midió

| Medida | Antes | Con este cambio |
|---|---|---|
| Textos por debajo de 13 px, en las 61 vistas comparables | 390 | 114 |
| De esos, letra fija a propósito (el «?», siglas y vistos en un círculo, el centro de la dona, el cartel en miniatura) | — | 101 |
| De esos, cifras y ejes de gráficos (pendiente) | 13 | 13 |
| Textos cortados, en las 61 comparables | 130 | 130 |
| Vistas con desborde horizontal | 0 | 0 |
| Vistas cuyo alto cambió | — | 25 de 61, entre −22 y +118 px |
| El título de «En qué se va» (Qué debes) | 15 px | 16 px |
| Los rótulos del login (sedes y marca) | 9,5 y 10 px | 13 px |

## Hallazgos

| # | Gravedad | Qué | Dónde | Estado |
|---|---|---|---|---|
| 1 | Media | El cambio en bloque pasó a la escala la letra de los dibujos de los gráficos de Finanzas, que va en unidades de su lienzo: en el celular habría quedado ilegible | `finanzas.css`, las reglas de `.fin-grafico svg[viewBox…] text` | Resuelto antes de medir: lo atrapó `lib/finanzas-letra-legible.test.ts`. Se devolvió a su valor y se marcó letra fija. Se buscaron otras en todas las hojas: no hay |
| 2 | Leve | A 13 px, el rótulo «Tienes en total» pisaba el borde de la dona | Finanzas ▸ Cuentas y dinero | Resuelto: el texto del centro de la dona volvió a su tamaño y quedó marcado letra fija |

## Sin medir

- El Inicio de almacén: lo ve la cuenta de almacén y su sesión de prueba estaba vencida. Su hoja cambió (51 tamaños).
- Producción dentro del Taller: la cuenta de prueba estaba en Tienda Lima y solo se vio el aviso «se trabaja desde el Taller».
- Las hojas y modales de Finanzas, Clientes, Tienda web y Configuración: cambiaron de clase, no de tamaño; no se abrieron.
- El «antes» de las siete pantallas de Tienda web y el «antes» en oscuro.
- Un teléfono de verdad y Safari: el celular es emulado.
- El papel: la guía de traslado, los rótulos, las etiquetas y el cartel del club no se tocaron.

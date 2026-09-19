# Spike visual · Proveedores (2026-09-19)

> **Estado (2026-09-19): aplicado al ERP, ENTRADA INCLUIDA — ver `docs/adr/0128-proveedores-vista-rapida-y-gestos-de-movimiento.md`.**
> La regla «nada se anima solo al entrar» de `globals.css` se cambió por decisión de Felipe: la llegada a una
> pantalla con varias piezas también se anima. Este HTML queda como referencia visual del diseño aprobado.

`proveedores-spike.html` — autocontenido, ábrelo en el navegador. Datos inventados. **No es una
implementación ni reemplaza las maquetas aprobadas 08 y 09** (`../compras-2026-09/`): parte de ellas
(mismos tokens, mismas cifras, mismos textos) y explora qué pasa si la lista y la ficha *responden*
más. Los dos botones de arriba sirven para juzgarlo: «Repetir la entrada» y «Movimiento reducido»
(simula `prefers-reduced-motion`).

## Qué mejora en UX (no solo «se mueve»)

| Idea | Problema que resuelve | Dónde se portaría |
|---|---|---|
| **Vista rápida** (cajón) al hacer clic en una fila, con ↑ ↓ entre proveedores | Hoy un clic te saca de la lista; para comparar 5 proveedores vas y vuelves 5 veces | componente nuevo `ProveedorVistaRapida.tsx`; `FilaLider` deja de ser un `<Link>` estirado |
| **Siguiente paso sugerido** («$6,670 ya venció… Pagar vencido») en cajón y ficha | Las cifras están, pero el «¿y ahora qué?» lo pone quien mira | función pura en `proveedores-reglas.ts` (testeable, como `chipEntregas`) |
| **Barra de concentración ↔ tabla**: apuntar a un tramo enciende su fila | «34 %» no dice *quién*; hoy hay que buscarlo en la tabla | `page.tsx` (KPI) + estado compartido con `ProveedoresPanel` |
| **Barrita de deuda por fila** (rojo = vencido) | El saldo es un número; la proporción se ve sin leer | `FilaLider` |
| **Mini-tendencia de facturación** por fila | «Facturado 12 m» esconde si viene subiendo o cayendo | necesita serie mensual en `fn_proveedores()` (dato nuevo, ver abajo) |
| **Desactivar con «Deshacer»** (7 s) | Hoy un clic mal dado hay que ir a reactivar | `avisar` ya existe; falta el botón de acción |
| **RUC validado mientras escribes** (11 dígitos, prefijo, duplicado con el nombre del existente) | El error llega al guardar | `ProveedorModal.tsx` |
| **Búsqueda con resaltado** + «/» para enfocar | Ver *por qué* coincidió una fila | `ProveedoresPanel.tsx` |

## Gramática de movimiento

Reutiliza lo que ya está en `globals.css` (mismos nombres): `cayla-entrada`, `cayla-revelar`,
`cayla-asentar`, `cayla-velo`, `cayla-hilo-barrido`, `cayla-brillo`, curvas `--ease-cayla` /
`--ease-salida`, y el colapso a 1 ms con movimiento reducido. Sin rebote, sin color nuevo, sin sombra.

**Gestos nuevos** (llevan prefijo `nv-`; habría que aprobarlos como ampliación de la v3.1):

| Gesto | Qué hace | Costo de portarlo |
|---|---|---|
| **FLIP al ordenar/filtrar** | Las filas se deslizan a su nueva posición (solo `transform`) en vez de saltar | ~25 líneas de JS en `ProveedoresPanel`; sin dependencia |
| **Pulgar deslizante** en el filtro de rubro y el plazo | El «activo» viaja de una opción a otra | ~15 líneas + CSS |
| **Cifra que cuenta** hasta el valor nuevo | La cifra que cambió se nota sin releerla (extiende «asentar») | hook `useContar` (~20 líneas) |
| **Trazo** (`stroke-dashoffset` con `pathLength=1`) | Sparkline y gráfico de costo se dibujan; en la fila, solo al pasar el mouse | CSS puro |
| **Barras que crecen** (`scaleX/scaleY`) | Barra de saldo, concentración, plazo pactado vs real | CSS puro |
| **Destello de «acaba de pasar»** | La fila recién creada/reactivada se marca 2.6 s y se apaga sola | CSS puro (mismo patrón que `cayla-tope`) |
| **Despliegue por `grid-template-rows: 0fr → 1fr`** | «Desactivados» se abre sin medir alturas | CSS puro |
| **Aviso con temporizador visible** | La línea inferior *es* el timer; el mouse encima lo pausa | ya casi lo hace `Avisos.tsx` |

## La regla que cambió

`globals.css` decía: *«nada se anima solo al entrar a la pantalla»*. Este spike la contradecía a propósito
(escalonado de KPIs y filas, conteo de cifras, gráfico que se dibuja). Felipe eligió cambiar la regla, no
hacer una excepción: ahora la llegada a una pantalla con varias piezas también se anima, con límites (una
vez, sin bucle, sin rebote, movimiento reducido = instante). Ver el encabezado de «Capa de movimiento».

## Lo que el spike inventa y producción no tiene

- Serie mensual de facturación por proveedor (`p.serie`): `fn_proveedores()` hoy no la devuelve.
  Sin ella, la mini-tendencia de la fila y las barras del cajón no se pueden portar (el resto sí).
- Datos de la ficha (entregado completo, plazos, últimos comprobantes) son de ejemplo, derivados de
  las cifras de la lista; en producción vienen de `fn_proveedor_metricas_compras`.
- Cifras inventadas: proveedores, montos, RUC.

## Verificado en el navegador (1440 px, 1024 px y 390 px)

Orden con FLIP, búsqueda con resaltado y «Registrarlo →», filtro por rubro, cajón con navegación,
ficha con conteo y gráfico, alta con RUC duplicado/válido → fila nueva + KPI +1, desactivar y
deshacer, y modo celular. Sin errores de consola.

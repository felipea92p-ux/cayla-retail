# Spike visual · Proveedores (2026-09-19)

> **Estado (2026-09-19): aplicado al ERP — ver `docs/adr/0122-proveedores-vista-rapida-y-gestos-de-movimiento.md`.**
> Se aplicó todo lo de abajo EXCEPTO la animación de entrada (escalonado de KPIs y filas, conteo desde 0,
> trazo del gráfico al abrir): `globals.css` prohíbe que algo se anime solo al abrir la pantalla. Este archivo
> HTML queda como referencia para compararla si Felipe decide conceder esa excepción.

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

## Ojo: contradice una regla escrita

`globals.css` dice: *«el movimiento RESPONDE a una acción de la persona. Nada se anima solo al
entrar a la pantalla.»* (con una excepción ya concedida: la dona de Caja).
Este spike **sí anima la entrada** (escalonado de KPIs y filas, conteo de cifras) para que se pueda
evaluar. Decisión que es de Felipe: (a) mantener la regla y quedarse solo con los gestos que responden
a un clic (FLIP, pulgar, cajón, destello, trazo al hover, deshacer) — recomendado; o (b) conceder
otra excepción para la entrada de esta pantalla. Si es (b), va con ADR.

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

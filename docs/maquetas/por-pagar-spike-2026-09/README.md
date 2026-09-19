# Spike visual · Por pagar (2026-09-19)

> **Estado (2026-09-19): aplicado al ERP — ver `docs/adr/0129-por-pagar-responde.md`.**
> Este HTML queda como referencia visual del diseño aprobado. Difiere del ERP en tres cosas a propósito: la vista rápida no
> lista los pagos (D4), el filtro por tramo/semana actúa sobre la página cargada (D2) y la onda del puntito la lleva «Vence
> esta semana», no «Vencido» (tope de rojo por pantalla).

`por-pagar-spike.html` — autocontenido, ábrelo en el navegador. Datos inventados (los de la maqueta 02:
7 comprobantes, S/ 19,207.60, «hoy» fijo en 18/09). **No es una implementación ni reemplaza la maqueta 02 ni la 03**
(`../compras-2026-09/`): parte de ellas (mismos tokens, mismas cifras, mismos textos) y explora qué pasa si la
pantalla *responde* más. Los botones de arriba sirven para juzgarlo: «Repetir la entrada», «Movimiento reducido»
(simula `prefers-reduced-motion`) y «Restablecer datos» (para volver a pagar).

**Recorrido sugerido:** marca `F001-000412` → aparecen «＋ agregar» los otros de Tejidos Rímac → «Pagar juntos» →
«Solo lo vencido» → registra → mira cómo reacciona toda la pantalla. Después: pasa el mouse por las barras,
haz clic en una fila (vista rápida, ↑ ↓), escribe una caja en «Salidas de caja», busca con `/`.

## Qué mejora en UX (no solo «se mueve»)

| Idea | Problema que resuelve | Dónde se portaría |
|---|---|---|
| **La pantalla reacciona al pago**: la fila pagada se marca, se pliega, el resto se desliza, las cifras cuentan hasta su valor nuevo y las barras se reacomodan | Hoy `router.refresh()` reemplaza todo de golpe: no se ve *qué* cambió ni cuánto bajó la deuda | `PorPagarLista.tsx` (`onPagado`) + hook de conteo |
| **Las 4 piezas conversan**: apuntar a un tramo del vencimiento, a una barra de caja o a un segmento de concentración *enciende* las filas que le corresponden; un clic las filtra, con chips quitables | «Vencido S/ 6,670» no dice *cuáles*; hoy hay que ir a buscarlos | estado compartido en `page.tsx`/`PorPagarLista`; los filtros ya existen en la URL |
| **«¿Alcanza la caja?»**: escribes cuánta caja tienes y cada semana muestra cuánto queda cubierto + una frase | La tarjeta de salidas *dice* «saber si la caja alcanza», pero no responde | componente `SalidasDeCaja.tsx`; el monto no se guarda (solo pantalla) |
| **Sugerencia «＋ agregar» en la barra fija**: los otros comprobantes del mismo proveedor a un clic | Para pagar todo lo de un proveedor hay que marcar fila por fila | `BarraFija` de `PorPagarLista` (ya conoce `proveedorActivo`) |
| **Barra de plazo consumido** por fila (emisión → vence) y **barra de % pagado** | «Vence en 14 días» no dice si es un plazo de 15 o de 60 | `FilaPorPagar` (los datos ya vienen: emisión y vencimiento) |
| **Vista rápida** con línea de vida, pagos y *siguiente paso* sugerido | Un clic en la fila te saca de la lista; comparar 5 comprobantes = ir y volver 5 veces | componente nuevo; el «siguiente paso» como función pura en `por-pagar-reglas.ts` (testeable) |
| **Cascada del pago**: cada comprobante muestra cuánto del pago recibe, en el orden real de `repartirPago` | «Cubrir primero la más vencida» es una regla que hoy hay que *creerse* | `PagoJuntosModal.tsx` |
| **Atajos de monto** («Todo», «Solo lo vencido») y **copiar con acuse** (✓ Copiado) | Pagar «solo lo vencido» exige sumar de cabeza y escribirlo | `PagoJuntosModal.tsx` |
| **«Pagar con este saldo»** filtra y deja marcados los comprobantes del proveedor | Hoy lleva a la lista filtrada y hay que marcar a mano | `SaldosAFavor.tsx` (enlace con `?prov=…&marcar=1`) |
| **Estado «Todo pagado»** que se dibuja, y **la selección que empieza de nuevo avisa por qué** | Hoy una casilla de otro proveedor reinicia la selección sin decir nada | `PorPagarLista.tsx` |

## Lo que NO cambia (a propósito)

- Mismas cifras, columnas, tramos, textos y reglas (`tramoDe`, `etiquetaVence`, `repartirPago` están reescritas 1:1).
- **Sin «Deshacer» un pago**: un pago es plata que salió. Anularlo es un flujo aparte y con rastro (nunca se borra), no un botón de 7 s.
- El pago individual real (`RegistrarPagoModal`) permite repartir en **varios medios**; el spike usa un solo modal para ambos caminos y no dibuja esa parte.
- «Condición» y el selector de proveedor de `FiltrosCompras` no se dibujan: aquí el proveedor se filtra desde la barra de concentración y la búsqueda. Con decenas de proveedores el selector sigue haciendo falta.

## Gramática de movimiento

Reutiliza lo que ya está en `globals.css` (mismos nombres): `cayla-entrada`, `cayla-hoja`, `cayla-revelar`, `cayla-asentar`,
`cayla-velo`, `cayla-hilo-barrido`, `cayla-brillo`, curvas `--ease-cayla` / `--ease-salida`, y el colapso a 1 ms con movimiento
reducido. Sin rebote, sin sombra, sin gradiente. Reglas de ADR-0128: la llegada se anima **una vez**, escalonada (≤ 40 ms), y lo que
la persona ya está usando no se re-anima al filtrar.

**Gestos que ya aprobó el ADR-0128 para Proveedores y aquí se reutilizan:** FLIP al reordenar, pulgar deslizante, cifra que cuenta,
trazo (`stroke-dashoffset`), barras que crecen. **Nuevos en este spike** (prefijo `nv-`; habría que aprobarlos):

| Gesto | Qué hace |
|---|---|
| `nv-destello` | La fila que acaba de cambiar (pago parcial) se enciende en verde 2.4 s y se apaga sola |
| **Fila pagada que se pliega** | Se marca «Pagada», se pliega en 380 ms y las demás se deslizan (FLIP) a su sitio |
| **Tilde que se dibuja** en casillas, «Copiado» y confirmación | El estado nuevo se *hace* en vez de aparecer |
| **Encendido cruzado (`.eco`)** | Apuntar a una barra enciende sus filas y atenúa el resto |

## Cómo se vería portado (estimación)

Sin dependencias nuevas. CSS: ~120 líneas nuevas en `globals.css` (todas bajo `@layer components`). JS: un hook `useContar`
(~20 líneas), un helper `flip()` (~15 líneas, el de Proveedores) y el estado de filtros cruzados en `PorPagarLista` (hoy ya vive en la URL).
Nada de esquema ni de RPC: **cero migraciones**. La única pieza con datos nuevos sería la vista rápida si se quiere mostrar el historial de
pagos sin ir al detalle (`getCompra` ya lo trae).

## Cómo verificar

Abrir el HTML → recorrido de arriba. En consola: `MODAL`, `S` (estado) y `C` (comprobantes) son globales. Con «Movimiento reducido»
todo llega al mismo estado final sin viaje. Probado a 375 px (sin scroll horizontal) y a escritorio.

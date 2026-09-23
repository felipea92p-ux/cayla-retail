# Spike visual · Cierre, traslado y apertura de caja (2026-09-23)

> **Estado (2026-09-23): implementado — ver `docs/adr/0186-cierre-con-traslado-y-apertura-verificada.md`.** Difiere del
> spike por decisión de Felipe: el esperado se ve desde el inicio (sin conteo ciego), sin fondo sugerido y sin traslado a
> otra sede o al Taller.

`caja-cierre-spike.html`: un solo archivo, se abre en el navegador. Los datos son inventados (Trujillo, apertura
S/ 200.00, el sistema espera S/ 1,955.50). **Es solo el diseño, todavía no está en el ERP.** Parte de
`CerrarCajaModalV2.tsx` y `AbrirCajaFormV2.tsx` tal como están hoy.

**Recorrido:** «Cerrar caja» → escribe 1950 o usa «Contar por billetes y monedas» → «Continuar» → escribe cuánto
trasladas (prueba 1750 → «Otra sede · Arequipa») y mira cuánto queda para el próximo turno → «Cerrar caja» → «Ver caja cerrada» → «Hay otro
monto» → 180. Los botones de arriba cambian la variante del conteo y si el cierre anterior cuadró o no.

## Qué cambia

| Idea | Problema que resuelve | Dónde se portaría |
|---|---|---|
| **Sistema y físico lado a lado**, con el desglose de dónde sale el esperado (apertura + ventas en efectivo − egresos − reembolsos ± cambios) y la diferencia al instante | Hoy la diferencia aparece recién *después* de cerrar, cuando ya no se puede volver a contar | `CerrarCajaModalV2.tsx` paso 1; el desglose ya existe en `getResumenCaja` |
| **Contar por billetes y monedas** (opcional) | Sumar de cabeza 40 billetes es la fuente más común de «faltan S/ 10» | lógica pura en `lib/caja-conteo.ts` |
| **Paso de traslado**: un campo «¿Cuánto vas a trasladar?», el destino (caja fuerte, depósito BCP con n.º de voucher, líder, otra sede, Taller) y el sistema calcula cuánto queda en el cajón para el próximo turno | Hoy el cierre no dice qué pasó con la plata; la apertura del día siguiente sale de la memoria de alguien | `cerrar_caja` recibe los traslados en la misma transacción |
| **Traslado a otra sede queda «en camino»** hasta que la sede que lo recibe lo confirma | Plata entre sedes sin acuse = plata que nadie puede rastrear | mismo patrón que los traslados de stock |
| **Caja cerrada muestra el último cierre**: cuánto quedó en el cajón, quién, cuándo, si cuadró y a dónde se fue el resto | La pantalla hoy es un formulario vacío, sin contexto | `app/(app)/caja/page.tsx` rama `!caja` |
| **Antes de abrir, contar el cajón**: con un toque («Conté y hay S/ 200.00») o escribiendo otro monto con motivo obligatorio y aviso al líder | Si se abre con un monto que no está, el faltante del turno anterior se le cobra a quien abre | `AbrirCajaFormV2.tsx` + `abrir_caja` |

## Una decisión que tomas tú: ¿mostramos el esperado antes de contar?

Hoy el cierre es **conteo ciego**: quien cuenta no ve cuánto espera el sistema (comentario en `CerrarCajaModalV2.tsx`
y `lib/caja.ts`). La razón: si ves «S/ 1,955.50», cuentas hasta llegar a ese número. Deja de ser una medición y se
vuelve una confirmación, y los faltantes reales no aparecen.

El spike trae las dos variantes (arriba, «Sistema al contar»):

- **Se revela al escribir (lo que recomiendo).** La columna del sistema está tapada hasta que escribes lo contado.
  Ahí aparece con el desglose y la diferencia, y **todavía puedes volver a contar antes de cerrar**. Conservas el
  conteo ciego y ganas lo que pediste: ver los dos números juntos antes de confirmar.
- **Visible desde el inicio.** Es tal cual lo pediste. Es más rápido, pero pierdes el conteo ciego.

## Lo que haría falta en la base (sin construir)

- `cajas` suma `monto_fondo` (lo que queda en el cajón = contado − traslados). La apertura siguiente lo lee como
  «lo que debería haber».
- Tabla nueva `caja_traslados`: `caja_id`, `destino` (`caja_fuerte` / `banco` / `lider` / `sede`),
  `ubicacion_destino_id`, `monto`, `referencia`, `estado` (`en_camino` / `recibido`), `recibido_por`, `recibido_en`.
  No la pongo como egreso en `caja_movimientos` porque un traslado a otra sede necesita acuse de recibo, y un
  egreso no tiene ese estado. `cerrar_caja(p_caja_id, p_monto_real, p_traslados jsonb)` graba todo en una sola
  transacción, o no graba nada.
- `abrir_caja` suma `monto_apertura_esperado` y `motivo_diferencia_apertura`. Si no coincide, exige el motivo en
  el servidor, no solo en la pantalla.

## Preguntas abiertas (del negocio)

1. ¿Conteo ciego o visible? (arriba)
2. ¿El fondo de S/ 200 es igual en las tres tiendas, o cada sede tiene el suyo?
3. ¿La caja fuerte de la sede lleva su propio saldo en el sistema? Si la plata entra ahí y nadie registra cuándo
   sale, se vuelve un segundo cajón sin cuadre.
4. Cuando la apertura no coincide, ¿el aviso va al líder de equipo de esa sede o a ti?

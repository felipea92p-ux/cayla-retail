# Diego — Pelícano — Compras y proveedores

> Extraído del plano maestro (143 decisiones, `docs/plano/00-ACTA-24-DECISIONES.md` y
> `02` a `05-ACTA-SESION-*.md`). Cada línea es una decisión ya tomada por Felipe — no es
> una propuesta, es lo que hay que construir o ya está construido.

## Decisiones

**PL-27** — Nace el rol Compras: crea y edita proveedor, registra orden de compra y pago — no cierra caja ni ve otras sedes.
  *Pendiente:* Construir el RPC y el nivel de permiso — todavía no existe.

**PL-30** — Pago en efectivo a un proveedor por S/2,000 o más (ley 28194) solo dispara un aviso al registrar el pago, nunca lo bloquea.
  *Pendiente:* Falta construir ese aviso en la pantalla de registro de pago.

**PL-31** — Orden de compra recibida a medias: se cierra con un botón 'Cerrar con faltante', y el líder de equipo confirma que el resto no va a llegar.
  *Pendiente:* Construir el RPC y el botón — todavía no existen.

**PL-32** — Reversar un pago a proveedor mal registrado lo hace solo el líder de equipo, con motivo obligatorio; el pago original queda visible como anulado, nunca se borra.
  *Pendiente:* Construir el RPC de reverso — todavía no existe.

**PL-33** — El estado 'confirmada' de una orden de compra se usa de verdad: el proveedor confirma antes de que llegue el fardo.

**PL-34** — Se valida el RUC del proveedor contra el padrón igual que en Facturación: consulta y autocompleta, pero se puede guardar sin RUC.
  *Pendiente:* Depende de que la variable PADRON_PROVEEDOR esté confirmada en Vercel (PL-123).

**PL-35** — Interbank y BCP quedan confirmadas como las 2 cuentas bancarias reales, destino de todo cobro electrónico (POS/Yape/Plin/transferencias).
  *Pendiente:* Felipe todavía no define cuál es Operativa y cuál Reserva, ni cómo entran las 'otras cuentas' que usa para mover dinero — sin fecha, no bloquea nada por ahora.

**PL-38** — Se cierra ya la lista de categorías de gasto: rubros de compra (R-51) más gastos de operación del día a día, sin reabrir Contabilidad completa.

**PL-50** — Compras deja el nombre 'Comprobante'/'Nota de crédito' (eso es exclusivo de Ventas, que sí toca SUNAT) y pasa a llamarse 'Factura de proveedor' y 'Nota de crédito de proveedor' — puro registro interno, sin campos fiscales.
  *Pendiente:* Corregir apps/web/lib/menu.ts:163 y 187, y las menciones en ADR-0111, ADR-0142 y el BACKLOG.

**PL-81** — Cada movimiento de stock debe traer exactamente una columna de origen llena (venta/compra/producción/cambio, nunca dos a la vez) — aplica también al movimiento que genera una recepción de mercadería.
  *Pendiente:* Candado de base de datos todavía no construido; cuando se construya, la recepción de mercadería de Compras debe respetarlo.

**PL-94/95** — Diego pega el SQL de su propio módulo (Compras) siguiendo el checklist de PL-87, y por decisión explícita de Felipe también ve el negocio completo como Admin.
  *Pendiente:* Seguir siempre el checklist de PL-87 (ensayo en Postgres desechable + sonda de solo lectura + registro en sql_aplicado y en el PR) antes de pegar SQL en producción.

**PL-109** — La auditoría de pantallas por relevancia de dinero y stock empieza por Vender, Caja y Compras — las pantallas de Compras están entre las primeras en revisarse.

**PL-123** — Felipe confirma directamente en Vercel la variable PADRON_PROVEEDOR, la que hace posible validar el RUC de un proveedor (PL-34).

**PL-124** — Si se agota la cuota del proveedor del padrón de RUC, se acepta degradar a escribir el nombre a mano — es el diseño a propósito de ADR-0008, no un hueco.

**PL-125** — Felipe enciende Supabase Storage ahora, contra la recomendación de esperar, para fotos de producto y adjuntos de compra — asume el costo mensual desde ya.
  *Pendiente:* Aprovechar el storage ya encendido para subir la factura del proveedor como adjunto en el registro de una compra.


## Tus pendientes, en orden

1. Construye el RPC de reverso de pago a proveedor (PL-32): hoy no existe ese control y toca dinero directo.
2. Construye el rol/permiso 'Compras' (PL-27): sin él, no hay control real de quién crea proveedor, registra orden o paga.
3. Sigue el checklist de PL-87 cada vez que pegues SQL de tu módulo en producción (PL-94/95): es tu llave de Admin, no la uses sin ensayo previo.
4. Construye el botón 'Cerrar con faltante' para una orden de compra recibida a medias (PL-31).
5. Confirma con Felipe que la variable PADRON_PROVEEDOR ya está puesta en Vercel (PL-123) — sin eso, la validación de RUC de PL-34 no funciona.
6. Renombra 'Comprobante'/'Nota de crédito' de Compras a 'Factura de proveedor'/'Nota de crédito de proveedor' en apps/web/lib/menu.ts:163,187 y en ADR-0111/0142/BACKLOG (PL-50).
7. Prepárate: las pantallas de Compras están entre las primeras que se van a auditar, junto con Vender y Caja (PL-109).
8. Usa el Storage que Felipe ya encendió para subir la factura del proveedor como adjunto de la compra (PL-125).
9. Cuando alguien construya el candado de origen único en movimientos (PL-81), coordina que tu RPC de recepción de mercadería marque solo la columna 'compra'.
10. Ten presente que falta que Felipe defina cuál cuenta es Operativa y cuál Reserva (PL-35) — no te bloquea hoy, pero avisa si lo necesitas para registrar un pago.

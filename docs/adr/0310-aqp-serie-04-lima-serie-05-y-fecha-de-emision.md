# ADR-0310 — Arequipa pasa a la serie 04, Lima a la 05, y la fecha de emisión es la de la venta

**Fecha:** 2026-10-02 · **Estado:** decidido por Felipe con lo que le dijo Lucode; script **hecho y probado en local, SIN pegar en producción** (lo pega Felipe) · Relacionado: ADR-0278 (series de la SUNAT real), ADR-0165, ADR-0093, ADR-0016.

## Contexto

Lucode avisó: «el RUC 20605964550 ya utilizó anteriormente la serie B002 con otro proveedor; modifíquelo a otro y vuelva a enviarlos». Lo que había en producción el 2026-10-02 (leído con `select`, no de la memoria):

- **Tienda AQP** emitía con `B002`: 32 boletas (B002-1 … B002-32, S/ 2 900 aprox., del 30-sep al 2-oct), **todas en `enviado`**, ninguna `aceptado`. En el panel de Lucode figuran **RECHAZADAS**: SUNAT nunca las aceptó.
- Lucode confirmó que `B004` sí está bien (B004-1 a B004-3 son de Lucode, de antes de las series nuevas) y que **la serie 3 (Lima) también está ocupada**.
- Las series 2 y 3 (`F002`, `BC02`, `FC02`, `F003`, `BC03`, `FC03`…) las eligió Felipe sin verificarlas contra Lucode (ADR-0278): eran la misma apuesta que falló con `B002`.

Un hallazgo aparte, que afecta el reenvío: `payloadDe` mandaba `fecha_de_emision: new Date().toISOString().slice(0, 10)`, que es **UTC**. Desde las 19:00 de Lima ya es «mañana» y Lucode rechaza («puede ser hoy o hasta 5 días previos»): le pasó a B002-8…14 y 24…31 (todas vendidas entre las 19:02 y las 21:34). Al día siguiente el reintento sí entraba, pero con la fecha del reintento, no la de la venta.

## Decisión

**1. Una «serie por sede» con el mismo número en todo** (Felipe):

| Tipo | Arequipa | Lima |
|---|---|---|
| Boleta | `B004` | `B005` |
| Factura | `F004` | `F005` |
| Nota de crédito de boletas | `BC04` | `BC05` |
| Nota de crédito de facturas | `FC04` | `FC05` |
| Nota de venta (interna) | `NV04` | `NV05` |

Trujillo sigue en la serie 01. Las series viejas de AQP (02) y Lima (03) se **archivan**, no se borran. `B004` de AQP arranca en el **4** más las boletas que ya existan; el resto, desde el 1. Lima no ha emitido nada.

**2. Las boletas B002 se renumeran en su lugar**, en el orden en que se vendieron (B002-1 → B004-4, …), y quedan `pendiente` para transmitirse otra vez. Su número viejo y su respuesta de Lucode van a `retail.respaldo_b002_renumeradas_20261002`. Es una excepción a «un comprobante no se renumera», y se justifica porque **SUNAT nunca las vio** (Lucode las rechazó): el número no existe fuera del ERP y la venta sigue siendo una sola. La alternativa —una boleta nueva por venta— dejaba dos comprobantes por cada venta.

**3. La fecha de emisión es la de la venta, en hora de Lima** (`fechaDeLima`, `lib/lucode.ts`; `transmitir-comprobante.ts` pasa el `created_at`). Arregla las dos cosas: ya no se rechaza una boleta de las 21:00 y un reenvío conserva su día. **Consecuencia que hay que saber:** un comprobante de más de 5 días ya no se «rejuvenece» solo; Lucode lo rechaza con su motivo y se decide a mano. Antes salía con la fecha de hoy, es decir, con una fecha falsa ante SUNAT.

## Por qué un script y no la pantalla «Registrar serie»

`registrar_serie_comprobante` se niega a registrar una serie cuyo nombre ya se usó para ese tipo (aquí `B004`, `F004`, `F005`, `B005` ya existían archivadas en Trujillo y Arequipa) y no sabe renumerar. El script (`supabase/migrations/pegar-en-produccion-aqp-serie-04-lima-serie-05-2026-10-02.sql`) hace todo o nada en una transacción, con comprobaciones al inicio y al final, e idempotente. Toma el candado `for update` de la serie B002 antes de contar, así que **no hace falta frenar las ventas de AQP**: la que esté a medias termina con B002 (y se renumera), la siguiente ya sale con B004. Probado en la base local con un escenario de 3 boletas (aplica, se puede pegar dos veces, se frena si una B002 está aceptada).

## Salida a producción — el orden

1. **Desplegar este PR** (el arreglo de la fecha). Sin él, las boletas reenviadas salen con la fecha del reenvío.
2. **Pegar el script** en el SQL Editor de producción (una parte; no crea políticas). Verificación al pie.
3. **Transmitir** las boletas desde Comprobantes ▸ Emitidos (el barrido las toma de a 3, y «Transmitir» las manda una por una). El barrido solo toma las de menos de 3 días: las del 30-sep se mandan a mano después del 3-oct.
4. **Decirle a Lucode** que ignore o borre B002-1…32 en su panel (están rechazadas) y confirmar `F004`, `BC04`, `FC04`, `B005`, `F005`, `BC05` y `FC05` antes de la primera factura o devolución de AQP y del primer día de Lima.

## Lo que no se arregla

- Los **tickets ya entregados** a clientes dicen «B002-…»; ese número no va a existir ante SUNAT.
- **B001-4** (Trujillo) está `ACEPTADO` en Lucode y `enviado` en el ERP, y **F001-1** sigue `PENDIENTE` allá. Nada vuelve a preguntarle a Lucode por un comprobante `enviado` (`consultarEstadoLucode` existe y nadie la llama). Pendiente aparte (ver backlog).

## Se rompe si

- Se pega el script antes de desplegar el arreglo de la fecha (las boletas salen con la fecha del reenvío).
- Alguien registra otra serie B/F para AQP o Lima por la pantalla antes del script: el script se detiene en la comprobación final (una sola serie activa por tipo).
- Se vuelve a escribir la fecha de emisión con `toISOString()`: las boletas de después de las 19:00 vuelven a rechazarse (lo vigila `lib/lucode.test.ts`).

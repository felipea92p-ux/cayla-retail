# ADR-0010 — Estructura de comprobante impreso: PDF A4 + ticket térmico

**Fecha:** 2026-09-05
**Estado:** Construido y verificado en local (navegador); pendiente que Felipe
complete direcciones de AQP/LIM/TALLER y confirme el punto de riesgo en
producción de la sección "Consecuencias".

> **Nota de reconciliación (2026-09-05, noche).** Este ADR se escribió en la
> rama `claude/electronic-receipt-structure-29400a`, partiendo de un `main`
> que ya estaba 30+ commits atrás. Se numeró 0007, número que `main` ya había
> usado para otro ADR — de ahí que ahora sea el 0010.
>
> Lo que cambió al reconciliar: la parte que proponía una tabla
> `comprobante_items` y redefinía `emitir_comprobante` **se descartó**. `main`
> había resuelto ese mismo problema antes y distinto (`comprobantes.items`
> como jsonb, ADR-0009), y de ese jsonb depende el conector de Lucode que
> transmite a SUNAT. Dos modelos para lo mismo no pueden convivir: gana el que
> ya está en producción. El código de impresión de este ADR se adaptó a leer
> ese jsonb (`itemsParaImprimir` en `lib/comprobantes.ts`), y como el jsonb no
> modela descuentos por línea, la columna "Dscto." salió del A4 y del ticket.
> Lo que sí se conservó íntegro: la dirección fiscal por sede y
> `configuracion_empresa` (migración `0040`, producción `unificacion/23`).

## Contexto

`0032_comprobantes.sql` (parte 1 de F3, ver ADR-0005) reservaba el comprobante
con su correlativo oficial, pero no había manera de **verlo o imprimirlo**:
el modal de emisión tipeaba un total a mano (sin detalle de línea), y no
existía ningún dato fiscal propio de CAYLA (RUC, razón social, dirección de
sede) en la base — imprescindibles en el encabezado de cualquier boleta o
factura. Felipe pidió un diseño de boleta A4 (pasó un comprobante real de
Alegra como modelo) y un ticket para la impresora térmica de tienda (Epson
TM-T20III, ya en uso).

## Decisiones

**1. Detalle de línea es un snapshot, no una vista sobre `movimientos`.**
Nueva tabla `comprobante_items`, poblada una sola vez dentro de
`emitir_comprobante` (misma transacción, mismo candado `for update` de
serie). Alternativa descartada: reconstruir las líneas desde `movimientos`
vía `venta_id` cada vez que se reimprime. Se descartó porque el precio de una
variante cambia con el tiempo (`variantes.precio`) — un comprobante de hace
tres meses debe imprimirse siempre igual, no con el precio de hoy (principio
4: una vez emitido, el comprobante es la fuente de verdad de sí mismo, no una
proyección en vivo de otra tabla).

**2. El total se recalcula server-side desde los ítems, nunca se recibe del cliente.**
`emitir_comprobante` cambió de firma: en vez de `p_subtotal/p_igv/p_total`
tipeados por el cliente, recibe `p_items jsonb` y calcula el IGV (18%) por
línea dentro de la RPC. Mismo principio que el candado de la serie: la plata
no se confía a JavaScript del navegador.

**3. Datos fiscales de la empresa: tabla singleton, no variables de entorno.**
`configuracion_empresa` (`id boolean primary key default true check (id)`)
en vez de `RUC_EMPRESA`/`RAZON_SOCIAL` en `.env`. Se descartó env porque (a)
ya hay precedente de tablas singleton en el repo para datos que cambian raro
pero deben auditarse (mismo espíritu que series por sede), y (b) un env var
exige redeploy para corregir un dato legal; una fila de tabla se corrige con
una sentencia SQL sin tocar el código.

**4. Direcciones fiscales de sede: columnas nuevas en `sedes`, no tabla aparte.**
`direccion`, `ubigeo`, `departamento`, `provincia`, `distrito`, `telefono`
agregadas directamente a `sedes` (nullable, aditivo). Se prefirió sobre una
tabla `sede_datos_fiscales` separada porque es información 1:1 con la sede,
no una relación de cardinalidad distinta — pero ver el riesgo marcado abajo
antes de aplicar esto en producción.

**5. Dos tecnologías distintas para los dos formatos, no una que sirva a ambas.**
PDF A4 con `@react-pdf/renderer` (compone el PDF en el propio proceso Node,
sin Chromium ni servicio externo — nada que romper si algo externo cae,
principio 9). Ticket térmico como página HTML propia
(`/comprobantes/[id]/ticket`) con `@page { size: 80mm auto }` y un botón que
llama a `window.print()`. Se descartó usar `@react-pdf/renderer` también para
el ticket: esa librería exige una altura de página fija de antemano, y un
ticket de venta tiene una altura que depende de cuántos ítems tenga —
forzar una altura fija desperdicia papel de rollo o corta contenido. El patrón
HTML + impresión de navegador es además el que usan la mayoría de sistemas de
punto de venta reales contra impresoras térmicas conectadas como impresora
del sistema operativo (que es como está conectada la Epson TM-T20III).

## Riesgo señalado, no resuelto: `sedes` en producción puede ser una vista puente a Dynamic

`packages/database/src/types.ts` (generado desde producción) muestra
`retail.sedes` con **todas las columnas nullable y sin sección Insert/Update**
— el patrón que deja `supabase gen types` cuando el objeto es una vista, no
una tabla base. Si es así, `alter table sedes add column ...` (como hace
`0034_estructura_comprobante_electronico.sql`) **fallará al pegarse en
producción** porque no se le pueden agregar columnas a una vista así.

No se pudo confirmar con certeza sin acceso directo al Postgres de
producción — es una lectura indirecta del archivo de tipos generados, no una
inspección en vivo. **No se tocó producción para no adivinar sobre un cambio
de esquema real** (regla explícita de `CLAUDE.md`: detenerse ante cambios de
esquema en producción). Antes de pegar `0034` en producción, confirmar con
`\d retail.sedes` en el SQL Editor: si es una vista, la ruta correcta es una
tabla satélite `sede_datos_fiscales(sede_id, direccion, ubigeo, ...)` sin FK
formal a `sedes` (mismo patrón que ya usan otras tablas `retail.*` que
referencian entidades que en realidad viven en Dynamic).

## Efecto colateral: colisión de versión de migración corregida

Al correr `supabase db reset` para verificar esta migración se encontró que
`0033_crear_producto_variantes.sql` y `0033_espejo_retail_dev_local.sql`
compartían el mismo número de versión (el segundo se creó sin notar que el
primero ya existía) — un `db reset` fallaba antes incluso de llegar a esta
migración. Se corrigió renombrando el segundo a
`0035_espejo_retail_dev_local.sql` (contenido sin cambios) para desbloquear
la verificación. Bug preexistente, no introducido en esta sesión.

## Consecuencias

`ComprobantesPanel.tsx` ahora captura ítems (descripción, cantidad, valor
unitario, descuento%) en vez de un total suelto, con el total recalculado en
vivo en el formulario y verificado otra vez server-side al emitir. Cada
comprobante tiene dos enlaces ("PDF A4" / "Ticket") que abren
`/api/comprobantes/[id]/pdf` y `/comprobantes/[id]/ticket` respectivamente —
verificado de punta a punta en el navegador con un comprobante real
(B001-000001), incluyendo el cálculo de IGV, el monto en letras, y los datos
fiscales de CAYLA.

Pendiente de Felipe: completar dirección/ubigeo de las sedes AQP, LIM y
TALLER (hoy solo TRU tiene el dato real, tomado de un comprobante existente);
confirmar si `retail.sedes` en producción es vista o tabla antes de aplicar
`0034` allá; decidir si el llamado a `window.open` tras emitir (abre el
ticket automáticamente) es el flujo que quiere en caja, o si prefiere un paso
explícito.

# ADR-0048 — La base fija el precio de venta, y el descuento de una Colaboradora pide código

**Fecha:** 2026-09-14
**Estado:** Aplicado en la base local (`20260914215059_candado_precio_venta.sql`,
`20260914215103_codigos_descuento.sql`). **No aplicado en producción** — las pega Felipe
(D-11); ya llevan el prefijo `retail.`. Hasta entonces, el diccionario de `docs/datos/`
no se regenera (leería la base local y pisaría el de producción).
**Afecta:** `retail.registrar_venta` (recreada dos veces, firma final de 10 parámetros),
tabla nueva `retail.codigos_descuento`, `apps/web/lib/error-escritura.ts`,
`vender/page.tsx` (prop `esLider`), `PuntoDeVenta.tsx`, `PuntoDeVentaTicket.tsx`.

## Contexto

Desde ADR-0044 la caja no edita el precio y los descuentos viajan como
`descuento_unitario`. Pero `registrar_venta` (0011, líneas 114-117) insertaba
`precio_unitario` y `descuento_unitario` tal cual llegaban del navegador: un candado de
pantalla, no un candado. Cualquiera con sesión podía mandar S/1.00 por una blusa de
S/79.90 desde la consola, o un descuento del 90 % sin que nadie lo autorizara. Era el
ítem del BACKLOG «el precio lo pone el navegador y el descuento es un dato fantasma»
(la mitad del fantasma ya se resolvió midiéndolo por prenda; faltaba quién decide).

## Decisión

1. **El precio lo fija el catálogo.** Antes de escribir una sola fila, `registrar_venta`
   compara cada `precio_unitario` con `variantes.precio` vigente a 2 decimales. Si difiere,
   levanta `venta_precio_cambiado` con «referencia (sku)» en `detail`. Única excepción,
   por diseño: la variante centinela de «Cargo especial», cuyo precio lo escribe la caja.
2. **Quién descuenta y hasta cuánto — decisión de Felipe (2026-09-14):** un **Líder**
   descuenta sin código; una **Colaboradora** (rol de 0016) necesita un código válido para
   cualquier `descuento_unitario > 0`, y el **% del código es el tope por línea** (con un
   centavo de tolerancia por el redondeo en coma flotante del navegador). Tabla
   `codigos_descuento`: `codigo` (pk, mayúsculas, 3-20), `porcentaje` (0 < % ≤ 100),
   `vigente_desde/hasta`, `activo`, `ubicacion_id` (null = todas), `creado_por`. RLS:
   leen todos los autenticados; crean/editan solo `fn_es_lider()`; **nadie borra** — un
   código que ya se usó es historia, se apaga con `activo`.
3. **Los errores tienen nombre estable y frase humana en un solo lugar.** La RPC levanta
   el nombre (`venta_precio_cambiado`, `venta_descuento_requiere_codigo`,
   `venta_codigo_descuento_invalido`, `venta_descuento_supera_codigo`) y pone el dato en
   `detail`; `error-escritura.ts` arma la frase («El precio de Blusa Emma (BLU-EMMA-BEI-S)
   cambió: quítala del ticket y vuelve a agregarla»). Salen por `avisar.error` (ADR-0047).
4. **La pantalla solo decide qué muestra.** `page.tsx` pasa `esLider`; el campo «Código de
   descuento» aparece en el apartado de descuento solo para quien no es Líder. La regla la
   aplica la base: aunque alguien muestre el campo a la fuerza o lo esconda, el resultado es
   el mismo.

Se descartó: validar el código en el navegador antes de cobrar (sería una segunda copia de
la regla; la lectura de `codigos_descuento` queda abierta a `authenticated` para el día
que se quiera avisar antes); guardar en `ventas` qué código se usó (útil para medir cuánto
se regala por código — es una columna aparte, no parte de esta regla); una pantalla de
administración de códigos (hoy se crean en Studio; paso propio en el BACKLOG).

## Consecuencias

- Cambiar el precio de una variante mientras está en un ticket abierto hace fallar esa
  venta con el mensaje humano; la colaboradora quita la prenda y la vuelve a agregar. Es lo
  buscado.
- `packages/database/src/types.ts` recibió a mano solo el 10.º parámetro: regenerar el
  archivo entero hoy rompe `ProveedoresPanel.tsx` (pasa `null` donde la RPC tipada pide
  `undefined`) porque las migraciones de Compras se aplicaron sin regenerar tipos. Es de
  quien tenga Compras/Proveedores.
- Producción sigue con la RPC vieja hasta que Felipe pegue las dos migraciones; el
  navegador ya manda `p_codigo_descuento`, que la RPC vieja no acepta → **pegar antes de
  desplegar este front**, o el cobro en producción fallaría con «function … does not
  exist». Está en el BACKLOG como bloqueante del deploy.

## Verificación

- `error-escritura.test.ts`: 4 pruebas nuevas en rojo → verde (15/15); suite 166/166.
- psql, cada caso en su transacción con `rollback` (nada quedó escrito): Líder con precio
  correcto pasa · precio alterado → `venta_precio_cambiado` con «Blusa Emma
  (BLU-EMMA-BEI-S)» · Líder descuenta sin código · Colaboradora (Micaela, Trujillo) sin
  código → `requiere_codigo` · código inexistente → `invalido` · con `CAYLA10` al 10 % pasa
  y al 20 % → `supera_codigo` con tope «10» · una colaboradora no puede insertar códigos
  (RLS). El caso del tope destapó un `format('%')` inválido en el `hint`, corregido antes
  del commit.
- HTTP contra PostgREST local con JWT de Líder: la respuesta es
  `{code: "P0001", details: "Blusa Emma (BLU-EMMA-BEI-S)", message: "venta_precio_cambiado"}`
  — la forma exacta que el traductor espera.
- Pendiente de ver en navegador con sesión de Colaboradora (no hay una a mano): el campo
  «Código» y el aviso. El BACKLOG ya tenía «verificar Vender como colaboradora de sede fija»
  sin dueño; este es un motivo más.

# ADR-0015 — La devolución de una clienta es una operación, no tres correcciones a mano

**Fecha:** 2026-09-05
**Estado:** Propuesto — sale de la auditoría del 2026-09-05. Depende de ADR-0013
(`costo_unitario` sellado) y ADR-0014 (`caja_id` en el reembolso).

## Contexto

Una clienta devuelve una blusa de S/120 pagada en efectivo y se le reembolsa.
Hoy **no existe ninguna operación para eso** en el sistema: listé las 32 tablas
base de `retail` y no hay `devoluciones`; barrí las 34 funciones y no hay
`registrar_devolucion`. `retail.emitir_nota(p_comprobante_original_id, p_tipo,
p_motivo, p_subtotal, p_igv, p_total)` existe pero su único `insert` es `into
comprobantes` — no toca `movimientos`, ni `stock`, ni `ventas` (verificado con
`pg_get_functiondef(...) ilike '%insert into movimientos%'` y equivalentes:
false en las tres). Y `MOTIVOS_DEVOLUCION` (`packages/shared/src/enums.ts:101`)
es otra cosa: lo consume `devolver_a_almacen(p_sede_id, p_variante_id,
p_cantidad, p_nota)`, un traslado tienda→almacén sin `venta_id` ni reembolso.

Lo único que la encargada puede hacer hoy es registrar una "Entrada" genérica
con `MovimientoModal`. El sistema queda entonces mintiendo en cuatro lugares a
la vez, y ninguno se cruza con otro:

1. **Stock.** Si no registra nada, la blusa vuelve al perchero y el sistema
   sigue creyendo que no está: el conteo del cierre no cuadra y nace un ajuste
   manual.
2. **Inteligencia.** `inteligencia.ts:63-70` sigue contando esa unidad como
   vendida para siempre: velocidad, sell-through y punto de reorden suben, y
   Comercial **recomienda comprar más** de la prenda que las clientas devuelven.
3. **EERR y flujo.** `ventas.monto_total` no baja: `finanzas-nucleo.ts:51` y
   `contabilidad.ts:218` cobran S/120 que se devolvieron.
4. **Caja.** El reembolso en efectivo no se resta del cuadre
   (`finanzas-nucleo.ts:118`): la caja arrastra un faltante fantasma de S/120
   todos los días.

Detalle que vuelve esto urgente y no teórico: `emitir_nota` exige —por CHECK
`comprobantes_nota_requiere_original` más el trigger
`comprobantes_valida_nota_referencia` (ADR-0007)— que el comprobante original
esté **aceptado** por SUNAT. Con la facturación arrancando esta semana, la
primera nota de crédito produce exactamente los cuatro descuadres de arriba, sin
que nadie los relacione con ella.

Un detalle del esquema que hace viable el arreglo: `movimientos` no tiene ningún
CHECK sobre `cantidad` ni sobre `monto` (revisado `pg_constraint` completo), así
que nada impide hoy una entrada con `monto` negativo — no hace falta migrar
constraints para netear.

## Decisión

**DECIDÍ: la devolución es un hecho propio, ligado a la venta que corrige, y se
registra en una sola transacción.**

RPC `registrar_devolucion(p_venta_id uuid, p_items jsonb, p_motivo text,
p_metodo_reembolso text)` que, en una sola frontera:

1. Inserta en `movimientos` un `tipo='entrada'`, `motivo='devolucion_clienta'`,
   con `venta_id` de la venta original, **`monto` negativo** y `costo_unitario`
   copiado del movimiento que se devuelve (ADR-0013). Así toda la inteligencia y
   todo el COGS netean solos, sin tocar una sola fórmula.
2. Inserta una fila en `ventas` con `monto_total` negativo. Para que eso no sea
   un estado ambiguo, `ventas` gana `tipo text not null default 'venta' check
   (tipo in ('venta','devolucion'))`, `venta_original_id uuid references
   ventas(id)` y un CHECK que hace imposible el estado inválido: `(tipo='venta'
   and monto_total > 0) or (tipo='devolucion' and monto_total < 0)`. El
   `caja_id` es el de la caja abierta de la sede (ADR-0014), así que el
   reembolso sale del turno en que realmente salió del cajón.
3. **La nota de crédito es un paso posterior y opcional**, no un requisito. La
   devolución de mercadería y dinero es un hecho del negocio; el documento
   fiscal lo acompaña cuando esa venta tenía comprobante aceptado, usando el
   catálogo de motivos que `lucode.ts:97-98` ya tiene escrito.

**DESCARTÉ: una tabla `devoluciones` aparte, sin tocar `ventas` ni
`movimientos`.** Es lo más limpio de mirar y lo más caro de mantener: obliga a
modificar las cinco fórmulas que hoy leen `ventas` (`finanzas-nucleo.ts:51`
EERR, `:118` cuadre, `:173` comparativo anual, `contabilidad.ts:106` y `:218`
flujo) y, sobre todo, obliga a que **cada pantalla futura se acuerde de
restarla**. La que se olvide muestra una cifra inflada y nadie lo nota, porque
una venta de más se ve exactamente igual que un buen mes.

**DESCARTÉ también: seguir registrando la devolución como una "Entrada" genérica
con `MovimientoModal`**, que es lo único que existe hoy. Sube el stock y deja el
dinero, la venta y el comprobante intactos: convierte un hecho del negocio en
tres correcciones manuales que nadie va a hacer completas, y que además ninguna
consulta puede distinguir después de una recepción de mercadería.

**SE ROMPE SI: se permite devolver más unidades de las que tuvo esa venta, o
devolver dos veces la misma línea.** El escenario concreto: una clienta compra
dos blusas en AQP, devuelve una el jueves y vuelve el sábado —otro turno, otra
encargada— y la devuelve otra vez. El stock sube con una blusa que nunca entró,
salen S/120 del cajón por segunda vez, y el rastro parece legítimo, porque cada
devolución individual apunta a una venta real y a una línea real. El candado
tiene que estar en la RPC con `select ... for update` sobre las líneas de la
venta original y un tope acumulado por línea (`sum(cantidad devuelta) <=
cantidad vendida`), nunca en la pantalla: la pantalla del sábado no sabe lo que
pasó el jueves hasta que la base se lo diga.

## Consecuencias

Los cuatro descuadres se cierran de una vez y sin fórmulas nuevas: netean solos
porque el hecho está en el mismo libro que la venta. `count(*) from ventas` deja
de ser "cantidad de tickets" y pasa a necesitar `where tipo='venta'` — es el
precio explícito de netear, y queda escrito acá para que quien lea `ventas` en
seis meses no se confunda.

No cubierto: el flujo de pantalla (dónde vive el botón "Devolver"). La
recomendación es una fila de "Ventas de hoy" (`vender/page.tsx:80-92`), porque
es el único lugar donde la encargada tiene la venta original a la vista y no hay
que teclear nada; pero eso es diseño de UX y se decide al construirlo, no acá.

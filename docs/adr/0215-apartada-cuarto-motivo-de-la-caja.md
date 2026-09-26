# ADR-0215 — «Apartada para una clienta» es el cuarto motivo de la caja, y va después del almacén

**Fecha:** 2026-09-25
**Estado:** Aprobado por Felipe el 2026-09-25 («la precedencia queda como está»).
**Afecta:** `apps/web/lib/vender-stock-local.ts` (`motivoNoCobrable`, `avisoSinPiso`, `textoStockDeFila`,
`quedoEnAlmacen`, `tooltipTallaSinPiso`, `apartadoEnPiso`, `apartadoReleido`, `conApartadoAjustado`),
`apps/web/lib/useStockEnVivo.ts` (`StockReleido.apartado`), `apps/web/lib/vender-reglas.ts` (`sinStockPorApartado`,
`textoSinStock`), `apps/web/lib/escaner-reglas.ts` (estado `apartada`), `apps/web/lib/proforma-al-carrito.ts`,
`apps/web/lib/cambio-reemplazo-reglas.ts` (`derivarReemplazo`) y las pantallas de Vender y Cambios. **Sin migración ni
cambio de esquema:** no cambia qué se cobra (`registrar_venta` sigue descontando solo el piso).
**Complementa:** D-40 (`docs/datos/DECISIONES-2026-09-12.md`, «Vender algo que está en el almacén»), ADR-0141 (apartar
stock), ADR-0192 (relectura de stock tras vender).

## El problema

Cuando lo único que queda de una prenda en el piso está **apartado para otra clienta**, la caja decía «agotada». La
colaboradora le decía «no hay» a una clienta con la prenda a tres metros, separada con su cartón. D-40 ya había
enseñado a la caja a decir «está en el almacén» cuando el piso está en 0 y hay en la trastienda; faltaba la tercera
respuesta honesta.

## Decisión

- **Cuatro motivos y una sola regla**, `motivoNoCobrable`, con este **orden**: `cobrable` (hay en el piso) >
  `en_almacen` (el piso está en 0 y hay libre en el almacén de la tienda) > `apartada` > `agotada`.
- **«Apartada» solo sale cuando de verdad no hay nada libre en la tienda**: piso en 0, almacén libre en 0 (o sin
  almacén, en el Taller) y algo apartado **en el piso** (`apartadoEnPiso`). Lo dice el aviso, la fila del buscador, la
  casilla y el tooltip de talla, el modal de talla, la cámara («No entró · apartada»), la proforma y Cambios.
- **Lo apartado se relee con el mismo sondeo de stock en vivo**, de las mismas filas (una sola consulta): sin eso, tras
  el primer sondeo una prenda apartada por otra caja volvía a decir «agotada».
- **Cambios no ofrece lo del almacén**, así que no pasa `almacenAqui` y usa el mismo predicado sin almacén
  (`sinStockPorApartado` delega en `motivoNoCobrable`).

### La precedencia (lo que decidió Felipe)

Con stock libre en el almacén gana **«está en el almacén»**, no «apartada»: ahí hay un camino de venta (bajarla) y
«apartada» a secas se leería «no hay ninguna» estando la del almacén libre.

## Lo que se descartó, y su costo

1. **Que «apartada» gane al almacén libre.** Costo: la colaboradora deja de ver el camino «que la bajen» justo cuando
   existe, y le dice «es de otra clienta» a quien podría vendérsela con una del almacén.
2. **Contar también lo apartado en el almacén** (el apartado total). Costo: contradice `almacenAqui` de D-40, que ya
   excluye lo apartado, y la palabra dejaría de describir el piso, que es de donde vende la caja.
3. **Dejar dos mecanismos** (el texto propio de esta rama y el `motivoNoCobrable` de D-40). Costo: una misma prenda
   diría dos cosas según la pantalla; el conflicto fue en 9 archivos.
4. **Nombrar «Apartados ▸ Entregar» en el aviso.** Costo: Apartados es un módulo aparte (ADR-0196) que hoy ningún rol
   de mostrador tiene; se mandaría a la colaboradora a una pantalla que no ve.
5. **Vigilar el cableado solo con expresiones regulares sobre el código.** Costo demostrado por tres revisores
   independientes: un cable podía romperse con la suite en verde, porque una regex se satisface con código muerto.
   Las reglas de decisión viven en funciones puras que una prueba sí rompe (`quedoEnAlmacen`, `textoStockDeFila`,
   `tooltipTallaSinPiso`); la regex solo vigila que el cable exista.

## Consecuencia de negocio

Una prenda cuyo piso está todo apartado y sin nada libre en la tienda ya no se anuncia como «agotada»: dice «apartada
para una clienta» y no se vende desde la caja (la clienta que la apartó sí se la lleva). Si además hay una libre en el
almacén, sigue diciendo «está en el almacén» y el aviso dice dónde se registra la bajada.

## Se rompe si

- **Cambios empieza a ofrecer lo del almacén** y no se le pasa `almacenAqui`: Vender y Cambios volverían a decir cosas
  distintas de la misma prenda. Hoy ya difieren por diseño en un caso (piso apartado + almacén libre: Vender dice «está
  en el almacén», Cambios «apartada para una clienta»).
- **Se cuenta lo apartado del almacén** sin cambiar `almacenAqui` en el modelo de D-40.
- **Alguien reemplaza las funciones puras por ternarios dentro de los componentes**: la prueba de cableado no ve código
  muerto.
- **Se agrega un quinto motivo** sin decidir su lugar en el orden.

## Límites conocidos

- El contador «N prendas agotadas ocultas» y la tarjeta «Sin stock» de un grupo con todo apartado siguen diciendo
  «agotada» (son a nivel de grupo; `catalogo-grupos.ts` no trae `apartadoAqui`).
- Una prenda con piso 0 y su única unidad del almacén apartada dice «agotada»: es un límite que ya trae el modelo de
  D-40 (su `almacenAqui` también excluye lo apartado).
- El texto «apartada para una clienta» está en varios literales; una constante única evitaría que se desalineen.

## Verificación

Tres revisores independientes con 43 mutaciones propias; las mutaciones que demostraron que sobrevivían y las de lo
nuevo ponen su prueba en rojo. Falta la captura a 375 px que exige PL-105 (fila del buscador, modal de talla, grilla y
chip de Cambios) antes de fusionar. Detalle en el PR #433.

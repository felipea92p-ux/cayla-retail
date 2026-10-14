# ADR-0368 — El gasto rápido de Caja: un mosaico por frecuencia

**Fecha:** 2026-10-09 · **Decide:** Felipe · **Estado:** aceptada (web + dos migraciones de catálogo: `20261009235900` y `20261010000000`, ambas en producción)

## Problema

En una tienda los gastos son chicos y se repiten: el agua, unas bolsas, el mototaxi, los S/ 0.80 del baño. Desde Caja, «Registrar gasto»
abría el formulario de Finanzas ▸ Gastos, que pedía comprobante (con factura marcada de entrada), proveedor, serie, categoría contable,
tienda, cuenta de salida y condición de pago. Para los S/ 0.80 del baño eran unos diez pasos, y por eso no se registraban.

## Decisión

Caja abre una hoja propia, `GastoRapidoModal` (maqueta A de `docs/maquetas/gasto-rapido-caja-2026-10/`, elegida por Felipe con dos cambios:
sin la fila de atajos y el mosaico ordenado por frecuencia):

1. **Once conceptos en palabras de tienda** (Agua, Luz, Internet y celular, Baño, Movilidad, Envío, Bolsas, Limpieza, Útiles, Arreglo,
   Refrigerio) y «Otro». Cada concepto ya trae su categoría contable de `categorias_gasto` (`lib/gasto-rapido-reglas.ts`, `CONCEPTOS`):
   nadie la elige. Baño va a Servicios básicos (confirmado por Felipe, 2026-10-09).
   **Refrigerio** es solo del EQUIPO en el turno (café, almuerzo, agua de mesa; Felipe 2026-10-09) y va a una categoría nueva,
   **«Atención al personal»**, cuenta **625 · Atención al personal** (migraciones `20261009235900` y `20261010000000`). Ninguna existente
   calzaba: en Suministros se mezclaba con bolsas y lejía. Lo que se le invita a un cliente sería otra cuenta y queda fuera.
   **Primero fue a la 62 y estuvo mal:** la 62 es la planilla (el estado de resultados suma la 62 como «planilla» y el presupuesto la deja
   fuera porque la decide Dynamic), así que un café habría salido como sueldo. Lo atrapó «Pruebas de RPC contra Postgres» (presupuesto
   G8 y G14) el mismo día, con la 62 ya aplicada en producción pero sin ningún gasto ni tope que la usara. La 625 del PCGE es justamente
   «Atención al personal»: sale como su propia línea de gastos de operación y admite tope en el presupuesto.
2. **Orden por frecuencia en ESA sede**, contando los gastos vigentes de los últimos 90 días; a igual frecuencia, el orden de fábrica.
   Los 4 primeros que se usaron al menos una vez llevan una ★ arriba a la derecha y cuántas veces se usaron. «Otro» va siempre al final.
   Una sede sin gastos ve el orden de fábrica y ninguna ★: una estrella con «0 veces» sería mentira.
3. **Sale del cajón abierto, al contado y con fecha de hoy.** No se pregunta: es lo que pasa en la tienda.
4. **«Otro» pide qué fue Y a qué se parece** (las categorías contables con sus ejemplos). La base sigue sin «Otros» (ADR-0195): una categoría
   comodín volvería a llenar el estado de resultados de cosas sin cuenta.
5. **La factura o boleta va en un desplegable** (tipo, proveedor de la lista, serie y número). Un proveedor nuevo o un pago a crédito siguen
   en el formulario completo, al que la hoja lleva con un enlace.
6. **Bajo el monto, «Lo de siempre»**: los montos más repetidos de ESE concepto en la sede (hasta 3). Siguen a lo elegido (ADR-0290).

La regla es la de Finanzas: la hoja arma un `BorradorGasto` y lo valida `validarGasto` antes de llamar a `registrar_gasto`; la prueba
`lib/gasto-rapido-reglas.test.ts` exige que la guía de foco y `validarGasto` digan lo mismo en 15 escenarios.

## Cómo se reconoce el concepto sin columna nueva

El gasto rápido guarda la descripción empezando por el nombre del concepto («Baño — del mercado»). Para contar, `conceptoDeGasto` mira el
comienzo de la descripción y, si no calza, la palabra que aparece antes («mototaxi al banco» es Movilidad, «Recibo Hidrandina» es Luz),
siempre dentro de la MISMA categoría contable («Agua de mesa» en Suministros no es el recibo del agua). Así cuentan también los gastos
anteriores a esta pantalla.

**Descarté** agregar `gastos.concepto`: era cambiar el esquema de una tabla en uso en producción y la firma de `registrar_gasto` (una RPC
de dinero) para ganar exactitud en un orden de botones. Si un día el orden se equivoca de forma que importe, esa columna es el siguiente
paso.

## Lo que se vigila

- `lib/gasto-rapido-reglas.test.ts`: cada concepto va a una categoría que existe; lo que guarda la pantalla se vuelve a reconocer; el orden,
  la ★ y los montos habituales; la coma del monto es decimal («0,80» no son S/ 80); y la guía igual a `validarGasto`.
- `lib/guia-de-foco-pantallas.ts`: el modal está `aplicada`.
- El movimiento es una excepción de ADR-0136 (actualización 2026-10-09).

## Actualización 2026-10-12 — también con el Yape o el Plin de la tienda

**Lo que pasó.** Las tiendas cuentan que el mototaxi, las bolsas o el baño muchas veces no salen del cajón: se pagan con el Yape (o el Plin)
de la tienda, el mismo donde pagan las clientas. La hoja solo registraba efectivo (punto 3 de arriba), así que ese gasto quedaba sin anotar o,
peor, se anotaba como efectivo: el cierre esperaba menos plata de la que había y salía un sobrante que no existía.

**Decisión.** Bajo el monto, **«¿Cómo lo pagaste?»: Efectivo · Yape · Plin**, con Efectivo de fábrica (es lo que pasa casi siempre).
- **Se dibuja con las fichas de medio de la hoja de cobro de Vender, acostadas** (`hoja-cobro-medio es-acostada`, 50 px): el mismo ícono de
  Yape y Plin, la franja del color del medio arriba (el de la dona de Caja) y la ficha que se rellena con su color al elegir. Felipe lo eligió
  mirando una lámina el 2026-10-12: primero pidió algo «más visual» que el segmento de texto, y de cuatro versiones compactas de las fichas de
  Cobrar se quedó con la acostada con franja arriba («similar al de cobrar, sin ocupar tanto espacio»). Descartadas: la ficha de Cobrar tal
  cual (96 px, demasiado alta bajo el monto), tarjetas con la consecuencia escrita (una pieza nueva), las baldosas del mosaico (el medio
  parecía otro concepto y perdía su color) y píldoras (poco visuales). Si la ficha se angosta (375 px), el ícono vuelve arriba del nombre
  por una regla de contenedor de la ficha.
- **Efectivo:** igual que antes: sale del cajón abierto, su egreso descuenta el cierre.
- **Yape o Plin:** se guarda con ese medio, **sin caja y sin cuenta elegida**. La base ya sabía qué hacer (ADR-0195 F3b, `fn_cuenta_sellada`):
  sella la cuenta donde cae el Yape o el Plin de esa tienda según Configuración ▸ Cuentas y cobros. Si la tienda no lo configuró, el gasto
  queda «sin cuenta» y el líder la dice en Cuentas y dinero; nunca se pierde. **El cajón no cambia** y el cierre no lo cuenta (el cierre ya
  cuenta solo efectivo). Sin migración: `registrar_gasto` aceptaba Yape y Plin desde el 2026-09-24 (Finanzas ▸ Gastos los usaba).
- **La guía de foco lo pasa como «sugerido»** (ADR-0284 act. h: un valor de fábrica que importa): la luz va al medio después del monto y el
  pie dice «Sin elegir: Cómo lo pagaste» sin bloquear. Equivocarse aquí descuadra la caja, así que conviene que se mire.
- **Lo que la hoja dice sigue al medio** (ADR-0290, `textosDelMedio`): la bajada («Se paga con el Yape de Tienda Trujillo: el cajón no
  cambia»), el punto (color de Yape de la dona de Caja), el pie y el «listo». Nunca promete «la caja lo descuenta» con Yape o Plin.
- **«Gastos del turno» los muestra** junto a los del cajón, con «con Yape» o «con Plin» en la fila y su total aparte («Del cajón S/ 12.00 ·
  con Yape o Plin S/ 5.80»). Sin eso, quien registra un gasto por Yape no lo ve en Caja y cree que no se guardó. La hora sale de cuándo se
  registró (`fn_gastos_lista.creado_en`); un gasto con factura dice su medio por su pago, como ya lo hacía esa lectura.

**Descarté** transferencia y tarjeta en esta hoja: no son lo que pasa en el mostrador y siguen en el formulario completo. **Descarté** mostrar
el banco de destino («cae en BCP ···1234»): a la colaboradora no le dice nada y obligaba a leer las cuentas al abrir la hoja.

**De paso:** «Cancelar» con algo escrito preguntaba «¿Salir sin guardar?» DOS veces (al confirmar, la hoja se cerraba con su animación y su
`onClose` volvía a preguntar). Ahora el «Salir sin guardar» suelta el aviso antes de cerrar. La hoja hermana, «Registrar ingreso», tiene el
mismo patrón y queda anotada en el backlog.

**Se vigila:** `lib/gasto-rapido-reglas.test.ts` (Yape y Plin van sin caja ni cuenta, la guía sigue igual a `validarGasto` en 20 escenarios,
el medio es sugerido y nunca bloquea, los textos siguen al medio A → B → A) y `scripts/pruebas/gastos.mjs` caso 9 (contra Postgres: con la
caja abierta, un gasto por Yape o Plin no cambia lo esperado del cajón ni crea un movimiento, y cae en la cuenta de ese medio en la tienda).

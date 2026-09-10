# ADR-0014 — Una sola definición del dinero: el turno de caja es la frontera y la utilidad tiene un solo cálculo

**Fecha:** 2026-09-05
**Estado:** Propuesto — sale de la auditoría del 2026-09-05. Contiene una
pregunta de negocio abierta (ver "Lo que decide Felipe").

## Contexto

Hoy el mismo número tiene dos verdades según por dónde se mire, en las dos
pantallas que Felipe revisa seguido.

**El cuadre de caja.** El cuerpo real de `retail.cerrar_caja` en producción
calcula `v_esperado := v_caja.monto_apertura + coalesce(sum(monto_total),0) from
ventas where caja_id = p_caja_id and metodo_pago = 'efectivo'`. Eso es todo: no
resta los gastos pagados del cajón ni los depósitos al banco. Mientras tanto
`finanzas-nucleo.ts:143` calcula `teorico = ajustes + ventasEfectivo −
gastosEfectivo − depósitos`. Dos definiciones de "cuánto debería haber"
conviviendo, y la que ve la encargada al cerrar es la que no resta nada.

El problema de fondo es de modelo, no de fórmula: **ninguna de esas tablas sabe
a qué turno pertenece.** `information_schema` sobre `retail.gastos`,
`depositos_bancarios` y `ajustes_efectivo` no devuelve `caja_id` en ninguna —
solo `sede_id` más `created_at`/`fecha`. `retail.ventas` es la única tabla con
`caja_id`.

El resultado diario: la encargada de TRU abre con S/100, vende S/800 en
efectivo, paga S/120 de movilidad y S/60 de agua del cajón, deposita S/500 en el
BCP a media tarde, cuenta S/220 —que es exactamente lo correcto— y el sistema le
dice "esperado S/900, diferencia −S/680". Todos los días, en las tres tiendas.
Por la regla del propio Felipe ("cuando un proceso se vuelve un dolor de cabeza
se deja de usar u omite"), un cuadre que siempre acusa faltante se deja de mirar
en dos semanas, y a partir de ahí el sistema ya no detecta un faltante real.
Agravante: `retail.registrar_gasto` empieza con `if not retail.es_lider() then
raise exception 'Solo un Líder puede registrar gastos'`, así que la encargada
**ni siquiera puede registrar** el taxi que pagó.

**La utilidad del mes.** `/finanzas` usa `getEERRMensual`
(`finanzas-nucleo.ts:43-91`): ventas = Σ `ventas.monto_total` **con IGV**,
gastos = Σ `gastos.total` **con IGV**, y lo rotula "Utilidad neta"
(`finanzas/page.tsx:107-113`, con un tooltip que promete "la última línea, la
que importa"). `/finanzas/balances` usa `getEstadosContables`
(`contabilidad.ts:124-162`): ventas netas = total/1.18, gastos por `subtotal`,
fletes al margen bruto, y lo rotula "Utilidad operativa"
(`balances/page.tsx:135`). Las dos leen el mismo mes calendario de Lima. La
contradicción no es "dos números": es un **número imposible** — la utilidad neta
va después de más restas, así que debería ser menor o igual que la operativa, y
acá sale mayor siempre. Cualquiera que compare las dos pantallas concluye que
una está rota, sin saber cuál.

## Decisión

**DECIDÍ: el turno de caja es la frontera del efectivo, y `getEstadosContables`
es la única definición de utilidad.**

1. `alter table retail.gastos add column caja_id uuid references
   retail.cajas(id)`, ídem en `depositos_bancarios` y `ajustes_efectivo`.
   **Nullable**, y lo sella la RPC resolviendo la caja abierta de la sede — el
   índice único parcial `cajas_sede_abierta_unique on retail.cajas (sede_id)
   where estado='abierta'` ya existe en producción, así que "la caja abierta de
   esta sede" está bien definida y no puede haber dos.
2. `cerrar_caja` pasa a: apertura + ventas en efectivo − gastos en efectivo **de
   esa caja** − depósitos **de esa caja** + ajustes **de esa caja**, con
   `select ... for update` sobre la caja para serializar dos cierres
   simultáneos. La pantalla de cierre muestra el desglose de los cuatro términos
   **antes** de pedir el conteo ciego, para que la encargada vea por qué se
   espera esa cifra en vez de tener que confiar.
3. Se borra el cálculo de `getEERRMensual` y `/finanzas` consume el bloque
   `eerr` de `getEstadosContables` — es el criterio del manual contable del
   propio repo (`docs/MANUAL-CONTABLE-CAYLA.md`). `finanzas-nucleo.ts` se queda
   con `mesLimaUTC`/`mesActualLima`/`getCuadreEfectivo`/`getComparativoAnual`/
   `getPatrimonio`. Si la portada debe seguir mostrando el bruto, muestra
   **"Ventas (con IGV)"** e **"IGV a pagar"** como línea propia — lo que no
   puede quedar es que "utilidad" signifique dos cosas según la pantalla.

**DESCARTÉ: sumar gastos y depósitos por fecha y sede, sin `caja_id`.** Es la
opción sin migración, y funciona el 95% de los días. Se rompe exactamente cuando
más duele: la caja de AQP que se abre el sábado y se cierra pasada la
medianoche parte el turno en dos fechas, y una sede que abre dos turnos en un
día suma los gastos del turno de la mañana al cierre de la tarde. El error
aparece el día de más facturación y es indistinguible de un faltante real.

**DESCARTÉ también: dejar las dos utilidades y aclarar en cada pantalla cuál
es cuál.** Es lo barato, y es exactamente lo que el repo ya intentó con los
tooltips. Dos implementaciones del mismo concepto no se reconcilian con una
etiqueta: se desincronizan otra vez a la tercera corrección, y ya van tres
(`lib/finanzas.ts` tiene 200 líneas muertas con un **tercer** Estado de
Resultados, con un criterio distinto de los otros dos).

**SE ROMPE SI: `caja_id` se declara NOT NULL.** Es la tentación obvia —"todo
gasto pertenece a un turno"— y rompe el negocio real: el alquiler del local de
AQP pagado por transferencia un domingo, con las tres cajas cerradas, deja de
poder registrarse, y la pantalla de Egresos vuelve a estar bloqueada por otra
razón (después de que ADR-0011 desbloquee la primera). La regla es: `caja_id`
nulo significa "no salió del cajón de ningún turno", el cuadre lo ignora y el
EERR lo cuenta igual.

## Lo que decide Felipe (consecuencia de negocio, no técnica)

El punto (2) solo sirve si la encargada **puede** registrar el gasto de caja
chica que se le resta. Hay dos caminos y la decisión es de negocio:

- **A — Abrir `registrar_gasto` a integrante para gastos en efectivo de su
  propia sede**, con candado por `puede_operar_sede` (no por rol) y categorías
  limitadas a caja chica; el resto sigue siendo de Líder. *Ganas:* el cuadre
  cierra solo el mismo día. *Pagas:* una integrante puede cargar un gasto al
  EERR sin que un Líder lo apruebe.
- **B — Dejarlo solo para Líder** y que la encargada anote el vale en `nota` al
  cerrar. *Ganas:* control total del gasto. *Pagas:* el cuadre sigue acusando
  faltante hasta que el Líder cargue el gasto, y el desfase es de horas o días.

**Recomiendo A**, con las categorías acotadas y el gasto visible en la pantalla
de Egresos de esa sede desde el minuto uno: el control real no es el permiso, es
que se vea. Si no hay respuesta, ejecuto A.

## Consecuencias

El cierre diario pasa a poder cuadrar sin ajustes manuales, que es el estándar
que Felipe fijó, y "utilidad" pasa a tener una definición sola.

Nota de aritmética, para no exagerar el hallazgo: la portada no infla la
utilidad en el IGV cobrado completo, sino en el **IGV a pagar neto** (cobrado
menos el de los gastos), porque los gastos también entran con IGV y se restan.
La dirección del error es la que se describe; la magnitud es menor.

Queda fuera de este ADR y es su continuación natural: el Flujo de Efectivo de
`/finanzas/balances` omite la mayor salida de caja del negocio —comprar
mercadería y pagar maquila no escriben en `gastos` ni llaman a
`registrar_asiento`, verificado en los cuerpos de `recibir_lote`,
`registrar_produccion` y `cerrar_produccion`— y el semáforo "¿Cuadrado?" es una
tautología (`contabilidad.ts:210` **define** `totalPatrimonio = totalActivo −
totalPasivo` y `:241` comprueba `|activo − (pasivo + patrimonio)| < 0.5`, que es
siempre verdadero). Un semáforo que solo tiene verde entrena a confiar; hay que
cambiarlo por uno que pueda ponerse en rojo — patrimonio por acumulación contra
activo − pasivo.

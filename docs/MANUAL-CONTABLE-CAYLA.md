# Manual contable de CAYLA — cómo se arman los balances, en simple

> Encargo de Felipe: *"aprende lo mejor, pero adáptalo a CAYLA y al retail para que sea
> más fácil e intuitivo armar todos mis balances."* Esto no es teoría contable: es el
> plan concreto de CAYLA, con sus cuentas, sus reglas y su rutina de cierre.
> El estudio general está en [ESTUDIO-CONTABILIDAD.md](ESTUDIO-CONTABILIDAD.md).

---

## La idea, en una frase

**Tú y el equipo siguen haciendo exactamente lo mismo que hoy. El sistema traduce cada
acción a contabilidad, y los tres balances salen solos.**

Vender una blusa no es "hacer un asiento": es vender una blusa. Pero por debajo, esa
venta mueve cinco cuentas al mismo tiempo, y eso es lo que hace que al final del mes el
Balance cuadre sin que nadie lo cuadre a mano.

---

## 1. El plan de cuentas de CAYLA (25 cuentas, no 500)

Alineado al **PCGE** (obligatorio en Perú), pero recortado a lo que CAYLA realmente
mueve. Los números no son decorativos: son los que tu contador espera ver.

### 🟢 ACTIVO — lo que CAYLA tiene
| Cuenta | Nombre | Qué es en tu negocio |
|---|---|---|
| **101** | Caja | El efectivo en el cajón de cada tienda |
| **104** | Cuentas corrientes | Tu dinero en el banco |
| **105** | Medios de pago en tránsito | POS y Yape cobrados que el banco aún no abona |
| **201** | Mercaderías | Lo comprado a proveedores, listo para vender |
| **211** | Productos terminados | Lo que sale del Taller |
| **335** | Muebles y enseres | Estantes, mostradores, remodelación de tienda |
| **336** | Equipos diversos | La Brother, la Epson, la Zebra, computadoras |

### 🔴 PASIVO — lo que CAYLA debe
| Cuenta | Nombre | Qué es en tu negocio |
|---|---|---|
| **4011** | IGV — cuenta corriente | Lo que le debes a SUNAT (o SUNAT a ti) |
| **4017** | Impuesto a la renta | El impuesto del período |
| **41** | Remuneraciones por pagar | Sueldos devengados no pagados |
| **421** | Facturas por pagar | **Deuda a proveedores** — hoy invisible |

### 🔵 PATRIMONIO — lo que es tuyo
| Cuenta | Nombre |
|---|---|
| **50** | Capital |
| **591** | Utilidades no distribuidas (las ganancias acumuladas) |

### 🟡 INGRESOS
| Cuenta | Nombre |
|---|---|
| **7011** | Ventas de mercadería |
| **7012** | Ventas de producción propia (Taller) |
| **711** | Variación de productos terminados (cuando el Taller entrega) |

### 🟠 GASTOS Y COSTOS
| Cuenta | Nombre | Nota |
|---|---|---|
| **691** | Costo de ventas | Lo que costó lo que vendiste |
| **609** | Costos vinculados con las compras | **El flete del fardo** — ver §4 |
| **62** | Gastos de personal | Planilla, honorarios |
| **635** | Alquileres | |
| **636** | Servicios básicos | Luz, agua, internet |
| **631** | Transporte | Envíos que NO son de compra |
| **634** | Mantenimiento | |
| **637** | Publicidad | Marketing |
| **656** | Suministros | Bolsas, empaques, útiles |
| **659** | Desmedros y otros | **Las mermas** |

### ⭐ La regla que evita que esto se vuelva un monstruo

**No se multiplican las cuentas por sede.** No existe "101-TRU", "101-AQP", "101-LIM".
Existe **una** cuenta 101 Caja, y cada asiento lleva la **sede como etiqueta**.

Así el plan se queda en 25 cuentas en vez de 75, y aun así puedes ver el Balance de TRU
solo, de AQP solo, o de todo CAYLA junto. Es lo mismo que QuickBooks llama *Location
tracking* — y CAYLA ya tiene `sede_id` en absolutamente todo, así que sale gratis.

---

## 2. Las reglas de posteo — todo lo que hace CAYLA

Estas son **todas** las operaciones del negocio. No hay una décimo-quinta escondida.

| # | Cuando pasa esto… | Debe (entra) | Haber (sale) |
|---|---|---|---|
| 1 | **Venta en efectivo** | 101 Caja | 7011 Ventas + 4011 IGV |
| 2 | **Venta con POS/Yape** | 105 En tránsito | 7011 Ventas + 4011 IGV |
| 3 | Banco abona el POS | 104 Banco | 105 En tránsito |
| 4 | **Costo de esa venta** | 691 Costo de ventas | 201 Mercaderías |
| 5 | **Recibir fardo pagado** | 201 Mercaderías + 4011 IGV | 101 Caja / 104 Banco |
| 6 | **Recibir fardo a crédito** | 201 Mercaderías + 4011 IGV | **421 Facturas por pagar** |
| 7 | Pagar al proveedor | 421 Facturas por pagar | 104 Banco / 101 Caja |
| 8 | **Flete del fardo** | 609 Costos de compra | 101 Caja |
| 9 | **Gasto operativo** | 62/63x/65x + 4011 IGV | 101 Caja / 104 Banco |
| 10 | **Depósito al banco** | 104 Banco | 101 Caja |
| 11 | **Merma** | 659 Desmedros | 201 Mercaderías |
| 12 | **Taller entrega producción** | 211 Productos terminados | 711 Variación |
| 13 | **Compra de mueble/equipo** | 335/336 + 4011 IGV | 101 Caja / 104 Banco |
| 14 | **Bajada a tienda / traslado** | *(sin asiento)* | *(sin asiento)* |

**La #14 merece explicación**, porque es donde muchos sistemas se equivocan: mover una
prenda del almacén al piso, o de TRU a AQP, **no cambia cuánto vale CAYLA**. Es la misma
mercadería en otro lugar. Solo cambia la *etiqueta de sede*, no el saldo. Generar un
asiento ahí sería inventar movimiento contable donde solo hubo movimiento físico.

---

## 3. Cómo se arma cada balance (y por qué ya no se "arman": salen)

### 📄 Estado de Resultados — ¿ganamos este mes?
```
   Ventas (7011 + 7012)
 − Costo de ventas (691)
 − Fletes de compra (609)
 − Mermas (659)
 ─────────────────────────────
 = MARGEN BRUTO
 − Gastos de operación (62, 631, 634, 635, 636, 637, 656)
 ─────────────────────────────
 = UTILIDAD OPERATIVA
```

### ⚖️ Balance General — ¿cuánto vale CAYLA hoy?
```
 ACTIVO                          PASIVO
  Caja (101)                      IGV por pagar (4011)
  Banco (104)                     Facturas por pagar (421)
  En tránsito (105)               Remuneraciones (41)
  Mercaderías (201)              ────────────────────────
  Productos terminados (211)      PATRIMONIO
  Muebles y equipos (335/336)     Capital (50)
                                  Utilidades acumuladas (591)
 ─────────────────────────       ────────────────────────
 TOTAL ACTIVO           =        TOTAL PASIVO + PATRIMONIO
```
**Cuadra siempre, sin esfuerzo**, porque cada asiento individual cuadró. Si algún día no
cuadra, hay un error de programación — no de contabilidad.

### 💵 Flujo de Efectivo — ¿por qué vendí bien y no hay plata?
```
 De la OPERACIÓN:  cobros de ventas − pagos a proveedores − gastos pagados
 De INVERSIÓN:     compra de muebles, equipos, remodelación
 De FINANCIAMIENTO: aportes tuyos, préstamos, retiros
 ─────────────────────────────────────────────────
 = Variación del efectivo → debe dar exactamente Caja + Banco del Balance
```

**El triple amarre** (la prueba de que todo está bien):
1. La utilidad del EERR → aparece en Utilidades acumuladas del Balance.
2. La misma utilidad → es el punto de partida del Flujo de Efectivo.
3. El efectivo final del Flujo → es exactamente Caja + Banco del Balance.

---

## 4. Las cuatro correcciones que el retail de moda exige

Esto es lo que aprendí investigando específicamente retail de ropa, y que cambia cosas
concretas de cómo CAYLA opera hoy:

### ① El flete del fardo pertenece al margen bruto, no a los gastos
Hoy CAYLA registra el flete (S/25-50 por fardo) como gasto de *transporte*, junto al
alquiler y la luz. Contablemente, **traer mercadería es parte de lo que cuesta esa
mercadería** — el PCGE tiene una cuenta exacta para esto: **609, "costos vinculados con
las compras"**.

*Por qué importa:* si el flete está entre los gastos de operación, tu **margen bruto se
ve mejor de lo que es** y tus gastos fijos peor. Moverlo a 609 no cambia la utilidad
final ni un sol — pero hace que el margen bruto diga la verdad, que es el número con el
que decides precios.

*La simplificación honesta:* repartir el flete prenda por prenda (S/0.83 en un fardo de
60) sería exacto pero engorroso al recibir. Con mandarlo a 609 basta: cae en el margen
bruto, que es donde pertenece, sin fricción en el mostrador.

### ② El costo de lo vendido debe ser el de ESE momento
Hoy el sistema calcula el costo usando `variantes.costo` **de hoy**. Si mañana subes el
costo de una blusa, el costo de las que vendiste en enero cambia retroactivamente. Un
sistema contable **sella el costo en el asiento** el día de la venta, y ese número ya no
se mueve nunca. Esto ya lo había detectado en la revisión de código; con libro mayor se
resuelve solo.

### ③ Las mermas no son un gasto de operar: reducen el margen
Ya lo hacemos bien (van junto al COGS, no entre alquiler y luz). Se mantiene, ahora con
cuenta propia: **659**.

### ④ Los descuentos permanentes (markdowns) merecen medirse
Cuando bajas el precio de una prenda que no rota, contablemente la venta vale lo que
cobraste — no hay asiento especial. Pero **comercialmente** es oro saber cuánto dinero
"regalaste" en descuentos por familia y por temporada. La columna `precio_oferta` existe
en la base desde el día uno y está vacía: es una oportunidad, no una deuda.

---

## 5. El cierre de mes de CAYLA (la rutina que hace todo fácil)

Un cierre bien hecho toma **3 días**, no 3 semanas. Y la mayor parte no la haces tú.

### Día 1 — las Encargadas (20 minutos por tienda)
- [ ] Cerrar la caja del último día del mes.
- [ ] Registrar los depósitos al banco que falten (**regla de oro: depositaste → lo registras**).
- [ ] Conteo físico rápido: **solo las 20 prendas de mayor valor** de la tienda, no todo.
      (El conteo completo es 2 veces al año, no cada mes.)

### Día 2 — tú (40 minutos)
- [ ] Revisar que todos los gastos del mes estén registrados (facturas en el cajón).
- [ ] Registrar las facturas de proveedor pendientes de pago → deuda visible.
- [ ] Conciliar el banco: el saldo real vs. el del sistema.
- [ ] Revisar el cuadre de efectivo de cada tienda y explicar cualquier diferencia.

### Día 3 — el sistema (5 minutos tuyos)
- [ ] Abrir los tres estados y mirarlos contra el mes anterior.
- [ ] Investigar cualquier variación grande (¿por qué el margen bajó 4 puntos?).
- [ ] **Cerrar el mes** → el período se congela y nadie puede alterar la historia.

> **La regla que hace la diferencia:** concilia **semanal**, no mensual. Revisar caja y
> banco cada viernes convierte el cierre de mes en un trámite de minutos, en vez de una
> cacería de errores de 30 días atrás.

---

## 6. Simplificaciones conscientes (dichas en voz alta, no escondidas)

Un sistema honesto declara lo que **no** hace:

1. **Sin productos en proceso (WIP) en el Taller.** La prenda "nace" contablemente cuando
   la tienda la recibe terminada, valorizada con su receta de costo. Mientras es tela
   cortada sobre la mesa, no está en el Balance. *Se revisita si el Taller crece a tener
   valor significativo parado en proceso.*
2. **Sin depreciación.** Los muebles y equipos entran al Balance a su costo y se quedan
   ahí. Contablemente deberían perder valor cada año. *Se agrega cuando tengas contador
   formal pidiéndolo — antes sería sobre-ingeniería.*
3. **Sin cuentas por cobrar.** CAYLA vende al contado. El día que vendas a crédito o por
   convenio con empresas, se activa la cuenta 12.
4. **Costeo promedio simple, no por capas.** Cada variante tiene un costo; no se rastrean
   capas FIFO por lote de compra. Para moda con reposición frecuente del mismo modelo, la
   diferencia es marginal frente a la complejidad.

---

## 7. Qué se necesita construir para que esto exista

En orden, y ninguna etapa rompe lo anterior:

| Fase | Qué | Resultado visible |
|---|---|---|
| **C1** | Tablas `cuentas` + `asientos` con "debe = haber" impuesto por la base, y las 14 reglas de posteo automático | Balance General que cuadra de verdad |
| **C2** | Cuentas por pagar, IGV real, cuentas bancarias | Sabes cuánto debes y a quién |
| **C3** | Flujo de Efectivo + cierre de período que congela | Los tres estados amarrados |
| **C4** | Registro de Ventas/Compras formato PLE | Listo para SUNAT al cruzar 300 UIT |

**Nadie en CAYLA escribirá jamás un asiento contable.** Si algún día alguien tiene que
hacerlo, el diseño falló.

---

## Fuentes de esta investigación

- [Retail Chart of Accounts para boutiques](https://findingfreedomfinancial.com/chart-of-accounts-for-retail/) · [Vencru](https://vencru.com/blog/guide-to-retail-chart-of-accounts/)
- [Retail Accounting for Apparel Companies — Wiss](https://wiss.com/retail-accounting-apparel-inventory-to-cash-flow/)
- [Bookkeeping for Fashion & Apparel Brands — A2X](https://www.a2xaccounting.com/ecommerce-accounting-hub/fashion-bookkeeping-guide)
- [Manufacturing inventory accounting — NetSuite](https://www.netsuite.com/portal/resource/articles/accounting/manufacturing-inventory-accounting.shtml)
- [Month-End Close Checklist — Shopify](https://www.shopify.com/blog/month-end-close-checklist) · [QuickBooks/Intuit](https://digitalasset.intuit.com/render/content/dam/intuit/sbseg/en_us/Blog/Graphic/month-end-close-checklist-quickbooks.pdf)
- [Plan Contable General Empresarial — MEF Perú](https://www.mef.gob.pe/es/contabilidad-publica-sp-6700/388-documentacion/6127-plan-contable-general-empresarial-pcge)

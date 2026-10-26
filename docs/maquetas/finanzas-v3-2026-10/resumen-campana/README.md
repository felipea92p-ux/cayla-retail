# Finanzas ▸ Resumen y campañas · spike (2026-10-26)

Pedido de Felipe: que el Plan de campaña ayude a decidir **qué comprar, cuánto cuesta, cuándo comprar y cómo pagarlo**, que eso se vea en el Resumen de Finanzas
(por defecto sí, con opción de ocultarlo), y revisar **qué debe verse primero en el Resumen para alguien que sabe poco de números**.

- **Cómo verlo:** abrir `index.html` (necesita `base.css` y `base.js`, copiados de `../resumen-siguiente/`) o `preview_start maqueta-referentes` y entrar a
  `/finanzas-v3-2026-10/resumen-campana/`. Seis vistas, claro y oscuro, 375 px sin desborde.
- **Las cifras son de ejemplo.** Hoy es el lunes 26 de octubre; campañas ficticias: Cyber Wow (27–30 nov) y Navidad (1–24 dic). Nada sale de producción.
- **Lo ya construido en el Resumen va rayado** (recorrido de la plata, «Hoy te toca»). No se toca.

## El chat «FER – Auditoría módulo plan de campaña»: estado al 2026-10-26

- **Todavía no entregó nada.** Su rama (`claude/campaign-plan-audit-652032`) es igual a `main`, sin commits, y su carpeta está limpia. Sigue investigando: sus archivos de
  trabajo son el plan contable peruano (cuentas de mercaderías, compras y costo de ventas), la NIC 2 de inventarios y artículos de *open-to-buy*.
- **Su encargo ya incluye este punto:** «que esta campaña se vea en nuestras finanzas como gasto/egreso/costo, en cuántos meses se paga, qué se compra cada mes, que se
  refleje en el resumen, y que se pueda quitar la visualización». Y vio la misma pregunta de fondo que este spike: qué tipo de gasto es una compra de mercadería.
- **Lo ya construido por el Plan y que este spike usa tal cual:** el tope de inversión (ADR-0372, B2), lo pedido en órdenes, y el descuento y la fecha límite para pedir
  (ADR-0499, ya en producción). La maqueta del Plan dejó «Finanzas dice…» **fuera a propósito** («toca dos módulos»): este spike es esa conexión.
- **Qué hacer con eso:** cuando ese chat entregue, se comparan sus spikes con los de aquí y se unifican. Lo que sigue es el **contrato** que Resumen necesita del Plan.

## Contrato propuesto (Plan de campaña ⇄ Finanzas ▸ Resumen)

| El Plan promete (por campaña) | Existe hoy | Nuevo |
|---|---|---|
| id y nombre (la etiqueta de Catálogo ▸ Etiquetas), fechas | sí | — |
| Cuánto planea comprar: Σ cantidad × costo por categoría | sí (`Inversión`) | — |
| Tope de inversión, firmado | sí (ADR-0372 B2) | — |
| Cuánto va pedido (órdenes) y pagado | pedido sí (`plan_compra_lo_pedido_en_ordenes`) | pagado: leerlo de Por pagar |
| Hasta cuándo pedir | sí (ADR-0499) | — |
| **Cómo piensas pagarlo:** lista de (fecha, %), con IGV o sin él | no | **sí** (guardar con el plan, firmado; la base exige que sume 100 %) |
| **¿Se ve en el Resumen?** | no | **sí** (por campaña, por defecto sí) + un interruptor general de Finanzas |

**Regla anti doble conteo (lente de conjuntos):** cada sol del plan está en **una** sola etapa: `plan = pagado + pedido sin pagar + falta pedir`. Lo ya facturado vive en
Por pagar y en el flujo de caja; la compra planificada solo cuenta lo que **aún no se pidió**. Al pedirse, sale del plan y entra al flujo, no en los dos a la vez.
(Igual que el *open-to-buy* de SAP: el presupuesto de compra baja cuando se crea la orden.)

**Si el Plan no responde:** el bloque dice «No se pudo leer el plan de campaña» y la caja sigue con lo que ya sabía; nunca un S/ 0 que parezca un dato.

## Lo que aprendí del otro chat (sus spikes ya están en `docs/maquetas/plan-campana-vision-2026-10/`, sin commitear)

Su spike ⑤ «Finanzas» y el mío llegaron al mismo punto sin hablar: **«No es un gasto: es un compromiso de compra»**, con interruptor «Mostrar esta campaña» y la compra en la caja. Diferencias a resolver:

| | Este spike | El del Plan | Qué conviene |
|---|---|---|---|
| Nombre | «Compras de campaña» | «Compromiso de compra» | Mismo concepto; un solo nombre en las dos pantallas. «Compromiso» es exacto; «compras» se entiende más rápido. Lo elige Felipe mirando. |
| Cómo se arma el pago | lista de pagos (fecha, %) | **tandas de pedido × forma de pago** (contado, 30, 60 días, anticipo) | Se guarda la lista de pagos (decidido); la pantalla del Plan la arma con tandas y formas. |
| **IGV** | **no lo conté** | sí, con interruptor (18 %) | **Tienen razón:** de la caja sale el monto con IGV; ese IGV vuelve como crédito fiscal en la declaración siguiente. En el Resumen la compra se cuenta **con IGV** y lo dice. |
| Dónde se ve | Resumen + caja | Reportes ▸ Flujo de caja (12 semanas) | Los dos: es la misma lista de pagos leída por dos pantallas. |

## Reparto de trabajo (para no pisarnos)

| De quién | Qué |
|---|---|
| **Plan de campaña** (el otro chat) | Guardar la lista de pagos y el «se ve en el Resumen» por campaña; la función que las lee; la pantalla donde se arma. |
| **Finanzas ▸ Resumen** (este chat) | El bloque «Compras de campaña», la compra planificada en «Tu caja» (con IGV, como capa distinta de las facturas), y el interruptor general. Se construye contra un contrato y **no ofrece nada hasta que la base lo confirme** (la «marca soportado» del ADR-0499). |
| De Felipe | Pegar en producción cualquier migración, y el nombre. |

## Decisiones (protocolo de `/decide`)

| Decisión | ¿Pasa el test? | Qué hago |
|---|---|---|
| **Cómo se llama** | No: es un texto, se cambia en 2 minutos | Ejecuto: **«Compras de campaña»**. Alternativas en el spike (pestaña 2): «Plata en la campaña», «Inversión en mercadería». |
| **No es un gasto** | No: ya lo dicen la NIC 2 y el Balance del ERP (`fn_bal_stock`) | Ejecuto, **y objeto**: llamarlo gasto lo metería en «Te deja» y el mes parecería perder plata el día que compras, no el día que vendes. Va como *plata comprometida* y por **caja**. La publicidad de la campaña y el descuento **sí** son gasto de campaña. |
| **Quién decide qué se ve** | **Sí** (toca la base, cuesta más de 30 min deshacerlo) | **Pregunto**, abajo. |
| **Dónde se guarda «en cuántas tandas»** | **Sí** (esquema del plan) | **Pregunto**, abajo. |

```
DECIDÍ:     que la compra de campaña entre al Resumen por la caja («Tu caja con la campaña») y por un bloque propio, nunca dentro de «Te deja».
DESCARTÉ:   mostrarla como un gasto del mes: duplicaría el costo (se contaría al comprar y otra vez al vender) y haría parecer pérdida una inversión.
SE ROMPE SI: una compra de campaña se paga en un mes y se vende en otro y la persona compara «Te deja» con lo que gastó: el bloque lo explica con «¿Por qué no es un gasto?» (pestaña 5).
```

### Decidido por Felipe (2026-10-26)
1. **Opción A: un interruptor por campaña y uno general.** Va firmado (quién y cuándo), como el tope de inversión. Ocultar no borra nada: la campaña sigue en el Plan y en Compras.
   Apagado el general, el bloque no aparece y la caja no cuenta lo que **aún no se pidió**; lo ya pedido y por pagar sigue en Por pagar. Por defecto, todo se ve.
2. **Sí se guarda en el plan cómo se piensa pagar: una lista de (fecha, %).** Es lo que Finanzas lee para la caja. La interfaz puede ayudar a armarla (tandas de pedido, «a 30 días», anticipos),
   pero lo que se guarda son los **pagos**, no la forma de armarlos: si mañana cambia la pantalla del Plan, Finanzas no se entera.
   ```
   DECIDÍ:     guardar la lista de pagos (fecha, %) con su autor y hora, dentro del plan.
   DESCARTÉ:   guardar las «tandas con forma de pago» y calcular los pagos al leer: acopla a Finanzas con cómo está armada la pantalla del Plan; un cambio de allá movería la caja de acá.
   SE ROMPE SI: la lista no suma 100 % o tiene una fecha anterior al pedido: la base lo rechaza (CHECK), no la pantalla.
   ```

## Lo que cambió el diseño por `/rigor`

- **Estadística (poca muestra).** Hay **una** campaña anterior y cero órdenes de compra en producción (ADR-0499). Un número solo («compra 150») aparenta más precisión de la que existe: el spike muestra **un rango**
  («entre 130 y 170») y un aviso «pocos datos: 1 campaña». Es la misma contracción que ya usa `rendimiento-reglas.ts`.
- **Demanda censurada.** Las Casacas «vendieron 120 de 120 y se acabaron el día 9»: la venta **no** es la demanda, es lo que había. Contarla tal cual hace comprar de menos justo lo que más se pide.
  El spike lo dice con todas sus letras y sugiere **más** de lo vendido (ya existe la venta perdida, ADR-0348).
- **Conjuntos.** La partición de arriba y «lo que ya está en Por pagar no se suma».
- **Resiliencia.** El bloque se degrada con una frase, no con un cero.

## Lo que aplicó `/unificar` (una función, una pieza)

| Se dibuja | Pieza decidida | Nota |
|---|---|---|
| Pagado · pedido · falta pedir contra el tope | `<BarraApilada>` (`grafico.barra`) | Cada tramo es una etapa; el hueco hasta el tope es la pista. |
| Qué tan vendido salió cada categoría | `<BarraAvance>` (`grafico.avance` / `grafico.escala`) | A escala, sin verde (la categoría más vendida no está «lista»). |
| Cuánto movió cada cosa lo que te deja la campaña | La **lista con barras** de «Lo que más se movió» | No inventa un gráfico de cascada: reutiliza la pieza que ya existe en el Resumen. |
| Tu caja con y sin la campaña | `<Linea>` | **Hace falta una extensión:** hoy admite UNA referencia y aquí van dos (el mínimo y «sin la campaña»). Es decisión de Felipe en una ronda de `/unificar` (`referencias[]`). |
| Tres respuestas de arriba | `<TarjetaCifra>` | Ya existe. |
| Interruptores de «se ve en el Resumen» | `<Interruptor>` | Ya existe; se prende en tinta. |
| Las tres opciones de «cuándo compro» | una tarjeta que se elige (como las opciones de una hoja) | **A confirmar con `/unificar`:** no hay una pieza decidida para «elegir entre tres tarjetas»; hasta entonces es local. |

## Lo que mide `/formidable` (las 9 leyes, sobre el spike)

- **Ley 1 y 2 (sin manual, una pregunta una respuesta):** la vista 1 abre con **tres preguntas con una cifra cada una** (¿cuánto tienes? ¿cuánto debes pagar pronto? ¿cuánto te deja?). Hoy el Resumen abre con una sola, la que llega más tarde.
- **Ley 3 (traducir a un veredicto):** el semáforo (B) convierte cuatro cálculos en cuatro frases: «Sí: tienes S/ 21,500», «Los sueldos del 31 te dejan bajo tu mínimo»…
- **Ley 4 (lenguaje de tienda):** «plata comprometida», «pide antes del 12 nov (faltan 17 días)», «se acabó el día 9». Cero «open-to-buy», cero «encumbrance».
- **Ley 6 (lo difícil a un toque):** «¿Por qué no es un gasto?» es una tarjeta de tres pasos, no un párrafo contable.
- **Ley 8 (quitar antes de agregar):** el Resumen ya ganó 5 piezas; esta propuesta **mueve** el orden (plata y vencimientos arriba) y suma un solo bloque, «Compras de campaña», que se puede apagar.
- **Ley 9 (vacíos y errores):** si el Plan no responde o no hay campañas, el bloque no se dibuja o lo dice.

## Qué va primero (investigación)

1. **La plata que tienes** y **lo que vence**, antes que la utilidad. Xero abre con banco, facturas por pagar y por cobrar; las guías para dueños de negocios chicos coinciden: la utilidad llega tarde y un negocio rentable
   puede quedarse sin caja. 2. **Pocas cifras**: seis preguntas bastan; más cifras se ven bien y no se usan. 3. **El «puente» y la barra a escala** antes que gráficos de torta.
4. En campañas, el esquema estándar de compras es **presupuesto → comprometido → real → disponible**, tres columnas por línea.

### Fuentes (consultadas el 2026-10-26; son guías de proveedores, tómalas como práctica común y no como norma)
- Xero, el panel para negocios chicos: <https://www.xero.com/accounting-software/dashboard>
- Cómo armar un panel financiero para un negocio chico: <https://fitsmallbusiness.com/accounting/financial-dashboard/>
- Open-to-buy para ropa (fórmula y ejemplo de temporada): <https://blastramp.com/open-to-buy-planning-for-apparel-brands-formula-and-seasonal-example/>
- Cómo planear compras de inventario (Australia): <https://www.smartcompany.com.au/marketing/how-do-i-master-my-inventory-buying/>
- SAP, cómo funciona el OTB (el presupuesto baja al crear la orden): <https://help.sap.com/saphelp_46c/helpdata/en/4c/420c26470a11d1894a0000e8323352/content.htm>
- Comprometido contra real (encumbrance): <https://www.stampli.com/resources/committed-spend-vs-actual-encumbrance/>
- Gráficos de finanzas para quien no es de finanzas: <https://blog.coupler.io/financial-data-visualization/>
- Semanas de inventario por temporada: <https://www.prediko.io/blog/weeks-of-supply-formula>
- Inventario es activo hasta que se vende y el costo pasa a «costo de ventas»: varias guías de pequeños negocios; en el ERP lo dice el Balance (`fn_bal_stock`) y el plan contable.

## Qué hay en cada vista

| Vista | Qué responde | Variantes |
|---|---|---|
| 1 · Qué ver primero | ¿Qué debe abrir el Resumen? | A tres respuestas · B semáforo de preguntas · y el orden propuesto |
| 2 · Con la campaña | El Resumen con «Compras de campaña», la caja con la compra y el interruptor de nombre | — |
| 3 · ¿Cuándo compro? | ¿Todo junto, en dos tandas o a plazo? | A línea de caja · B tres opciones lado a lado |
| 4 · Lo que dice la historia | Qué se compró, qué se acabó y qué pedir, con rango y aviso de pocos datos | — |
| 5 · ¿Cuánto cuesta? | La plata en mercadería, por qué no es un gasto y lo que deja la campaña | — |
| 6 · Ajustes | Qué se ve en el Resumen: general, por campaña y en la caja | — |

## Lo que la maqueta simplifica a propósito
- El saldo de caja sin campaña es una curva inventada de 10 puntos; en la app es el flujo real (`fn_flujo_caja_proyeccion`), y la compra entra como una **salida planificada** distinta de las facturas.
- «Pago a plazo» (opción C) supone crédito del proveedor: es un dato que hoy **no** vive en ninguna parte (el plazo del ADR-0499 es de entrega, no de pago). Hay que preguntarlo antes de contar con él.
- La sugerencia por categoría usa rangos inventados que respetan la forma de la cuenta del plan (`cuantilCritico`); no la recalculan.
- No se tocó código de la app, migraciones ni producción.

## Precisiones del Plan de campaña (2026-10-26, sesión «Auditoría módulo plan de campaña»)

Ninguna cambia el rumbo del Resumen; cambian lo que el contrato le pide al Plan:

1. **IGV por categoría.** Algunos costos ya incluyen el IGV y otros no; el plan lo marca por categoría. Por eso el Plan debe exponer, por campaña, **valor sin IGV, IGV y lo que sale de caja**, ya calculados. El Resumen no recalcula el IGV: lo lee. (Referencia: `docs/maquetas/plan-campana-vision-2026-10/5-finanzas.html`, rama `claude/campaign-plan-audit-652032`.)
2. **Pagos.** Se guarda la lista (fecha, %), con autor y hora y un CHECK de 100 %. Lo que se pide cada semana es otro dato del plan que usan Compras y la fecha límite: el Resumen no lo lee. Se decide en la tarea #10 del Plan.
3. **Visibilidad.** El Plan propone 3 estados por campaña (flujo de caja y Escenarios / solo Escenarios / no mostrarla). Nuestro «se ve en el Resumen» es un booleano. Va **una sola columna**; Felipe elige entre booleano y 3 estados. Hasta entonces no se toca el esquema. La demo usa interruptores simples.
4. **Nombre.** Felipe eligió «Inversión en mercadería» para el Resumen; el spike del Plan dice «Compromiso de compra» y Felipe elige mirando entre ese y «Compras de campaña». Hay que alinear un solo nombre en las dos pantallas.

Tiempos: el Plan empieza por #1–#3 y luego #4–#6; lo de Finanzas (#10) viene después y necesita OK de Felipe. Hoy no existe ninguna tabla ni migración del Plan para esto: el lado del Resumen va tras bandera y no ofrece nada hasta que la base lo confirme.

**Decidido por Felipe (2026-10-26): booleano.** Una campaña se ve o no se ve en el Resumen: una sola columna sí/no, por defecto «se ve». Los tres estados del Plan (flujo de caja y Escenarios / solo Escenarios / no mostrarla) quedan fuera por ahora; se pueden agregar después sin romper el booleano. El nombre sigue por elegir.

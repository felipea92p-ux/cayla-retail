# Cómo ordenan la contabilidad los sistemas serios — y qué le falta a CAYLA

> Encargo de Felipe (2026-07-19): *"investiga y estudia en profundidad cómo QuickBooks o
> sistemas superiores ordenan toda la contabilidad de una empresa y estados financieros,
> quiero llevar a CAYLA a otro nivel."* Este documento es el estudio. No propone código:
> propone entender primero, y decidir mañana con criterio.

---

## 0. El hallazgo que ordena todo lo demás

**Los usuarios de QuickBooks no hacen contabilidad. QuickBooks hace contabilidad por lo
que ellos hacen.**

Una dueña de tienda en QuickBooks nunca escribe "debe" ni "haber". Registra una venta,
paga una factura, recibe mercadería. Por debajo, y sin que ella lo vea, cada una de esas
acciones se convierte en un **asiento contable de partida doble**. Por eso QuickBooks
puede darle, el mismo día, un Estado de Resultados, un Balance General y un Flujo de
Efectivo que cuadran entre sí — y CAYLA hoy no puede.

Esa es la diferencia real. No es "más reportes". Es que **debajo de la operación hay un
libro contable**, y todos los reportes salen de ese mismo libro.

---

## 1. Las cinco capas de un sistema contable serio

Todo sistema profesional (QuickBooks, Xero, SAP, Oracle, Dynamics) tiene la misma
anatomía. De abajo hacia arriba:

### Capa 1 · El Plan de Cuentas (Chart of Accounts)
La lista de "cajones" donde puede caer cada sol. Cinco familias, siempre las mismas:

| Familia | Qué es | Ejemplos en CAYLA |
|---|---|---|
| **Activo** | Lo que la empresa tiene | Efectivo en tiendas, banco, inventario, muebles |
| **Pasivo** | Lo que debe | Deuda a proveedores, IGV por pagar a SUNAT, préstamos |
| **Patrimonio** | Lo que es de los dueños | Capital aportado, utilidades acumuladas |
| **Ingreso** | Lo que entra por vender | Ventas de mercadería |
| **Gasto** | Lo que consume operar | Alquiler, planilla, servicios, costo de lo vendido |

Cada cuenta tiene número. En Perú no es libre: existe el **PCGE (Plan Contable General
Empresarial)**, obligatorio para todas las empresas desde 2020, alineado con las NIIF.
Sus elementos: 1 disponible/exigible, 2 realizable (existencias), 3 inmovilizado, 4
pasivo, 5 patrimonio, 6 gastos por naturaleza, 7 ingresos, 8 resultados, 9 gastos por
función.

### Capa 2 · La partida doble (el corazón)
**Toda operación toca al menos dos cuentas, y la suma de lo que entra siempre iguala la
suma de lo que sale.** No es burocracia: es el mecanismo de autocontrol que hace que los
números no puedan mentir sin que se note.

Ejemplo real de CAYLA — vender una blusa a S/89.90 en efectivo (costo S/45):

```
Asiento 1 — la venta
  Debe   Caja tienda TRU ................ 89.90
    Haber  Ventas de mercadería ......... 76.19
    Haber  IGV por pagar (SUNAT) ........ 13.71

Asiento 2 — el costo de esa venta
  Debe   Costo de ventas ............... 45.00
    Haber  Inventario (mercadería) ..... 45.00
```

Fíjate en lo que aparece solo: **el IGV que le debes a SUNAT nace en el mismo momento de
la venta**, y el inventario baja de valor exactamente lo que costó lo vendido. Hoy CAYLA
no registra ninguna de las dos cosas.

### Capa 3 · Los libros: Diario y Mayor
- **Libro Diario**: todos los asientos en orden cronológico. Es la historia.
- **Libro Mayor**: los mismos asientos reordenados por cuenta. Es el saldo de cada cajón.

Regla de oro de la industria: **los asientos son inmutables**. Un error no se borra ni se
edita: se corrige con un asiento nuevo que lo revierte. Así la historia nunca cambia y
siempre se puede auditar quién hizo qué y cuándo.

### Capa 4 · Los sub-libros (subledgers) — *aquí está la clave para CAYLA*
Ningún ERP mete el detalle operativo dentro del libro contable. Se separan:

- **Sub-libros** (detalle): cada venta, cada prenda, cada movimiento de stock, cada
  factura de proveedor. Millones de filas, actualizadas al segundo.
- **Libro mayor** (resumen): los totales, en cuentas contables.

Los sub-libros **postean** al mayor — en detalle o resumido. Al cierre de mes se
**concilian**: el total del sub-libro de inventario debe ser idéntico al saldo de la
cuenta "Mercaderías" del mayor. Si no cuadran, hay un error y se ve de inmediato.

> **Esto es exactamente lo que CAYLA ya tiene a medias**: `movimientos`, `ventas`,
> `gastos`, `lotes` son sub-libros perfectos. Lo que falta es el mayor debajo, y las
> reglas que traduzcan lo uno en lo otro.

### Capa 5 · Los tres estados financieros
Salen todos del mismo mayor, y **están amarrados entre sí**:

1. **Estado de Resultados (EERR)** — ¿ganó o perdió en el período? Ingresos − gastos.
2. **Balance General** — ¿cuánto vale la empresa hoy? Activo = Pasivo + Patrimonio.
3. **Flujo de Efectivo** — ¿de dónde vino y a dónde se fue el dinero? Operación,
   inversión, financiamiento.

**Cómo se conectan** (esto es lo que hace que un sistema sea confiable):
- La **utilidad neta** del EERR baja al Balance como *utilidades acumuladas*.
- Esa misma utilidad es el **punto de partida** del Flujo de Efectivo.
- El **saldo final de caja** del Flujo de Efectivo es exactamente el efectivo del Balance.

Si los tres no cierran, algo está mal. Ese triple amarre es la razón por la que un banco
o un inversionista los pide: son difíciles de falsear sin que se note.

---

## 2. Dónde está CAYLA hoy — diagnóstico honesto

CAYLA tiene hoy un **excelente sistema de gestión operativa** y un **reporte gerencial**.
No tiene un sistema contable. La diferencia:

| Pieza | CAYLA hoy | Sistema contable |
|---|---|---|
| Plan de cuentas | ❌ No existe (categorías sueltas) | Cuentas jerárquicas PCGE |
| Partida doble | ❌ No existe | Todo asiento cuadra |
| Libro Diario / Mayor | ❌ No existen | Inmutables, auditables |
| Sub-libros | ✅ **Excelentes** (movimientos, ventas, gastos, lotes) | Igual |
| EERR | ⚠️ Calculado sumando tablas | Sale del mayor |
| Balance General | ⚠️ Aproximación manual (Patrimonio v1) | Cuadra por construcción |
| Flujo de Efectivo | ❌ No existe | Tercer estado obligatorio |
| Cuentas por pagar | ❌ No existe | Deuda a proveedores visible |
| Cuentas por cobrar | ❌ No existe | Si vendes a crédito |
| IGV como deuda | ❌ Se guarda, se ignora | Débito/crédito fiscal real |
| Cierre de período | ❌ Los meses nunca cierran | Se cierran y congelan |
| Costo de lo vendido | ⚠️ Usa el costo **de hoy** | Costo al momento de vender |

**Las tres consecuencias prácticas de esto, hoy:**

1. **Tu Balance no cuadra por construcción.** El Patrimonio que construimos suma efectivo
   + inventario + partidas manuales. Nada obliga a que Activo = Pasivo + Patrimonio. Es
   una estimación buena, no un balance.
2. **No sabes cuánto debes.** Si compras S/50,000 en mercadería a 30 días, el sistema
   registra el inventario pero no la deuda. Tu "patrimonio" se ve S/50,000 mejor de lo
   que es.
3. **El IGV es invisible.** Cobras IGV en cada venta (dinero que no es tuyo, es de SUNAT)
   y pagas IGV en cada compra (crédito a tu favor). Hoy ninguno de los dos aparece. Es la
   diferencia más grande entre tu utilidad reportada y tu utilidad real.

**Y lo bueno, que no es poco:** los sub-libros de CAYLA son mejores que los de muchos
sistemas contables. Cada movimiento de stock tiene autor, fecha, sede, motivo y lote. Esa
base es exactamente sobre la que se construye un mayor — no hay que rehacer nada.

---

## 3. Lo que SUNAT realmente te exige (y el número que debes vigilar)

En el **Régimen MYPE Tributario**, los libros obligatorios dependen de tus ingresos
netos anuales, medidos en UIT (2026: **UIT ≈ S/5,500** — confirmar con tu contador):

| Ingresos anuales | Libros obligatorios |
|---|---|
| **Hasta 300 UIT** (≈ S/1,650,000) | Registro de Ventas · Registro de Compras · **Libro Diario Simplificado** |
| 300 – 500 UIT (≈ S/1.65M – 2.75M) | + **Libro Mayor** (y libros electrónicos vía PLE 5.2) |
| 500 – 1,700 UIT | + **Libro de Inventarios y Balances** |

**El número que importa:** según SINATRA, CAYLA vendió **S/646,650 en 2026 hasta julio**
(TRU 438,674 + AQP 177,522 + LIM 30,454). Proyectado al año: **≈ S/1,190,000**.

> Eso es el **72% del umbral de 300 UIT**. Con un crecimiento de ~39% cruzas el límite y
> pasas a estar obligado a **Libro Diario + Libro Mayor electrónicos**.

Traducido: **el sistema que necesitas dentro de 12-18 meses es el que hay que empezar a
construir ahora.** No por miedo a SUNAT, sino porque construirlo antes de cruzar el
umbral es barato y ordenado; construirlo después, con la obligación encima, es caro y
apurado.

---

## 4. La arquitectura que le propongo a CAYLA

**No reescribir nada. Poner un libro mayor *debajo* de lo que ya existe.**

```
        LO QUE YA TIENES (sub-libros — no se toca)
  ventas · gastos · movimientos · lotes · cajas · depósitos
                        │
                        │  reglas de posteo automáticas
                        ▼
        LO QUE FALTA (el libro contable)
     asientos (partida doble, inmutables) → cuentas (PCGE)
                        │
                        ▼
   EERR  ·  Balance General  ·  Flujo de Efectivo  ·  Libros SUNAT
```

**La regla de oro del diseño: nadie en CAYLA escribe jamás un asiento.** Las Encargadas
siguen vendiendo, tú sigues registrando gastos, el almacén sigue recibiendo fardos.
Cada una de esas acciones dispara su asiento automáticamente, con reglas fijas.

### Mapa de posteo (las reglas concretas para CAYLA)

| Cuando pasa esto… | Debe | Haber |
|---|---|---|
| Venta en efectivo | Caja tienda | Ventas + IGV por pagar |
| Venta con POS/Yape | Banco por cobrar | Ventas + IGV por pagar |
| Costo de esa venta | Costo de ventas | Inventario |
| Recibir fardo pagado | Inventario + IGV crédito | Caja / Banco |
| Recibir fardo a crédito | Inventario + IGV crédito | **Cuentas por pagar** |
| Gasto en efectivo | Gasto por naturaleza + IGV crédito | Caja tienda |
| Depósito al banco | Banco | Caja tienda |
| Merma | Pérdida por merma | Inventario |
| Compra de mueble (inversión) | Inmueble/equipo | Caja / Banco |

Con solo estas nueve reglas, CAYLA produce automáticamente los tres estados financieros.
No hay una décima regla escondida: eso es todo lo que hace el negocio.

---

## 5. Plan por fases (propuesta para decidir mañana)

### Fase C1 · El libro mayor (la fundación)
Plan de cuentas PCGE reducido (~30 cuentas reales, no 500), tablas `cuentas` y
`asientos`/`asiento_lineas` con la regla "debe = haber" impuesta por la base de datos, y
las reglas de posteo automático sobre lo que ya se registra. **Nadie cambia su forma de
trabajar.** Al terminar: Balance General que cuadra de verdad.

### Fase C2 · Lo que hoy es invisible
Cuentas por pagar a proveedores (compras a crédito), IGV como débito y crédito fiscal
real, cuentas bancarias como cuentas de verdad. Al terminar: sabes cuánto debes, cuánto
te debe SUNAT o le debes, y cuánto tienes en banco.

### Fase C3 · Los estados completos
Flujo de Efectivo (el tercer estado, hoy inexistente), cierre mensual que congela el
período, y el amarre verificado: utilidad → patrimonio → caja.

### Fase C4 · Cumplimiento SUNAT
Registro de Ventas y Registro de Compras en formato PLE, Libro Diario. Se activa cuando
cruces las 300 UIT — pero las tres fases anteriores ya dejan los datos listos.

---

## 6. Mi recomendación

**DECIDÍ recomendar** empezar por la **Fase C1** — el libro mayor automático — y en este
orden exacto.

**DESCARTÉ** dos alternativas reales:
- *Contratar la contabilidad afuera y no tocar el sistema*: cuesta menos hoy y te deja
  ciego igual. Tu contador te dará estados 30-60 días tarde, y seguirás decidiendo con
  intuición sobre el mes que ya pasó.
- *Construir primero el Flujo de Efectivo o Cuentas por Pagar sueltos*: son más visibles
  y más rápidos, pero sin mayor debajo serían otra vez cálculos ad-hoc que no cuadran
  entre sí. Sería repetir el error de SINATRA con mejor diseño.

**SE ROMPE SI** el catálogo real no entra al sistema. Un libro mayor impecable sobre un
inventario de prueba no le sirve a nadie: el costo de ventas saldría de datos ficticios.
Por eso la carga del catálogo sigue siendo el desbloqueador número uno — la contabilidad
la vuelve **más** urgente, no menos.

---

## 7. Lo que esto le da a CAYLA que hoy no tiene

- Un **Balance General que cuadra** y se puede mostrar a un banco sin vergüenza.
- Saber **cuánto debes** a proveedores y a SUNAT, al día.
- El **Flujo de Efectivo**: por qué vendiste bien y aun así no hay plata en el cajón.
- Utilidad **real** después de IGV, no aproximada.
- Historia **inmutable y auditable**: quién registró qué, cuándo, sin poder borrarlo.
- Estar listo el día que cruces las 300 UIT, sin pánico.

---

## Fuentes consultadas

- [Chart of Accounts — QuickBooks/Intuit](https://quickbooks.intuit.com/accounting/chart-accounts/)
- [Books: an immutable double-entry accounting database — Square Engineering](https://developer.squareup.com/blog/books-an-immutable-double-entry-accounting-database-service/)
- [Double-entry accounting for software engineers](https://www.balanced.software/double-entry-bookkeeping-for-programmers/)
- [Ledger, subledger and subledger journal entries — Microsoft Dynamics 365](https://learn.microsoft.com/en-us/dynamics365/finance/general-ledger/ledger-subledger)
- [Subledger vs General Ledger — Sage](https://www.sage.com/en-us/blog/subledger-vs-general-ledger/)
- [How the 3 Financial Statements are Linked — Corporate Finance Institute](https://corporatefinanceinstitute.com/resources/accounting/3-financial-statements-linked/)
- [Plan Contable General Empresarial (PCGE) — MEF Perú](https://www.mef.gob.pe/es/contabilidad-publica-sp-6700/388-documentacion/6127-plan-contable-general-empresarial-pcge)
- [Libros y registros contables obligatorios — SUNAT](https://emprender.sunat.gob.pe/comprobantes-libros/registros-libros-electronicos/libros-registros-contables-obligatorios)
- [Régimen MYPE Tributario — SUNAT](https://emprender.sunat.gob.pe/ruc/regimenes-tributarios-mype/regimen-mype-tributario)
- [Cash vs accrual accounting — QuickBooks](https://quickbooks.intuit.com/accounting/cash-vs-accrual-accounting-whats-best-small-business/)
- [Perpetual inventory & weighted average cost — NetSuite](https://www.netsuite.com/portal/resource/articles/inventory-management/what-is-perpetual-inventory.shtml)

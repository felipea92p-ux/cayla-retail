# Maquetas · Finanzas v2 (2026-10-15)

Pedido de Felipe (15-oct): **3 maquetas por cada submódulo de Finanzas**, sofisticadas, elegantes, llenas de animaciones y que
cualquier persona entienda, **antes de construir** la Fase 1 (ADR-0417). Felipe elige mirando, no por descripción (ADR-0358).

Las cifras son **de ejemplo**: cuentan una sola historia coherente (octubre de 2026, día 15) y no son las de producción.
Nada se guarda.

**Decisión de Felipe (2026-10-15, después de recorrer las 18):** **camino A («La respuesta») en los seis submódulos**, guardando
relación con el estilo que ya existe en el ERP (`EncabezadoPagina`, `TarjetaCifra`, `Chip`, `nota-cayla`, el kit de Finanzas donde
corresponda). B y C quedan como referencia: una pieza suya puede entrar a A si Felipe la pide al ver cada pantalla construida.
Antes de construir, Felipe pidió un mapa interactivo de cómo se conecta Finanzas con el resto del ERP (`conexiones.html`).

Se abren con `index.html`. Cada submódulo es una página con su selector **A · B · C** arriba (también `#a`, `#b`, `#c` en la URL)
y un botón de tema claro/oscuro.

## Los tres caminos (los mismos en los 6 submódulos)

Son tres ideas de diseño distintas, no tres colores. Se repiten en todo Finanzas para que Felipe pueda elegir una por
submódulo sin que Finanzas termine viéndose como tres sistemas distintos (ADR-0358).

| | Camino | La idea | Para quién brilla |
|---|---|---|---|
| **A** | **La respuesta** | Una pregunta, una respuesta grande, la cifra que cuenta y una frase que explica. El detalle aparece en capas, con «¿Por qué?». Mucho aire. Se lee en 5 segundos. | El dueño, cada mañana |
| **B** | **La mesa de trabajo** | Tablero: cifras en tarjetas, gráficos que se arman al entrar, tabla con filtros en píldora y fila que se abre. Más densidad, todo a la vista. | Quien opera y el contador |
| **C** | **Las cosas de la tienda** | Metáforas físicas que se mueven: el cajón, los sobres, el talón, el hilo, la balanza, el sello. La plata se ve moverse de un lugar a otro. | Quien nunca vio un estado financiero |

## Reglas para dibujarlas

- **Paleta y tokens:** solo `base.css` (los de `globals.css`/`tema.css`). Nunca un hex suelto en la página, salvo para un dato.
  Rojo: máximo dos por pantalla. Modo oscuro: tiene que funcionar sin hacer nada.
- **Tipografía:** EB Garamond para títulos y cifras grandes; DM Sans para el resto.
- **Movimiento (ADR-0136):** rico, pero **una sola vez y sin rebote**:
  - Al entrar: cascada de 55 ms, barras que crecen, hilos que se dibujan, cifras que cuentan y sellos que se estampan.
  - Al pasar el mouse o hacer clic: cosas que responden.
  - Solo hay un bucle permitido, y es una señal: el punto que late en algo que vence (`.chip.late`).
  - Todo se apaga con `prefers-reduced-motion`.
- **Lenguaje de tienda:** «tú», español neutro peruano, cero jerga contable en A y C. Si aparece un término
  («margen», «IGV»), va con su «¿Por qué?». B puede usar términos, pero explicados.
- **Cada cifra se entiende sola:** qué es, contra qué se compara y qué hacer.
- **Escritorio primero.** Tiene que verse bien a 1280 px y no romperse a 375 px (sin scroll lateral de la página).
- **Lo que guarda nunca se pierde:** un botón «Aceptar» o «Registrar» anima su respuesta (sello, visto, fila que se va), pero es maqueta.

## La historia (cifras de ejemplo, comunes a todas las páginas)

**Hoy:** jueves 15 de octubre de 2026. Sedes: **Trujillo (TRU)**, **Arequipa (AQP)**, **Lima (LIM)**, que abre el 20 de octubre y
todavía no vende, y el **Taller** de Lima. Finanzas cuenta desde el 1 de octubre.

**Octubre hasta hoy (sin IGV, salvo cuando se indica):**
- Vendido: **S/ 46,900** (TRU 30,900 · AQP 16,000 · LIM 0). Con IGV son S/ 55,340. Fueron 636 ventas, con un ticket promedio de S/ 87 con IGV.
- Medios de pago (con IGV): Yape 16,170 · Efectivo 15,640 · Tarjeta 12,640 · QR Izipay 10,790 · Plin 100.
- Costo de lo vendido: **S/ 22,500**. De eso, S/ 2,700 (12 %) es **estimado** (venta sin prenda, ADR-0417).
- Margen bruto: **S/ 24,400** (52 %).
- Comisiones de máquinas: **S/ 520**.
- Gastos del mes, devengados día a día (15 de 31 días):
  - Sueldos: S/ 12,290 (S/ 25,400 al mes).
  - Alquileres: S/ 6,050 (S/ 12,500 al mes: TRU 4,000 · AQP 3,200 · LIM 2,800 · Taller 2,500).
  - Servicios y otros: S/ 1,250 (S/ 2,580 al mes).
  - Depreciación: S/ 440 (S/ 920 al mes).
- **Te quedan: S/ 3,850** en lo que va del mes.
- **Qué deja cada lugar** (después de lo que cada uno causa):

  | Lugar | Deja |
  |---|---|
  | TRU | +6,120 |
  | AQP | +2,480 |
  | LIM | −1,450 (paga alquiler y equipo sin vender todavía) |
  | Taller | −620 (capacidad no usada) |
  | Lo de toda la empresa | −2,680 (contador, publicidad, oficina) |
  | **Total** | **= 3,850** |

- **Ritmo** (con IGV): para cubrir el mes necesitas **S/ 3,100 al día** y vas en **S/ 3,690 al día**. Si sigues así, cierras
  octubre con **≈ S/ 7,950**.
- **Qué tan seguro es el número: 86 %.**
  - Ventas ✓.
  - Costo: 12 % estimado.
  - Sueldos ✓ (de Dynamic).
  - Alquileres 4 de 4 ✓.
  - Comisiones: faltan 2 depósitos.
  - Facturas de proveedor: 3 por revisar.

**Gastos de octubre (pagados, con IGV):**
- Alquileres: 12,500 (4 locales, el 1 de octubre).
- Luz y agua: 860 (Hidrandina, SEAL, Sedalib).
- Internet y teléfono: 450.
- Contador: 1,200.
- Publicidad en Instagram/Meta: 1,500.
- Movilidad: 310.
- Útiles y limpieza: 330.
- Bolsas y empaque: 380.
- Mantenimiento: 220.
- **Total: 17,750.**

**Bandeja «Por revisar» (6 cosas):**
- 3 facturas que SUNAT ya trae a tu RUC:
  - «Textiles del Norte SAC» por S/ 3,540 (tela; la regla aprendió de 4 veces).
  - «Hidrandina» por S/ 410 (luz de TRU).
  - «Grafinort EIRL» por S/ 650 (etiquetas; nueva, sin regla).
- 2 movimientos del banco sin explicar: Interbank −S/ 180 «COM MANT» y BCP +S/ 1,000 «TRANSF».
- 1 foto de recibo: el taxi de AQP, S/ 18.

**Dinero hoy:**

| Dónde está | S/ |
|---|---|
| BCP | 18,450 |
| Interbank | 9,830 |
| Por depositar Izipay | 2,140 (de lunes y martes) |
| Por depositar Vendemás | 1,310 (llega mañana) |
| Caja fuerte TRU | 6,200 |
| Caja fuerte AQP | 3,900 |
| Cajones (fondo) | 1,000 (500 + 500) |
| **Total que tienes** | **42,830** |

- **Lo que debes:**
  - Proveedores: S/ 14,600 en 3 facturas. Una vence en 4 días: Textiles del Norte, S/ 6,800.
  - Tarjeta de crédito de CAYLA: S/ 2,300.
- **Caja proyectada:**
  - El 30 de octubre pagas sueldos (S/ 25,400) y alquileres de noviembre (S/ 12,500).
  - El 31 de octubre bajas a **S/ 11,200**, por debajo de tu mínimo de S/ 15,000, durante 3 días.
  - Para evitarlo: depositar las cajas fuertes (S/ 10,100) o mover el pago a Textiles del Norte.
- **Conciliación de Interbank:** extracto de 38 movimientos. 34 se cruzaron solos, 3 son sugeridos y 1 no tiene pareja.
- **Faltante de caja del mes:** −S/ 120 en 2 cierres. Ya tiene motivo: un gasto de taxi que no se anotó.

**Reportes:**
- **Estado de resultados de octubre:** las cifras de arriba.
- **Balance simple:**
  - **Tienes S/ 162,330:**
    - Dinero: 42,830.
    - Ropa a costo: 60,800.
    - Máquinas y muebles: 58,700.
  - **Debes S/ 38,480:**
    - Proveedores: 14,600.
    - Tarjeta: 2,300.
    - SUNAT: 9,290.
    - Sueldos por pagar: 12,290.
  - **Es tuyo: S/ 123,850.**
- **Presupuesto de octubre:**

  | Concepto | Meta (S/) | Va en (S/) | Avance |
  |---|---|---|---|
  | Venta (con IGV) | 104,000 | 55,340 | 53 % del mes (y 48 % del tiempo) |
  | Gastos | 41,400 | 20,030 | — |

- **Campañas:**
  - Aniversario (6 al 8 de octubre): vendió 38 % más, dejó S/ 2,100 extra.
  - Halloween (viene, 25 al 31 de octubre): necesita vender 12 % más para pagar su descuento.
- **Escenarios:** «¿Y si Lima vende S/ 900 al día desde el 20?». Son 12 días; Lima agrega ≈ S/ 4,660 (venta ÷ 1.18 × 51 %), pasa de −S/ 3,000 a ≈ +S/ 1,660 y el total del mes sube de ≈ S/ 7,950 a ≈ S/ 12,610.

**Impuestos (septiembre, vence el martes 20 de octubre):**
- IGV de tus ventas: S/ 16,020 (18 % de S/ 89,000).
- IGV de tus compras: S/ 7,620 (lo recuperas).
- **IGV a pagar: S/ 8,400.**
- Pago a cuenta de renta: S/ 890 (1 % de S/ 89,000).
- **Total a SUNAT: S/ 9,290.** «De lo que vendiste en septiembre, S/ 9,290 no es tuyo».
- Detracción pendiente: alquiler de AQP, 10 % (S/ 320), a depositar en el Banco de la Nación.
- **SIRE:**
  - Ventas de septiembre: propuesta aceptada ✓.
  - Compras de septiembre: 3 facturas por completar.
- **Umbral de 300 UIT** (S/ 1.65 millones sin IGV en 2026):
  - Llevas S/ 1.12 millones, el 68 %.
  - Al ritmo del año lo cruzas en diciembre. Ese mes el pago a cuenta sube de 1 % a 1.5 %.
- **Libros:** Diario y Mayor completos. 2025 pasó las 300 UIT: el contador lo confirma.

**Cierre de mes (octubre, se cierra desde el 1 de noviembre):** 8 cosas para cerrar.
- Ventas cuadradas con comprobantes ✓.
- Todas las cajas cerradas ✓.
- Depósitos de tarjeta cruzados ⚠: faltan 2.
- Facturas del mes registradas ⚠: faltan 3.
- Bancos cuadrados: BCP ✓, Interbank ⚠ (1 sin pareja).
- Planilla leída de Dynamic: espera el pago del 30.
- Mermas y conteos ✓.
- Costo estimado: 12 %, informativo y no bloquea.

Al cerrar: el mes **se congela** (no se puede tocar), queda su huella y el contador recibe el paquete: SIRE, Diario y Mayor.

## Archivos

- `index.html`: la galería; desde ahí se llega a todo.
- `base.css`, `base.js`: tokens, piezas y movimiento comunes; el selector A/B/C y el tema.
- `resumen.html` · `gastos.html` · `dinero.html` · `reportes.html` · `impuestos.html` · `cierre.html`: una página por submódulo, cada una con sus tres caminos.

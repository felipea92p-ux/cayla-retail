# Finanzas — examen a fondo (ultra prompt de la investigación)

> Fecha: 2026-10-27 · Pedido por Felipe · Rama `claude/finance-module-analysis-58b56c` sobre `origin/main` `28b9a9d89`
> Skills que lo gobiernan: `/pantalla` (6 dimensiones, 12 tareas), `/rigor` (5 lentes), después `/construir` y `/formidable` (solo con el OK de Felipe al informe).
> Esta fase es **solo lectura**: no se toca código, migraciones ni producción.

## 1 · Qué le duele a Felipe (sus palabras, 2026-10-27)

1. **«No está jalando bien la información, no se conecta con todos los módulos y no me ordena la empresa.»**
2. **Cifras que no cuadran.**
3. **Textos que confunden.**
4. **Diseño dispar** (quiere **replantear el diseño**: 3 maquetas tocables, después del arreglo de cifras).
5. Sospecha concreta: **al depositar el efectivo al banco, la plata se debería mover y no duplicar; supone que se duplica.**
6. Sospecha concreta: **todo producto registrado debe contar como egreso y estar en Existencias en tiempo real.**
7. No sabe dónde está el indicador «Seguro al 55 %» ni para qué sirve: **que se analice, se evalúe y se haga mejor.**

## 2 · Decisiones ya tomadas (no se reabren; se verifica que el código las cumple)

| # | Decisión de Felipe |
|---|---|
| D1 | Alcance: **los 6 submódulos** (Resumen, Gastos, Cuentas y dinero, Reportes ×5, Impuestos, Cierre) + la mesa de mando común (`finanzas/layout.tsx`, sede y mes en la URL) + el dock. |
| D2 | **Una sola fuente por cifra.** Cada cifra se calcula en UN lugar de la base y toda pantalla la lee de ahí; si dos pantallas difieren es un bug, no un criterio. |
| D3 | La empresa se ordena **por sede** primero (AQP, LIM, TRU, Taller, Empresa). |
| D4 | Finanzas jala **solo, sin digitar**, de: Ventas y Caja · Compras y Por pagar · Inventario, costo y Producción · Planilla y SUNAT (Felipe: «revisa todo»). |
| D5 | Usuarios: **Felipe, los líderes principales y alguien de administración.** Encargadas de sede no son usuarias de Finanzas (sí de «registrar gasto» desde Caja, ADR-0491). Prueba ciega de Formidable: **administrativa de tienda**. |
| D6 | Las tres preguntas del Resumen **se quedan**: ¿Cuánto tienes? · ¿Cuánto debes pagar pronto? · ¿Cuánto te deja el mes? |
| D7 | **Depositar efectivo = traslado, no gasto.** Sale de cajón/caja fuerte y entra al banco por el mismo monto; el total de «Cuánto tienes» no cambia. |
| D8 | **Comisión (POS, Yape, depósito) = venta bruta + comisión como gasto.** El banco recibe el neto. |
| D9 | **Mercadería = egreso al recibirla/etiquetarla** (entra a Existencias, sube el stock valorizado y nace la obligación de pago). **Mientras Compras (Diego) no esté terminado: cada prenda etiquetada cuenta como egreso**, marcada «por conciliar con Compras»; al terminar Compras se empareja con la factura. |
| D10 | «Tiempo real» = **al instante al guardar** (el Resumen cambia sin recargar al registrar una venta, compra o gasto). |
| D11 | «Provisional» = **falta data por cargar**, y debe decir qué falta. |
| D12 | Lenguaje: **tienda arriba, contable abajo** (en «¿Por qué?» a un toque aparece el término contable y la cuenta exacta). |
| D13 | Gastos: lo que más importa es **registrar rápido desde la sede**. |
| D14 | Impuestos: **declara un contador externo.** Finanzas entrega cifras limpias y exportables; no declara. |
| D15 | Cierre de mes: **deja cerrar con advertencias** (queda constancia de lo pendiente; se puede reabrir). |
| D16 | Reportes que se usan: Balance y Estado de resultados, Flujo de caja, Presupuesto, Escenarios y Campañas. **Falta el Estado de cambios en el patrimonio neto** (poco usado pero debe existir). |
| D17 | Uso real: **65 % escritorio, 35 % celular.** Finanzas se revisa a 375 px además de 1440 y 1920 px. |
| D18 | Orden de trabajo: **la verdad primero, el diseño después** (1 auditar y arreglar cifras y conexiones → 2 tres maquetas para elegir mirando → 3 construir). Prioridad de la semana: **que «Cuánto tienes» sea verdad.** |
| D19 | Migraciones/RPC: Claude las escribe y prueba en local; **Felipe autoriza antes de pegar en producción** (por partes si hay políticas, ADR-0195). |
| D20 | Producción: se lee **solo con SELECT** (sin escribir). |

## 3 · Hipótesis que hay que confirmar o refutar con evidencia

| # | Hipótesis | Cómo se prueba |
|---|---|---|
| H1 | Un depósito de efectivo al banco **duplica** (cuenta en caja Y en banco) o se pierde. | Rastrear `registrar_movimiento_dinero`, `movimientos_dinero`, el cierre de caja con traslado (ADR-0186), `fn_exigir_efectivo_en_cuenta` (ADR-0412) y la suma de «¿Cuánto tienes?»; escenario con números: caja S/ 1.000 → depositar S/ 600 → total debe seguir en S/ 1.000. |
| H2 | La mercadería etiquetada **no** entra como egreso ni valoriza Existencias en tiempo real; el costo de lo vendido está incompleto. | Seguir `etiquetas` / recepción / `movimientos` (entrada) → `fn_asientos` / `fn_estado_resultados` / valor de stock; qué lee Finanzas hoy de Compras vs de Existencias. |
| H3 | La misma cifra sale distinta en Resumen, Reportes, Cierre, Impuestos, Caja, Ventas y Análisis. | Mapa «cifra → función de base → pantallas que la leen» y diferencias entre las funciones que la recalculan. |
| H4 | «¿Cuánto debes pagar pronto?» (S/ 30.062 «planilla») **solo cuenta planilla** y omite facturas de proveedor, alquileres, impuestos y otros vencimientos. | `fn_resumen_finanzas`, `fn_deuda_visible`, por-pagar; qué se suma a «Vence pronto». |
| H5 | «Cuánto te deja octubre» (S/ 13.327) está inflado: la propia pantalla dice que **falta costo de lo vendido y con cuánto empezaste**. | `fn_estado_resultados`, margen, saldos de arranque, `inicio_finanzas` (ADR-0332). |
| H6 | La proyección de caja (S/ 98.721 → S/ 121.497 en 14 días) es optimista o mezcla cuentas distintas. | `fn_flujo_*`, `CajaProxima`, tratamiento de IGV (ADR-0433), planilla de Dynamic, cobros esperados. |
| H7 | «Seguro al 55 %» (`Confianza.tsx`, `fn_finanzas_confianza`) no está calibrado ni explica qué falta, y no se sabe dónde vive. | Qué mide, de qué se compone el 55, si «6 cosas por revisar» lleva a la acción; propuesta de reemplazo. |
| H8 | Finanzas no desagrega por sede de forma consistente (Taller y «Empresa» como sedes; gastos repartidos; ventas por sede). | `fn_ve_finanzas_de_todo`, parámetro `sede`, reparto de comprobantes (ADR-0139). |
| H9 | Falta el Estado de cambios en el patrimonio neto. | Buscar en reportes y funciones; qué datos ya existen para armarlo (capital, resultados acumulados, aportes, retiros). |
| H10 | Varias pantallas no sirven a 375 px (35 % del uso). | Leer clases `fin-*`, `finanzas.css`, tablas anchas, dock; medir en navegador cuando se pueda. |
| H11 | Hay textos con jerga mezclada y piezas dibujadas a mano fuera del sistema «una función, una pieza». | Revisar copy de cada pantalla contra «tienda arriba, contable abajo» y `unificar/`. |
| H12 | Hay conexiones aguas arriba rotas o a medias: Ventas/Caja → asientos, Compras → por pagar, Producción → costo, Planilla Dynamic → gasto, SUNAT → IGV. | Trazar cada flujo de punta a punta con una venta/compra/orden/planilla de ejemplo. |

## 4 · Método (obligatorio en cada agente)

**Solo lectura.** Nadie escribe en el repo, ni migra, ni toca producción. Cada agente escribe su informe completo en `$SCRATCH/finanzas/<área>.md` (ruta del scratchpad de la sesión) y devuelve al chat un resumen ≤ 350 palabras.

**Las seis dimensiones de `/pantalla`, cada una 0–10**, con etiqueta de evidencia en cada afirmación: `[visto]` · `[código archivo:línea]` · `[producción]` · `[inferido]` · `[no verificable]`. Nunca mezclar lo visto con lo supuesto: estética · lógica de negocio · arquitectura · funciones (existen / fantasma / faltan / sobran) · utilidad para persona sin contexto · conexión con el ERP.

**Las cinco lentes de `/rigor`**, solo las que cambien la decisión:
1. Conjuntos/álgebra relacional (¿un `JOIN`/`EXCEPT` reemplaza `OR`/`NOT IN` anidados? ¿la RLS ya filtra?).
2. Complejidad (volumen real de CAYLA: 3 tiendas + 1 taller; ¿`.find()` dentro de `.map()`?).
3. Vectorización (series: ¿una sola pasada agregada?).
4. Estadística (poca muestra → contracción; dinero con `numeric`, redondeo una sola vez al final).
5. Resiliencia (SUNAT/Lucode/apis.net.pe: «se degrada así, no pierde este dato»).

**Rigor contable mínimo (el que Felipe necesita ya):** toda cifra que se muestre debe poder responder cuatro preguntas — ¿de qué tabla sale?, ¿qué pantallas más la leen?, ¿qué pasa con un traslado entre cuentas (no cambia el total)?, ¿qué pasa si falta un dato (se muestra «Provisional» con el motivo, nunca un número que parezca firme)?

**Gravedad (de `/chaos`):** 1 = estado imposible (dinero/inventario/comprobante que no cuadra) · 2 = dato malo en silencio · 3 = pantalla caída · 4 = error feo pero seguro. Un rechazo claro sin nada escrito no es hallazgo.

**Consultas a producción:** el agente **no** consulta producción. Deja en su informe, bajo «SELECT para producción», cada consulta de solo lectura que necesita (con `retail.` en cada tabla) y la conclusión que habilita; el arquitecto principal las corre.

**Privacidad:** ningún nombre, DNI, teléfono ni monto atado a una persona en los informes (`[colaborador]`, `[cliente]`).

**Formato de cada hallazgo:** `ID · gravedad · título` → dónde (`archivo:línea`, tabla o RPC) · evidencia con etiqueta · qué pasa hoy (con números de ejemplo cuando sea una cifra) · qué debería pasar según D1–D20 · cómo lo verifica Felipe (algo observable, no «compila») · esfuerzo S/M/L · dependencias.

## 5 · Reparto de agentes (uno por área + transversales)

| Agente | Área y archivos de partida |
|---|---|
| A1 Resumen | `app/(app)/finanzas/resumen/`, `ResumenFinanzas`, `RecorridoPlata`, `ResumenDecidir`, `TresRespuestas`, `Confianza`, `CajaProxima`, `lib/resumen-*`, `finanzas-te-toca-reglas`, `fn_resumen_finanzas`, `fn_finanzas_confianza`. H4, H5, H6, H7. |
| A2 Gastos | `finanzas/gastos/`, `components/finanzas/gastos/`, `lib/gastos*`, fijos del mes, viaje, reparto entre sedes (ADR-0139), gasto rápido, Caja sin Finanzas (ADR-0491). D13. |
| A3 Cuentas y dinero | `finanzas/dinero/*` (efectivo, conciliación, por pagar), `CuentasDinero`, `lib/cuentas-dinero*`, `movimientos_dinero`, depósitos, caja fuerte, cierre de caja con traslado (ADR-0186), `fn_exigir_efectivo_en_cuenta`. **H1, la prioridad #1.** |
| A4 Reportes | `finanzas/reportes/*` (balance, flujo, presupuesto, escenarios, campañas), `EstadoResultadosPanel`, `BalancePanel`, `fn_estado_resultados`, `fn_flujo_*`. H9: Estado de cambios en el patrimonio neto. |
| A5 Impuestos y Cierre | `finanzas/impuestos/`, `finanzas/cierre/`, IGV, balanza, sobres, «antes de declarar», `fn_cierre_mes_estado`, mes cerrado (ADR-0433), saldo de IGV al arrancar. D14, D15. |
| A6 Aguas arriba: Ventas, Caja, SUNAT | `registrar_venta`, `venta_pagos`, redondeo (ADR-0311), medios de pago y tarifa de máquina, comprobantes y `fn_asientos` de ventas, IGV de ventas. H12, D8. |
| A7 Aguas arriba: Compras, Inventario, Producción, Planilla | Etiquetado/recepción → egreso (H2, D9), Existencias en tiempo real, costo de lo vendido, insumos del Taller, planilla de Dynamic, por pagar de proveedores. H2, H12. |
| A8 Mapa de fuentes de cada cifra | Inventario de **toda cifra** que muestra Finanzas → función de base → pantallas que la leen; duplicados y diferencias. H3, D2. |
| A9 Experiencia y diseño | Copy de todas las pantallas (D12), jerga, accesibilidad, 375 px (H10, D17), piezas fuera del sistema (`unificar`), ley por ley de Formidable, insumos para las 3 maquetas. H10, H11, H8 (lectura por sede en pantalla). |
| Escéptico (fase 2) | Recibe todos los informes y refuta: reproduce con números o descarta cada hallazgo de gravedad 1–2. |

## 6 · Entregables y fases

1. **Fase 1 · Investigación (esta).** Informes por área → consultas SELECT corridas por el arquitecto → escéptico → **informe maestro** `docs/pantallas/finanzas-modulo.md` con: veredicto, los dos puntajes de `/pantalla`, hallazgos rankeados (gravedad 1 primero), **12 tareas** con DECIDÍ / DESCARTÉ / SE ROMPE SI en las estructurales, «Lo que está bien y no se toca», «Fuera de esta pantalla», «Estrategia alternativa» (Ganas/Pagas) y líneas propuestas para el backlog.
2. **Fase 2 · Verdad** (`/construir`, con el OK de Felipe): arreglar cifras y conexiones, una causa raíz por actividad, prueba de regresión que falla primero, migraciones con el OK de Felipe, empezando por **H1 («Cuánto tienes» sea verdad)**.
3. **Fase 3 · Replanteo del diseño** (`/formidable`): **3 maquetas tocables** (sobria, intermedia, atrevida) en `docs/maquetas/finanzas-replanteo-2026-10/`; Felipe elige mirando; después se construye. A 1440, 1920 y **375 px**.
4. **Avance:** cada actualización lleva `Avance: NN/100` y qué falta.

## 7 · Límites y candados

- No tocar `registrar_venta`, `fn_asientos`, `fn_flujo_*`, `fn_estado_resultados`, `fn_cierre_mes_estado`, `anular_venta`, `fn_impuestos_igv_meses` ni el alcance `fn_es_lider` / `fn_ve_finanzas_de_todo` sin avisar (sesiones previas de ADR-0433). Parchear por ancla; el texto vivo no es el del archivo.
- Dinero, stock, permisos, RPC, migraciones y SUNAT: siempre decide Felipe.
- Un hallazgo de seguridad o permisos **no** se escribe en un archivo versionado (el repo es público); va solo al chat.
- Hay un «congelamiento de código del mié 28-oct 18:00 al lun 2-nov 12:00» citado en `docs/pantallas/finanzas-resumen.md`; no está en ningún otro documento. **Confirmar con Felipe antes de cualquier push.**

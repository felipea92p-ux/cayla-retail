# 05 · Costeo, medición y lo que el dueño decide con una orden cerrada

**Frente 5 · 2026-10-16 · solo lectura.** Base: `cayla-dynamic`, schema `retail` y `public`, solo `SELECT`, consultada el 2026-10-16 (evidencia **A**). Hipótesis que ataca este frente: **H1, H4, H6, H8**. Las cifras de CAYLA van como conteos y proporciones, nunca como montos ni tarifas (el repo es público).

**Límite de este frente, dicho de entrada:** el límite de búsquedas web de la sesión se agotó a mitad del trabajo (es compartido entre todos los agentes). Lo que quedó sin buscar está en «Lo que no encontré». Varias fuentes peruanas se leyeron completas (SUNAT, tesis, revista UNMSM); otras no se pudieron abrir y están marcadas en «Fuentes».

## Veredicto (léelo primero)

1. **No hay un solo dato real de costo, desvío ni plazo.** `producciones` tiene 0 filas. Todo lo que sigue dice *qué medir y cómo se lee*, no *cuánto sale*.
2. **El costo que el sistema calcula por orden es un solo número para toda la orden:** (tela + avíos + servicios) ÷ prendas buenas, igual para la XS y la XL y para el color caro y el barato. Deja fuera la costura hecha adentro y reparte entre las buenas todo lo que se perdió (H-5.3).
3. **Las personas del Taller figuran pagadas por tiempo, no por pieza** (Dynamic, H-5.8). Eso favorece a H1 para el *pago*, pero deja sin dato el costo de mano de obra por orden: ese costo pide *horas por orden*, y «Terminé N de M» no las da.
4. **«Merma menor al 3 %» mezcla tres cosas distintas** (tela que sobra en el corte, prendas que se pierden o salen de segunda, prendas que se arreglan). En tela, ninguna fuente que abrí se acerca a 3 %; en prendas perdidas, el 3 % es lo que una fuente de fábrica llama «muy bueno», no lo normal (H-5.17 a H-5.19).
5. **Las cuatro hipótesis salen «matiza»**, ninguna «contradice»: lo decidido aguanta en su dirección, pero dos de sus razones («10 operarias», «lo declarado por Audaces es el consumo») no tienen respaldo (sección 9).
6. **El Taller de las cifras se está achicando:** planilla pagada de 6 → 5 → 3 personas en tres períodos seguidos, y la lectura de planilla que usa Eficiencia oculta cualquier grupo de menos de 3 (H-5.11). Con 2 personas, la cifra de «conversión» desaparece sola.

---

## 1 · Cómo se calcula el costo de una prenda y cómo lo hace CAYLA

### Lo que dice la práctica y las normas

| Pieza del costo | Qué hace la práctica (fuente) | Qué hace CAYLA hoy / ADR-0400 | Hueco |
|---|---|---|---|
| Tela | Rendimiento × precio + holgura de desperdicio; es entre la mitad y siete décimas del costo (C, H-5.13) | Tela usada por lote (PEPS) del libro de insumos; promedio ponderado al entrar al stock (ADR-0067) | Ninguno de fondo; depende de que alguien anote la tela usada |
| Avíos | Aparte de la tela | Igual que la tela | Se descuentan por lote o por prenda: pendiente (Frente 3) |
| Mano de obra propia | Horas × costo hora, asignada a la orden por horas dedicadas (B, H-5.10); parte del «costo de conversión» (B, H-5.5) | **Fuera del costo de la prenda** (D-31); aparece solo como «conversión» mensual en Eficiencia | Dos prendas iguales cuestan distinto según dónde se cosieron (H-5.3) |
| Servicio de afuera | Precio por prenda más cargos fijos y mínimos (C, H-5.12) | Devengado = buenas recibidas × tarifa + fijo, congelado al abrir (ADR-0400 d.5) | La factura puede no coincidir con lo devengado si el servicio cobra lo enviado |
| Indirectos | Alquiler, luz, depreciación, repartidos por horas (B, H-5.10) | Gastos del Taller en Eficiencia; hoy 0 gastos cargados al Taller (A) | Sin gastos del Taller, «conversión» = solo planilla |
| Mermas y segundas | Lo normal entra al costo; lo anormal va a gasto (B, H-5.5) | Todo el costo se divide entre las buenas (A, H-5.3) | No hay criterio de «normal»; es del contador |
| Estándar contra real | Estándar alcanzable, revisado; se explica solo lo que sale del rango (B, H-5.16 y H-5.22) | Consumo declarado + lo medido lo corrige (d.6); sobrecorte hasta 10 % (d.7) | No hay rango de «normal» escrito |
| En proceso a fin de mes | Suma de las hojas de costo de las órdenes abiertas (B, H-5.7) | Sin regla (hueco ya marcado por el Frente 0) | Pregunta para el contador |

**Contraste de práctica.** Las tres micro y pequeñas empresas de confección de Arequipa que estudia una tesis calculan el costo «al tanteo», no registran los insumos y dejan fuera parte de la mano de obra y de los indirectos (H-5.1). CAYLA ya está por encima de esa práctica; el hueco que le queda es la costura propia.

### Hallazgos

H-5.1 · Las micro y pequeñas empresas de confección que estudia una tesis peruana costean al tanteo y omiten mano de obra e indirectos.
  Evidencia: B · tesis de contabilidad, Universidad Peruana Unión, «Diseño de un sistema de costos por órdenes específicas para micro y pequeñas empresas del sector confección, Arequipa 2021», diagnóstico en tres empresas (pdftotext del PDF, secciones 1 y 4.1) · consultada 2026-10-16
  Confianza: media (tres empresas, una ciudad, tesis de pregrado) · Aplica a: taller de ~10 operarias (y menores)
  Lo contradiría: un estudio con muestra grande de talleres de Lima que muestre costeo completo
  Implicación: ADR-0400 d.5 y D-81: el costo por orden que arma CAYLA ya supera la práctica común; lo que falta es la mano de obra propia (C6 del Frente 0).

H-5.2 · En el único pedido costeado a fondo en esa tesis, la tela y los avíos pesan cerca de siete décimas del costo, la mano de obra cerca de tres y los indirectos casi nada.
  Evidencia: B · misma tesis, hoja de costos de un pedido de 100 prendas de ropa de seguridad industrial: materiales 69 %, mano de obra 28 %, indirectos 3 % (cálculo mío sobre sus Tablas 6 a 9) · consultada 2026-10-16
  Confianza: baja (un solo pedido, ropa de trabajo, no moda) · Aplica a: taller pequeño
  Lo contradiría: una orden de CAYLA con costura propia medida por horas
  Implicación: dejar la costura propia fuera del costo (D-31) esconde cerca de un cuarto del costo en un caso comparable; cuánto es en CAYLA no se sabe hasta medir horas.

H-5.3 · El costo que el sistema calcula es uno por orden, sin costura propia, y todo lo perdido lo pagan las buenas.
  Evidencia: A · `supabase/migrations/20260915130000_produccion_del_taller.sql:93-94` (`costo_unitario = (costo_tela + costo_avios + costo_maquila) ÷ coalesce(cantidad_buenas, cantidad_plan)`) y, en la rama del rediseño, `20261014160000_produccion_cierre_al_stock_y_costos_del_taller.sql:186 y 248` (ese único valor se aplica a cada variante que entra) · consultada 2026-10-16
  Confianza: alta · Aplica a: ambos
  Lo contradiría: una versión posterior de `cerrar_produccion` que reparta por variante
  Implicación: R-27 («la XL deja menos y hoy es invisible») sigue sin resolverse en lo construido; ADR-0400 act. (d) («el costo se reparte entre las buenas») es exactamente lo que la norma contable trata distinto si la pérdida es anormal (H-5.5).

H-5.4 · El costo que hoy tienen las prendas no nace de producción: ninguna fila del historial de costos viene de un cierre de producción.
  Evidencia: A · `retail.variantes`: 1.884 activas, todas con costo mayor que cero; `retail.costo_historial`: 24 filas, todas de compra, 0 de producción; marca CAYLA: 201 variantes activas, 131 con stock en la red, 7 con costo mayor que el precio · consulta SELECT 2026-10-16. Promedio ponderado: `supabase/migrations/20260916090000_costo_promedio_ponderado.sql:132-138` (usa el stock de toda la red y el costo vigente)
  Confianza: alta · Aplica a: ambos
  Lo contradiría: que el costo cargado sea un costo real de lote sin registrar
  Implicación: el primer cierre de una orden de un modelo con stock se mezclará con un costo de origen no documentado (ADR-0067); de dónde sale ese costo es pregunta abierta (huecos del Frente 0).

H-5.5 · La norma contable de inventarios pide incluir mano de obra directa y una parte de los indirectos en el costo, repartir los fijos según la capacidad normal y sacar a gasto el desperdicio anormal.
  Evidencia: B · IFRS Foundation, página de IAS 2 (costos de compra y de conversión: mano de obra directa y gastos generales de producción; medición al menor entre costo y valor neto realizable); y la NICSP 12 que publica el MEF, que sigue a la NIC 2, párrafos 20, 21, 25(a) y 30 (conversión, capacidad normal, desperdicio anormal excluido, costo estándar aceptable si se aproxima al costo). El PDF de la NIC 2 en el MEF dio 404, por eso leí la NICSP 12 · consultada 2026-10-16
  Confianza: alta en el principio; media en la numeración exacta de la NIC 2 · Aplica a: ambos
  Lo contradiría: que CAYLA use un marco para pequeñas entidades con otra redacción (la idea es la misma; se pregunta al contador cuál usa)
  Implicación: «conversión por prenda» de Eficiencia en meses con poca producción engorda sola; y repartir entre las buenas lo perdido por descuido contradice el trato de la norma (decide el contador).

H-5.6 · La merma tiene definición tributaria y se acredita con un informe técnico independiente cuando SUNAT lo pide.
  Evidencia: B · SUNAT, Informe 000094-2023-SUNAT/7T0000 (17-ago-2023): merma = pérdida física en volumen, peso o cantidad por causas inherentes a la naturaleza de la existencia o al proceso productivo; el contribuyente debe acreditarla con un informe técnico de un profesional independiente, competente y colegiado (o del organismo técnico competente) con la metodología y las pruebas; sin eso no se admite la deducción · consultada 2026-10-16
  Confianza: alta · Aplica a: ambos
  Lo contradiría: una norma o informe posterior que cambie el requisito
  Implicación: la cifra «< 3 %» de R-31 es una estimación de gestión sin valor tributario; un faltante en un servicio no es obviamente «merma» (inferencia mía, E) → pregunta para el contador.

H-5.7 · En el costeo por órdenes, lo que no se terminó a fin de mes es la suma de las hojas de costo abiertas y pasa al mes siguiente.
  Evidencia: B · OpenStax, *Principles of Managerial Accounting*, cap. 4.3 (el trabajo en proceso es el total de los trabajos sin terminar; al terminar, su costo pasa a terminados); y SUNAT, Informe 094-2023, que recuerda que para la NIC 2 son existencias los bienes en proceso de producción · consultadas 2026-10-16
  Confianza: alta en el principio · Aplica a: ambos
  Lo contradiría: que el contador de CAYLA prefiera no valorar lo en proceso (algo común en negocios pequeños; no encontré dato)
  Implicación: el hueco del Frente 0 (qué hacer a fin de mes con lo en proceso) es una pregunta de criterio contable, no técnica.

---

## 2 · Cómo se paga a las personas del Taller y qué pasa con el dato (H1, H4)

### Qué muestra la base

Dynamic guarda 6 registros con función `taller_produccion`, todos con la marca «sueldo fijo» en falso. Según el comentario de esa columna en la base, «sueldo fijo» en verdadero es quien cobra completo aunque no marque (socios, dirección) y no se mide por horas; en falso, el pago se calcula por horas y se mide la asistencia. La planilla pagada del Taller trae horas del mes y días trabajados en las 14 filas de los tres períodos, con sobretiempo en pocas filas y bonos en cerca de la mitad (el Frente 10 generalizó estos conteos porque el grupo es de pocas personas). No hay ninguna columna de piezas ni de destajo, y la tabla de tarifas por hora tiene 0 filas.

H-5.8 · Las personas del Taller figuran pagadas por tiempo (horas y días), sin ningún dato de piezas.
  Evidencia: A · `public.personas` (`sueldo_fijo` = false en las 6 con función `taller_produccion`; comentario de la columna), `public.v_planilla_pagada` (14 filas del Taller con `horas_mes` y `dias_trabajados`; `bonos` > 0 en cerca de la mitad; `monto_sobretiempo` > 0 en pocas; sin columna de piezas), `public.tarifas_hora` (0 filas) · SELECT 2026-10-16
  Confianza: alta sobre lo que guarda Dynamic; media sobre cómo se paga en la realidad (puede haber pagos fuera de planilla) · Aplica a: taller de ~10 operarias
  Lo contradiría: que parte de la costura se pague por pieza fuera de planilla, o que los bonos sean por producción
  Implicación: H1: si el pago es por tiempo, anotar por fase basta para el *pago*; pero el costo de mano de obra por orden pide horas por orden.

H-5.9 · En fábricas de exportación de cinco países, la mayoría de las costureras cobra por hora en cuatro de ellos, y solo el pago mixto (base más incentivo sobre un umbral) mostró efectos negativos.
  Evidencia: B · OIT-IFC Better Work, Documento de discusión 28 (Borino, dic-2018): unos 6.000 trabajadores de Vietnam, Indonesia, Jordania, Haití y Nicaragua. Según su tabla 3, cobran algo por pieza: 32 % en Vietnam, 4 % en Indonesia, 15 % en Jordania, 33 % en Nicaragua y 83 % en Haití (en Haití imputado desde el cuestionario de la empresa); solo por pieza: 21, 3, 7, 13 y 58 %; mixto: 11, 1, 8, 20 y 26 %. El pago por pieza es más frecuente entre costureras y menos entre supervisión y control de calidad. El pago *totalmente* por pieza no mostró efectos negativos y el *parcial* sí (salud, miedo a accidentes y abuso). Cita a Edwards (1979): sin saber qué tan rápido se hace un trabajo no se fija bien la tarifa. Avisa que las fábricas de Better Work no representan a cada país. PDF leído con `pdftotext`; nota de prensa de apoyo: Just Style, 4-ene-2019 (C) · consultada 2026-10-16
  Confianza: alta en lo que mide; **baja para CAYLA** (ningún país es Perú; fábricas de exportación) · Aplica a: planta grande
  Lo contradiría: datos de talleres limeños de ~10 personas
  Implicación: H1 y H4: en esa muestra el pago por tiempo es lo más común, lo que no contradice a Dynamic; no hay evidencia de que un taller peruano de ~10 pague por pieza, y si algún día se agrega un bono por producción a una base por horas (lo «parcial»), el registro por persona se vuelve sensible.

H-5.10 · En un taller pequeño que paga por tiempo, la mano de obra se asigna a cada orden por las horas dedicadas, no por las piezas.
  Evidencia: B · tesis de Arequipa 2021 (arriba), secciones 4.4.3 a 4.4.6: la mano de obra se toma de la planilla y se reparte entre órdenes según las horas que cada una ocupó; las micro no tienen planilla y las pequeñas sí, y en algunos casos trabajan a destajo, según su diagnóstico · consultada 2026-10-16
  Confianza: media · Aplica a: taller de ~10 operarias
  Lo contradiría: un taller que pague por pieza y por tanto reparta por piezas
  Implicación: H1: para costear la costura propia por orden hace falta un dato que la granularidad A no recoge (horas por orden); sin él, solo hay el costo mensual por prenda de Eficiencia.

H-5.11 · La cifra de «conversión» de Eficiencia depende de que el Taller tenga al menos 3 personas en planilla, y hoy tiene exactamente 3.
  Evidencia: A · `supabase/migrations/20260921160000_planilla_por_sede.sql:13 y 52` (`having count(distinct persona_id) >= 3`); `retail.planilla_por_sede` en producción: Taller con 6, 5 y 3 personas en los períodos 28-jun a 28-jul, 29-jul a 28-ago, 29-ago a 27-sep · SELECT 2026-10-16
  Confianza: alta · Aplica a: taller de ~10 operarias
  Lo contradiría: que la planilla del Taller vuelva a crecer
  Implicación: la «conversión por prenda» (y, con ella, comparar el Taller contra un servicio) se apaga con una salida más; y es una señal más de que «10 operarias» (d.1) no describe el Taller de hoy (C7).

H-5.12 · En las cotizaciones de costura y confección el precio por prenda sube mucho al bajar la tirada, y vienen con mínimos y cargos fijos aparte.
  Evidencia: C · MakersRow, «What Is the Cost of Manufacturing Clothes in a Quote? (2026)», 1-ago-2026: precio por unidad más cargos únicos de patrón y muestra más cantidad mínima; un ejemplo pasa de unos 18 a unos 28 dólares por prenda al bajar de 300 a 100 unidades (EE. UU.). Y Apparel Resources (C) define el costo de mano de obra por minuto (costo mensual ÷ operarias × minutos de trabajo) para cotizar con minutos estándar: la costura también se cotiza por tiempo, no solo por prenda · consultada 2026-10-16
  Confianza: media-baja (una sola fuente C, mercado de EE. UU.; coincide con lo que dijo Felipe de los mínimos de 150 y 240, D) · Aplica a: ambos
  Lo contradiría: tarifas de Lima que no varíen con la tirada
  Implicación: H4: el esquema «por prenda + mínimo + fijo opcional» tiene el mismo cuerpo que una cotización de uso común; también implica que comparar el costo por prenda de dos órdenes de tamaño distinto es engañoso.

### Cómo se lee todo esto para H1 y H4

- **Si cobran por tiempo (lo que muestra Dynamic):** la mano de obra es un costo fijo del mes. Asignarla a una orden es un reparto, no una causa. La norma (H-5.5) dice cómo repartir fijos: por capacidad normal, sin inflar el costo cuando se produjo poco.
- **Si cobraran por pieza:** la mano de obra pasa a ser variable por prenda y *sí* se necesita saber quién hizo cuántas (es su sueldo). Ese día el dato por persona o por bulto deja de ser opcional. Ese escenario existe en la literatura (H-5.9, sobre todo en Haití), pero no hay evidencia de que sea el caso de CAYLA.
- **Si es mixto con bono:** la fuente más fuerte (H-5.9) dice que es el esquema con más problemas. En Dynamic, cerca de la mitad de las filas del Taller traen bonos y no se sabe por qué (pregunta 1).

---

## 3 · La tela: lo declarado, lo medido y el desvío (H6)

H-5.13 · La tela es la parte más grande del costo de una prenda, entre la mitad y siete décimas.
  Evidencia: C · WavePLM, «Garment Costing: A Complete Guide…», 11-may-2026 (mitad a siete décimas; advierte que usar números redondos en vez de consumo medido puede subir el costo de tela entre 15 y 20 % sobre lo presupuestado); Apparel Resources, «Performance measurement tools 3 – cutting & production planning» (50 a 80 %); más el caso de H-5.2 (69 %, B) · consultadas 2026-10-16
  Confianza: media (tres fuentes distintas dicen lo mismo, dos son blogs/revistas del oficio) · Aplica a: ambos
  Lo contradiría: prendas de mucha mano de obra (bordado, trabajo fino) donde la tela pese poco
  Implicación: H6: de todo lo que se puede medir, el consumo de tela es lo que más mueve el costo; la métrica 2 va segunda por eso.

H-5.14 · El consumo de una marcada es una estimación que deja fuera las puntas y el desperdicio de fin de tendido; el consumo logrado se mide con la tela entregada al corte entre las prendas cortadas.
  Evidencia: C · Apparel Resources (artículo de arriba): el «consumo marcado» excluye pérdidas de final de tendido y puntas; el «consumo logrado» en la sala de corte = tela entregada a corte ÷ prendas cortadas, y en la fábrica = tela comprada ÷ prendas enviadas. Para Audaces: página comercial de Audaces (marcador), C: el reporte entrega consumo estimado, rendimientos y porcentaje de desperdicio; **no dice** si el consumo incluye pérdidas de final de tendido · consultadas 2026-10-16
  Confianza: media-baja (una sola fuente C para la definición; formato real de Audaces sin ver, visita A0 pendiente) · Aplica a: ambos
  Lo contradiría: un reporte real de Audaces del Taller que ya incluya esas pérdidas
  Implicación: H6 / ADR-0400 d.6: lo que se escriba «de Audaces» probablemente es un piso, no el consumo real; que lo medido lo corrija es la dirección correcta.

H-5.15 · En una empresa limeña de tejido de punto el aprovechamiento de la tela en el corte medido fue de 65 a 70 %, y el resto se desecha o se vende por kilo.
  Evidencia: B · Camborda Palacios, G. (2023), «Mejora en los procesos de tizado y corte en una empresa de tejido de punto», *Industrial Data* 26(2), UNMSM (PDF leído): 65 % de aprovechamiento en invierno y 70 % en verano en un cliente de alto volumen (jersey 50/1 pima); 35 % y 30 % de sobrante de tela · consultada 2026-10-16
  Confianza: alta para ese caso; baja para un taller de ~10 · Aplica a: planta grande (tejido de punto, volúmenes de exportación)
  Lo contradiría: un taller que cuenta el sobrante como retazo aprovechable (moños, detalles); R-28 dice que se bota
  Implicación: H8 (en tela) y R-28: el «aprovechamiento» de la marcada no es una merma de 3 %; si `insumos.merma_pct` se llena con una cifra de merma, que no se confunda con el rendimiento.

H-5.16 · Un estándar es un precio esperado por una cantidad esperada, se prefiere uno alcanzable a uno ideal, y se revisa porque envejece.
  Evidencia: B · OpenStax, cap. 8.1 (estándar = precio esperado × cantidad esperada; ideal desmotiva, alcanzable se prefiere; los estándares se vuelven poco fiables durante el año) y cap. 8.2 (variación de cantidad = (cantidad real − estándar) × precio estándar; causas: descuido o desperdicio en producción, mala estimación del estándar, personas sin experiencia) · consultadas 2026-10-16
  Confianza: alta · Aplica a: ambos
  Lo contradiría: —
  Implicación: H6: «lo de Audaces» se parece a un estándar ideal; una sola orden medida puede ser ruido o cambio real, y esta diferencia no se distingue con n = 1 (inferencia mía, E).

### Cómo se lee todo esto para H6

- **Lo declarado es un piso.** La estimación de la marcada deja fuera pérdidas que sí se gastan (H-5.14).
- **Lo medido corrige en la dirección correcta**, pero la primera orden de un modelo (tela nueva, servicio nuevo, otro tono) es la peor para fijar un estándar (H-5.16). Qué hacer con una sola medición no está dicho en ADR-0400: la act. (i) incluso deja que quien edita el catálogo pise lo medido (C2 del Frente 0).
- **No hay dato público de la distancia entre marcada y consumo logrado para talleres pequeños de Lima.** Lo que sí hay son dos aprovechamientos de marcada altos en pérdida (H-5.15 y H-5.17), que Audaces ya recoge dentro de su reporte. El desvío *entre* ambos hay que medirlo en el Taller.

---

## 4 · Lo que se pierde entre el corte y la tienda (H8)

R-31 dice «entre el corte y la prenda vendible se pierde menos del 3 %». En la práctica son **tres cosas con costos distintos** y el 3 % solo tiene sentido para una de ellas:

| Pérdida | Qué es | Cómo la ve el sistema hoy | Fuentes |
|---|---|---|---|
| **Tela** que sobra en el corte | Lo que no entra en la marcada, puntas, empalmes | Un porcentaje `merma_pct` por insumo que ADR-0400 suma al plan de tela; hoy `insumos` tiene 0 filas, así que ninguna está cargada (A); el retazo se bota (R-28) | 65–70 % de aprovechamiento (H-5.15); 20 % de merma de tela en corte (H-5.17) |
| **Prendas perdidas** | No salen como primera: segundas, rechazadas, faltantes | En Vuelta: segundas y faltantes con motivo; en las fases internas solo se anotan las buenas | Cut-to-ship de ~98 % «muy bueno», 92 % en un ejemplo (H-5.18) |
| **Prendas arregladas** | Salen buenas después de un reproceso: cuestan horas y a veces tela | No se anotan | 58 % de reproceso en un caso de abrigos (H-5.17) |

H-5.17 · En una empresa arequipeña de abrigos de alpaca se midió 20 % de merma de tela en el corte, 58 % de prendas reprocesadas, una eficiencia global de 67 % y 4 de cada 10 contratos entregados fuera de plazo.
  Evidencia: B · tesis de Ingeniería Industrial, Universidad Católica de Santa María, «Propuesta de mejora del proceso de confección de abrigos de tejido plano… Arequipa 2019» (2021) (PDF leído: resumen, tablas 9 a 14 y diagnóstico) · consultada 2026-10-16
  Confianza: media (una empresa, prenda de forro y alpaca, con horas extra altas) · Aplica a: planta mediana
  Lo contradiría: un taller de prenda simple (polo, blusa) con reproceso bajo
  Implicación: H8: contraejemplo claro al «menos de 3 %» *si* la palabra incluye tela y reproceso; para prendas realmente perdidas la tesis no da el dato.

H-5.18 · Un cut-to-ship (prendas enviadas ÷ prendas cortadas) de ~98 % se considera «muy bueno» en la literatura del oficio; el 3 % de R-31 es ese nivel.
  Evidencia: C · Apparel Resources (artículo citado): cut-to-ship = enviadas ÷ cortadas × 100, 98 % muy bueno, ejemplo de 92 % · consultada 2026-10-16
  Confianza: media-baja (una fuente C, fábricas de exportación) · Aplica a: planta grande
  Lo contradiría: un taller con prendas simples y buen control que pierda menos del 2 %
  Implicación: H8: 3 % es el piso de la excelencia, no el punto de partida de un modelo nuevo; no hay base para fijarlo como tolerancia sin medir.

H-5.19 · No encontré una cifra pública y representativa del porcentaje de prendas falladas en talleres pequeños.
  Evidencia: E (resultado negativo de mi búsqueda) con C como apoyo · el buscador solo devolvió casos sueltos de una fábrica de exportación en Etiopía (unas 20 unidades defectuosas por cada 100 antes de una mejora) y de una presentación de estudiantes (unas 14); ninguno es una media del oficio y **no abrí ninguno de los dos documentos**, solo vi el resumen del buscador · consultados 2026-10-16
  Confianza: baja · Aplica a: planta grande
  Lo contradiría: una encuesta sectorial peruana o un informe de un programa de la OIT con líneas base
  Implicación: H8 queda sin evidencia externa en prendas perdidas: solo las primeras órdenes del Taller pueden decir el número.

### Cómo se lee todo esto para H8

- **En tela, el 3 % queda contradicho** por las dos fuentes peruanas que abrí.
- **En prendas perdidas, no se puede confirmar ni refutar** con datos públicos; el 3 % es el nivel «muy bueno» de una fuente.
- **Lo que lo hace cumplir o no depende de qué cuente como pérdida**: si arreglar una prenda no cuenta, el 3 % puede cumplirse con 40 % de reproceso. Eso cuesta horas de la gente del Taller y hoy no se anota (pregunta 4).
- **Tributariamente** una merma acreditable pide informe técnico independiente (H-5.6); un faltante en un servicio no es la misma figura.

---

## 5 · Qué mira el dueño y qué recomiendan los consultores

**Lo que recomienda la literatura del oficio medir** (C y B): eficiencia de línea, defectos por cada cien (DHU), entrega a tiempo, cut-to-ship, consumo logrado, costo por minuto, utilización de capacidad, plazo de entrega, horas extra (Apparel Resources); y, en los programas de la OIT para pequeñas empresas de confección: productividad, defectos al final de línea, ausentismo, rotación y costos (H-5.21).

**Lo que mira un taller de ~10 personas:** no hay estudio público que lo diga. Lo más cercano es la tesis de Arequipa (H-5.1): costean por pedido, compran la tela por orden y no llevan inventario. Es inferencia mía (E) que lo que miran es lo que ya conocen: lo que pagaron la tela y el servicio, y cuánto cobran. Lo que Felipe mira de verdad al cerrar una orden **no está escrito en ningún documento** (hueco del Frente 0): va en preguntas 6 y 11.

H-5.20 · Para decidir si conviene hacer algo afuera se comparan solo los costos que desaparecerían, y el costo unitario completo engaña.
  Evidencia: B · OpenStax, cap. 10.3 (hacer o comprar): son relevantes los costos variables de producir y los fijos que se evitarían; los fijos que seguirían igual no entran; la capacidad libre y la calidad y puntualidad del proveedor también pesan; el ejemplo muestra que un costo unitario con fijos inevitables hace parecer mejor comprar · consultada 2026-10-16
  Confianza: alta · Aplica a: ambos
  Lo contradiría: —
  Implicación: «¿me conviene tercerizar esta fase?»: la «conversión por prenda» de Eficiencia (planilla + gastos ÷ buenas) no sirve para eso, porque la planilla del Taller (pagada por horas, H-5.8) se mantiene si la fase sale; falta el costo *evitable*, que hoy nadie conoce.

H-5.21 · En programas de la OIT para pequeñas empresas de confección, los indicadores los reúne el entrenador, no la empresa.
  Evidencia: B · OIT, «Advancing productivity, quality improvement and decent work in Ethiopia's garment sector» (1-jun-2022): SCORE mide productividad, defectos al final de línea, ausentismo, rotación y costos; hace una línea base antes de intervenir; los entrenadores reúnen los datos; a dic-2021 el 60 % de las pequeñas empresas capacitadas reportó más productividad y casi la mitad menos defectos y costos · consultada 2026-10-16
  Confianza: media (autorreporte del programa; Etiopía) · Aplica a: taller de ~10 operarias
  Lo contradiría: una pequeña empresa que mantenga sus indicadores sola durante años
  Implicación: H1 y todas las métricas: una cifra que nadie del Taller mantiene sola se muere; por eso las 8 métricas de abajo salen casi todas de lo que ya se anota por otra razón.

H-5.22 · Se explica solo lo que sale de un rango; estándares inflados esconden holgura.
  Evidencia: B · OpenStax, cap. 8.5: gestión por excepción con un rango aceptable; las variaciones favorables también se miran porque pueden esconder holgura puesta a propósito en el estándar; medir a las personas solo por variaciones puede empujar a manejar el número · consultada 2026-10-16
  Confianza: alta · Aplica a: ambos
  Lo contradiría: —
  Implicación: d.7 (cortar hasta 10 % de más) y el tope de ADR-0415 (C8) son rangos de excepción sin respaldo de campo; solo las primeras órdenes dirán qué es «normal».

H-5.23 · Sacar el corte a otra parte alarga el ciclo de una a dos semanas, dice una diseñadora con años de práctica.
  Evidencia: C · Fashion-Incubator, «Getting a quote for cutting» (artículo de 2006, la página muestra 2016): corte cotizado por pieza; llevar el corte a otro lado suma de una a dos semanas al ciclo · consultada 2026-10-16
  Confianza: baja (una sola fuente C, EE. UU., antigua) · Aplica a: ambos
  Lo contradiría: un servicio de corte en el mismo parque industrial con entrega en 1 o 2 días
  Implicación: métrica 5 y la decisión de sacar el corte: el tiempo de espera entre fases es una parte del costo que no está en la tarifa.

---

## 6 · Lo que el dueño decide con una orden cerrada

| Decisión | Qué le sirve de lo medible | Qué falta | Quién lo tiene |
|---|---|---|---|
| ¿Rehago este modelo? | Costo real por prenda buena (M1); si los metros reales cuadraron (M2); cuánto salió buena (M3); cuántos días tardó (M5) | Que la venta se mida *por modelo*, no por lote: el stock de prendas es fungible y la venta no se amarra a una orden | La venta por modelo ya existe en Inventario/Frescura; el costo por lote, solo cuando se cierre la primera orden |
| ¿A quién le doy el servicio? | Segundas y faltantes por servicio (M4); atraso (M6); tarifa y mínimo | Más de 2 o 3 vueltas por servicio para que el porcentaje no sea ruido; hoy 0 proveedores y 0 tarifas | Sale de las Vueltas, cuando existan |
| ¿Subo el precio? | Costo real por prenda buena (M1), pero el sistema guarda un *promedio ponderado* (ADR-0067) mezclado con el costo anterior | Ver también el costo de la última orden, no solo el promedio | `costo_historial` guarda cada paso |
| ¿Me conviene tercerizar esta fase? | M8 (el costo del Taller por prenda), la cotización de maquila de referencia (D-82) | El costo **evitable** de hacerla adentro (H-5.20); la cotización tiene 0 filas | Nada hoy |

---

## 7 · Las 8 métricas que valen la pena

Todas salen de lo que ya se anota por otra razón (tela usada, «Terminé N», Salida, Vuelta, fechas), salvo la 8, que usa la planilla de Dynamic. **«Quién lo anota» es mi propuesta, a confirmar con CAYLA (E).** Con 0 órdenes no hay línea base: cada una se estrena con la primera orden.

### M1 · Costo real por prenda buena, contra lo que se estimó al abrir

- **Por qué:** es la cifra con que se fija precio y se decide repetir. Decide «¿rehago?» y «¿subo el precio?». La tela y los avíos suelen ser lo mayor del costo (H-5.2, H-5.13). La práctica común es costear al tanteo (H-5.1): tener el número real ya es ganar terreno.
- **Fórmula:** (valor de la tela y avíos usados + servicios devengados) ÷ prendas buenas que pasaron al stock; desvío = real − estimado al abrir. Para leerla bien: *separar* en tela, avíos y servicios, y no comparar órdenes de tamaño muy distinto (H-5.12).
- **Dato que necesita:** metros y avíos usados (los anota quien corta), tarifas congeladas al abrir, buenas recibidas. Todo existe en lo construido.
- **Quién y cuándo:** quien cierra el corte anota la tela usada; el costo sale solo al pasar al stock.
- **¿Vive en un taller pequeño?** Sí, si la tela usada se anota; es **el eslabón frágil** (sin ella el costo sale sin tela). Los costos tienen una salvedad ya dicha: sin costura propia (H-5.3).

### M2 · Metros de tela por prenda: lo logrado contra lo escrito en el modelo

- **Por qué:** la tela es lo que más mueve el costo, y lo que se escribe «de Audaces» probablemente es un piso (H-5.14, H-5.16). Decide cuánta tela comprar y si el modelo está bien costeado.
- **Fórmula:** metros entregados al corte ÷ prendas cortadas (consumo logrado en sala de corte, definición de H-5.14), comparado con el consumo escrito; desvío en %. Con varias órdenes del mismo modelo, mirar el rango, no un solo número.
- **Dato que necesita:** metros usados al cortar y prendas cortadas.
- **Quién y cuándo:** quien corta, al terminar el corte.
- **¿Vive?** Sí si se pide un solo número al cerrar el corte. **Ojo:** una sola orden no distingue ruido de cambio real (H-5.16); y los retazos sobrantes que se devuelven al estante deben restarse.

### M3 · De lo cortado, cuánto salió buena

- **Por qué:** es la forma más corta de ver si el «< 3 %» se cumple, y vuelve visibles las tres pérdidas por separado (sección 4). Decide si hay que anotar causas de falla.
- **Fórmula:** prendas buenas que pasaron al stock ÷ prendas cortadas; y debajo, qué parte es segundas, faltantes (de las Vueltas) y «sin explicar» (cortadas − todo lo anotado).
- **Dato que necesita:** cortadas, buenas, segundas y faltantes. Las dos primeras ya están; en las fases internas solo se anotan buenas, así que lo «sin explicar» no dice si fue tela, costura o extravío.
- **Quién y cuándo:** sale solo de «Terminé N», Vuelta y cierre.
- **¿Vive?** Sí. **No cuenta lo arreglado** (reproceso): el 3 % puede cumplirse con mucho reproceso (H-5.17); hoy nadie lo anota.

### M4 · Segundas y faltantes de cada servicio, por cada 100 mandadas

- **Por qué:** decide a quién le doy el servicio y cuándo reclamar o descontar. La literatura del oficio vigila los defectos por cada cien (C), y el dato nace en el momento en que se cuenta lo que vuelve.
- **Fórmula:** (segundas + faltantes) ÷ prendas mandadas, por servicio y fase; se lee junto con los conteos crudos («de 120 mandadas, 4 segundas y 2 faltaron»).
- **Dato que necesita:** Salida y Vuelta, con el motivo.
- **Quién y cuándo:** quien recibe, al contar lo que vuelve.
- **¿Vive?** Sí: contar al recibir ya se hace. **Cuidado con la muestra:** con 1 a 3 vueltas por servicio un porcentaje es ruido (inferencia estadística, E); por eso los conteos crudos.

### M5 · Días de cada fase y días de espera entre fases

- **Por qué:** nadie tiene hoy un plazo medido: el plazo de reposición figura como 7, 14 y 30 días en tres lugares (C12). Decide cuándo empezar una orden para que llegue a tiempo y si sacar una fase agrega semanas (H-5.23).
- **Fórmula:** fecha de la primera anotación de la fase siguiente − fecha de la última de la anterior; total = del primer corte al pase al stock. El tramo Taller → tienda es de Traslados, no de Producción.
- **Dato que necesita:** fechas que ya nacen de «Terminé N», Salida, Vuelta y el pase al stock.
- **Quién y cuándo:** nadie anota nada extra.
- **¿Vive?** Sí en lo que pide al Taller (nada); **su debilidad** es que la fecha que queda es la del registro, no la del hecho: si «Terminé N» se anota el viernes por toda la semana, el plazo sale inflado o aplanado. Se mira en el rango, no en el día.

### M6 · Atraso del servicio contra la fecha prometida

- **Por qué:** entrega a tiempo es el indicador que casi todos usan (C); aquí decide a quién dar el siguiente servicio y qué fecha creerle. Una de las fuentes peruanas reporta 4 de cada 10 contratos fuera de plazo en una empresa (H-5.17).
- **Fórmula:** días entre la fecha prometida de la fase y el cierre de su última Vuelta; y cuántas fases salieron a tiempo.
- **Dato que necesita:** fecha prometida (ya se congela en la fase) y fecha de la Vuelta.
- **Quién y cuándo:** sale solo.
- **¿Vive?** Sí. Con pocas fases al mes, mejor la lista de atrasos que el porcentaje.

### M7 · Prendas afuera, hace cuántos días, y plata metida en órdenes abiertas

- **Por qué:** una prenda o tela en un servicio es plata y riesgo fuera de casa, y a fin de mes es la plata en proceso (H-5.7). Decide a quién llamar hoy y qué ver con el contador.
- **Fórmula:** afuera = Σ Salidas − Σ Vueltas (buenas + segundas + faltantes), por servicio, con los días de la Salida más antigua sin cerrar; plata en proceso = tela y avíos usados + servicios devengados de las órdenes abiertas.
- **Dato que necesita:** todo sale de Salida, Vuelta y de la tela usada.
- **Quién y cuándo:** sale solo.
- **¿Vive?** Sí. **Ojo:** si la tela se anota tarde, la «plata en proceso» sale corta, y el contador puede pedirla con otra regla (pregunta 7).

### M8 · Costo del Taller por prenda buena, por trimestre (lo que ya mide Eficiencia)

- **Por qué:** es la medición que Felipe decidió en D-31 (el Taller se mide por lo que cuesta cada prenda terminada). Decide si el Taller propio se sostiene.
- **Fórmula:** (planilla del Taller con sus provisiones + gastos del Taller) ÷ prendas buenas del período, junto con lo de afuera; leer por **trimestre**, no por mes.
- **Dato que necesita:** la planilla pagada del Taller en Dynamic y los gastos del Taller (hoy hay 0).
- **Quién y cuándo:** sale de Dynamic al cerrar cada período.
- **¿Vive?** **Frágil.** Se apaga con menos de 3 personas (H-5.11); un mes con pocas prendas la dispara (la norma pide repartir los fijos sobre la capacidad normal, H-5.5); y no sirve para decidir si tercerizar (H-5.20). Se deja porque es una decisión de Felipe, con estas tres advertencias a la vista.

---

## 8 · Lo que no conviene medir todavía

| Qué | Por qué todavía no |
|---|---|
| Producción por persona o por operación (minutos estándar, eficiencia de línea, balanceo) | Pide cronometrar y marcar por bulto; el pago de hoy es por tiempo (H-5.8); y la literatura advierte que sin conocer los tiempos reales no se fija una tarifa justa (H-5.9). Solo se justifica el día que alguien cobre por pieza |
| Costo estándar con las cuatro variaciones (precio, cantidad, tasa, eficiencia) | Un estándar mal puesto genera variaciones inútiles (H-5.16, H-5.22) y no hay una orden cerrada de dónde sacarlo |
| Costo por talla o por color | El consumo por talla de R-27 no se mide (D-D es por modelo) y el sistema aplica un solo costo a toda la orden (H-5.3) |
| Margen y venta *por lote* | La venta no se amarra a una orden (stock fungible); se mide por modelo, y eso ya existe en Inventario |
| Causas de falla clasificadas (taxonomía de defectos, DHU por operación) | Con pocas Vueltas por mes no hay muestra; basta el motivo escrito (existe) |
| Comparar «hacer adentro vs afuera» de forma automática | Falta el costo evitable (H-5.20) y la cotización de maquila tiene 0 filas y tres versiones contradictorias (C5) |
| Utilización de capacidad, horas extra %, ausentismo | Piden minutos estándar o son de Dynamic, no de Producción; el programa de la OIT las mide con ayuda de un entrenador (H-5.21) |
| Merma «acreditable» para SUNAT | Es un informe técnico de un profesional independiente (H-5.6), no una métrica del ERP |
| Valor de lo en proceso con una regla contable | Hasta que el contador diga cómo lo quiere (H-5.7) |
| OTIF por línea o por talla | No hay órdenes ni muestra |

---

## 9 · Veredictos de las hipótesis del frente

| # | Veredicto | En una frase |
|---|---|---|
| **H1** | **matiza** | Para *pagar*, anotar por fase alcanza si siguen pagados por tiempo (H-5.8). Pero el costo de mano de obra por orden pide horas (H-5.10), no piezas por persona; y «10 operarias» no tiene respaldo: la planilla del Taller bajó de 6 a 5 a 3 (H-5.11) |
| **H4** | **matiza** | El esquema por prenda + mínimo + fijo tiene el mismo cuerpo que una cotización corriente (H-5.12, D). No encontré evidencia limeña de los 150–240 ni de qué se hace con las segundas; la costura también se cotiza por minuto/hora en el oficio (C); y R-30 habla de prenda *terminada* mientras d.5 paga las *buenas recibidas* |
| **H6** | **matiza** | El número de Audaces es una estimación de marcada y probablemente un piso (H-5.14); «lo medido corrige» es la dirección correcta (H-5.16) pero con una sola orden no se distingue ruido de cambio; formato real de Audaces sin ver |
| **H8** | **matiza** | En tela, el 3 % queda contradicho (H-5.15, H-5.17). En prendas perdidas no hay dato público: el 3 % es el nivel «muy bueno» de una fuente (H-5.18). Depende de si arreglar una prenda cuenta como pérdida |

## 10 · Verificado previo (lo `[externo, sin verificar]` que tocó este frente)

| Ítem | Estado | Fuente |
|---|---|---|
| «La inspección real en Lima da ~15 % zurcidos y ~13 % composturas frente a 1 % segundas» (README del 13-oct, pregunta A2) | **sigue sin verificar** | La página de APTT que figura entre sus fuentes (10-dic-2025) no trae ninguna de esas cifras; ninguna otra fuente que abrí las trae |
| «El 95 % de las empresas peruanas trabaja por bultos» (ADR-0400, alternativas descartadas) | **sigue sin verificar** | No tiene fuente en el repo ni la encontré; el límite de búsquedas se agotó antes de intentarlo con fuentes peruanas. Una pista que no la confirma: en el estudio de la OIT (H-5.9) el pago por pieza va de 4 % a 83 % según el país, aunque «por bultos» (cómo se mueve el trabajo) no es lo mismo que «por pieza» (cómo se paga) |

---

## Contraejemplos de este frente

1. **Contra «menos de 3 %» (H8):** abrigos de alpaca con 20 % de merma de tela en corte y 58 % de prendas reprocesadas (H-5.17); tejido de punto con 30–35 % de sobrante de tela (H-5.15). Son plantas más grandes y prendas más complejas que un taller de ~10 personas: sirven de contraejemplo a la cifra, no de estimación para CAYLA.
2. **Contra «el dato por persona puede hacer falta» (H1):** Dynamic muestra al Taller pagado por tiempo y sin ninguna columna de piezas (H-5.8); ahí el dato por persona no alimenta ningún pago.
3. **Contra «el pago por pieza daña» (cautela sobre H1/H4):** el estudio de la OIT halla que el pago *totalmente* por pieza no tuvo efectos negativos y que el *mixto* es el que los tiene (H-5.9).
4. **Contra usar la «conversión por prenda» para decidir tercerizar:** el texto de hacer o comprar dice que el costo unitario completo con fijos inevitables engaña (H-5.20), y la planilla del Taller se mantiene si una fase sale.

## Lo que no encontré

- **Cualquier cifra real de CAYLA** de costo, desvío, plazo o segundas: no existe (0 órdenes).
- **Cómo se paga hoy a las personas del Taller** fuera de lo que muestra Dynamic, y qué son los bonos.
- **Qué mira Felipe al cerrar una orden.** No está escrito en ningún documento.
- **Un estudio público de qué indicadores sostiene en el tiempo un taller peruano de ~10 personas.** Los programas de la OIT en Etiopía usan un entrenador que reúne los datos.
- **Una cifra pública de distancia entre consumo de marcada y consumo logrado** para talleres pequeños; ni de segundas.
- **Cómo trata la práctica peruana a lo en proceso a fin de mes** en negocios pequeños, y el texto de las cuentas del plan contable (el PDF oficial dio 403).
- **Tarifas y formas de pago de los servicios de Lima** (se encargaban a los Frentes 2 y 4; se agotó la búsqueda web antes de poder cruzarlas con mi frente).
- **Formato real del reporte de Audaces.** La visita A0 sigue sin hacerse.
- **Qué merma de tela va a cargar CAYLA en cada insumo:** `insumos` tiene 0 filas, así que ningún `merma_pct` existe todavía (consulta del 2026-10-16).
- **Estado de varias fuentes peruanas por bloqueos:** ver «Fuentes» (el libro de Gamarra de la USIL redirigió; la tesis sobre tiempo estándar de la UNE y la del PUCP sobre costos de una microempresa de confecciones no se pudieron leer; la del PUCP es de acceso restringido).

## Preguntas que solo CAYLA puede contestar

*Candidatas para la ronda de 36; lenguaje de tienda, sin jerga. Tipo HECHO = solo CAYLA sabe cómo es; DECISIÓN = preferencia de Felipe.*

1. **HECHO · ¿Cómo le pagas hoy a cada persona del Taller: sueldo del mes, por días u horas, por prenda, o una mezcla con bono? ¿Para qué son los bonos que salen en la planilla?** Decide si hace falta anotar quién hizo cuántas prendas (H1) y si la costura propia se puede poner por prenda.
2. **HECHO · ¿El Taller se está achicando a propósito (de 6 a 3 personas en tres meses)? ¿Vas a coser cada vez más afuera?** Decide cuánto vale medir el costo del Taller (M8) y cuánta costura propia habrá que costear.
3. **HECHO · De la última tanda que cortaron, ¿cuántos metros decía el Audaces y cuántos se gastaron de verdad?** Decide cuánto se separa lo declarado de lo real (H6) y de dónde parte el número del modelo.
4. **HECHO · De cada 100 prendas que cortan, ¿cuántas terminan sin poder venderse como de primera, cuántas se arreglan y cuántas se pierden?** Decide si el «menos de 3 %» (H8) se sostiene y qué hay que anotar además de las buenas.
5. **HECHO · Si un servicio te devuelve prendas falladas o te faltan algunas, ¿le pagas igual, le descuentas o te las lleva a arreglar?** Decide si se paga lo enviado o lo bueno (H4) y qué pasa con el costo de lo perdido.
6. **HECHO · Cuando alguien te pregunta «¿cuánto cuesta hacer esta prenda?», ¿qué cuentas haces y con qué papeles?** Decide con qué se compara el costo que calcula el sistema (M1) y cuál es el hábito a reemplazar.
7. **HECHO · A fin de mes, ¿qué hace tu contador con la tela y las prendas que todavía están a medio hacer?** Decide si hay que mostrar «plata en proceso» (M7) y con qué regla.
8. **DECISIÓN (REABRE D-31 y C6) · ¿Quieres que el costo de una prenda cosida en el Taller incluya el trabajo de la gente del Taller, o solo la tela, los avíos y los servicios de afuera, como hoy?** Ganas: dos prendas iguales cuestan lo mismo cosidas adentro o afuera, y el precio y el margen reflejan el trabajo propio; Pagas: hay que saber cuántas horas se dedicó a cada orden, y la cuenta con planilla por horas es un reparto, no un costo exacto.
9. **DECISIÓN · Si un servicio pierde o devuelve mal prendas, ¿el costo lo cargas a la orden (todo se reparte entre las buenas, como hoy) o prefieres verlo aparte como pérdida?** Decide cómo trata la pérdida el costo y qué le pasa al precio; la respuesta debe revisarla el contador (H-5.5).
10. **DECISIÓN · ¿Cuántas órdenes de un mismo modelo quieres ver cerradas antes de que el metraje medido pase a mandar sobre el de Audaces?** Decide cuándo «lo real corrige» (H6) sin que una orden rara cambie el modelo.
11. **DECISIÓN · De estas ocho cifras, ¿cuáles tres quieres ver primero al cerrar una orden?** (costo real por prenda buena, metros por prenda, cuánto salió buena, segundas y faltantes por servicio, días por fase, atraso del servicio, prendas afuera, costo del Taller por prenda). Decide el orden y el peso de lo que se muestra al cerrar una orden.
12. **DECISIÓN · ¿Te interesa ver en cada orden cuánto habría costado hacerla afuera?** (Aparece como «segundo orden» en la investigación del 13-oct y no se contestó.) Requiere el costo evitable (H-5.20) y la cotización de maquila (D-82), hoy con 0 filas.

---

## Fuentes

Nivel: **A** medido por mí; **B** primaria citable; **C** secundaria; **D** lo dijo Felipe y está escrito. Consultadas el **2026-10-16** salvo que se diga otra cosa. «Murió» = el enlace no entregó el documento.

### A · Medido por mí (solo `SELECT`, `cayla-dynamic`)

- `retail.variantes`, `retail.costo_historial`, `retail.producciones`, `retail.produccion_fases`, `retail.producto_consumos`, `retail.gastos`, `retail.categorias_gasto`, `retail.cotizaciones_maquila`, `retail.proveedor_tarifas`, `retail.planilla_por_sede`, `public.personas`, `public.v_planilla_pagada`, `public.tarifas_hora`. Consultas con conteos y proporciones; ningún monto se copia al repo.
- Repo, rama `main`: `supabase/migrations/20260915130000_produccion_del_taller.sql` (líneas 93-94), `20260916090000_costo_promedio_ponderado.sql` (132-138), `20260921160000_planilla_por_sede.sql` (13, 52); `apps/web/lib/eficiencia-reglas.ts`; `docs/PLAN-PRODUCCION.md` F7; `docs/datos/15-COMO-OPERA-CAYLA.md` §7 (R-25 a R-31); `docs/datos/DECISIONES-2026-09-12.md` (D-31, D-33, D-45, D-47); `docs/datos/DECISIONES-2026-09-21-menu-comercial.md` (D-80 a D-82); `docs/adr/0067-…`, `0133-…`.
- Repo, rama `claude/production-module-redesign-136cca`: `docs/adr/0400-…` y `supabase/migrations/20261014160000_produccion_cierre_al_stock_y_costos_del_taller.sql` (186, 248).

### B · Primarias citables

- SUNAT, Informe 000094-2023-SUNAT/7T0000 (17-ago-2023), deducibilidad de mermas. https://www.sunat.gob.pe/legislacion/oficios/2023/informe-oficios/i000094-2023-7T0000.pdf · viva, PDF leído.
- MEF, NICSP 12 «Inventarios» (2022), sigue a la NIC 2, párrafos 20, 21, 25 y 30. https://mef.gob.pe/contenidos/conta_publ/con_nor_co/nicsp/NICSP12_2022.pdf · viva, PDF leído.
- IFRS Foundation, página de IAS 2 Inventories. https://www.ifrs.org/issued-standards/list-of-standards/ias-2-inventories/ · viva, solo el resumen de la página.
- MEF, PDF de la NIC 2. https://www.mef.gob.pe/contenidos/conta_publ/con_nor_co/vigentes/nic/02_NIC.pdf · **murió (404)**.
- OpenStax, *Principles of Managerial Accounting*: cap. 4.3 https://openstax.org/books/principles-managerial-accounting/pages/4-3-use-the-job-order-costing-method-to-trace-the-flow-of-product-costs-through-the-inventory-accounts · cap. 8.1 https://openstax.org/books/principles-managerial-accounting/pages/8-1-explain-how-and-why-a-standard-cost-is-developed · cap. 8.2 https://openstax.org/books/principles-managerial-accounting/pages/8-2-compute-and-evaluate-materials-variances · cap. 8.5 https://openstax.org/books/principles-managerial-accounting/pages/8-5-describe-how-companies-use-variance-analysis · cap. 10.3 https://openstax.org/books/principles-managerial-accounting/pages/10-3-evaluate-and-determine-whether-to-make-or-buy-a-component · vivas.
- OIT-IFC Better Work, Discussion Paper 28, Borino (dic-2018), «Piece rate pay and working conditions in the export garment sector». https://www.ilo.org/sites/default/files/wcmsp5/groups/public/%40ed_dialogue/%40dialogue/documents/publication/wcms_663063.pdf · viva, PDF leído. Copia en `asiagarmenthub.net` **403**.
- OIT, «Advancing productivity, quality improvement and decent work in Ethiopia's garment sector» (1-jun-2022). https://www.ilo.org/resource/article/advancing-productivity-quality-improvement-and-decent-work-ethiopias · viva.
- Tesis UPeU, «Diseño de un sistema de costos por órdenes específicas para micro y pequeñas empresas del sector confección, Arequipa 2021». https://repositorio.upeu.edu.pe/bitstreams/9c22fed5-ce41-461c-8f37-8f3783838db0/download · viva, PDF leído.
- Camborda Palacios, G. (2023), *Industrial Data* 26(2), UNMSM. https://www.redalyc.org/journal/816/81678884003/81678884003.pdf · viva, PDF leído.
- Tesis UCSM, «Propuesta de mejora del proceso de confección de abrigos de tejido plano… Arequipa 2019» (2021). https://repositorio.ucsm.edu.pe/bitstreams/b04f4eae-5ccc-419b-a3d1-5cc031ea4e64/download · viva, PDF leído.

### C · Secundarias

- Apparel Resources, «Performance measurement tools 3 – cutting & production planning». https://apparelresources.com/business-news/manufacturing/performance-measurement-tools-3-cutting-production-planning/ · viva. Y «Fabric utilization I – cut order planning». https://apparelresources.com/business-news/manufacturing/fabric-utilization-i-cut-order-planning/ · viva.
- WavePLM, «Garment Costing: A Complete Guide for Apparel Brands» (11-may-2026). https://blog.waveplm.com/?p=6051 · viva.
- MakersRow, «What Is the Cost of Manufacturing Clothes in a Quote? (2026)» (1-ago-2026). https://makersrow.com/blog/cost-of-manufacturing-clothes-price-quote/ · viva.
- Fashion-Incubator, «Getting a quote for cutting» (2006; la página muestra 2016). https://fashion-incubator.com/getting_a_quote_for_cutting/ · viva.
- Audaces, página del módulo de marcada. https://audaces.com/en/solutions/marker · viva (ficha comercial).
- Just Style, «Piece rate pay a mixed bag for garment workers» (4-ene-2019). https://www.just-style.com/news/piece-rate-pay-a-mixed-bag-for-garment-workers/ · viva.
- APTT Perú, «Calidad post-costura…» (10-dic-2025). https://apttperu.com/calidad-post-costura-estrategias-para-la-competitividad-textil-peruana/ · viva, sin cifras (ver «Verificado previo»).
- Zagreb TTF, resumen de la charla de S. Sula sobre KPI en empresas de confección (15-may-2025). https://api.ttf.hr/documents/sskXUluiMOvlfZ2DOgxmUAoLh3qSLMW8jnByaChtXTYJlDGYpeCqH3uug0Um/tribina-albanija-silva-sula.pdf · viva, solo el resumen de la charla (dice que los KPI se calculan semanalmente).

### No se pudieron abrir o no aportaron (quedan sin usar)

- Libro de Gamarra, Fondo Editorial USIL, https://fondoeditorial.usil.edu.pe/wp-content/uploads/19-LIBRO_GAMARRA.pdf · **murió** (redirige a la página del fondo editorial).
- PNUD, «El componente humano… clústeres de confección», https://www.undp.org/es/node/486036 · **403**. El resumen del buscador decía que las personas del taller fijan el monto por operación por costumbre, sin medir tiempos; **no lo usé como hallazgo**.
- Tesis UNE sobre tiempo estándar en prendas de punto, https://repositorio.une.edu.pe/handle/20.500.14039/5526 · bloqueada por antibots. Un resumen del buscador mencionaba una gran diferencia de minutos por prenda entre una fábrica y un taller pequeño; **no lo usé**.
- Tesis UNI sobre mermas en cotización (`leon_qd.pdf`), PUCP, tesis sobre costos de una microempresa de confecciones (acceso restringido), CAF «La confección del progreso» (vacío), PCGE 2019 en gob.pe (403), NIC 2 en FACPCE (mantenimiento), AUTEX 2012 (conexión cortada), artículo de Albania en `yadda.icm.edu.pl` (403), colección NIC del MEF en gob.pe (418).

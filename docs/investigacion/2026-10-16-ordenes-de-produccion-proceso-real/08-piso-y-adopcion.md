# 08 · La gente y las herramientas en el piso (adopción)

**Frente 8 · 2026-10-16 · solo lectura.** Ataca H1 y H4 de `2026-10-16-ordenes-de-produccion-proceso-real-PROMPT.md`. Niveles de evidencia como en la sección 4 del prompt: **A** medido en el repo o la base · **B** fuente primaria (tesis, revista con revisión, informe de la OIT o del INEI, documentación oficial) · **C** fuente secundaria (blog, nota de prensa, página comercial, patente) · **D** lo dijo Felipe y está escrito · **E** inferencia mía. Todas las consultas son del 2026-10-16.

## Veredicto (léelo primero)

1. **Nadie ha observado cómo se anota el avance en el Taller de CAYLA**, y nadie lo ha observado tampoco en un taller comparable en la literatura pública: lo que hay es una tesis de licenciatura con cuatro entrevistas en un taller de servicio de Lima, un artículo de 2007 y manuales de software. Todo lo demás de este informe es evidencia indirecta y lo marco como tal.
2. **Lo único peruano y concreto sobre «qué se anota»** es modesto: un cuaderno con fecha de entrega, total de prendas y cliente, más un conteo manual de unidades por día (H-8.1). Eso apoya que el avance se lleve por fase y no por bulto, pero también dice que **hoy el papel es por pedido, no por fase**: «Terminé N» no reemplaza un registro por fase que ya exista; es una anotación nueva.
3. **El «95 % trabaja por bultos» de ADR-0400 viene de un artículo de 2007 que lo afirma sin fuente** y habla del sistema de producción por lotes, no de qué dato se registra (H-8.5). No respalda ni contradice la granularidad A.
4. **Lo más fuerte de todo el frente (nivel B, varias fuentes independientes):** cuando el pago depende de un conteo, el conteo se vuelve el dato en disputa, y las personas que cobran por pieza esconden producción si creen que el dato servirá para bajar la tarifa (H-8.8, H-8.9). Eso sostiene la decisión de **no capturar por operaria al inicio**, mientras en el Taller no se pague a destajo.
5. **Lo más sorprendente:** en Perú solo cerca de 8 % de los asalariados de confección cobra por pieza (ENAHO 2016 vía OIT), pero esa cifra deja fuera a quien trabaja en casa o por su cuenta, que es justo quien cobra por pieza (H-8.7). «Por prenda» probablemente es la forma de pagar a un **servicio de afuera**, no a la operaria de planta.
6. **El aparato es el celular, no la tableta ni la computadora:** en Lima Metropolitana 93,1 % usa celular y 89,2 % de quienes usan internet se conecta por celular; por tableta, 2,0 % (INEI, cuarto trimestre de 2025; H-8.13). El Taller hoy tiene «el Mac mini» (Frente 0): no sé si está junto a las mesas.
7. **Lo que mejor aceptan las mypes de confección de Lima parece ser lo que ya conocen** (una herramienta en Excel, usada por el dueño o alguien de confianza; H-8.14). Ese caso es de planificación, no de piso, y no prueba nada sobre operarias.
8. **Mi veredicto sobre H1: matiza.** La granularidad A es coherente con la evidencia, pero «con 10 operarias el papel alcanza» no tiene respaldo: ni el número de operarias ni qué papel existe. **H4: matiza**, con evidencia solo indirecta desde este frente (los frentes 2 y 4 cargan la evidencia local).
9. **Búsquedas:** la cuota de `WebSearch` (200 por turno, compartida entre los agentes) se agotó antes de que terminara este frente. Quedó sin buscar: cuántas operarias cobran por docena en Gamarra, uso real de WhatsApp en talleres peruanos, y la descripción del trabajo del habilitador (SENATI). Lo digo en «Lo que no encontré».

## Cómo se hizo y qué límites tiene

- Leí las partes pertinentes (no cada página) de: la tesis de Lima (Ayala 2022, 182 páginas), el artículo de Bonilla (2007), el artículo de mypes de confecciones (Ávila 2021), el reporte sectorial de la SNI, el boletín TIC del INEI (IV trimestre de 2025), los dos documentos de la OIT y Better Work sobre pago por pieza (DP 28 y DP 44), el estudio de aceptación de MES de GEPROS y el informe de la OIT sobre salarios digitales en Camboya. De otros solo vi el resumen o la ficha (los marco así).
- La herramienta de lectura guardó solos algunos PDF en su carpeta temporal de resultados; los convertí a texto en el *scratchpad* para leerlos. No bajé nada a propósito ni guardé nada en el repo.
- **No usé el navegador integrado:** no hizo falta (la documentación pública se leyó como texto), así que **no hay capturas** de pantallas de otros sistemas.
- **No encontré ningún estudio independiente** que mida el error de captura manual en un taller de confección pequeño, ni uno que mida la adopción de seguimiento por bulto en talleres de menos de 20 personas. Lo de «fácil de usar», «implementación en un mes» y «15 % más de productividad» es de fabricantes de software y lo trato como afirmación comercial (C).
- Fuentes que no pude abrir: manual de SENATI (error de lectura), tesis de UNMSM sobre talleres externos (error de certificado), estudio CAF/ADEX (llegó vacío), estudio sectorial de PRODUCE (el sitio no respondió), Davis 1989 y el meta-análisis de 2022 en ScienceDirect (403: solo vi la ficha). Quedan **sin verificar** y listadas en «Fuentes».
- Vocabulario: en oficio se dice *operaria/operario*, *habilitador*, *encargado del taller*; no uso «jefe» (los títulos de las fuentes los parafraseo).

---

## 1 · Hallazgos

### Lo que se anota y quién lo anota (Perú)

**H-8.1 · En un taller de confección de servicio de Lima (La Victoria, 44 personas) la producción se lleva en un cuaderno con la fecha de entrega, el total de prendas y el cliente, y las unidades del día se anotan a mano.**
- Evidencia: B · Ayala (2022), tesis de licenciatura, UWiener, anexo 5 (entrevistas de abril de 2022), pp. 96 y 101 · consultada 2026-10-16
- Confianza: media (cuatro entrevistas, un solo taller; cose para mayoristas, no es una marca con taller propio) · Aplica a: ambos (44 personas, mayor que el Taller de CAYLA)
- Lo contradiría: un taller comparable que lleve hoja de ruta o ticket por bulto con conteo por fase
- Implicación: H1 / d.1 de ADR-0400: el «papel que alcanza» que existe es un cuaderno **por pedido**, no por fase; «Terminé N» no reemplaza un registro de fase que ya exista.

**H-8.2 · Ese mismo taller admite que le falta un registro especializado del trabajo terminado por día, y reporta rotación de personal que interrumpe el proceso.**
- Evidencia: B · Ayala (2022), pp. 41 y 45 (encuesta a 44 trabajadores y análisis cualitativo) · consultada 2026-10-16
- Confianza: media · Aplica a: ambos
- Lo contradiría: una encuesta mayor en talleres chicos con rotación baja
- Implicación: H1 y pregunta Q1 («quién anota»): el registro diario por persona es un hueco reconocido, no un hábito que haya que respetar; y quien anota cambia.

**H-8.3 · Los roles del taller son informales: 20 de 44 (45 %) dicen que no siempre hacen su función por duplicidad de tareas, y los 10 habilitadores reciben y registran materia prima, ordenan y mueven los cortes y empacan lo terminado.**
- Evidencia: B · Ayala (2022), cuadro 3 y tabla 8 (pp. 71–72) y resultados de la pregunta 10 de la encuesta · consultada 2026-10-16
- Confianza: media · Aplica a: ambos
- Lo contradiría: un taller con roles fijos y un solo punto de entrega
- Implicación: Q1 y H1: el punto fijo por donde pasa cada lote (el habilitado) es más estable que «cada operaria»; **no encontré** qué hace el habilitador en el Taller de CAYLA (pregunta 5).

**H-8.4 · En una mediana empresa limeña de polos (40 personas en planta, 2007) existían por escrito órdenes de producción, hojas de ruta, guías de ingreso de producto terminado y reportes de control de calidad; el lote medio era de 200 prendas en el corte y el habilitado armaba paquetes de unas 40.**
- Evidencia: B · Bonilla (2007), Ingeniería Industrial n.º 25, Universidad de Lima, secciones 3.2 y 4, pp. 11–32 · consultada 2026-10-16
- Confianza: baja a media (2007, una empresa, el doble de gente que el Taller) · Aplica a: ambos
- Lo contradiría: que esas hojas existieran solo para el estudio, o un taller sin hoja de ruta
- Implicación: H12 y H1: la hoja de ruta y el paquete de ~40 prendas son papel físico que viaja con el lote; **no sé si el Taller de CAYLA lo tiene** (pregunta 1).

**H-8.5 · El «95 % de las empresas peruanas trabaja por bultos» que cita ADR-0400 aparece en ese artículo de 2007 como afirmación del autor, sin fuente primaria en su bibliografía, y describe el sistema de producción por lotes, no qué se registra.**
- Evidencia: A (leí el artículo y su bibliografía) y B (la revista) · Bonilla (2007), introducción y conclusiones · consultada 2026-10-16
- Confianza: alta en el origen de la cifra; baja en la cifra · Aplica a: ambos
- Lo contradiría: una fuente primaria con otro porcentaje
- Implicación: d.1 de ADR-0400 («alternativas descartadas: granularidad B»): la cifra no sirve de apoyo ni de contra; «produce por lotes» no significa «anota por bulto».

**H-8.6 · La microempresa (1 a 10 trabajadores) concentra el 80 % del empleo textil y de confecciones del país, y 88,7 % de ese empleo es informal.**
- Evidencia: C · SNI-IEES (marzo de 2021), p. 17, con datos de la ENAHO-INEI 2019 · consultada 2026-10-16. *(Corrección del Frente 10: decía B; es un informe sectorial de un gremio que procesa datos del INEI, nivel C, y los Frentes 2 y 4 ya lo marcaban C. El dato original del INEI no se abrió.)*
- Confianza: media (el dato es del INEI pero lo procesa un gremio) · Aplica a: taller de ~10 operarias
- Lo contradiría: un cambio fuerte de composición desde 2019
- Implicación: H1 («10 operarias»): el Taller cae en la zona más común del sector, pero sigue sin haber dato propio de cuántas son; y en esta franja el papel informal es la norma.

### Cómo se paga y qué le hace al dato

**H-8.7 · En Perú solo alrededor de 8 % de los asalariados de confección cobra por pieza (ENAHO 2016), pero la cifra no incluye a quien trabaja en casa o por su cuenta, que es quien cobra por pieza; la OIT cita una estimación de hasta 60 % de la ropa hecha en casa en Asia y Latinoamérica.**
- Evidencia: B · Borino (2018), OIT-Better Work, Discussion Paper 28, §3.2, notas 1 y 3 y tabla 1 · consultada 2026-10-16
- Confianza: media (la propia fuente dice que faltaba el 20 % del dato de forma de pago en Perú, y el 60 % es una estimación de WIEGO) · Aplica a: ambos
- Lo contradiría: una encuesta de talleres de Lima que muestre mayoría a destajo entre operarias de planta
- Implicación: H4: «por prenda» tiene sentido como forma de pagar a un **servicio de afuera**; de la planilla del Taller no se puede deducir cómo se paga a la operaria.

**H-8.8 · Donde se paga por pieza, las fábricas usan sus datos de producción para fijar y ajustar la tarifa de cada estilo, y recogen datos para sostener o refutar el reclamo de un trabajador.**
- Evidencia: B · Davis (2021), OIT-Better Work, Discussion Paper 44 (Camboya, entrevistas a gerentes de ocho fábricas), pp. 11–12 · consultada 2026-10-16
- Confianza: media (gerentes, no operarias; fábricas de exportación) · Aplica a: planta grande
- Lo contradiría: un taller donde el conteo no se use para fijar tarifas
- Implicación: H1 y H4: un conteo ligado a pago se lleva con más cuidado **y** con más conflicto; el que cobra por pieza sabe para qué sirve el dato.

**H-8.9 · Existe un temor documentado de que un dato visible sirva para bajar la tarifa: en un experimento de campo con plantadores de árboles la producción cayó 16 % cuando el gerente avisó que la tarifa podía bajar; la OIT recoge que el pago por pieza «falla» cuando el trabajador cree que le bajarán la tarifa si se sabe de lo que es capaz.**
- Evidencia: B · Shearer (2022), *Canadian Journal of Economics* 55(3), solo resumen; Charness, Kuhn y Villeval (2010), NBER WP 16325, definición del efecto trinquete; Roy (1952), *American Journal of Sociology*, resumen; Borino (2018), DP 28, §5.2.1 (cita a Billikopf) · consultadas 2026-10-16
- Confianza: alta en que el fenómeno existe; baja en cuánto aplica a un taller de confección de Lima (ninguna es de confección) · Aplica a: ambos
- Lo contradiría: evaluación por grupo y no individual (menos efecto trinquete), o un mercado laboral competitivo (Charness lo encuentra casi anulado); ambos son del propio hallazgo
- Implicación: H1 / d.1: la granularidad A (sin operaria) evita activar este temor; si algún día el dato por persona se muestra, el riesgo reaparece.

**H-8.10 · La vigilancia electrónica del trabajo baja un poco la satisfacción y sube el estrés, y se acepta mejor si es transparente y tiene un propósito dicho.**
- Evidencia: B (Ravid y otros, 2020, *New Future of Work*, resumen leído) y C (Siegel, König y Lazar, 2022, 70 muestras: satisfacción r = −0,10, estrés r = +0,11, desempeño r = −0,01; **solo vi la ficha del buscador, no el texto**) · consultadas 2026-10-16
- Confianza: media · Aplica a: ambos
- Lo contradiría: estudios en oficios manuales con piso técnico (no los encontré)
- Implicación: H1: el efecto de ser medido existe aunque el Taller no pague a destajo; importa quién ve el dato y para qué se dice.

**H-8.11 · Un sistema de cupones por operación que depende de que cada operaria devuelva su cupón se describe como poco fiable para estadísticas de producción.**
- Evidencia: C · patente US 4,408,291 (1983), antecedentes; parte interesada (vende un sistema alternativo) · consultada 2026-10-16
- Confianza: baja · Aplica a: planta grande
- Lo contradiría: un estudio que mida el error real del cupón de papel
- Implicación: H1: el dato por operación lo controla quien cobra; no es un dato neutro.

### Cuándo y cómo falla el registro

**H-8.12 · Cuando anotar es lento o incómodo, la gente toma atajos (agrupa horas en un solo código, se salta pérdidas chicas, redondea) y anota tarde y de memoria; además, distintos turnos cuentan un mismo hecho de forma distinta.**
- Evidencia: C · Harmoni (blog de un fabricante de rastreo), Poimapper (blog de un fabricante de captura móvil); ambos describen manufactura general, no confección · consultadas 2026-10-16
- Confianza: baja (ninguna cifra propia verificable; las que citan no pude contrastar) · Aplica a: ambos
- Lo contradiría: un estudio independiente de error de captura manual en taller chico (no lo encontré)
- Implicación: d.7 de ADR-0400 («Terminé N» con valor por defecto y Deshacer): el diseño ya va en la dirección de reducir fricción, pero no hay prueba propia de que baste. También pide que «hecho» tenga una sola definición.

**H-8.13 · En Lima Metropolitana 93,1 % de las personas usa celular y 90,3 % usa internet; de quienes usan internet, 89,2 % lo hace por celular, 17,3 % por laptop, 13,5 % por computadora y 2,0 % por tableta. Entre quienes solo tienen primaria, 82,5 % usa celular (96,5 % con secundaria; 96,2 % a 97,5 % entre 25 y 59 años).**
- Evidencia: B · INEI, *Las tecnologías de la información y la comunicación en los hogares*, IV trimestre de 2025 (ENAHO), pp. 17–19 y §2.5 · consultada 2026-10-16
- Confianza: alta para población; baja para operarias de taller (el INEI mide a toda la población de 6 años o más y «usar» no es tener) · Aplica a: ambos
- Lo contradiría: una muestra de operarias de confección con menos acceso
- Implicación: el aparato de captura probable en el piso es un celular (el de la encargada, quizá el de cada operaria), no una tableta; el Mac mini del Taller (Frente 0) es una excepción que hay que ubicar físicamente (pregunta 4).

**H-8.14 · Un sistema de planificación hecho en Excel se instaló en dos mypes de confección de Lima en 2019 (una de seis personas en producción) y se aceptó «por su fácil uso y rápida adaptación»; lo usaron las personas asignadas por la empresa, no las operarias. Solo 15,7 % de las mypes de confecciones adopta tecnología de proceso (Lima y Callao, 15,3 %; INEI 2011).**
- Evidencia: B · Ávila (2021), *Ingeniería Industrial* n.º 40, Universidad de Lima, §1, §3 y conclusiones · consultada 2026-10-16
- Confianza: media (dos casos, mismo autor que lo construyó, planificación y no registro de piso, y el dato de adopción es de 2011) · Aplica a: taller de ~10 operarias
- Lo contradiría: una mype que haya rechazado una herramienta familiar
- Implicación: d.1 y d.7: en las mypes limeñas lo que se adopta es lo que ya se conoce y lo usa alguien de confianza; es contra-evidencia a «cada operaria desde un aparato nuevo» y a favor de «una persona fija».

**H-8.15 · La teoría clásica dice que lo que más predice el uso es la utilidad percibida (r = 0,63 y 0,85 en dos estudios, 152 usuarios en total); pero en un estudio de 120 usuarios de un sistema de ejecución de manufactura en Brasil, la utilidad percibida no fue significativa y sí las condiciones de apoyo (soporte, recursos) para el uso.**
- Evidencia: B · Davis (1989), *MIS Quarterly* 13(3) (ficha; texto no abierto, 403) y Innecco, Martins y Gonçalves (2022), *GEPROS* 17(2), tabla 12 · consultadas 2026-10-16
- Confianza: media-baja (el estudio brasileño es de una sola empresa, 95 % hombres y 64 % con estudios superiores: no se parece a un taller) · Aplica a: planta grande
- Lo contradiría: es contradicción interna entre las dos fuentes; no hay estudio en confección
- Implicación: d.1/d.7: «qué gana quien anota» pesa donde el uso es voluntario; donde es obligatorio pesan los apoyos (alguien que enseñe y resuelva). El Taller es lo segundo si Felipe lo manda.

**H-8.16 · En fábricas de Camboya el miedo inicial a un sistema digital (pagos) se disipó tras tres o cuatro usos por práctica, no por capacitación formal; las trabajadoras que no leen bien evitaban las capacitaciones por vergüenza.**
- Evidencia: B · OIT-Better Factories Cambodia, informe de Lawreniuk (30 trabajadoras en seis fábricas; sin fecha visible, cita fuentes de 2022), §3.5 · consultada 2026-10-16
- Confianza: baja para el piso (es sobre salarios, no producción) · Aplica a: planta grande
- Lo contradiría: que producción tenga barreras distintas a las del pago
- Implicación: **inferencia (E)** para ADR-0400 Q1: la primera semana de uso decide; la persona que menos lee es la que menos pregunta.

**H-8.17 · Un documento de software de producción (Odoo, MRPeasy, AIMS360) describe la captura de piso como «una persona anota lo ocurrido»; la documentación de Odoo registra la cantidad completa de la orden con un clic y deja un «Deshacer» breve; MRPeasy pregunta cuántas se completaron desde el último inicio; AIMS360 dice que su seguimiento por etapa calza donde hay una persona de producción dedicada y que sin ella conviene llevar solo las fechas de emisión y término.**
- Evidencia: B (la documentación describe lo que hace el producto) · documentación de Odoo 18, MRPeasy y página de AIMS360 (esta última es comercial, C) · consultadas 2026-10-16
- Confianza: alta en lo que hacen; **ninguna medición de adopción** (lo que dicen de ser fáciles es afirmación comercial, C) · Aplica a: ambos
- Lo contradiría: datos de adopción reales de cualquiera de los tres en talleres de menos de 20 personas
- Implicación: d.7 de ADR-0400: el patrón «valor por defecto = todo + Deshacer» es común; no prueba que funcione en el Taller.

**H-8.18 · En el pico de trabajo, quien anota deja de hacerlo: el entrevistado de un taller limeño dice que con exceso de trabajo solo se piensa en entregar rápido, y el estudio reporta horas extras y trabajo trasnochado.**
- Evidencia: B · Ayala (2022), pp. 97 y 99 (entrevistas) · consultada 2026-10-16
- Confianza: media-baja (dos testimonios) · Aplica a: ambos
- Lo contradiría: un taller que mantenga el registro en temporada
- Implicación: H1 y d.7: la captura tiene que sobrevivir a la semana más cargada, no al día tranquilo; el Taller trabaja campañas (Día de la Madre, Fiestas Patrias, Navidad según el prompt, sin dato propio).

### Lo que ya tiene CAYLA (internos)

**H-8.19 · En producción el Taller tiene cuatro cuentas en retail: tres «Integrante» sin ningún módulo y una cuenta «Producción» compartida, la única que ve el módulo; en Dynamic hay tres personas activas con función de Taller. «Terminé N» lo escribe, entonces, una cuenta de aparato con un responsable elegido en un combo.**
- Evidencia: A · Frente 0 (consulta `SELECT` del 2026-10-16, **no la repetí**) y ADR-0161/0162 · consultada 2026-10-16
- Confianza: alta · Aplica a: taller de ~10 operarias
- Lo contradiría: otra fuente de verdad sobre quién trabaja en el Taller
- Implicación: Q1 y H1: hoy la misma cuenta firma para varias personas; con un anotador distinto cada día, el «quién» del dato depende del combo.

**H-8.20 · Las dos pruebas ciegas del módulo hechas con modelos de IA no entendieron 14 y 11 palabras de la pantalla vieja (entre ellas maquila, corrida, avíos, insumos, comprobante).**
- Evidencia: A (documento del repo `docs/formidable/produccion-modulo.md`, rama del rediseño) · **observación de un modelo, no de una colaboradora real** · consultada 2026-10-16
- Confianza: baja para el piso (el ciego traía contexto y entró como líder) · Aplica a: ambos
- Lo contradiría: una prueba con la encargada del Taller
- Implicación: d.4 y vocabulario de ADR-0400: la jerga del sistema ya falló una vez con un lector que no era del oficio; **faltan las palabras de la gente del Taller** (frente 2 y pregunta 10).

**H-8.21 · La literatura de oficio no exige papel para todo: para estilos simples el cortador puede trabajar de memoria sin ticket escrito, y para pedidos chicos basta una sola hoja completa.**
- Evidencia: C · Fashion-Incubator, «What is a cutting ticket?» (2009) · consultada 2026-10-16
- Confianza: baja (blog de una consultora estadounidense) · Aplica a: taller de ~10 operarias
- Lo contradiría: un taller que haya perdido plata por no tener ticket
- Implicación: d.1 («con 10 operarias el papel alcanza»): hay base para pensar que lo mínimo alcanza en lotes chicos, no para decir que alcanza en un lote de 200.

**Resumen del conteo:** 21 hallazgos; 17 con evidencia B o mejor (H-8.1 a H-8.5, H-8.7 a H-8.10, con H-8.10 en su parte B, y H-8.13 a H-8.20; el Frente 10 bajó H-8.6 de B a C) y 4 con evidencia C (H-8.6, H-8.11, H-8.12, H-8.21); contraejemplos en H-8.14, H-8.15 y H-8.21.

---

## 2 · Lo que de verdad se anota (lista priorizada)

Prioridad = cuántas fuentes lo muestran y qué tan cerca están de un taller peruano. **Es lo que aparece en fuentes, no lo que hace el Taller de CAYLA** (eso es pregunta 1).

| # | Qué se anota | Dónde aparece | Evidencia |
|---|---|---|---|
| 1 | Cuántas prendas lleva el pedido, de quién y para cuándo (el cuaderno) | taller de servicio en La Victoria | B · H-8.1 |
| 2 | Cuántas prendas se terminaron en el día (conteo manual) | mismo taller | B · H-8.1 |
| 3 | Qué corte es, con su número y fecha, y cuántas piezas por talla (lo cortado puede salir ±5–10 % de lo previsto) | ticket de corte (oficio); hoja de ruta y orden de producción (Perú, 2007) | C · B (H-8.4, H-8.21) |
| 4 | Entrada de materia prima, con su revisión de calidad | el habilitador en un taller de 44 | B · H-8.3 |
| 5 | Lo que salió a un tercero (cantidad, destino y plazo) y lo que volvió (conteo por talla, dañadas aparte) | páginas de AIMS360 y Jestor, y barcode de Skylark | C · H-8.17 |
| 6 | Reportes de control de calidad y rechazos | empresa limeña de polos; Skylark | B · C · H-8.4 |
| 7 | Guía de ingreso del producto terminado | empresa limeña de polos | B · H-8.4 |
| 8 | Por operaria y por operación, para pagar (cupón con identificación) | patente; Online Clothing Study; solo donde se paga a destajo | C · H-8.11 |

**Lo que no apareció como algo que se anote en un taller chico:** tiempos de ciclo, tendido y consumo real de tela por lote, avance por fase y talla. Los dos primeros son de planta con cronómetro o escáner (C); el tercero lo trata el frente 3. **Esto es un resultado**: el «Terminé N de M por fase, talla y color» de ADR-0400 d.7 no tiene correlato visible en ninguna fuente peruana que encontré.

---

## 3 · Las 10 barreras de adopción (de la más repetida a la menos)

Cuento fuentes independientes por barrera. «En CAYLA» dice si ya se ve en el repo (A/D) o es pregunta.

1. **El dato no le vuelve a quien lo anota (nadie gana con anotar).** Davis 1989 (la utilidad percibida correlaciona con el uso, B), Ávila 2021 (se aceptó porque ayudaba a decidir si aceptar un pedido, B), Quality Magazine y Online Clothing Study 2026 (C, no pude abrir el primero). Contrapunto: Innecco 2022, donde la utilidad no fue significativa (B). **En CAYLA:** el dato hoy lo usa Felipe para costear y decidir; qué recibe la encargada es pregunta 3.
2. **Miedo a que el dato baje la tarifa o sirva para controlar.** Roy 1952, Shearer 2022 (−16 %), Charness 2010, Borino 2018, Ravid 2020, Siegel 2022 (B y C). **En CAYLA:** no se paga a destajo en el Taller según ADR-0400 d.1 (D); aun así, el estrés por ser medido aparece sin destajo (H-8.10).
3. **El conteo ligado a pago se disputa o se maquilla.** Davis 2021 (datos para refutar reclamos, B), patente de 1983 (C), Borino 2018 (supervisores que reportan producción pueden extraer parte del incentivo, B). **En CAYLA:** la Vuelta de un servicio de afuera es un conteo ligado a pago (devengado = buenas × tarifa, d.5); el servicio sí tiene el incentivo.
4. **Se anota tarde, de memoria y con atajos.** Harmoni y Poimapper (C), Online Clothing Study 2026 (los datos de producción se actualizan solo al final del día en piso manual, C), Ayala 2022 (registro manual del día, B). **En CAYLA:** sin dato; depende de cuándo se anota «Terminé N» (pregunta 3).
5. **El cuaderno ya existe: se anota dos veces.** El cuaderno está en Ayala 2022 (B); la doble anotación como causa de abandono la afirma el repo sin fuente (`README` del 13-oct: «lo que mata a los sistemas chicos son los campos que nadie llena», E) y Poimapper (C: dos tercios de los supervisores dedican hasta cuatro horas por turno a conciliar datos, cifra que ellos citan y no pude verificar). **No encontré un estudio independiente de doble digitación en talleres chicos.** **En CAYLA:** pregunta 1.
6. **El aparato no está donde está el trabajo.** INEI 2025 (el celular domina, la tableta casi no existe, B); Prabir Jana 2024 (en costura hay más gente por máquina y es el piso más difícil de digitalizar; C, y su afirmación de que escáner y RFID dan una exactitud parecida a la manual porque dependen de una persona es opinión sin dato). **En CAYLA:** «el Mac mini del Taller» (Frente 0); falta saber dónde está respecto de las mesas.
7. **La jerga: palabras que la gente del piso no usa.** Pruebas ciegas del módulo (A, H-8.20; modelo de IA, no colaboradora real), Nippon Steel Solutions sobre un proyecto en Tailandia (idiomas mezclados, C), OIT-Camboya (quien no lee bien evita la capacitación, B). **En CAYLA:** frente 2 y pregunta 10.
8. **Rotación y roles movedizos.** Ayala 2022 (rotación; 45 % con funciones duplicadas, B), Frente 0 (cuenta compartida y tres «Integrante» sin módulo, A). **En CAYLA:** pregunta 5.
9. **La temporada: en el pico, anotar es lo primero que se suelta.** Ayala 2022 (B); Smart Manufacturing Week, visto solo en la lista del buscador (no lo cuento). **En CAYLA:** pregunta 11.
10. **Poca práctica y confianza digital, y nadie dedicado a enseñar.** INEI 2011 vía Ávila (15,7 % de las mypes de confecciones usa tecnología de proceso, B), INEI 2025 (82,5 % de quienes solo tienen primaria usa celular, B), OIT-Camboya (confianza por práctica, B), Maldonado 2008 (la capacitación y la habilidad informática de la empresa se asocian al éxito de un ERP en pymes latinoamericanas, B, solo resumen), AIMS360 (calza donde hay una persona de producción dedicada, C). **En CAYLA:** pregunta 5.

---

## 4 · Cinco principios de captura de datos en piso

Son reglas de captura, no de pantalla. Cada una dice qué la sostiene y qué no.

1. **El dato nace donde la cosa cambia de manos, no en un acto nuevo.** Los registros que sobreviven en las fuentes pegan con un hecho físico que ya ocurre: el paquete que se recibe, el corte que sale, el lote que vuelve del servicio (cuaderno por pedido, hoja de ruta, guía de ingreso, manifiesto de salida). Sostienen: Ayala 2022 (B), Bonilla 2007 (B), páginas de AIMS360 y Jestor (C). No lo sostiene el avance **dentro** del Taller, que no cambia de manos.
2. **Quien anota recibe algo de vuelta, antes que el dueño.** Es lo que más predice el uso voluntario (Davis 1989, B) y lo que explicó la aceptación en mypes de Lima (Ávila 2021, B). Contra-evidencia: en un uso obligatorio importaron los apoyos y no la utilidad (Innecco 2022, B). Confianza media.
3. **El dato no se vuelve contra quien lo anota, y el propósito se dice.** Sostienen: Roy 1952, Shearer 2022, Charness 2010, Borino 2018 y Ravid 2020 (B). Lo debilita que ninguna es de confección en Lima. Implica separar el conteo que paga del conteo que controla.
4. **Lo mínimo posible, con el valor probable ya puesto, y que se pueda deshacer.** Patrón común en Odoo y MRPeasy (B, documentación); la causa (la fricción produce atajos) la sostienen solo blogs de fabricantes (C, H-8.12). Confianza baja-media.
5. **Vale aunque se anote tarde, y no depende de una sola persona ni de un solo aparato.** Sostienen: rotación y funciones duplicadas (Ayala 2022, B), la cuenta de aparato (Frente 0, A), el retraso y la memoria (Harmoni, C), y que el miedo inicial se pasa con práctica (OIT-Camboya, B). Confianza media.

---

## 5 · Referentes de uso (ocho)

Son **referentes de uso, no de funciones**: qué hace en el piso quien anota. Los cuatro de software vienen de su documentación pública; ninguno trae datos de adopción propios. **No hay capturas** (no abrí el navegador).

| Referente | Qué hace quien anota | Aparato e identificación | Qué enseña (y qué no prueba) |
|---|---|---|---|
| **Cuaderno de pedidos** (taller de servicio de Lima, Ayala 2022) | La encargada o el responsable escribe fecha de entrega, total y cliente; conteo manual del día | Papel; sin identificación | Lo que sobrevive es lo que se cuenta por pedido. No prueba que baste para fase ni talla |
| **Ticket de bulto con cupones** (patente 1983, Online Clothing Study) | La operaria despega el cupón al terminar una operación; o escanea el código al final del bulto | Papel o código de barras; identificación por el cupón o la tarjeta | Es registro **para pagar**; la propia patente lo juzga poco fiable si lo controla quien cobra |
| **Odoo Shop Floor** (doc. oficial) | Elige a la persona en el panel, toca el encabezado de la orden de trabajo (corre el reloj), toca «# unidades» para registrar toda la cantidad; «Deshacer» aparece unos segundos | Navegador en una estación de trabajo; sin PIN descrito | Valor por defecto = todo, con corrección breve. Pensado para estación fija |
| **MRPeasy, «Mi plan de producción»** (doc. oficial) | Inicio, Pausa, Fin; al pausar o terminar pregunta cuántas se completaron desde el último inicio; si difiere del plan, pide confirmar | No especifica aparato | Pregunta la cantidad **cuando el trabajo para**, no al final del día |
| **AIMS360** (página comercial) | «Una persona registra lo ocurrido»: pasa cantidades de etapa en etapa por estilo, color y talla; en la recepción, conteo por talla y dañadas aparte | No especifica; tareas asignadas a personas con nombre | Dice que sirve mejor con alguien de producción dedicada; sin él, lo mínimo son las fechas |
| **Skylark** (Bangladesh; nota de prensa comercial) | Tras el tendido se genera e imprime una tarjeta de bulto con código de barras; al escanear en bordado se crea el documento de traslado; los rechazados llevan otro código | Escáner de código de barras (aparato sin precisar) | Ata el documento al escaneo. Sus cifras (15 % de productividad, implementación en un mes) son de la empresa |
| **Jestor, «manifiesto de salida»** (blog comercial) | Registra cantidad enviada, taller que recibe y plazo | Web | Es la salida a terceros sin ERP de moda. No dice quién lo llena ni cómo se registra el regreso |
| **Excel de una mype de confecciones** (Ávila 2021) | El dueño o alguien de confianza carga pedidos y lee el reporte | Computadora con Windows y Office | Se aceptó por familiaridad. No es herramienta de operaria |

Revisé también la página de Fulcrum (seguimiento de trabajos en tableta): permite iniciar y pausar el reloj de una operación y registrar descartes con su motivo, y dice «extremadamente intuitivo» sin datos (C). No la incluyo en la tabla por ser de talleres metalmecánicos.

---

## 6 · Veredictos sobre H1 y H4

**H1 · «El avance se anota por fase y basta (sin bulto, sin operación, sin operaria): con 10 operarias y un estilo el papel alcanza» → MATIZA.**
- *Confirma:* donde no se paga a destajo, nada obliga a llevar el conteo por operación, y la fuente peruana que vi lleva un cuaderno por pedido más un conteo del día (H-8.1). Capturar por operaria activa el temor documentado a que el dato baje la tarifa (H-8.9) y aumenta el estrés de ser medido (H-8.10). En Perú solo ~8 % de los asalariados de confección cobra por pieza (H-8.7).
- *Matiza:* (1) «con 10 operarias» no tiene respaldo: Frente 0 encontró tres personas activas con función de Taller en Dynamic; (2) «el papel alcanza» omite que el papel que existe hoy es **por pedido**; pasar a «Terminé N por fase, talla y color» es una anotación nueva, y mientras el cuaderno siga vivo se anota dos veces (barrera 5); (3) el 95 % no es evidencia de nada sobre qué se anota (H-8.5); (4) quien anota es una cuenta compartida (H-8.19); (5) si el Taller o un servicio pasara a pagarse por prenda o por operación, el dato por operaria sería el que importa y habría que decidirlo de nuevo.
- *Contradice:* nada de lo que encontré contradice A; no hay fuente que muestre que el dato por bulto salga solo en un taller chico.
- Confianza: media-baja.

**H4 · «Se paga por prenda, con cantidad mínima (150–240) y un fijo opcional» → MATIZA, con evidencia solo indirecta desde este frente.**
- *Apoya:* el pago por unidad es el esquema típico del pago por pieza (Borino 2018, B), y el trabajo por pieza está en quien trabaja fuera de la planilla (H-8.7).
- *Matiza:* dentro de las fábricas el precio por pieza se fija **por operación** (Borino 2018) y existen cuotas diarias o semanales y mezclas con pago por hora (Davis 2021, ~50 % por pieza y ~70 % con alguna cuota en las fábricas de Camboya estudiadas); no encontré fuente pública sobre pago por docena o por kilo en Lima ni sobre mínimos por fase ni sobre adelantos o garantías.
- *Lo que cambia para la adopción:* si el servicio se paga por prenda recibida, el conteo de la Vuelta es el conteo que paga (barrera 3): ambas partes lo cuidarán más y lo discutirán más.
- *Sin evidencia:* el rango 150–240 y el fijo opcional son D (Felipe) y no hay dato público que los respalde o los refute; los frentes 2 y 4 llevan lo local.
- Confianza: baja.

---

## 7 · Contraejemplos (al menos uno por frente: aquí hay cuatro)

1. **Excel familiar sí se adoptó** en dos mypes de confección de Lima, contra la idea de que un sistema nuevo siempre cuesta adopción (H-8.14). Pero lo usó el dueño o alguien asignado, y era planificación, no piso.
2. **La utilidad percibida no predijo el uso** en un sistema de manufactura obligatorio (Innecco 2022; H-8.15): la barrera 1 no es universal.
3. **El papel mínimo alcanza en lotes chicos** (Fashion-Incubator; AIMS360 recomienda solo fechas sin persona dedicada; H-8.17, H-8.21): contra la tesis de que más registro es siempre mejor.
4. **El miedo al dato casi desaparece con competencia** entre quienes contratan (Charness 2010) o con evaluación por grupo: la barrera 2 depende del mercado laboral y de cómo se mide.

---

## 8 · Lo que no encontré

- **Qué se anota hoy en el Taller de CAYLA** (cuaderno, hoja de ruta, WhatsApp, Excel) y quién lo anota: nada en el repo; la visita A0 no consta.
- **Cuántas operarias hay y cómo se les paga** en el Taller o en un taller comparable de Lima: sin dato público; hay que preguntar al Taller.
- **Si se paga «por docena» o «por kilo» a un servicio de Lima, y los mínimos por fase:** no hay dato público; pendiente de los frentes 2 y 4.
- **Uso real de WhatsApp en talleres peruanos:** las búsquedas no dieron nada (y se agotó la cuota). Tampoco hay estudio independiente.
- **Qué hace el habilitador en el Taller:** solo lo vi en un taller de 44 (Ayala 2022). El manual de SENATI no pude abrirlo.
- **Un estudio independiente** de error de captura manual en taller chico, de adopción de seguimiento por bulto en talleres de menos de 20 personas, o de rechazo de operarias a una herramienta de piso: **no existe en lo que alcancé**. Lo que hay es de fabricantes.
- **Los factores concretos de Snider et al. (2009)** sobre ERP en pymes: la ficha dice que hay factores «contraintuitivos» pero no los lista; el texto está tras pago.
- **El estudio sectorial de PRODUCE (Textil y Confecciones 2020)** y el de CAF/ADEX sobre subcontratación no pude abrirlos; ahí podrían estar la forma de pago y el tamaño típico de taller.
- **Cuánto tarda en estabilizarse el registro** en un taller tras instalar un sistema: no hay dato.

---

## 9 · Preguntas que solo CAYLA puede contestar

(HECHO = solo CAYLA sabe cómo es. DECISIÓN = preferencia de Felipe. Para la ronda de 36; en lenguaje de tienda.)

1. **HECHO · Lo que se anota hoy.** «Cuando una tanda pasa de corte a costura y de costura a acabado, ¿alguien lo anota en algún sitio (cuaderno, hoja que viaja con el lote, WhatsApp, Excel)? ¿Me mandas una foto de lo que anotaron esta semana?» *Condiciona:* H1; si ya hay un papel por fase, «Terminé N» lo reemplaza o se suma.
2. **HECHO · Cuánta gente y cómo cobra.** «¿Cuántas personas cortan, cosen, planchan y empacan hoy en el Taller, y de esas, cuántas cobran por prenda, por día o por mes?» *Condiciona:* H1, H4 y el miedo al dato (barrera 2).
3. **HECHO · Cuándo se enteran.** «Cuando una operaria termina una tanda, ¿a quién le avisa y cuándo se cuenta (al terminar, al final del día, a la semana)?» *Condiciona:* cuándo conviene anotar (barrera 4).
4. **HECHO · El aparato y la distancia.** «¿Qué aparato hay a la mano en el Taller para anotar (la Mac mini, el celular de la encargada, otro) y qué tan lejos está de las mesas de corte y de costura? ¿Hay internet bueno ahí?» *Condiciona:* barrera 6.
5. **HECHO · La persona fija.** «¿Quién reparte el trabajo y recibe lo cortado y lo terminado? ¿Es siempre la misma? ¿Qué pasa cuando falta?» *Condiciona:* Q1 (quién anota) y barreras 8 y 10.
6. **HECHO · El conteo del servicio.** «Cuando un servicio de afuera devuelve las prendas, ¿cómo se cuentan y quién confirma la cantidad? ¿Ha habido discusión por cantidades?» *Condiciona:* la Vuelta y la barrera 3.
7. **HECHO · Lo que se dejó.** «¿Alguna vez probaron llevar la producción en Excel, una app o un sistema y lo dejaron? ¿Por qué lo dejaron?» *Condiciona:* la causa raíz de abandono en esta marca.
8. **DECISIÓN · Quién ve qué.** «Si el sistema algún día muestra cuántas prendas terminó cada persona del Taller, ¿quién debe verlo: solo el líder, también la persona, o nadie?» *Condiciona:* barrera 2; hoy ADR-0400 no registra operaria.
9. **HECHO · Palabras del Taller.** «¿Cómo les dicen en el Taller a: la tanda cortada, el paquete que pasa a costura, lo que sale a un servicio y lo que vuelve?» *Condiciona:* vocabulario (barrera 7; frente 2).
10. **HECHO · La semana pesada.** «¿En qué meses el Taller trabaja con horas extra y qué deja de hacerse en esos días?» *Condiciona:* barrera 9.
11. **DECISIÓN · Una persona o todas.** «¿Prefieres que solo la encargada anote el avance en una pantalla fija, o que cada operaria pueda marcarlo desde su celular?» *Condiciona:* Q1 y las barreras 8 y 10. (No reabre nada: ADR-0400 no decidió el aparato.)

---

## 10 · Fuentes

Fecha de consulta de todas: **2026-10-16**. «Vivo» = abrió. Los PDF que la herramienta guardó solos se convirtieron a texto en el scratchpad; ninguno entra al repo.

| ID | Nivel | Fuente | URL | Estado |
|---|---|---|---|---|
| S1 | B | Ayala, K. (2022). *Gestión de procesos para mejorar la productividad en un taller de confección, Lima 2022*. Tesis de licenciatura, UWiener | https://repositorio.uwiener.edu.pe/bitstream/handle/20.500.13053/7031/T061_74579359_T.pdf?sequence=1 | vivo |
| S2 | B | Bonilla, E. (2007). Diseño de un sistema de producción modular en una mediana empresa de confecciones. *Ingeniería Industrial* n.º 25, Univ. de Lima, pp. 11–32 | https://www.redalyc.org/pdf/3374/337460076001.pdf | vivo |
| S3 | B | Ávila, M. R. (2021). Sistema informático para la planificación de la producción en micro y pequeñas empresas de confecciones. *Ingeniería Industrial* n.º 40, pp. 15–32 | https://doi.org/10.26439/ing.ind2021.n40.5146 (redirige a https://revistas.ulima.edu.pe/index.php/Ingenieria_industrial/article/view/5146) | vivo |
| S4 | C (gremio; bajado de B por el Frente 10) | SNI-IEES (2021). *Reporte sectorial: Industria textil y confecciones* | https://sni.org.pe/wp-content/uploads/2022/01/27-Industria-Textil-y-Confecciones.pdf | vivo |
| S5 | B | INEI (2026). *Las TIC en los hogares, IV trimestre de 2025* | https://www.inei.gob.pe/media/MenuRecursivo/boletines/boletin-tic-oct_dic2025.pdf | vivo |
| S6 | B | Borino, F. (2018). *Piece rate pay and working conditions in the export garment sector*. OIT-Better Work, DP 28 | https://betterwork.org/wp-content/uploads/DP-28-Piece-rate-pay-and-working-conditions-in-the-export-garment-sector_Final.pdf (ficha: https://www.betterwork.org/?p=17848) | vivo |
| S7 | B | Davis, M. (2021). *Piece rate, productivity, and occupational health in the global economy*. OIT-Better Work, DP 44 | https://betterwork.org/wp-content/uploads/DP-44-Piece-Rate-Productivity-and-Occupational-Health-in-the-Global-Economy.pdf | vivo |
| S8 | B (solo resumen) | Shearer, B. (2022). Piece-rate cuts and ratchet effects. *Canadian Journal of Economics* 55(3) | https://ca.vlex.com/vid/piecerate-cuts-and-ratchet-1042749607 (DOI 10.1111/caje.12607) | vivo |
| S9 | B | Charness, G., Kuhn, P. y Villeval, M.-C. (2010). *Competition and the ratchet effect*. NBER WP 16325 | https://www.nber.org/papers/w16325.pdf | vivo |
| S10 | B (solo resumen) | Roy, D. (1952). Quota restriction and goldbricking in a machine shop. *American Journal of Sociology* | https://synapsesocial.com/papers/W1982156277 (DOI 10.1086/221011) | vivo (agregador) |
| S11 | B | Ravid, D. y otros (2020). A meta-analysis of the effects of digital surveillance of workers | https://www.microsoft.com/en-us/research/publication/a-meta-analysis-of-the-effects-of-digital-surveillance-of-workers-a-psychology-focused-approach/ | vivo |
| S12 | C (ficha del buscador) | Siegel, König y Lazar (2022). *Computers in Human Behavior Reports* 8 | https://doi.org/10.1016/j.chbr.2022.100227 | ScienceDirect 403; no abrí el texto |
| S13 | B (ficha) | Davis, F. (1989). Perceived usefulness, perceived ease of use, and user acceptance of information technology. *MIS Quarterly* 13(3) | https://doi.org/10.2307/249008 | MISQ 403; no abrí el texto |
| S14 | B | Innecco, Martins y Gonçalves (2022). Use of the Manufacturing Execution System in practice. *GEPROS* 17(2) | https://revista.feb.unesp.br/gepros/article/download/2863/pdf/9525 (DOI 10.15675/gepros.v17i2.2863) | vivo |
| S15 | B | OIT-Better Factories Cambodia / Lawreniuk. *Navigating wage digitization: a rapid qualitative review of garment workers' experience in Cambodia* | https://www.betterwork.org/wp-content/uploads/Navigating-Wage-Digitization-A-Rapid-Qualitative-Review-of-Garment-Workers-Experience-in-Cambodia.pdf | vivo; sin fecha visible |
| S16 | B (ficha) | Maldonado, M. (2008). El impacto de los factores críticos de éxito en la implementación de sistemas integrados de ERP. *Cuadernos de Difusión* 13(25) | https://alicia.concytec.gob.pe/vufind/Record/ESAN_da38868eab1239e23991dfdeb05a282c/Details | vivo (solo resumen) |
| S17 | B (ficha) | Snider, da Silveira y Balakrishnan (2009). ERP implementation at SMEs: analysis of five Canadian cases. *IJOPM* | https://ucalgary.scholaris.ca/items/c1e3784a-00db-4025-adf5-673d0db52a2a/full | vivo (resumen; factores no listados) |
| S18 | C | Patente US 4,408,291 (1983), *Point-of-manufacture data acquisition system* | https://patents.google.com/patent/US4408291A/en | vivo |
| S19 | C | Online Clothing Study (2012). Bundle tickets, individual performance bonus and grouping of operations | https://www.onlineclothingstudy.com/2012/09/bundle-tickets-individual-performance.html | vivo |
| S20 | C | Online Clothing Study. Real-time production tracking system by scanning bundle tags | https://onlineclothingstudy.com/?p=9024 | vivo |
| S21 | C | Sah, N. (2026). From manual to digital: shift in apparel production floor. *Online Clothing Study* | https://www.onlineclothingstudy.com/2026/03/from-manual-to-digital-shift-in-apparel.html | vivo |
| S22 | C | Jana, P. (2024). Digitalisation of sewing floor: the current tech map. *Apparel Resources* | https://apparelresources.com/?p=272855 | vivo |
| S23 | C | Fashion-Incubator (2009). What is a cutting ticket? | https://fashion-incubator.com/what-is-a-cutting-ticket/ | vivo |
| S24 | C | Harmoni. How accurate is shop tracking | https://harmoni.io/feeds/blog/accurate-shop-tracking | vivo |
| S25 | C | Poimapper. Why do small manufacturers struggle with inconsistent production data | https://www.poimapper.com/?p=13997 | vivo |
| S26 | C | NS Solutions Thailand. The reality of the Thailand local MES implementation (2) | https://global.nssol.nipponsteel.com/th/column/the-reality-of-the-thailand-local-mes-implementation-2.html | vivo |
| S27 | B | Odoo 18. Shop Floor overview | https://www.odoo.com/documentation/18.0/applications/inventory_and_mrp/manufacturing/shop_floor/shop_floor_overview.html | vivo |
| S28 | B | MRPeasy. My production plan, details | https://www.mrpeasy.com/resources/user-manual/reporting/my-production-plan/details/ | vivo |
| S29 | C | AIMS360. Production process tracking | https://www.aims360.com/features-integrations/production-process-tracking | vivo |
| S30 | C | Fulcrum. Job tracking | https://fulcrumpro.com/software/job-tracking | vivo |
| S31 | C | Skylark advances apparel cloud-based production tracking. *Apparel Resources BD* | https://bd.apparelresources.com/technology-news/manufacturing-tech/skylark-advances-apparel-industry-cloud-based-production-tracking-system/ | vivo |
| S32 | C | Jestor. Garment production control | https://blog.jestor.com/garment-production-control-tracking-production-from-sample-to-delivery/ | vivo |
| S33 | A/D | Repo: ADR-0400 y `docs/investigacion/2026-10-13-produccion-rediseno/README.md` y `docs/formidable/produccion-modulo.md` (rama `claude/production-module-redesign-136cca`, vía `git show`); `docs/datos/15-COMO-OPERA-CAYLA.md`; `00-arqueologia-interna.md` | — | vivo |

**Intentadas y sin abrir (quedan sin verificar):** manual de SENATI (https://www.senati.edu.pe/sites/default/files/escritorio/Comunicados/PUBLICACIONES-19/manual-uniforme-senati-act.pdf, error de lectura) · tesis de UNMSM sobre talleres externos (https://eventosindustrial.unmsm.edu.pe/upg_old/archivos/TESIS2018/MAESTRIA/tesis8.pdf, error de certificado) · estudio CAF/ADEX (https://scioteca.caf.com/…, llegó vacío) · estudio sectorial de PRODUCE (sin respuesta) · entrevista de Fibre2fashion al fundador de ScanERP (error 405) · doaj.org (403) · Emerald (pago).

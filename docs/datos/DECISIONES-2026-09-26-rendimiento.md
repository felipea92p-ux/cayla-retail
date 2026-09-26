# DECISIONES — acta de la ronda de 20 preguntas sobre Rendimiento (2026-09-26)

**Quién decide:** Felipe, en 5 bloques de 4 preguntas (`AskUserQuestion`, la opción recomendada primero), durante la
sesión de la rama `claude/performance-module-ranking-2c657d`. Antes de responder, Felipe lo habló con **el gerente**.
Continúa la numeración de [`DECISIONES-2026-09-21-menu-comercial.md`](DECISIONES-2026-09-21-menu-comercial.md), que
llega hasta D-91. **Este acta manda sobre aquel en lo que cambia** (D-64, D-66, D-68): allí quedó una nota fechada
debajo de cada uno, sin borrar el texto original.

**El pedido, en palabras de Felipe:** un módulo de desempeño, al final del menú lateral, para ver quién vende más, «como
una especie de ranking de rendimiento», con otros parámetros además de la venta. El Admin ve a todo el mundo y filtra por
sede o por parámetro; la encargada ve solo su tienda; la colaboradora ve cómo va ella. **La tercera parte cambió durante
la ronda:** ver D-93.

**Dónde sigue:** el diseño técnico está en [ADR-0219](../adr/0219-rendimiento-ventas-de-cada-persona.md) y la
referencia visual en [`docs/maquetas/rendimiento-spike-2026-09/`](../maquetas/rendimiento-spike-2026-09/). Nada está
construido ni en producción.

---

## Lo que se miró antes de preguntar (solo lectura, 2026-09-26)

| Dato | Valor | De dónde |
|---|---|---|
| Ventas reales en el ERP | **7**, todas de Tienda TRU, desde el 2026-09-24; las 7 con quien atendió (`ventas.asesora_id`), de 4 personas distintas | producción, `retail.ventas` |
| Ventas en AQP y Lima | 0: todavía no registran en el ERP | producción |
| Cuentas activas de retail | 25: 17 Integrantes (12 TRU, 2 AQP, 3 Taller) y 8 Líderes sin tienda asignada | `retail.colaboradores` |
| Los 8 Líderes, según Dynamic | 5 Admin (Central) y 3 que no lo son (Oficina TRU) | `public.personas.rol` |
| «Encargada de Tienda» en Dynamic | 7 Integrantes de retail son `supervisor_sede` en Dynamic: 4 TRU, 1 AQP, 2 Taller. Retail no los distingue | `public.personas` |
| Horas trabajadas | 64 de las 70 jornadas de TRU de la última semana tienen horas (91 %); AQP tiene 15 jornadas; Lima, 0 | `public.jornadas` |
| Quién agrupa por asesora hoy | Nadie. `fn_comercial_colaboradoras` (`/comercial`, fuera del menú y de producción) agrupa por quien firma (`usuario_id`), que en un apartado es otra persona | migraciones |
| Decisiones previas del tema | D-62 a D-79 (2026-09-21). No se volvieron a preguntar | acta del 21-sep |

---

## Las 20 preguntas

La opción recomendada iba primero. **Felipe eligió algo distinto de la recomendación en las preguntas 3, 7, 13 y 20.**

| # | Pregunta | Opciones ofrecidas | Respuesta |
|---|---|---|---|
| 1 | ¿Para qué se van a usar las cifras? (varias) | Reconocer y acompañar · Pagar comisión o bono · Decidir turnos o personal · Evaluación formal de DO | Reconocer y acompañar |
| 2 | ¿Hoy cobran algo variable según lo que venden? | No, ni está en planes · No, pero quiero empezar · Sí, un % · Sí, un bono por meta | No, ni está en planes |
| 3 | ¿Qué ve una colaboradora de sus compañeras? | **Su puesto, no montos (rec.)** · Ranking de su tienda · Solo sus propias cifras · Ranking de todas las tiendas | *Respuesta propia:* «Por ahora que este módulo no lo vean las colaboradoras, ya que hablando con el gerente, esto generaría más caos actualmente, así que solo las encargadas y el admin» |
| 4 | ¿Cada cuánto se cierra un ranking? | **Mes calendario (rec.)** · Quincena · Semana · Por campaña | Mes calendario |
| 5 | Si el orden de un solo mes tiene bastante azar, ¿cómo quieres el período? *(se volvió a preguntar: ver «Corrección durante la ronda»)* | **Mes con muestra a la vista (rec.)** · Últimos 3 meses (D-66) · Mes y 3 meses lado a lado | Mes con muestra a la vista |
| 6 | ¿Cómo sabe el sistema quién es la encargada? | **Con un rol en Roles y accesos (rec.)** · Lo que diga Dynamic · Hacerla Líder de su tienda (D-69) | Con un rol en Roles y accesos |
| 7 | ¿Quién ve el desempeño de todas las tiendas? | **Los 8 Líderes (rec.)** · Solo los 5 Admin | **Solo los 5 Admin** |
| 8 | ¿La encargada aparece en el ranking de su tienda? | **Sí, si vende (rec.)** · No, solo lo mira | Sí, si vende |
| 9 | ¿Quién corrige una venta puesta a nombre de otra persona? | **La encargada, con motivo (rec.)** · Solo el Admin · Nadie | La encargada, con motivo |
| 10 | Un apartado lo hace una y lo entrega otra: ¿de quién es la venta? | **De quien lo apartó (rec.)** · De quien lo entregó | De quien lo apartó |
| 11 | Dos atendieron juntas a la misma clienta | **Se la lleva una sola (rec.)** · Se reparte entre las dos | Se la lleva una sola |
| 12 | Ventas por WhatsApp y redes | **Igual, para quien atendió (rec.)** · Aparte, marcando el canal · Hoy no pasan por el ERP | Igual, para quien atendió |
| 13 | ¿Con qué cifra se ordena el ranking? | **Soles por hora trabajada (rec.)** · Soles del mes · Número de ventas · Ticket promedio | *Respuesta propia:* «1 y 3» → **dos rankings**: soles por hora y número de ventas |
| 14 | ¿Qué más, además de las cifras de venta de D-63? (varias) | Cuadre de caja al cerrar · Apartados que se concretan · Bajada al piso a tiempo · Asistencia y puntualidad | Cuadre de caja al cerrar · Bajada al piso a tiempo |
| 15 | ¿Qué muestra la ficha de una colaboradora? (varias) | Qué categorías y prendas vende · Su evolución mes a mes · Sus ventas una por una · Comparada con su tienda | Las cuatro |
| 16 | «Todas las tiendas», para el Admin | **Agrupado por tienda (rec.)** · Una sola lista mezclada | Agrupado por tienda |
| 17 | ¿Metas por persona ahora? (D-64) | **Todavía no (rec.)** · Sí, la encargada la reparte · Sí, repartida sola por horas | Todavía no |
| 18 | ¿Relación con el «rendimiento del mes» y los objetivos de Dynamic? | **Ninguna por ahora (rec.)** · Mostrarlo aquí · Que las cifras alimenten Dynamic | Ninguna por ahora |
| 19 | ¿Entra el Taller? | **No por ahora (rec.)** · Sí, empezar a registrar quién produce | No por ahora |
| 20 | ¿Cómo se llama el módulo en el menú? | **Desempeño del equipo (rec.)** · Desempeño · Ventas por persona | *Respuesta propia:* **«Rendimiento»** |

**Corrección durante la ronda.** En la pregunta 4 la opción recomendada decía que con un mes «el orden no es azar». Era
falso, y D-66 ya lo había calculado. Con 30 a 80 ventas por persona al mes, el total de cada una se mueve entre 15 y
20 % por suerte, y una colaboradora que rinde 20 % más que otra igual queda por debajo entre 1 de cada 4 y 1 de cada 7
meses. Se le dijo a Felipe y se volvió a preguntar en la 5, con el dato correcto.

---

## Decisiones

**D-92 · Para qué sirve** → **reconocer y acompañar. Sin dinero, y no está en planes** (confirma D-65). Las cifras sirven
para felicitar a quien va arriba y para detectar qué le falta a cada persona: pocas prendas por venta, mucho descuento o
poca venta por hora. No sirven para pagar. *(Preguntas 1 y 2.)*

**D-93 · Quién ve el módulo** → **por ahora, las colaboradoras no lo ven**, ni siquiera sus propias cifras. Felipe,
después de hablar con el gerente: «esto generaría más caos actualmente». Lo ven dos niveles:
- **Los 5 Admin ven todas las tiendas.** Los 3 Líderes que no son Admin no tienen tienda asignada, así que no ven la
  entrada del menú.
- **La encargada ve su tienda.**

Una terminal compartida nunca lo ve. **Cambia D-68 y deja en pausa el top 3 visible entre compañeras de D-66.**
*(Preguntas 3 y 7.)*

**D-94 · Quién es la encargada** → quien tiene un **rol de Roles y accesos con el módulo encendido**. Ve la tienda a la
que está asignada (`ubicacion_asignada_id`). No se lee el `supervisor_sede` de Dynamic: el acceso lo decide el líder en
retail, como en todo módulo (ADR-0161). Y no se construye D-69 para esto. *(Pregunta 6.)*

**D-95 · Período** → **mes calendario, con la muestra a la vista.** Cada persona lleva al lado su número de ventas y la
marca «muestra chica» cuando tiene menos de 40, que es el umbral de D-66. La ventana de 3 meses de D-66 no se usa.
*(Preguntas 4 y 5.)*

**D-96 · La encargada en el ranking** → **entra si vende**, marcada como encargada. Si no vende, no aparece.
*(Pregunta 8.)*

**D-97 · Corregir quién atendió** → **la encargada lo corrige, con motivo.** Queda registrado quién lo cambió, cuándo y
por qué, y el dato original no se borra. D-65 ya pedía guardar las reasignaciones. **Pendiente de Felipe** (objeción del
ADR-0219): la encargada no puede darse una venta ni quitarse una suya; esas las corrige el Admin, igual que en
devoluciones, donde quien la registra no la aprueba (ADR-0177). Si Felipe no responde, se construye con ese candado.
*(Pregunta 9.)*

**D-98 · Apartados** → la venta es **de quien lo apartó**, que es como ya funciona `entregar_separacion`.
*(Pregunta 10.)*

**D-99 · Venta atendida entre dos** → **se la lleva una sola**, la que la cerró. No se agrega un paso al cobro en hora
punta (R-14). *(Pregunta 11.)*

**D-100 · WhatsApp y redes** → **cuentan igual, para quien atendió el chat.** Si una sola persona atiende todos los
chats, su cifra destaca y la encargada debe saber por qué. Separar el canal (R-42) queda fuera. *(Pregunta 12.)*

**D-101 · Cómo se ordena** → **dos rankings lado a lado**: «Vende más por hora» (soles por hora trabajada, con las horas
de la asistencia de Dynamic) y «Cierra más ventas» (número de ventas). Así se reconoce a quien vende grande y a quien
atiende a muchas clientas, más de una categoría como pedía D-66. La tabla de abajo tiene todas las cifras y se ordena
por cualquiera: es el «filtrar por campo de desempeño» del pedido. *(Pregunta 13.)*

**D-102 · Además de la venta** → **cuadre de caja al cerrar** (faltantes y sobrantes de las cajas que cerró) y **bajada al
piso a tiempo** (unidades que bajó y cuántas tarde). Asistencia, puntualidad y apartados concretados quedaron fuera.
*(Pregunta 14.)*

**D-103 · Ficha de cada persona** → qué categorías y prendas vende, su evolución mes a mes, sus ventas una por una (con
«Corregir quién atendió») y cada cifra comparada con la de su tienda. *(Pregunta 15.)*

**D-104 · Todas las tiendas** → **agrupado por tienda**, nunca un ranking mezclado: TRU vende unas 2,5 veces lo que AQP
por el tráfico de la tienda, no por el equipo. *(Pregunta 16.)*

**D-105 · Metas por persona** → **todavía no** (D-64 sigue sin construir). El módulo muestra el avance de la tienda
contra su meta del mes y cuánto aportó cada persona. *(Pregunta 17.)*

**D-106 · Dynamic** → **ninguna relación por ahora** con el «rendimiento del mes» (`rendimiento_mensual`) ni con los
objetivos del mes. Retail muestra lo que se mide en la tienda; DO evalúa en Dynamic. Por eso Rendimiento nunca resume a
una persona en una sola nota: así no hay dos notas distintas para la misma persona. *(Pregunta 18.)*

**D-107 · Taller** → **no por ahora**: no se registra quién corta o cose cada prenda. *(Pregunta 19.)*

**D-108 · Nombre y lugar** → **«Rendimiento»**, última entrada del menú lateral (después de Finanzas). En Roles y accesos
va en el grupo Gestión. Clave del módulo: `rendimiento`. *(Pregunta 20 y el pedido.)*

---

## Lo que se aplicó sin volver a preguntar

- **D-63:** qué se mide por persona: ventas en soles y en prendas, ticket promedio, prendas por venta, descuentos y %
  vendido a precio completo.
- **D-65:** sin dinero.
- **D-76:** nunca se ordena por registrar clientas.
- **D-78 y D-79:** nunca se ordena por devoluciones ni por el motivo de un cambio. **Las devoluciones no restan de la
  venta.**

---

## Abierto

| Qué | Quién |
|---|---|
| El ok al diseño técnico del ADR-0219 y a la objeción de D-97 | Felipe |
| Filtro de tienda de la pantalla y sede de la cabecera: para el Admin, ¿la pantalla abre en «Todas» o en la sede elegida arriba? El spike abre en «Todas» | Felipe, al ver el spike |
| Inicio le muestra a cada colaboradora «Tus ventas» con el total de toda su tienda: `fn_ventas_del_dia` filtra por tienda, no por persona (verificado en producción). Hay una tarea aparte para corregirlo | Felipe decide qué debe mostrar |
| Tienda Lima no tiene personal ni asistencia cargados en Dynamic (D-62). Sin eso no hay soles por hora ni quién atendió | DO |
| El día que las colaboradoras vean sus cifras: retomar D-68, el top 3 de D-66 y la meta por persona de D-64 | Felipe con el gerente |

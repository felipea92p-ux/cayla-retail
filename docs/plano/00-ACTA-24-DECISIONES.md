# Acta de las 24 decisiones del plano maestro

> **Fecha:** 2026-09-21 · **Quién decide:** Felipe Alvarez (CEO y fundador) · **Cómo se tomaron:** 24 preguntas
> de opción múltiple, en 6 tandas, contra un mapeo previo del repo (9 lectores, solo lectura).
> **Numeración:** `PL-01` … `PL-24` (PL = plano). No choca con `D-xx` (acta del 2026-09-12), `R-xx` (reglas del
> negocio) ni `A-xx` (abiertas).
>
> **Qué autoridad tiene:** es del nivel 2 de la jerarquía (PL-13): manda sobre la prosa, no sobre la base real.
> Donde este acta contradice a `docs/datos/DECISIONES-2026-09-12.md`, se indica y este acta gana desde hoy.

Cada decisión lleva las tres líneas que prueban que hubo criterio: **DECIDÍ**, **DESCARTÉ** (con su costo),
**SE ROMPE SI** (el escenario concreto, no consultoría vacía).

---

## Bloque 1 — Finalidad y horizonte

### PL-01 · Finalidad
**DECIDÍ:** la finalidad #1 es **operar CAYLA con orden, mostrador primero**. «Vendible a otra marca» es solo
criterio de calidad: nada se modela para un tercero (sin `tenant_id`; D-50: cada marca, su propia base).
**DESCARTÉ:** meta paralela de producto vendible desde hoy — cada tarea tendría dos jefes (operar TRU y generalizar) y
un equipo de dos constructores fijos se parte en dos.
**SE ROMPE SI:** una marca pide el sistema en los próximos 12 meses y retail sigue enredado con la identidad de Dynamic
(ver PL-07).

### PL-02 · Éxito a 3 años
**DECIDÍ:** funcionó si el ERP logra **mejor gestión y entendimiento del negocio, mejor toma de decisiones y
transaccionar de forma inteligente** (qué comprar, qué liquidar, qué tendencia hay); si hay **más sedes y canal
online**; y si **otra marca lo usa**. No se marcó «cero Excel» ni «el contador cierra desde el ERP».
**DESCARTÉ:** medir el éxito por apagar el Excel: es un medio, no un fin, y dejaría fuera lo que dijo que importa
(decidir mejor).
**SE ROMPE SI:** los tableros de decisión se construyen sobre datos incompletos (ver PL-05 y PL-06): un número
equivocado en un tablero se cree más que uno vacío.

### PL-03 · Qué es «terminado»
**DECIDÍ:** un módulo está terminado cuando cumple **lo técnico y el ciclo real**: pantalla viva en el menú, permiso,
candado en la base, diccionario al día, **y** una sede lo operó un ciclo completo con datos reales.
**DESCARTÉ:** «solo técnica» — es lo que pasa hoy: Producción F0-F8 está «construida» con 0 compras reales.
**SE ROMPE SI:** se marca «terminado» un módulo que ninguna sede ha usado: el equipo cree que avanza y el mostrador no
lo nota.

### PL-04 · Corte de los sistemas viejos
**DECIDÍ:** **sede por sede, TRU primero**. Felipe prefiere levantar toda la información con este sistema y ordenarse
poco a poco: hace meses que dejó de registrar en los sistemas anteriores, hay pérdida de datos y cientos de apuntes
sin ordenar.
**DESCARTÉ:** corte único en una fecha — si falla el día uno, fallan tres tiendas y el Taller a la vez.
**SE ROMPE SI:** conviven los dos sistemas sin fecha de corte por sede: nunca se apaga nada.

## Bloque 2 — Prioridad, alcance y arranque de datos

### PL-05 · Qué gana cuando dos frentes compiten
**DECIDÍ:** **registro fiel primero**, y la fase de levantar datos es **corta** («no voy a demorar tanto»).
Fidelización de clientas y Producción más allá de F0-F8 **no se congelan**, pero van después.
**DESCARTÉ:** inteligencia primero — decidir sobre ~15 ventas de prueba y ~45 de ~900 SKUs da ruido con cara de
precisión.
**SE ROMPE SI:** la «fase corta» se estira sin fecha y el equipo vuelve al rediseño visual mientras el mostrador sigue
en prueba.

### PL-06 · Cómo entra lo histórico
**DECIDÍ (versión final, corrige la primera pasada de este bloque):** **ahora**, mientras TRU sale en vivo esta
semana, la mercadería sigue entrando **poco a poco, sin censo formal** — igual que decidió Felipe en la ronda de
60 preguntas del 2026-09-12 (`[[cayla-decisiones-60-preguntas-2026-09]]`, Bloque 1). El **censo físico con fecha de
corte queda para después**, cuando TRU ya esté operando; ahí sí se convierte en el saldo inicial formal del núcleo, y
las diferencias que aparezcan entran como **ajuste**, nunca reescribiendo lo ya vendido. Los apuntes de meses
anteriores (el historial suelto, sin registrar) van a una **bandeja** que se ordena despacio, **sin tocar el stock**
mientras tanto.
**DESCARTÉ:** exigir el censo antes de salir — frenaría el lanzamiento de esta semana, que es la prioridad (PL-01,
PL-05). También descarté reconstruir meses en `movimientos` con fechas pasadas: el stock se deriva de `movimientos`;
un solo apunte faltante rompe el saldo y contamina la única fuente de verdad.
**SE ROMPE SI:** pasa el primer mes de TRU en vivo y el censo con fecha de corte sigue sin agendarse — entonces el
stock nunca tuvo un punto cero verificado y toda alerta de reorden es sospechosa desde el día uno. **Pendiente
(bloquea PL-03 «terminado»):** fijar esa fecha de censo una vez arrancado.

### PL-07 · Retail frente a Dynamic
**DECIDÍ:** **diferir con guardarraíl**: retail sigue dentro de Dynamic, pero la identidad y el rol de Dynamic se
consumen **desde un solo punto**, para que separarlos cueste días y no meses.
**DESCARTÉ:** retail autocontenido hoy — sacar login, roles y base a un proyecto propio es trabajo de meses justo
cuando la meta #1 es salir en vivo en TRU.
**SE ROMPE SI:** cada migración nueva llama funciones de Dynamic por su cuenta: el costo de separar sube sin que nadie
lo vea (hoy nadie vigila esta regla).

### PL-08 · Qué queda «no ahora»
**DECIDÍ:** **contabilidad completa** (partida doble, PLE, estados financieros) y **canal online** quedan escritos
como pendiente con dueño; no se construyen todavía. Urraca (contabilidad) queda en pausa.
**DESCARTÉ:** retomar Finanzas en paralelo — fue borrada en el corte V2 y no se marcó al contador como criterio de
éxito.
**SE ROMPE SI:** el contador necesita un cierre de mes antes de que exista el plan que lo cubra: se rehace a mano.

## Bloque 3 — Gobierno

### PL-09 · Quién lleva qué (pájaros)
**DECIDÍ:** Felipe lleva **Halcón, Loro, Lechuza y Gorrión** (Loro absorbe la importación de catálogo). **Tucán,
Golondrina y Urraca** quedan en pausa. Propuesta vigente salvo objeción: Dany lleva **Colibrí y Cuervo**; CuervoCayla
lleva **Ganso**; faltan **Pelícano, Gallito, Garza y Águila**.
**DESCARTÉ:** que cada quien se apunte solo — los módulos que nadie quiere siguen libres sin que nadie lo note.
**Modifica:** `docs/datos/07-GOBIERNO.md` §1 («nadie reparte los pájaros desde arriba»).
**SE ROMPE SI:** un dueño está ausente semanas y su módulo se traba (Colibrí no commitea desde el 2026-09-15).
*(La regla de caducidad —dueño inactivo 14 días vuelve a libre— se propuso pero no se confirmó.)*

### PL-10 · Protección de `main`
**DECIDÍ:** **PR + CI obligatorios**; revisión humana solo para lo transversal (esquema, RLS, `menu.ts`, `AppShell`).
**DESCARTÉ:** «sigue como hoy» — Felipe fusionó 118 de los últimos 120 PR con mediana de 9 minutos y 0 revisiones; el PR
#243 (86 archivos) pasó en 3 minutos.
**SE ROMPE SI:** alguien fusiona una migración con timestamp repetido o una tabla sin candado y llega a producción sin
que nadie la vea. *Pendiente: solo el admin del repo (Felipe) puede activar la regla.*

### PL-11 · Cómo llega el SQL a producción
**DECIDÍ:** **Felipe + un segundo pegador** nombrado, con regla «SQL antes que web» y verificación después.
**Modifica:** D-11 («solo Felipe pega SQL en producción»).
**DESCARTÉ:** solo Felipe con cola visible — factor de autobús 1; hoy Apartar stock está en `main` sin sus 3 funciones
en producción y 3 pantallas fallan.
**SE ROMPE SI:** el segundo pegador aplica sin ensayo previo: dos llaves de producción sin disciplina son peor que una.

### PL-12 · Quién decide y cómo se fija el foco
**DECIDÍ:** Felipe fija **un objetivo de negocio por quincena**; el dueño decide dentro de su pájaro; lo que cruza
módulos (esquema, contratos) se cierra con un ADR de Felipe.
**DESCARTÉ:** consejo técnico de 2-3 personas — más reuniones y decisiones de negocio diluidas.
**SE ROMPE SI:** Felipe es el único desempate de lo transversal y no está una semana.

## Bloque 4 — Fuente de verdad y documentación

### PL-13 · Qué manda cuando dos documentos difieren
**DECIDÍ:** jerarquía de 3 niveles: **1)** la base real (volcado generado); **2)** el acta D-01…D-52, este acta y los
ADR vigentes; **3)** la prosa.
**DESCARTÉ:** «el ADR más reciente» — 72 ADR viven solo en ramas y los de la era V1 siguen «Aplicado».
**SE ROMPE SI:** no se regenera el volcado tras cada migración pegada: el nivel 1 miente.

### PL-14 · Qué se hace con lo anterior a V2
**DECIDÍ:** **archivar a `docs/historico/`** con aviso arriba (PLAN-DE-TRABAJO, CHECKLIST-MANANA, ANALISIS-SINATRA,
Index.html, 00-MAPA V1). Nunca borrar.
**DESCARTÉ:** reescribir todo sobre V2 — semanas de documentación cuando pidió «un sistema que funcione».
**SE ROMPE SI:** los enlaces entre documentos quedan rotos y nadie los corrige.

### PL-15 · Vocabulario
**DECIDÍ:** **glosario de 3 columnas** (negocio ↔ pantalla ↔ base): «sede» = `ubicaciones`, «colaborador» =
`colaboradores`; no se renombra nada en producción.
**DESCARTÉ:** renombrar la base — 85 archivos usan `ubicacion_id` y producción está viva.
**SE ROMPE SI:** el glosario no se mantiene y CLAUDE.md sigue diciendo `sedes`/`personas` (hoy lo dice).

### PL-16 · Cuánto se escribe y cuánto se genera
**DECIDÍ:** **los hechos se generan** (rutas, tablas, funciones, pájaros, cifras) y **la intención se escribe a mano**
(porqués, reglas de negocio); la CI falla si el plano cita algo que no existe.
**DESCARTÉ:** todo a mano — sería el sexto documento que se desactualiza; con ~150 commits al día la prosa vence en
semanas.
**SE ROMPE SI:** se escribe a mano una cifra que ya genera un script.

## Bloque 5 — Forma del plano

### PL-17 · Lectores
**DECIDÍ:** agentes de IA (Claude, Codex), constructores humanos y contador o futuro comprador. Los líderes de sede y
los colaboradores son **usuarios** del sistema, no lectores del plano.
**DESCARTÉ:** escribirlo también para las sedes — es otro documento con otro tono (manuales de operación).
**SE ROMPE SI:** el agente lee una regla ambigua y construye sobre ella sin dudar (el 96 % de los commits los asiste IA).

### PL-18 · Forma
**DECIDÍ:** **capas**: una página de finalidad, plano por pájaro, anexos generados.
**DESCARTÉ:** un solo archivo gigante — nace el BACKLOG número dos (hoy 473 KB, nadie lo lee completo).
**SE ROMPE SI:** las capas no se enlazan y cada lector termina leyendo todo.

### PL-19 · Hasta dónde baja el detalle
**DECIDÍ:** **hasta tabla, RPC y ruta**, generado y enlazado al código o a la base; a mano, un contrato de 3 líneas
por módulo.
**DESCARTÉ:** hasta cada pantalla y campo — cientos de páginas que vencen antes de terminarse.
**SE ROMPE SI:** el «tornillo» se copia en vez de enlazarse.

### PL-20 · Dónde vive
**DECIDÍ:** **en el repo** (`docs/plano/`) con CI que falla si cita algo inexistente.
**DESCARTÉ:** Notion o Drive — los agentes no lo leen, la CI no lo verifica y la decisión vuelve a vivir en un chat.
**SE ROMPE SI:** el plano se lee solo en GitHub y el contador o un comprador nunca lo abre.

## Bloque 6 — La entrevista

### PL-21 · Cantidad y ritmo
**DECIDÍ:** **~150 preguntas en 5-6 sesiones** de 25-30, con un acta al cierre de cada sesión.
**DESCARTÉ:** 90 en una sola sesión — las últimas 30 respuestas salen peores y el mapa queda desparejo.
**SE ROMPE SI:** se responde en ráfaga sin acta: lo decidido vuelve a vivir en el chat.

### PL-22 · Orden
**DECIDÍ:** **por capas, de arriba abajo**: finalidad → negocio → glosario → arquitectura → datos → permisos →
pantallas → operación → equipo.
**DESCARTÉ:** por pájaro — lo transversal (vocabulario, permisos, dinero) se respondería 14 veces distinto.
**SE ROMPE SI:** se responde una capa baja antes de fijar la de arriba y hay que rehacerla.

### PL-23 · Quién responde
**DECIDÍ:** **prueba de alineación** (12 preguntas, cada integrante por separado) **+ Felipe responde lo estratégico**;
Felipe responde todo lo posible porque sus compañeros están más perdidos.
**DESCARTÉ:** que cada dueño responda su bloque técnico (no se eligió).
**SE ROMPE SI:** todo lo técnico queda contestado solo por Felipe y el plano es su memoria en papel (ver objeción en
`ULTRA-PROMPT.md`: el agente propone la respuesta desde el repo y Felipe confirma o corrige).

### PL-24 · Reflexión
**DECIDÍ:** **cierre de 3 líneas por bloque**: lo que ya hacemos bien / qué podría hacer mejor que yo un integrante /
la próxima objeción que quiero escuchar.
**DESCARTÉ:** una sección final única — queda separada de la decisión que la origina y nadie la lee.
**SE ROMPE SI:** el cierre se vuelve fórmula y se ignora.

---

## Tensiones que esta acta deja abiertas (no resueltas, nombradas)

1. **PL-01 contra PL-02.** «Solo criterio de calidad» y «otra marca lo usa en 3 años» solo son compatibles con PL-07.
   Sin el guardarraíl, son contradictorias.
2. **PL-05 contra el estado de Producción.** Producción no se congela pero va después del registro fiel; hay F0-F8
   construida sobre tablas con 0 filas.
3. **PL-09 contra `07-GOBIERNO.md` §1.** El gobierno dice «nadie reparte desde arriba»; esta acta reparte 4 y propone
   el resto. Hay que reescribir §1 (Lechuza y Gorrión hoy están `_libre_`).
4. **PL-11 contra D-11.** Hay que anotar en el acta del 2026-09-12 que D-11 quedó modificada.
5. **PL-15 contra CLAUDE.md y AGENTS.md.** Ambos enseñan `sedes`/`personas`, Nubefact y cifras viejas. Corregirlos es el
   primer paso del plano, no el último: el 96 % de los commits los lee una IA que arranca por ahí.

## Pendientes que nacen de esta acta

| # | Pendiente | Dueño | Bloquea |
|---|---|---|---|
| 1 | Activar protección de `main` (PR + CI obligatorios) | Felipe (único admin) | PL-10 |
| 2 | Nombrar al segundo pegador de SQL | Felipe | PL-11 |
| 3 | Confirmar los pájaros de Dany, CuervoCayla y los 4 sin dueño | Felipe | PL-09 |
| 4 | Fecha de corte del censo en TRU | Felipe | PL-06 |
| 5 | Crear `docs/historico/` y mover lo V1 | — (por asignar) | PL-14 |
| 6 | Corregir CLAUDE.md y AGENTS.md (sedes/personas, Nubefact, cifras) | — (por asignar) | PL-15 |

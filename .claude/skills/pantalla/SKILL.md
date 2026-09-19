---
name: pantalla
description: Analiza una pantalla (captura) o un flujo del ERP CAYLA — estética, lógica, arquitectura, funciones, utilidad y conexión con el ERP —, mide si cumple su finalidad y cuán relevante es, y propone 12 tareas ordenadas por importancia. Úsala cuando Felipe pase una captura o una ruta. Con `rapido` en los argumentos hace una pasada barata.
---

Analiza la pantalla o el flujo que Felipe adjunta: $ARGUMENTS

**Entrada:** captura(s) adjunta(s) + ruta (ej. `/productos/nuevo`). Sin ruta, la deduces del título/URL visibles y declaras la suposición. Sin captura ni ruta, las pides y paras.
**Alcance:** una captura = una pantalla. Varias del mismo recorrido = un flujo: analizas cada pantalla y, aparte, las costuras entre ellas (qué dato viaja, cuál se pierde, dónde se equivoca la colaboradora o la clienta).
**Modo:** `rapido` en los argumentos = ver "Modo rápido" al final. Sin él, completo.
**Regla madre:** solo analizas y propones. No toques código, BACKLOG ni migraciones; ejecutar es un paso aparte que Felipe ordena ("haz de la #1 a la #4").

## Paso 0 — Terreno (antes de opinar)

1. `git fetch origin` y `git rev-list --left-right --count HEAD...origin/main`. Si la rama va detrás, lee los docs con `git show origin/main:<ruta>`: este repo ya tomó docs viejos por vigentes. Si el `fetch` falla (sin red), sigue con los docs locales y dilo en la primera línea: el análisis puede estar leyendo una foto vieja.
2. Cruza la ruta con `docs/SESIONES-ACTIVAS.md`. Si otra sesión la está tocando, dilo en la primera línea: sus tareas pueden chocar con ese rediseño.
3. Si existe `docs/pantallas/<slug>.md`, es un re-análisis: léelo, y al final agrega fila al historial y marca cuáles de las 12 tareas anteriores se cerraron. Antes, `git diff --stat <SHA del encabezado> origin/main -- <archivos de la pantalla>`: si cambiaron, el análisis previo está **vencido** (una pantalla rehecha no conserva sus tareas) y no se toma como base.
   Lee el código en el estado de `origin/main`: si la rama va detrás y esos archivos difieren (`git diff --stat HEAD origin/main -- <archivos>`), usa `git show origin/main:<archivo>`. Anota en el encabezado del archivo el SHA analizado (`git rev-parse --short origin/main`): sin él, nadie puede saber contra qué versión de la pantalla vale el análisis.
4. Declara en pocas líneas: tipo de pantalla (formulario, listado, tablero, punto de venta, reporte, configuración); dispositivo que se juzga según el tipo (vender → mostrador/tablet, producción → taller, reportes → escritorio); rol y sede con que se ve; **finalidad** ("esta pantalla existe para X").
   La finalidad sale de `docs/ARQUITECTURA.md`, `docs/datos/modulos/` y `docs/BACKLOG.md`, **nunca de la captura**: una pantalla no puede ser la fuente de su propia finalidad. Si docs y pantalla no coinciden, eso ya es hallazgo. Felipe la corrige si falla.

## Paso 1 — Mapa del código (completo)

Delega la lectura a un subagente Explore para no llenar la conversación; que devuelva solo un mapa con `archivo:línea`. Que use el índice antes que grep: `codegraph explore "<símbolo>"` o `graphify query "<pregunta>"`.
Cadena a trazar: `page.tsx` → componentes → `lib/` → server actions → RPC/tablas → RLS. Por cada acción visible en la captura, evidencia de que hace lo que dice.

## Paso 2 — Consulta SQL (completo)

Lee `plantilla-sql.md`, arma la consulta con las tablas y funciones del mapa, **entrégala y detente**. Felipe la corre en producción y pega el resultado. Si el mensaje ya trae resultados, o dice "sin SQL", sigue y marca lo que quede sin datos reales.
Producción manda: si documento, código y producción se contradicen, gana producción (`01-INVARIANTES.md` §2, "el caso grave") y lo demás se marca desactualizado.

## Paso 3 — Las seis dimensiones

Cada una con puntaje 0–10. Cada afirmación lleva su etiqueta: `[visto]` en la captura · `[código archivo:línea]` · `[producción]` · `[inferido]` · `[no verificable]`. Nunca mezcles lo visto con lo supuesto.

1. **Estética**, tres capas en este orden. (a) Coherencia con CAYLA: `apps/web/app/globals.css` (`@theme`), `packages/shared/src/design-tokens.ts`, `docs/adr/0012-piso-de-contraste-y-esquinas-suaves.md`; `--color-rojo` máximo 2 por pantalla (`MAX_ROJO_POR_PANTALLA`), crema nunca blanco, tinta nunca negro; compárala con 2–3 pantallas hermanas. (b) Marca y tono. (c) Heurísticas universales (Nielsen; WCAG: contraste, tamaño táctil, foco).
2. **Lógica de negocio**: contra `docs/datos/01-INVARIANTES.md` (§1 candados que existen, §2 los que sostiene la costumbre), `DECISIONES-2026-09-12.md` (D-nn) y `15-COMO-OPERA-CAYLA.md`. Cada hallazgo cita la regla que viola. Si no hay una D-nn que cubra el punto, dilo ("ninguna decisión escrita cubre esto") en vez de inventar una. Si el módulo de `docs/datos/modulos/` avisa en su encabezado que describe V1, no lo cites como vigente: mandan el código y el volcado de producción.
   Además cuestiona cómo lo hacen los mejores ERP: referentes por tipo (punto de venta → Shopify POS/Lightspeed; inventario → Odoo/NetSuite; producción → Odoo MRP). **Filtro obligatorio:** ¿le sirve a 3 tiendas y 1 taller hoy? Si no, va a la sección "Futuro" y no cuenta entre las 12. Marca lo que viene de memoria como no verificado; nunca inventes una función de un producto ajeno.
3. **Arquitectura**: cadena completa; estados imposibles (qué constraint impide el estado inválido) y dónde empieza y termina la transacción; concurrencia (dos sedes, el mismo registro, el mismo milisegundo); caída externa, con una frase escrita: "se degrada así, no pierde este dato"; volumen con números (filas en 3 años, escrituras en hora pico — sin número no hay opinión de rendimiento). Suma los lentes que la pantalla pida (RLS, datos personales, IGV, auditoría) y di por qué.
4. **Funciones**: las que existen y funcionan · las fantasma (botón o promesa sin lógica detrás) · las que faltan para cumplir la finalidad · las que sobran (antes de agregar algo, se borra).
5. **Utilidad (persona sin contexto)**: recorre un escenario real de CAYLA paso a paso (una clienta que devuelve a los 8 días, una colaboradora nueva en hora pico) y anota dónde duda o se equivoca. Si se equivoca, el fallo es del diseño, no de la capacitación.
6. **Conexión con el ERP**: aguas arriba (de dónde vienen sus datos), aguas abajo (qué consume lo que crea), pájaro dueño y módulos vecinos (`docs/datos/generado/AVIARIO.md`), integraciones externas (SUNAT, Nubefact, Culqi, Shopify) y qué pasa si no responden.

**Dos puntajes:**
- **Cumple su finalidad** = promedio de las 6, con tope 5 si hay un defecto que pueda dañar dinero o stock (un candado roto pesa más que cinco colores bonitos).
- **Relevancia** = (2·Gestión + Dinero/stock + Frecuencia + Qué se detiene) / 5, cada criterio de 0 a 10 con una línea de justificación. *Gestión* cuenta directo (ayuda a decidir ella misma) e indirecto (el dato que captura y del que dependen las decisiones de otras pantallas: un formulario de alta puede ser raíz de toda la analítica). Categoría: ≥8 **Núcleo** · 6–7.9 **Soporte** · 4–5.9 **Comodidad** · <4 **Prescindible**.

## Paso 4 — Las 12 tareas

Siempre 12. Tipos: **Reconstruir · Corregir · Mejorar · Eliminar/fusionar/conectar · Replantear**. Orden por impacto en el negocio + riesgo (lo que puede dañar dinero o stock arriba), con dependencias marcadas. Las de bajo valor van al final, rotuladas `bajo valor / opcional / futuro` con la razón.
Cada tarea lleva: **dónde exactamente** (archivo:línea, tabla o RPC) · **por qué está en ese puesto** (impacto, riesgo, gestión, qué pasa si no se hace) · **cómo lo verificas tú** (algo observable en el navegador o con una consulta, no "compila") · **esfuerzo** (S/M/L) y **dependencias** ("no antes de la #3").
Solo las estructurales (Reconstruir, Replantear) llevan además:
`DECIDÍ:` qué · `DESCARTÉ:` la alternativa real, por su costo concreto · `SE ROMPE SI:` un escenario específico (jamás "hay que pensar en escalabilidad").

**Replantear:** si existe una estrategia que apoye mejor la gestión empresarial y comercial que la pantalla tal como está pensada, doble plan. Las 12 mejoran la pantalla actual; aparte va "Estrategia alternativa" con Ganas/Pagas. Una de las 12 es la tarea "Replantear" y su único trabajo es pedirle a Felipe que decida sobre esa sección (con DECIDÍ / DESCARTÉ / SE ROMPE SI). No reordenes las 12 ni la des por decidida: decide Felipe.

## Paso 5 — Actitud, salida y sincronía

- **Objeción primero:** lo peor arriba, sin cortesía; "sin objeción" solo si es cierto. Después, **"Lo que está bien y no se toca"** con evidencia, para que arreglar no rompa lo sano. Cierra con **"Fuera de esta pantalla"**: la única cosa de mayor consecuencia que Felipe no preguntó.
- **Privacidad:** todo dato personal de la captura o del SQL (nombres, DNI, teléfonos, correos, montos atados a una persona) se escribe a disco como `[colaborador]`, `[clienta]`, `[DNI]`. `docs/pantallas/` va a git y el historial no se borra.
- **Salida:** todo va a `docs/pantallas/<slug>.md` (slug = ruta sin barras, ej. `productos-nuevo`) con `plantilla-analisis.md`. Al chat solo llegan: veredicto en 2 líneas, los dos puntajes, las 3 primeras tareas y el enlace al archivo.
- **Contra análisis previos:** lee encabezados y tareas de `docs/pantallas/*.md`. El mismo defecto en 3 o más pantallas es **una** tarea raíz, no tres. Dos pantallas que resuelven lo mismo de dos formas: una está mal, dilo aunque las dos funcionen.
- **BACKLOG:** no lo edites (otras sesiones lo tocan). Deja al final del archivo "Líneas propuestas para BACKLOG.md", una por tarea con `[pantalla:<slug>]`; Felipe aprueba antes de anexarlas.

## Modo rápido

Sin SQL, sin referentes de ERP, sin inventario de elementos ni subagente. Lee `page.tsx`, los componentes principales y su `lib/`. Las 6 dimensiones en 1–2 líneas cada una, los dos puntajes, las 12 tareas con los mismos campos en una línea cada uno. Escribe el archivo marcado `rápido`: en el historial esa fila no es comparable con las de modo completo.

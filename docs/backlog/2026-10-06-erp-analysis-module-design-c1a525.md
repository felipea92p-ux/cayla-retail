## 📊 Análisis v4: cuatro preguntas (2026-10-06, ADR-0357) — web + 4 migraciones **EN PRODUCCIÓN** (pegadas el 2026-10-06); rama `claude/erp-analysis-module-design-c1a525`

Maqueta aprobada: artifact privado https://claude.ai/artifact/TBSFBD1nikBu8FeShiKMMp. No va a `docs/maquetas/`: trae cifras reales de producción y
el repo es público.

- [x] Decisiones de Felipe, escritas en ADR-0357: cuatro preguntas sin Comparar, se calla con ADR-0346, la encargada ve lo mismo que el líder
      (enmienda a ADR-0328), «pedir o comprar» lo decide la persona, un solo «Liquidar», «Por llegar», sin cantidades, ficha en `<Modal>`, meta
      6 de 10 y movimiento (ADR-0136 act. 2026-10-06 (b)).
- [x] Actividad 1 (`6eaddd63`): la pantalla, las cuatro pestañas y «Todavía no»; borra los componentes del Análisis viejo.
- [x] Actividad 2 (`e9debf5f`): «Se está acabando» y `fn_analisis_sede`.
- [x] Actividad 3 (`8a9140cf`): «Por llegar» y `fn_analisis_por_llegar`, con la prueba SQL `pnpm pruebas:analisis-lecturas` (23 casos, en el CI).
- [x] Actividad 4 (`5117deee`): «No se vende» y «Liquidar desde» guardado para todos (`parametros_analisis`).
- [x] Actividad 5 (`3190ceb9`): «Qué pedir».
- [x] Actividad 6 (`26631273`): la ficha de la prenda.
- [x] Actividad 7 (`a5d83de2`): «Hoy».
- [x] Las cuatro migraciones (`20261006213000` a `20261006216000`), aplicadas en la base local.
- [x] Documentos: ADR-0357, ADR-0136 (act. 2026-10-06 (b)), enmienda de ADR-0328, `docs/ARQUITECTURA.md` (sección de Análisis) y la lista de
      excepciones de movimiento de `CLAUDE.md`.

- [x] SQL pegado en producción por Felipe (2026-10-06): las cinco huellas coinciden y `parametros_analisis.liquidar_desde` = 60.
- [x] Puntos que corren por la cinta del flujo al pasar el mouse (pedido de Felipe; ADR-0136 act. 2026-10-06 (b)).
- [x] «Ver con los datos de hoy» con su aviso fijo (ADR-0357, decisión 2, actualización): en producción ninguna tienda cumple las tres
      condiciones y la pantalla solo decía «Todavía no». El aviso dice lo primero que falta, con la misma cifra que «Todavía no».
- [x] **Fuera de la fusión del #850:** los puntos del flujo y «Ver con los datos de hoy» se subieron después de fusionarlo; fueron en el
      #853, sin SQL.
- [x] **Abre con los datos de hoy** (Felipe, 2026-10-06 noche, ADR-0357 decisión 2, act. 2): el aviso fijo arriba y «Ver qué falta» lleva a
      «Todavía no», que lleva el mismo aviso con «Ver con los datos de hoy». URL `?ver=falta`. Sin SQL.
- [ ] **Decide Felipe: ¿Hoy muestra las tres tiendas o solo la elegida arriba?** Preguntó por qué, con TRU elegida, ve también Arequipa y Lima
      (la fila «Por tienda» de Hoy, que estaba en la maqueta; decisión 3 de ADR-0357).

### Antes de subir

- [x] **Renumerar el ADR:** `main` ya tenía `docs/adr/0356-chaos-usar-mal-el-sistema-a-proposito.md`; este pasó al 0357 (solo las citas de Análisis).
- [x] **La prueba SQL de las lecturas:** `scripts/pruebas/analisis_lecturas.mjs`, `pnpm pruebas:analisis-lecturas` y su paso en el CI.
- [x] **Escenarios del tema:** `analisis.ficha` sumado (se abre desde la primera prenda a la vista). La hoja «Liquidar desde» queda sin escenario:
      solo se abre cuando la tienda ya recomienda, y ninguna tienda local cumple las tres condiciones (en desarrollo, con `ANALISIS_SIN_CANDADO=1`).
- [x] **La prueba del motor** apunta a `20261006213000` y suma el caso P4 (con Análisis en su rol, la encargada recibe las tres tiendas): 13/13.

### Producción (cada paso con el OK de Felipe)

- [x] **Pegar en el SQL Editor, en este orden, ANTES de publicar la web** (hecho por Felipe el 2026-10-06) (si una trae partes, cada parte por separado: ADR-0195):
  1. `20261006213000_analisis_preparacion_tres_tiendas.sql`: la lectura del motor da las tres tiendas a quien analiza. Re-pegable, sin políticas.
  2. `20261006214000_analisis_prendas_de_sede.sql`: `fn_analisis_sede`, las prendas de cada tienda. Una sola parte, re-pegable; su cabecera trae
     la consulta que la comprueba.
  3. `20261006215000_analisis_por_llegar.sql`: `fn_analisis_por_llegar`, lo que viene en camino. Una sola parte, re-pegable; su cabecera
     trae la consulta que la comprueba.
  4. `20261006216000_analisis_liquidar_desde.sql`: la tabla `parametros_analisis` y sus dos funciones. Una sola ejecución, re-pegable; su
     cabecera trae las consultas que la comprueban.

  Sin ellas la pantalla no se cae (lo que falta se dice en una línea y su sección se calla), pero la encargada solo ve su tienda, Análisis no
  tiene prendas que mostrar y «Guardar para todos» responde que todavía no se puede.
- [ ] Después de pegar: confirmar con un `select` de solo lectura que las cuatro están, refrescar el volcado (`docs/datos/generado/COMO-REFRESCAR.md`),
      `pnpm datos:generar:produccion` y `pnpm datos:comparar`. La tabla nueva `parametros_analisis` tiene que quedar en el diccionario, y con
      pájaro en `scripts/datos/aviario.mjs` (Halcón, como Frescura y el plan del piso): sin pájaro, el CI cae en rojo al refrescar el volcado.
- [x] Publicar la web (fusionar la rama): #850 y #853, el 2026-10-06.

### Pendientes del módulo

- [ ] **Compras recibe prendas por URL.** `/compras/nueva` solo lee `?prov=`: «Comprar» abre la compra con su proveedor, pero vacía. Es el mismo
      pendiente de ADR-0245 («Reponer con la lista cargada»). Producción ya recibe el modelo (`/produccion/ordenes?nueva=<producto>`).
- [ ] **Etiquetas: rebaja con prendas marcadas.** «Liquidar» abre `/etiquetas-de-precio?variantes=` con el precio de hoy. La rebaja (las campañas
      de Atributos ▸ Etiquetas, `components/EtiquetasLista.tsx`) no recibe prendas por URL.
- [x] **Limpiar las libs del Análisis viejo**, sin pantalla desde la actividad 1: `lib/analisis-que-hacer.ts`, `resumen-desempeno.ts`,
      `resumen-comparacion.ts` y sus usos en `resumen-inventario.ts` (`getDesempenoInventario`, `getComparacionInventario`, `getFilasComparacion`,
      `getExactitud`, `getRedPorVariante`), con sus pruebas. **Hecho el 2026-10-06** en `claude/happy-zhukovsky-325b9f`
      (`docs/backlog/2026-10-06-happy-zhukovsky-325b9f.md`): no hubo que mover nada de `resumen-formato.ts`, porque lo que tomaba de
      `rotacion.ts` y `resumen-comparacion.ts` también estaba muerto; la RPC se quedó.
  - Arrastran `resumen-lectura.ts` y lo que solo ellos usan de `rotacion.ts`, `resumen-armado.ts`, `resumen-filtros.ts`, `resumen-busqueda.ts` y
    `conteo-varianza.ts` (`exactitudConteos`).
  - Ojo: `resumen-formato.ts` (nueve archivos) les toma tipos y textos a `rotacion.ts` y `resumen-comparacion.ts`: moverlos primero.
  - Al borrar `analisis-que-hacer.ts`, sacarlo de `DEUDA_DE_ANALISIS` en `lib/piso-plan-umbral.test.ts`.
  - Al borrar `resumen-lectura.ts`, actualizar la cita de R-20 en `docs/datos/15-COMO-OPERA-CAYLA.md` (`LECTURA_SIN_VENTAS_DIAS_MIN`).
  - La RPC `fn_resumen_comparacion(_json)` NO se borra: la lee «Lo que más rinde» (`lib/analisis-rinde.ts`), y la prueban
    `pruebas:fn-resumen-comparacion`, `scripts/pruebas/frescura_lectura.mjs` y `roles_por_modulo.mjs`.
- [ ] **Probar con una encargada real** (y con el líder), en computadora: la prueba ciega fue con lectoras simuladas. Ver que entienda «Qué hacer
      hoy», el carril y la ficha sin ayuda.
- [ ] **Decide Felipe: ¿las tarjetas «Por tienda» cambian de sede al tocarlas?** La maqueta lo hacía («Cambia la sede a Arequipa y ves su
      Análisis»). Hoy solo se leen.
- [ ] **Decide Felipe — dos decisiones de la maqueta que no se tomaron:** «Comprar» para quien no ve Compras ni Producción (hoy el botón no se
      dibuja; la maqueta proponía que se vea y llegue como pedido al líder) y «Mandar a Tareas» cuando exista Inventario ▸ Tareas.
- [ ] **Decide Felipe — cuánto precarga «Enviar a Arequipa»:** `hrefEnviar` (`lib/analisis-acciones.ts`) precarga todo lo libre de cada prenda
      (su prueba espera `v1:3`), pero su comentario dice «una de cada una», como «Pedir» y «Reponer». Con la decisión 7 (no se sugieren
      cantidades), ¿una de cada una o todo lo libre?
- [ ] **Decide Felipe — lo básico (R-21):** lo básico y atemporal se guarda, pero la base no marca qué prenda es básica y «Liquidar» también la
      propone.
- [ ] **Umbral por categoría (R-20):** cuando haya 8 semanas de ventas reales, decidir si «Liquidar desde» pasa a ser por categoría. Hoy es uno
      para todos.
- [ ] **`CLAUDE.md` «La prenda sin foto»:** `fn_analisis_sede` ya trae la categoría de cada prenda, así que Análisis dibuja su ícono: quitar
      «y Análisis» de la lista de cargadores que todavía dibujan la percha.
- [ ] **`/formidable`** sobre la pantalla (obligatoria, tablero en `docs/formidable/README.md`).

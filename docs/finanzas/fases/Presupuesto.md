# Presupuesto · topes por unidad y rubro contra lo real, con proyección al cierre (ADR-0195, capa «para decidir»; PLAN-FINANZAS §6 bis y §7 ter)

**Rama:** `claude/finanzas-presupuesto` (desde `claude/finanzas-f3-f10`). **Fecha:** 2026-09-25.
**Estado:** construido y probado en local. La migración **no está en producción**: la pega Felipe.
**Depende de:** F1 (`fn_meta_mes`, `configuracion_historial`), F2a/F2b (`categorias_gasto`, `gastos_fijos`) y F5
(`fn_estado_resultados`, `fn_diario_ubicaciones`).

## Qué se construyó y por qué

**El problema:** Felipe se entera de que el mes se le fue en suministros o en luz cuando el mes ya cerró. Quiere poner por
tienda, Taller y empresa cuánto piensa gastar en cada rubro, y ver **a tiempo** en qué se está pasando y si las ventas van
camino a la meta. El presupuesto avisa, no frena: nadie queda bloqueado por pasarse.

### Base: migración `20260925190000_finanzas_presupuesto.sql`

- **Tabla `presupuestos`**: una casilla por mes (día 1), unidad y **cuenta de gasto**, con su tope sin IGV.
  - «De la empresa» es la ubicación nula. `unique nulls not distinct (mes, ubicacion_id, cuenta)`: una sola casilla por
    rubro también para la empresa.
  - **Monto nulo = sin tope.** Vaciar una casilla no la borra: la deja nula, y el cambio queda en la historia.
  - Candados:
    - solo tiendas, Taller o la empresa;
    - solo cuentas de categorías de gasto (ni ventas ni planilla);
    - una casilla no cambia de mes, unidad ni rubro;
    - `delete` bloqueado por disparador;
    - el mes empieza en 1 y el monto es > 0 (checks).
  - RLS encendido y **sin políticas**. Sin permisos directos: todo pasa por funciones.
- **Escribir** (solo el líder, firma con `fn_actor_persona_id(true)`, antes y después en `configuracion_historial`):
  - `guardar_presupuesto(mes, ubicación, cuenta, monto)`: una casilla. 0 o nulo = sin tope. Sin cambio, no escribe nada
    (ni historial).
  - `guardar_presupuesto_lote(mes, filas, origen)`: lo propuesto y confirmado. Todo o nada, con **una** fila de historial
    `presupuesto_propuesta` que lista cada casilla que cambió. Devuelve cuántas cambiaron.
- **Proponer sin guardar**: `fn_presupuesto_propuesta(mes, origen)`.
  - `mes_anterior`: los topes del mes anterior, tal cual.
  - `promedio_3_meses`: lo gastado sin IGV (del Estado de resultados) en los 3 últimos meses **completos** antes del mes
    elegido —nunca el que está en curso—, ÷ 3 y redondeado **hacia arriba a la decena**.
  - Cada fila trae lo que hay hoy en la casilla (`actual`). Lo que la propuesta no trae se queda como está.
- **Leer para Configuración**: `fn_presupuesto_configuracion(mes)` (solo líder). Trae:
  - las unidades con la **meta de ventas del mes sin IGV** de cada tienda;
  - los rubros: una línea por cuenta de las categorías activas;
  - los topes del mes;
  - cuántos topes tiene el mes anterior.
- **`fn_presupuesto_vs_real(mes, ubicación, p_hoy)`**: una fila por unidad y línea. Trae:
  - el presupuesto (tope, o la meta de ventas);
  - lo real a la fecha (`fn_estado_resultados` del día 1 al de corte);
  - la proyección al cierre y cuánto de ella es fijo;
  - el avance, `se_pasa` y el estado.

  Para el líder sin filtro, además **CAYLA**, la suma exacta de las unidades. Permisos como el Estado de resultados
  (`fn_diario_ubicaciones`). `p_hoy` solo existe para probar.

### La proyección al cierre (la regla, escrita también en la cabecera de la migración)

- **Mes que ya terminó:** al cierre = lo real.
- **Mes que no empezó:** sin proyección. Se ven las metas y los topes.
- **Mes en curso**, día d de n. Hoy cuenta como día transcurrido, y lo real incluye lo de hoy.
  - **Ventas de una tienda con meta:** se cierra al mismo % de la meta que se lleva.
    - `al cierre = vendido ÷ meta de los días 1..d × meta del mes`.
    - Un fin de semana o una campaña que todavía no llegan pesan lo que pesan en la meta. En la prueba: 9,000 de una meta a
      la fecha de 10,000, con una campaña por venir, cierra en 32,400. Al ritmo de los días serían 27,900.
    - Sin meta, al ritmo de los días: `vendido ÷ d × n`.
  - **Gastos de un rubro:** lo fijo entra entero y lo demás va al ritmo de hoy.
    - `al cierre = fijos ya registrados + fijos que faltan + (lo demás ÷ d × n)`.
    - «Fijos» son los de Gastos ▸ Fijos del mes (F2b). Los que llegaron cuentan como llegaron, sin IGV como los asienta el
      diario. Los que faltan, por su monto esperado sin el IGV de la factura. Un fijo archivado no cuenta.
    - Si «lo demás» es negativo (una nota de crédito), no se proyecta.
- **Estados:**
  - tope: > 105 % `se_pasa` (marcada, rojo); 100–105 % `al_filo`; si no, `dentro`;
  - meta: < 95 % `bajo_meta`; si no, `en_camino`; en un mes cerrado, `cumplida` si llegó;
  - `sin_tope`, `sin_meta` y `por_empezar`.

### Web

- **Finanzas ▸ Reportes ▸ Presupuesto** (`/finanzas/reportes/presupuesto`), «¿Vamos según lo planeado?»:
  - «Ver»: la sede donde trabajas por defecto, una ubicación, «Todas las tiendas» (con el bloque **CAYLA · suma de todo** al
    final) o «De la empresa». La encargada con el módulo ve su tienda: un chip y nada más, porque lo decide la base.
  - Mes: el que viene y los últimos 12.
  - El cuadro del spike: un bloque por unidad, con Ventas (la suma de las metas del día, sin IGV) y cada rubro con tope, y
    las columnas Meta o tope, A la fecha, Al cierre, la barra de Avance (roja solo si se pasa) y el Estado.
  - El `title` de «Al cierre» explica de dónde sale.
  - Al pie: lo gastado en rubros **sin tope** (para que no se esconda) y el aviso si el mes todavía no tiene topes.
  - «Cambiar metas y topes» lleva a Configuración, solo para el líder. «Descargar Excel» baja un CSV separado por «;».
- **Configuración ▸ Presupuesto** (`/configuracion?tab=presupuesto&mes=…`), entre «Gastos fijos» e «Impuestos»:
  - la tabla del spike: una fila por rubro y una columna por unidad;
  - la franja «Meta de ventas del mes · suma de las metas del día, sin IGV», con un enlace a Tiendas y caja;
  - **cada casilla se guarda al salir**, firmada con el combo Responsable (como `ConfiguracionTiendas`);
  - mes: dos atrás, el de hoy y tres adelante;
  - «Copiar de agosto» (se apaga si agosto no tiene topes) y «Sugerir según los últimos 3 meses» abren una hoja
    (`<Modal variante="hoja">`) con cada casilla que cambia (hoy → propuesto) y «Aplicar N cambios»;
  - «Nada se guardó todavía» está escrito en la hoja.
- **Archivos:**
  - `lib/presupuesto.ts` (server-only) y `lib/presupuesto-reglas.ts` (lógica pura, con prueba);
  - `components/finanzas/PresupuestoPanel.tsx` y `components/finanzas/ConfiguracionPresupuesto.tsx`;
  - `app/(app)/finanzas/reportes/presupuesto/page.tsx` y `loading.tsx`. Usa el `layout.tsx` de Reportes de F5, sin cambios.
- **Cambios en archivos compartidos:**
  - `CabeceraReportes.tsx`: `lista: true` solo en `presupuesto`;
  - `configuracion/page.tsx`: la pestaña, `?mes=` y `SeccionPresupuesto`;
  - `finanzas.css`: bloque `/* ---- Presupuesto ---- */` al final, con `fin-ppto`, `fin-ppto-edit`, `fin-grupo`,
    `fin-umbral-barra.fin-fina`, `fin-num-input`, `fin-mes-chico` y `fin-tabla-hoja`.
  - `kit.tsx` no se tocó.
  - Sin cambios en `menu.ts` (Presupuesto es una pestaña del nodo Reportes, ya vivo) ni en `espera-reglas.ts`: las lecturas
    empiezan con `fn_`.

## Decisiones (tomadas aquí; la razón en corto)

1. **La línea es la cuenta, no la categoría.**
   - Lo real sale del diario por cuenta (`fn_estado_resultados.detalle_gastos`). Tope y real hablan de lo mismo aunque
     mañana dos categorías compartan cuenta: se ven como una línea con los dos nombres.
   - Hoy las 10 categorías tienen cuentas distintas: para quien mira es lo mismo.
2. **Solo llevan tope las cuentas de las categorías de gasto.**
   - La planilla la decide Dynamic, como dice el spike.
   - La depreciación y las bajas no son gasto que se decida en el mes.
   - Costo de ventas y mermas quedan fuera porque el spike no los presupuesta.
3. **Vaciar no borra.** La casilla queda con monto nulo. Regla «nunca DELETE», aunque sea configuración: F1 sí borraba los
   efectos de campaña.
4. **La meta de ventas se muestra sin IGV** con la tasa del día 1 del mes (`fn_tasa_igv`), porque el Estado de resultados
   cuenta las ventas sin IGV. En Configuración se ve como enlace a Tiendas y caja: ahí se cambia.
5. **CAYLA solo en «Todas».** Con una tienda elegida se ve solo esa tienda, como el spike. CAYLA suma **todas** las ventas
   contra las metas de las tiendas que la tienen: si una tienda no tiene meta, su venta infla el avance de CAYLA. Se dejó a
   la vista: la fila de esa tienda dice «sin meta».
6. **«Lo gastado sin tope» va al pie** en vez de agregar filas que el spike no tiene: no se esconde, pero no ensucia el
   cuadro.
7. **La propuesta manda lo que se vio** (`guardar_presupuesto_lote` recibe las casillas). No se recalcula al confirmar: si
   entre ver y confirmar alguien registra un gasto, se guarda igual lo que se vio.

## Cómo se pega en producción

**Una sola ejecución**, con `set search_path` al inicio: no hace falta prefijo.
- Qué trae:
  - una tabla **nueva** (vacía, sin uso) con sus disparadores;
  - funciones nuevas.
- Sin `alter` de tablas que use la tienda y sin políticas. Las FK a `ubicaciones` y `cuentas` toman un candado compatible
  con quien lee.
- `lock_timeout` de 3 s: si falla, se vuelve a pegar entera, porque es idempotente.
- **Antes:** F1 (`20260924210000`, ya en producción), F2a/F2b (`20260924235000`, `20260924235100`, `20260925000000`) y F5
  (`20260925130000`).
- **Después:** publicar la web. La web de hoy no llama nada de esto: no se rompe si se pega antes.
- **Aviso en local:** la primera versión de `fn_presupuesto_propuesta` tenía 2 parámetros; se le quitó a mano (`drop
  function … (date, text)`) al sumar `p_hoy`. En producción nunca existió.

## Pruebas

- **SQL:** `pnpm pruebas:presupuesto` (`scripts/pruebas/presupuesto.mjs`, en el CI después de `pruebas:estado-resultados`).
  **78 verificaciones.** Cada escena va en su transacción con ROLLBACK, en **marzo de 2032** (un mes sin datos de nadie),
  con números calculados a mano.
  - **Contra lo real:**
    - la meta es `fn_meta_mes` sin IGV (36,000);
    - lo real es el del Estado de resultados a la fecha;
    - anulados, lo de después del corte y lo de otro mes no cuentan;
    - la proyección de ventas al % de la meta (32,400, no 27,900);
    - fijos registrados y por llegar (la luz con factura sin su IGV: 508.47), el fijo archivado fuera, lo variable al ritmo;
    - los estados;
    - CAYLA como suma exacta, línea por línea.
  - **Momentos:**
    - mes cerrado (al cierre = lo real, «cumplida»);
    - mes por venir (sin proyección, «por empezar»);
    - **cambiar una meta del día cambia la del presupuesto**, y ninguna fila de ventas vive en `presupuestos`.
  - **Guardar y leer:**
    - mes normalizado; historial con antes y después, firmado; sin cambio, sin historial;
    - vaciar no borra; una sola casilla para la empresa;
    - no a negativos, ventas, planilla y almacén;
    - `delete`, mudanza y duplicado bloqueados.
  - **Proponer:**
    - copiar y promediar, sin guardar (noviembre y el mes en curso fuera);
    - aplicar con una fila de historial; aplicar dos veces no cambia nada;
    - todo o nada; orígenes inválidos.
  - **Permisos:**
    - sin «Reportes financieros» nada; con él, su tienda y los mismos números; otra tienda falla;
    - no escribe, ni propone, ni lee la configuración;
    - sin privilegios directos sobre la tabla; RLS sin políticas; `anon` sin funciones.
  - **Tiempo** con la base local: 49–59 ms el mes de hoy.
- **Web:** `lib/presupuesto-reglas.test.ts`, **24 pruebas**:
  - lectura; «Ver» y bloques; lo gastado sin tope;
  - chips (como el spike: «te pasas 18,8 %»); barra; franja; «de dónde sale»;
  - CSV; casillas (`parsearTope`); meses; propuesta y lote.

  Suite entera: 89.046 pruebas en verde. `tsc`, `eslint` y `next build --webpack` en verde. `pruebas:gastos`,
  `pruebas:activos-y-fijos` y `pruebas:configuracion-caja` siguen en verde.
- **Comparación visual** en `scratchpad/presupuesto/`:
  - el spike: `spike-reportes-presupuesto.png`, `spike-reportes-todas.png`, `spike-config-presupuesto.png`;
  - la app: `app-reportes-presupuesto.png`, `app-reportes-todas.png`, `app-reportes-colaboradora.png`,
    `app-config-presupuesto.png`, `app-config-propuesta.png` (la hoja de «Sugerir…»), `app-reportes-movil.png` y
    `app-config-movil.png`.

  Los datos salen de un fixture sacado de la base local como líder, sembrado en una transacción con ROLLBACK
  (`fixture.sql`). La ruta temporal `app/auth/prueba-presupuesto` no se commitea.

## Lo que queda distinto del spike, a propósito

- **Un selector de mes** en las dos pantallas. El spike solo muestra septiembre; aquí el presupuesto se pone antes de que el
  mes empiece y se revisa después de que cierra.
- **La franja de arriba dice el momento:** «al día 24 de 30», «mes cerrado» o «todavía no empieza». La bajada explica la
  regla real: las ventas van al % de la meta, y lo fijo sale de Gastos fijos, no de «alquiler, planilla».
- **Configuración muestra los 10 rubros** (cada categoría de gasto), no solo los 5 del ejemplo del spike. Vacío = sin tope.
- **Los nombres de los rubros** son los de las categorías reales («Suministros y útiles», «Transporte y movilidad»), en su
  orden.
- **El combo Responsable** encima de la tabla y dentro de la hoja de la propuesta: es regla (ADR-0161), el spike no lo
  muestra.
- **La hoja de la propuesta** no existe en el spike: allí los botones no hacían nada. La tarea pide proponer sin guardar.
- **Al pie del cuadro:** lo gastado en rubros sin tope y el aviso de «este mes no tiene topes».
- **El bloque CAYLA** en «Todas» (la tarea lo pide; el spike no lo tiene).
- **El título mide 30 px**, la guía del ERP (ADR-0169), igual que F2 y F5.

## Pendiente (Felipe o el contador)

- **Felipe:**
  - ¿Los umbrales del chip (105 % «se pasa», 95 % «bajo la meta») le sirven, o van a Configuración ▸ Caja y avisos?
  - ¿Debe una encargada con «Reportes financieros» ver los topes de su tienda? Hoy sí, igual que ve su Estado de
    resultados.
- **Para F9 (cierre):** hoy el presupuesto de un mes cerrado todavía se puede cambiar (queda en la historia). F9 decide si
  lo congela.
- **Para F10 (Resumen):** `fn_presupuesto_vs_real` ya da el «Presupuesto del mes» y la «Meta de ventas» del spike
  (`miniPresupuesto`): la F10 solo lo lee.
- **Módulo `configuracion`:** su `incluye` todavía dice «Metas de venta y fondo de caja…». Conviene que el orquestador
  consolide el texto con todo lo que Configuración trae hoy: cuentas, avisos, gastos fijos, presupuesto e impuestos. Va en
  una migración y en `lib/modulos.ts` a la vez.

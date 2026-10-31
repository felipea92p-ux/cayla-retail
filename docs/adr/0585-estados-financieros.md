# ADR-0585 · Estados financieros: los cuatro estados como respuestas, y quien tiene el módulo ve todo

- **Fecha:** 2026-10-30 · **Estado:** en construcción, actividad por actividad (`/construir`). Actividades 1 (permisos), 2 (patrimonio), 3 (el nombre y las cuatro respuestas) y 4 (¿Ganamos?) hechas.
- **Decide:** Felipe, 2026-10-30, sobre la pizarra «4. Reportes» y la maqueta `docs/maquetas/finanzas-eeff-2026-10/`
  (https://claude.ai/artifact/UiZ2Pk8rnPkLYNLcDBo7kV).
- **Toca:** ADR-0195 (Finanzas), ADR-0253 y ADR-0433 G16 (una sola regla de alcance), ADR-0161 P6 (las terminales no miran la
  empresa entera), ADR-0493 (El telar).
- **Número sin etiqueta de reserva:** el entorno de la sesión no podía crear la etiqueta `reserva/…` en el remoto (GitHub respondió
  403). Se eligió por encima de toda reserva y de todo archivo existente (ADR 0585 > 0584 reservado; migración 20261030235000 >
  20261030224000 reservada).

## Lo que pidió Felipe

1. «Reportes» pasa a llamarse **Estados financieros**.
2. Lo financiero en lenguaje simple.
3. Los cuatro estados: Balance, Ganancias y pérdidas, Flujo de efectivo y Cambios en el patrimonio.
4. Muy visual, simple e interactivo.
5. Recomendaciones.
6. «Puede ver todo del módulo quien tenga dicho módulo asignado en Roles y accesos.»
7. Las cuentas contables, solo en lo que se descarga. Si son varios archivos, el botón despliega opciones.

## Actividad 1 · Quien tiene el módulo ve todo (migración 20261030235000)

### El problema primero

Con el módulo (`reportes_financieros`: la clave no se renombra, como `/clientas`) una cuenta veía solo SU tienda. El flujo, su
proyección y el Balance de CAYLA entera eran solo del líder: el encargado abría la pestaña y leía «lo ve el líder».

### Lo que se decidió

- **Una regla nueva, solo de LECTURA.** `fn_ve_finanzas_de_todo()` no se amplió, aunque era una línea, porque también abre ESCRIBIR:
  `fn_gastos_puede` la usa para registrar gastos de cualquier tienda o de la empresa. Nacen tres funciones:
  - `fn_ve_estados_financieros_de_todo()`: el líder, o quien tiene el módulo completo y no es una terminal.
  - `fn_ve_diario_de_todo()`: la de siempre o la de arriba. La preguntan las doce lecturas que reparten el alcance con
    `fn_diario_ubicaciones()`, así que las doce dicen lo mismo (G16).
  - `fn_exigir_estados_financieros_de_todo()`: la puerta del flujo, la proyección, el Balance entero, su comprobación y la lectura de
    los saldos de arranque.
- **Las lecturas que el flujo arrastra.** La plata de hoy (`fn_cuentas_dinero_saldos`), lo que se debe (`fn_por_pagar_consolidado`),
  los gastos fijos que vienen (`fn_gastos_fijos_mes`) y el IGV de los meses (`fn_impuestos_igv_meses`) tenían el candado de sus propios
  módulos. Se abren con la misma regla, porque las llaman solo lecturas (medido en la base el 2026-10-30).
- **Una terminal con el módulo sigue viendo solo su tienda** (ADR-0161 P6). CAYLA entera no se muestra en el aparato compartido del
  mostrador. Si Felipe quiere que también lo vea, es quitar `and not exists (select 1 from retail.fn_terminal_actual())` de una función.
- **En la web,** `veEstadosFinancierosDeTodo` y `veDiarioDeTodoDe` espejan la base (`lib/modulos.test.ts` las cruza). La barra de
  sedes del telar muestra todas las sedes en Estados financieros (`hilosDeLaRuta`) y, en los demás submódulos, las de siempre.

### Lo que NO cambia

- **Escribir.** Registrar los saldos de arranque sigue siendo del líder, y registrar gastos sigue en `fn_ve_finanzas_de_todo()`.
- **Quien tiene Cierre de mes, Configuración o CAYLA Global sin este módulo** ve lo mismo que antes. El Balance entero y el flujo los
  abre este módulo, no esos tres.
- **El Resumen de Finanzas.** Usa el mismo módulo, pero `fn_resumen_finanzas` sigue armándose con la tienda propia de quien no es líder.
  Lo único que cambia es que, de su tienda, ahora ve las cuentas, lo que se debe y los gastos fijos, que antes decían «sin permiso».
  Que el Resumen también muestre CAYLA entera es una decisión aparte, de Felipe.
- `fn_flujo_exigir_lider()` queda sin quien la llame y no se borra: una función plpgsql no registra quién la llama.

### Cómo se verificó

En un Postgres local armado con todas las migraciones y `seed.sql`, se corrieron 31 pruebas de Finanzas antes y después de la migración.
- **Ahora pasan:** `finanzas_alcance_coherente` (50/50, con casos nuevos para el encargado, la terminal, el flujo, el Balance entero y lo
  que sigue sin escribirse), y `balance`, `cierre_mes`, `estado_resultados`, `flujo_caja`, `planilla_provision`, `presupuesto`,
  `resumen_finanzas` y `roles_cobertura_modulos`. Las nueve tenían escrita la regla vieja y se pusieron al día.
- **Iguales que antes:** las demás.
- **Fallas que no son de este cambio:**
  - `compras_modulo_es_la_llave` ya tenía 2 fallas en la línea base.
  - `finanzas_montos_y_caja_fuerte` falla todos los días entre la medianoche de Greenwich y las 7 p. m. de Lima, porque usa
    `current_date`. Quedó como tarea aparte.

En la web, pasan los tipos, las 744 pruebas de vitest, Knip y eslint.

## Actividad 3 · El nombre y las cuatro respuestas

- **El nombre.** El menú dice «Estados financieros». En Roles y accesos el módulo pasa a llamarse «Resumen y estados financieros»,
  porque abre las dos entradas del menú, y su descripción ya no dice «de su tienda»: el `update` va en la migración 20261030235000.
  La ruta `/finanzas/reportes` y la clave `reportes_financieros` no cambian (como `/clientas`). La foto del menú
  (`lib/menu-hoy.golden.json`) se actualizó a propósito, en el mismo commit.
- **Una cabecera para los cuatro estados.** `CabeceraEstados` usa la cabecera única (`EncabezadoPagina`) con «Estados financieros» de
  título y, debajo, las cuatro respuestas. Cada respuesta es una `TarjetaCifra` del sistema (ADR-0358) en su forma de filtro: la
  elegida queda rellena de arena y tocar otra pasa a ese estado, con la sede y el mes de la barra. No se inventó una pieza nueva para
  estas pestañas. La pregunta va como nombre, el nombre formal al pie, y el punto de color da el veredicto.
- **Las cifras de las respuestas** las arma `lib/estados-financieros-reglas.ts`, que es lógica pura y tiene su prueba. Salen de
  lecturas que ya existían, envueltas en `cache()` para que la cabecera y el estado de abajo no pidan dos veces lo mismo.
  - El Balance entero muestra su cifra solo si cuadra (ADR-0198).
  - Mirando una sede, «¿Cuánto vale?» pasa a «¿Cuánto hay invertido?».
  - La plata y lo tuyo son de toda CAYLA, y la tarjeta lo dice.
- **El título de cada estado** baja a título de sección (`CabeceraReportes` ahora dibuja `TituloSeccion`) y se queda con sus
  herramientas. Las actividades 4 a 7 rehacen cada estado.
- **¿Lo tuyo creció?** tiene página propia (`/finanzas/reportes/patrimonio`). En esta actividad muestra sus cinco cifras; la escalera
  y la línea de 6 meses llegan en la actividad 7.
- **Presupuesto, Campañas y Escenarios** dejan de ser pestañas: son páginas internas con la cabecera única y la flecha de volver. Hasta
  la actividad 5 (Escenarios dentro del flujo) y la 4 (el presupuesto dentro de ¿Ganamos?), siguen como estaban.
- **Las guías** cambian «Los seis reportes» por «Las cuatro respuestas», y nace la guía de «¿Lo tuyo creció?».

## Actividad 4 · ¿Ganamos?

- **La cascada de la venta a la ganancia, siempre a la vista.** Es la misma pieza del «¿Por qué?» del Resumen (`CascadaPulso`, ADR-0358),
  con propiedades opcionales: el Resumen se ve igual. Los gastos van agrupados como los dice una tienda, no por cuenta:
  - Sueldos;
  - Local y servicios;
  - Publicidad, envíos y comisiones;
  - Administración;
  - Diferencias de caja, aparte, porque no son un gasto que se decide;
  - Otros gastos;
  - Desgaste.

  Lo que los grupos no nombran va en «Otros ajustes»: la cascada siempre suma (`lib/ganamos-reglas.ts`, con su prueba).
- **El presupuesto vive aquí y su pantalla se retiró** (Felipe 2026-10-30). Cada gasto con tope lleva una raya en «lo planeado» y,
  desde un 10 % de desvío, una píldora que lo dice. En el mes en curso se compara la proyección al cierre que ya calcula
  `fn_presupuesto_vs_real`, no lo que lleva gastado: a mitad de mes todo parecería «dentro». Al tocar el gasto se ven sus partes, con
  lo real y lo planeado.
  - `/finanzas/reportes/presupuesto` redirige a ¿Ganamos? con la sede y el mes.
  - Se borraron `PresupuestoPanel` y las reglas que solo usaba esa pantalla.
  - Los topes se siguen poniendo en Configuración ▸ Presupuesto. Sus enlaces y el del Resumen ahora llevan a ¿Ganamos?.
- **Lo que dejó cada sede** (mirando todas): cada sede lleva a su vista sola.
- **Las campañas del mes**, con «Ver las campañas», que es una página interna.
- **«Qué te recomiendo»**, a la derecha. Son hasta tres acciones, cada una un `<Aviso>` con su `<BotonVer>`:
  - una sede que pierde, con lo que necesita vender para cubrirse;
  - el gasto que más se pasa de lo planeado;
  - la campaña del mes;
  - la meta de ventas.

  Si no hay nada que decir, lo dice.
- **El formato formal**, plegado al pie (`BotonVerMas`), es el cuadro de siempre, con «De dónde sale» en cada cifra y «Comparar». Se le
  quitaron la columna de cuentas (las cuentas solo van en lo que se descarga) y el selector de mes y de sede, que ya están en la barra.

## Actividad 2 · El estado de cambios en el patrimonio (migración 20261030235100)

### El problema primero

El cuarto estado, «¿Lo tuyo creció?», no existía. El Balance decía cuánto es tuyo a una fecha, pero no por qué cambió de un mes a otro.
Es justo lo que hace falta para la única decisión que ayuda a tomar: cuánto retirar.

### Lo que se decidió

- `fn_patrimonio_cambios(p_mes, p_meses)` lee el **mismo diario que el Balance** (`fn_bal_diario` desde el arranque, más los saldos de
  arranque), en una sola pasada. No suma una regla contable nueva: lo tuyo al cerrar el mes es, por construcción, la sección
  «patrimonio» de `fn_balance_general` a esa fecha, y la prueba lo exige.
- Devuelve lo tuyo al empezar y al cerrar, partido como el estado formal (capital 50 · aportes 52 · utilidades: la 591 más los
  resultados sin cerrar). Devuelve también lo que lo movió en el mes:
  - la ganancia, que es el «Resultado del mes» del Balance;
  - los aportes, que son el haber de la 52;
  - los retiros, que son el debe de la 591 con la regla `retiro`;
  - `otros`, que es lo que esos tres no explican. Debe ser 0; si no lo es, la pantalla lo dirá, como la comprobación del Balance.
- La serie trae lo tuyo al cierre de los últimos meses (6 por defecto, 24 como máximo), sin los meses anteriores al arranque. Un mes
  anterior al arranque dice `sin_arranque`, y uno que no empezó se rechaza.
- La ve lo mismo que el Balance de CAYLA entera: `fn_exigir_estados_financieros_de_todo()`. Lo tuyo no se reparte por sede.

### Cómo se verificó

`pnpm pruebas:patrimonio-cambios` pasa 19 de 19, sobre una escena en marzo y abril de 2024 con arranque, un aporte de 1,000, un gasto de
100 y retiros de 300 y 50. La prueba entró en la lista del CI (`scripts/ci/pruebas-postgres.mjs`).

### Producción

Se pegan en orden: primero la 20261030235000 (que además renombra el módulo en Roles y accesos) y después la 20261030235100. Cada una se pega entera, de una vez: no tiene `alter` de tablas en uso ni políticas (ADR-0195, «Políticas y deadlocks»). Cada reemplazo está
anclado al texto vivo: si producción no coincide, la migración aborta sin cambiar nada.

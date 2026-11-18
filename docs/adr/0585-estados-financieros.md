# ADR-0585 · Estados financieros: los cuatro estados como respuestas, y quien tiene el módulo ve todo

- **Fecha:** 2026-10-30 · **Estado:** en construcción, actividad por actividad (`/construir`). Actividades 1 (permisos), 2 (patrimonio), 3 (el nombre y las cuatro respuestas), 4 (¿Ganamos?), 5 (¿Dónde está la plata?) y 6 (¿Cuánto vale CAYLA?) hechas.
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

## Actividad 5 · ¿Dónde está la plata?

- **El método directo, que se lee como «cobraste / pagaste».** Las categorías que ya da `fn_flujo_caja_real` van a una de tres partes,
  más las diferencias aparte (`lib/plata-reglas.ts`, con su prueba). Es una agrupación en la web: no hay plata nueva.
  - **Del día a día:** todo lo demás.
  - **Compras que duran años:** `activos`.
  - **Tú y los préstamos:** `dueno_pone`, `dueno_saca` y `pago_tarjeta`. Pagar la tarjeta es pagar una deuda, porque el gasto ya se
    contó al usarla.
  - **Aparte:** las diferencias de caja y la plata en camino (lado `ajuste`).
- **La respuesta y el puente.** La pantalla dice cuánta plata hay hoy, o con cuánta cerró el mes, y una frase de por qué no siguió a la
  ganancia. La frase nombra solo lo que se fue fuera del día a día: compras que duran, retiros y la tarjeta. Debajo va el puente del
  mes, en la misma `CascadaPulso`: lo que había al empezar, las tres partes (cada una se toca y muestra sus categorías) y lo que hay al
  cerrar.
- **Lo que viene** se queda como estaba: el gráfico de semanas con el mínimo de caja, los días de caja y qué vence cada semana.
- **«¿Y si…?» es Escenarios entero, dentro.** No se rehicieron las palancas: se mantienen todas (ventas por tienda y de todas, el
  alquiler, cerrar una tienda, pasar un pago, un gasto nuevo, la utilidad de cada unidad) y nada se guarda.
  `/finanzas/reportes/escenarios` redirige a `#y-si`, y los enlaces del Resumen ya llevan ahí. Su guía se sumó a la del flujo.
- **«Qué te recomiendo»:** si la plata alcanza las próximas semanas (o qué semana baja del mínimo), por qué bajó aunque se ganó, los días de
  caja (menos de 15) y el próximo impuesto.
- **El formato formal, plegado:** el estado de flujos de efectivo por el método directo (operación, inversión y financiamiento, sin
  cuentas), la plata al empezar y al terminar, y lo que quedó semana a semana. `FlujoCajaPanel` se fue a `estados/PlataPanel.tsx`. Se
  borraron las reglas que solo usaba la pantalla vieja (`fraseDelFlujo`, `textoPeriodo`, `listasDelFlujo`).

## Actividad 6 · ¿Cuánto vale CAYLA?

- **Si el Balance cuadra**, la pantalla muestra, de arriba abajo:
  - la respuesta: «Vale S/ X», lo tuyo, con la frase «es lo que tiene menos lo que debe» y la fecha;
  - **la balanza**: dos `BarraApilada` (la pieza de ADR-0358) del mismo largo, una con lo que tiene y otra con lo que debe más lo tuyo;
  - **dos medidores**;
  - lo que es de cada sede;
  - plegados, la comprobación, el balance formal y los saldos de arranque.

  Cada barra va en pocos grupos que una tienda reconoce (`lib/vale-reglas.ts`, con su prueba): plata, lo que te deben, mercadería,
  muebles; proveedores, impuestos, sueldos, tarjeta y préstamos; lo tuyo. Tocar un tramo o su nombre abre sus partes.
- **Los dos medidores** son `TarjetaCifra` con su `BarraAvance`:
  - «Si te cobraran todo hoy, cubres el X %»: plata y cobros contra todas las deudas;
  - «Mercadería guardada: N meses de venta»: la mercadería contra lo que costó lo vendido en el último mes completo de CAYLA.
- **Si no cuadra**, nada cambia: la comprobación y la guía de qué falta siguen a la vista y la cifra no se dibuja (ADR-0198). Los saldos
  de arranque siguen siendo del líder.
- **Las cuentas** ya no se muestran en las líneas del balance ni en lo de una sede. Siguen en el Excel que se descarga.
- **«Qué te recomiendo»:**
  - si no cuadra;
  - la mercadería quieta (desde 4 meses de venta), que lleva a Frescura del piso;
  - si la plata no cubre lo que se debe;
  - la sede que no devuelve lo invertido, comparada con la que más rinde.
- **La fecha**, por defecto, es el último día del mes de la barra (hoy, en el mes en curso). El selector de fechas del Balance sigue.

## Actividad 7 · ¿Lo tuyo creció?

- **La pantalla**, de arriba abajo:
  - la respuesta: «Sí, creció S/ X» o «No, bajó S/ X», con la frase de qué parte de lo ganado retiraste («De los S/ 10,000 que
    ganaste, retiraste S/ 6,000: el 60 %»);
  - **el puente del mes** (`CascadaPulso`): al empezar → lo que ganaste (o perdiste) → lo que pusiste → lo que retiraste → al cerrar.
    Lo que es cero no se dibuja, y lo que la base no explica (`otros`) sale como su propio tramo, «Sin explicar»: sumar los tramos da
    siempre «al cerrar»;
  - **lo tuyo, mes a mes**: la `<Linea>` (la pieza de ADR-0358) con el cierre de los últimos 6 meses; con un solo mes, un vacío chico;
  - plegado, **el formato formal**: capital, aportes y resultados acumulados en columnas, cada una del saldo al inicio al saldo al
    cierre. Lo sin explicar cae en «Otros ajustes» de su columna, así cada columna suma. Sin cuentas.
- **«Qué te recomiendo»** (`lib/patrimonio-reglas.ts`, con su prueba):
  - lo sin explicar, primero, que lleva al Balance;
  - si retiraste más de lo que ganaste;
  - si retiraste más de la mitad, cuánto habría crecido lo tuyo retirando la mitad (la única cifra «¿y si?» de la pantalla: es la
    decisión que este estado ayuda a tomar);
  - una pérdida, que lleva a ¿Ganamos?;
  - lo tuyo bajando 2 meses seguidos o más.
- Se quitaron las cinco tarjetas de la versión de la actividad 3: decían lo mismo que el puente, en otro orden.

## Actividad 8 · «Descargar para el contador» (migración 20261031120000)

### El problema primero

La pantalla ya no muestra cuentas (Felipe 2026-10-30): van solo en lo que se descarga. Pero cada estado tenía su propio «Descargar
Excel» (cuatro, en tres pantallas), cada uno con un formato distinto. Y el contador pide además dos cosas que ninguno daba: la balanza
de comprobación (cada cuenta con su saldo, el debe y el haber del mes) y el libro diario.

### Lo que se decidió

- **Un solo botón en la cabecera de los cuatro estados**, «Descargar para el contador» (`DescargarContador`). Abre la lista y cada opción
  baja UN archivo, para no bajar lo que no hace falta. La lista: estado de resultados, flujo de efectivo, balance general, cambios en el
  patrimonio, saldos por cuenta y libro diario del mes. La pieza es `MenuDescargar` (`components/ui/BotonDescargar.tsx`): el menú «Más»
  (`MenuAcciones`, que gana un `icono` opcional) con la cara de la descarga, porque el ícono de descarga solo vive en esa pieza (ADR-0358).
- Se quitaron los «Descargar Excel» de Estado de resultados, del formato formal del flujo y del Balance (los dos). El de «¿Y si…?» y el de
  Campañas se quedan: bajan otra cosa.
- **Cada archivo lo arma el servidor** (`GET /finanzas/reportes/descargar?archivo=&mes=`, `lib/contador.ts`), leyendo con la sesión de la
  persona y con **la misma función que su pantalla**: el archivo no puede decir una cifra distinta de la que se ve. Mientras se arma, el
  loader de pantalla dice cuál (ADR-0149); si falla, el aviso dice por qué y no baja un archivo a medias.
- **Qué lleva cada uno** (`lib/contador-reglas.ts`, con su prueba; CSV con «;», como los demás de Finanzas):
  - el estado de resultados y el balance, los CSV de siempre (con su columna «Cuenta»);
  - el flujo, en el formato formal por actividad, con el efectivo al inicio y al final, y semana a semana. El flujo directo no tiene una
    cuenta por línea: sus líneas son las categorías de la plata;
  - el patrimonio, por columna, con la cuenta de cada una en el encabezado (50, 52, 59);
  - los saldos por cuenta, de `fn_saldos_por_cuenta` (nueva);
  - el libro diario, de `fn_diario`, leído por páginas (un mes pasa de 5,000 líneas), con el nombre de cada cuenta y su sede, y el debe
    y el haber al pie.
- **`fn_saldos_por_cuenta(p_mes)`** lee el mismo diario que el Balance (`fn_bal_diario` desde el arranque más los saldos de arranque).
  Devuelve cada cuenta con algo: su saldo al empezar el mes, el debe y el haber del mes y su saldo al cerrar, en el signo del debe. La
  ve lo mismo que el Balance de CAYLA entera (`fn_exigir_estados_financieros_de_todo`). Las cuentas de ingreso y gasto acumulan desde el
  arranque porque todavía no hay cierre del año: cuando lo haya, ese asiento las deja en cero.
- **Una terminal** con el módulo baja solo el estado de resultados (el de su tienda: la base no le manda otra cosa). Lo demás es de CAYLA
  entera: se ve en la lista con su motivo y no se elige.
- **La sede de la barra no cambia los archivos**: el contador trabaja con CAYLA entera, y el estado de resultados ya trae una columna por
  sede.

### Cómo se verificó

`pnpm pruebas:saldos-por-cuenta` pasa 17 de 17 (en el CI, en `scripts/ci/pruebas-postgres.mjs`): el total de los saldos es 0, cada fila
cuadra, lo que tiene y lo tuyo coinciden con `fn_balance_general`, ingresos y gastos dan la ganancia de `fn_patrimonio_cambios`, abril
empieza donde cerró marzo, y los permisos. La ruta y el menú no se probaron en el navegador con sesión.

## Actividad 9 · Cierre

- **Guía de foco** (`lib/guia-de-foco-pantallas.ts`): ¿Ganamos?, ¿Dónde está la plata?, ¿Cuánto vale CAYLA? y Campañas pasan de
  `pendiente` a `no-aplica`, cada una con su motivo: solo miran. Sus controles son filtros (la fecha del Balance, cuántas semanas) o las
  palancas de «¿Y si…?», que no guardan. `PENDIENTES_HOY` baja de 51 a 47. Los saldos de arranque (`SaldosArranqueModal`) siguen
  `pendiente`: es un formulario de verdad y no se tocó aquí.
- **Formidable**: pasada por lectura de código (`docs/formidable/finanzas-estados-financieros.md`), con tres cambios propuestos que
  esperan el OK de Felipe. Sin ciega y sin oficio medido: el contenedor no tenía Supabase.
- **Modo oscuro**: las piezas nuevas usan solo tokens; `lib/tema-colores.test.ts` y `lib/tema-tokens.test.ts` pasan. **Falta**
  `tema:auditar` en local, con sesión, en las cuatro pantallas.
- `docs/ARQUITECTURA.md` describe las cuatro pantallas, sus `*-reglas.ts`, sus RPC y la ruta de descarga.

### Lo que queda abierto

- Probar las cuatro pantallas en el navegador con sesión: escritorio, 375 px, claro y oscuro. Probar también una cuenta con el módulo
  que no sea líder.
- Registrar los saldos de arranque en producción: sin ellos, el Balance, ¿Lo tuyo creció? y los saldos por cuenta lo dicen en vez de
  dar cifras.
- Dos decisiones de Felipe:
  - si una terminal con el módulo ve todo (hoy no lo ve);
  - si el Resumen de Finanzas muestra CAYLA entera a quien tiene el módulo (hoy muestra su tienda).
- El cierre del año: los saldos por cuenta acumulan ingresos y gastos desde el arranque hasta que exista el asiento de cierre.

## Actualización 2026-10-31 · Igual a la maqueta, y el formato formal arriba

### El problema primero

Felipe abrió la rama y ¿Ganamos? no se parecía a la maqueta que aprobó. En vez de la cascada de la maqueta, se había reusado la del
Resumen (`ResultadoPulso` y `CascadaPulso`): barras que nacían todas a la izquierda, la respuesta centrada («te faltan S/ 29,016.00») y
sin el margen. Lo mismo pasaba en la plata, en lo tuyo y en «Lo que dejó cada sede». La regla de Finanzas («se captura al mismo ancho que
el spike y se comparan las dos imágenes») no se cumplió: no había navegador, y no se avisó.

### Lo que se decidió

- **La cascada de la maqueta es la pieza de Estados financieros** (`components/finanzas/estados/CascadaEstados.tsx`, la geometría en
  `lib/cascada-estados-reglas.ts` con su prueba): cada paso flota desde donde terminó el anterior, los totales nacen en cero, hay subtotal
  (el margen), la raya de lo planeado con su píldora, la leyenda «Suma · Resta · Lo planeado» y las sedes con su color de hilo. La usan
  ¿Ganamos?, ¿Dónde está la plata?, ¿Lo tuyo creció? y «Lo que dejó cada sede». `CascadaPulso`, `ResultadoPulso` y lo que solo ellas
  usaban (`respuestaDeFila`, `cascadaDeFila` y su CSS) se borraron: ninguna otra pantalla las usaba. La prueba de ADR-0453 (los sueldos
  contados dos veces) pasó a `ganamos-reglas.test.ts`, sobre `cascadaGanamos`.
- **La respuesta como la maqueta** (`TitularEstado`): el nombre formal en versalitas, «Sí.» o «No.» con la cifra sin decimales, y la frase.
  Cada estado va en una tarjeta. La balanza pasa a dos platillos con bloques apilados de alto proporcional, como la maqueta (no dos barras),
  y lo tuyo gana sus dos cajas «Al empezar → Al cerrar» y la línea cerca del mes más bajo (el cambio 1 de Formidable).
- **El formato formal ya no va plegado al final** (Felipe 2026-10-31: «que no estén al final, sino opciones visibles en la parte superior»):
  en la cabecera de los cuatro estados, junto a «Descargar para el contador», el segmento **Respuesta | Formato formal**
  (`SegmentoEnlaces`, la pieza de ADR-0358 para ver lo mismo de otra forma). Va en la URL (`?forma=formal`, `formaDe` y `conForma` en
  `lib/estados-financieros-reglas.ts`): al pasar de un estado a otro, se queda la forma elegida.
- Solo Estados financieros (Felipe): el Resumen de Finanzas no cambia.

### Cómo se verificó

En local, una página de prueba (no se subió) dibujó las cuatro pantallas con los números de la maqueta. Se capturó a 1440 px, en claro y
en oscuro, junto a la maqueta, y se miraron las dos imágenes. Tipos, vitest, Knip y eslint en verde. Sin probar con sesión ni contra la base.

## Actualización 2026-10-31 (b) · El menú «Ver»

- Felipe eligió (entre dejar el selector, un menú o seis botones a la vista) **un menú «Ver»** en la cabecera, junto a «Descargar para el
  contador»: «Las respuestas» y los mismos seis cuadros de la descarga, para mirarlos sin bajar nada. Reemplaza al selector «Respuesta |
  Formato formal» de la actualización anterior: no hay dos controles para lo mismo.
- Los cuatro estados se abren en su formato formal (`?forma=formal`). Los saldos por cuenta y el libro diario viven en una pantalla interna,
  `/finanzas/reportes/cuentas?cuadro=saldos|diario` (`?ver=` ya es la sede en el telar), con la misma cabecera, sin tarjeta marcada. Leen
  con las mismas funciones que la descarga (`saldosDelMes`, `diarioDelMes`).
- **Las cuentas se ven en pantalla solo en estos dos cuadros**, donde son lo central. Las respuestas y los cuatro estados siguen sin
  números de cuenta.
- El libro diario de un mes pasa de 5,000 líneas: se lee entero una vez (por páginas de la base), se busca mientras se escribe (cuenta,
  asiento o glosa) y se ve de a 100. Al pie, el debe y el haber de lo que se está viendo.
- Una terminal ve en el menú lo que es de CAYLA entera con su motivo, sin poder elegirlo (la misma regla que la descarga), y la pantalla de
  las cuentas se lo dice si llega por URL.
- Se vio con números de ejemplo en local (capturas a 1440 px) antes de conectarlo. Sin probar con sesión.

## Actualización 2026-10-31 (c) · Una barra con las siete vistas

- Con el menú «Ver» quedaban dos menús uno al lado del otro con la misma lista de seis («Ver» y «Descargar para el contador»). Felipe
  comparó en una maqueta tocable (`docs/maquetas/finanzas-eeff-contador-2026-10/`) dos menús, un solo menú «Para el contador» y **una
  barra horizontal**, y eligió la barra.
- **La barra** va bajo el título, con la pieza de pestaña de vista del ERP (`<Pestanas>`, ADR-0358): Respuestas · Resultados · Flujo de
  efectivo · Balance · Patrimonio · Saldos por cuenta · Libro diario. Los nombres son cortos para que las siete entren en una fila (949 px,
  medido en local a 1024, 1280 y 1440 px); el nombre completo va en el título del cuadro y al pasar el mouse. La pieza no tiene
  separadores, así que los tres grupos de la maqueta quedan en el orden, sin rayas.
- **«Respuestas» muestra las cuatro tarjetas**; en un cuadro del contador, las tarjetas se van y queda su título con **«Descargar Excel»**
  (`DescargarCuadro`), que baja solo ese cuadro. Se fueron los menús «Ver» y «Descargar para el contador» (y `MenuDescargar`, y el ícono
  que se le había sumado a `MenuAcciones`).
- Una terminal ve solo las vistas de su tienda: lo de CAYLA entera no aparece en su barra (una pestaña que la cuenta no ve, no está).
- El PR #1519 se había fusionado antes de esto: la rama se reinició desde main con los commits que faltaban.

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

**Pegadas en producción por Felipe el 2026-10-31**, y verificadas con solo lectura (las cinco funciones nuevas, las lecturas ancladas, el módulo renombrado y los permisos). Se pegaron en orden: primero la 20261030235000 (que además renombra el módulo en Roles y accesos), después la 20261030235100 y al final la 20261031120000. Cada una se pega entera, de una vez: no tiene `alter` de tablas en uso ni políticas (ADR-0195, «Políticas y deadlocks»). Cada reemplazo está
anclado al texto vivo: si producción no coincide, la migración aborta sin cambiar nada.

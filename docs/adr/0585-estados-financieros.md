# ADR-0585 · Estados financieros: los cuatro estados como respuestas, y quien tiene el módulo ve todo

- **Fecha:** 2026-10-30 · **Estado:** en construcción, actividad por actividad (`/construir`). Actividad 1 hecha (permisos).
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

### Producción

Se pega entera, de una vez: no tiene `alter` de tablas en uso ni políticas (ADR-0195, «Políticas y deadlocks»). Cada reemplazo está
anclado al texto vivo: si producción no coincide, la migración aborta sin cambiar nada.

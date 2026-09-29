# ADR-0275 · CAYLA Global: la vista de toda la empresa, solo para el Admin

- **Fecha:** 2026-09-28 · **Estado:** aceptado. Paso 1 («la puerta») construido y verificado en local. **La migración
  NO está en producción.**
- **Pedido:** Felipe, 2026-09-28, mirando el selector de sede: «necesito crear una vista global solo disponible para
  cuentas de Administración». Luego precisó: ver el conjunto de los negocios fusionado —stock, inventario, liquidez, un
  solo balance, un solo estado de resultados, un solo flujo de efectivo—, como una sola corporación; «diseñada no con un
  fin operativo de piso o almacén, sino de análisis comercial, entendimiento del negocio y ayuda a la toma de
  decisiones, solo con módulos relevantes para esa vista», y actuar desde ahí con un llamado a la acción en cada área.
- **Migración:** `supabase/migrations/20260929140000_cayla_global_modulo_solo_admin.sql` (se pega entera, de una vez).
- **Pruebas nuevas:** `pnpm pruebas:cayla-global` (10 casos, en el CI), `lib/vista-global.test.ts` (14),
  `lib/cayla-global-tablero.test.ts` (10) y dos reglas más en `lib/modulos.test.ts`.
- **Maqueta del tablero:** `docs/maquetas/cayla-global-2026-09/`. **Investigación:**
  `docs/investigacion/2026-09-28-cayla-global-indicadores-y-metodo-buffett.md`.
- **Complementa:** ADR-0161 (roles «ve / no ve»), ADR-0178 (escalón Admin), ADR-0253 (Líder de equipo editable),
  ADR-0195 (Finanzas, que ya sumaba «todas» para el líder), ADR-0220 (cabecera).

## Decisiones de Felipe (2026-09-28, por preguntas)

- **Dónde vive:** una opción del selector de sede, «CAYLA Global», que cambia TODO el ERP a esa vista, pero **solo con
  los módulos relevantes para decidir**. La operación de piso y almacén no aparece.
- **Quién la ve:** un módulo de Roles y accesos que **nace solo del Admin**. Si mañana otra persona la necesita (su
  contadora, un socio), se la da desde la pantalla.
- **Qué hace desde ahí:** ayudarle a gestionar mejor la empresa, con un llamado a la acción en cada área: trasladar
  entre sedes, pedir producción al Taller, mover dinero y ajustar metas y presupuesto.
- **Qué responde primero:** «qué tan saludable va el negocio y qué decisiones tomar» (crea valor, crece, es rentable),
  con los indicadores de las mejores empresas y el método de Buffett para su holding (ver la investigación).
- **El Taller:** se mide **contra maquilar afuera** (centro de costo), no como una tienda con utilidad inventada.
- **La historia:** los **totales mensuales de Alegra por sede** (12-24 meses) alimentan «¿Crece?» y «¿Crea valor?». Es
  un paso aparte.
- **Arranque:** la puerta ahora; el tablero completo después de aprobar la maqueta.

## Decidí

### A · CAYLA Global es una perspectiva, no una sede

La misma cookie de la sede elegida (`cayla_ubicacion_activa`) guarda el valor `global`. Solo la escribe
`cambiarUbicacionActiva`, después de preguntarle a la base `fn_ve_modulo('cayla_global')`. En esa vista:

- `persona.vista = "global"`: `ubicacionEtiqueta` dice «CAYLA Global», y `modulos` trae solo los de
  `MODULOS_DE_LA_VISTA_GLOBAL` (`lib/vista-global.ts`). De esa lista salen el menú, la puerta `exigirModulo` y las
  rutas.
- `persona.ubicacionId` sigue siendo la sede donde trabaja la persona: los ~230 archivos que la usan no cambian. Las
  pantallas que la usarían mal no existen en esta vista.
- **Una sola barrera de rutas** en `proxy.ts`: el inicio lleva a `/global`; toda otra pantalla fuera de
  `RUTAS_DE_LA_VISTA_GLOBAL` lleva a `/global/elige-sede`, que dice «Punto de venta trabaja en una sede» y ofrece un
  botón por sede. Solo ofrece las sedes donde esa pantalla existe (Producción, solo el Taller). Al elegir, queda parada
  ahí y abre la pantalla.
- Finanzas abre con **todas las sedes** por defecto (`verDeLaVista`). Lo que venga en la URL manda.
- Parado en una sede, el módulo `cayla_global` no aparece: el tablero no es de una sede. `/global` por enlace entra
  solo a la vista (`/global/entrar`).

**DECIDÍ:** una lista cerrada de módulos que funcionan en la vista, y la vista como filtro de lo que la cuenta usa.
**DESCARTÉ:** dejar la sede vacía en modo global para que cada pantalla sume todas las sedes. Obliga a revisar ~230
archivos (semanas), y Vender, Caja o un Conteo no tienen sentido sin sede: cada movimiento tiene que quedar anotado en
una (principio 4).
**SE ROMPE SI:** alguien suma un módulo a `MODULOS_DE_LA_VISTA_GLOBAL` antes de que sus pantallas sepan leer toda la
empresa. La pantalla mostraría las cifras de la sede donde trabaja la persona bajo el título «CAYLA Global». Regla: un
módulo entra a la lista con su lectura consolidada en el mismo PR. `vista-global.test.ts` vigila que la lista y las
rutas coincidan con el menú, y que ningún módulo de operación entre.

### B · El «módulo del Admin»

El ADR-0253 dejó dos cosas:

- El Líder de equipo ve todo lo que no se le quitó, así que un módulo nuevo nace visible para todo líder.
- El Admin es un líder más para «ve / no ve»: si le quita Caja al Líder de equipo, él también deja de verla.

Por eso «nace solo del Admin» necesitó un concepto nuevo, **como dato**:

- **`modulos.del_admin`:** el Admin lo ve siempre, aunque se le quite al Líder de equipo. El resto de los módulos
  sigue exactamente como en el ADR-0253 (lo prueba `roles_lider_editable.mjs`, 13/13). Hoy solo `cayla_global` lo es.
- **`cayla_global` nace quitado al Líder de equipo** (`lider_modulos_ocultos`), solo al nacer. Volver a pegar la
  migración no se lo quita a los líderes si el Admin ya se lo dio.
- **Solo das lo que ves, también el líder** (`fn_exigir_modulos_dentro_de_lo_mio`, `fn_exigir_rol_dentro_de_lo_mio`).
  Hasta hoy un líder encendía cualquier módulo en un rol, porque antes del ADR-0253 lo veía todo. Ahora un líder que no
  es Admin solo da lo que ve, y el mensaje le dice «pídeselo a un Admin». El Admin da todo.
- **Solo para personas:** una terminal no la tiene (`fn_exigir_rol_de_terminal`, cambiada por ancla).
- Quien tiene `cayla_global` **ve las finanzas de todas las sedes** (`fn_ve_finanzas_de_todo`), en lo que sus módulos
  de Finanzas le dejan.

**DECIDÍ:** una columna que marca el módulo, más el mecanismo de quitar al Líder que ya existía.
**DESCARTÉ:** «el Admin ve todo» como regla general. Fue mi primera versión, y `roles_lider_editable.mjs` la atrapó:
contradice lo que Felipe decidió en el ADR-0253 para Caja y el resto. También descarté un `if clave = 'cayla_global'`
dentro de `fn_ve_modulo`: la próxima vista del Admin exigiría tocar la función de nuevo.
**SE ROMPE SI:** Felipe le da CAYLA Global a alguien que **no es líder** antes de que las pantallas de Finanzas dejen
de preguntar `rol === 'lider'`. La base ya le deja ver todas las sedes, pero la web de Finanzas le mostraría solo la
suya. Es el mismo hueco que dejó el ADR-0253 para Configuración y Cierre de mes: queda en el backlog, con su tarea.

### C · El tablero, paso 1: con qué datos cuenta

`/global` («Salud del negocio», ícono de pulso) muestra hoy dos cosas:

- **Con qué datos cuenta la vista** (`fn_global_cobertura`): por sede, si vende en el ERP y desde cuándo, las ventas de
  30 días y las unidades en stock. Una sede que no opera en el ERP dice eso, nunca «vendió 0». El Taller dice su stock:
  no vende a clientas.
- **Dónde se ve ya toda CAYLA:** la caja, el estado de resultados, las ventas contra la meta, las metas y el
  presupuesto, y las clientas.

**Por qué empieza así:** el 2026-09-28 producción tenía 2 ventas (TRU y AQP, ambas de ese día), y LIM y el Taller
estaban en cero. Un tablero de salud sobre esos datos mentiría. Lo primero que tiene que decir es que no hay historia
todavía.

## Qué falta (en orden)

1. **Pegar la migración en producción** (pide el «dale» de Felipe; se pega entera).
2. **Aprobar la maqueta** y resolver sus 10 puntos abiertos (README de la maqueta). Entre ellos, que «Decisiones de esta
   semana» y «Para decidir hoy» de Finanzas ▸ Resumen sean **una sola lista** con un solo motor. Propuesta: el motor de
   `fn_resumen_finanzas` crece, y Finanzas muestra su parte.
3. **Traer de Alegra los totales mensuales por sede:** ventas, costo, gastos y, según la maqueta, el valor del stock
   (sin él no hay «¿Crea valor?» para LIM).
4. **El tablero completo:** cuatro veredictos, decisiones de la semana con su botón y cada negocio de CAYLA.
5. **Existencias, Movimientos, Análisis, Traslados y Producción** entran a la vista cuando lean la red entera (cada uno
   con su prueba).
6. **Precio de maquila de referencia por tipo de prenda** (Configuración), para medir el Taller.

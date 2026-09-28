# ADR-0253 · Ningún módulo «solo del líder», y el Líder de equipo se edita

- **Fecha:** 2026-09-28 · **Estado:** propuesto, **sin pegar en producción** (pide el OK de Felipe).
- **Pedido:** Felipe, 2026-09-28, mirando Roles y accesos: «el rol de líder de equipo está bloqueado, ¿por qué? No
  debería, y ningún módulo debería estar limitado a solo el líder».
- **Migraciones (se pegan en este orden, cada una entera):**
  1. `20260928220000_finanzas_modulos_delegables.sql` — md5 `6e94e4129baf365560445d67b72d5c53`
  2. `20260928220100_lider_de_equipo_editable.sql` — md5 `4c0288c1870ee048d9463163e3995bfb`
- **Prueba nueva:** `pnpm pruebas:roles-lider-editable` (13 casos, en el CI).
- **Complementa:** ADR-0161 (roles «ve / no ve»), ADR-0178 (escalón Admin), ADR-0195 (Finanzas: F1, F8 y F9 nacieron
  «solo líder por ahora»), ADR-0126 (reescribir funciones por texto desde su definición real).

## Qué había

Dos cosas distintas se veían iguales en la pantalla:

1. **El candado del rol «Líder de equipo».** Era un rol `fijo`: veía todo, siempre, y `guardar_modulos_rol` rechazaba
   editarlo («no se edita: ve y hace todo, siempre»). No le quitaba nada; el candado decía «tiene todo», pero se leía
   «bloqueado».
2. **«Solo líder por ahora» en tres módulos:** Configuración, Impuestos y Cierre de mes (consultado en producción el
   2026-09-28: los únicos con `delegable = false`). Sus funciones preguntaban `fn_es_lider()` directo; darlos a un rol
   habría abierto pantallas que fallan al guardar, por eso la base lo impedía.

## Decisiones de Felipe (2026-09-28)

- **El Líder de equipo:** «editable como cualquier rol» (se le advirtió que sin Roles y accesos nadie podría
  devolverle lo quitado desde el ERP).
- **Alcance de los tres módulos:** «todo, como el líder» — no «solo su tienda».
- **Reabrir un mes cerrado:** quien tenga Cierre de mes (no queda solo del líder).

## Decidí

### A · Los tres módulos se dan como cualquier otro (`20260928220000`)

- Cuatro preguntas nuevas con la forma de las `fn_puede_*` de siempre (líder, o el módulo en un rol a medida por
  `fn_capacidad_por_modulos`): `fn_puede_configurar()`, `fn_puede_ver_impuestos()`, `fn_puede_cerrar_mes()` y
  `fn_ve_finanzas_de_todo()` (líder, Configuración o Cierre de mes).
- 36 funciones cambian **solo** su candado y su mensaje («… necesita el módulo «X» en tu rol»), reescritas desde su
  definición real con `pg_get_functiondef`, como `fn_aplicar_candado_de_dinero()`:
  - **Configuración** (sus 7 pestañas): metas y fondo, efecto de campaña, hora de cierre, presupuesto (leer, proponer,
    guardar, en lote), caja y avisos, parámetros tributarios, y `fn_exigir_lider_dinero` (crear, editar, archivar y
    eliminar cuentas, a qué cuenta entra cada cobro, conciliar, lo pasado sin cuenta, la plata del dueño).
  - **Impuestos:** panel, meses, registros de ventas y de compras.
  - **Cierre de mes:** panel, estado, cerrar y reabrir.
  - **Alcance** (`v_lider` / «el líder ve todas las tiendas y la empresa» → `fn_ve_finanzas_de_todo()`): el diario que
    se congela al cerrar (`fn_asientos`, `fn_diario_ubicaciones`, `fn_periodos_mes`), los gastos fijos y sus
    sugeridos, las cuentas con su saldo, y las lecturas vecinas que comparten esos ayudantes (`fn_gastos_*`,
    `fn_cuentas_*`, `fn_movimientos_dinero`, `fn_presupuesto_vs_real`, `fn_campanas_reporte`), para que una misma
    persona no vea una cosa en una pantalla y otra en la de al lado. Sin esto, cerrar la empresa desde un rol a medida
    congelaría un diario a medias.
- `retail.modulos.delegable = true` para los tres. Siguen naciendo **sin rol**: el líder decide a quién se los da.
- **Consecuencia buscada (dicha de frente):** `fn_gastos_puede` también es la puerta de `registrar_gasto`; quien tiene
  Configuración o Cierre de mes puede, como el líder, registrar un gasto de cualquier tienda o de la empresa. Las
  pantallas de Gastos y de Cuentas y dinero siguen pidiendo su propio módulo.
- **Impuestos solo** no abre el alcance de las demás tiendas: sus funciones son del RUC entero y no lo necesitan.

### B · El Líder de equipo se edita (`20260928220100`)

- **Se guarda lo que se le QUITA, no lo que ve** (`retail.lider_modulos_ocultos`, RLS sin políticas). Así un módulo
  nuevo sigue apareciéndole solo al líder sin que su migración escriba en ningún rol (regla «Módulos y roles»).
- `fn_mis_modulos` y `fn_ve_modulo` descuentan lo quitado: el líder deja de verlo en el menú, en la URL
  (`exigirModulo`) y en sus botones (`permisosDeModulos("lider", …)` pierde los permisos que salen **solo** de lo
  quitado; `administrar` y `verDinero` no salen de ningún módulo y se quedan).
- **No es un candado entre líderes:** `fn_es_lider()` sale de `colaboradores.rol`, no de este rol, y sigue siendo el
  pase de la base. Anular ventas, aprobar devoluciones y el resto de «siempre solo del líder» siguen siendo suyos
  aunque se le quite el módulo.
- **Solo un Admin lo edita** (ADR-0178): tocar el Líder es tocar a todos los líderes.
- **«Roles y accesos» no se le quita:** lo rechazan `guardar_modulos_rol` (mensaje claro) y un check en la tabla.
- `guardar_modulos_rol` se reescribe desde producción (huella `0a901893…`): la rama del Líder guarda lo quitado; las
  dos ramas comparten el historial y firman **una vez** con el responsable (lo exige `pruebas:roles`). La versión del
  rol sube igual (ADR-0193).
- **Duplicar el Líder** copia lo que el Líder ve hoy, no todo (`crear_rol`, reescrito por texto, huella `825708b6…`).

### Web

- `lib/modulos.ts`: los tres sin `noDelegable`; `verImpuestos` y `cerrarMes` salen de sus módulos.
- `lib/roles.ts`: el Líder llega con «todos menos lo quitado» (`fn_lider_modulos_ocultos`; sin la función, todos).
- Roles y accesos: el Líder muestra interruptores (activos solo para un Admin), «No se le quita» en Roles y accesos,
  «33 de 34 módulos» en su tarjeta en vez del candado, y la matriz lo deja marcar.
- El enlace a Configuración (perfil) y «Editar fijos» (Gastos) se ofrecen a quien ve Configuración, no solo al líder.

## Qué NO cambia

- La lista «Siempre solo del líder» (anular, autorizar sobre el tope, aprobar devoluciones, etiquetas con descuento,
  subir a alguien a Líder…). Son acciones, no módulos.
- Las series de SUNAT en la pestaña Empresa: su política (`series_comprobantes`) sigue mostrando todas solo al líder.
- Archivar o renombrar el Líder: sigue cerrado.

## Cómo se verificó

- Antes de escribir: huella md5 de las 41 funciones tocadas, **idéntica** en el repo y en producción.
- Postgres desechable propio (la imagen de Supabase 17.6.1.165, sin tocar la base local compartida): 343 migraciones
  + seed desde cero. Las dos migraciones pegadas **dos veces** (la segunda no hace nada).
- `pruebas:roles-lider-editable` 13/13; y en verde `roles-cobertura` 31/31, `impuestos`, `cierre-mes` 104/104,
  `configuracion-caja`, `presupuesto` 78, `gastos`, `activos-y-fijos`, `cuentas-dinero` 88, `editar-cuentas` 39,
  `cuenta-sellada` 76, `estado-resultados` 73, `balance` 69, `resumen-finanzas` 68, `flujo-caja` 55,
  `por-pagar-consolidado` 33. `pruebas:roles` 67/70: las 3 rojas (Etiquetas ×2 y «P2 · Recibir») fallaban **igual
  antes** de este cambio en la misma base; no son de aquí.
- Web: `tsc` limpio, eslint, 206 archivos / 152 201 pruebas. En el navegador (página temporal con el panel real y datos
  de ejemplo): el Líder con Caja quitada, devolverla marca «Se suma» y «1 cambio · afecta a 2 cuentas»; sin ser Admin,
  los 33 interruptores quedan quietos; el rol «Finanzas» enciende Configuración, Impuestos y Cierre de mes, y su menú
  los muestra.

## Riesgo que queda

La parte A reescribe funciones **por texto**. Si una migración futura vuelve a crear una de ellas copiando un archivo
viejo del repo, le devuelve el candado de líder sin avisar. Lo vigila la prueba (ninguna de las 36 vuelve a preguntar
`fn_es_lider()`); quien toque una de esas funciones parte de su definición real en la base.

## Pendiente

- **Pegar en producción** (A y luego B) con el OK de Felipe, y después refrescar el diccionario
  (`pnpm datos:generar:produccion`, `pnpm datos:comparar`).
- Cuentas y dinero sigue mostrando conciliar y la plata del dueño solo si la cuenta es líder (`esLider`), aunque la
  base ya se los deja a quien tiene Configuración. Lo mismo, la opción «De la empresa» en Gastos.
- Quedan ~39 funciones con `if not fn_es_lider() then raise` escrito directo (acciones «siempre del líder» y otras sin
  clasificar; lo cuenta `pruebas:roles-cobertura`).

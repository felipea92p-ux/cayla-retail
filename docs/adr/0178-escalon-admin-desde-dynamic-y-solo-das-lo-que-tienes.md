# ADR-0178 — Escalón Admin (leído de Dynamic) y «solo das lo que tienes»

**Fecha:** 2026-09-23 · **Estado:** decidido por Felipe; construido en la rama `claude/escalon-admin-dynamic`; migración
`20260923163000_escalon_admin_desde_dynamic.sql` **pegada en producción el 2026-09-23** (escrita como `20260923160000`, renumerada al fusionar por choque con `responsable_obligatorio`) · **Cambia:** ADR-0161 (L1 «un líder sube y baja
líderes», B7 «quien tiene Roles y accesos edita sus propios módulos», B8 protección 2).

## El problema

Revisando Roles y accesos con Felipe (2026-09-23, consultas de solo lectura a producción):

- **Entre líderes no había jerarquía.** Los 9 líderes podían lo mismo y, por la regla L1, cualquiera bajaba, suspendía, quitaba
  o movía de sede a cualquier otro, incluidos Felipe y la socia. Cuatro de esos 9 son del equipo de sistemas (3 practicantes).
- **Delegar Roles y accesos era delegar todo.** Quien tenía ese módulo sin ser líder podía armar un rol con los 23 módulos y
  asignarlo, o encenderle módulos a su propio rol. El único freno era no poder subir a nadie a Líder.

## Decisiones (Felipe, 2026-09-23)

| # | Decisión | Por qué |
|---|---|---|
| 1 | **Un escalón Admin por encima de Líder.** | Alguien tiene que poder administrar a los líderes sin que los líderes se administren entre ellos. |
| 2 | **El Admin se LEE de Dynamic:** es Admin quien es `public.personas.rol = 'admin'` en Dynamic **y** Líder activo en retail. No hay columna nueva. | Una sola fuente de verdad (principio 4). Dynamic ya protege ese rol: su `fn_set_rol` solo deja a un admin nombrar a otro admin. Hoy son 5 (Felipe, Catherine, Dante, Carlos, Lizzelott) y los 5 ya eran líderes aquí. |
| 3 | **Lo único que pasa a ser solo del Admin es administrar líderes:** subir a alguien a Líder, y cambiarle el rol, la sede o el acceso (suspender, reactivar, quitar) a un líder. | Todo lo demás del líder sigue igual (anular, series SUNAT, devoluciones, descuento sobre el tope). `fn_es_lider()` no cambia y también es verdadera para un admin: las ~61 funciones que la llaman no se tocan. |
| 4 | **«Solo das lo que tienes»**, para quien no es líder: (a) no enciende en un rol un módulo que no ve; (b) no asigna, ni a una persona ni a una terminal, un rol con módulos que no ve, y tampoco crea uno duplicando un rol así; (c) no edita los módulos de su propio rol. | Sin esto, dar Roles y accesos equivalía a dar el ERP entero. El líder no cambia: ve todo, así que da todo. (c) revierte la parte de B7 que lo permitía. |
| 5 | **El rol a medida «Administrador»** (vacío, sin cuentas, creado el 2026-09-22) **se archiva.** | Evita confundirlo con el escalón. Se archiva, no se borra: tiene historial. |

**Por qué el nivel laboral (rango) no entra.** El rango (colibrí → archicaylo) es la categoría de la Ley 30709 y fija el sueldo.
Si un ascenso de sueldo diera accesos, alguien ganaría la caja sin que nadie lo decidiera. El rol de Dynamic `admin` es otra
cosa: ya es un rol de **administración del sistema**, por eso sí se usa.

## Cómo se construye

- **Base** (`20260923163000`): `fn_es_admin()`, `fn_es_admin_persona(persona)`, `fn_admins()` (para marcarlos en pantalla),
  `fn_exigir_otro_admin` (nunca quedan cero admins), `fn_modulos_que_no_tengo`, `fn_rol_dentro_de_lo_mio`,
  `fn_exigir_rol_dentro_de_lo_mio` y `fn_exigir_modulos_dentro_de_lo_mio`. Se cambian desde su definición viva, con conteo
  exacto de ocurrencias, `fn_exigir_puede_tocar_colaborador` (la usan cambiar ubicación, suspender, reactivar y quitar),
  `asignar_rol`, `guardar_modulos_rol` y `crear_rol`.
- **Terminales:** se crean con la llave de servicio, así que la base no ve a quien las crea. La web pregunta
  `fn_rol_dentro_de_lo_mio` con la sesión antes de insertar (`lib/terminales-alta.ts`).
- **Web:** en Colaboradores, el chip «Admin» y las acciones sobre un líder solo para un Admin. En Roles y accesos: los
  módulos que uno no tiene salen con candado «No lo tienes» (se pueden apagar, no encender), el propio rol queda bloqueado
  con aviso, «Encender todo» solo mueve lo propio y «Asignar» aparece solo si se puede dar el rol. Reglas puras en
  `lib/roles-reglas.ts` (`fueraDeLoMio`, `motivoPorLoMio`, `puedeAsignarRol`, `controlDe`).
- **Compatibilidad:** si la web se publica antes de pegar la migración, `getEscalonAdmin` cae a «el líder administra
  líderes» y el alta de terminales no pregunta la regla nueva (la función aún no existe). La base decide igual.

## Límites conocidos

- Si en Dynamic nadie queda como `admin`, retail se queda sin admins y nadie puede tocar a los líderes hasta que Dynamic nombre uno. Es a propósito: el admin se administra en Dynamic.
- ~~Quien tiene Colaboradores sin ser líder todavía puede suspender o quitar a un colaborador que ve más módulos que él.~~ Resuelto el mismo día (ver «Actualización» abajo).
- `fn_exigir_otro_admin` casi nunca se dispara: quien actúa ya es admin y no puede tocarse a sí mismo. Queda como defensa por si cambia la forma de nombrar admins.

## Verificación

`pnpm pruebas:roles --base cayla_admin`: una copia local alineada con producción en las funciones de roles. Pasan los 5 casos
nuevos y los 6 que cambiaron de expectativa. Las 15 fallas restantes son las mismas que en la copia SIN esta migración:
funciones de Compras de la base local distintas a producción, y P6 puesto como stub. Typecheck, lint y vitest (24,221)
en verde. Pantalla vista en el navegador con datos de muestra: chip Admin, candados «No lo tienes», propio rol bloqueado.

## Lo que se rompería sin esto

Cualquier practicante con el rol Líder podía quitarle el acceso a la socia. Y darle Roles y accesos a una encargada
equivalía a darle Por pagar y Colaboradores, porque podía encendérselos a sí misma.

## Actualización 2026-09-23 — «solo alcanzas a quien está por debajo de ti» (Felipe)

**Decisiones de Felipe:**
- Daniel y los 3 practicantes **siguen siendo Líder**. Con el escalón Admin ya no pueden tocar a los admins.
- Se adopta la regla de Dynamic («solo alcanzas a quien está por debajo de ti»).

**Cómo se traduce sin niveles numéricos:** en retail una persona está por debajo de otra cuando esta ve todos sus
módulos y además tiene más que ella. Es estricto, igual que en Dynamic: a una compañera con exactamente los mismos
módulos no se la alcanza, y entre pares decide un líder.

- **Qué cubre:** suspender, reactivar, quitar, cambiar de ubicación y cambiar el rol de una persona.
- **El líder:** alcanza a todos los que no son líder. A un líder lo sigue tocando solo un Admin.
- **Las terminales:** no entran. Son aparatos; para darles un rol ya rige «solo das lo que tienes».
- **Base:** migración `20260923174500_alcanzas_solo_a_quien_esta_debajo.sql`. Agrega `fn_alcanzo_a`,
  `fn_exigir_alcanzo_a`, `fn_modulos_de_persona` y `fn_fuera_de_mi_alcance` (esta última avisa a la pantalla), y se inyecta
  en `fn_exigir_puede_tocar_colaborador` y en `asignar_rol`.
- **Web:** las filas de quien no alcanzas no ofrecen acciones; entre los suspendidos dice «Lo gestiona un líder». Al asignar
  un rol, esas personas no aparecen en la lista.
- **Pruebas:** `pruebas:roles` suma 2 casos: por debajo sí; par y superior no; cambiar el rol; y la lista para la pantalla.

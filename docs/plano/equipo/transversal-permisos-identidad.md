# Todo el equipo — cada dueño de pájaro que pega SQL en producción (Felipe, Dany, Diego, Benja) más quien construye Admin, coberturas y ascensos de rol — Transversal — identidad y permisos

> Extraído del plano maestro (143 decisiones, `docs/plano/00-ACTA-24-DECISIONES.md` y
> `02` a `05-ACTA-SESION-*.md`). Cada línea es una decisión ya tomada por Felipe — no es
> una propuesta, es lo que hay que construir o ya está construido.

## Decisiones

**PL-11** — El SQL a producción lo pegan Felipe más un segundo pegador nombrado, con la regla "SQL antes que web" y verificación después.

**PL-27** — Nace un nivel de permiso propio, Compras: crea/edita proveedor, registra orden y pago; no cierra caja ni ve otras sedes.
  *Pendiente:* Construir el rol y sus RPC — hoy no existe.

**PL-48** — El cuarto nivel de permiso de D-12 se llama Admin, igual que en Dynamic (no "Dueño"); debe seguir siendo columna/allowlist propia de retail, nunca derivada automáticamente del admin de Dynamic.
  *Pendiente:* Corregir docs/datos/DECISIONES-2026-09-12.md:67 y apps/web/lib/menu.ts:43 si ya citan Admin con otro nombre.

**PL-83** — El rol Admin se construye ahora en la base, antes de sumar más pantallas que solo saben de líder de equipo/integrante.
  *Pendiente:* Construir la columna/allowlist de Admin — es la pieza que todo lo demás de este bloque asume que ya existe.

**PL-86** — El segundo pegador de SQL (el que quedó pendiente en PL-11) es Dany.

**PL-87** — El checklist de SQL a producción es obligatorio por igual para Felipe y Dany: ensayo en Postgres desechable + sonda de solo lectura + registro de qué y cuándo se pegó.
  *Pendiente:* Escribirlo como documento operativo formal, no solo como costumbre.

**PL-88** — Se mantienen los 4 niveles de rol de D-12 tal cual, aunque el contador todavía no use "Solo lectura".

**PL-89** — Los líderes de equipo con alcance global se acotan a alcance por sede en la primera semana completa después del lanzamiento de TRU, con fecha exacta fijada de antemano.
  *Pendiente:* Fijar la fecha exacta apenas TRU salga en vivo.

**PL-90** — Cubrir otra sede lleva vencimiento (D-14): tabla `retail.coberturas` (persona, ubicación, vence_el) más una rama en `fn_puede_operar_ubicacion`, con lista visible de coberturas activas.
  *Pendiente:* Construir la tabla, la función y la lista visible — ninguna de las tres existe todavía.

**PL-92** — La baja de acceso ya está resuelta desde V2: `fn_es_lider()` y `fn_ubicacion_actual_persona()` ya filtran `estado='activo'`, así que una integrante dada de baja no puede seguir vendiendo. No hay nada que construir.

**PL-93** — La auditoría menú-vs-base se hace en dos pasos, en orden: primero una auditoría manual completa (qué botón esconde una tabla sin candado real detrás) y después un chequeo automático en CI para que no vuelva a quedar dormida sin avisar.
  *Pendiente:* Hacer la auditoría manual ahora; construir el chequeo de CI después.

**PL-94/95** — Cada dueño de pájaro pega el SQL de su propio módulo (Felipe-Catálogo, Dany-Ventas, Diego-Compras, Benja-Inventario) con el checklist de PL-87; quien tiene esa llave ve el negocio completo como Admin, por decisión explícita de Felipe, no por separación técnica/de negocio. La bitácora es doble y no opcional: tabla `sql_aplicado` y el PR de GitHub, los dos a la vez.
  *Pendiente:* Crear la tabla `sql_aplicado` — hoy la bitácora solo vive en el historial de PR.

**PL-96** — Ascender o bajar a alguien de rol pasa a ser una función `security definer`, solo para Admin, con registro de quién lo hizo y cuándo — deja de depender de un `UPDATE` manual por SQL Editor.
  *Pendiente:* Construir la función — hoy el cambio de rol sigue siendo un UPDATE a mano.

**PL-107** — Subir o bajar a alguien a líder de equipo se construye como pantalla, visible solo para Felipe, con confirmación y quedando en el historial de accesos.
  *Pendiente:* Construir la pantalla — comparte la función `security definer` de PL-96, así que van juntas.


## Tus pendientes, en orden

1. Construir el rol Admin en la base (PL-83) — sin esto, Admin sigue siendo un nombre en el acta, no una columna real, y bloquea PL-94/95 y PL-96.
2. Construir la tabla retail.coberturas y la rama en fn_puede_operar_ubicacion (PL-90) — hoy cubrir otra sede no vence solo, es un hueco de seguridad abierto.
3. Construir la función security definer para ascender/bajar de rol y la pantalla que la usa, visible solo para Felipe (PL-96 + PL-107) — hoy el cambio de rol es un UPDATE manual por SQL, sin registro de quién ni cuándo.
4. Fijar la fecha exacta en que los líderes de equipo con alcance global pasan a alcance por sede, en la primera semana post-lanzamiento de TRU (PL-89).
5. Crear la tabla sql_aplicado para que la bitácora de SQL sea doble de verdad, no solo el historial de PR (PL-94/95).
6. Escribir el checklist de SQL a producción como documento operativo formal para Felipe y Dany (PL-87).
7. Construir el rol Compras y sus RPC (PL-27) — nuevo nivel de permiso que todavía no existe.
8. Hacer la auditoría manual menú-vs-base y después construir el chequeo automático en CI (PL-93).
9. Corregir la documentación que todavía puede nombrar mal a Admin (docs/datos/DECISIONES-2026-09-12.md:67, apps/web/lib/menu.ts:43) y el pendiente fantasma de baja de acceso en 05-SEGURIDAD.md (PL-48, PL-92).

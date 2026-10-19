# ADR-0454 — Las terminales de Lima no piden responsable, de forma temporal y por dato: «firma de respaldo»

- **Fecha:** 2026-10-19 · **Estado:** propuesto (código y pruebas en la rama; **las dos migraciones están en producción desde el 2026-10-19 con el OK de Felipe**, pegadas en orden y verificadas: solo Caja Lima y Almacén Lima tienen respaldo)
- **Relacionados:** ADR-0161 y ADR-0162 (el combo «Responsable» y las terminales sin persona), ADR-0280 (las 30 acciones que Felipe soltó del combo),
  ADR-0178 (el Admin firma sin asistencia, el modelo de este cambio), ADR-0195 (políticas y deadlocks en el SQL Editor), CLAUDE.md principios 2, 4 y 9.

## El problema

El combo «Responsable» solo ofrece a quien tiene la entrada marcada en la tienda (`fn_asesoras_de_turno` / `fn_persona_presente`, que leen la asistencia de
Dynamic). **La asistencia de Lima todavía no llega desde Dynamic**, así que en «Caja Lima» y «Almacén Lima» el combo dice «Nadie de turno en Tienda LIM» y
**todo lo que guarda queda bloqueado, en todos los módulos**. Felipe pidió (2026-10-19): *que esas dos terminales no pidan responsable en ningún módulo, solo
Lima, solo por ahora, hasta que se integre con Dynamic.*

Terminales en producción (consultado 2026-10-19, `retail.terminales`): Caja Lima (`ventas`) y Almacén Lima (`administrativa`) en «Tienda LIM»; además Caja y
Almacén de Trujillo y de Arequipa, que **no** cambian.

## Lo que se decidió

### 1. Es un dato, no código: `retail.terminales.firma_respaldo_id`

Una columna nueva (persona, nullable). Una terminal que la tiene **no pide responsable**: `fn_actor_persona_id(true)` devuelve siempre esa persona, sin mirar
`x-responsable` ni la asistencia. Con la columna vacía todo es exactamente igual que antes. **Volver es una línea, sin redeploy:**

```sql
update retail.terminales set firma_respaldo_id = null where firma_respaldo_id is not null;
```

Se descartó codificar «Lima» en la función (`if ubicacion.nombre = 'Tienda LIM'`): un nombre propio dentro de una regla del núcleo no se puede apagar sin
migración, y mañana puede ser otra tienda.

### 2. La persona de respaldo es Felipe Alvarez, y NO «nadie»

Elegido por Felipe entre tres caminos. Con la firma vacía (`NULL`) fallarían en Lima ~12 tablas que guardan «quién lo hizo» en una columna `NOT NULL`
(`despachos.despachado_por`, `bajadas_piso.persona_id`, `cuadres_piso.persona_id`, `separaciones.creado_por`, `frescura_decisiones.persona_id`,
`despacho_*`…, medido en producción el 2026-10-19): traslados, bajar al piso, cuadre del piso y apartar no funcionarían. Cambiar esas columnas habría sido una
migración sobre ~12 tablas en uso para algo temporal.

**El precio, dicho claro:** en esas filas el historial dirá «Felipe» aunque la acción la hizo el aparato. Lo que hace la terminal sigue sellado en
`terminal_id` en las tablas que lo llevan, así que no se pierde el origen, solo el nombre de la persona. Cuando Lima se integre con Dynamic hay que decidir si
esas filas se dejan así (lo normal: son historia) o se corrigen.

### 3. No da poderes

Los permisos son de la CUENTA (`fn_es_lider()` mira `auth.uid()`, ADR-0162), no de quien firma. La terminal sigue sin ser líder aunque firme a nombre de uno
(la prueba `pnpm pruebas:terminal-sin-responsable` lo vigila). Solo cuenta con `p_de_tienda = true`: la rama de «compárame contigo mismo» de los permisos
(`fn_alcanzo_a`, «no te quites a ti mismo») sigue pidiendo responsable.

### 4. Falla cerrado

`fn_terminal_firma_respaldo_id` solo devuelve a la persona si sigue **activa y con fila en `colaboradores`**. Si Felipe se suspendiera o saliera de retail, la
terminal vuelve a pedir responsable (el candado se reactiva, nunca se firma a nombre de quien ya no está). En la web, si la función no existe todavía (web
publicada antes de pegar la migración) o la base no responde, la terminal sigue pidiendo el combo: nunca se supone un respaldo que la base no confirmó.

### 5. En la web: un solo punto, `useResponsable`

- `persona-actual.ts` pregunta `fn_terminal_firma_respaldo()` **solo si la sesión es una terminal** (una persona no suma una espera) y lo pone en
  `PersonaActualV2.firmaRespaldo` → `SedeActivaProveedor` → `useResponsable`.
- Estado nuevo `respaldo` en `EstadoCombo`: `listo` es verdadero, no lee quién está de turno y no manda encabezados (`firma()` es `null`), salvo la hora de
  una venta sin conexión (`x-momento`), que sí tiene que viajar.
- `<ComboResponsable>` no pide nada: dibuja **una línea informativa** («Esta terminal no pide responsable · Lo que guardes queda a nombre de Felipe A.»; chip
  en el Punto de venta), igual que con el Admin. Se hizo así y no con `return null` porque ~40 pantallas ponen su propio título junto al combo («Quién
  recibe», «Quién la anula»…) y quedaría un título vacío.
- **«¿Quién está atendiendo?» (Punto de venta, Cambios, Devoluciones) queda SIN rellenar con el respaldo.** Ahí el responsable es también la asesora de la
  venta (`p_asesora_id`): rellenarla con Felipe le regalaría todas las ventas de Lima a una persona en las metas y las comisiones. La venta se guarda sin
  asesora, como una venta sin conexión sin nadie elegido; `ventas.usuario_id` sí queda en Felipe (quien firma).

### 6. Dos migraciones, la segunda es el interruptor

- `20261019185000_terminal_firma_de_respaldo.sql` — la columna y la lógica. **No cambia nada por sí sola.** Una parte (un `alter table` con `lock_timeout`
  y funciones; sin políticas, ADR-0195).
- `20261019190000_terminales_de_lima_sin_responsable.sql` — el `update` que pone a Felipe en las terminales activas de «Tienda LIM». En una base sin esa
  persona (local, CI) no hace nada y avisa. Se pega cuando Felipe diga.

## Lo que se rompe / lo que Felipe tiene que saber

1. **Regularizar una prenda en Lima.** La base impide que quien vendió regularice su propia venta (`motivoPropiaVenta`). Con la terminal de Lima firmando todo
   como Felipe, una venta hecha desde Caja Lima sin asesora tiene `vendido_por = Felipe`, y regularizarla desde Almacén Lima también firma Felipe: **se
   bloquea por «es tu propia venta»**. No se cambió esa regla (es de Felipe: dinero y control). Hasta que Lima vuelva a firmar con personas, esas
   regularizaciones se hacen con la cuenta de una persona (no la terminal).
2. **Las ventas de Lima quedan sin asesora** (ver el punto 5): Rendimiento por persona no las cuenta mientras dure.
3. **Quien tenga abierta la pantalla antes del `update`** sigue viendo el combo hasta recargar; si la base la rechaza, el mensaje la manda a elegir
   responsable. Basta recargar.
4. **Cuando Lima se integre con Dynamic:** correr el `update` de arriba. Las pantallas vuelven a pedir el combo en la siguiente carga.

## Cómo se verifica

- Base: `pnpm pruebas:terminal-sin-responsable` (22 casos, ROLLBACK siempre): firma el respaldo sin asistencia y aunque llegue `x-responsable`; sin respaldo, el
  candado de siempre; respaldo suspendido o sin acceso → pide responsable; no da poderes; `fn_terminal_firma_respaldo` solo habla a la terminal que la tiene;
  «volver»; la activación solo toca «Tienda LIM» y no hace nada en una base sin Felipe; re-ejecutables. Corre en el CI (`scripts/ci/pruebas-postgres.mjs`).
- Web: `lib/responsable-reglas.test.ts` (estado `respaldo`, el Admin gana, sin respaldo sigue bloqueando).
- A mano, con la terminal de Lima real, tras pegar las dos migraciones: abrir Caja y Almacén de Lima, hacer un ajuste, una bajada al piso y un cierre de caja.

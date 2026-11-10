# ADR-0642 — La hora de cierre de una tienda sale de su horario por días

- **Fecha:** 2026-11-10 · **Estado:** construido; **la migración está en producción desde el 2026-11-10** (la pegó Felipe antes de fusionar; ver «Cómo se pega» y «Lo que pasó al pegar»).
- **Rama:** `claude/closing-time-edit-9f3ccf`. Números reservados con `pnpm reservar`.
- **Relacionados:** ADR-0518 (Tienda web ▸ Conf. Tienda: horario por días y cierres por fecha), ADR-0305 y ADR-0359 (recordatorio de cierre de caja),
  ADR-0195 (Caja, proyección «al ritmo de hoy cierras en…»), ADR-0596/0328 (las vitrinas de Empresa y tiendas).

## El problema

El 2026-11-10 Felipe escribió: «no puedo editar la hora de cierre, ¿esto debería tener un horario donde lo configuro?». La consulta de solo lectura a
producción mostró el mismo dato dicho **dos veces**:

| Dónde | Qué tenía |
|---|---|
| `ubicaciones.hora_cierre` (una sola hora, la que lee Caja) | **vacía en las 4 sedes** |
| `ubicacion_horario_web` + `ubicacion_cierres_web` (Tienda web ▸ Conf. Tienda) | cargado: AQP todos los días 2:15–10:15 p. m.; LIM lunes a sábado 11:00–7:30 p. m.; TRU lunes a sábado hasta 8:15 p. m. y domingo hasta 6:15 p. m. |

Resultado: la tarjeta «Hora de cierre» de Configuración ▸ Empresa y tiendas decía «Falta» con un horario real cargado en otra pantalla, y **Caja no avisaba
«cierra la caja» ni proyectaba la venta del día** (lee solo `hora_cierre`). Además, el campo `type="time"` del navegador descartaba en silencio un «9:00» sin
«PM» (valor vacío = «no cambió nada»).

## Decisión (Felipe, 2026-11-10: «una sola fuente»)

El horario de Tienda web ▸ Conf. Tienda es la **única** fuente de a qué hora cierra una sede. Una regla en la base, `retail.fn_hora_cierre_de(ubicacion, fecha)`:

1. la fecha está en `ubicacion_cierres_web` (feriado, inventario) → no abre: `null`;
2. la sede tiene horario por días → el cierre de ese día de la semana; sin fila ese día = cerrada = `null`;
3. la sede no tiene horario por días (Taller, o una tienda sin cargar) → `ubicaciones.hora_cierre`, el respaldo de antes.

`fn_horas_de_cierre(fecha)` es la misma regla para todas las sedes activas, con `tiene_horario` (¿hay algún horario cargado?).

En la web:
- `getUbicaciones()` (`lib/ubicaciones.ts`) trae el cierre **de hoy** (hora de Lima) con esa función, en paralelo; si la función no existe todavía o no responde, cae a
  `hora_cierre`. Por eso Caja y el recordatorio no cambian de código en sus pantallas.
- `leerRecordatorioCierre` usa el cierre del **día en que se abrió la caja** (una caja de ayer que sigue abierta a las 00:15 se recuerda con el cierre de ayer, que puede
  ser otro que el de hoy).
- La tarjeta «Hora de cierre» (Empresa y tiendas) **ya no se escribe**: muestra el cierre de hoy («Hoy cerrada» si hoy no abre; «Falta» solo si no hay horario) y, a quien ve el
  módulo «Datos y plazos de la tienda web», lo lleva a `/tienda-web/ajustes`. Quien no lo ve la lee sin botón.

## Lo que encontró la revisión previa al PR (ocho hallazgos reales, todos corregidos)

Antes de abrir el PR, tres revisores independientes (SQL, lógica de Caja, reglas del repo) y dos escépticos por hallazgo revisaron el diff. Sobrevivieron:

- **Un fallo de lectura no es «sin horario».** Si `fn_horas_de_cierre` fallaba por cualquier causa, `getUbicaciones()` caía en silencio a `hora_cierre` (vacía) y el recordatorio
  despedía con «caja cerrada ✓» una caja que seguía abierta. Ahora solo la función inexistente (`esFuncionAusente`: `PGRST202` / `42883`, el caso de publicar antes de pegar)
  cae al respaldo sin avisar; cualquier otro error se registra y marca `Ubicacion.horaCierreIncierta`, y `leerRecordatorioCierre` lanza (el sondeo conserva lo último que sabía).
- **Con hoy cerrado, tampoco se traga la falla de la caja:** si la sede tiene horario cargado, que `getCajaAbierta` falle se dice (puede seguir abierta la caja de ayer).
- **Caja y Marcador no discrepan:** `horaCierreDeLaCaja` (una sola regla, el cierre del día de apertura) la usan el Marcador y el botón «Cerrar caja» de Caja.
- **Acceso:** las funciones son `security definer` y dejaban a cualquier cuenta con sesión leer las sedes; ahora piden `auth.uid() is null or fn_tiene_acceso_retail()`, como `fn_nombres_personas`
  («tener sesión no es ser del equipo», 20261015221000/20261015222000).
- **Tarjeta:** el dial ya no se pinta ámbar («falta») en una tienda con horario y hoy cerrada; el texto de la guía no promete un toque a quien no ve «Datos y plazos de la tienda web»;
  `ARQUITECTURA.md` recoge las dos funciones; se quitó un import huérfano.
- Descartado por los dos escépticos: que el botón de la tarjeta navegue con `router.push` en vez de un `<Link>` (ningún paso de la guía lo toca).
- Pruebas nuevas: `lib/recordatorio-cierre.test.ts` (con mocks; probada rompiendo a propósito la guarda: falla) y `esFuncionAusente`.

## DECIDÍ / DESCARTÉ / SE ROMPE SI

- **Decidí** una función de lectura y no una tabla nueva: el horario con apertura, cierre y días cerrados ya existía; lo que faltaba era que Caja lo leyera (principio 4: una sola fuente de verdad).
- **Descarté** un campo de texto «9 pm» para `hora_cierre` (la primera idea de este día): arreglaba el silencio del `type="time"` pero dejaba dos lugares para un mismo dato.
- **Descarté** parchear `fn_configuracion_tiendas` otra vez: el cierre de hoy se superpone desde `getUbicaciones()`, sin tocar una función que ya tiene parches anclados.
- **Se rompe si** alguien deja un día sin fila esperando que Caja avise igual: sin fila el día está cerrado y una caja abierta ese día no recibe el aviso. Y si el horario cruza la medianoche
  (la tabla lo impide: `cierra <= 1440` en el mismo día; un 24:00 sale como 23:59).

## Cómo se pega en producción

`supabase/migrations/20261110213000_hora_de_cierre_sale_del_horario_de_la_tienda.sql`: UNA ejecución en el SQL Editor (dos `create or replace function`; no toca tablas ni políticas), con `lock_timeout`
de 3 s. **La web puede publicarse antes o después**: sin la función cae a `hora_cierre` (y la tarjeta dice «Falta», como hoy). Hay que pegar la migración para que Caja empiece a avisar.

## Lo que se verificó y lo que no

- Verificado en producción con un `select` de solo lectura (la misma regla, sin crear nada): las 3 tiendas × 7 días dan el cierre correcto (LIM domingo `null`, TRU domingo 18:15, AQP 22:15 todos los días).
- Verificado: pruebas de `armarVitrinas`/`falta`/`valorDe`, de `horasDeCierreDeHoy`, tipos, knip y la suite completa de la web.
- Verificado en producción (solo lectura): la política de `ubicaciones` exige `fn_tiene_acceso_retail()` y esa función cubre colaboradores activos y terminales.
- **No verificado:** la función dentro de un Postgres local (no había Docker) y la pantalla en el navegador. Falta una prueba de base propia (`scripts/pruebas/`) que cubra cierre por fecha y sede sin horario.

## Lo que pasó al pegar

Felipe la pegó el 2026-11-10 en UNA ejecución, sin errores. `fn_horas_de_cierre(hoy de Lima)` dio AQP 22:15, LIM 19:30 y TRU 20:15 (las tres con `tiene_horario`) y el Taller sin hora ni
horario. Comprobado después con un `select` de solo lectura: las dos funciones son `security definer`, `authenticated` las ejecuta, `anon` no, y piden `fn_tiene_acceso_retail()`.

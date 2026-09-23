# Felipe — Gorrión (Plataforma y esquema) + el contrato con Dynamic

> Extraído del plano maestro (143 decisiones, `docs/plano/00-ACTA-24-DECISIONES.md` y
> `02` a `05-ACTA-SESION-*.md`). Cada línea es una decisión ya tomada por Felipe — no es
> una propuesta, es lo que hay que construir o ya está construido.

## Decisiones

**PL-54** — El punto único hacia Dynamic es una capa fija (`lib/dynamic-contrato.ts` + prefijo de función SQL) — nadie más llama a Dynamic por su cuenta.
  *Pendiente:* Construir `lib/dynamic-contrato.ts` — hoy no existe.

**PL-55** — La vigilancia del punto único es un chequeo automático en CI que falla si una migración nueva toca `public.*` fuera de la lista permitida.
  *Pendiente:* Construir ese chequeo de CI.

**PL-56/57** — De las 3 'tablas huérfanas' de `supabase/unificacion/`, 2 ya tienen hogar en V2 (`configuracion_empresa`, `sede_datos_fiscales`→`ubicacion_datos_fiscales`); solo faltaba el tipo `corporativo`, que cierra PL-71.
  *Pendiente:* Archivar `supabase/unificacion/` a `docs/historico/` en cuanto se pegue la migración de `corporativo` (PL-71) en producción.

**PL-58** — Las funciones vivas en producción sin gemelo en el repo (`gastos`, `registrar_gasto`, permisos revocados) se reconstruyen contra producción con `pg_get_functiondef`.
  *Pendiente:* Hacer la auditoría función por función contra producción.

**PL-59** — Patrón único para leer Dynamic: vista `security_invoker` para agregados (montos, sumas); función `security definer` cuando hay que filtrar por persona o fila.

**PL-60** — `14-DYNAMIC.md` se corrige solo en la sección de 'planilla por sede' (dice que no existe y ya está en producción) — no se archiva el documento completo.
  *Pendiente:* Corregir esa sección.

**PL-61** — ADR-0119 (candado de ventas/devoluciones, el hueco de seguridad más grave de toda la auditoría) se trae a `main` y se aplica esta semana, antes de que TRU opere con datos reales.
  *Pendiente:* Rescatar, re-ensayar y pegar ADR-0119 esta semana — es el pendiente de mayor riesgo de todo el plano.

**PL-62** — Para que un ADR estructural no quede colgado en una rama: barrido quincenal, ADRs sin fusionar listados en BACKLOG con dueño.
  *Pendiente:* Poner en marcha el barrido quincenal (proceso recurrente, no bloquea nada hoy).

**PL-66** — El dueño del contrato con Dynamic (documento de una página: funciones, vistas puente, FKs cruzadas) es Gorrión — es decir, vos, desde PL-09.
  *Pendiente:* Escribir ese documento de una página.

**PL-67** — Contra un cambio silencioso en Dynamic se construye una prueba automática que compara la forma real de Dynamic con lo que retail espera.
  *Pendiente:* Construir esa prueba.

**PL-68** — Las ~53 FKs cruzadas ya existentes hacia Dynamic quedan fuera del guardarraíl de PL-54 — se documentan aparte como el costo ya pagado de vivir juntos; el guardarraíl solo frena conexiones nuevas, no toca lo ya construido.
  *Pendiente:* Documentarlas aparte.

**PL-69** — El punto único de PL-54 siempre asume que hay un Dynamic del otro lado — no se diseña un modo 'sin Dynamic' para una futura marca sin RR.HH. propio.

**PL-71** — Se agrega `'corporativo'` al CHECK de `ubicaciones.tipo` y se crea la fila CCO (sede corporativa) — mismo patrón que ya cerró el Taller.
  *Pendiente:* Migración del tipo `corporativo` — además desbloquea el archivado de `unificacion/` (PL-56/57).


## Tus pendientes, en orden

1. Rescatar, re-ensayar y pegar ADR-0119 esta semana, antes de que TRU opere con datos reales (PL-61) — el hoyo de seguridad más grave de todo el plano, va primero sin discusión.
2. Auditar función por función lo que está vivo en producción sin gemelo en el repo, con pg_get_functiondef (PL-58) — mientras no lo hagas, no sabés qué de producción no está versionado.
3. Construir lib/dynamic-contrato.ts, el punto único hacia Dynamic (PL-54).
4. Construir el chequeo de CI que falla si una migración toca public.* fuera de la lista permitida (PL-55) — sin esto, PL-54 es una regla de palabra, no un candado.
5. Pegar la migración del tipo 'corporativo' y crear la fila CCO (PL-71) — desbloquea el archivado de unificacion/.
6. Archivar supabase/unificacion/ a docs/historico/ en cuanto la migración de PL-71 esté en producción (PL-56/57).
7. Escribir el documento de una página del contrato con Dynamic: funciones, vistas puente, FKs cruzadas (PL-66) — es tu pájaro, nadie más lo va a escribir.
8. Construir la prueba automática que detecta un cambio silencioso en la forma de Dynamic (PL-67).
9. Corregir la sección de 'planilla por sede' en 14-DYNAMIC.md, que hoy dice que no existe y ya está en producción (PL-60).
10. Documentar aparte las ~53 FKs cruzadas hacia Dynamic como el costo ya pagado de vivir juntos (PL-68).
11. Poner en marcha el barrido quincenal de ADRs estructurales sin fusionar, listados en BACKLOG con dueño (PL-62).

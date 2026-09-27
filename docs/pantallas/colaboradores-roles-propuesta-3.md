> **Estado: PROPUESTA, no decidida ni construida.** Redactada el 2026-09-26 por un agente de solo lectura a partir de la tarea #3 de `docs/pantallas/colaboradores-roles.md`. Nada de lo que sigue está aplicado en producción ni en el repo. Una parte depende de la decisión de la #1 (qué tiene Integrante) y de que Felipe elija entre las opciones A, B y C.

# Propuesta #3: persona nueva, rol elegido al aprobar el alta

Solo lectura. Se consultó producción con SELECT y se leyeron archivos del worktree. No se editó nada ni se pegó SQL en producción.

## 1. Qué encontré (verificado en producción el 26-sep)

- `retail.agregar_colaborador` inserta la alta con `rol = 'integrante'` y `estado = 'pendiente_aprobacion'`.
- El disparador `colaboradores_rol_coherente` deja `rol_id` = rol de sistema Integrante, porque la columna es `NOT NULL` (`20260923030000_roles_por_modulo.sql:298-299`, `:338`). Ese archivo promete «nunca queda vacío» (`:55`).
- `fn_aprobar_alta_colaborador(p_persona_id)` solo cambia el estado a `activo` y escribe el historial. No mira el rol. Tampoco aplica «solo das lo que tienes» (ADR-0178), aunque el resto de las funciones de colaboradores sí lo aplican.
- Hoy hay 0 altas pendientes, 25 cuentas activas (17 con Integrante, 8 líderes) y 6 aprobaciones históricas. Integrante lleva 24 versiones en 5 días de piloto. Cambió de 2 a 21 módulos en un solo guardado, y ese cambio alcanza a cualquier alta que se apruebe después.
- ADR-0150 decisión 8 prometió que `agregar_colaboradores` tendría «un selector de rol (por defecto Integrante)». Nunca se construyó: la función viva no recibe rol. Esta tarea completa esa promesa, pero cambia el «por defecto».
- Hoy nadie que no sea líder tiene el módulo Colaboradores ni el de Roles y accesos. Ningún rol a medida tiene módulos de gestión.

## 2. Las tres opciones

**A. El rol se elige al aprobar, sin valor de partida, y la base impide activar sin rol (recomendada)**
- **Ganas:**
  - Funciona sea cual sea la decisión de la tarea #1, porque quien aprueba elige.
  - Convierte el defecto silencioso en una elección firmada y registrada en `roles_historial`.
  - Cierra el hueco de «solo das lo que tienes» al aprobar.
  - El volumen es mínimo: unas 10 a 50 altas al año.
- **Pagas:**
  - Una migración en dos partes.
  - Un modal nuevo.
  - Se cambia la promesa «rol_id nunca vacío», que pasa a valer solo para cuentas activas.
  - Requiere que existan roles que valga la pena elegir, y eso lo aporta la #1.

**B. Integrante pasa a ser el mínimo y se crea un rol «Mostrador» aparte, que se asigna después**
- **Ganas:**
  - Cero código.
  - Se puede hacer hoy desde Roles y accesos.
  - Si alguien se olvida, el error se nota: la persona ve casi nada y avisa.
- **Pagas:**
  - Son dos pasos en dos pantallas, y a veces de dos personas. Quien tenga Colaboradores pero no Roles y accesos no puede dar el paso 2.
  - Depende de la #1. Sin un mínimo decidido no hay nada que heredar.
  - Sigue existiendo «activa con un rol que nadie eligió». Es inofensivo solo mientras alguien no vuelva a subir Integrante, y ya pasó una vez en un guardado.

**C. No cambiar nada y solo documentar**
- **Ganas:** cero riesgo y cero esfuerzo.
- **Pagas:**
  - Cada alta hereda lo que tenga Integrante ese día, sin que nadie lo firme.
  - Queda la promesa rota del ADR-0150.
  - Sigue el hueco de «solo das lo que tienes» al aprobar.

**Recomiendo A.**
- Es la única de las tres que no depende de qué decidas en #1.
- Deja escrito quién eligió el rol de cada persona.
- Lo que cuesta, dos archivos SQL y un modal, es pequeño frente a 24 ediciones de Integrante en 5 días.
- Orden sugerido: primero #1, que es un clic y define qué roles vale la pena ofrecer. A no queda bloqueada por #1.

## 3. La opción A en detalle

**El concepto.** Hoy una persona nueva nace con «el rol por omisión»: el que tenga Integrante ese día. Es como entregarle a una vendedora nueva las llaves que dejó la última en entrar, sin que la encargada decida cuáles. La propuesta es que la alta pendiente no tenga rol y que se elija en el mismo acto de aprobar. Mal hecho se vería así: un desplegable que ya viene con «Integrante» marcado, que recrea el defecto con mejor cara. Por eso no lleva valor de partida.

**Contrato de `fn_aprobar_alta_colaborador(p_persona_id, p_rol_id)`**
1. **Promete:** una alta pendiente pasa a cuenta activa con exactamente el rol pedido, con quien lo eligió en el historial, todo o nada.
2. **Asume:**
   - Quien llama tiene el módulo Colaboradores o es líder.
   - La alta sigue pendiente.
   - El rol está vigente, no es Líder y no incluye módulos que quien aprueba no ve.
3. **No promete:** ni sede (ya viene del alta), ni el tope de descuento (queda en su 10 %; es la tarea #2), ni que el rol sea el adecuado, que lo decide quien aprueba.

**Contrato de `fn_roles_para_alta()`**
- Devuelve solo los roles que la función anterior aceptaría hoy para quien pregunta, con sus módulos, usando el mismo criterio.
- Si quien pregunta no puede gestionar colaboradores, devuelve 0 filas.
- Hace falta porque `retail.roles` solo la lee quien administra roles. Un aprobador con Colaboradores y sin Roles y accesos vería el desplegable vacío.

### Cambios (archivo:línea)

**Migración parte 1, esquema** (nuevo archivo; `set lock_timeout = '3s'`, idempotente, sin políticas)
- Función nueva `retail.fn_colaboradores_rol_coherente()`, solo para `colaboradores`:
  - Si el estado es pendiente, `rol_id` queda nulo.
  - Si el rol es líder, `rol_id` es el de Líder.
  - Si `rol_id` es el de Líder pero el texto no lo es, pasa a Integrante, como hoy.
  - Solo en INSERT y sin rol, cae en Integrante. Es una compatibilidad para las siembras y pruebas que insertan sin rol (unas 20 en `scripts/`). Ninguna pantalla ni función de usuario lo usa.
  - En UPDATE nunca rellena un rol.
- `colaboradores.rol_id` pasa a admitir nulos.
- `create or replace trigger colaboradores_rol_coherente` se reapunta a la función nueva (sin `drop trigger`).
- Se agrega el candado `CHECK ((estado = 'pendiente_aprobacion') = (rol_id is null))`.
- **Importante:** el disparador viejo `fn_colaborador_rol_coherente` también lo usa `colaboradores_suspendidos` (que no tiene columna `estado`). Editarlo en el lugar rompería suspender y reactivar. Por eso se crea una función aparte y el viejo se queda para esa tabla.
- Hoy no hay filas pendientes que corregir. Si aparece una entre medias, la parte hace primero `update … set rol_id = null` sobre las pendientes.

**Migración parte 2, funciones** (misma disciplina)
- `fn_aprobar_alta_colaborador(uuid, uuid)` nueva y `drop function` de la de 1 argumento, para no dejar dos versiones (ADR-0150 avisa que un cambio de parámetros crea una sobrecarga). Lleva `revoke … from public, anon` y `grant … to authenticated`. Pasos:
  1. Guarda `fn_puede_gestionar_colaboradores()`, tal como está en producción.
  2. `p_rol_id` es obligatorio.
  3. Bloquea la fila de la persona con `for update` (existe hoy).
  4. Lee el rol con `for share`. Si no existe, está archivado o es el Líder, lo rechaza con un mensaje claro.
  5. Llama a `fn_exigir_rol_dentro_de_lo_mio(p_rol_id)`. No llama a `fn_exigir_alcanzo_a`, porque una alta pendiente aún no tiene poder que comparar.
  6. Hace un solo `update` de `estado` y `rol_id`.
  7. Registra `fn_historial_colaborador('aprobacion')` y una fila `asignacion` en `roles_historial` con el `persona_id`, sin nombre, que es lo que pide la tarea #12.
- `fn_roles_para_alta()` nueva.
- `fn_cuentas_con_rol`: se reescribe desde su definición viva con un `replace` de conteo exacto (aborta si no es 1). Agrega `where c.estado = 'activo'` a la rama de personas, para que una alta sin rol no se ofrezca en «Asignar rol».
- `archivar_rol`: se corrige el texto «es el que recibe una persona nueva», que dejaría de ser cierto.
- Al pegar, `asignar_rol` sobre una pendiente falla con «no tiene acceso a retail» (cierra hacia adentro). La pantalla ya no la ofrece.

**Web**
- `apps/web/lib/colaboradores-acciones.ts:19` y `:35-38`: `aprobar(personaId, rolId, firma)`.
- `apps/web/components/ColaboradoresModales.tsx` (después de `:367`): nuevo `AprobarAltaModal`, con el patrón de `QuitarAccesoModal`:
  - Desplegable `CampoSelect` con marcador «Elige un rol».
  - Debajo, «Verá N módulos» agrupados.
  - El botón «Aprobar con este rol» se apaga hasta elegir.
  - El combo «Responsable» va adentro.
- `apps/web/components/ColaboradoresPanel.tsx`:
  - `:84-85`, se agrega un tipo `aprobar` al modal.
  - `:406-414`, «Aprobar» abre el modal en vez de guardar de un clic.
  - `:407`, se retira el combo suelto de arriba, que ya no sirve.
  - `:545`, se agrega el render del modal.
- `apps/web/components/ColaboradoresTablas.tsx:282-284`: el botón queda como «Aprobar…».
- `apps/web/lib/colaboradores.ts:123-127`: nuevo `getRolesParaAlta()`, cargado desde `app/(app)/colaboradores/page.tsx:33-49` solo si la persona ve Colaboradores.
- `apps/web/lib/colaboradores-reglas.ts:120-128`: el aviso «Por atender» pasa a decir «elige su rol». Se agrega una regla pura con su prueba en `colaboradores-reglas.test.ts`.
- `packages/database/src/types.ts:5242-5245`: los argumentos de la función y la función nueva.

**Pruebas y documentos**
- `scripts/pruebas/colaboradores_alta_requiere_aprobacion.mjs:123-169`: las llamadas pasan el rol. Escenarios nuevos:
  - Sin rol, rol archivado, rol Líder.
  - Aprobador sin módulos suficientes.
  - `update … set estado = 'activo'` sin rol falla con 23514.
  - Una alta pendiente no aparece en Roles y accesos.
  - Una aprobación a la vez que un `archivar_rol`, con COMMIT.
- `scripts/pruebas/roles_por_modulo.mjs:562`: pasa el rol.
- Documentos:
  - Un ADR nuevo (verificar el número libre con `numeros.mjs`; hoy el último es el 0218).
  - Notas en ADR-0150 dec. 8 y ADR-0161 B2c.
  - `ARQUITECTURA.md:143` y `:164`.
  - BACKLOG y BITACORA.
  - `pnpm datos:generar:produccion` tras aplicar.
- Orden: primero el SQL (con 0 pendientes nadie se bloquea) y después la web.

## 4. Decisión

**DECIDÍ:** la alta pendiente no tiene rol, y el rol se elige sin valor de partida en el mismo acto de aprobar. La base lo impide con el candado `CHECK ((estado = 'pendiente_aprobacion') = (rol_id is null))`. Las cuentas activas siempre tienen rol.

**DESCARTÉ:**
- Elegir el rol al proponer el alta, como prometía el ADR-0150. El alta es masiva (hasta 50 personas por sede) y quien propone no es quien responde por el acceso (D-70).
- Solo la función, sin candado. Cualquier `update … set estado = 'activo'` futuro volvería a crear activas con Integrante, sin ruido.
- Una columna `rol_elegido_at`. Sería un segundo dato para el mismo hecho, y el relleno de las 25 cuentas inventaría fechas.

**SE ROMPE SI:**
1. En la campaña de Navidad la encargada de TRU aprueba 12 temporales seguidos y desde la quinta elige la primera opción sin leerla. El defecto vuelve, ahora con firma. Lo delatan el «Verá N módulos» y el historial de quién eligió. Si pasa, el siguiente paso es «aprobar varias con el mismo rol», que sigue siendo una elección explícita.
2. La lista solo ofrece Integrante con Por pagar porque la #1 no se decidió. A mueve la decisión al aprobar, pero no reemplaza la #1.

## 5. Estados imposibles

**Los impide el esquema (CHECK):**
- Persona activa sin rol.
- Alta pendiente con rol.

**Los impide la función (dependen de quién llama):**
- Aprobar con un rol que quien aprueba no ve.
- Aprobar con un rol archivado o con el Líder.
- Aprobar dos veces la misma alta.

**Lo cubre el candado que ya existe:** `archivar_rol` no deja archivar un rol que tenga cuentas.

## 6. Comprobaciones antes de decir «listo»

Esto está diseñado, no probado.
1. **Concurrencia.**
   - Dos aprobaciones de la misma alta: la segunda espera y falla con «ya estaba aprobada». Gana la primera elección.
   - Aprobar mientras otro archiva el rol: el `for share` de la aprobación choca con el `for update` de `archivar_rol`, y el que llega segundo ve el estado final.
   - Sin deadlock: la aprobación toma primero la fila de `colaboradores` y luego `roles`, y `archivar_rol` solo toma `roles`.
2. **Caída externa.**
   - La aprobación solo lee `public.personas` (Dynamic, misma base). Si esa fila falta, quien aprueba no pasa la guarda y nada se pierde.
   - Al no aceptar el rol Líder, no depende de `fn_es_admin()`.
3. **Persona sin contexto.** Falta probarlo con una encargada real.

## 7. Cómo lo verificas tú en el navegador

1. Colaboradores ▸ Agregar colaboradores: agrega una persona de prueba a una sede. Debe decir «queda pendiente de aprobación».
2. Pestaña «Por aprobar»: clic en «Aprobar». Ya no aprueba. Abre la ventana con el desplegable vacío «Elige un rol» y el botón apagado.
3. Elige un rol. Aparece «Verá N módulos». Aprueba.
4. Roles y accesos: la persona figura en ese rol. Actividad muestra «Aprobación».
5. Consulta de solo lectura: `select estado, rol_id is null, count(*) from retail.colaboradores group by 1,2` debe devolver solo (activo, falso) y (pendiente, verdadero).
6. Prueba negativa: con dos pestañas, abre la ventana en una y archiva el rol elegido en la otra. Al aprobar debe decir que el rol está archivado.

## Objeción

El título plantea «elegir al aprobar o un rol mínimo» como si fueran equivalentes. No lo son. B y C dependen de que nadie vuelva a editar Integrante, y ya se editó 24 veces. A no depende de eso.

## Lo que no pidió

Hoy la aprobación ignora «solo das lo que tienes». Quien tenga Colaboradores sin ver Por pagar puede proponer una alta, o aprobarla, y esa cuenta nace con los 21 módulos de Integrante, incluido Por pagar. Está latente porque hoy solo los líderes tienen Colaboradores. Se abre el día que Desarrollo Organizacional reciba ese módulo. A lo cierra con `fn_exigir_rol_dentro_de_lo_mio`.

## Si no respondes, ejecuto

Preparo A en una rama: las dos partes de SQL probadas contra un Postgres desechable, y el modal probado en el navegador local. No pego nada en producción.

Nada se ejecuta sin la orden de Felipe, y cualquier pegado en producción espera su OK explícito.

Rutas de referencia (todas bajo `/Volumes/CAYLA-SSD/Developer/cayla-retail/.claude/worktrees/permisos-niveles-roles-d7bab1/`):
- `docs/pantallas/colaboradores-roles.md`
- `supabase/migrations/20260923030000_roles_por_modulo.sql`
- `apps/web/lib/colaboradores-acciones.ts`
- `apps/web/components/ColaboradoresPanel.tsx`
- `apps/web/components/ColaboradoresModales.tsx`
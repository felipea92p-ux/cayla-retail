# Acta de la Sesión 2 — Arquitectura + Modelo de datos (PL-54 a PL-82)

> **Fecha:** 2026-09-22 · **Quién decide:** Felipe Alvarez · **De dónde salen:** las 29 preguntas de la
> Sesión 2 del banco (`01-BANCO-PREGUNTAS.md`), frentes «Arquitectura y el contrato con Dynamic» (16) y
> «Modelo de datos e invariantes V2» (13). Continúa la numeración de `02-ACTA-SESION-1.md` (que terminó en PL-53).
>
> Cuatro preguntas se resolvieron con verificación en profundidad, no solo con la opción marcada — dos contra
> producción en vivo (consultas de solo lectura): **PL-56/57** (premisa corregida: 2 de 3 «tablas huérfanas» ya
> tenían hogar en V2), **PL-63** (sin objeción — el diseño de Felipe ya era correcto, se había leído mal),
> **PL-75** (verificado que `fn_productos` sí expone costo a cualquier sesión) y **PL-82** (verificado y
> resuelto sin preguntar: el hueco de V1 ya está cerrado en V2, no hace falta construir nada).

---

## Bloque A — Arquitectura y el contrato con Dynamic (PL-54 a PL-69)

| # | Decisión |
|---|---|
| PL-54 | **Punto único hacia Dynamic:** una capa fija (`lib/dynamic-contrato.ts` + prefijo de función SQL) es la única puerta permitida para llamar a Dynamic. |
| PL-55 | **Vigilancia del punto único:** chequeo automático en CI que falla si una migración nueva toca `public.*` fuera de la lista permitida. |
| PL-56/57 | *(premisa corregida en vivo)* — de las «3 tablas huérfanas» de `supabase/unificacion/`, verificado que **2 de 3 ya tienen hogar en V2** (`configuracion_empresa` sin cambios, `sede_datos_fiscales` reconstruida como `ubicacion_datos_fiscales`). Solo el tipo `corporativo` quedaba sin equivalente — resuelto por PL-71. **`unificacion/` se archiva a `docs/historico/` (PL-14) en cuanto la migración de `corporativo` se pegue en producción**, sin necesitar ninguna tabla de rescate. |
| PL-58 | **Funciones vivas en producción sin gemelo en el repo** (`gastos`, `registrar_gasto`, permisos revocados): se reconstruyen contra producción con `pg_get_functiondef`, igual que ya se hizo una vez. |
| PL-59 | **Patrón único para leer Dynamic:** vista `security_invoker` para agregados (montos, sumas); función `security definer` cuando hay que filtrar por persona o fila. |
| PL-60 | **`14-DYNAMIC.md`** dice que «planilla por sede» no existe, y ya está en producción: se corrige esa sección ahora (no se archiva todo el documento). |
| PL-61 | **ADR-0119** (candado de ventas/devoluciones — el hueco de seguridad más grave de la auditoría): se trae a `main` y se aplica esta semana, antes de que TRU opere con datos reales. |
| PL-62 | **Proceso para que un ADR estructural no quede colgado en una rama:** barrido quincenal, ADRs sin fusionar listados en BACKLOG con dueño. |
| PL-63 | **Escritura directa a tablas de vocabulario** *(sin objeción, corregido en vivo)*: verificado que crear una categoría escribe directo protegido por RLS (`categorias_write_lider`) + CHECK constraints, y editar pasa por RPC solo porque necesita lógica cruzada — no es «la misma cosa resuelta dos veces», son dos problemas de distinta complejidad. El diseño de Felipe queda **sin cambios**; se sugiere (no se exige) documentar la regla para el próximo vocabulario nuevo. |
| PL-64 | **83 archivos que preguntan el rol a mano:** se migran todos a `permisosDe()` **antes** de construir los 4 niveles de D-12 — primero el terreno fácil, después el cambio. |
| PL-65 | **Restore real:** se prueba antes del primer mes de TRU en vivo (un solo proyecto Supabase sirve a retail y Dynamic — un restore afecta a los dos). |
| PL-66 | **Dueño del contrato con Dynamic** (documento de una página: funciones, vistas puente, FKs cruzadas): Gorrión — ya es de Felipe desde PL-09. |
| PL-67 | **Alarma de cambio silencioso en Dynamic:** se construye una prueba automática que compara la forma real de Dynamic con lo que retail espera. |
| PL-68 | **Las ~53 llaves foráneas ya existentes hacia Dynamic:** quedan fuera del guardarraíl de PL-54, documentadas aparte como el costo ya pagado de vivir juntos — el guardarraíl se enfoca en lo que puede seguir creciendo (conexiones nuevas), no en lo que ya está construido y no crece. |
| PL-69 | **El «punto único» de PL-54 siempre asume que hay un Dynamic del otro lado** — no se diseña un modo «sin Dynamic» para una futura marca sin sistema de RR.HH. propio. |

**Pendientes que nacen de este bloque:**
- PL-54/55: construir `lib/dynamic-contrato.ts` y el chequeo de CI.
- PL-58: auditoría función por función contra producción.
- PL-60: corregir la sección de `14-DYNAMIC.md` sobre planilla por sede.
- PL-61: traer y aplicar ADR-0119 esta semana — el pendiente de mayor riesgo de toda la sesión.
- PL-64: refactor de 83 archivos, antes de construir Admin/Solo lectura.
- PL-65: ensayar un restore real (proyecto desechable, sin tocar producción).
- PL-66/67: Gorrión escribe el contrato de una página y su prueba de cambio silencioso.

### Reflexión del bloque
- **Lo que ya hacemos bien:** el patrón que Felipe ya construyó para vocabulario (RLS + CHECK para lo simple, RPC para lo complejo, PL-63) es exactamente el tipo de criterio que este plano busca documentar — no hubo que corregirlo, hubo que reconocerlo.
- **Qué podría hacer mejor que yo un integrante:** quien construya `lib/dynamic-contrato.ts` (PL-54) va a encontrar casos reales de lectura a Dynamic que esta sesión no vio — la regla «vista para agregados, RPC para filas» (PL-59) es un punto de partida, no la última palabra.
- **La próxima objeción que quiero escuchar:** en PL-63 estuve a punto de pedir reescribir 7 rutas y 3 componentes que ya funcionaban bien, basado en una lectura superficial del código. La próxima vez que una pregunta generada diga «esto es un problema», debo verificar el código antes de presentarla como tal — no después de que Felipe la cuestione.

---

## Bloque B — Modelo de datos e invariantes V2 (PL-70 a PL-82)

| # | Decisión |
|---|---|
| PL-70 | **Documentos que describen V1** (`00-MAPA.md`, `01-INVARIANTES.md`, `09-CONTRATOS.md`): se archivan completos; se reescriben `01-INVARIANTES` y `09-CONTRATOS` sobre el esquema V2 actual. |
| PL-71 | **CCO (sede corporativa):** se agrega `'corporativo'` al CHECK de `ubicaciones.tipo` y se crea la fila CCO — mismo patrón que ya cerró el Taller. |
| PL-72 | **Estado de resultados por sede (D-30), mientras Contabilidad sigue pausada:** un resumen de lectura (ventas, costo, gastos por sede), sin libro contable formal — no audita como contabilidad real, pero da el número esta semana. |
| PL-73 | **Cierre de mes (D-23):** se construye ahora, ligero — una tabla `periodos_cerrados` que bloquea registrar gastos o ventas en un período ya cerrado. |
| PL-74 | **Método de costeo (D-45):** se confirma cerrada a favor de ADR-0067 (costo promedio ponderado) — ya corre en producción, el acta solo estaba desactualizada. |
| PL-75 | **Costo de prenda visible a cualquier colaborador** *(verificado en vivo)*: se cierra a solo líder ahora, igual que ya se cerró el dinero de Compras (ADR-0126). Confirmado que `fn_productos` hoy expone `costo` a cualquier sesión autenticada. |
| PL-76 | **Los 4 módulos sin ni una tabla** (Tucán, Golondrina, Águila, Gorrión): ninguno se construye ya, pero **se diseña el esquema de Águila ahora** (aunque no se construya todavía) — es el único de los 4 directamente ligado a la definición de éxito a 3 años de Felipe (PL-02: decidir qué comprar, qué liquidar, qué tendencia hay). Tucán y Golondrina siguen en pausa sin fecha. |
| PL-77 | **Candado contra sububicaciones duplicadas por tienda:** **no se construye** — Felipe confía en que solo el script de alta de sede las crea. Contra la recomendación original; riesgo bajo y anotado (mismo patrón que costó el candado de personas duplicadas, ADR-0002, si algún día alguien crea una sede por SQL Editor). |
| PL-78 | **Venta desde Cuarentena:** la venta rechaza cualquier stock que salga de la sububicación Cuarentena. |
| PL-79 | **Clienta duplicada entre tiendas:** índice único sobre el documento de identidad de la clienta. |
| PL-80 | **Respaldos (D-29):** hasta 1 día de pérdida aceptable (RPO), con un respaldo diario y una restauración de prueba real al menos una vez. |
| PL-81 | **Origen ambiguo de un movimiento de stock:** se exige exactamente una columna de origen llena por fila (venta/compra/producción/cambio, nunca dos a la vez). |
| PL-82 | **Caja editable después de cerrada** *(verificado y resuelto sin preguntar)*: el hueco de V1 ya está cerrado en V2. Confirmado contra producción: `retail.cajas` tiene RLS activo sin ninguna política de UPDATE (deny-all por defecto) y `cerrar_caja` rechaza explícitamente una caja que ya no está `'abierta'`. Nada que construir. |

**Pendientes que nacen de este bloque:**
- PL-70: reescribir `01-INVARIANTES.md` y `09-CONTRATOS.md` sobre V2 — trabajo de documentación real, sin dueño asignado todavía.
- PL-71: migración del tipo `corporativo` — desbloquea también el archivado de `unificacion/` (PL-56/57).
- PL-73: construir `periodos_cerrados` antes de que el primer mes de TRU necesite cerrarse.
- PL-75: tocar `fn_productos` y las pantallas de catálogo que hoy muestran costo.
- PL-76: diseñar (no construir) el esquema de Águila.
- PL-78, PL-79, PL-81: tres candados nuevos de base de datos, ninguno construido todavía.
- PL-80: fijar el respaldo diario y agendar la primera restauración de prueba.

### Reflexión del bloque
- **Lo que ya hacemos bien:** el núcleo (productos/variantes/stock/movimientos) resistió esta ronda casi entero — de 13 preguntas sobre el modelo de datos, la mayoría fueron candados que faltaban en los bordes (Cuarentena, clienta duplicada, origen de movimiento), no grietas en el centro.
- **Qué podría hacer mejor que yo un integrante:** el líder de equipo que ve una caja cerrarse cada noche sabe mejor que yo si 1 día de pérdida aceptable (PL-80) es demasiado o de sobra — es una pregunta de cuánto le costaría a CAYLA perder un día de ventas reales, y eso lo sabe quien mira la caja, no quien mira el esquema.
- **La próxima objeción que quiero escuchar:** en PL-77 Felipe decidió no construir un candado que yo recomendaba. Puede que tenga razón (bajo riesgo real hoy) o puede que esté subestimando qué tan fácil es que alguien use el editor SQL sin querer — no lo sabré hasta que pase una vez. La objeción que quiero escuchar es: «¿por qué confiaste en la costumbre en vez del candado, si el propio 01-INVARIANTES.md ya documentó que eso falló antes?».

---

## Balance acumulado

24 (acta) + 29 (Sesión 1) + 29 (Sesión 2) = **82 de 143 preguntas del plano maestro.**
Quedan 2 sesiones: Permisos + Pantallas (~30) y Integraciones + Equipo (~31).

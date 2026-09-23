# Acta de la Sesión 4 — Integraciones + Equipo (PL-113 a PL-143)

> **Fecha:** 2026-09-23 · **Quién decide:** Felipe Alvarez · **De dónde salen:** las 31 preguntas de la
> Sesión 4 del banco (`01-BANCO-PREGUNTAS.md`), frentes «Integraciones externas y riesgo» (15) y «Equipo,
> gobierno operativo y onboarding» (16). Continúa la numeración de `04-ACTA-SESION-3.md` (que terminó en
> PL-112). **Es la última sesión — cierra las 143 preguntas del plano maestro.**

---

## Bloque A — Integraciones externas y "todo falla, todo el tiempo" (PL-113 a PL-127)

| # | Decisión |
|---|---|
| PL-113 | **Reintento automático a SUNAT vía Lucode:** un trabajo programado (Vercel Cron) cada 5-10 minutos reintenta todo comprobante `pendiente`, apoyado en el token de idempotencia ya existente. Si sigue sin transmitirse pasadas varias horas, deja de reintentar solo y dispara el aviso al líder (PL-114). |
| PL-114 | **Canal de aviso al líder:** dentro del sistema (banner/campanita al entrar), mismo patrón que ya usan las campañas de descuento. |
| PL-115 | **Alta PSE ante SUNAT** *(corregido por Felipe)*: ya confirmado y funcionando — no hace falta bloquear boletas reales. Plan de respaldo real: si Lucode falla, Alegra sigue disponible como salida hasta que el sistema quede resuelto. |
| PL-116 | **2 boletas con número quemado ante SUNAT** (S/655.50 y S/185.30): son pruebas, quedan como están — Felipe las limpia cuando corresponda, no se transmiten ni se liberan por ahora. |
| PL-117 | **Nota de débito de Lucode:** se prueba contra el ambiente de pruebas esta semana, por las dudas, aunque CAYLA no la usa hoy. |
| PL-118 | **Timeout de 15s en plena venta:** mensaje claro — «Lucode no respondió, la venta ya se guardó, transmite luego desde Facturación». |
| PL-119 | **Resolución de autorización del PSE en el ticket:** se completa la variable antes del primer ticket real. |
| PL-120 | **Caída de Dynamic/Supabase completa:** se acepta el riesgo — venta en papel/manual hasta que vuelva; hace falta que cada líder de equipo sepa que ese plan B existe. |
| PL-121 | **Nombres en Caja/Compras cuando Dynamic no responde:** degrada a «integrante» genérico (vocabulario corregido) en vez de caer la pantalla completa. |
| PL-122 | **Sede vs. persona marcada inactiva en Dynamic** *(verificado en vivo, sin hueco de seguridad)*: son dos reglas distintas a propósito — una sede no se apaga sola por un dato mal marcado (ADR-0029), pero una persona cesada en Dynamic pierde acceso a retail al instante, porque ambas funciones leen la misma tabla en vivo. Confirmado con datos reales: 23 personas `inactivo` con `fecha_cese`, ninguna puede operar. |
| PL-123 | **Variable `PADRON_PROVEEDOR` en Vercel:** Felipe la confirma ahora directamente en el dashboard. |
| PL-124 | **Cuota agotada del proveedor de padrón:** se acepta la degradación manual (escribir el nombre a mano) — es el diseño a propósito de ADR-0008. |
| PL-125 | **Supabase Storage (fotos de producto, adjuntos de compra):** Felipe decide encenderlo ahora, contra la recomendación de esperar — asume el costo mensual desde ya. |
| PL-126 | **Caída de Alegra en pleno cobro:** esa venta cambia a que la emita retail sobre la marcha, sin esperar a que Alegra vuelva. |
| PL-127 | **Pago con tarjeta/POS y canal online:** los dos quedan investigándose bajo Dany (Colibrí) por ahora, sin construir nada — pago con tarjeta es una extensión natural de Ventas; canal online es más grande (necesita su propio catálogo público) y sumará a Tucán si avanza en serio. |

**Pendientes que nacen de este bloque:**
- PL-113/114: construir el Vercel Cron y el banner de aviso.
- PL-119, PL-123: dos verificaciones/completados rápidos que Felipe hace directamente (variable de entorno + resolución SUNAT).
- PL-120: escribir el plan B de papel en el manual de cada sede — hoy no está escrito en ningún lado.

### Reflexión del bloque
- **Lo que ya hacemos bien:** el patrón de "adaptador que nunca inventa un estado" (`lucode.ts`) ya seguía el principio 9 antes de que esta ronda lo preguntara — la mayoría de las respuestas de este bloque fueron confirmar un diseño ya sólido, no corregirlo.
- **Qué podría hacer mejor que yo un integrante:** el líder de equipo que de verdad viva una caída de Supabase en plena hora punta (PL-120) va a saber mejor que cualquier documento si «vender en papel» es realmente viable con el flujo real de su tienda, o si hace falta algo más simple todavía.
- **La próxima objeción que quiero escuchar:** en PL-122 casi cometo el mismo error dos veces en una sesión (después de PL-63) — presentar una lectura superficial como un hallazgo real. La verifiqué a tiempo esta vez porque Felipe se alarmó primero. La objeción que quiero: que alguien me pregunte «¿lo verificaste?» antes de que yo tenga que demostrarlo, no después.

---

## Bloque B — Equipo, gobierno operativo y onboarding (PL-128 a PL-143)

| # | Decisión |
|---|---|
| PL-128 | **Documento de onboarding (V1 desactualizado):** se reescribe a la versión actual ahora, antes de que llegue alguien nuevo. |
| PL-129 | **Docker vs. Postgres desechable** *(invertido con el aporte de Felipe)*: Postgres desechable pasa a ser el camino **principal** del onboarding (Felipe mismo apaga Docker seguido por RAM); Docker queda como alternativa para quien lo prefiera. |
| PL-130 | **Mentor del séptimo integrante** *(corregido con el equipo real)*: Felipe o Dany — son quienes tienen más contexto acumulado, aunque el equipo real ya sea de 6 personas. |
| PL-131 | **Primer pájaro de la próxima persona que se sume:** Felipe lo asigna antes de que llegue, sobre Gallito o Garza (los dos aún libres) — y se hace cargo él mismo mientras tanto si nadie más los está trabajando. |
| PL-132 | **Nivel de acceso git del día 1:** escritura directa a `main`, igual que el resto del equipo hoy. |
| PL-133 | **Quién fusiona un PR no transversal con CI verde:** la propia sesión de IA, sin esperar a Felipe — sin contradecir PL-10 (revisión humana solo para lo transversal). |
| PL-134 | **Corrección de CLAUDE.md/AGENTS.md (pendiente #6 del acta original):** cualquier sesión de IA lo corrige y abre PR, sin pedir OK antes. |
| PL-135 | **Un solo documento oficial de instrucciones:** CLAUDE.md manda; `AGENTS.md` se reduce a 3 líneas que apuntan a él — retira el comando que dañaba el diccionario y la cifra de tablas desactualizada. |
| PL-136 | **`SESIONES-ACTIVAS.md` (ya falló varias veces):** se refuerza el mismo mecanismo, obligando a leerlo al abrir sesión — hoy ni siquiera se menciona en CLAUDE.md. |
| PL-137 | **Cómo coordina una sesión que detecta un choque:** comentario en el PR de la otra sesión (o fila en el tablero); sigue si de verdad no se solapan archivos. |
| PL-138 | **Archivos transversales más chocados** (`types.ts`, `AppShell.tsx`, `package.json`, `globals.css`, `ci.yml`): sin límite duro — en su lugar, una instrucción en CLAUDE.md para que cualquier sesión de Claude Code avise sola si detecta otra sesión tocando el mismo archivo, sin bloquear nada. |
| PL-139 | **Limpieza del tablero:** automática — una revisión marca «posiblemente cerrada» cuando la rama de una fila ya no existe en `origin`. |
| PL-140 | **BACKLOG.md / BITACORA.md (473 KB / 745 KB):** se archiva lo anterior al corte actual y arrancan versiones cortas — mejor para que cada sesión de IA gaste su contexto en la tarea, no en leer historial completo; nada se pierde, queda en `docs/historico/`. |
| PL-141 | **Examen de comprensión (`/examen`):** se extiende a todo el equipo cuando cierra su propio módulo, no solo a Felipe. |
| PL-142 | **Sección «Conceptos pendientes de enseñar» (prometida, inexistente):** se crea ahora en el BACKLOG recortado. |
| PL-143 | **Cuándo se corre el examen:** al cerrar el módulo, como parte de la definición de «terminado» de PL-03 — rápido e informal, no una ceremonia que frena el cierre; si encuentra un hueco, se corrige en la marcha, no se bloquea indefinidamente. |

**Pendientes que nacen de este bloque:**
- PL-128, PL-135, PL-140: tres reescrituras de documentación real (onboarding, AGENTS.md, BACKLOG/BITÁCORA recortados) — el trabajo de documentación más grande de todo el plano.
- PL-129: actualizar `CONTRIBUTING.md` para invertir el orden Docker/Postgres desechable.
- PL-138: agregar la instrucción de aviso automático a CLAUDE.md.
- PL-136: agregar la mención de `SESIONES-ACTIVAS.md` a CLAUDE.md (hoy no está).

### Reflexión del bloque
- **Lo que ya hacemos bien:** el equipo ya tenía los mecanismos correctos pensados (SESIONES-ACTIVAS.md, /examen, la regla de "para y coordina") — el problema nunca fue falta de criterio, fue que esos mecanismos no se conectaron entre sí ni se hicieron obligatorios de leer.
- **Qué podría hacer mejor que yo un integrante:** Diego o Benja, en su primera semana real como dueños de pájaro, van a sentir en carne propia si el aviso automático de archivos transversales (PL-138) realmente ayuda o solo genera ruido — ese juicio no lo tengo yo.
- **La próxima objeción que quiero escuchar:** Felipe me pidió explícitamente en PL-143 que avance rápido y corrija en la marcha. Es la filosofía correcta para un equipo de 6 recién formado — pero alguien debería preguntar, dentro de unos meses, si "corregir en la marcha" se volvió una excusa para no corregir nunca.

---

## Cierre del plano maestro — las 143 preguntas

24 (acta) + 29 (Sesión 1) + 29 (Sesión 2) + 30 (Sesión 3) + 31 (Sesión 4) = **143 de 143.**

Cinco documentos forman el plano completo hasta hoy:
1. `00-ACTA-24-DECISIONES.md` — finalidad, prioridad, gobierno, fuente de verdad (PL-01 a PL-24).
2. `01-BANCO-PREGUNTAS.md` — las 119 preguntas diseñadas, con su fundamento (`por_que`) y las descartadas.
3. `02-ACTA-SESION-1.md` — negocio real + glosario (PL-25 a PL-53).
4. `03-ACTA-SESION-2.md` — arquitectura/Dynamic + modelo de datos (PL-54 a PL-82).
5. `04-ACTA-SESION-3.md` — permisos + pantallas, con la corrección del equipo real y el reparto de pájaros (PL-83 a PL-112).
6. `05-ACTA-SESION-4.md` (este archivo) — integraciones + equipo (PL-113 a PL-143).

**Lo que falta, y es justo lo que da valor a haber respondido 143 preguntas:** convertir estas 5 actas —una
lista de decisiones en el orden en que se preguntaron— en el plano maestro navegable por capas que PL-18 ya
diseñó (una página de finalidad, plano por pájaro, anexos generados). Eso es la siguiente fase, no una
pregunta más.

# Investigación: árboles de decisión, velocidad percibida y observabilidad en el ERP de CAYLA

Fecha: 2026-10-03 · Rama: `claude/retail-optimization-skills-e7f98e` · Alcance: Paso 1 del plan (investigación). Las cifras del repo se
midieron el 2026-10-03 con `grep`/`find` sobre este árbol; envejecen rápido, vuelve a medirlas con `pnpm rendimiento` antes de citarlas.

## Lo que hay que saber antes de leer los tres pilares

| Dato medido hoy | Cifra | Qué dice |
|---|---|---|
| Archivos `lib/*-reglas.ts` | 38 917 líneas | La lógica de negocio condicional vive aquí (y en las RPC de Postgres) |
| `page.tsx` / `loading.tsx` | 91 / 25 | 66 pantallas caen al `loading.tsx` del layout o a nada propio |
| Archivos `"use client"` | 416 | Mucho JS al navegador; no todo hace falta |
| `useOptimistic`, `next/dynamic` | 0 / 0 | No hay actualización optimista ni carga diferida de modales pesados |
| `next/image` / `<img>` | 33 / 9 | 9 imágenes sin optimizar |
| `Suspense` | 8 archivos | Casi nada llega por partes (streaming) |
| Sentry, OpenTelemetry, `instrumentation.ts`, Vercel Analytics, web-vitals en `apps/web` | **ninguno** | El sistema no sabe medirse a sí mismo. Único registro estructurado: `capturarError()` en `lib/errores.ts` (14 usos, casi todos en `/api/lucode/*`) |
| `console.*` en código de la app | 70 | Lo único parecido a un log; sin formato ni correlación |
| `AbortSignal.timeout` | 9 usos | Pocas llamadas externas tienen tope de espera |

**Volumen real (regla Jeff Dean):** 3 tiendas + 1 taller. Unos cientos de ventas al día, decenas de colaboradores. Esto cambia el orden
de importancia: **ninguna optimización de CPU de un árbol de decisión se nota a esta escala** (evaluar 40 reglas toma microsegundos).
Lo que sí se nota es *latencia de red y de base de datos* (esperar una RPC), y lo que sí importa es que *un error no se pierda sin
que nadie se entere*. Por eso el orden por retorno es: **observabilidad → velocidad percibida → árboles de decisión.** Es lo contrario
del orden en que se pidió, y está justificado abajo.

---

## Pilar 1 — Árboles de decisión

### Concepto y buenas prácticas
Un árbol de decisión en código es una cascada de `if / else if / switch` que clasifica una entrada y devuelve una acción
(«¿esta prenda se rebaja, se traslada o se deja?»). Tres enfermedades típicas:

1. **Profundidad excesiva.** `if` dentro de `if` dentro de `if`: para entender la hoja hay que sostener 4–5 condiciones en la cabeza.
   Medida: *profundidad de anidamiento* y *complejidad ciclomática* (número de caminos independientes; >10 ya pide partir, >15 es deuda).
2. **Reevaluación.** La misma condición (`prenda.stock > 0 && !prenda.apartada`) escrita en tres ramas, o un cálculo caro repetido
   por rama. Cura: calcular una vez, nombrarlo, y que las ramas lo lean.
3. **Falta de poda anticipada (early exit).** El caso raro o inválido se maneja al final, dentro del `else` gigante, en vez de al
   principio con `return`. Cura: *cláusulas de guarda* — descartar primero lo imposible/trivial, dejar el camino feliz sin sangría.

Técnicas de la industria: **aplanar** con guardas; **tabla de decisión** (un arreglo ordenado de `{cuando, entonces}` en vez de una
escalera de `if`, que es lo que Torvalds llama «eliminar el caso especial»); **reordenar por frecuencia** (la condición que casi
siempre decide va primera; sólo vale con datos reales, ver Pilar 3) y **pre-evaluación ligera** (un chequeo barato que descarta
antes del chequeo caro: comparar un número antes de consultar un arreglo).

### Función en una arquitectura moderna
Es el *motor de reglas* del negocio. Cuando está bien hecho es **puro** (sin React, sin base de datos): recibe datos, devuelve una
decisión, se prueba con una tabla de casos. Este repo ya lo hace bien por convención (`*-reglas.ts` + `.test.ts`).

### Aplicación a CAYLA (con evidencia)
- **Frescura del piso** (`lib/frescura-reglas.ts`, 1 797 líneas; `frescura-decisiones-reglas.ts`): árbol de «qué se hace con una
  prenda quieta» (cambiarla de lugar, trasladarla, rebajarla, esperar), con plazos y vigencias. Es el árbol más grande del front.
- **Checkout / comprobantes** (`comprobantes-reglas.ts`, `notas-credito-reglas.ts`): boleta vs. factura vs. nota de crédito; el
  árbol real del cobro **vive en las RPC de Postgres**, no en TypeScript. Un escáner de TS no lo ve: hay que auditarlo aparte
  leyendo `supabase/migrations/*.sql`.
- **Promociones / campañas** (`resumen-finanzas-reglas.ts`, `campanas`): cascada de «qué descuento gana».
- **Stock y catálogo** (`movimientos-reglas.ts`, `variantes-ficha-reglas.ts`, `parecidas-alta-reglas.ts`, 164 `if` en el último).

**Objeción (movimiento 2):** reordenar por frecuencia para ganar *velocidad* aquí es superstición con este volumen. El valor de
aplanar y tabular es **corrección y mantenimiento**: una escalera de 12 `else if` es donde nace el caso que nadie probó. Lo
medimos con *complejidad ciclomática y profundidad*, no con milisegundos.

---

## Pilar 2 — UI/UX y velocidad percibida

### Concepto y buenas prácticas
Velocidad **percibida** ≠ velocidad real: una persona juzga rápido lo que *responde enseguida y muestra progreso*, aunque el dato
tarde igual. Umbrales de referencia: <100 ms se siente instantáneo, ~1 s mantiene el hilo del pensamiento, >10 s se abandona.
Técnicas:

- **Streaming / renderizado por partes:** `Suspense` alrededor de la parte lenta; el resto de la pantalla aparece primero.
- **`loading.tsx` con esqueleto** del contenido real (no un círculo genérico): evita el salto de layout.
- **Actualización optimista:** reflejar el resultado en pantalla antes de que el servidor confirme y revertir si falla
  (`useOptimistic` + `useTransition` en React 19). **Solo para acciones reversibles y sin dinero ni stock.**
- **Cascadas (waterfalls):** `await` uno tras otro cuando podían ir en paralelo (`Promise.all`). Suman latencias.
- **Menos JS al cliente:** componentes de servidor por defecto, `"use client"` solo donde hay interacción, `next/dynamic` para
  modales/gráficos pesados que no se ven al cargar.
- **Imágenes:** `next/image` con `sizes`, `priority` solo en la imagen de arriba del pliegue, formatos modernos.
- **Evitar re-renders:** estado lo más abajo posible, `memo`/`useMemo` solo donde se midió, claves estables en listas.

### Función en la arquitectura
Es la capa que convierte la latencia inevitable (red + Postgres + RLS) en una espera tolerable. No acelera la base: la disimula bien
o evita esperar.

### Aplicación a CAYLA
- **Ya resuelto a propósito:** un loader global único (ADR-0149, `components/ui/Espera.tsx`) y una guía para que ningún clic deje la
  página sin respuesta. Una skill nueva **no debe proponer otro loader** ni contradecirlo.
- **Hueco real 1 — esqueletos:** 66 de 91 pantallas sin `loading.tsx` propio. Las pesadas (Existencias, Análisis, Movimientos,
  Finanzas ▸ Reportes) son las que más ganan con `Suspense` por sección: la cifra de arriba aparece mientras la tabla carga.
- **Hueco real 2 — Vender** (mostrador, la pantalla donde la espera se ve): cada tecla en el buscador de productos, cada línea
  agregada, tiene que sentirse inmediata. Es el caso de uso legítimo de optimismo **en el carrito local** (agregar/quitar línea,
  que aún no es una venta), nunca en *confirmar la venta*.
- **Hueco real 3 — modales pesados** cargados siempre (`next/dynamic`: 0 usos) y 9 `<img>` sin optimizar.
- **Celular** (regla PL-105): Vender, Cambios y Devoluciones se miden a 375 px; ahí el JS de más pesa más.

**Objeción:** la actualización optimista **choca con el principio «la unidad es todo-o-nada»** (Jim Gray) y con ADR-0149 («el aviso
de éxito sale DESPUÉS del loader»). Mostrar «Venta registrada» antes de que Postgres confirme es mentirle a la colaboradora si la
RPC falla (stock insuficiente, caja cerrada). Permitido: estado de la interfaz (selección, orden, carrito sin confirmar,
marcar visto). Prohibido: venta, traslado, ajuste de stock, comprobante, cualquier cosa de `movimientos`.

---

## Pilar 3 — Observabilidad

### Concepto y buenas prácticas
Observabilidad es poder responder, **desde fuera y sin tocar el código**, «¿qué pasó y por qué?» ante una pregunta que no se
anticipó. Tres señales que se complementan:

| Señal | Pregunta que responde | Forma correcta |
|---|---|---|
| **Logs estructurados** | ¿Qué ocurrió en este caso? | JSON con campos fijos (`nivel`, `evento`, `sede_id`, `rpc`, `error_codigo`, `request_id`), nunca `console.log("falló " + x)` |
| **Métricas** | ¿Cuánto y qué tan seguido? ¿Empeora? | Contadores y percentiles (p50/p95 de cada RPC, tasa de error, Core Web Vitals) |
| **Trazas (APM)** | ¿Dónde se fue el tiempo en *esta* petición? | Un `request_id` que une navegador → Server Action → RPC → proveedor externo |

Regla de oro: **medir antes de optimizar.** Sin esto, «Vender está lento» es una opinión; con esto es «la RPC `registrar_venta`
tiene p95 = 1,8 s en LIM entre 6 y 8 pm». Alertar sobre *síntomas del usuario* (tasa de error, latencia), no sobre causas internas.
Cuidado con la **cardinalidad** (no etiquetar métricas con `cliente_id`) y con los **datos personales** (DNI, nombre, teléfono nunca
a un log: aplica la ley peruana de protección de datos).

### Función en la arquitectura
Es el sistema nervioso: convierte «creemos que» en «sabemos que». Alimenta a los otros dos pilares: dice *qué rama del árbol se
ejecuta de verdad* (frecuencia real) y *qué pantalla es lenta de verdad* (en vez de adivinar).

### Aplicación a CAYLA
- **Hoy:** cero herramientas de observabilidad en `apps/web` (las MCP de Sentry y Vercel existen en la cuenta de quien desarrolla,
  pero la app no envía nada). 70 `console.*` sin estructura; 3 `error.tsx`; 9 timeouts. Cuando algo falla en una tienda, lo único que
  existe es que la colaboradora lo cuente.
- **Dependencias externas** (principio 9 — «todo puede fallar»): SUNAT vía Lucode, padrón DNI/RUC (SUNAT público y luego apis.net.pe).
  Cada llamada necesita: tope de espera, qué pasa si no responde (cola «por reintentar» ya existe en
  `vender/comprobantes/por-reintentar`), y **un registro de la falla con su causa**. Sin eso, un comprobante que no salió es
  indistinguible de uno que nunca se intentó.
- **Auditoría de negocio ya existe:** `movimientos` (append-only) y la pantalla Actividad son *auditoría*, no observabilidad
  técnica: dicen *qué hizo la persona*, no *cuánto tardó ni qué falló*. Son complementarias, no sustitutas.
- **RPC:** 189 archivos llaman `rpc(`. Un envoltorio único (`llamarRpc`) que mida duración y registre el error cubre las 189 a la
  vez: es el punto de apoyo de más palanca.

**Objeción:** *no instalar* una plataforma APM completa hoy. Para 4 puntos de operación y un equipo de una persona, el mínimo
sensato es: (1) ampliar el logger que ya existe (`capturarError`, `lib/errores.ts`) a un `registrar()`, (2) `request_id` por petición, (3) medir RPC y SUNAT, (4) Core Web Vitals del
navegador. Sentry/OpenTelemetry se evalúa cuando (1)–(4) existan y den evidencia de que no alcanzan.

---

## Cómo se conectan los tres (por qué este orden)

1. **Observabilidad primero:** sin ella los otros dos son adivinanza. Dice qué RPC es lenta y qué errores ocurren.
2. **Velocidad percibida segundo:** actúa sobre lo que la medición señale; los huecos de arriba son candidatos, no certezas.
3. **Árboles de decisión tercero:** valor de mantenimiento/corrección; la frecuencia real de cada rama (de las métricas) decide
   cualquier reordenamiento.

## Lo que esta investigación NO afirma
- No mide tiempos reales de producción (ninguna herramienta los captura hoy: es el hallazgo central).
- No audita el SQL de las RPC (los árboles del cobro viven allí): queda como siguiente paso explícito.
- Las cifras de `grep` son heurísticas (texto, no AST): marcan *dónde mirar*, no *qué está mal*.

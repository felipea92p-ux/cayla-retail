# ADR-0013 — La lentitud es geografía, no datos: Fase 0 y la apuesta local-first

**Fecha:** 2026-09-09
**Estado:** Fase 0 aplicada en el repo el mismo día — **pendiente de desplegar y de
volver a medir**. Fases 1 y 2, decididas y sin empezar.
**Afecta:** despliegue (región Vercel), `lib/finanzas.ts`, `middleware.ts`, `lib/persona.ts`,
y la arquitectura de lectura de toda la app a partir de Fase 2

## Contexto

Felipe reportó que "el sistema se demora mucho en cargar las pantallas" y pidió apostar
por local-first. Antes de proponer nada se midió, porque el diagnóstico intuitivo de una
app lenta con Postgres detrás casi siempre apunta a las consultas — y acá esa hipótesis
resultó falsa.

### Lo que se midió

**1. Los datos no son el problema.** Volumen real del schema `retail` en producción:

| Tabla | Filas vivas | Peso |
|---|---|---|
| `movimientos` | 28 | 64 kB |
| `variantes` | 19 | 48 kB |
| `stock` | 10 | 24 kB |
| `productos` | 5 | 48 kB |

Todo el schema pesa **menos de 1 MB**. `EXPLAIN ANALYZE` de la consulta del catálogo:
**0.862 ms de ejecución, 2 buffers**. No hay nada que optimizar en la base: ni índices,
ni consultas, ni RLS. Cualquier ineficiencia de política RLS se multiplica por 19 filas.

**2. La app corre en el continente equivocado.** Cabecera de producción:

```
X-Vercel-Id: iad1::578ws-1788965074574-14429096c5c5
```

`iad1` es Washington D.C. El proyecto Supabase (`cayla-dynamic`, donde vive el schema
`retail` desde la unificación) está en `sa-east-1`, São Paulo. **Cada consulta de cada
pantalla cruza de Washington a São Paulo y vuelve.**

Latencias medidas desde Perú:

| Trayecto | TCP | TLS | TTFB |
|---|---|---|---|
| Perú → Supabase São Paulo | ~105 ms | ~211 ms | ~322 ms |
| Perú → Vercel (edge → `iad1`) | ~102 ms | ~262 ms | ~430 ms |

El dato más elocuente: **una página estática, ya cacheada en el edge (`X-Vercel-Cache:
HIT`), tarda 430 ms en empezar a llegar.** Eso es el piso, antes de consultar nada.

El tramo `iad1`↔`sa-east-1` no se pudo medir directo (habría que instrumentar desde
dentro de la función); se estima en ~120 ms por la distancia. **Ese número hay que
confirmarlo al aplicar el cambio, no darlo por bueno.**

**3. Cuatro viajes secuenciales por navegación.** Ruta crítica reconstruida de
`/inventario`:

| # | Dónde | Qué |
|---|---|---|
| 1 | `middleware.ts:31` | `auth.getUser()` → red a Supabase Auth |
| 2 | `lib/persona.ts:52` | `auth.getUser()` **de nuevo** |
| 3 | `lib/persona.ts:59` | `personas` + `sedes` (en paralelo) |
| 4 | `lib/catalogo.ts:36` | catálogo + stock + movimientos (en paralelo) |

Los viajes 1 y 2 son el mismo dato pedido dos veces: el `cache()` de React memoriza
dentro de un render, pero el middleware y el render del RSC son invocaciones distintas
del runtime — no comparten memoria. `getUser()` va a la red a propósito (valida el token
contra el servidor de Auth, a diferencia de `getSession()`).

Son secuenciales: cada uno espera al anterior. ~480 ms de espera para traer 19 filas.

**4. Cero caché.** Las 28 rutas salen `ƒ` (dinámicas) en el build. `grep` de
`revalidate` / `unstable_cache` / `use cache` sobre `app/` y `lib/`: **ninguna
coincidencia**. `sedes` — 5 filas que no cambian nunca — se pide en cada carga de cada
pantalla. `next.config.ts` está vacío.

**5. Una cascada real.** `lib/finanzas.ts:150-172` — `getEstadoResultados` hace 5
consultas independientes en fila india (`sedes` → `movimientos` → `variantes` → `ventas`
→ `gastos`). `getDiarioCaja` tiene 3 más. El resto del repo ya migró a `Promise.all`;
estos dos quedaron atrás.

**6. El bundle no es el problema.** 352 kB de JS gzip en total, ~130-180 kB en primera
carga. Rango normal, y se cachea. Descartado como causa.

## Decisión

### A. El orden: infraestructura antes que arquitectura

Local-first es la apuesta correcta y se mantiene como destino. **Pero no es lo que está
lento hoy**, y hacerlo primero sería arreglar la capa equivocada: es trabajo de semanas,
y aun terminado la primera carga seguiría cruzando a Washington. Se ordena así:

**Fase 0** (config y cascadas — riesgo casi nulo):
1. Mover la función de `iad1` a `gru1` (São Paulo). Los 4 viajes pasan de ~120 ms a
   ~10 ms cada uno. Además Perú→São Paulo es más corto que Perú→Washington, así que
   mejora también el primer tramo.
2. `Promise.all` en `getEstadoResultados` y `getDiarioCaja`.
3. Eliminar el `getUser()` duplicado: migrar a claves JWT asimétricas + `getClaims()`,
   que verifica el token localmente sin ir a la red.

**Fase 1** (percepción):
- Cachear `sedes` de verdad (no `cache()` por request).
- `cacheComponents: true` — verificado que existe en el Next 16.2.10 instalado. El
  armazón (nav, cabecera) se vuelve estático y aparece al instante; los datos entran
  por streaming.
- `experimental.staleTimes` para que volver atrás sea instantáneo.

**Fase 2**: local-first de lecturas.

Estimación: Fase 0 sola debería llevar de ~2 s a ~700 ms. **Se mide antes y después de
cada cambio por separado** — un cambio que no supere el ruido se revierte, no se queda
"porque ya está escrito".

### B. Local-first: lecturas replicadas, escrituras server-authoritative

El dato que lo hace inusualmente viable acá: **el negocio entero cabe en el navegador.**
Menos de 1 MB hoy; con 5.000 variantes serían ~1-2 MB. Entra completo, no es un
compromiso.

- **Lecturas** (catálogo, stock, precios, sedes) → replicadas al cliente, pantalla en
  0 ms, sincronización de fondo. Seguro: una lectura desactualizada es un asunto de
  pantalla, y el servidor revalida igual al escribir.
- **Escrituras** (venta, movimiento, recepción, producción) → siguen pasando por los RPC.
  `movimientos` sigue siendo la única fuente de verdad (principio 4), append-only.

**Lo que NO se hace:** escrituras local-first sin arbitraje. Dos tiendas vendiendo offline
la última unidad dejarían el stock en −1 — eso rompe de frente el principio 2 (cero
estados inconsistentes), y no se arregla con código: se arregla no haciéndolo.

### C. Venta sin internet: permitir solo con stock de sobra

Decisión de negocio de Felipe (2026-09-09): si se cae el internet en plena venta, la
venta **se permite offline únicamente cuando quedan varias unidades**; si es la última,
bloquea.

Es el punto medio deliberado entre perder la venta y sobrevender: el riesgo de que dos
sedes vendan simultáneamente offline es real solo cuando el stock está al límite. Con
holgura, la carrera no existe en la práctica.

**Pendiente de definir al construir Fase 2:** cuál es el umbral exacto de "de sobra"
(¿2 unidades? ¿el doble del mínimo de la sede?) y qué se le muestra a la Encargada
cuando la venta queda bloqueada por esta regla. No se inventa acá — se decide con
Felipe cuando la fase esté en la mesa.

## Consecuencias

- **`gru1` hay que confirmarlo, no asumirlo.** No se pudo leer la config del proyecto
  Vercel (403: el token no tiene el scope `cayla`). Se desconoce si `iad1` fue decisión
  o el default. Si Dynamic corre en la misma región, tiene el mismo problema y la misma
  cura — pero es otro proyecto Vercel, así que mover retail no lo afecta.
- **El riesgo de autenticación que se anticipó no existía.** Se dio por hecho que
  `getClaims()` exigiría migrar el proyecto a claves asimétricas — un cambio de auth en
  producción, y encima compartido con Dynamic. Al verificar el JWKS antes de tocar nada
  (`/auth/v1/.well-known/jwks.json`) resultó que **el proyecto ya firma con ES256
  asimétrica**. Así que el paso quedó en puro código, sin tocar producción. Queda escrito
  porque la suposición estuvo a punto de costar una consulta innecesaria a Felipe y una
  fase partida en dos sin motivo.
- **`getClaims()` degrada solo, no se rompe.** Si algún día el proyecto volviera a firmar
  con secreto simétrico, `getClaims()` cae por su cuenta al viaje de red — se comporta
  como el `getUser()` de antes. El cambio no puede empeorar nada, solo dejar de mejorar.
- **Dónde vive `vercel.json` es una apuesta razonada, no un hecho verificado.** Se puso en
  `apps/web/` porque el `package.json` de la raíz no declara `next`: si Vercel construyera
  desde la raíz no detectaría el framework y no existiría el middleware que sí corre hoy.
  No se pudo confirmar leyendo la config del proyecto (403 sobre el scope `cayla`).
  **Se confirma con una sola orden después de desplegar**, mirando `X-Vercel-Id`; si
  siguiera diciendo `iad1`, el archivo se mueve a la raíz o se fija la región desde el
  panel de Vercel (Settings → Functions), que aplica igual sin depender del monorepo.
- El advisor de performance de Supabase reporta `auth_rls_initplan` y
  `multiple_permissive_policies` sobre tablas de `retail` (`stock`, `movimientos`,
  `variantes` tienen dos políticas permisivas de SELECT cada una). **Se anota y no se
  toca:** a 19 filas no cuesta nada medible, y arreglarlo ahora sería optimizar sin
  evidencia. Vuelve a la mesa cuando el catálogo real esté cargado.
- Fase 2 cambia cómo lee toda la app: es la decisión estructural más grande desde la
  unificación con Dynamic. Tendrá su propio ADR cuando se diseñe, con el motor de
  sincronización elegido y justificado.

# BRIEF — Velocidad y sin internet

> Para arrancar esta dimensión desde una sesión nueva. Escrito el 2026-09-10, al cerrar la
> dimensión anterior. Si pasaron semanas, **verificá los números contra la base antes de
> creerle a este documento** — es exactamente el error que costó dos vueltas el día que se
> escribió.

## De dónde sale esto

El documento *CAYLA Retail — el estándar, los doce y el camino* compara 16 sistemas en cinco
dimensiones que ninguna ficha comercial mide. Felipe decidió atacarlas una por una, tomando
como vara solo las celdas de **5/5** — el estándar que alguien ya alcanzó y por tanto es
alcanzable.

| Dimensión | Quién saca 5/5 | Estado de CAYLA |
|---|---|---|
| Belleza | Shopify POS, Square, Doss | ya estaba en ~5 |
| Soporte en español | Loyverse, Odoo, Alegra, Bsale, INVY | 5 de fábrica |
| Facilidad de aprendizaje | Square, Loyverse, **INVY** | **cerrada el 2026-09-10** |
| **Velocidad y sin internet** | **Square for Retail, Loyverse** | **← esta** |
| Apertura para integrar | Shopify POS, Odoo, Zoho, Doss | ~2, y no urge |

**Por qué ésta y no «apertura»:** apertura empieza a valer el día que CAYLA le venda el
sistema a otra marca; hoy no le cambia el día a nadie en tres tiendas. Velocidad sí, y sobre
todo la mitad de «sin internet»: la tienda tiene red floja y el censo va a poner a cuatro
personas escaneando durante días.

**Qué significa el 5/5 acá**, con las palabras del propio documento: *«qué tan rápido se
siente en caja y qué pasa cuando se cae internet»*. Square y Loyverse siguen vendiendo con el
router muerto y sincronizan solas al volver.

## Dónde está CAYLA, medido

**Velocidad: ~4.** Medido el 2026-09-09 con sesión iniciada (`BITACORA.md`, entrada «por fin
la medición real»): `/inventario` da **131 ms de TTFB y 750 ms de carga total**; forzando
render dinámico, 300-500 ms. El «~2 s» que se venía repitiendo **nunca existió como
medición**. Región confirmada en `gru1`, `staleTimes: 30`, streaming en las 10 pantallas.

Y el hallazgo que manda: **no hay correlación entre lo que una pantalla hace y lo que tarda**
— `/mas` (47 líneas, casi solo enlaces) tardó 409 ms y `/comercial`, la más pesada, 297 ms. O
sea que lo que queda **no es trabajo de datos: es sobrecosto fijo por petición**. Cachear no
ayuda; lo que ayuda es *no hacer la petición*.

**Sin internet: 0.** Verificado por grep: cero service worker, cero `manifest.json`, cero
IndexedDB, cero `navigator.onLine`, cero cola de reintentos. Lo único que hay es la cola de
`ConteoPanel` en `localStorage`, y es de esa pantalla, no del sistema.

## Lo ya decidido (no re-decidir)

- **ADR-0013** — la lentitud es geografía, no datos. Fases 0 (infra), 1 (percepción), 2
  (local-first de lecturas), 3 (venta offline). Fases 0 y 1 **aplicadas y medidas**.
- **ADR-0018** — el motor: **instantánea en IndexedDB + Supabase Realtime**, hecho a mano, sin
  motor externo. El motivo decisivo: ElectricSQL, PowerSync y Zero esperan que la autorización
  viva en una capa delante de la base, y acá la resuelve RLS. Realtime respeta RLS de fábrica.
  **Su precondición —medir la Fase 0— ya se cumplió.** Lo que queda es decisión de Felipe, no
  medición.
- **ADR-0021** — el streaming «sustituye, por ahora» a la Fase 2. Su última consecuencia dice
  lo que importa: *local-first sigue siendo lo único que puede dar operación con el wifi
  caído, porque siempre hay una petición de por medio*.
- **Decisión de negocio de Felipe (2026-09-09):** si se cae el internet en plena venta, se
  vende offline **solo cuando quedan varias unidades**; si es la última, bloquea.

## EL DATO NUEVO — y cambia el plan

Hasta el 2026-09-10 el argumento contra la Fase 3 era: *«la venta offline exige una cola de
escrituras, y eso exige que `registrar_venta` sea idempotente — reintentar una venta hoy la
duplica»*. **Eso es falso para producción.**

Medido contra la base el 2026-09-10: `retail.registrar_venta` **ya es idempotente**, con la
maquinaria completa:

- la columna `ventas.token_cliente`,
- el índice único `ventas_token_cliente_key`,
- un `p_token uuid default null` en la firma,
- la guarda que **rechaza** un token reusado con otra caja, otro método de pago u otro monto,
- y un `exception when unique_violation` que resuelve la carrera de dos reintentos a la vez.

Alguien lo construyó y lo aplicó a mano; no quedó en ningún archivo hasta que se escribió
`supabase/unificacion/35_registrar_venta_p_nota.sql`. **La pieza más difícil de la Fase 3 ya
existe y está sin usar.**

**Lo que le falta para servir, y es poco:**

1. `apps/web/components/RegistrarVentaModal.tsx` **no manda `p_token`** (grep: 0 coincidencias).
   Basta generar un `crypto.randomUUID()` por intento de venta y mandarlo.
2. **La base local no tiene nada de esto**: `retail.ventas` no tiene `token_cliente`, y la
   firma local es de 4 argumentos. Hace falta una migración que ponga local al día con
   producción — es la dirección inversa a la habitual, y por eso nadie la escribió.
3. Sin cola todavía no cambia nada visible: la idempotencia es la *red* que hace segura la
   cola, no la cola.

## Lo que hay que decidir con Felipe antes de construir

ADR-0013 §C dejó dos preguntas abiertas **a propósito**, y siguen abiertas:

- **Cuál es el umbral exacto de «stock de sobra».** ¿Dos unidades? ¿El doble del mínimo de la
  sede? Es una decisión de cómo opera el negocio, no de Postgres.
- **Qué ve la Encargada cuando la venta queda bloqueada** por esa regla, con la clienta
  enfrente.

No se inventan. Sin ellas se puede construir la Fase 2 (lecturas) entera, pero no la 3.

## El orden que yo propondría

1. **Cerrar el círculo de la idempotencia**, que es barato y ya está medio hecho: migración
   local para `token_cliente`, y que el modal mande el token. Con eso, un reintento de venta
   deja de poder duplicar — **antes** de que exista ninguna cola, y sirve igual hoy: la red de
   la tienda ya corta llamadas a mitad.
2. **Fase 2, lecturas locales** (ADR-0018): semilla del catálogo a IndexedDB + Realtime sobre
   `stock` y `movimientos`. Ojo: habilitar Realtime es `alter publication` en el proyecto
   **compartido con Dynamic** — parar y confirmar con Felipe, y presupuestarlo como paso real.
   Hoy la publicación `supabase_realtime` tiene **0 tablas**.
3. **Fase 3, venta offline**, recién con las dos preguntas de arriba respondidas.

## Trampas de este repo que hay que saber antes de tocar nada

- **Sobre producción no se afirma leyendo archivos.** El 10-sep se afirmaron dos cosas sobre
  producción mirando el repo y la base desmintió las dos. Se mide con
  `pnpm migraciones:verificar` contra una foto fresca de `scripts/migraciones/inventario.sql`.
- **La base local no es una réplica fiel de producción.** Se construyen por caminos distintos:
  local replica el historial completo, producción recibió estados consolidados vía
  `unificacion/`. Un bug de local puede no existir allá, y al revés.
- **Aplicar una migración a mano en local** no funciona tal cual: el archivo dice
  `set search_path = public` (correcto para `db reset`) pero la local ya tiene todo en
  `retail`. Y sin un `set search_path` de sesión, el `create or replace` crea la función en
  `public` y deja intacta la de `retail`: parece que corrió y no cambió nada.
- **Toda migración que cambie la firma de una función** lleva su `drop function` de la vieja
  con tipos explícitos (ADR-0026). Y revisá la firma resultante contra lo que la app manda: el
  10-sep una firma reescrita a mano dejó de resolver y **vender estaba roto en producción** sin
  que nadie lo supiera.

## Dónde seguir leyendo

`docs/adr/0013`, `0018`, `0021` y `0026` · `docs/BACKLOG.md` (ítem *local-first de lecturas*)
· `docs/BITACORA.md`, entradas del 09 y 10 de septiembre.

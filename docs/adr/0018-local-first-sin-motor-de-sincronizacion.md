# ADR-0018 — Local-first sobre Supabase Realtime, sin motor de sincronización externo

**Fecha:** 2026-09-09
**Estado:** Decidido — **no empezar hasta medir la Fase 0 en producción** (ver "Precondición")
**Deriva de:** ADR-0013 (Fase 2). Este ADR resuelve lo que aquel dejó abierto: qué motor.

## Contexto

ADR-0013 decidió la forma de local-first para CAYLA: **lecturas replicadas al navegador,
escrituras siempre por RPC**, con `movimientos` como única fuente de verdad (principio 4).
Lo que quedó sin resolver era el motor de sincronización. Hoy se evaluaron los tres
candidatos reales del mercado.

| Motor | Modelo | Escrituras offline |
|---|---|---|
| **ElectricSQL** | Solo lectura, sobre replicación lógica de Postgres; sirve "shapes" por HTTP | No las resuelve |
| **PowerSync** | Bidireccional, Postgres ↔ SQLite, con cola de subida | Sí, es el único con soporte de primera |
| **Zero** (Rocicorp) | Bidireccional server-authoritative, con `zero-cache` manteniendo una réplica | Sí, vía mutators |

El perfil de ElectricSQL calza exactamente con la decisión de ADR-0013 —solo lecturas, sin
CRDT, sin conflictos— y por un momento pareció la respuesta obvia.

**Y ahí está el hallazgo que da vuelta la decisión: ElectricSQL no implementa RLS.** Su
equipo declaró que hasta la 1.0 estable dependen de autorización por API, y que RLS queda
para explorar más adelante. Lo mismo, en distinto grado, vale para los otros dos: todos
esperan que la autorización viva en una capa propia delante de la base.

Eso choca de frente con lo que este proyecto ya decidió y escribió en `CLAUDE.md`:

> CAYLA es el único tenant, y la seguridad la resuelve RLS directamente, no una capa de
> API separada.

Adoptar cualquiera de los tres significaría **reconstruir la autorización fuera de RLS** —
volver a expresar `stock_select_lider`, `stock_select_propia_sede`, `fn_es_lider()` y
`fn_sede_actual_persona()` como reglas de un proxy. Es reescribir el modelo de seguridad
del sistema para ganar velocidad de lectura. No es un intercambio aceptable.

**Supabase Realtime, en cambio, respeta RLS de fábrica**: decodifica la replicación lógica
y evalúa la visibilidad de cada fila por usuario antes de emitirla. Es la misma política
que ya protege las pantallas, aplicada al flujo de cambios. Y ya viene con el proyecto.

Hay un segundo motivo, independiente: los tres motores son **infraestructura** —un servicio
más que operar, monitorear y pagar— y el proyecto tiene un principio explícito en contra
(5: "diseña para el volumen que viene, no lo sobre-construyas para el que nunca llegará —
3 tiendas + 1 taller"). Medido el 09-09: el negocio entero pesa **menos de 1 MB**, y ~1-2 MB
proyectando 5.000 variantes. Montar replicación lógica dedicada para eso es desproporción.

Agravante concreto: la base de producción **está compartida con cayla-dynamic**. Abrir un
slot de replicación lógica dedicado ahí afecta a un proyecto que no es este, y eso cae de
lleno en "decisiones que afectan más de un módulo" — requeriría parar y confirmar.

## Decisión

**Local-first hecho a mano sobre lo que el proyecto ya tiene: instantánea en IndexedDB +
Supabase Realtime para los cambios.** Sin motor externo, sin servicio nuevo, sin tocar la
replicación del proyecto compartido.

1. **Semilla:** al entrar, el cliente pide el catálogo completo una vez (una consulta,
   <1 MB) y lo guarda en IndexedDB.
2. **Cambios:** se suscribe por Realtime a `stock` y `movimientos`. Realtime aplica RLS,
   así que una Encargada solo recibe lo de su sede — sin reglas nuevas que mantener.
3. **Lectura:** las pantallas pintan desde IndexedDB, en 0 ms, sin red.
4. **Escritura:** sin cambios. Todo sigue por los RPC con `fn_puede_operar_sede`.

Lo que se paga: es código propio, no una librería. Se acepta porque es código **pequeño**
para un conjunto de datos **pequeño**, y porque la alternativa no era "menos código" sino
"menos código aquí y un modelo de seguridad nuevo allá".

Si algún día CAYLA vende el sistema a otra marca y el volumen o el número de tenants cambia
de orden, esta decisión se revisa — y ahí PowerSync (el único con escrituras offline de
primera) vuelve a la mesa junto con la Fase 3.

## Precondición — no arrancar todavía

**La Fase 0 no está desplegada.** El diagnóstico decía ~2 s por navegación, casi todo en
viajes de red entre Washington y São Paulo. La Fase 0 corrige justo eso y se estimó que
dejaría el sistema en ~700 ms. **Esa cifra sigue siendo una estimación: nadie la ha medido.**

Construir local-first —el cambio de arquitectura más grande desde la unificación con
Dynamic— encima de una línea base sin medir es exactamente el error que el propio método de
optimización prohíbe: primero se mide el arreglo, después se decide el siguiente. Es
perfectamente posible que con la región corregida el sistema se sienta bien y que lo que
quede por ganar no justifique reescribir cómo lee toda la app.

**Orden correcto:** desplegar la Fase 0 → medir el TTFB real → recién ahí decidir si Fase 2
se construye, se recorta o se archiva. Este ADR deja el motor resuelto para que esa decisión
sea rápida, no para adelantarla.

## Consecuencias

- No se agrega ninguna dependencia ni servicio. La replicación del proyecto compartido con
  Dynamic queda intacta.
- La autorización sigue viviendo en un solo lugar (RLS). No hay una segunda copia de las
  reglas que se pueda desincronizar — que es la falla clásica de meter un proxy de sync.
- **Realtime hoy no está activo sobre ninguna tabla.** Verificado el 2026-09-09 contra
  producción: la publicación `supabase_realtime` existe pero tiene **0 tablas** (ni de
  `retail` ni de Dynamic). Habilitarla es un `alter publication supabase_realtime add table
  retail.stock, retail.movimientos` — DDL en el proyecto **compartido con Dynamic**, así que
  entra en "parar y confirmar con Felipe" antes de correrlo, no en ejecución directa.
  Es el primer paso real de la Fase 2 y hay que presupuestarlo como tal, no darlo por hecho.
- La instantánea inicial sigue costando un viaje. Local-first hace instantánea la **segunda**
  pantalla en adelante, no la primera — razón de más para que la Fase 0 vaya antes.
- **La venta offline (Fase 3) NO queda resuelta por esta decisión.** Felipe decidió el
  2026-09-09 permitirla solo con stock de sobra; eso exige cola de escrituras, que es
  justamente lo que este diseño no trae. Cuando toque, se decide aparte — y ahí sí el umbral
  exacto de "de sobra" y qué ve la Encargada al bloquearse son preguntas para él.

# Cómo se refresca el radar (`/innovar radar`)

El radar (`docs/radar/`) es la memoria de «lo último»: lo que salió en el stack y lo que hacen los mejores, con su fuente y su anillo. Existe para
que cada corrida de `/innovar` no pague una investigación web entera y para que dos corridas digan lo mismo. Se refresca **una vez por semana** (la
rutina) o cuando Felipe lo pide. Archivos:

- `docs/radar/README.md` — cómo se lee, la fecha del último refresco y el registro de cambios de cada refresco.
- `docs/radar/stack.md` — novedades del stack (Next, React, Postgres, Supabase, Vercel, TypeScript, Zod, plataforma web, IA).
- `docs/radar/referentes.md` — patrones de los referentes (retail y ERP para el qué; software de primer nivel para el cómo).

**Anillos** (los del radar de ThoughtWorks, aterrizados a 3 tiendas + 1 taller):
- **ADOPTAR** — maduro, encaja ya en este stack, costo bajo. Una corrida de `/innovar` puede proponerlo en «Ahora».
- **PROBAR** — vale un piloto acotado en una pantalla o un módulo.
- **EVALUAR** — vigilar y entender; sin construir.
- **ESPERAR** — inmaduro o no conviene a este volumen. Se anota el porqué para no reabrirlo cada semana.

## Paso a paso

1. Lee las versiones actuales del repo (`apps/web/package.json`, `apps/tienda/package.json`, `packages/*/package.json`, `supabase/config.toml`):
   si algo del radar ya se adoptó (p. ej. se migró a Zod 4), la entrada pasa a «adoptado en el repo» con la fecha.
2. Lanza **dos agentes en paralelo** (`general-purpose`, en segundo plano), uno con cada prompt de abajo. Cada uno recibe el archivo actual del
   radar que le toca y escribe la versión nueva en el scratchpad.
3. Revisa los dos archivos: cada entrada con fuente primaria y fecha, sin datos de CAYLA. Cópialos a `docs/radar/`.
4. Actualiza el `README.md`: la fecha de «Último refresco» y una sección nueva al tope de «Registro de cambios» con lo que entró (`nuevo`),
   subió (`↑`), bajó (`↓`) o salió (`salió`, con el motivo).
5. Mira `docs/innovacion/README.md`: una propuesta `descartada` cuyo motivo era «inmaduro» y cuya entrada subió de anillo pasa a `vencida`, para
   que la próxima corrida la vuelva a evaluar.
6. Commit `docs(radar): refresco de AAAA-MM` en una rama propia y PR con `/abrir-pr`. Si corre desde la rutina, abre el PR y no lo fusiona.

## Prompt · stack

> Actualizas el radar tecnológico del stack de un ERP de retail (3 tiendas + 1 taller textil en Perú; Next.js App Router + React + Supabase
> (Postgres, RLS, RPC security definer) + Tailwind v4 + Zod + TypeScript + Vitest + Sentry + pnpm/Turborepo, en Vercel; facturación electrónica
> SUNAT vía un PSE). Versiones actuales del repo: <pégalas>. El radar vigente es este archivo: <ruta>. Busca qué cambió desde su fecha en:
> Next.js, React, PostgreSQL, Supabase, Vercel, Tailwind, Zod, TypeScript, Vitest, Biome/Oxlint, pnpm, Turborepo, la plataforma web (View
> Transitions, Popover/Anchor, Container queries, Navigation API, WebUSB/WebHID/Web Bluetooth para impresoras y lectores, Barcode Detection,
> Speculation Rules, local-first) y la IA para construir y dentro del producto (Claude Agent SDK, MCP, AI SDK). Usa WebSearch (`extended` para lo
> reciente) y fuentes primarias. Conserva las entradas vigentes, corrige las que cambiaron de estado, agrega las nuevas y saca las que ya no
> aplican (dilo). Formato por entrada: Qué es · Versión / fecha · Anillo (ADOPTAR/PROBAR/EVALUAR/ESPERAR) y por qué · Dónde le serviría a este
> ERP · Costo o riesgo · Fuente (URL, fecha de publicación, «consultado AAAA-MM-DD»). Tabla resumen al inicio. Entre 35 y 60 entradas. Nunca
> pongas datos de la empresa en las búsquedas. Escribe en <ruta del scratchpad> y responde con lo que entró, subió, bajó y salió.

## Prompt · referentes

> Actualizas la mitad «referentes» del radar de innovación de un ERP de retail y manufactura textil en Perú (3 tiendas + 1 taller; punto de
> venta con boleta y factura de SUNAT, caja, cambios y devoluciones, apartados, inventario por sede, traslados, compras, catálogo con tallas y
> colores, producción, clientes y club, finanzas, colaboradores y metas, tienda online). El radar vigente es este archivo: <ruta>. Busca qué
> cambió desde su fecha en dos grupos: (A) retail y ERP, el QUÉ — Shopify POS y Admin (Editions, Sidekick), Square, Lightspeed, Odoo, NetSuite,
> Toast, Inditex (RFID) y POS/ERP latinoamericanos (Bsale, Defontana, Alegra, Siigo); (B) software de primer nivel, el CÓMO — Linear, Stripe,
> Vercel, Notion, Apple HIG, Ramp, Brex, Raycast, Superhuman. Una entrada por PATRÓN (no por empresa): Quién lo hace y cómo · Grupo · Anillo para
> 3 tiendas + 1 taller · Dónde encajaría en el ERP · Horizonte (ahora/visión) · Fuente (URL, fecha, «consultado AAAA-MM-DD»). Tabla resumen al
> inicio. Entre 30 y 50 patrones. Nunca pongas datos de la empresa en las búsquedas. Escribe en <ruta del scratchpad> y responde con lo que
> entró, subió, bajó y salió.

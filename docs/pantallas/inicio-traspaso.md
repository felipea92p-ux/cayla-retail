# Inicio — traspaso para seguir en otra cuenta (2026-09-21)

> Léelo junto con [`inicio.md`](inicio.md) (el diagnóstico completo) y [`../maquetas/inicio-referentes-2026-09/index.html`](../maquetas/inicio-referentes-2026-09/index.html) (las tres maquetas y la mezcla).
> Rama de trabajo: **`claude/inicio-hoy-por-atender`**. Nada de esto está en `main` ni tiene PR abierto: `main` no se toca hasta que Felipe lo decida.

## 1 · Qué se hizo

1. **Auditoría de `/` (Inicio)** con la skill `/pantalla`: `docs/pantallas/inicio.md`. Cumple su finalidad 5.1/10, relevancia 4.2/10 (Comodidad). 12 tareas. SQL de producción **parcial**.
2. **Demo de tres referentes** (Shopify POS, Lightspeed X-Series, Odoo) y una **mezcla propuesta por rol**: maqueta HTML en `docs/maquetas/inicio-referentes-2026-09/`. Los patrones se verificaron en documentación pública; no se vieron las pantallas reales de esos productos.
3. **Implementación en la app real** de la mezcla (commit `426c9d68`) y de las correcciones de la auditoría (`0b4d2074`).
4. **Servidor de demostración sin Docker** (`scripts/demo/`) para ver y probar la pantalla con datos falsos.

## 2 · Qué hace hoy el Inicio (según rol y ubicación)

Cuatro capas: **Hoy** (¿cómo voy?) → **Por atender** (¿qué me toca?) → **Ir a** (¿a dónde voy?) → **Actividad reciente**.

| Quien mira | «Hoy» | «Por atender» | «Ir a» |
|---|---|---|---|
| Líder · tienda | Ventas + «▲ N % vs. <día> pasado», valor medio, meta del día | Traslados por recibir | Vender, Caja (estado), Buscar |
| Colaboradora · tienda | «Tus ventas» y estado de la caja (sin cifras de la sede) | Traslados por recibir | Vender, Recibir, Buscar |
| Cualquiera en el Taller | No aparece (no vende) | Traslados por recibir | Producción, Recibir, Buscar |
| Cualquiera en un almacén | No aparece | Traslados por recibir | Recibir, Inventario, Buscar |

- Una lectura que falla **se dice** («No pude leer esto», «No se pudieron cargar…»), nunca se dibuja como 0.
- Se quitaron las tarjetas de conteo de catálogo (Productos/Variantes/Unidades) y la suma de stock en JS (tope silencioso de 1.000 filas).
- Fuentes reutilizadas (las mismas que Caja, para que no discrepen): `fn_ventas_del_dia`, `getVentasMismaHoraSemanaAnterior`, `ubicaciones.meta_venta_diaria`, `getCajaAbierta`, `getTrasladosPorAtender`.

**Archivos:**
- `apps/web/app/(app)/page.tsx` — la pantalla.
- `apps/web/lib/inicio-reglas.ts` — reglas puras (qué se muestra a quién) + `inicio-reglas.test.ts` (15 pruebas).
- `apps/web/lib/inicio.ts` — lectura de datos de «Hoy».

## 3 · Estado de las 12 tareas de la auditoría

| # | Tarea | Estado |
|---|---|---|
| 1 | Corregir rótulos y filtros de las tarjetas | ✅ hecha (y las tarjetas se retiraron después) |
| 2 | Bloque «Hoy» (ventas + caja) | ✅ hecha |
| 3 | Bloque «Por atender» | 🟡 **parcial**: solo traslados. Faltan SUNAT pendiente y compras por pagar |
| 4 | Decidir Inicio por rol y ubicación | ⏳ **decide Felipe**: la implementación asume la opción B de `inicio.md` §8 (un solo `page.tsx` con bloques por rol) |
| 5 | Quitar tarjetas duplicadas con el menú y celda gris | ✅ hecha |
| 6 | Acciones por rol y ubicación | ✅ hecha |
| 7 | Actividad legible (`etiquetaMovimiento`) | ✅ hecha |
| 8 | Degradar por bloque | ✅ hecha (actividad, «Hoy» y colas fallan por separado) |
| 9 | Suma de stock sin tope de 1.000 filas | ✅ resuelta al retirar la suma |
| 10 | Quitar «V2» y la sede repetida | ✅ hecha |
| 11 | Reglas en `lib/` con prueba | ✅ hecha |
| 12 | Corregir docs obsoletos | ⏳ pendiente: `docs/datos/11-KPIS.md:146` (`getPanelInicio`), BACKLOG ~línea 4554 (`lib/pendientes.ts`), comentario de `(app)/layout.tsx:15` |

## 4 · Lo que falta (por orden de valor)

1. **Colas SUNAT y por pagar en «Por atender».** Su lectura vive dentro de sus pantallas: hay que subirla a `lib/` (una sola definición de «pendiente») y sumarla a `colasInicio()`. Solo la líder ve dinero (`fn_puede_ver_dinero_de_compras`).
2. **«Hoy» del Taller** (órdenes por etapa). La maqueta lo muestra con cifras inventadas; no se construyó.
3. **Decisión de Felipe (#4)** sobre qué ve cada rol. Al decidirla, escribir el **ADR** (regla del repo: decisión estructural, ADR el mismo día) y actualizar `docs/BACKLOG.md` y `docs/BITACORA.md`. **No se han tocado** BACKLOG, BITACORA ni ADR en esta rama.
4. **Cerrar el SQL de producción de la auditoría** (sin resultado: A1, A2, B1, C1–C3, C5, C6, D1, D2, E1, E3, E4; ver `inicio.md`, «Qué quedó sin datos reales»). Ejecutados de a uno en el SQL Editor (muestra solo el último resultado por pegado).
5. **Verificar contra una base real** (Docker + `supabase start`, o el proyecto de producción con permiso explícito y solo lectura): la demo no prueba RLS ni las RPC.
6. Tarea #12 (docs).

## 5 · Cómo verlo funcionando

### A · Sin Docker (lo que se usó): servidor falso + app

1. `pnpm install` en la raíz.
2. Crear `apps/web/.env.local` (está ignorado por git):
   ```
   NEXT_PUBLIC_SUPABASE_URL=http://localhost:54399
   NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=demo-publishable-key
   ```
3. En una terminal: `node scripts/demo/supabase-falso.mjs`
4. En otra: `pnpm --filter web dev` (anota el puerto que imprime; si 3000 está ocupado, Next elige otro).
5. En el navegador, con la app abierta, poner la cookie de sesión de demostración desde la consola (F12):
   ```js
   const c = await fetch('http://localhost:54399/__mock/cookie').then(r => r.json());
   document.cookie = `${c.nombre}=${c.valor}; path=/; max-age=86400`; location.href = '/';
   ```
6. Cambiar de rol o provocar fallas abriendo (y recargando Inicio):
   - `http://localhost:54399/__mock/rol?r=lider` · `integrante` · `taller`
   - `http://localhost:54399/__mock/caja?abierta=0` (o `1`)
   - `http://localhost:54399/__mock/falla?que=ventas,traslados,movimientos` (vacío = todo bien)
7. Verificación por texto, sin depender de que el navegador esté visible: `node scripts/demo/verifica-inicio.mjs http://localhost:<puerto>/`

**Trampa conocida:** si la ventana del navegador está oculta (`document.visibilityState === "hidden"`), React no completa el intercambio de «Cargando…» y parece que la página no carga aunque el servidor la entregó entera. Es del navegador, no de la pantalla: usa `verifica-inicio.mjs` o pon la ventana al frente.

### B · Con Docker (camino oficial del README)

Docker Desktop abierto → `cp supabase/0000_local_stub_dynamic.sql.example supabase/migrations/0000_local_stub_dynamic.sql` → `npx supabase start` → pegar `API URL` y la clave pública en `apps/web/.env.local` → `pnpm dev` → `felipe@cayla.local` / `cayla-local` (líder) o `micaela@cayla.local` / `cayla-local` (integrante en TRU). El seed no trae las 164 variantes reales.

## 6 · Verificación hecha (2026-09-21)

- `pnpm --filter web typecheck` ✅ · `pnpm --filter web lint` ✅ · `pnpm --filter web test` ✅ (las 15 pruebas nuevas incluidas).
- Navegador real con el servidor falso, para líder, colaboradora, Taller, caja cerrada y cada falla simulada.
- **No verificado:** RLS, RPC reales, cifras reales, rendimiento con datos de producción.

## 7 · Avisos para quien continúe

- **`git` en Windows:** `scripts/datos/aviario.mjs` tiene `eol=lf` en el repo pero Windows puede dejarlo con CRLF; su `#!/usr/bin/env node` con `\r` rompe `lib/menu.test.ts` en vitest (falla al cargar, no por lógica). Arreglo local: `sed -i 's/\r$//' scripts/datos/aviario.mjs`. En el CI de Linux no pasa.
- **Caché de Next:** si `typecheck` falla con un error en `.next/dev/types/validator.ts`, es caché generada; se borra con `rm -rf apps/web/.next/dev/types`.
- **Migración de producción pendiente, no de Inicio:** `20260920160000_apartar_stock.sql` no está en producción (`stock.cantidad_apartada` no existe) y `main` ya la lee en Existencias/Apartar. Pegarla **antes** de desplegar la web (BACKLOG, «Apartar stock»). Inicio no la usa.
- **Producción:** al pegar SQL en el editor de producción va con prefijo `retail.` (ver CLAUDE.md); el archivo del repo no lo lleva.
- **Vocabulario:** colaborador/integrante, líder de equipo, sede/tienda; nunca «empleado/jefe/sucursal».
- **Datos personales:** el diagnóstico y las maquetas usan `[colaborador]`, «Ana Demo» y cifras ficticias. No agregar nombres ni montos reales a `docs/pantallas/`.

## 8 · Ramas

- `claude/inicio-hoy-por-atender` — **la de trabajo**: incluye el diagnóstico, las correcciones, la mezcla, las maquetas, `scripts/demo/` y este archivo, y está al día con `main` al 2026-09-21.
- `claude/inicio-correcciones-primer-grupo` y `claude/audit-skill-inicio-screen-e093bb` — sus cambios ya están dentro de la anterior; no hace falta subirlas.

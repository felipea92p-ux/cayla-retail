# Backlog · 2026-10-28 · Prompts para retomar las sesiones de `cayla-retail` que se quedaron sin créditos — rama `claude/prompts-sesiones-perdidas`

Solo documentación, sin migración ni cambio de código. Cuatro sesiones del grupo `cayla-retail` quedaron bloqueadas al acabarse los créditos de la cuenta que las llevaba. Su conversación no se pudo recuperar: de dos de ellas solo se conoce el título. Cada prompt de abajo es autocontenido para pegarse en una sesión nueva (la otra cuenta carga este `CLAUDE.md`).

**Lo que es hecho y lo que es hipótesis.** Los títulos de las sesiones salen de una captura de la barra lateral; el tooltip del bug del token estaba cortado. Lo que dice «hipótesis» no se verificó: la sesión nueva lo comprueba antes de actuar.

Antes de lanzar cualquiera: revisar `docs/SESIONES-ACTIVAS.md` por si otra sesión ya toca `registrar_movimiento_caja` o la producción.

- [ ] **1. «Problema de registro» / «Mismo token deshecho en registrar_movimiento…» (el más urgente: toca inventario y dinero).**

```
Repo cayla-retail. Antes de tocar nada lee docs/adr/0398-el-envio-sigue-al-contenido-y-los-candados-de-ventas.md y docs/adr/0190*.

Problema: en una sesión anterior (se perdió) se detectó que "el mismo token se deshace en registrar_movimiento…" (título cortado; probablemente registrar_movimiento_caja o similar).

Hipótesis a verificar, no dar por hecha: un reintento con el mismo p_token, tras un rollback o una respuesta perdida, borra o deja inválida la marca en intentos_con_token (ver `intentos_con_token`, `fn_resolver_intento`, estados `no_llego`, `intento_descartado`, `token_reusado`).

Pasos: (1) Reproduce en local con scripts/pruebas (pnpm pruebas:token-sigue-al-contenido es el modelo) un caso que falle. (2) Dime la causa raíz con archivo:línea. (3) Propón el arreglo y ESPERA mi OK: es dinero y es una RPC. (4) Con el OK: primero la prueba de regresión que falla, luego la migración (reserva el número con `pnpm reservar migracion`).

Reglas: no apliques nada a producción; las migraciones de producción se parten según "Políticas y deadlocks" del CLAUDE.md. Al abrir PR usa /abrir-pr.
```

- [ ] **2. «Pasos de limpieza y etiquetado»** (hipótesis: Taller / fases de la orden de producción).

```
Repo cayla-retail. Contexto perdido de una sesión anterior titulada "Pasos de limpieza y etiquetado". No sé qué avance tenía.

Primero investiga sin escribir código: busca en docs/adr (0361, 0400, 0509), docs/bitacora y supabase/migrations todo lo que hable de limpieza, etiquetado y fases de la orden de producción. Dime qué ya existe, qué falta y qué es ambiguo.

Luego hazme las preguntas que bloquean (máximo 5, con opciones Ganas/Pagas) antes de proponer pasos. No construyas hasta que yo apruebe la lista de actividades (usa /construir).
```

- [ ] **3. «Prenda invisible hasta terminarse y recibirse»** (hipótesis: cuelga de la 2; una prenda de producción no se ve ni se vende hasta que la orden esté terminada y recibida en sede). Conviene abrirla en la misma sesión que la 2.

```
Repo cayla-retail. Regla de negocio de una sesión anterior: una prenda de una orden de producción NO debe ser visible (catálogo, vitrina, Vender) hasta que la orden esté terminada Y recibida en sede.

Lee docs/adr/0361-modelo-nuevo-desde-la-orden-de-produccion.md y docs/adr/0371* (revisar prendas pendientes). Dime: (1) cómo se ve hoy una prenda en producción, con archivo:línea; (2) dónde se filtraría su visibilidad (RPC, RLS o web); (3) qué estados existen y cuál falta.

Principio 2 del CLAUDE.md: si el inventario puede quedar en estado imposible, se corrige el esquema, no se parcha en la web. Propón el diseño y espera mi OK antes de migrar.
```

- [ ] **4. «Reabrir D-31: el Taller como mayorista»** (decisión estratégica, no código).

```
Actúa como mi socio estratega, no como programador. Quiero reabrir la decisión D-31: el Taller de CAYLA (Lima) como canal mayorista, es decir, vender producción a terceros.

Busca primero en el repo (docs/decisiones, docs/adr, grep "D-31" y "mayorista") qué se decidió y por qué se cerró. Después dame 2–3 opciones con trade-offs reales (capacidad del Taller, margen vs. retail, riesgo para la marca, caja, SUNAT) y UNA recomendación.

Vigila mis sesgos: sunk cost en lo ya construido y perfeccionismo epistémico (no pidas certeza del 100% para decidir). No escribas código.
```

- [ ] **5. «Caja de Líder 26 de diciembre», «Crecimiento de cuenta», «Dame emojis»:** se desconoce su contenido. Plantilla para retomarlas, completando lo que se recuerde:

```
Repo cayla-retail. Retomo una sesión perdida titulada "<título>". Lo que recuerdo: <1–3 líneas>. Investiga el repo para ver qué ya existe, dime qué falta y pregúntame lo mínimo para avanzar.
```

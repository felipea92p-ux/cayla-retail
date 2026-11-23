---
paths:
  - "supabase/**"
  - "docs/datos/**"
  - "packages/database/**"
  - "scripts/datos/**"
---

## La base de datos: `/docs/datos/` (desde 2026-09-12)

El modelo de datos —los dos sistemas, campo por campo— vive en `/docs/datos/`.
Empieza por su `README.md`; el mapa conceptual es `00-MAPA.md` y los candados que la
base hace cumplir, `01-INVARIANTES.md`. Las 52 decisiones que lo gobiernan están en
`/docs/datos/DECISIONES-2026-09-12.md` y **mandan sobre el resto de esa carpeta**.

Está partido en dos mitades y funcionan distinto: `/docs/datos/generado/` lo escribe
un script leyendo la base real y **nadie lo edita a mano**; el resto explica el porqué
y se escribe a mano. Mezclarlas es lo que mató a los intentos anteriores.

**Regla de oro:** una migración no está terminada hasta que su tabla está en el
diccionario. Al cerrar un cambio de esquema, correr:

```
pnpm datos:generar:produccion   # reescribe el diccionario desde el volcado de producción
pnpm datos:comparar             # avisa si una pantalla llama a una función que producción no acepta
```

**Cuidado (aprendido el 2026-09-14): `pnpm datos:generar` a secas lee el Postgres LOCAL y
pisa los diccionarios con la foto de tu máquina** — DYNAMIC pasa de 63 tablas a las 2 del
stub y RETAIL deja de describir producción. Sirve solo para mirar un diff y volver atrás
(`git checkout -- docs/datos/generado/`), nunca para commitear. Una migración nueva entra
al diccionario cuando se aplica en producción y se refresca el volcado
(`generado/COMO-REFRESCAR.md`); mientras tanto vive en BACKLOG como "no está en producción".

`datos:comparar` cierra un hueco que ni `typecheck` ni `migraciones:verificar`
cubrían: el primero compara el código contra los tipos generados (que suelen estar
viejos) y el segundo el repo contra la base, pero ninguno compara **la pantalla contra
la base real**. Así estuvieron rotos en producción `registrar_gasto` y `recibir_lote`
sin que nada avisara.

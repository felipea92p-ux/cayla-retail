# Reconciliación de Permisos — Sesión 3 (PL-83..96) contra ADR-0161/ADR-0178

> **Fecha:** 2026-09-23 · Cierra el pendiente que el artefacto («El Aviario CAYLA») dejó abierto:
> pasar PL-83 a PL-96 uno por uno contra lo que `main` construyó y ya aplicó en producción
> el 22 y 23 de septiembre. Verificado contra producción en vivo (consultas de solo lectura).

## Qué cambió, en una línea

La Sesión 3 diseñó un sistema de 4 niveles fijos (D-12: Admin/Líder/Integrante/Solo lectura).
`main` construyó y aplicó algo distinto y más flexible: **roles a medida por módulo**, con
**Líder de equipo** como único rol fijo, un **escalón Admin leído directo de Dynamic** (sin
columna nueva), y **«Responsable» obligatorio** en cada operación de tienda. Ver `ADR-0161` y
`ADR-0178`.

## Decisión por decisión

| # | Decisión original (Sesión 3) | Estado hoy |
|---|---|---|
| PL-83 | Rol Admin como valor nuevo de `colaboradores.rol` | **Superada.** Admin se lee de Dynamic (`fn_es_admin()`): es quien ya es `admin` en Dynamic y Líder activo aquí. Cero columna nueva. |
| PL-84/85 | Corazón de la venta + `clientas`/`conteos`/`lotes` sin candado real | **Resuelta hoy**, fuera de esta reconciliación — ver `docs/plano/10-CIERRE-HUECO-VENTAS.md` si existe, o el commit `f2c27fe3`. |
| PL-86 | Segundo pegador de SQL: Dany | **Vigente, sin cambios.** Es un permiso de infraestructura (quién toca producción), eje distinto al de roles dentro de la app. |
| PL-87 | Checklist de SQL: ensayo + sonda + registro | **Vigente, sin cambios.** Mismo motivo que PL-86. |
| PL-88 | 4 niveles fijos de D-12 | **Superada.** Solo Líder de equipo es fijo; Integrante ya es editable como cualquier rol a medida (con la única restricción de no poder archivarse). «Solo lectura» ya no es un rol con nombre — se arma como un rol a medida que solo ve los módulos que necesita, lo cual es *más* flexible que la promesa original de D-12, no menos. |
| PL-89 | Líderes con alcance global → por sede, con fecha exacta tras el lanzamiento | **Vigente, sin cambios.** ADR-0161/0178 no tocan el alcance geográfico de un líder — solo redefinen qué puede hacer dentro de un módulo y quién administra a otro líder. Verificado: `fn_puede_operar_ubicacion(p_ubicacion_id uuid)` sigue existiendo igual. Sigue pendiente fijar la fecha exacta. |
| PL-90 | Cubrir otra sede con vencimiento — tabla `retail.coberturas` | **Vigente, sin cambios**, y el punto de integración sigue siendo válido: `fn_puede_operar_ubicacion` no cambió de forma. Sigue sin construir. |
| PL-91 | Tope de descuento: 5%/15%/liquidación sin tope | **Vigente.** «Autorizar sobre el tope» sigue siendo del líder — confirmado en B2b de ADR-0161. |
| PL-92 | Baja de acceso por Dynamic | **Vigente y verificado.** 23 personas cesadas sin acceso, no depende del sistema de roles nuevo. |
| PL-93 | Auditoría menú-vs-base, manual ahora + CI después | **Vigente, sin cambios.** Sigue siendo trabajo pendiente, independiente del modelo de roles. |
| PL-94/95 | «Quien pega SQL de su módulo también ve el negocio completo como Admin» | **Superada por completo.** Admin ya no es un círculo de confianza que alguien «gana» por tener acceso técnico — es una identidad leída de Dynamic, con 5 personas hoy (Felipe, Catherine, Dante, Carlos, Lizzelott), **la mayoría de las cuales nunca pegan SQL**. Pegar SQL en producción (PL-11/86/87) y ser Admin en la app (ADR-0178) son ejes completamente separados en el sistema real — lo contrario de lo que decidió la Sesión 3. Bitácora de SQL (tabla `sql_aplicado` + PR) sigue pendiente de construir, sin relación con Admin. |
| PL-96 | Función `security definer` para ascender/bajar rol | **Superada, y ya construida mejor de lo que se pidió.** `asignar_rol`, `guardar_modulos_rol`, `crear_rol` existen, con tres protecciones que la Sesión 3 no había previsto: nunca queda un rol Líder sin nadie, un no-líder nunca toca a un líder, y desde ADR-0178 solo un Admin puede subir a alguien a Líder o tocarle el acceso a un líder existente. |

## Lo nuevo que la Sesión 3 no pudo prever

- **«Responsable» obligatorio** en Ventas, Caja, Cambios, Devoluciones, Facturación, Inventario,
  Traslados y Catálogo — una persona real, presente hoy en esa sede (verificado contra
  `public.marcajes`/`public.jornadas` de Dynamic), elegida en cada operación que guarda. Compras,
  Producción, Colaboradores y Configuración siguen firmando con quien inició sesión.
- **«Solo das lo que tienes»** — nadie enciende, en un rol, un módulo que no ve; nadie asigna un
  rol con más de lo que tiene; nadie edita los módulos de su propio rol.
- **El rol a medida «Administrador» que se había creado el 22-sep se archivó** el mismo 23,
  para no confundirlo con el escalón Admin real.

## Qué queda pendiente, sin cambios por esta reconciliación

- PL-89: fecha exacta para acotar a los líderes por sede.
- PL-90: construir `retail.coberturas`.
- PL-93: la auditoría manual completa de qué tabla depende solo del menú.
- La bitácora de SQL (`retail.sql_aplicado`, PL-95) — sigue sin existir.

## Fuentes

`docs/adr/0161-responsable-por-operacion-y-retome-de-roles.md` ·
`docs/adr/0178-escalon-admin-desde-dynamic-y-solo-das-lo-que-tienes.md` ·
decisiones originales: `docs/plano/04-ACTA-SESION-3.md`, Bloque A.

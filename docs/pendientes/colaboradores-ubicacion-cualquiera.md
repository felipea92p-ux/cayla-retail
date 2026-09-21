# Pendiente — «Cualquier ubicación» para personas que no son líder (Colaboradores)

> Estado: **sin decidir, sin construir.** Nota de traspaso para retomarlo en otra sesión. Escrita el 2026-09-22 desde la rama `claude/colaboradores-rediseno` (PR #244, ADR-0148). Todo lo que diga «verificar» no lo leí todavía en el código: no lo des por cierto.

## Lo que pidió Felipe

En la pantalla `/colaboradores`, poder elegir **«cualquier ubicación»** (no solo una sede fija) para personas de **Espacio y Desarrollo, CCO u oficina** que **no deben ser líder**. Hoy «cualquiera» solo aparece en los líderes. Felipe preguntó «cómo manejamos ese caso»: tiene la idea de que en el selector de ubicación haya una opción «cualquiera», como ya se muestra para algunos miembros, pero no eligió un modelo.

Respuestas que dio a mis preguntas (textuales, resumidas):
- **Alcance:** «que haya la opción de que en la sede haya la opción de cualquiera, como está actualmente para algunos miembros». No eligió una de las 4 opciones de abajo.
- **Cómo se decide quién:** «de momento no lo realizaremos» → no construir todavía ni la regla automática ni la manual.
- **Migración `20260922110000`:** no contestó si ya la pegó en producción. **Preguntárselo antes de escribir SQL** (si ya está pegada, todo va en una migración nueva; si no, se puede editar esa misma).

## Cómo funciona hoy (verificado en esta sesión, salvo lo marcado)

- `retail.colaboradores.rol` es `lider` o `colaborador` (CHECK). Un colaborador **siempre** tiene ubicación fija: `colaboradores_colaborador_con_ubicacion` = `rol = 'lider' or ubicacion_asignada_id is not null` (migración `20260922100000`, ya en producción).
- «Cualquiera» no es un valor guardado: es lo que **se muestra** cuando `rol = 'lider'` (`ColaboradoresTablas.tsx`, constante `cualquiera`). Un líder no tiene `ubicacion_asignada_id`; su ubicación sale de su sede base en Dynamic (`fn_ubicacion_actual_persona`, `0016_roles_colaborador.sql`).
- Un líder opera en todas las sedes **y** trae todos los poderes: cerrar caja, ajustar stock (ADR-0143), ver el dinero de compras, gestionar accesos. Hoy hay 9 líderes, incluidos algunos de «Oficina TRU» y «Central».
- La pantalla **no permite asignar Líder** (`agregar_colaborador` siempre inserta `colaborador`; decisión de `0016`). Los líderes actuales salieron de un backfill.
- En el modal de alta, cada cuenta muestra su **sede en Dynamic** (p. ej. «Oficina TRU») y el desplegable de ubicación lista las ubicaciones de retail (Taller, Tienda AQP, Tienda LIM, Tienda TRU). Son dos vocabularios distintos: **verificar** cuáles de «Espacio y Desarrollo» y «CCO» son sedes/áreas en `public.sedes` de Dynamic (el doc `docs/datos/modulos/01-identidad-y-acceso.md` lista TRU, AQP, 003, LIM, CCO, OTRU, pero es de V1).
- **Verificar leyendo:** `fn_puede_operar_ubicacion` (definida en `0006_colaboradores.sql`, redefinida después), `fn_persona_actual_resumen` (`0009`, alimenta `requirePersonaActualV2` en `apps/web/lib/persona-actual.ts`, que usa `es_lider` para el selector de ubicación y la cookie `cayla_ubicacion_activa`), y las dos migraciones que leen `colaboradores` a mano: `20260914220001_stock_por_sede.sql` y `20260914231015_registrar_venta_piso_con_nota.sql`.

## El problema de fondo

Hoy «dónde puede operar» y «qué puede hacer» están pegados en el rol Líder. Felipe quiere gente con **alcance amplio y poderes de colaborador**. Hay que separar las dos cosas o inventar un atajo.

## Las cuatro opciones que le presenté

1. **Alcance separado del rol (mi recomendación).** Nueva columna, p. ej. `alcance` (`una_ubicacion` | `todas`) en `colaboradores` y `colaboradores_suspendidos`. Un colaborador con `todas` opera en cualquier sede pero **no** cierra caja, ajusta stock ni ve dinero (esos candados siguen en `fn_es_lider()`).
   - Ganas: acceso amplio sin regalar el dinero; el historial ya sabe registrar el cambio.
   - Pagas: toca el núcleo del acceso. Habría que revisar `fn_ubicacion_actual_persona`, `fn_puede_operar_ubicacion`, `fn_persona_actual_resumen`, `fn_mi_perfil`, las dos migraciones que leen `colaboradores` a mano, el CHECK de ubicación (pasaría a `rol = 'lider' or alcance = 'todas' or ubicacion_asignada_id is not null`) y `requirePersonaActualV2` (hoy el selector de ubicación depende de `es_lider`). Es exactamente el riesgo que ADR-0148 evitó al suspender.
2. **Que sea Líder y listo.** Permitir elegir el rol Líder al agregar. Ganas: solo pantalla y una RPC. Pagas: cada persona de oficina recibe además cerrar caja, ajustar stock y ver dinero.
3. **Solo mirar en todas las sedes.** Lectura global sin escritura. Ganas: el más seguro. Pagas: hay que clasificar cada pantalla en lectura o escritura; el cambio más grande.
4. **Seguir fijos, con una ubicación «Oficina central»** sin stock ni ventas. Ganas: no cambia el modelo. Pagas: no ven las demás sedes; es un parche de nombre.

## Decisiones que faltan (de Felipe)

- ¿Cuál de las 4? (o una quinta).
- ¿Qué áreas exactas tienen alcance amplio (Espacio y Desarrollo, CCO, oficina…) y **qué pueden hacer**: ¿registrar ventas en cualquier sede? ¿solo ver? ¿mover stock?
- ¿Quién decide el alcance: a mano al agregar / cambiar, o sugerido por su sede en Dynamic? (dijo «de momento no»).
- Si un líder de hoy debería pasar a «colaborador con alcance amplio» (ver la decisión pendiente de los 9 líderes en `docs/pantallas/colaboradores.md`, sección 10).

## Si se construye la opción 1: qué tocar y cómo probar

- **Base:** migración nueva (o edición de `20260922110000` si sigue sin pegar); ampliar los RPC `agregar_colaboradores` / `cambiar_ubicacion_colaborador` para aceptar «todas»; el historial ya guarda ubicación anterior y nueva (habría que decidir cómo se anota «todas»).
- **Pantalla:** `CambiarUbicacionModal` y `AgregarColaboradoresModal` (`apps/web/components/ColaboradoresModales.tsx`) ofrecerían «Cualquier ubicación» junto a las sedes; `ColaboradoresTablas.tsx` mostraría «cualquiera» según `alcance`, no según `rol`; la tarjeta «Líderes: operan en cualquier ubicación» dejaría de ser cierta para ese texto.
- **Prueba:** la migración de `20260922110000` se probó con 67 comprobaciones en **PGlite** (Postgres en WASM), sin Docker, con un esquema mínimo que imita producción. Ese script no está en el repo (vivió en el directorio temporal de la sesión); habría que rehacerlo o correr `scripts/pruebas/` con Docker. Para esta opción, la prueba clave es: un colaborador con alcance `todas` **no** puede llamar `cerrar_caja` ni `registrar_movimiento` de ajuste (42501), y un colaborador de una sola ubicación sigue sin poder operar otra sede.
- **Orden de despliegue:** migración en producción primero, web después (como en ADR-0148).

## Para empezar la próxima sesión

1. Leer ADR-0148, ADR-0143, `docs/pantallas/colaboradores.md` y este archivo.
2. Preguntar a Felipe las decisiones de arriba (una sola pregunta corta cada una, con sus Ganas/Pagas).
3. Confirmar si la migración `20260922110000` ya está en producción.
4. Leer las funciones marcadas «verificar» antes de proponer el diseño final.

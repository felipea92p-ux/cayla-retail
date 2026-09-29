## 2026-09-29 (Módulo Rendimiento, primera mitad — ADR-0219, con contracción de Efron-Morris)

**QUÉ HICE:** construí la primera mitad del módulo Rendimiento que ADR-0219 dejó diseñado y aprobado por Felipe
(las 20 decisiones del 2026-09-26) pero sin código: el módulo, quién ve qué tienda, la lectura del equipo del mes y
la pantalla `/rendimiento` con los dos rankings («vende más por hora» y «cierra más ventas»). Le agregué una
corrección que el ADR no tenía: el ranking de soles por hora ya no ordena por el número crudo de cada integrante,
sino por un número corregido estadísticamente (contracción de Efron-Morris/James-Stein) que pesa menos la suerte de
un mes corto.

**POR QUÉ ASÍ:** con 12 integrantes en TRU y 2 en AQP, una integrante con pocas horas y un golpe de suerte podía
salir primera en el ranking aunque su número no dijera nada confiable de ella — el propio ADR ya lo sabía (la marca
«muestra chica» a menos de 40 ventas, D-66) pero solo avisaba, no corregía el orden. La corrección «encoge» el
número de cada persona hacia el promedio del RESTO de su tienda (sin ella misma, para que no se «esconda detrás» de
su propio número bueno), tanto menos cuanto más horas tenga trabajadas. La fuerza de esa corrección no se inventó:
se ancló al umbral que Felipe ya había decidido (40 ventas = muestra chica), en vez de estimar un parámetro nuevo de
los datos —que con 2 integrantes en AQP habría sido puro ruido—.

**QUÉ SE ROMPERÍA SIN ESTO:** el ranking de «vende más por hora» premiaría, la mayoría de los meses, a quien tuvo
menos horas y una racha corta, no a quien de verdad vende mejor sostenidamente — exactamente lo que Felipe pidió
evitar con «reconocer y acompañar» (D-112: sin dinero, sin caos).

**Cómo se verificó:** 7 pruebas nuevas en `rendimiento-reglas.test.ts` (incluida la propiedad central: con
evidencia muy dispareja, una integrante con un mes sostenido normal termina ordenada adelante de una con un mes
corto y un golpe de suerte). Toda la batería del repo en verde (228 archivos, 152.707 pruebas), typecheck y lint
limpios. La migración (`20260929160000_rendimiento_modulo_y_equipo.sql`) se verificó a mano contra el esquema real
de producción —cada función y columna que referencia existe tal cual, confirmado con `select` de solo lectura—,
pero **no se corrió de punta a punta en una base local**: este worktree no tiene el stub de Dynamic para
`supabase db reset` (ver `postgres-desechable-sin-docker.md`). Queda como paso pendiente antes de pegarla.

**Qué falta (no bloquea lo de hoy):** las demás cifras de la tabla del ADR (ticket promedio, % a precio completo,
descuento, cuadre de caja, bajada al piso), la ficha de cada persona, la corrección de quién atendió una venta
(`venta_reasignaciones`/`reasignar_asesora`, con su objeción abierta sobre que la encargada se corrija a sí misma) y
el selector de mes. Ver la actualización del 2026-09-29 en `docs/adr/0219-rendimiento-ventas-de-cada-persona.md`.

**De paso:** `fn_exigir_rol_de_terminal` le faltaba `cayla_global` en su lista de «solo personas» desde ADR-0275
(20260929140000) sin que nadie lo notara — se corrigió junto con sumar `rendimiento`.

**Rama:** `claude/rendimiento-efron-morris`, sin PR todavía. **Migración:** `20260929160000` (código listo, sin
pegar en producción — pide el ok puntual de Felipe, más probarla en una base desechable primero).

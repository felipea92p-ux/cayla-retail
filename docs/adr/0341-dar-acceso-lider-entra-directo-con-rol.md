# ADR-0341 — Dar acceso: lo que da un líder entra directo, y con su rol

- Fecha: 2026-10-05
- Estado: aceptado (Felipe, 2026-10-05: «que entre directo, sigue con Dar acceso»)
- Entrega 2 de 4 del rediseño de Colaboradores (después de ADR-0340). Modifica D-70 (ADR-0157).

## Problema

Toda alta quedaba «pendiente de aprobación» aunque la diera un líder. El mismo líder podía aprobarla un segundo después: dos
clics de la misma persona, sin ningún control real. Además la persona entraba siempre como Integrante, y había que abrir otra
pantalla para cambiarle el rol. El modal «Agregar colaboradores» no tenía guía de foco.

## Decisión

1. **Si quien da el acceso es líder, la persona entra activa en el acto.** Si lo da alguien con el módulo Colaboradores sin ser
   líder, queda pendiente hasta que un líder la apruebe. Esa parte de D-70 se mantiene: quien no es líder no mete a nadie solo.
2. **El rol se elige al dar el acceso** (`p_rol_id`, opcional; sin él entra como Integrante, como antes). La base aplica las
   mismas reglas que `asignar_rol`:
   - no se da un rol archivado;
   - «solo das lo que tienes» (`fn_exigir_rol_dentro_de_lo_mio`);
   - **el rol Líder no se da al entrar**: lo sube después un Admin, desde la ficha.

   El rol con que entró queda en `roles_historial` (`asignacion`, con `al_dar_acceso`), y Actividad lo cuenta como
   «le dio el rol … a …».
3. **«Dar acceso» es una hoja con guía de foco** (`components/colaboradores/DarAccesoModal.tsx`, reglas en
   `lib/dar-acceso-reglas.ts` con su prueba):
   - Cuatro bloques: ¿Quién? (varias personas, con foto), ¿Dónde trabaja?, ¿Qué hace? (cada rol con sus módulos) y quién lo da.
   - Una frase final resume el alta antes de confirmar: «Camila Rojas entra a Tienda AQP como Ventas.», o «…quedará en …,
     esperando el ok de un líder.» si quien la da no es líder.
   - Nada viene elegido de antemano (auditoría de /colaboradores, tarea #1).
   - El botón dice «Dar acceso», o «Pedir acceso» si quien la da no es líder.

## Base

Migración `20261005190000_dar_acceso_lider_entra_directo_con_rol.sql`, de una sola parte (sin políticas ni `alter`). Parte de la
definición REAL de producción del 2026-10-05.

Suelta las firmas viejas `agregar_colaborador(uuid, uuid)` y `agregar_colaboradores(uuid[], uuid)` y crea las de tres
parámetros. Con un `create or replace` con otra lista de parámetros quedaría una sobrecarga y la llamada sería ambigua.

La web de hoy sigue funcionando con la migración pegada, porque llama por nombre y sin `p_rol_id`. La web nueva NO funciona sin
ella. Por eso **se pega antes de fusionar**.

## Cómo se verificó

- `scripts/pruebas/colaboradores_alta_requiere_aprobacion.mjs`: 15 casos en verde contra Postgres, cada uno en una transacción
  con ROLLBACK. Entre ellos:
  - el alta de un líder entra activa y opera su sede sin aprobar;
  - sin rol elegido entra como Integrante, y con rol queda en la fila y en el historial;
  - el rol Líder se rechaza;
  - queda una sola firma de cada función;
  - las dos migraciones se pueden pegar dos veces.
- `roles_por_modulo.mjs` suma la comprobación de que el alta de una integrante con el módulo queda `pendiente_aprobacion`.
- `lib/dar-acceso-reglas.test.ts`: 8 casos.
- En el navegador, con datos inventados, a 1280 px y a 375 px: la guía enciende el bloque que sigue, la frase final aparece, y
  al confirmar sale el aviso «Camila Rojas ya puede entrar a retail».

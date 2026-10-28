# ADR-0340 — Colaboradores ▸ Equipo: una lista por sede y una ficha al costado

- Fecha: 2026-10-05
- Estado: aceptado (Felipe, 2026-10-05: «empieza por Equipo y la ficha»)
- Propuesta de origen: artefacto «Colaboradores CAYLA, rediseño» (pantallas 1 y 2), hecho a pedido de Felipe con el mismo
  formato que la propuesta de Existencias de Diego. Es la entrega 1 de 4; las otras (Dar acceso, Roles y qué ve, Aparatos y
  Actividad) esperan su turno.

## Problema

Para llegar a una persona en `/colaboradores` había que pasar por 8 vistas: dos secciones, Personas o Terminales y cuatro
estados (Activas, Por aprobar, Suspendidas, Inactivas en Dynamic). Cada estado era otra tabla con otras columnas (7 en la de
activas), y las acciones de cada persona vivían en un menú «⋯» que abría un modal por acción. Para saber qué veía alguien
había que juntar el nivel (Líder o Integrante), el nombre del rol, si era Admin y la diferencia entre «Ubicación asignada» y
«Sede en Dynamic».

## Decisión

1. **«Cuentas» pasa a llamarse «Equipo» y es UNA lista agrupada por sede** (`components/colaboradores/EquipoLista.tsx`,
   reglas en `lib/equipo-reglas.ts` con su prueba). Primero los líderes sin sede fija («Todas las sedes»), luego cada sede en
   el orden de las ubicaciones y, al final, «Baja en Dynamic». Dentro de cada sede: líderes, integrantes por nombre,
   suspendidos y, al final, los aparatos. Arriba van atajos con su número (Todas, cada sede, Suspendidos, Aparatos) y un
   buscador sin tildes por nombre, correo o rol.
2. **El estado es una marca sobre la persona, no una pestaña.** Suspendido es un chip ámbar.
3. **Quien fue dado de baja en Dynamic se muestra como suspendido** (Felipe, 2026-10-05: «si Dynamic dio de baja entonces en
   el retail debería aparecer como suspendido»), con la nota «baja en Dynamic» y sin acciones: reactivarlo en retail no le
   devuelve la entrada. Va en su propio grupo porque `fn_colaboradores_inactivos` no devuelve en qué sede de retail estaba.
   Para ponerlo en su sede habría que cambiar esa función (migración); no se hizo.
4. **Un solo rótulo de acceso: el rol.** El Líder es un rol más, en tinta. «Admin» va en letra chica solo donde aplica.
   Sin los roles leídos (quien mira no tiene Roles y accesos), la pastilla dice el nivel, como antes.
5. **Punto verde = de turno hoy** (asistencia de Dynamic, `fn_asesoras_de_turno` por sede, tolerado sede por sede).
   Reemplaza las columnas «Desde» y «Último ingreso»; el último ingreso queda como texto corto («hoy 09:12», «ayer 18:05»).
   No se usó el último ingreso para el punto: una sesión abierta ayer que sigue viva hoy no vuelve a «ingresar».
6. **«Esperan tu ok»** reemplaza la pestaña «Por aprobar»: sale solo si hay altas pendientes, con Aprobar y No en la misma
   fila. «No» pregunta una vez. La regla D-70 no cambia (la decisión 1 de la propuesta, «el alta de un líder entra
   directo», sigue pendiente de Felipe).
7. **La ficha al costado** (`components/colaboradores/FichaColaborador.tsx`, cajón como el de Existencias, sin velo):
   - Una frase arriba que dice lo importante.
   - Tres botones a la vista: Cambiar rol, Cambiar sede y Suspender (en una suspendida, Reactivar). Cada uno abre su panel
     ahí mismo.
   - **Cambiar rol muestra la diferencia antes de confirmar** («+ Conteos · Punto de venta» tachado) y el menú tal como
     quedará. Avisa si un Admin deja de serlo al bajar de Líder y pide la sede si un líder sin sede baja de rol: las mismas
     reglas de `AsignarRolModal` (`pideUbicacion`, `debeAvisarPerdidaAdmin`).
   - **Lo reversible no pregunta, trae «Deshacer»** (7 s): suspender ↔ reactivar, cambiar sede y cambiar rol. Deshacer es
     otra llamada a la misma RPC, que queda en el historial (que sigue siendo solo de agregar).
   - Solo «Quitar acceso» pregunta, una vez y en rojo.
   - Abajo, «Así ve el sistema»: su menú armado con `menuConCambios` (el mismo árbol de `lib/menu.ts` que el lateral).
8. **La palabra sigue siendo «Suspender»** (Felipe, 2026-10-05, ante la propuesta de «Pausar»).
9. **Cabecera `EncabezadoPagina`** (Felipe, 2026-10-05): «Toda CAYLA» arriba, el título «Colaboradores», su frase y, a la
   derecha, Actividad y «+ Dar acceso». Colaboradores no tenía cabecera decidida (CLAUDE.md, «Paleta y orden de pantalla»).
10. **Roles y accesos pierde «Comparar roles»** (Felipe, 2026-10-05: «no le veo mucha funcionalidad»). Queda el editor por rol.

## Qué no cambia

Ninguna RPC, permiso ni tabla. `accionesDeFila`, `fueraDeAlcance`, `soyAdmin` y `misModulos` deciden lo mismo que antes, y
cada RPC lo vuelve a exigir en la base. Los enlaces viejos `?pestana=` siguen llevando al mismo lugar: `terminales` abre el
atajo Aparatos, y `suspendidos` e `inactivas` abren Suspendidos. Los aparatos siguen con su vista de siempre
(`TerminalesPanel`), detrás del atajo «Aparatos». Esa vista se rehace en la entrega 4.

## Se fue

Las tablas `TablaActivos`, `TablaPendientes`, `TablaSuspendidos` y `TablaInactivas`, y los modales `SuspenderModal`,
`CambiarUbicacionModal` y `QuitarAccesoModal`. Con ellos se fueron las reglas `filtrarColaboradores`, `resumirAccesos`,
`porAtender` y `ultimoAccesoTexto`, junto con sus pruebas. También la matriz de `RolesPanel`.

## Cómo se verificó

- `lib/equipo-reglas.test.ts` (15 casos).
- La suite completa en verde (346 archivos).
- Una página temporal con datos inventados, recorrida en el navegador a 1280 px y a 375 px (sin scroll lateral): cambiar
  rol con la diferencia y el aviso con «Deshacer», la ficha de una suspendida, el panel de suspender y la franja «Esperan
  tu ok».
- Falta verla con una cuenta real de líder y de alguien con el módulo sin ser líder.

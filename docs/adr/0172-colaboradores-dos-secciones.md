# ADR-0172 · Colaboradores en dos secciones y editor de roles rediseñado

- **Fecha:** 2026-09-22
- **Estado:** Aceptado (Felipe aprobó el spike el 2026-09-22)
- **Spike:** `docs/maquetas/colaboradores-ux-spike-2026-09/` (PR #313)
- **Relacionados:** ADR-0161 (roles «ve / no ve»), ADR-0162 (terminales), ADR-0136 (modales), ADR-0149 (loader)

## Contexto

`/colaboradores` tenía 7 pestañas (Activos, Terminales, Roles y accesos, Pendientes, Suspendidos, Inactivas en Dynamic,
Actividad) y 4 tarjetas de cifras arriba. Las pestañas mezclaban cuatro cosas distintas: **estados de una misma lista**
de personas, **un tipo de cuenta** (terminales), **la configuración** (roles) y **un historial** (actividad). Tres solían
estar en 0 y aun así ocupaban lugar; las altas por aprobar quedaban escondidas en su pestaña.

En «Roles y accesos», la lista de roles no avisaba nada (Integrante: 0 módulos, 16 cuentas), cuatro botones del mismo
peso competían con el editor, la tabla «Módulo / Lo ve» era larga y la vista previa no decía qué cambiaba.

## Decisión

**Dos secciones y un modal** (`vistaDe` y `porAtender` en `lib/colaboradores-reglas.ts`):

- **Cuentas**: Personas / Terminales, y las personas filtradas por estado (Activas, Por aprobar, Suspendidas, Inactivas en
  Dynamic) con su número; los estados en 0 se ven apagados. Se reusan las tablas de siempre: no se mezclaron personas y
  terminales en una sola tabla porque tienen columnas y acciones distintas (una terminal no tiene correo, ni sede de Dynamic,
  ni «Suspender»).
- **Por atender**, arriba de Cuentas, solo si hay algo: altas por aprobar (ámbar) y cuentas inactivas en Dynamic. Con todo
  en 0, una línea «Nada por atender».
- **Roles y accesos**: segunda sección; su resumen avisa si un rol deja cuentas solo en Inicio.
- **Actividad** sale de las pestañas: botón en la cabecera que abre `<Modal>` (se consulta, no se trabaja ahí).
- Las 4 tarjetas de cifras se van: sus números viven en el resumen de cada sección y en los chips de estado.
- El rol de una fila en Cuentas es un enlace: abre ese rol en Roles y accesos.
- `?pestana=` de antes sigue funcionando: `pendientes` abre Cuentas ▸ Por aprobar, `actividad` abre el modal, etc.

**Editor de roles** (funciones puras nuevas en `lib/roles-reglas.ts`, con pruebas):

- Lista de roles agrupada (`familiaDeRol`: del sistema / terminales / a medida), con barra de módulos y aviso
  (`avisoDelRol`: «Solo Inicio», «Sin uso»).
- Una acción principal (Asignar) y el resto en «⋯». Quién tiene el rol: iniciales + «N cuentas tienen este rol →», que abre
  un modal con buscador (máx. 8 a la vista).
- Módulos en grupos plegables con mini-mapa, «x de y», «Encender todo» (`alternarGrupo`, nunca mete un módulo que no se
  delega) y buscador por lo que incluye (`modulosFiltrados`).
- El borrador marca «Se suma / Se quita» (`cambiosDelBorrador`), la vista previa del menú resalta lo que cambia
  (`menuConCambios`, sobre el mismo `menuDelRol` que arma el menú real) y alterna Tienda / Taller; la barra de guardado es
  `BarraFija` («N cambios · afecta a N cuentas»).
- **Comparar roles**: matriz módulo × rol. Cada clic guarda al instante con la misma RPC `guardar_modulos_rol`.

## Lo que no se hizo (y por qué)

- **Asignar a varias cuentas a la vez**: el spike lo mostraba; `asignar_rol` recibe una cuenta y, al bajar a un líder, pide
  su sede. El modal de hoy (con buscador, PR #301/#302) se mantiene. Sumarlo es otra decisión.
- **Actividad como panel lateral**: el spike lo dibujaba a la derecha; se usó `<Modal>` para no crear otro overlay (ADR-0136).

## Consecuencias

Sin migraciones ni RPC nuevas. `PESTANAS_COLABORADORES`/`pestanaDe` se reemplazan por `vistaDe`.

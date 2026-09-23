# Spike UX · Colaboradores y Roles y accesos (2026-09-22)

`colaboradores-ux.html` (abre en Cuentas; `#roles` abre en Roles) — autocontenido, ábrelo en el navegador. Datos inventados; el catálogo de módulos y la lista
«siempre solo del líder» son los de `apps/web/lib/modulos.ts`. **No es implementación**: no toca `RolesPanel.tsx` ni la base.

**Aprobado por Felipe el 2026-09-22 para construirse.**

Parte de la captura de producción de la pestaña (Colaboradores ▸ Roles y accesos) y ataca lo que la hacía difícil de leer.

## 1. Las 7 pestañas pasan a 2 secciones + un cajón

Hoy: Activos · Terminales · Roles y accesos · Pendientes · Suspendidos · Inactivas en Dynamic · Actividad. Mezclan
**estados de una misma lista** (Activos, Pendientes, Suspendidos, Inactivas), **un tipo de cuenta** (Terminales),
**configuración** (Roles) y **un historial** (Actividad). Y 3 de las 7 suelen estar en 0.

| Antes | Ahora |
|---|---|
| Activos, Terminales, Pendientes, Suspendidos, Inactivas en Dynamic | **Cuentas**: una sola tabla con buscador, Todas / Personas / Terminales, ubicación y chips de estado con su número (en 0 se ven apagados) |
| Pendientes e Inactivas escondidas en su pestaña | **Por atender** arriba de la tabla, solo si hay algo: «2 altas esperan tu aprobación → Revisar». Todo en 0: «✓ Nada por atender» en una línea |
| Aprobar / Rechazar en otra pestaña | En la misma fila, al filtrar «Por aprobar» |
| Roles y accesos | **Roles y accesos**, segunda sección; su subtítulo avisa «1 deja cuentas solo en Inicio» |
| Actividad (pestaña) | Botón **Actividad** en la cabecera → cajón lateral con línea de tiempo por día y filtros. Se consulta, no se trabaja ahí |
| 4 tarjetas de KPI | Los números viven en el subtítulo de cada sección y en los chips de estado |
| El rol de una cuenta era texto | Chip de rol clicable en cada fila → abre ese rol en Roles y accesos |

Con más de 12 filas: «Mostrando 12 de N. Busca o filtra…». Para construirlo, `PESTANAS_COLABORADORES`
(`lib/colaboradores-reglas.ts`) pasa a `cuentas | roles`, y las URL viejas (`?pestana=pendientes`) redirigen a `cuentas` con ese filtro.

## 2. Roles y accesos: qué cambia y por qué

| Problema en la pantalla actual | Propuesta del spike |
|---|---|
| Los 4 KPI (Con acceso, Líderes…) ocupan la primera pantalla y no hablan de roles | Se quedan en Activos; aquí la cabecera es solo título + pestañas |
| Párrafo de 3 líneas para explicar cómo funciona | 3 ideas numeradas de una línea (rol = módulos · una cuenta, un rol · lo siempre del líder) |
| Lista de roles plana; «Integrante · 0 módulos · 16 cuentas» no alarma | Roles agrupados (Del sistema / Terminales / A medida), medidor de módulos y chip «Solo Inicio» / «Sin uso» |
| Chip tachado «Nadie tiene este rol» | Avatares de quién lo tiene + «16 cuentas tienen este rol →», o «Ninguna cuenta lo tiene todavía» |
| 4 botones del mismo peso (Asignar, Renombrar, Duplicar, Archivar) | Una acción principal (Asignar a cuentas) y el resto en «⋯», cada una con su motivo si está bloqueada |
| Tabla «Módulo / Lo ve» larga, sin descripción | Grupos plegables con mini-mapa (■■□□), «3 de 7», «Encender todo» y lo que incluye cada módulo |
| Módulos bloqueados mezclados con interruptores apagados | Candado punteado con texto: «Solo líder» / «Solo líder por ahora» |
| No se sabe si un interruptor ya guardó | Borrador: cada cambio se marca «Se suma / Se quita» y aparece una barra «8 cambios · afecta a 16 cuentas · Descartar / Guardar» |
| «Así queda su menú» mostraba solo texto | Lateral oscuro como el real, con lo que se suma en verde y lo que se quita tachado; alterna Tienda / Taller (Producción) |
| Sin forma de ver todos los roles a la vez | Vista «Comparar roles»: matriz módulo × rol, editable con un clic |
| Buscar un permiso exige leer todo | Buscador por módulo o acción («anular», «stock») |
| «Asignar» listaba todas las cuentas con casillas: con 100 cuentas el modal crece sin fin | **Buscar primero**: el modal tiene alto fijo, sin texto solo sugiere 3 cuentas que hoy solo ven Inicio, con texto muestra máx. 6 resultados («y N más, sigue escribiendo»); las elegidas quedan como fichas dentro del buscador; teclado ↑ ↓ Enter ⌫ Esc; filtros Todas / Personas / Terminales; pie «Dejan: Integrante (2)» antes de confirmar |
| «Ver cuentas del rol» también listaba todo | Mismo patrón: buscador + 8 como máximo |

## Cómo probarlo

0. En **Cuentas**: «Revisar» → Aprobar una alta; clic en el chip de rol de una fila → salta a ese rol; botón **Actividad** arriba.
1. Elige **Integrante**: sale el aviso ámbar «16 cuentas solo ven Inicio».
2. En Ventas, **Encender todo** → mira el lateral de la derecha y la barra de guardado abajo. **Descartar** o **Guardar**.
3. Cambia de rol con cambios sin guardar: te pregunta antes de perderlos.
4. **⋯** muestra Renombrar / Duplicar / Archivar con el motivo cuando no se puede (mismas reglas de `motivoParaNoArchivar`).
5. **Asignar a cuentas**: escribe «tru», Enter agrega la primera, sigue escribiendo; ⌫ con el buscador vacío quita la última ficha.
6. **Comparar roles** → matriz.
7. A 375 px la lista de roles se vuelve una tira horizontal y todo queda en una columna.

## Lo que queda por decidir antes de construir

- ¿Guardar con borrador + barra (propuesta) o guardar cada interruptor al instante (hoy)? El borrador evita que 16 cuentas
  vean un menú a medias mientras el líder todavía está eligiendo; `hayCambios`/`alternarModulo` ya existen en `roles-reglas.ts`.
- ¿La matriz edita directo o solo muestra? En el spike edita, con aviso por cada cambio.
- Los KPI de la cabecera: el spike los quita solo de esta pestaña; confirmar que Activos los conserva.

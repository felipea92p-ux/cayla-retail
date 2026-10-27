# Colaboradores compacto — maqueta (2026-10-27)

Abrir `index.html` (se sirve con la entrada `maqueta-referentes` de `.claude/launch.json`: `/colaboradores-compacto-2026-10/index.html`).
Todos los nombres son **un ejemplo inventado**; nada se guarda. La barra negra de arriba es de la maqueta, no del ERP: lleva el recorrido
(1 Equipo · 2 Ficha · 3 Cambiar rol · 4 Dar acceso · 5 Roles · 6 Actividad), «Antes / Ahora», «Celular 375» y el modo oscuro.

## Qué pidió Felipe

Reestructurar Colaboradores para que sea más intuitivo y amigable, con palabras clave en vez de frases, y compacto. **Es un segundo
pase sobre lo de ADR-0340…0343** (Equipo por sede, ficha, Dar acceso, Roles en tarjetas, Actividad): la estructura se queda; baja el
texto y la altura de cada pieza.

## Qué cambia (detalle en el botón «Antes / Ahora» de la maqueta)

| Pieza | Hoy | Propuesta |
|---|---|---|
| Cabecera | Frase «Quién entra a retail, en qué sede y con qué rol.» | Solo el título |
| Secciones | Dos botones grandes con resumen | Dos pestañas con número (y el ámbar de «por aprobar») |
| Fila de Equipo | 2 líneas (nombre + correo) y 5 columnas | 1 línea de 44 px: nombre, rol, último ingreso, estado. El correo pasa a la ficha |
| Estado | «De turno hoy» + chip + «baja en Dynamic» | Punto verde en la cara y chip «Turno» / «Suspendido» |
| Por aprobar | Caja con título, combo de responsable y «Lo pidió X · fecha» | Una franja: nombre → sede ✓ ✕ (el rechazo pregunta una vez) |
| Filtros | Atajos con número | Los mismos + «De turno»; vista Lista / Mosaico |
| Cambiar rol | Tarjetas con chips de colores, + y tachados | Lista de roles con una frase («Vende y cobra») y, al elegir, «Ventas y caja → Almacén» en grande, **sin** comparar módulos (Felipe, 2026-10-27: no hace falta); el botón dice «Pasar a Almacén» |
| Ficha | Frase de dos líneas + aviso + 3 botones con texto largo | Chips (sede · rol · estado), «Entró hoy 09:12», 3 botones de una palabra |
| «Así ve el sistema» | Árbol del menú | Chips de módulos por grupo; al elegir otro rol, **+ verde / − rojo** |
| Responsable | Combo grande dentro de cada panel | «Firma» en una línea al pie |
| Dar acceso | Ayudas largas + frase serif de resumen | 3 pasos de una palabra (Quién · Sede · Rol), resumen en chips y «Falta: Rol» tocable |
| Roles | Tarjetas + descripción + dos avisos + columna de menú | Lista lateral con barra de módulos y módulos como chips; la descripción vive en el ⓘ |
| Actividad | Igual | Una línea por cambio; Accesos / Roles y periodo |

**Ficha con foco (Felipe, 2026-10-27):** al abrir una persona, la ficha toma el foco: un velo con desenfoque apaga lo de la izquierda, no se
puede hacer clic, tabular ni desplazar lo de atrás (`inert`); tocar el velo o Esc la cierra. Hoy el cajón de Equipo es «sin velo»
(ADR-0340, la lista sigue viva); esto lo cambia, y pasar de una persona a otra exige cerrar primero.

## Qué NO cambia

Permisos, RPC, tablas y migraciones: **ninguno**. Siguen igual: «solo alcanzas a quien está por debajo de ti», el candado de Admin sobre el
Líder, «Deshacer» de 7 s en lo reversible, solo «Quitar acceso» pregunta, «Suspender» (no «Pausar»), «Terminales» (no «Aparatos») y el
combo de responsable en todo guardado.

## Para decidir (Felipe)

1. **Lista / Mosaico**: ¿se queda el interruptor o solo la lista? (el mosaico es opcional y no cambia nada de lo que hace).
2. **Cifras**: Equipo no lleva `TarjetaCifra`; los atajos con número hacen de cifras para ahorrar una fila. ¿Aceptas esa excepción a «cabecera → cifras → tabla»?
3. **Roles**: la columna «Así queda su menú» (árbol) desaparece; el menú de una persona se ve en su ficha. ¿Basta?
4. **Responsable**: pasa de combo grande a «Firma ▾» de una línea (sigue obligatorio). ¿Lo dejamos así en todas las hojas?
5. **Mockup, no implementación**: «Asignar», «Nuevo rol», «Renombrar / Duplicar / Archivar» y «Clave nueva» solo muestran un aviso; en el ERP siguen como hoy.

Con tu OK, la construcción va por cortes (sin migraciones, salvo las varias sedes de más abajo): Equipo + ficha → Dar acceso → Roles → Actividad, cada uno con su guía de foco, guía
interactiva y revisión a 375 px y en oscuro.

## Varias sedes por persona (Felipe, 2026-10-27)

En Dar acceso y en la ficha ▸ Sede se pueden marcar **una o varias sedes** (al menos una). En la lista la persona se agrupa bajo su
sede principal (la primera) y lleva un chip «+ Arequipa»; al filtrar por una sede salen todas las que trabajan ahí. El Líder y las
terminales siguen con una sola («Arranca en» / la tienda de la tablet).

**Esto NO es solo pantalla.** Hoy cada persona tiene UNA sede (`colaboradores.ubicacion_id`) y muchas funciones y vistas de retail se
acotan a «su sede» (Compras por tienda, Actividad, «de turno», Caja, Existencias). Varias sedes pide una tabla puente
(p. ej. `colaborador_ubicaciones`), cambiar `agregar_colaborador` y `cambiar_ubicacion`, y revisar cada función que lee la sede de la
persona. Es una migración con efecto en varios módulos: **decide Felipe** antes de construirla. Si se aprueba, va como su propio corte
(antes de Dar acceso).

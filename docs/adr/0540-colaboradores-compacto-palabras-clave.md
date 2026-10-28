# ADR-0540 — Colaboradores compacto: palabras clave, filas de una línea y ficha con foco

- Fecha: 2026-10-27
- Estado: aceptado (Felipe, 2026-10-27: aprobó la maqueta `docs/maquetas/colaboradores-compacto-2026-10/` y la lista de cortes)
- Segundo pase sobre ADR-0340…0343 (Equipo por sede, ficha, Dar acceso, Roles, Actividad). **Sin migraciones ni cambios de permisos**
  en los cortes 1 a 5; las varias sedes por persona (corte 6) quedan pendientes de su diagnóstico y del OK de Felipe.

## Problema

Colaboradores se entendía, pero decía de más: una frase bajo el título, dos botones grandes de sección con resumen, filas de dos líneas
(nombre y correo), una ficha con una frase en caja y el menú en árbol, comparaciones de módulos al cambiar un rol, ayudas bajo cada paso de
«Dar acceso» y tarjetas con íconos en Roles. Felipe pidió que fuera más intuitivo, amigable, con palabras clave y compacto.

## Decisión

1. **Cabecera y secciones** (`ColaboradoresPanel.tsx`): sin frase; «Equipo» y «Roles» son `<Pestanas>` con su número (Roles en ámbar
   si un rol deja cuentas sin módulos).
2. **Equipo** (`EquipoLista.tsx`): una línea por persona (el correo vive en la ficha), estado como chip «Turno» / «Suspendido»,
   atajo nuevo «De turno» (`FiltroEquipo = "turno"`), vista Lista / Mosaico y «Esperan tu ok» como franja con ✓ y ✕.
3. **Ficha con foco** (`FichaColaborador.tsx`, `FichaTerminal.tsx`): el cajón abre con velo (Radix modal): lo de atrás queda apagado
   y sin interacción. Chips de sede, rol y estado y una línea «Entró hoy 09:12 · correo» (`fraseFicha`, ahora en palabras clave). El
   responsable va en una línea al pie y «Quitar acceso» queda solo, abajo.
4. **Cambiar rol**: lista de roles con su frase y «N módulos»; al elegir, «rol actual → rol nuevo» en grande y «Pasar a …». **Sin
   comparación de módulos** (Felipe: «hay que quitarlo»): se borra `diferenciaDeModulos`.
5. **«Ve»** (`ModulosPorGrupo.tsx`): filas por grupo con sus módulos como `<Chip>`, en vez del árbol del menú.
6. **Dar acceso**: Quién · Sede · Rol, sin ayudas largas; sede y rol son píldoras (el rol muestra algunos módulos), resumen en chips
   y la frase completa para el lector de pantalla.
7. **Roles** (`RolesPanel.tsx`): lista al costado (`ListaDeRoles`) y módulos como píldoras por grupo. Lo que se cambia sin guardar:
   verde = se suma, rojo punteado y tachado = se quita (`app/estilos/roles.css`); la barra de guardado dice «+N suma · −N quita».
   Se quitan la columna «Así queda su menú», los íconos por módulo y las tarjetas; «Siempre solo del líder» queda plegado al pie.
8. **Actividad**: la hoja se llama «Actividad»; la lista es la del módulo Actividad y no se toca.

## Decisiones de la maqueta que quedaron así (Felipe no las objetó)

Se queda el interruptor Lista/Mosaico; Equipo no lleva `TarjetaCifra` (los atajos con número hacen de cifras); Roles pierde la columna
del menú; «Firma» pasa de combo grande a una línea (`ComboResponsable enLinea`).

## Código que se fue

`menuConCambios`, `familiaDeRol`, `diferenciaDeModulos`, `IconoModulo`, `IconoMenu` y sus pruebas. `menuDelRol`, `etiquetasDelMenu` e
`iconoDeModulo` siguen, declaradas `@internal`: las pruebas cruzan que cada rol ofrezca el menú que le toca.

## Qué falta

- **Varias sedes por persona** (pedido en la maqueta): hoy una persona tiene UNA sede (`colaboradores.ubicacion_id`) y varias funciones
  se acotan a «su sede». Pide tabla puente, cambiar `agregar_colaborador`/`cambiar_ubicacion` y revisar cada lectura de la sede: migración
  con efecto en varios módulos, de Felipe. Antes, un diagnóstico de qué lee la sede de la persona.
- Probar con cuentas reales (líder, integrante con el módulo, terminal), `guias:recorrer`, `/formidable` y `/chaos` de la ficha y de Dar acceso.

# Spike visual · Roles y accesos (2026-09-21, ajustado 2026-09-22 · ADR-0150)

`roles-spike.html` — autocontenido, ábrelo en el navegador (necesita `cayla-isotipo.png` al lado).
Datos inventados. **No es una implementación**: no toca `AppShell.tsx` ni la base.

Explora una sola pregunta: *¿cómo se ve que el rol de cada colaborador decide qué módulos y pantallas
aparecen en su menú?* Por eso los módulos **no tienen contenido**: al entrar solo muestran su título.
Lo único con contenido son las dos pantallas de administración.

## Cómo probarlo

1. Abre en **Roles y accesos** (líder). Elige un rol, activa o quita pantallas: la **vista previa** de la
   derecha muestra su menú en vivo. La pestaña **Matriz** cruza todos los roles contra todas las pantallas.
2. Arriba, **Ver como** cambia de persona: el lateral, el título del inicio y el acceso se rehacen con su rol.
3. **Ir directo a** simula escribir la URL a mano: si el rol no la incluye, sale «Sin acceso».
4. **Asignar rol** cambia el rol de un colaborador (un solo rol por persona).
5. Los cambios se guardan en `localStorage`; **Restablecer datos** vuelve al ejemplo.

## Reglas que el spike deja visibles

| Regla | Dónde se ve |
|---|---|
| Rol = lista de pantallas (`módulo.pantalla`); módulo visible si el rol ve al menos una hija | editor y lateral |
| Inicio lo ven todos los roles | editor (aviso) |
| **Líder de equipo** ve todo y no se edita → nunca queda el sistema sin quien administre accesos | candado en el editor |
| No se puede quitar al último líder | Asignar rol |
| Nadie se quita la puerta «Roles y accesos» del rol con el que está entrando | editor (aviso) |
| Un módulo con una sola pantalla visible se muestra como fila suelta (igual que Producción hoy) | lateral de Almacén o Taller |
| Esconder la fila **no es seguridad**: la URL directa también se bloquea, y el candado real es RLS/RPC | «Ir directo a» |

## Lo que NO resuelve (decisiones de Felipe antes de construir)

- Hoy el ERP solo conoce `lider` / `integrante` (`personas.rol`) más la ubicación (tienda/Taller). Roles a
  medida (Almacén, Finanzas, Taller…) exigen tablas nuevas (`roles`, `roles_pantallas`) y que las RPC/RLS
  lean de ahí; hoy cada candado está escrito en la función.
- Identidad y rol viven en Dynamic; retail solo decide «a quién le doy entrada» (`colaboradores_autorizados`).
  Falta decidir de qué lado nace el rol.
- Permisos por **sede** (la encargada de TRU no ve AQP) es otro eje, no incluido aquí.
- Permisos por acción dentro de una pantalla (ver vs. editar vs. anular) no están: aquí es «ve / no ve».

## Ajustes del 2026-09-22 (ADR-0150)

- **Etapa de la migración** (barra negra): F3–F6 destraban pantallas. Lo que aún no usa `fn_tiene_permiso` sale «Solo líder por ahora»; «Roles y accesos», «Asignar rol» y «Facturación» salen «Solo líder» siempre. (Qué pantalla es de qué etapa es ilustrativo: `ETAPA` en el script.)
- **Archivar rol** con modal de confirmación (efecto de ADR-0136) y «Archivados» con «Restaurar». No se archiva un rol que aún tiene personas.
- **Historial de cambios** que solo se agrega. **Dar acceso**: Valeria ya está en Dynamic pero no en retail. **Ana** está inactiva en Dynamic: sin acceso, sin hacer nada.
- Movimiento: cifra que cuenta, «visto» que se dibuja, filas que aparecen solo si son nuevas; sin rebote, apagado con `prefers-reduced-motion`.
- Nota: en el panel de vista previa de la app, la navegación por `#/…` no cambia de pantalla; ábrelo en un navegador normal.

# ADR-0343 — Actividad del equipo: accesos y roles en una línea de tiempo, sin función nueva

- Fecha: 2026-10-05
- Estado: aceptado (Felipe, 2026-10-05: «sigue con Actividad»)
- Entrega 4, la última, del rediseño de Colaboradores (después de ADR-0340, ADR-0341 y ADR-0342). **Sin migraciones.**

## Problema

El botón «Actividad» de Colaboradores mostraba solo el registro de accesos (`fn_colaboradores_actividad`): altas, bajas,
suspensiones y cambios de sede. No salían los cambios de roles: a quién se le dio qué rol ni qué módulos se encendieron o
apagaron. Esos cambios sí los anota el módulo Actividad desde el 2026-10-03 (ADR-0207: `colaboradores_historial` y
`roles_historial` entran a `retail.actividad`, cada uno como una oración).

## Decisión

1. **«Actividad» abre «Actividad del equipo»** (`components/colaboradores/ActividadEquipo.tsx`), una hoja con:
   - dos pestañas: **Accesos** (módulo `colaboradores`) y **Roles** (módulo `roles`);
   - el periodo: Hoy, 7 días, 30 días (el de entrada) o Todo;
   - una línea por cambio, con la cara de quien lo hizo y su oración, por ejemplo «Felipe le dio el rol «Líder de equipo» a
     «Diego Narro» (antes: Integrante)». Es la misma lista que el módulo Actividad (`ListaActividad`).
2. **Lee `fn_actividad`, que ya existe**: no hace falta ninguna función nueva. El alcance lo pone la base: el líder ve todas las
   sedes y quien no es líder, la suya.
3. **Sin el módulo Actividad, `fn_actividad` no responde**, así que se muestra el registro de accesos de siempre. Nadie pierde lo
   que ya veía.
4. **No se hizo la lectura única `fn_equipo()`** que proponía la propuesta (una RPC en vez de las 11 lecturas de la página). No hay
   un problema de velocidad medido que la pida (principio 5), y sería una migración más. Queda anotada en el backlog para el día
   que se mida lenta.

## Cómo se verificó

- La suite web está en verde.
- En producción (solo lectura), las líneas que se van a mostrar existen y se leen como oraciones: 57 de accesos y 35 de roles.
- La hoja no se pudo ver con datos reales en el navegador, porque la página de prueba no tiene sesión y `fn_actividad` exige
  una. Falta abrirla con una cuenta real.

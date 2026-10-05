## 👥 Colaboradores, entrega 3: Roles y qué ve (ADR-0342) — rama `claude/colaboradores-roles-que-ve`, sin migraciones

- [x] Roles en tarjetas y módulos en baldosas con ícono; la ayuda aparece al tocar.
- [x] «Terminales» en vez de «Aparatos» (Felipe, 2026-10-05).
- [x] Títulos de columna en Equipo (Persona · Rol · Último ingreso · Estado) y filas que aprovechan el ancho (correo bajo el nombre, columna «Estado»).
- [x] «Terminales» con la misma lista que «Todas» y la ficha de cada terminal (Clave nueva, Cambiar rol, Desactivar).
- [ ] Verla con una cuenta real: un Admin editando el Líder, y alguien con Roles y accesos sin ser líder (las baldosas «No lo tienes»).
- [ ] **Entrega 4 · Actividad**: una línea de tiempo que sume `roles_historial` y la lectura única `fn_equipo()`. (Las terminales ya quedaron en esta entrega.)
- [ ] La ficha de una persona tiene un campo (motivo de la suspensión) y ya no la ve el registro de la guía de foco (el `Dialog.Content` vive en `CajonFicha`): la regla vale igual; hoy cada panel pide una sola cosa.

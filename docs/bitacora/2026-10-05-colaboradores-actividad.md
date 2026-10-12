## 2026-10-05 (Actividad del equipo: accesos y roles en una línea de tiempo — ADR-0343)
Qué hice: última entrega del rediseño de Colaboradores, sin migraciones. «Actividad» abre «Actividad del equipo»: pestañas Accesos y
Roles, periodo (hoy, 7 días, 30 días, todo) y una línea por cambio con la cara de quien lo hizo, leyendo `fn_actividad` (lo que el
módulo Actividad ya anota desde el 2026-10-03). Ahora salen también los cambios de roles. Sin el módulo Actividad, sigue el registro
de accesos de antes.
Por qué así: la base ya escribía esas oraciones; una función nueva habría duplicado lo que existe. La lectura única `fn_equipo()` se
dejó para cuando se mida lenta (principio 5).

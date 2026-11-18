# Guías: los pliegues que se tocan a ciegas — pendientes · 2026-11-18

- [x] **Pasar a `para: "abrir" | "cerrar"` los toques que abren y cierran lo mismo.** Hecho en la rama `claude/sleepy-bohr-437da6`: 17 de los 43 eran pliegues; los otros 26 no lo son (ver `2026-11-18-sleepy-bohr-437da6.md`). Hoy 43 pasos usan `prepararSoloAlAvanzar`, casi
      todos para no desarmar al volver con ← un panel que el paso anterior dejó abierto (p. ej. «Fotos» en Editar producto,
      `apps/web/lib/guias/pantallas/catalogo.ts`, pasos `catalogo-ia` y `variantes`). Con `para` el paso queda igual en las dos
      direcciones. Requisito: que el control declare `aria-expanded`; si no lo declara, el motor no lo toca y el paso avisa. Se prueba
      guía por guía con `guias:recorrer` y una ida y vuelta con ← →.

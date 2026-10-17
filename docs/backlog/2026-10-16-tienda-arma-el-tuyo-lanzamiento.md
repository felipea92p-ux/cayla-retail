## «Arma el tuyo» en la tienda (ADR-0434, PR 3: actividades 8 a 10, el lanzamiento)

- [x] **Actividad 8 — Guardar el look en Favoritos:**
  - el corazón del probador guarda o quita el look;
  - «Tus looks» en Favoritos;
  - la página del look guardado (`/looks/guardado/[id]`), con su nombre que se cambia, el precio de hoy, la bolsa y «Editar en el
    probador».

  Cómo se probó:
  - en la base: `pnpm pruebas:tienda-looks-guardados` (14/14);
  - las reglas: `apps/tienda/lib/looks-guardados.test.ts`;
  - en un banco propio, a 375 px y en la computadora, en claro y oscuro: guardar, cambiar el nombre, abrir en el probador, la hoja de
    tallas, quitar y volver a guardar.
- [ ] **No está en producción:** `supabase/migrations/20261017044000_tienda_looks_guardados.sql`.
  - Trae dos tablas, cuatro funciones y una línea anclada en `fn_cuentas_web_cerrar_al_anonimizar`.
  - Se pega con el OK de Felipe antes de fusionar el PR 3.
  - Al pegarla, refrescar el volcado (`pnpm datos:refrescar`) para que `looks_web` y `look_web_piezas` entren al diccionario.
- [ ] El PR 3 se abre recién con el PR 1 (#1151) y el PR 2 fusionados en main. Hasta entonces, `pnpm migraciones:versiones` y
  `pnpm adr:numeros` marcan en esta rama los números de esos dos PR, que todavía no están en main.
- [ ] Actividad 9 — Compartir: el enlace sin cuenta y sin precios, la vista previa y la imagen para estados.
- [ ] Actividad 10 — Las entradas (el menú, «Arma tu look» y la ficha), solo cuando Felipe diga.

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
- [x] **Actividad 9 — Compartir:**
  - «Compartir» en el look guardado: la imagen para estados, la hoja del celular, descargar y copiar el enlace;
  - `/tu-look`, la página pública sin precios, con «Crea tu cuenta y arma el tuyo»;
  - la vista previa de WhatsApp.

  Cómo se probó:
  - las reglas: `apps/tienda/lib/compartir-look.test.ts`;
  - en el banco, a 375 px y en la computadora: las dos imágenes mirándolas, la página con cuenta y sin ella (el HTML de un visitante,
    sin precios y con el enlace de vuelta), la hoja de compartir, la del celular simulada (manda el PNG y el enlace) y copiar sin
    permiso del navegador.
- [ ] Probar «Compartir» en un iPhone y un Android de verdad. El panel de pruebas no tiene la hoja de compartir del celular. Revisar
  también que WhatsApp muestre la vista previa del enlace de producción.
- [x] **Actividad 10 — Las entradas** (Felipe pidió construirlas en el PR 3, 2026-10-17):
  - «Arma el tuyo» en la cabecera y en el menú del celular;
  - la tarjeta arriba de «Arma tu look»;
  - «Arma un look con esta prenda» en la ficha, que sigue el color elegido y solo sale si la prenda se puede probar.

  Probado en el banco a 375 px y en la computadora.
- [ ] **Al fusionar el PR 3, el probador queda a la vista de todos.** Antes, en producción:
  - pegar la migración `20261017044000`;
  - apretar «Preparar recortes» en el ERP (si no, casi ninguna prenda entra al probador y la tarjeta de «Arma tu look» no sale);
  - cargar los largos de vestidos, faldas, conjuntos y enterizos.

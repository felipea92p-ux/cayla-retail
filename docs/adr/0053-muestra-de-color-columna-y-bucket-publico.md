# ADR-0053 — Muestra de color: columna simple y bucket público (no el patrón de adjuntos)

**Fecha:** 2026-09-15
**Estado:** Migración escrita (`20260915230000_colores_tipo_y_muestra.sql`), pendiente de
correr en producción — verificado en local con `typecheck`/`lint`/`build`/`vitest`, sin
browser real (ver Consecuencias)

## Contexto

F2 de 4 sesiones paralelas enriqueciendo Catálogo/Productos sobre `DiegoN`. Tarea: sumarle
a `colores` una naturaleza visual (`tipo`: sólido/textura/estampado, distinta de
`familia_color`, que agrupa por matiz) y una foto real de la muestra de tela, para que un
colaborador de sede no confunda "Azul marino textura" con "Azul marino liso" al recibir
mercadería. Es el segundo lugar del sistema que guarda un archivo en Storage propio de
retail — el primero fue `retail-compras-adjuntos` (ADR-0046, 20260914180000). Ese
precedente se sigue en la mecánica (guard de `to_regclass('storage.buckets')`, subida
directa navegador→bucket, política de `storage.objects` acotada solo por `bucket_id`) pero
se aparta en dos decisiones, y por eso este ADR y no solo el comentario de la migración.

## Decisión

1. **Columna en `colores`, no tabla aparte.** Una factura puede tener 0-10 adjuntos
   (1:N → tabla `compra_adjuntos` + RPC que valida pertenencia). Un color tiene como mucho
   UNA muestra (1:1 → `colores.imagen_muestra_url`, nullable). Meter una tabla para una
   relación 1:1 sería la pieza gigante que el principio 3 (simplicidad radical) prohíbe
   sin necesidad real.
2. **Bucket público `retail-colores-muestras`**, a diferencia del privado
   `retail-compras-adjuntos`. La razón de privado ahí era el CONTENIDO (RUC, montos,
   condiciones de pago) — acá no hay equivalente: una foto de tela es exactamente lo que
   ya se muestra en la grilla de `/productos/colores` a cualquier colaborador con acceso a
   Productos. Público evita pedir una URL firmada por cada una de las ~30+ muestras en
   cada render de la grilla (firmas que expiran a la hora, para una pantalla que puede
   quedar abierta un turno completo). Mismo criterio que `fotos-perfil` (bucket de
   Dynamic, también público — `PerfilModal.tsx`).
3. **Sin RPC de registro.** El candado de negocio no es "¿existe la fila que hace real al
   objeto?" (como en adjuntos, donde un objeto sin fila es basura invisible) — es "¿quién
   puede guardar la URL en `colores`?", y ese candado YA existe:
   `colores_write_lider` (0004_rls.sql) sobre la tabla completa. La subida al bucket queda
   abierta a cualquier autenticado (igual que adjuntos); si alguien sin rol Líder subiera
   una imagen, el PATCH que la adjuntaría a la fila lo rechaza igual — el peor caso es un
   objeto huérfano en el bucket, mismo riesgo aceptado que adjuntos.
4. **`tipo` es una columna nueva, no un valor de `familia_color`.** Son ortogonales: un
   estampado puede ser azul o rojo. Fusionarlos habría multiplicado la lista cerrada de
   familias por 3 sin necesidad.
5. **Mecánica idéntica a adjuntos donde no hay razón de negocio para diferir:** el
   `do $$ ... $$` con guard de `storage.buckets` (Storage apagado en local), la subida
   directa navegador→bucket (`lib/colores-muestra.ts`), límite de tamaño (5 MB, más chico
   que los 10 MB de un PDF de factura porque es solo una foto de swatch) y tipos MIME
   (solo imagen, sin PDF).

## Consecuencias

- Verificación en este entorno llegó hasta `typecheck`, `lint`, `next build` y
  `vitest run` (215/215) limpios — sin Docker/Supabase local disponibles en el sandbox de
  esta sesión, la subida real y el fallback a HEX en pantalla quedan por confirmar en
  navegador con Storage encendido (local con `supabase start`, o directamente producción
  tras correr la migración). Documentado en BACKLOG como pendiente de esa verificación.
- `packages/database/src/types.ts` tiene las tres columnas nuevas escritas a mano (mismo
  drift de `gen-types` que ya arrastra `compra_adjuntos`, ver ADR-0046 y BACKLOG).
- Si algún día una muestra necesita más de una foto por color (frente/reverso, por
  ejemplo), eso sí es 1:N y ahí corresponde migrar a una tabla — no antes.

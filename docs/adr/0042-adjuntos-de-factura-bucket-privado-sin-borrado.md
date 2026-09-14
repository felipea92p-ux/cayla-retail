# ADR-0042 — Adjuntos de factura: bucket privado, la tabla es la verdad, nunca se borra

**Fecha:** 2026-09-14
**Estado:** Migración escrita y verificada en local (`20260914180000_compras_adjuntos.sql`), pendiente de correr en producción

## Contexto

Felipe pidió poder adjuntar la factura del proveedor (PDF o foto) y sus documentos
relacionados al registrarla y desde su detalle. Antes de escribir una línea se verificó
que **el sistema no guardaba ningún archivo**: cero llamadas a Storage en `apps/web`; el
bucket `fotos-productos` del diccionario es herencia del proyecto Dynamic sin código en
retail. Es decir, esta es la primera pieza de archivos del ERP, y las decisiones que se
tomen acá van a ser las que hereden las siguientes (fotos de producto, comprobantes
escaneados, contratos). Por eso merece ADR y no solo el comentario de la migración.

Complicaciones del entorno que condicionan el diseño:
- Producción vive en el proyecto de Supabase de Dynamic (CLAUDE.md §"Cómo aplicar SQL a
  producción"): el bucket se comparte con otro sistema.
- En local el servicio de Storage está apagado (`supabase/config.toml`, choque entre los
  dos stacks) y el Postgres local no tiene ni el schema `storage`.

## Decisión

1. **Bucket privado `retail-compras-adjuntos`.** Una factura de proveedor lleva RUC,
   montos y condiciones de pago; no va en una URL pública. Se abre con URL firmada de una
   hora generada en el servidor (`lib/compras.ts › getAdjuntosCompra`). Prefijo `retail-`
   porque el proyecto es compartido.
2. **La tabla `compra_adjuntos` es la verdad, no el bucket.** Un objeto sin fila no existe
   para el sistema. La fila se escribe solo por RPC (`registrar_adjunto_compra`), que
   valida: la compra existe y no está anulada, la ruta vive en la carpeta de ESA compra
   (`<compra_id>/…`, además reforzado por un `check`), tipo permitido (PDF, JPG, PNG,
   WebP, HEIC), ≤ 10 MB. El bucket repite tipo y tamaño como segundo candado.
3. **El archivo sube del navegador al bucket, no pasa por Next.** Un PDF de 8 MB no
   atraviesa São Paulo dos veces. La política de INSERT en `storage.objects` deja subir a
   cualquier persona autenticada solo dentro de este bucket; el candado de negocio está en
   la RPC, no en la subida. Orden: primero `registrar_compra`, después subir con su id.
4. **Nunca se borra.** "Quitar" = `archivar_adjunto_compra` pone `archivado_en`; el objeto
   queda. No hay política de DELETE ni UPDATE en tabla ni en bucket. Un adjunto de factura
   es evidencia contable: se saca de la vista, no se destruye. Misma regla que
   `movimientos` y que desactivar un proveedor.
5. **Se degrada, no rompe.** Si Storage no responde, el detalle muestra la lista sin
   enlaces ("Sin acceso al almacén de archivos ahora"); si una subida falla después de que
   la factura ya existe, la factura se registra igual y el detalle avisa qué archivo
   quedó por subir, con el botón para reintentar.
6. **La migración crea el bucket solo si `storage.buckets` existe** (bloque `do`): en
   producción sí; en `db reset` local se salta con un NOTICE. Tabla y RPCs corren igual
   en ambos lados.

## Consecuencias

- Verificación en local llega hasta tabla, RPCs (5 reglas probadas con psql como
  persona autenticada) y pantallas; la subida real se ve en producción, o encendiendo
  Storage local apagando el stack de Dynamic.
- `packages/database/src/types.ts` tiene la tabla y las dos RPC escritas a mano (drift
  de `gen-types`, ya conocido en BACKLOG).
- Quien construya el próximo tipo de archivo del sistema copia este patrón: bucket
  privado con prefijo `retail-`, tabla propia como fuente de verdad, RPC para la fila,
  archivado en vez de borrado, y `do`-bloque tolerante a local.
- Si algún día un adjunto debe destruirse de verdad (pedido legal), es un paso manual
  documentado, no un botón.

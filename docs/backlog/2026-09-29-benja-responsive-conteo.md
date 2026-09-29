## 🧮 Conteo rediseñado (2026-09-29, ADR-0282) — en producción (SQL pegado y web fusionada el 2026-09-29, #615)

- [x] Modelo: `conteo_items.cantidad_contada` nullable (NULL = pendiente), `cantidad_foto`, `verificado_en`, `contada_anterior`, `confirmada_en`, `conteos.foto_en`, índice `conteo_items_variante_idx`.
- [x] RPC nuevas: `conteo_recontar`, `conteo_confirmar_diferencia`, `fn_conteo_detalle`; reescritas: `abrir_conteo` (foto + sububicación obligatoria en tiendas), `conteo_contar` (jsonb, des-contar, fuera de alcance), `cerrar_conteo(p_parcial)`, `fn_conteos_resumen` (sin soles; `pendientes`, `parcial`). Eliminadas: `previsualizar_cierre_conteo`, `fn_prioridad_conteo`, `fn_soles_diferencia_conteo`.
- [x] Web: Inicio, Contar, Revisar, Confirmar, Resultado y Cancelado; sin prioridad, sin a ciegas, sin costos.
- [x] Pruebas: `pruebas:conteo-rediseno` (nueva, en `ci.yml`), `pruebas:conteo-vacio` actualizada, `seed.sql` confirma la diferencia antes de cerrar; vitest completo verde.
- [x] **SQL pegado en producción el 2026-09-29** (schema `retail`, con `apply_migration`; huellas `md5(prosrc)` iguales a local). Web fusionada en #615; el diseño de tarjetas con «Completar todo» va en un PR aparte.
- [ ] Refrescar el volcado (pendiente: ya están en producción) de `docs/datos/generado/` cuando se peguen (columnas e índice nuevos; funciones nuevas).
- [ ] `fn_conteos_resumen` no filtra `es_prueba`: un conteo archivado como prueba sigue saliendo en «Conteos recientes» y en «Último conteo» (ya era así).
- [ ] Un solo conteo abierto por sede (no se puede contar piso y almacén a la vez).
- [ ] Dos personas contando la misma variante: gana el último total (BACKLOG «Parte 2»: tandas).
- [ ] `conteo_items.movimiento_id` (FK a movimientos) no tiene índice; solo pesa en purgas.
- [ ] Decidir el color del sobrante: hoy «Hay N de más» va en rojo como «Faltan N» (pedido del usuario); Traslados y Recibir lo pintan ámbar.
- [ ] `docs/datos/modulos/06-conteo-y-censo.md` y `docs/datos/01-INVARIANTES.md` siguen describiendo el modelo V1 (`conteo_lineas`).

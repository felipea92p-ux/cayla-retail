## Clientes y miembros sin género: lo que queda (ADR-0288 act. k, 2026-10-02)

- [ ] **Mensajes de error de la base que dicen «clienta» o «socia»** (25 funciones de producción, consultado el 2026-10-02):
  - `apartar_stock`, `aprobar_devolucion`, `archivar_clienta`, `crear_invitacion_club`, `editar_clienta`, `editar_separacion`,
    `eliminar_producto_con_historia`, `entregar_separacion`, `exportar_clientas`, `fn_cerrar_apartado_de_separacion`,
    `fn_clienta_anonimizar`, `fn_clientas_lista`, `fn_club_celular_con_publicidad`, `fn_corregir_identidad_variante`,
    `guardar_preferencias_clienta`, `liberar_separacion`, `pedir_prenda_para_apartar`, `reactivar_clienta`,
    `registrar_aviso_enviado`, `registrar_devolucion_separacion`, `registrar_mensaje_publicidad`, `registrar_pedido_no_atendido`,
    `registrar_venta`, `separar_prendas` y `unirse_al_club`.
  - Cada una se reescribe desde su `pg_get_functiondef` de producción, con reemplazo anclado y candado de versión (md5).
  - `registrar_venta` primero, aparte y con cuidado.
  - Antes de empezar, contarlas otra vez: el número envejece.
- [ ] **El lienzo de diseño del club** (`https://claude.ai/artifact/MKC9Z7w3pAQBnWYojUBKXM`) todavía muestra «socia» y «Estás
  invitada». Es referencia, no la página real.

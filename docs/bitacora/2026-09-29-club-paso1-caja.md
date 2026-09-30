## 2026-09-29 (Club de clientas, paso 1: el diseño de Caja queda escrito y aprobado; ADR-0288)

Qué hice: escribí el ADR-0288 con el diseño del paso 1 del club. La venta se liga a la ficha con el
`p_cliente_id` que `registrar_venta` ya aceptaba y la web nunca mandaba. El documento gana tipo (`dni` pasa a
`documento_numero` + `documento_tipo`). «Socia» es una fecha (`club_desde`) y el permiso de WhatsApp es una historia
append-only (`club_permisos`) con el texto versionado (`club_textos`). El cumpleaños lo calcula la base, con un
canje único por año (`club_canjes`), y se apaga sin conexión. «Se probó y no llevó» va en `pedidos_no_atendidos`
con `motivo`, y «es para regalo» por prenda. Felipe aprobó tres cosas: la parte de comprobantes con carné y
pasaporte (SUNAT), el texto v1 del consentimiento, y que devolver la compra no devuelve el cumpleaños. Sin código ni
migración todavía.

Por qué así: el hueco real era que ninguna venta llegaba a la ficha de nadie (verificado en `main`: `p_cliente_id`
no aparece en `apps/web`). Además, `registrar_clienta` marcaba el permiso de WhatsApp en caja, contra D-108. Cada
regla del club que puede quedar inconsistente (dos canjes, una socia sin celular, un «sí» sin texto) se vuelve
imposible en el esquema, no en la pantalla.

Felipe se lleva: el orden de construcción, 1a → 1e, cada tanda con su «Cómo lo verifica Felipe» en el ADR.
Sobre el bot de WhatsApp que pidió: va en su propio ADR con el paso 3, y la investigación de costos y de la
«coexistencia» del número ya está en curso.

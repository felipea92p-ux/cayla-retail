## 🧵 Producción: el corte con su tela, todo o nada (2026-10-30, ADR-0587). Migración `20261031014000` EN producción (2026-10-30); rama `claude/production-module-improvements-b7f617`

- [x] Evaluación del módulo en 21 mejoras: `docs/pantallas/produccion-modulo-21-mejoras.md` (análisis desde el código).
- [x] Candado por (tela, sede) antes de leer cuánto había. Se corrió la carrera real con dos sesiones: la función de `main` deja −5 m y la nueva, 20 m.
- [x] «Terminé» y la Salida con su tela en una transacción, con token (`anotar_termine_con_tela`, `registrar_salida_con_tela`).
- [x] «Deshacer» devuelve prendas, fallas y tela a su lote, una sola vez (`deshacer_termine`, `movimientos_insumo.deshace_id`).
- [x] La factura suelta pregunta por el pedido abierto del proveedor (`pedidosSinFacturaDe`), con un paso opcional en la guía de Facturas y su huella aceptada.
- [x] Pruebas: `pruebas:produccion-corte-con-su-tela` 20/20 y las 32 suites de Producción e Insumos en verde, todo en una base desechable; vitest, tsc y knip limpios.
- [x] La mejora 4 (los ajustes también por lote) quedó escrita en #1499, que ya cambia el saldo por lote.
- [x] Probado en el navegador contra la base desechable: «Terminé» con tela, «Deshacer», «Mandar» y el aviso de «Nueva factura», en escritorio, a 375 px y en oscuro. A 375 px el botón del aviso apretaba el texto: pasó bajo el texto.
- [ ] Decidir con `/unificar` si `<Aviso>` baja su botón bajo el texto en pantallas angostas para todos (hoy lo parchan Plan del piso y esta hoja, cada una a su modo).
- [x] `20261031014000` pegada en producción por Felipe y verificada por md5 contra la base de las 41 suites.
- [ ] Refrescar el diccionario cuando se renueve el volcado de producción.
- [ ] Avisar a la sesión de ADR-0570 que parta de estas versiones de `anotar_insumos_de_la_orden` y `anotar_termine`.
- [ ] Las otras 18 mejoras de la lista, cada una con su OK.

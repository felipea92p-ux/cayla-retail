## 2026-10-23 (Revisar compras: rondas abiertas, el cuaderno de la ronda cerrada y «Mis compras» — ADR-0480)
Qué hice: la migración `20261023210000` agrega `fn_ronda_compras_cuenta` (le dieron, compró, gastó, prendas) y `fn_tienda_de_persona`, y amplía dos lecturas sin escribir nada:
- `fn_revisar_compras` suma `rondas_abiertas`, y en cada cierre su tienda y su cuaderno;
- `fn_plata_por_confirmar` dice su ronda.

En la web:
- la tarjeta «Rondas abiertas» bajo la bandeja;
- el cuaderno completo en el detalle de una ronda cerrada (con «Tenía al abrirla» despejado del final, así cierra);
- la ronda en la plata por confirmar;
- «S/ X por recibir» en «Quién tiene plata».

Y, a pedido de Felipe, «Mi plata para compras» pasa a llamarse **«Mis compras»** (menú, cabecera, guías, Roles y accesos; la clave `ordenes_compra` no cambia).

Por qué así: el diseño A que eligió Felipe pedía esos datos y la base no los mandaba. El nombre lo eligió él entre cuatro.

Qué se rompería sin esto: Revisar compras no mostraría quién está comprando ahora, ni de dónde sale el «Devuelve S/ 85» de una ronda cerrada.

Estado:
- vitest en verde (597 archivos), Knip limpio.
- `pruebas:compras-simple-dia` 15/15, con el caso nuevo de rondas abiertas, cuaderno y ronda de la plata.
- `roles-cobertura` 32/32.
- Guías `compras.fondos` (17 pasos) y `compras.mi-plata` (14) recorridas; auditor del tema en 0, con capturas revisadas.
- La migración está en producción desde el 2026-10-23 (verificada por md5).

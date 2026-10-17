## 2026-10-17 (El Panel comercial lee la misma meta que Caja e Inicio)
Qué hice: el Panel comercial (`/comercial`) dejó de calcular su ritmo con `ubicaciones.meta_venta_diaria` (una columna que nada escribe) y ahora pregunta
la meta de cada día del mes a `fn_parametros_caja`, igual que Caja e Inicio. «Lo prometido» para el semáforo es la suma de la meta de cada día cerrado
(un sábado de diciembre ya no pesa como un martes de octubre), la tarjeta muestra «Meta del mes» (suma de sus días) y el total consolida día por día.
Si la base no responde, esa tienda cae a `meta_venta_diaria` como antes y la pantalla sigue en pie.
Por qué así: `fn_meta_mes` no se puede llamar desde la web (se le quitó el permiso en `20261015222000`: es una pieza interna), pero es exactamente la
suma de `fn_parametros_caja` de cada día, así que el panel la arma con la misma función y la misma regla; no hace falta migración. La regla vive en
`lib/comercial-reglas.ts` (`metasDeLaSede`, `metasDelMesDe`, `metaDelMes`) con su prueba.
Felipe se lleva: nada que pegar. Mientras la migración `20261017020000` (ADR-0435) no esté en producción, el panel ya muestra la semana tipo y las
campañas; al pegarla, mostrará también los meses y las fechas especiales sin tocar nada más. Cuesta ~31 lecturas pequeñas por tienda al abrir el panel.

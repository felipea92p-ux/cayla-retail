## 2026-11-17 (El lino sale «con arrugas finas», no planchado)
Qué hice: `ACABADO_POR_TEJIDO = { lino: "arrugas-finas" }` en `lib/ficha-foto-ia.ts`: en producción, una prenda de lino pide la foto sin los dobleces
de guardarla pero con las arrugas finas y parejas de la tela; las demás telas siguen planchadas. ADR-0659 act. 2026-11-17 (g).
Por qué así: la tercera foto planchada del Crudo, junto a las dos de antes, «se ve peor» (Felipe). Planchado, el lino pierde lo que lo hace lino.
Felipe se lleva: se prueba rehaciendo Crudo en producción; si no convence, lo siguiente es «sin planchar» (una línea). Sin probar con OpenAI aquí.

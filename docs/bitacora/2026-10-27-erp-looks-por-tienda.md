# 2026-10-27 · Vitrina web ▸ Looks: en qué tiendas sale cada look (rama erp-looks-por-tienda, ADR-0539)

- **Qué quedó:** el ERP deja de decir «Se ven en la web: 3 de 3» cuando la tienda online muestra 1. Dos funciones de lectura (`fn_vitrina_looks_por_tienda`, `fn_vitrina_prendas_por_tienda`,
  migración `20261027204000`) con las mismas reglas que la web; chips por tienda en cada look; al armar un look, filtro «Hay en [tienda]» y aviso en vivo (sin candado); contador
  «Salen en alguna tienda» y mensaje de por qué no sale. Medido en producción (solo lectura): 25,8 s → 2,0 s para los looks y 6,2 s → 2,5 s para todo el catálogo.
- **Dónde empezó:** Felipe, con 3 looks encendidos y 1 visible en la web; el diagnóstico en producción mostró que ninguna tienda completa «Look del día» (3 prendas en TRU, 1 solo en AQP)
  ni «Una idea para hoy» (la única talla con stock de la cartera en AQP no es la que se ofrece). Felipe propuso evitarlo al armar el look: de ahí el filtro y el aviso.
- **En producción:** Felipe pegó la migración `20261027204000` el 2026-10-27 (una parte) y las dos huellas coinciden con las de la base local. Falta fusionar el PR #1402 para publicar la pantalla.
- **Falló antes y sigue igual:** 8 escenarios de `pnpm pruebas:vitrina-looks` (precio, láminas y «hay» de las tallas) ya fallaban en `main` con esta base local; no son de este cambio.

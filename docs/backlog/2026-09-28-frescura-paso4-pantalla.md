## 🌿 Frescura del piso · paso 4: la pantalla (2026-09-28, ADR-0208) — migración `20260929100000` **sin pegar**; rama `claude/frescura-paso4-pantalla`

- [x] Pantalla `/inventario/frescura`, directo en Inventario (6.ª fila), con los colores A y las frases C que Felipe eligió
      en la maqueta (`docs/maquetas/frescura-3c-2026-09/`). Tiene cabecera con cuatro cifras («Por decidir» filtra),
      filtros en la URL, la tabla por categoría (en el celular, tarjetas), la hoja de detalle con la regla de la
      categoría y la nota. Quien no es líder ve solo su sede.
- [x] Módulo `frescura` (Inventario, orden 115, sin rol, delegable) y el candado nuevo de `fn_frescura_sede`,
      `fn_confianza_registro` y `fn_bajadas_del_piso`: «el líder, o el módulo, en una sede que opera»; `persona_id`
      solo para el líder.
- [x] Pruebas en verde:
  - `frescura_lectura` 258, `frescura_bajadas` 183, `roles_por_modulo` 70, `roles_cobertura_modulos` 32,
    `una_sola_firma` 2, `bajada_al_piso` 51, `roles_lider_editable` 13, `temporadas` 25, `terminales_por_tienda` y
    `terminales_sin_persona` 55;
  - `frescura-pantalla` 69 y `frescura-contrato` 26; vitest completo 221 archivos, 152.540 pruebas;
  - menú y módulos, `tsc` y eslint.
- [x] **Revisión del paso 4 (2026-09-28, noche): 13 hallazgos, los 13 aplicados** (ADR-0208, «Corrección del paso 4»):
  - la prenda con lo apartado en el ALMACÉN ya no sale «apartada»: `fn_frescura_sede` suma `apartadas_piso_hoy`, y la
    web lo deduce de `apartados` mientras producción no lo tenga;
  - los clásicos se nombran por su estación («Es de verano»), con los nombres de producción en las pruebas;
  - el buscador guarda lo escrito en el estado («blusa wayra» ya no queda «blusawayra»);
  - «está por llegar a los 18» / «justo en los 18», la escala sin «18–18 d», «4 de cada 10» hacia abajo, el % sin
    100 falso, «1 día», nada de «solo 0», «con pocos datos» con las demás sin ella, concordancias, «Sin categoría»
    en el filtro, una categoría vieja en la URL vuelve a «todas» y «0 por decidir» sin ámbar;
  - la terminal de ventas con el módulo, probada por conducta en T1 y T13 (con la mutación corrida).
- [x] Navegador (página de prueba sin sesión) a 1280 y 375 px: sin desplazamiento lateral, 0 rojos en la lista y 1 con
      la hoja abierta, Escape y foco bien, consola limpia.

### SQL POR PEGAR (en este orden, cada parte sola en el SQL Editor)

1. `supabase/migrations/20260929100000_frescura_modulo_y_candado.sql` (md5 del archivo `a7fcf105df3381abeb082dc29ddfa0de`;
   el de antes de la revisión, `1e5880ef…`, ya no vale).
   - Va **antes de publicar la web**: con la web nueva y sin esta migración, el menú no muestra Frescura ni al líder.
   - Solo trae un `insert` en `retail.modulos`, tres `create or replace function`, comentarios, `revoke` y `grant`.
     `fn_frescura_sede` devuelve además `apartadas_piso_hoy` en cada prenda (la web de hoy lo ignora).
   - Pide el paso 3 pegado (ya está, 2026-09-28): la guarda compara el md5 vivo de cada función con el de producción y
     con el suyo.
   - Verificación, solo lectura:

     ```sql
     select proname, md5(prosrc) from pg_proc where pronamespace = 'retail'::regnamespace
      and proname in ('fn_frescura_sede', 'fn_confianza_registro', 'fn_bajadas_del_piso', 'fn_bajadas_del_piso_nucleo')
      order by proname;
     -- fn_bajadas_del_piso         9821874e6a32909680a9a5155bcdb68b
     -- fn_bajadas_del_piso_nucleo  fcfd2c4b2c4f24dd2184eb2cd7a12678   (sin cambio)
     -- fn_confianza_registro       dcedb83cff010817a17e023b9e8b2d92
     -- fn_frescura_sede            a22655be615d72555032a7df98258876
     select clave, grupo, orden, solo_lider, delegable from retail.modulos where clave = 'frescura';  -- frescura | Inventario | 115 | f | t
     select count(*) from retail.rol_modulos where modulo = 'frescura';                                -- 0
     ```

   - Después: volcado nuevo, `pnpm datos:generar:produccion` y `pnpm datos:comparar`.

### Lo que sigue

- [ ] **Pegar `20260929100000` y publicar la web.** Después, verificar en TRU como líder:
  - los días de una prenda coinciden con su historia en Movimientos;
  - las 15 prendas de la carga inicial dicen «quizá más» y nunca «Nueva»;
  - un rol con solo Análisis sigue viendo «Análisis» suelto.
- [ ] **«Por decidir» todavía no baja.** No hay dónde anotar lo que el líder ya decidió («la dejo hasta agotar», «la
      cambié de lugar hoy»). Lo decide Felipe aparte; es un dato nuevo por sede. Hasta entonces, una prenda decidida
      sigue en «Por decidir» mientras siga colgada, y la pantalla lo dice.
- [ ] **Paso 5 (Análisis usa la regla de Frescura):** «Estancadas» pasa a `estaQuieta` y enlaza aquí; el candado de
      `fn_frescura_sede` suma `or fn_puede_analizar()`, solo para su sede.
- [ ] **Paso 6 (la tarjeta del registro en la Terminal de ventas, con el 3b):** módulo `registro_piso`. Para quien no es
      líder, «de las otras sedes solo agregados» pide una lectura nueva de agregados (hoy no la ve: decisión del paso 4).
- [ ] **Datos que la lectura no trae** y que la maqueta mostraba:
  - el código del modelo (llega el de una talla);
  - el origen de la llegada a CAYLA (lote o Taller);
  - cuántas de las ventas recientes fueron apartados;
  - cuál talla no cuadra.
- [ ] **Sin probar con datos reales:** la pantalla se vio solo con la página de prueba (datos de mentira y la salida de
      T13). Producción tiene hoy 89 de 89 prendas sin temporada: el aviso único de arriba es lo que se va a ver.
- [ ] **Frases con un corte de 1 día** («todavía no llega a los 1»): solo pasa si la mitad de una categoría se vende en
      menos de un día y medio. No se tocó en la revisión; si aparece, va con `textoDias` como el resto.

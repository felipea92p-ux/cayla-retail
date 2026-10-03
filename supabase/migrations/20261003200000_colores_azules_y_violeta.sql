-- ============================================================================
-- 20261003200000 — Colores: Azul eléctrico y Violeta vuelven a ser vivos, Azul medio pasa a ser un azul de lavado medio, y se
-- reescriben cuatro fichas que ya no decían la verdad (ADR-0317)
--
-- EL PROBLEMA
--   Felipe vio confusión entre «Azul medio» e «Intermedio» y un posible error con «Eléctrico». Medido el 2026-10-02:
--   · AZE «Azul eléctrico»: la paleta original (20260926100000) lo creó en #2E5BF2, un azul vivo (croma OKLab 0,231). La
--     migración 20260926180000 lo ancló a Pantone 18-3945 «Amparo Blue», #4A5FA5 (croma 0,114): un azul APAGADO. No fue un descuido:
--     el ADR-0215 lo decidió así porque esos hex «estaban tan saturados que ningún tinte textil los alcanza». Pero Pantone TCX no tiene
--     un eléctrico (el azul vivo más intenso de Pantone TCX en ese matiz llega a 0,137), y el efecto fue que «Azul medio» (#3936CD,
--     croma 0,222, el color más intenso de toda la carta) parecía el eléctrico. Felipe, con las prendas delante (9 variantes en 5
--     prendas: BOD-0007, BOD-0010, BOD-0012, POL-0020 y POL-0021), confirmó que son un azul vivo.
--   · AME «Azul medio»: se creó a mano y lo llevan jeans y camisas/pantalones Oxford (CAS-0008, JEA-0012, CMS-0025, PAN-0016). Un
--     jean en ultramarino vivo no existe: el círculo estaba mal. Felipe confirmó que es un azul de lavado medio, apagado.
--   · AZI «Azul Intermedio» (solo en el jean JEA-0013) significa lo mismo que «medio»: Felipe pidió fundirlo en Azul medio.
--     ESO NO SE HACE AQUÍ, y no porque el sistema lo impida (el disparador variantes_identidad_solo_por_funcion solo frena a la web,
--     es decir a `authenticated` y `anon`; el SQL Editor corre como `postgres`) sino porque un `update` directo no recalcula el
--     `codigo` de la variante (seguiría diciendo JEA-0013-AZI-28 con color Azul medio), no guarda el código viejo en
--     codigos_barras, no deja historial de quién lo hizo y no sube la versión de la prenda (ADR-0193). Lo hace
--     `fn_corregir_identidad_variante` (ADR-0263), que se llama desde Editar producto con una cuenta con permiso de catálogo
--     (Productos y Atributos; Felipe sirve): las 3 variantes de AZI no tienen ventas, así que no hace falta ser Líder. Después se
--     archiva AZI desde Atributos (Editar ▸ Desactivar, que solo cuenta variantes ACTIVAS del color).
--   · VIO «Violeta»: la misma historia: #7A3FB6 (vivo, 0,181) pasó a Pantone 18-3633, #775496 (apagado). No tiene prendas.
--   · PER «Perla»: el ADR-0314 le cambió el hex (#EAE6DD → #DBDDD9, un blanco grisáceo a ΔE2000 6,1 de Crudo) pero su ficha sigue
--     diciendo «casi igual a Crudo», que ya no es cierto.
--
-- DECIDÍ (Felipe, 2026-10-02, por preguntas de opción)
--   · Azul eléctrico → #2E5BF2 y SIN Pantone (no existe uno honesto): un círculo sin código es mejor que uno con un código falso.
--     Esto REVIERTE el ancla del ADR-0215 para este color: el círculo muestra lo que se ve en la prenda, y sin código no se promete
--     una referencia de tela que no existe.
--   · Azul medio → Pantone 18-3928 TCX «Dutch Blue», #4A638D (el hex lo confirman tres fuentes independientes).
--   · Violeta → #7A3FB6 y SIN Pantone, por la misma razón que Eléctrico.
--   · Se reescribe la ficha (descripción) de cuatro colores: AZE, AME y VIO (las de antes se escribieron para los hex equivocados:
--     «Medio: intenso y saturado, vibrante»; «Eléctrico: … sin ser estridente») y PER (ya no es «casi igual a Crudo»). La de Medio
--     dice «más oscuro y sobrio que el denim» porque Azul denim ya dice «el color del jean» y queda a ΔE2000 8,3. El «combina con»
--     de Eléctrico, Violeta y Perla se conserva; el de Medio cambia a lo que va con un azul de jean.
--   · Índigo se QUEDA (Felipe: «si se va a usar a futuro, déjalo»): «índigo» es un nombre de uso común en denim para el lavado
--     oscuro, y CAYLA vende jeans. Queda a 8,5 del Medio nuevo y a 10,9 de Marino: se distingue.
-- DESCARTÉ
--   · Fundir AZI en AME por SQL (ver arriba: no lo impide el sistema, lo desaconseja lo que se perdería).
--   · Archivar AZI en esta migración: tiene 3 variantes (JEA-0013), una con movimientos; archivar un color con prendas lo deja en
--     su ficha como «inactivo». Se archiva cuando ya no tenga ninguna.
--   · Dejar el hex de Violeta apagado «hasta que llegue una prenda»: Felipe prefirió el vivo, que además se distingue más
--     de Glicina y Morado (ΔE2000 12,3 o más).
-- SE ROMPE SI
--   · Las prendas de «Azul medio» o de «Azul eléctrico» no son del azul que se eligió: Medio se pintaría vivo o Eléctrico apagado en
--     los filtros. Felipe lo confirmó para las dos el 2026-10-02; si cambia de idea, es un `update` de un hex.
--   · Un proveedor de tela necesita la referencia de Eléctrico o de Violeta: ya no hay código Pantone en la ficha (el ADR-0215 ya
--     decía que ningún tinte los alcanza). Si una prenda llega con su código real, se escribe a mano en Atributos.
--   · Se pega esta migración y la web aún no tiene la carta nueva: nada se rompe, solo cambia el círculo de cuatro colores.
--
-- IDEMPOTENTE: cada cambio de hex exige el hex VIEJO en el `where`: si alguien ya lo corrigió a mano, no se pisa. Las fichas solo
-- se escriben si difieren, pero NO están ancladas al texto viejo: PÉGALA UNA SOLA VEZ; volver a pegarla pisa una ficha que un Líder
-- haya editado después en Atributos. Sin políticas ni `alter`: se pega entero en el SQL Editor. El disparador
-- `colores_valida_combina_con` hace imposible un código inexistente, repetido o el propio color.
--
-- DESHACER:
--   update retail.colores set hex = '#4A5FA5', pantone_tcx = '18-3945 TCX' where codigo = 'AZE';
--   update retail.colores set hex = '#3936cd', pantone_tcx = null           where codigo = 'AME';
--   update retail.colores set hex = '#775496', pantone_tcx = '18-3633 TCX' where codigo = 'VIO';
--   (las fichas: ver 20261003190100_colores_completar_familias.sql)
-- ============================================================================

set lock_timeout = '3s';

update retail.colores set hex = '#2E5BF2', pantone_tcx = null
  where codigo = 'AZE' and upper(hex) = '#4A5FA5';

update retail.colores set hex = '#4A638D', pantone_tcx = '18-3928 TCX'
  where codigo = 'AME' and upper(hex) = '#3936CD';

update retail.colores set hex = '#7A3FB6', pantone_tcx = null
  where codigo = 'VIO' and upper(hex) = '#775496';

update retail.colores c
   set descripcion = v.descripcion,
       combina_con = v.combina_con
  from (values
    ('AZE', 'Azul eléctrico, vibrante y moderno: el azul que más se nota. Da energía y personalidad a una prenda protagonista; se ve mejor con neutros limpios.',
            array['BLA', 'CRU', 'NEG', 'GRI', 'MOS', 'CAM']),
    ('AME', 'Azul de lavado medio, algo más oscuro y sobrio que el denim: el azul de la camisa Oxford y del jean de lavado medio. Versátil y fácil de llevar; combina con casi todo.',
            array['BLA', 'CRU', 'BEI', 'CAM', 'MOS', 'GRI']),
    ('VIO', 'Morado intenso y vibrante, creativo y con mucha presencia. Distinguido en prendas protagonistas y accesorios; los neutros lo calman.',
            array['BLA', 'GRI', 'AML', 'AZM', 'DOR']),
    ('PER', 'Gris perlado muy claro, suave y fresco: entre el blanco y el gris, sin el calor del Crudo. Discreto y fácil de combinar; bonito en blusas y vestidos de aire romántico.',
            array['NEG', 'AZM', 'PAL', 'LIL', 'ORR'])
  ) as v(codigo, descripcion, combina_con)
 where c.codigo = v.codigo
   and (c.descripcion is distinct from v.descripcion or c.combina_con is distinct from v.combina_con);

-- Verificación (esperado: 4 filas):
--   select codigo, nombre, hex, pantone_tcx, left(descripcion, 40) as ficha, combina_con
--     from retail.colores where codigo in ('AZE', 'AME', 'VIO', 'PER') order by codigo;
--   AZE #2E5BF2 sin Pantone · AME #4A638D 18-3928 TCX · VIO #7A3FB6 sin Pantone · PER con ficha nueva.

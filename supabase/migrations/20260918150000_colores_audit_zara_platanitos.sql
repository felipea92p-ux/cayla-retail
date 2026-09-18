-- ============================================================================
-- 20260918150000 — 4 colores nuevos: hueco real encontrado auditando Zara/Platanitos
--
-- EL PROBLEMA
--   Los 30 colores de 20260912235500 vienen de V1 — nunca se investigaron
--   contra marcas reales, a diferencia de Familias/Categorías (ADR-0096).
--   Felipe pidió el mismo método (2026-09-18): navegar en vivo Zara/H&M/
--   Ralph Lauren/Bershka/Platanitos y comparar.
--
-- QUÉ SE ENCONTRÓ (navegación en vivo, no memoria)
--   Ralph Lauren y H&M no dieron datos usables: RL bloqueó el acceso
--   ("Access to this page has been denied") apenas se pidió una categoría,
--   y después empezó a bloquear hasta la portada — mismo resultado que ya
--   tuvo ADR-0096 con este sitio. H&M cargó pero sin listado con colores
--   visibles en esta pasada.
--
--   Zara Perú (zara.com/pe, camisetas/chaquetas/jeans de mujer) sí dio
--   datos reales, vía el texto alternativo de cada foto de producto
--   ("CAMISETA CUELLO BARCO - Rojo de Zara"). Confirmó que "Crudo" y
--   "Chocolate" —ya en el vocabulario de CAYLA— son nombres reales que
--   Zara usa hoy. Platanitos (Perú, calzado) confirmó que "Rosado" (no
--   "Rosa", como dice Zara España) es el término correcto acá — CAYLA ya
--   lo tenía bien sin haberlo investigado.
--
--   4 tonos aparecieron repetidas veces en Zara sin equivalente en CAYLA:
--   Khaki/Khaki claro (jeans, chaquetas), Gris antracita (jeans), Cobalto
--   (chaquetas de piel) y Tostado/Tostado claro (chaquetas, trench).
--   Decidido con Felipe cuáles sumar y cómo nombrarlos (2026-09-18):
--   las 4, "Caqui" en español (no "Khaki") — el vocabulario del cliente ya
--   tiene un préstamo del inglés cuando así se le dice en la calle
--   ("Animal print"), pero acá "caqui" es la palabra real en español y se
--   entiende igual en Perú, y CLAUDE.md pide español en lo que ve la
--   persona.
--
-- NACEN 'aprobado' DIRECTO, IGUAL QUE LOS 30 ORIGINALES
--   No son una propuesta de nadie que necesite pasar por el flujo de
--   proponer/aprobar (20260916220000): es contenido de marca que Felipe ya
--   decidió ahora mismo. `orden` los agrega al final (93-96) en vez de
--   renumerar los 30 existentes. OJO: la grilla de Colores ahora se agrupa
--   por familia (`gruposPorFamilia()` en `ColoresLista.tsx`), así que `orden`
--   ya no ordena la grilla entera — solo decide la posición DENTRO de cada
--   familia. 93-96 los deja al final de la suya (Cobalto tras Celeste, Gris
--   antracita tras Beige, Caqui y Tostado tras Chocolate): aceptable, pero no
--   es un orden de claro a oscuro. Afinarlo es una decisión de Felipe.
-- ============================================================================

insert into retail.colores (codigo, nombre, familia_color, hex, orden) values
  ('COB', 'Cobalto', 'azul', '#0047AB', 93),
  ('GRA', 'Gris antracita', 'neutro', '#3A3A3C', 94),
  ('CAQ', 'Caqui', 'tierra', '#A9976B', 95),
  ('TOS', 'Tostado', 'tierra', '#9C6B3E', 96)
on conflict (codigo) do nothing;

-- El INSERT de arriba corre sin sesión (migración, no un colaborador
-- autenticado): `fn_colores_estado_trigger` (20260916220000) no encuentra
-- `auth.uid()` ni `fn_es_lider()`, así que los deja en 'pendiente' — el
-- mismo trigger que protege el censo de piso. Estos 4 no son una propuesta
-- de nadie que un Líder tenga que revisar después: Felipe ya los decidió
-- ahora mismo, así que se aprueban en el acto, igual que los 30 originales
-- (que nacieron 'aprobado' porque su migración corrió ANTES de que este
-- trigger existiera).
update retail.colores set estado = 'aprobado'
  where codigo in ('COB', 'GRA', 'CAQ', 'TOS') and estado = 'pendiente';

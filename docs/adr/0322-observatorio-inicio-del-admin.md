# ADR-0322 — Observatorio: el Inicio de las cuentas Admin (2026-10-03)

**Decidió:** Felipe, con tres rondas de maquetas (`docs/maquetas/inicio-admin-2026-10/`, `inicio-admin-v2-2026-10/` y la aprobada,
`inicio-admin-v3-2026-10/`). Sus respuestas del mismo día: lo ven **todos los Admin**; **es el Inicio del Admin** (no una pantalla aparte);
contornos **oficiales del INEI**; y «hazlo todo en un solo bloque, idéntico a la maqueta». **Actualiza** el ADR-0275 (CAYLA Global): el
Inicio entra a la vista global. **Agrega** tres bucles de señal a la lista de excepciones del ADR-0136.

## El problema

El Inicio del Admin era el de un líder de tienda: «Hoy», «Te toca», accesos y «Equipo de hoy», todo pensado para quien vende. Felipe no
vende: quiere ver cómo va el negocio, comparar las tiendas y saber qué hay por revisar, «lo más visual posible, porque si hay mucho texto
acumulado se pierde el foco».

## La decisión

1. **El Inicio (`/`) de una cuenta Admin (`fn_es_admin()`) es el Observatorio** (`components/observatorio/Observatorio.tsx`). Los demás
   Inicios no cambian. El aterrizaje sigue mandando (`aterrizajeDe`): si el rol del Admin eligió otra pantalla principal, va ahí.
   - **Arriba:** lo vendido (cifra que rueda como un odómetro), la barra de la meta y la diferencia contra el mismo día de la semana pasada
     A ESTA HORA; los controles Hoy / 7 días / 30 días, Toda CAYLA / una tienda, y «Repetir el día».
   - **La tarjeta grande:** el mapa del Perú con cada tienda (tamaño por lo vendido, anillo por la meta, latido si su caja está abierta),
     el Taller y los traslados en curso. A la derecha, «De un vistazo», el ranking por % de la meta y la diferencia de cada tienda.
   - **Al elegir una tienda**, el mapa se acerca a su departamento (el contorno del Perú se transforma en el del departamento) y el panel
     muestra la tienda: caja y turno, sus cifras y cuatro pestañas (Ritmo con horas pico, Productos, Equipo, Stock), más sus avisos.
   - **Abajo:** el Taller y «Por revisar» (un orbe por aviso, con un aro que se llena con los días que lleva esperando el más antiguo).
2. **El Inicio entra a CAYLA Global** (ADR-0275): `inicio` está en `MODULOS_DE_LA_VISTA_GLOBAL` y `/` en `RUTAS_DE_LA_VISTA_GLOBAL`;
   `proxy.ts` ya no manda `/` a `/global`. En la vista global, la página muestra el Observatorio al Admin y manda a `/global` a quien no
   lo es. Elegir «CAYLA Global» en el selector estando en el Inicio se queda en el Inicio (el mapa vuelve al país).
3. **Con qué tienda abre:** si la sede elegida arriba es una tienda, acercado a ella; en CAYLA Global (o en una sede que no es tienda),
   el país entero. Cambiar la sede arriba mueve el mapa.
4. **Los datos.** Tres funciones nuevas, solo para el Admin (42501 si no lo es), `security definer`:
   - `fn_observatorio(p_dias)`: ventas por tienda y día (60 días) con la meta del día (`fn_parametros_caja`), cada venta de hoy con su
     minuto, las del mismo día de la semana pasada y, por tienda, su caja abierta y quién está en turno.
   - `fn_observatorio_tienda(p_ubicacion_id)`: categorías, prendas (por modelo y color) y equipo en tres ventanas (hoy, 7 y 30 días),
     horas pico (promedio de 4 semanas por día y hora) y prendas sin moverse 30 días.
   - `fn_observatorio_turno(p_ubicacion_id)`: envuelve `fn_asesoras_de_turno`; si Dynamic no responde devuelve `null` y la pantalla
     dice «no se pudo leer el turno», nunca «0 en turno».
   - No cuentan las ventas de prueba ni las que no están completadas; el vendedor es quien atendió y, si nadie, quien cobró, como
     `fn_ventas_del_dia`.
   - Lo demás reusa las lecturas que ya existen: avisos (`lib/observatorio.ts` sobre caja, por regularizar, traslados, apartados, por
     pagar, fotos, SUNAT y devoluciones), el Taller (`getOrdenesProduccion`) y lo que se va a agotar (el ritmo de Existencias).
   - Cada bloque falla por separado. **Si la función no está en la base, el Admin ve el Inicio de siempre**, no una pantalla rota.
5. **En vivo sin Realtime:** cada 30 s, con la pestaña a la vista, se lee `/api/observatorio` (GET con `x-espera: no`: no abre el loader).
   Una venta nueva hace una onda en su tienda y entra al ticker. El panel de una tienda se pide al acercarse o al pasar el mouse por su
   nombre, y queda guardado; el de la tienda con la que abre lo lee el servidor. Las cuentas de cada periodo y tienda son puras
   (`lib/observatorio-reglas.ts`): cambiar de periodo o de tienda no vuelve a la base.
6. **El mapa:** contornos del INEI (2007) publicados en `github.com/juaneladio/peru-geojson` (MPL-2.0). En el repo vive solo lo derivado
   (el Perú como unión de los 25 departamentos y los departamentos de las tiendas, simplificados), generado por
   `scripts/observatorio/contornos.py` con su atribución y licencia en la cabecera de `lib/observatorio-mapa-datos.ts` (14 KB). La
   geometría (proyección, encuadre, zoom) es pura y probada: `lib/observatorio-mapa.ts`. Una tienda se ubica por su sigla (TRU, AQP,
   LIM); una de otra ciudad sale en el ranking y en el panel, sin punto en el mapa.
7. **Movimiento:** el de la maqueta. Entrada en cascada, cifras que cuentan o ruedan, barras y anillos que crecen, trazos que se dibujan,
   zoom de 1,5 s (1,9 s entre dos tiendas) y «Repetir el día» en 110 ms por paso. **Tres bucles, porque son señales** (se suman a las
   excepciones del ADR-0136): el latido de una tienda con caja abierta, el cometa de un traslado en camino y el halo de un aviso urgente.
   Todo se apaga con `prefers-reduced-motion`.
8. **Modo oscuro listo, apagado:** `app/estilos/observatorio.css` define cada color como variable (`--o-*`) desde los tokens, dos veces:
   claro (hoy) y bajo `[data-tema="oscuro"] .obs`, el nombre que reservó el ADR-0169. Se encenderá cuando el ERP tenga modo oscuro.
9. **Todo el ancho:** como el Inicio de almacén, pide el ancho completo con `data-ancho-completo` (agregado a propósito a
   `lib/ancho-completo.test.ts`).

## Lo que se apartó de la maqueta, y por qué

La maqueta tenía datos inventados; con los reales:

- **Taller:** no hay meta del Taller ni un conteo de prendas cosidas por día. El anillo muestra el avance promedio de las órdenes en curso
  (etapas hechas sobre el total) y la lista dice órdenes en curso, atrasadas y prendas terminadas en el periodo. En el mapa, «N órdenes».
- **Equipo:** Dynamic no dice desde qué hora está cada persona; en su lugar, «en turno» o «en pausa».
- **Facturas:** el detalle son los tramos de Por pagar (vencidas y de esta semana), no una tira por día.
- **Apartados:** no registran pagos; el detalle es la lista de los que vencen hoy o mañana.
- **Fotos, SUNAT y facturas** se cuentan para toda la empresa (no hay reparto por tienda): su orbe lleva directo a su pantalla.
- **Los mini gráficos** de tickets y prendas usan las cuentas reales por hora o por día (la maqueta aproximaba con lo vendido).
- **Los arcos** salen de los traslados reales: en camino, con cometa; si no, punteados.
- El nombre de la ciudad, acercado, se corre 32 px para no quedar bajo el anillo de la tienda.
- Acercado a una tienda, el mapa solo deja los traslados que la tocan, y el Taller se ve solo acercado a Lima (en otro departamento
  caía sobre su nombre). Con el mapa alto del ERP entra más territorio que en la maqueta, y lo ajeno ensuciaba el acercamiento.

## Lo que se descartó

- **Una pantalla aparte (`/observatorio`)**: Felipe la quiso como Inicio; una ruta más sería una entrada más del menú y de Roles.
- **Realtime de Supabase**: para 3 tiendas, leer cada 30 s es más simple y no deja conexiones abiertas (principio 5).
- **Pedir el panel de todas las tiendas al cargar**: se pide la que se mira; las demás, al pasar el mouse.
- **Dibujar los bordes de los 24 departamentos** dentro del país: la maqueta no los tenía y agregaban ruido.

## Producción

`supabase/migrations/20261004020000_observatorio_inicio_del_admin.sql` (renombrada desde `20261004010000`, que `main` ya usaba):
solo funciones (`create or replace`), sin `alter` ni políticas, con `set lock_timeout = '3s'`; una sola parte (regla de ADR-0195).
**Aplicada en producción el 2026-10-03** por el MCP de Supabase, a pedido de Felipe; `apply_migration` la registró con la versión
`20261003220357` (la hora de aplicación, no la del archivo). Verificada: los md5 de los tres cuerpos coinciden con el archivo,
`anon` no las ejecuta y `authenticated` sí; corrida como la cuenta Admin de Felipe, `fn_observatorio` respondió en 63 ms con las
tres tiendas y `fn_observatorio_tienda` en 7–10 ms por tienda.

Lo que esa corrida mostró de producción: **ninguna tienda tiene meta configurada** (el Observatorio dice «Sin meta configurada»
y ordena el ranking por lo vendido hasta que se cargue en Configuración) y **el mismo día de la semana pasada no tuvo ventas**
(dice «Sin comparación» hasta que haya una semana de historia).

## Cómo se verificó

- `pnpm pruebas:observatorio` (14 comprobaciones contra Postgres, en ROLLBACK; en el CI, job pruebas-postgres).
- `lib/observatorio-reglas.test.ts` (16) y `lib/observatorio-mapa.test.ts` (10); la suite completa de la web, `tsc` y ESLint.
- En el navegador, contra la base local con ventas de demostración (foto antes y la base devuelta idéntica después): 1440, 1920 y
  375 px; acercar y alejar, las cuatro pestañas, 7 días, el detalle de un aviso, «Repetir el día», el cambio de sede arriba y CAYLA
  Global; y sin las funciones en la base, el Inicio de siempre.

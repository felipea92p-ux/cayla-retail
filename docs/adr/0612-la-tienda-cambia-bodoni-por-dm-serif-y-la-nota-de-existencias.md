# ADR-0612 — La tienda cambia Bodoni Moda por DM Serif Display, y la nota de existencias siempre dice si hay

- **Fecha:** 2026-11-05 · **Estado:** aceptada (Felipe eligió la letra mirando tres opciones sobre la portada, y pidió el cambio de la nota mirando la maqueta)
- **Decidió:** Felipe
- **Relacionados:** ADR-0524 (G · Pasarela, cuya letra de títulos reemplaza; el resto sigue igual), ADR-0408 (niveles de stock), `docs/maquetas/tienda-inicio-2026-11/` (la maqueta del Inicio)

## El problema

**La letra.** Bodoni Moda es una Didone: alterna trazos gruesos con hilos casi invisibles. Felipe, mirando la tienda: «es muy fina y a veces no se llega a leer muy bien». Se notaba en los tamaños medianos («Más de lo nuevo», «Arma tu outfit»), que son los que más se leen, sobre todo en el celular, por donde entrará la mayoría.

**La nota.** Con Trujillo elegida, cada prenda repetía «Hay en Trujillo» cuando el cliente ya sabía dónde estaba. Felipe pidió quitarlo. Al probar sin mensaje, pidió que volviera a decir algo: «si no lo mencionas no saben si hay o no».

## Lo que se decidió

**1. Los títulos van en DM Serif Display.** Felipe la eligió entre tres opciones aplicadas a la portada, en computadora y celular: DM Serif Display, Fraunces y Archivo. Public Sans sigue para el texto. Se cambia solo el token `--nombre`, en `apps/tienda/app/globals.css`, y la carga en `app/layout.tsx`; ninguna pieza cambia.

**2. La letra tiene un solo peso, así que el navegador no inventa negritas.** `font-synthesis-weight: none` en `body`: un `<b>` con esa letra no se ve borroso. Public Sans tiene sus pesos reales y no le afecta.

**3. La nota de la tarjeta siempre dice si hay y no repite la tienda elegida** (`notaDeStock`, `lib/stock.ts`):

| | Hay de sobra | Quedan pocas | No hay |
|---|---|---|---|
| **Con una tienda elegida** | «Disponible» | «Quedan 2», «Última» | Dónde sí: «Hay en Trujillo»; si en ninguna, «No hay por ahora» |
| **Con «Todas»** | «En todas las tiendas», «Hay en Lima y Trujillo» | «Quedan pocas» | «No hay por ahora» |

«Solo en Trujillo» se conserva cuando, con «Todas», una sola tienda tiene. Con una sola tienda en la web, la nota es «Disponible».

**4. El probador usa la misma nota.** `notaDelColor` existía para decir dónde hay cuando la tarjeta callaba. Como ya no calla, se borró: una sola regla para los dos lugares. «Hay en 2 tiendas» pasa a decir cuáles.

## Por qué no las otras letras

- **Fraunces:** se lee bien, pero es la menos «moda» de las tres.
- **Archivo ancha:** era la recomendación de Claude, la más legible y la que mejor llena la portada, pero Felipe prefirió conservar un aire clásico. La tienda ya venía de Archivo («A · Muro», ADR-0408).

## Lo que queda igual

La paleta, los rótulos en versalitas y el movimiento de ADR-0524. La portada nueva todavía no se construye; esto solo cambia la letra y la nota.

## Cómo se verificó

Las pruebas de `apps/tienda` cubren cada caso de la nota. La carga real de DM Serif, normal y cursiva, se comprobó en la tienda local. El aspecto en las páginas se revisó en producción, inyectando la letra en un navegador sin enviar nada, a 390 px y 1440 px: Inicio, catálogo, ficha y looks, y en celular Entrar y Tiendas. **No se revisó en local con prendas:** la base local no tiene Vitrina, así que la nota nueva sobre una tarjeta real se ve por primera vez en el PR.

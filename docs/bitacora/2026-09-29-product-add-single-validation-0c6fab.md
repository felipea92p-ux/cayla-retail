## 2026-09-29 — Una identidad para todo el alta de producto (ADR-0285)

**QUÉ HICE:** «Nueva prenda» pide ahora quién registra UNA sola vez, en un recuadro arriba de los pasos, y esa persona firma la prenda y todo lo que se crea a mitad de camino (marca, talla, tejido, color, etiqueta, muestra, valor, categoría). El paso 4 solo muestra el nombre con «Cambiar». Se acaba al salir de la pantalla; «Crear otro parecido» la conserva. Web solamente, sin migración.

**POR QUÉ ASÍ:** El ADR-0280 quitó el combo de esos ocho guardados, pero en una terminal compartida (la del almacén) los dejaba sin ninguna persona en el historial. Los ocho componentes piden su firma con `useFirmaDeMitad`: dentro del alta manda los mismos encabezados que el guardado final (la base no cambia); fuera del alta (Marcas, ficha, conteo) sigue soltado como en el ADR-0280.

**QUÉ SE ROMPERÍA SIN ESTO:** Sin un punto único, cada componente nuevo del alta volvería a pintar su combo (la fricción de las 9 veces) o a guardar sin nombre. Una prueba (`identidad-alta-reglas.test.ts`) falla si un archivo de `components/alta-producto/` firma a mano o pinta su propio combo, o si guardar la prenda con éxito suelta la identidad.

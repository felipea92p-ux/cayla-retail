import { requirePersonaActual } from "@/lib/persona";
import { ErrorDeLectura, leerArchivo, leerGoogleSheets, MAX_BYTES } from "@/lib/importacion/leer-archivo";

// POST /api/importacion/leer
//   multipart con `archivo`  → lee .xlsx / .csv
//   JSON con { url }         → lee una hoja de Google Sheets
//
// CONTRATO
//   PROMETE: devolver las filas TAL COMO ESTABAN, sin convertir nada, y una
//            sugerencia de en qué fila está la cabecera.
//   ASUME:   sesión válida y rol de Líder (importar un catálogo es suyo).
//   NO HACE: no llama a la IA, no toca la base, no guarda el archivo. Este paso
//            es solo mirar — y por eso se puede probar sin gastar un centavo.

export async function POST(request: Request) {
  const persona = await requirePersonaActual();
  if (persona.rol !== "lider") {
    return Response.json({ error: "Solo un Líder puede importar un catálogo." }, { status: 403 });
  }

  try {
    const tipo = request.headers.get("content-type") ?? "";

    if (tipo.includes("application/json")) {
      const { url } = (await request.json()) as { url?: string };
      if (!url) return Response.json({ error: "Falta el enlace de la hoja." }, { status: 400 });
      return Response.json(await leerGoogleSheets(url));
    }

    const form = await request.formData();
    const archivo = form.get("archivo");
    if (!(archivo instanceof File)) {
      return Response.json({ error: "No llegó ningún archivo." }, { status: 400 });
    }
    // Se comprueba antes de leerlo entero a memoria: un archivo de 500 MB no
    // debería llegar a `arrayBuffer()` para recién ahí ser rechazado.
    if (archivo.size > MAX_BYTES) {
      return Response.json(
        { error: `El archivo pesa ${(archivo.size / 1024 / 1024).toFixed(1)} MB y el máximo son ${MAX_BYTES / 1024 / 1024} MB.` },
        { status: 413 }
      );
    }

    return Response.json(await leerArchivo(await archivo.arrayBuffer(), archivo.name));
  } catch (e) {
    // ErrorDeLectura ya trae un mensaje escrito para quien lo va a leer en
    // pantalla, con la salida incluida ("guárdalo como CSV y vuelve a subirlo").
    // Cualquier otra cosa es un fallo nuestro y no se disfraza de consejo.
    if (e instanceof ErrorDeLectura) return Response.json({ error: e.message }, { status: 422 });
    return Response.json(
      { error: `No se pudo leer el archivo: ${e instanceof Error ? e.message : "error desconocido"}` },
      { status: 500 }
    );
  }
}

import type { Metadata } from "next";
import { createHash } from "node:crypto";
import { connection } from "next/server";
import { SubirFotoPorQr } from "@/components/foto-qr/SubirFotoPorQr";
import { capturarError } from "@/lib/errores";
import { esPermiso, mensajeDelQr } from "@/lib/foto-por-qr-reglas";
import { crearClienteAdmin } from "@/lib/supabase-admin";

// PÚBLICA (ADR-0699, `lib/rutas-publicas.ts`): la abre el celular al escanear el QR de un modelo en Recibir ▸ Contar, sin sesión. Solo dice
// de qué modelo es la foto y si el código sigue vigente; la foto la recibe `POST /api/foto-qr/<permiso>`.

export const metadata: Metadata = { title: "Foto de la prenda — CAYLA", robots: { index: false, follow: false } };

type Info = { nombre: string; vigente: boolean; quedan: number };

export default async function PaginaFotoPorQr({ params }: { params: Promise<{ permiso: string }> }) {
  await connection();
  const { permiso } = await params;
  let info: Info | null = null;
  let error: string | null = null;
  if (!esPermiso(permiso)) error = mensajeDelQr("qr_no_existe");
  else {
    try {
      const huella = createHash("sha256").update(permiso).digest("hex");
      const { data, error: errInfo } = (await crearClienteAdmin().rpc("fn_foto_por_qr_info" as never, { p_token_hash: huella } as never)) as unknown as {
        data: Info[] | null;
        error: unknown;
      };
      if (errInfo) throw errInfo;
      info = data?.[0] ?? null;
      if (!info) error = mensajeDelQr("qr_no_existe");
      else if (!info.vigente) error = mensajeDelQr(info.quedan > 0 ? "qr_vencido" : "qr_lleno");
    } catch (e) {
      capturarError("foto-qr.pagina", e);
      error = mensajeDelQr(null);
    }
  }
  return <SubirFotoPorQr permiso={permiso} nombre={info?.nombre ?? null} quedan={info?.quedan ?? 0} error={error} />;
}

import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { AUTH_COOKIE, verifySessionToken } from "@/lib/auth";

export const runtime = "nodejs";

// POST /api/blob/upload
// Emite el token para que el navegador suba el Excel directo a Vercel Blob,
// evitando el límite de 4.5 MB del cuerpo de las peticiones serverless.
export async function POST(req: Request): Promise<NextResponse> {
  const body = (await req.json()) as HandleUploadBody;

  try {
    const jsonResponse = await handleUpload({
      body,
      request: req,
      onBeforeGenerateToken: async () => {
        // Solo un usuario con sesión válida puede obtener un token de subida.
        const token = (await cookies()).get(AUTH_COOKIE)?.value;
        const session = await verifySessionToken(token);
        if (!session) throw new Error("No autorizado");

        return {
          allowedContentTypes: [
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            "application/vnd.ms-excel",
            "application/vnd.ms-excel.sheet.macroEnabled.12",
            "application/octet-stream",
          ],
          maximumSizeInBytes: 50 * 1024 * 1024, // 50 MB
        };
      },
      // El procesamiento lo dispara el cliente con la URL del blob, así que
      // acá no hace falta hacer nada al completarse la subida.
      onUploadCompleted: async () => {},
    });

    return NextResponse.json(jsonResponse);
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error).message ?? "No se pudo autorizar la subida" },
      { status: 400 },
    );
  }
}

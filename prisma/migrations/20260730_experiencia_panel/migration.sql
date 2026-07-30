-- CreateTable
CREATE TABLE "ExperienciaSnapshot" (
    "id" TEXT NOT NULL,
    "capturadoEn" TIMESTAMP(3) NOT NULL,
    "importadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "importadoPor" TEXT,
    "publicaciones" INTEGER NOT NULL,
    "conDetalle" INTEGER NOT NULL,
    "skus" INTEGER NOT NULL,
    "reclamos" INTEGER NOT NULL,
    "payload" JSONB NOT NULL,

    CONSTRAINT "ExperienciaSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ExperienciaSnapshot_capturadoEn_idx" ON "ExperienciaSnapshot"("capturadoEn");

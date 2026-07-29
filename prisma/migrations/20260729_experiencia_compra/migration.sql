-- AlterTable
ALTER TABLE "ReportConfig" ADD COLUMN     "emailTo" TEXT;

-- AlterTable
ALTER TABLE "ReportRun" ADD COLUMN     "emailStatus" TEXT,
ADD COLUMN     "emailTo" TEXT;

-- CreateTable
CREATE TABLE "ExperienciaScore" (
    "itemId" TEXT NOT NULL,
    "sku" TEXT,
    "codigo" TEXT,
    "titulo" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "nivel" TEXT NOT NULL,
    "checkedAt" TIMESTAMP(3) NOT NULL,
    "bajoDe" INTEGER,
    "bajoDelta" INTEGER,
    "bajoEn" TIMESTAMP(3),
    "bajoCruzo100" BOOLEAN NOT NULL DEFAULT false,
    "bajoProblema" TEXT,
    "avisadoEn" TIMESTAMP(3),
    "avisoStatus" TEXT,
    "vistoEn" TIMESTAMP(3),
    "vistoPor" TEXT,

    CONSTRAINT "ExperienciaScore_pkey" PRIMARY KEY ("itemId")
);

-- CreateIndex
CREATE INDEX "ExperienciaScore_codigo_idx" ON "ExperienciaScore"("codigo");

-- CreateIndex
CREATE INDEX "ExperienciaScore_bajoEn_idx" ON "ExperienciaScore"("bajoEn");

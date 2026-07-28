-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "Container" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "supplier" TEXT,
    "eta" TIMESTAMP(3),
    "notes" TEXT,
    "totalPrice" DOUBLE PRECISION,
    "freightCost" DOUBLE PRECISION,
    "origin" TEXT NOT NULL DEFAULT 'china',
    "status" TEXT NOT NULL DEFAULT 'produccion',
    "receivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Container_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContainerDoc" (
    "id" TEXT NOT NULL,
    "containerId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "size" INTEGER,
    "uploadedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContainerDoc_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Product" (
    "id" TEXT NOT NULL,
    "containerId" TEXT NOT NULL,
    "rowIndex" INTEGER NOT NULL,
    "photo" TEXT,
    "fotoManual" BOOLEAN NOT NULL DEFAULT false,
    "codigo" TEXT,
    "precioChina" DOUBLE PRECISION,
    "cantidadPorCaja" INTEGER,
    "unidades" INTEGER,
    "montoTotal" DOUBLE PRECISION,
    "unidad" TEXT,
    "remark" TEXT,
    "cbmUnitario" DOUBLE PRECISION,
    "cbmTotal" DOUBLE PRECISION,
    "detalle" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Reposicion" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "periodo" TEXT,
    "meses" INTEGER NOT NULL DEFAULT 4,
    "ventas" JSONB,
    "stock" JSONB,
    "ventasFile" TEXT,
    "stockFile" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Reposicion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CostOverride" (
    "sku" TEXT NOT NULL,
    "cost" DOUBLE PRECISION NOT NULL,
    "note" TEXT,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CostOverride_pkey" PRIMARY KEY ("sku")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT,
    "modules" TEXT[],
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Profile" (
    "username" TEXT NOT NULL,
    "photoUrl" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Profile_pkey" PRIMARY KEY ("username")
);

-- CreateTable
CREATE TABLE "ReportConfig" (
    "key" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "whatsappTo" TEXT,
    "params" JSONB,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReportConfig_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "CodigoFoto" (
    "codigo" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "updatedBy" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CodigoFoto_pkey" PRIMARY KEY ("codigo")
);

-- CreateTable
CREATE TABLE "ProductOrigin" (
    "codigo" TEXT NOT NULL,
    "origin" TEXT NOT NULL DEFAULT 'brasil',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductOrigin_pkey" PRIMARY KEY ("codigo")
);

-- CreateTable
CREATE TABLE "VentaHistorica" (
    "code" TEXT NOT NULL,
    "mes" TEXT NOT NULL,
    "qty" INTEGER NOT NULL,

    CONSTRAINT "VentaHistorica_pkey" PRIMARY KEY ("code","mes")
);

-- CreateTable
CREATE TABLE "ReportRun" (
    "id" TEXT NOT NULL,
    "reportKey" TEXT NOT NULL,
    "trigger" TEXT NOT NULL DEFAULT 'manual',
    "items" JSONB NOT NULL,
    "summary" JSONB NOT NULL,
    "whatsappStatus" TEXT,
    "whatsappTo" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReportRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Container_receivedAt_idx" ON "Container"("receivedAt");

-- CreateIndex
CREATE INDEX "Container_status_idx" ON "Container"("status");

-- CreateIndex
CREATE INDEX "ContainerDoc_containerId_idx" ON "ContainerDoc"("containerId");

-- CreateIndex
CREATE INDEX "Product_containerId_idx" ON "Product"("containerId");

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE INDEX "VentaHistorica_mes_idx" ON "VentaHistorica"("mes");

-- CreateIndex
CREATE INDEX "ReportRun_reportKey_createdAt_idx" ON "ReportRun"("reportKey", "createdAt");

-- AddForeignKey
ALTER TABLE "ContainerDoc" ADD CONSTRAINT "ContainerDoc_containerId_fkey" FOREIGN KEY ("containerId") REFERENCES "Container"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_containerId_fkey" FOREIGN KEY ("containerId") REFERENCES "Container"("id") ON DELETE CASCADE ON UPDATE CASCADE;


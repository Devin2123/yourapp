// src/lib/db.ts
import { PrismaClient } from "@prisma/client";

// Create a typed handle to globalThis so TS knows about `prisma`
const g = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = g.prisma ?? new PrismaClient({ log: ["error"] });

if (process.env.NODE_ENV !== "production") g.prisma = prisma;

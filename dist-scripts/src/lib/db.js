"use strict";
var _a;
Object.defineProperty(exports, "__esModule", { value: true });
exports.prisma = void 0;
// src/lib/db.ts
const client_1 = require("@prisma/client");
// Create a typed handle to globalThis so TS knows about `prisma`
const g = globalThis;
exports.prisma = (_a = g.prisma) !== null && _a !== void 0 ? _a : new client_1.PrismaClient({ log: ["error"] });
if (process.env.NODE_ENV !== "production")
    g.prisma = exports.prisma;

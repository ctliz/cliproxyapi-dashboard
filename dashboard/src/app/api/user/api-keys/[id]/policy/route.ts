import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/lib/auth/session";
import { validateOrigin } from "@/lib/auth/origin";
import { prisma } from "@/lib/db";
import { syncTokenModelPolicyFile } from "@/lib/api-keys/policy-sync";
import { syncApiKeyFastPolicyFile } from "@/lib/api-keys/fast-sync";
import { logger } from "@/lib/logger";
import { z } from "zod";
import { Errors, apiSuccess } from "@/lib/errors";

const UpdatePolicySchema = z.object({
  policyEnabled: z.boolean(),
  fastEnabled: z.boolean().optional(),
  allowedModels: z.array(z.string().trim().min(1)).default([]),
  fallbackProvider: z.string().trim().nullable().optional(),
  fallbackModel: z.string().trim().nullable().optional(),
});

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await verifySession();
  if (!session) {
    return Errors.unauthorized();
  }

  try {
    const { id } = await params;
    const apiKey = await prisma.userApiKey.findFirst({
      where: {
        id,
        userId: session.userId,
      },
      select: {
        id: true,
        name: true,
        policyEnabled: true,
        fastEnabled: true,
        allowedModels: true,
        fallbackProvider: true,
        fallbackModel: true,
      },
    });

    if (!apiKey) {
      return Errors.notFound("API key");
    }

    return NextResponse.json({ policy: apiKey });
  } catch (error) {
    return Errors.internal("Failed to fetch API key policy", error);
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await verifySession();
  if (!session) {
    return Errors.unauthorized();
  }

  const originError = validateOrigin(request);
  if (originError) {
    return originError;
  }

  try {
    const { id } = await params;
    const body = await request.json();
    const parsed = UpdatePolicySchema.safeParse(body);

    if (!parsed.success) {
      return Errors.zodValidation(parsed.error.issues);
    }

    const existingKey = await prisma.userApiKey.findFirst({
      where: {
        id,
        userId: session.userId,
      },
      select: { id: true, fastEnabled: true },
    });

    if (!existingKey) {
      return Errors.notFound("API key");
    }

    const fallbackProvider = parsed.data.fallbackProvider?.trim() || null;
    const fallbackModel = parsed.data.fallbackModel?.trim() || null;

    const updated = await prisma.userApiKey.update({
      where: { id },
      data: {
        policyEnabled: parsed.data.policyEnabled,
        fastEnabled: parsed.data.fastEnabled ?? existingKey.fastEnabled,
        allowedModels: parsed.data.allowedModels,
        fallbackProvider,
        fallbackModel,
      },
      select: {
        id: true,
        name: true,
        policyEnabled: true,
        fastEnabled: true,
        allowedModels: true,
        fallbackProvider: true,
        fallbackModel: true,
      },
    });

    const [modelPolicySync, fastPolicySync] = await Promise.all([
      syncTokenModelPolicyFile(),
      syncApiKeyFastPolicyFile(),
    ]);
    if (!modelPolicySync.ok) {
      logger.error({ error: modelPolicySync.error }, "Failed to write token-model-policy file after update");
    }
    if (!fastPolicySync.ok) {
      logger.error({ error: fastPolicySync.error }, "Failed to write API key Fast policy after update");
    }

    return apiSuccess({
      apiKey: updated,
      policySync: {
        ok: modelPolicySync.ok && fastPolicySync.ok,
        rulesCount: modelPolicySync.rulesCount,
        fastRulesCount: fastPolicySync.rulesCount,
      },
    });
  } catch (error) {
    return Errors.internal("Failed to update API key policy", error);
  }
}

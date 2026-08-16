import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/lib/auth/session";
import { validateOrigin } from "@/lib/auth/origin";
import { prisma } from "@/lib/db";
import { syncTokenModelPolicyFile } from "@/lib/api-keys/policy-sync";
import { logger } from "@/lib/logger";
import { z } from "zod";
import { Errors, apiSuccess } from "@/lib/errors";

const UpdatePolicySchema = z.object({
  policyEnabled: z.boolean(),
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
      select: { id: true },
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
        allowedModels: parsed.data.allowedModels,
        fallbackProvider,
        fallbackModel,
      },
      select: {
        id: true,
        name: true,
        policyEnabled: true,
        allowedModels: true,
        fallbackProvider: true,
        fallbackModel: true,
      },
    });

    const syncResult = await syncTokenModelPolicyFile();
    if (!syncResult.ok) {
      logger.error({ error: syncResult.error }, "Failed to write token-model-policy file after update");
    }

    return apiSuccess({
      apiKey: updated,
      policySync: {
        ok: syncResult.ok,
        rulesCount: syncResult.ok ? syncResult.rulesCount : (syncResult.rulesCount ?? 0),
      },
    });
  } catch (error) {
    return Errors.internal("Failed to update API key policy", error);
  }
}

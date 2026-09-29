import { join } from "node:path";

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;

export const resolveModelRole = async (
  role: string,
): Promise<string> => {
  const override = Deno.env.get("MODEL_RESOLVER");
  const home = Deno.env.get("HOME");
  if (!isNonEmptyString(home)) throw new Error("HOME is required");
  const resolver = override ??
    join(home, ".pi", "agent", "resolve-model.sh");
  const cmd = new Deno.Command("bash", {
    args: [resolver, role],
    stdout: "piped",
    stderr: "null",
  });
  const out = await cmd.output();
  if (!out.success) throw new Error("model resolution failed");
  const model = new TextDecoder().decode(out.stdout).trim();
  if (!isNonEmptyString(model)) throw new Error("empty resolved model");
  return model;
};

export const resolveRouteReviewId = async (): Promise<string | undefined> => {
  const override = Deno.env.get("MODEL_RESOLVER");
  const home = Deno.env.get("HOME");
  if (!isNonEmptyString(home)) return undefined;
  const resolver = override ??
    join(home, ".pi", "agent", "resolve-model.sh");
  const cmd = new Deno.Command("bash", {
    args: [resolver, "--field", "id", "route.review"],
    stdout: "piped",
    stderr: "null",
  });
  const out = await cmd.output();
  if (!out.success) return undefined;
  const id = new TextDecoder().decode(out.stdout).trim();
  return isNonEmptyString(id) ? id : undefined;
};

export const assertAuditorIndependent = async (
  auditorModel: string,
  jevModel: string | undefined,
): Promise<void> => {
  const blocked = new Set<string>();
  if (jevModel) blocked.add(jevModel);
  const routeId = await resolveRouteReviewId();
  if (routeId) blocked.add(routeId);
  if (blocked.has(auditorModel)) {
    throw new Error("auditor model must differ from Jev routing model");
  }
};

export const defaultAuditorRole = (): string => "review.codex";

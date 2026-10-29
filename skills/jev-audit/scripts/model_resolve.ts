import { join } from "node:path";

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;

export const resolveModelRole = async (
  role: string,
): Promise<string> => {
  const override = process.env["MODEL_RESOLVER"];
  const home = process.env["HOME"];
  if (!isNonEmptyString(home)) throw new Error("HOME is required");
  const resolver = override ??
    join(home, ".pi", "agent", "resolve-model.sh");
  const bash = process.env["JEV_AUDIT_BASH"] ?? "bash";
  const cmd = Bun.spawn([bash, resolver, role], { stdout: "pipe", stderr: "ignore" });
  if (await cmd.exited !== 0) throw new Error("model resolution failed");
  const model = (await new Response(cmd.stdout).text()).trim();
  if (!isNonEmptyString(model)) throw new Error("empty resolved model");
  return model;
};

export const resolveRouteReviewId = async (): Promise<string | undefined> => {
  const override = process.env["MODEL_RESOLVER"];
  const home = process.env["HOME"];
  if (!isNonEmptyString(home)) return undefined;
  const resolver = override ??
    join(home, ".pi", "agent", "resolve-model.sh");
  const bash = process.env["JEV_AUDIT_BASH"] ?? "bash";
  const cmd = Bun.spawn([bash, resolver, "--field", "id", "route.review"], {
    stdout: "pipe", stderr: "ignore",
  });
  if (await cmd.exited !== 0) return undefined;
  const id = (await new Response(cmd.stdout).text()).trim();
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
  if (blocked.size === 0) {
    throw new Error("auditor independence cannot be verified");
  }
  if (blocked.has(auditorModel)) {
    throw new Error("auditor model must differ from Jev routing model");
  }
};

export const defaultAuditorRole = (): string => "review.codex";

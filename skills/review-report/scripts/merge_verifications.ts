import { mergeVerifications, validateReport } from "./render_report.ts";

const usage = () => {
  console.error(
    "usage: merge_verifications.ts <report.json> <verification.json> [-o report.json]",
  );
};

export const main = async (argv: string[]) => {
  let reportPath: string | undefined;
  let verificationPath: string | undefined;
  let output: string | undefined;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "-o" || arg === "--output") {
      output = argv[++i];
      if (!output) {
        console.error("missing output path");
        return 1;
      }
    } else if (arg.startsWith("-")) {
      console.error(`unknown option: ${arg}`);
      usage();
      return 1;
    } else if (!reportPath) {
      reportPath = arg;
    } else if (!verificationPath) {
      verificationPath = arg;
    } else {
      console.error(`unexpected argument: ${arg}`);
      usage();
      return 1;
    }
  }

  if (!reportPath || !verificationPath) {
    usage();
    return 1;
  }

  let report: unknown;
  let verification: unknown;
  try {
    report = JSON.parse(await Deno.readTextFile(reportPath));
    verification = JSON.parse(await Deno.readTextFile(verificationPath));
  } catch (error) {
    console.error(
      `read/parse error: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    return 1;
  }

  let merged: Record<string, unknown>;
  try {
    merged = mergeVerifications(
      report as Record<string, unknown>,
      verification,
    );
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    return 1;
  }

  const errors = validateReport(merged);
  if (errors.length > 0) {
    for (const error of errors) console.error(error);
    return 1;
  }

  const outPath = output ?? reportPath;
  try {
    await Deno.writeTextFile(outPath, JSON.stringify(merged, null, 2) + "\n");
  } catch (error) {
    console.error(
      `write error: ${error instanceof Error ? error.message : String(error)}`,
    );
    return 1;
  }

  console.log(outPath);
  return 0;
};

if (import.meta.main) {
  Deno.exit(await main(Deno.args));
}

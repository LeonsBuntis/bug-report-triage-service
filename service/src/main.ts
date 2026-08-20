import { readFileSync } from "node:fs";
import { OpenAIClassifier } from "./core/classifier";
import { parseCliArgs, formatDebugOutput, readReportText } from "./infra/cli";
import { OpenAIDeduper } from "./core/deduper";
import { GiteaApiClient } from "./infra/gitea";
import { requireEnv } from "./infra/env";
import { resolveLlmConfig } from "./infra/openai";
import { runTriage } from "./core/orchestrator";

async function main(): Promise<void> {
  const { reportArg, debug } = parseCliArgs(process.argv, process.env);
  const reportText = (await readReportText(reportArg)).trim();
  if (!reportText) {
    console.error("No report text provided (pass an argument or pipe stdin)");
    process.stdout.write("NOK\n");
    process.exitCode = 1;
    return;
  }

  const tokenFile = process.env.GITEA_TOKEN_FILE ?? "/shared/gitea_token";
  const token = readFileSync(tokenFile, "utf8").trim();

  const giteaClient = new GiteaApiClient({
    baseUrl: requireEnv("GITEA_URL"),
    owner: requireEnv("GITEA_OWNER"),
    repo: requireEnv("GITEA_REPO_NAME"),
    token,
  });

  const { client, model } = resolveLlmConfig(process.env);
  const classifier = OpenAIClassifier.create(client, model);
  const deduper = OpenAIDeduper.create(client, model);

  const result = await runTriage(reportText, {
    classifier,
    deduper,
    giteaClient,
  });

  // Debug goes to stderr so the stdout contract stays exactly OK/NOK.
  if (debug) {
    process.stderr.write(`${formatDebugOutput(result)}\n`);
  }

  process.stdout.write(`${result.outcome}\n`);
  if (result.outcome === "NOK") {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.stdout.write("NOK\n");
  process.exitCode = 1;
});

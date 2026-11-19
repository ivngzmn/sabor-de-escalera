import type { Logger } from "@opentelemetry/api-logs";
import { OTLPLogExporter } from "@opentelemetry/exporter-logs-otlp-http";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { LoggerProvider, SimpleLogRecordProcessor } from "@opentelemetry/sdk-logs";
import { readServerConfig } from "./config";

let logger: Logger | null | undefined;
let provider: LoggerProvider | null = null;

function getPostHogLogger() {
  if (logger !== undefined) return logger;

  // Off unless ANALYTICS_ENABLED and PostHog are configured. These records carry
  // no user or device identifiers, only the operation name and action.
  const posthog = readServerConfig().posthog;
  if (!posthog) {
    logger = null;
    return logger;
  }
  const { token, host } = posthog;

  provider = new LoggerProvider({
    resource: resourceFromAttributes({ "service.name": "sabor-de-escalera" }),
    processors: [
      new SimpleLogRecordProcessor({
        exporter: new OTLPLogExporter({
          url: `${host}/i/v1/logs`,
          headers: { Authorization: `Bearer ${token}` },
        }),
      }),
    ],
  });
  logger = provider.getLogger("posthog-recipe-operations");
  return logger;
}

/** Emits only purpose-written operational logs for PostHog; existing app logs remain local. */
export function logRecipeOperation(
  body: "recipe_favorite_updated" | "recipe_draft_mutation_completed",
  action: string,
) {
  getPostHogLogger()?.emit({
    severityText: "INFO",
    body,
    attributes: { action, area: "recipes" },
  });
}

/** Call from a long-running server's shutdown hook; request handlers never wait for log delivery. */
export async function shutdownPostHogLogs() {
  await provider?.shutdown().catch(() => {});
  provider = null;
  logger = undefined;
}

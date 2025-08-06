import { LogBuffer } from "./log-buffer";

export { LogBuffer };

export interface Env {
	LOG_BUCKET: R2Bucket;
	LOG_BUFFER: DurableObjectNamespace;
}

function getLogPrefix(url: URL): string {
	const domain = url.hostname.replace(/^www\./, '');
	return domain;
}

function isBot(userAgent: string | null): boolean {
	if (!userAgent) return false;
	const ua = userAgent.toLowerCase().trim();

	const knownBots = [
		// General
		"bot", "crawler", "spider", "slurp", "crawling", "scan", "search", "preview",

		// Search engines
		"googlebot", "bingbot", "baiduspider", "yandex", "sogou", "exabot", "ia_archiver",

		// Social media bots
		"facebot", "facebookexternalhit", "twitterbot", "linkedinbot", "whatsapp", "telegrambot", "pinterest",

		// SEO/analytics crawlers
		"semrushbot", "ahrefsbot", "rogerbot",

		// AI / LLM bots
		"gptbot", "chatgpt", "openai", "perplexity", "perplexity-user",
		"ccbot", "duckassistbot", "claudebot", "claude-user", "claude-searchbot",
		"meta-externalagent", "meta-externalfetcher", "google-cloudvertexbot",
		"mistral", "mistralai-user", "oai-searchbot", "petalbot",
		"bytespider", "tiktokspider", "prorata", "timpibot",

		// Misc
		"discordbot", "applebot", "amazonbot"
	];

	return knownBots.some(pattern => ua.includes(pattern));
}

async function logToDurableObject(env: Env, domain: string, logLine: string) {
	const id = env.LOG_BUFFER.idFromName(domain);
	const stub = env.LOG_BUFFER.get(id);

	try {
      const res = await stub.fetch("https://cloudflare.worker/log?domain=" + encodeURIComponent(domain), {
        method: "POST",
        body: logLine,
      });
      if (!res.ok) {
        console.error("DO log failed:", await res.text());
		console.error("Failed logLine:", logLine);
      }
    } catch (err) {
      console.error("DO fetch error:", err);
    }
}

// === Sanitize helper ===
function sanitize(str: string): string {
	return str.replace(/[\r\n\t]/g, ' ').replace(/"/g, '\\"').trim();
}

export default {
	async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
	  const url = new URL(request.url);
	  const pathname = url.pathname;
	  const now = new Date();

	  if (request.method === "POST" && pathname === "/flush") {
		const domain = url.searchParams.get("domain");
		if (!domain) {
			return new Response("Missing ?domain=xxx", { status: 400 });
		}
		const id = env.LOG_BUFFER.idFromName(domain);
		const stub = env.LOG_BUFFER.get(id);
		return stub.fetch(new Request("https://cloudflare.worker/flush", { method: "POST" }));
	}
	// === Extract log fields ===
	const ip = request.headers.get("cf-connecting-ip") || "-";
	const domain = url.hostname;
	const timestamp = `[${String(now.getUTCDate()).padStart(2, '0')}/${now.toLocaleString("en-US", { month: "short" })}/${now.getUTCFullYear()}:${now.toISOString().slice(11, 19)} +0000]`;
	const method = request.method;
	const path = url.pathname + url.search;
	const protocol = (request as any).cf?.httpProtocol || "-";
	const referer = request.headers.get("referer") || "-";
	const userAgent = request.headers.get("user-agent") || "-";
	const tls = (request as any).cf?.tlsVersion || "-";

	const isBotRequest = isBot(userAgent);
	const isStaticAsset = /\.(?:png|jpe?g|gif|webp|svg|ico|css|js|woff2?)$/i.test(url.pathname);
	const cacheEverything = !isBotRequest || isStaticAsset;

	// === Measure timing and size ===
	const t0 = performance.now();
	const res = await fetch(request, {
		cf: {
			cacheEverything: cacheEverything
		}
	});
	const t1 = performance.now();
	const duration = ((t1 - t0) / 1000).toFixed(3);
	const timing = `${duration} ${duration} ${duration}`;
	const status = res.status;

	let size = "-";
	try {
		const body = await res.clone().arrayBuffer();
		size = body.byteLength.toString();
	} catch (_) {}

	const safeReferer = sanitize(referer);
	const safeUserAgent = sanitize(userAgent);

	// === Create sanitized log line ===
	const logLine = `${ip} ${domain} - ${timestamp} "${method} ${path} ${protocol}" ${status} ${size} "${safeReferer}" "${safeUserAgent}" | ${tls} | ${timing}\n`;

	// === Save asynchronously ===
	const logPrefix = getLogPrefix(url);
	ctx.waitUntil(logToDurableObject(env, logPrefix, logLine));

	return res;
	},

	durableObjects: {
		LogBuffer
	},
};
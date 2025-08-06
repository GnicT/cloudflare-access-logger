export interface Env {
    LOG_BUCKET: R2Bucket;
}

export class LogBuffer {
    state: DurableObjectState;
    env: Env;
    buffer: string[] = [];
    flushThreshold: number = 100; // Flush when buffer reaches this size
    flushIntervalMs: number = 5 * 60 * 1000; // Flush every 5 minutes

    constructor(state: DurableObjectState, env: Env) {
        this.state = state;
        this.env = env;
    }

    async fetch(req: Request):Promise<Response> {
        const url = new URL(req.url);
        const pathname = url.pathname;
        const domain = url.searchParams.get("domain") ?? "unknown";
        // console.log("pathname received in DO:", pathname);

        if (req.method === "POST" && pathname === "/flush") {
            await this.alarm();
            return new Response("Flushed manually");
        }

        if (req.method === "GET" && pathname === "/debug") {
            return new Response(this.buffer.join("\n"), {
                headers: { "Content-Type": "text/plain" }
            });
        }

        if (req.method === "POST" && pathname === "/log") {
            await this.state.storage.put("domain", domain);
            const text = await req.text();
            this.buffer.push(text);

            const now = Date.now();
            const lastFlush = await this.state.storage.get<number>("lastFlushAt");

            if (
                this.buffer.length >= this.flushThreshold ||
                (lastFlush && now - lastFlush > this.flushIntervalMs)
            ) {
                await this.alarm();
                await this.state.storage.put("lastFlushAt", now);
            }

            // Schedule next flush if not already scheduled
            const scheduledTime = await this.state.storage.get<number>("nextScheduledFlush");
            if (!scheduledTime || now > scheduledTime) {
                const nextFlush = now + this.flushIntervalMs;
                await this.state.storage.setAlarm(nextFlush);
                await this.state.storage.put("nextScheduledFlush", nextFlush);
            }

            return new Response("Log buffered");
        }

        return new Response("Use POST /log to buffer logs or POST /flush to flush manually.");
    }

    async alarm(): Promise<void> {
        if (this.buffer.length === 0) return;

        const now = new Date();
        const hostname = await this.state.storage.get("domain") ?? "unknown";
        // console.log("alarm() using domain:", hostname);

        const content = this.buffer.join("\n");
        this.buffer = []; // ⬅️ Immediately clear buffer in memory
        await this.state.storage.put("buffer", this.buffer); // ⬅️ Immediately clear in storage too

        const shortId = Math.random().toString(36).slice(2, 7);
        const key = `logs/${hostname}/${now.toISOString()}-${shortId}.log`;

        // console.log("R2 key:", key);
        await this.env.LOG_BUCKET.put(key, content, {
            httpMetadata: { contentType: "text/plain" }
        });

       // Schedule next flush
        const nextFlush = Date.now() + this.flushIntervalMs;
        await this.state.storage.setAlarm(nextFlush);
        await this.state.storage.put("nextScheduledFlush", nextFlush);
    }

}

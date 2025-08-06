```markdown
# 🌐 Cloudflare Access Logger

A TypeScript Cloudflare Worker that logs incoming HTTP requests to R2, using Durable Objects as an efficient log buffer. Designed for performance monitoring, bot tracking, and access analytics across multiple domains.

---

## ✨ Features

- 🧠 **Durable Object buffer** – collects logs in-memory and flushes in batches
- 🪣 **R2 storage** – log files saved under `logs/<domain>/<timestamp>.log`
- 🔍 **Detailed logging** – IP, method, path, referer, user-agent, TLS version, status, size, and timing
- 🤖 **Bot detection** – filters crawlers, AI bots, and known scrapers
- 🚀 **Cache control** – enables `cf.cacheEverything` for static assets but skips bot traffic
- 🔧 **Control endpoints**:
  - `POST /flush?domain=yourdomain.com` – manually flush logs for a domain
  - `GET /debug` (inside DO) – view current buffered log entries

---

## 🛠 Tech Stack

- Cloudflare Workers (TypeScript)
- Durable Objects (for buffering)
- R2 (for long-term log storage)

---

## 📁 Project Structure

cloudflare-access-logger/
├── src/
│   ├── index.ts         # Main Worker logic
│   └── log-buffer.ts    # Durable Object class (log buffer + flush logic)
└── wrangler.toml        # Worker + DO + R2 configuration

---

## 🧪 How It Works

1. Every request to your site is intercepted by this Worker.
2. A log line is generated with sanitized, Apache-style fields.
3. Logs are sent to the Durable Object (`LogBuffer`) scoped by domain.
4. Buffered logs are automatically flushed to R2:
   - Every 5 minutes, or
   - When 100 log lines are collected

---

## 🚀 Deployment (via Wrangler)

1. Create your R2 bucket in the Cloudflare dashboard

2. Install dependencies (if needed):
   ```bash
   npm install
   ```

3. Update `wrangler.toml`

4. Deploy with Wrangler:

   ```bash
   npx wrangler publish
   ```

---

## 🧩 Example Log Output

```
203.0.113.42 example.com - [06/Aug/2025:09:12:45 +0000] "GET /pricing HTTP/2" 200 1324 "https://google.com" "Mozilla/5.0 ..." | TLSv1.3 | 0.072 0.072 0.072
```

---

## 🛡 Security Notes

* No sensitive data is stored or logged by default
* User-agents and referers are sanitized to prevent log injection
* You are encouraged to filter private routes or IPs before logging if needed

---

## 📄 License

MIT © [GnicT](https://github.com/GnicT)

---

## 🙋‍♀️ Questions or Ideas?

Feel free to open an issue or fork the project. Contributions are welcome!

```
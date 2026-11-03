# OverseerAgent (Seerr-compatible fork)

A small HTTP service that turns natural-language movie and TV requests into Seerr requests using Gemini or Anthropic.

This fork includes stricter RFC 3986 encoding for Seerr search queries, improved API error diagnostics, a configurable Gemini model, and Docker Compose deployment files.

## Quick start with Docker Compose

1. Clone this repository:

   ```bash
   git clone https://github.com/Shah-do/OverseerAgent.git
   cd OverseerAgent
   ```

2. Create your environment file:

   ```bash
   cp .env.example .env
   ```

3. Edit `.env` and set:
   - `OVERSEERR_URL`: your Seerr base URL, reachable **from inside the container** (for example, `http://192.168.1.36:5055`).
   - `OVERSEERR_API_KEY`: your Seerr API key.
   - `LLM_PROVIDER`: `gemini` or `anthropic`.
   - `LLM_API_KEY`: the matching provider API key.
   - `GEMINI_MODEL`: optional Gemini model ID. Defaults to `gemini-2.5-flash`.

4. Start the service:

   ```bash
   docker compose up -d
   ```

The API listens on port `4000` inside the container. Set `AGENT_PORT` in `.env` to change the host-side port mapping. Logs:

```bash
docker compose logs -f overseeragent
```

## Build locally instead of pulling GHCR

To build from the checked-out source, change the Compose service's `image:` line to `build: .` (and remove the `image:` line if preferred), then run:

```bash
docker compose up -d --build
```

The GitHub Actions workflow builds multi-platform images for `linux/amd64` and `linux/arm64` and publishes them to:

`ghcr.io/shah-do/overseeragent:latest`

## API

Send a POST request to `/api/prompt`:

```bash
curl -X POST http://localhost:4000/api/prompt \
  -H 'Content-Type: application/json' \
  -d '{"prompt":"Find the movie Bang Bang!"}'
```

Example TV request:

```json
{"prompt":"Request all seasons of Breaking Bad"}
```

The response is JSON with a `message` field. The service returns an HTTP error if intent extraction, search, or request creation fails.

## Configuration notes

- Seerr must be reachable from the container. If Seerr runs on the same Docker network, use its service/container DNS name and internal port instead of a public Cloudflare URL.
- Do not commit your `.env` file or publish API keys. The repository ignores local environment files.
- Profile IDs in `src/config/index.ts` are examples. Update `profileMap` to match the quality profiles configured in your Seerr-connected Radarr/Sonarr instances.
- Gemini model selection is controlled by `GEMINI_MODEL`; no rebuild is required to change it.

## Development

Requirements: Node.js 22+ and npm.

```bash
npm ci
npm run build
npm start
```

## Credits

Original project by [Omer S. (Rio)](https://github.com/omer182). This repository is a fork with compatibility and deployment changes.

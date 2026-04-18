<p align="center">
	<img src="https://capsule-render.vercel.app/api?type=waving&color=0:00A2FF,50:1DB954,100:8956FB&height=250&section=header&text=Waiter&fontAlignY=32&fontColor=ffffff&desc=Unified%20Creator%20Automation%20Runtime&fontSize=65&descAlignY=52" alt="Waiter banner" />
</p>

<p align="center">
	<a href="#"><img src="https://img.shields.io/badge/TypeScript-5.x-3178C6?logo=typescript&logoColor=white" alt="TypeScript" /></a>
	<a href="#"><img src="https://img.shields.io/badge/Runtime-Node%20%2B%20Bun-F9F1E1" alt="Runtime" /></a>
	<a href="#"><img src="https://img.shields.io/badge/Database-SurrealDB-9600FF" alt="SurrealDB" /></a>
	<a href="#"><img src="https://img.shields.io/badge/License-Private-444" alt="License" /></a>
</p>

<p align="center">
	<img src="https://skillicons.dev/icons?i=nodejs,bun,express,ts,discordjs,spotify,nextjs" alt="stack icons" />
</p>

> [!WARNING]
> Waiter is actively evolving. It is stable for development/testing workflows, but not all planned features are finalized for production-grade use.

Waiter is a multi-platform automation runtime for creators and communities.
It combines Twitch, Spotify, Discord, web routes, and SurrealDB into one modular TypeScript codebase so cross-platform workflows can be built in one place.

## Table of Contents

- [What Is Waiter](#what-is-waiter)
- [Origin And Vision](#origin-and-vision)
- [Feature Matrix](#feature-matrix)
- [Architecture](#architecture)
- [Quick Start](#quick-start)
- [Configuration](#configuration)
- [Scripts](#scripts)
- [Development Workflow](#development-workflow)
- [Repository Layout](#repository-layout)
- [Roadmap](#roadmap)
- [Contributing](#contributing)

## What Is Waiter

Waiter exists to remove platform fragmentation.

Instead of maintaining separate bots/services for chat commands, account linking, music automation, callbacks, and data sync, Waiter runs all of it through a unified controller model.

### Design goals

- One runtime, many platforms
- Strong typing at boundaries
- Safe startup through schema validation
- Composable controller lifecycle
- Extensible event and command architecture

## Origin And Vision

> [!IMPORTANT]
> Waiter was originally designed for TSF (The Swedish Fika), a community of four streamers sharing one Discord server.

The initial purpose was to manage all four channels from one automation runtime while still giving each streamer room for custom behavior.

Per-streamer customization is planned so every channel can run features exactly the way that streamer wants, while still participating in a shared community stack.

Waiter also bridges each streamer back to the shared Discord server, helping unify announcements, interactions, and tooling.

The long-term goal is ambitious automation across as many repetitive stream/community workflows as possible, while keeping the experience fun and entertaining for viewers.

## Feature Matrix

| Domain | What Waiter provides | Current state |
|---|---|---|
| Twitch | Streamer clients, events, permission decorators, command execution | Active |
| Spotify | OAuth account linking, token refresh, typed API wrappers, playback/library tools | Active |
| Discord | Slash command registration + interaction handling | Active |
| Web | Express routes, HTML template rendering, URL shortener helper | Active |
| Database | SurrealDB connectivity, schema/table bootstrap, reconnect logic | Active |

## Architecture

Waiter discovers and runs controllers in ordered stages:

1. `pre`
2. `normal`
3. `post`

This guarantees foundational dependencies (like DB + web registration surfaces) are available before feature controllers execute.

Stage execution is a strict barrier model: the `pre` stage must fully complete before `normal` starts, and `normal` must fully complete before `post` starts.

### Logistics Summary

| Concern | How Waiter handles it |
|---|---|
| Four-streamer coordination | One runtime tracks multiple channels while keeping streamer context separate |
| Shared Discord bridge | Twitch and Spotify actions can be surfaced into a shared Discord experience |
| Reliability and startup safety | Config validation occurs before platform controllers run |
| Auth/token lifecycle | OAuth credentials are encrypted, validated, refreshed, and synced with DB records |
| Future custom streamer behavior | Planned per-streamer config layer without fragmenting core automation |

## Quick Start

### 1) Install dependencies

```bash
npm install
```

### 2) Configure runtime

- Edit `src/config.ts` if present
- If missing, run once and Waiter will copy from `src/default.config.ts`

### 3) Run development loop

```bash
npm run dev
```

### 4) Build and start compiled output

```bash
npm run build
npm run start
```

## Configuration

Configuration is loaded from `src/config.ts` and validated using merged Zod schemas from all controllers.

Waiter also creates and uses `.env.internal` for internal runtime state. That file stores the encryption key used to encrypt and decrypt sensitive database values such as auth tokens.

Waiter resolves a machine identity at startup for database ownership safety:

- Real machines: an OS machine identifier is used (hardware/OS-backed source)
- Docker containers: a container runtime identifier is used (stable for stop/start of the same container, changes when recreated/rebuilt)
- Fallback: if no trusted source is available, Waiter reuses or generates `MACHINE_ID` in `.env.internal`

| Behavior | Description |
|---|---|
| Missing config file | `src/default.config.ts` is copied to `src/config.ts`, then process exits so you can edit it |
| Invalid config | Startup halts and prints all validation issues |
| Valid config | Boot continues and controllers initialize in stage order |

### Example config shape

```ts
const config: WaiterConfig = {
	publicUrl: "http://localhost:9999",
	discord: {
		serverId: "123456789012345678"
	},
	web: {
		port: 9999
	},
	spotify: {
		authEndpoint: "/spotify/auth",
		generatedCodeValidity: "15m"
	},
	twitch: {
		authEndpoint: "/twitch/auth",
		generatedCodeValidity: "15m"
	},
	database: {
		uri: "wss://your-surreal-host:13244"
	}
};

export default config satisfies WaiterConfig;
```

## Scripts

| Script | Command | What it does |
|---|---|---|
| Build | `npm run build` | Compiles TS, resolves ts paths, copies templates/json to `dist` |
| Start | `npm run start` | Starts compiled app from `dist/index.js` |
| Dev | `npm run dev` | Watches sources and restarts on change |

## Development Workflow

```bash
# type-check only
tsc --noEmit

# build + run compiled
npm run build && npm run start

# live development loop
npm run dev
```

## Repository Layout

| Path | Role |
|---|---|
| `src/index.ts` | App bootstrap, controller discovery, config validation, startup timing |
| `src/controllers/sdb` | SurrealDB connectivity + table/bootstrap logic |
| `src/controllers/web` | HTTP server, route decorators, template rendering, short links |
| `src/controllers/twitch` | Twitch auth/client lifecycle, events, commands, permissions |
| `src/controllers/spotify` | Spotify auth/client lifecycle + typed API functions |
| `src/controllers/discord` | Discord client + slash command registration/dispatch |
| `src/lib` | Shared core utilities (logging, encryption, misc helpers, cache) |

## Roadmap

- [ ] Build a full web dashboard for streamers and Waiter admins
	- [ ] Central control panel for configuration and runtime visibility
	- [ ] Auth-code generation and account-management tools
	- [ ] Live monitoring for controllers, platform clients, and key activity
- [ ] Expand account linking flows
	- [ ] Automatic account linking where safe and deterministic
	- [ ] User-initiated linking flows (self-service)
- [ ] Add optional output censorship as a platform-wide behavior
	- [ ] Global config toggle to enable or disable censorship of Waiter outputs
	- [ ] Consistent censorship behavior across all supported integrations
- [ ] Deepen Discord as a control and engagement surface
	- [ ] Add games and engagement features
	- [ ] Add moderation helper tools
	- [ ] Support controlling Twitch/Spotify/other services from Discord
	- [ ] Support cross-control paths (for example, controlling Discord from Twitch)
- [ ] Introduce streamer-specific sub-configs
	- [ ] Per-streamer feature flags and behavior overrides
	- [ ] Preserve shared defaults while allowing channel-level customization
- [ ] Improve controller health, modularity, and fault tolerance
	- [ ] Health checks for every controller
	- [ ] Ability to restart/stop controllers from an admin surface
	- [ ] Graceful degradation when a controller is disabled or not installed
	- [ ] Ensure dependent features detect missing controllers and handle it cleanly

## Contributing

1. Create a focused branch for each change.
2. Keep changes scoped by domain/controller.
3. Run `tsc --noEmit` and relevant runtime checks before PR.
4. Include behavior notes and test evidence in PR description.

<details>
<summary>Additional Notes</summary>

### Controller lifecycle contract

Each controller generally implements:

- `registerConfig()`
- `exec()`
- `statuses()`

Controllers are intended to be composable and independent, with startup ordering handled by stage and priority.

### Security posture

- OAuth credentials are encrypted before persistence
- Tokens are validated before use
- Invalid auth records are cleared defensively

</details>

---

<p align="center">
	Built for modular creator automation with a controller-first architecture.
</p>
import type { SandboxedPlugin, PluginContext } from "emdash/plugin";
import type { Block, BlockResponse, FormField } from "@emdash-cms/blocks";

import { SCRIPT_VERSION, VISITOR_SCRIPT } from "./visitor.js";

/* ------------------------------------------------------------------ */
/* Settings                                                            */
/* ------------------------------------------------------------------ */

const POSITION = ["top", "bottom"] as const;
const SHOW = ["all", "home", "prefix"] as const;
type Position = (typeof POSITION)[number];
type Show = (typeof SHOW)[number];

interface Settings {
	active: boolean;
	message: string;
	linkText: string;
	linkUrl: string;
	position: Position;
	sticky: boolean;
	dismissible: boolean;
	from: string;
	until: string;
	bg: string;
	fg: string;
	show: Show;
	prefix: string;
}

const DEFAULTS: Settings = {
	active: false,
	message: "",
	linkText: "",
	linkUrl: "",
	position: "top",
	sticky: false,
	dismissible: true,
	from: "",
	until: "",
	bg: "#111827",
	fg: "#ffffff",
	show: "all",
	prefix: "",
};

const LOADER_SEEN_WINDOW_MS = 10 * 60_000;

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function isRecord(v: unknown): v is Record<string, unknown> {
	return typeof v === "object" && v !== null && !Array.isArray(v);
}

function str(v: unknown, max: number): string {
	return typeof v === "string" ? v.slice(0, max) : "";
}

function pick<T extends string>(v: unknown, allowed: readonly T[], d: T): T {
	return typeof v === "string" && (allowed as readonly string[]).includes(v) ? (v as T) : d;
}

function bool(v: unknown, d: boolean): boolean {
	return typeof v === "boolean" ? v : d;
}

function cleanPrefix(v: unknown): string {
	const p = str(v, 300).trim();
	if (!p) return "";
	return p.startsWith("/") ? p : `/${p}`;
}

/** A link address: a path on this site or an http(s) address. Anything else is dropped. */
function cleanUrl(v: unknown): string {
	const u = str(v, 500).trim();
	if (!u) return "";
	if (u.startsWith("/") && !u.startsWith("//")) return u;
	if (/^https?:\/\/[^\s]+$/i.test(u)) return u;
	return "";
}

function cleanColor(v: unknown, d: string): string {
	const c = str(v, 12).trim().toLowerCase();
	if (/^#[0-9a-f]{6}$/.test(c)) return c;
	if (/^#[0-9a-f]{3}$/.test(c)) return `#${c[1]}${c[1]}${c[2]}${c[2]}${c[3]}${c[3]}`;
	return d;
}

/** A date as YYYY-MM-DD, or nothing. Date inputs may hand over a full ISO string, so only the day part is kept. */
function cleanDate(v: unknown): string {
	const d = str(v, 40).trim().slice(0, 10);
	if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return "";
	return Number.isNaN(Date.parse(d)) ? "" : d;
}

/** Identifies this version of the bar, so a visitor who closed an old message sees a new one. */
function barId(s: Settings): string {
	const src = `${s.message}|${s.linkText}|${s.linkUrl}|${s.from}|${s.until}`;
	let h = 2166136261;
	for (let i = 0; i < src.length; i++) {
		h ^= src.charCodeAt(i);
		h = Math.imul(h, 16777619);
	}
	return (h >>> 0).toString(36);
}

function settingsFrom(v: unknown, base: Settings = DEFAULTS): Settings {
	const o = isRecord(v) ? v : {};
	const show = pick(o.show, SHOW, base.show);
	const prefix = cleanPrefix(o.prefix);
	const linkUrl = cleanUrl(o.linkUrl);
	return {
		active: bool(o.active, base.active),
		message: str(o.message, 200).trim(),
		linkText: linkUrl ? str(o.linkText, 40).trim() : "",
		linkUrl,
		position: pick(o.position, POSITION, base.position),
		sticky: bool(o.sticky, base.sticky),
		dismissible: bool(o.dismissible, base.dismissible),
		from: cleanDate(o.from),
		until: cleanDate(o.until),
		bg: cleanColor(o.bg, DEFAULTS.bg),
		fg: cleanColor(o.fg, DEFAULTS.fg),
		show: show === "prefix" && !prefix ? "all" : show,
		prefix: show === "prefix" ? prefix : "",
	};
}

async function loadSettings(ctx: PluginContext): Promise<Settings> {
	return settingsFrom(await ctx.settings.get<unknown>("bar"));
}

/* ------------------------------------------------------------------ */
/* Schedule                                                            */
/* ------------------------------------------------------------------ */

type Schedule = { state: "off" | "empty" | "waiting" | "ended" | "showing"; date?: string };

function schedule(s: Settings, now = new Date()): Schedule {
	if (!s.active) return { state: "off" };
	if (!s.message) return { state: "empty" };
	const today = now.toISOString().slice(0, 10);
	if (s.from && today < s.from) return { state: "waiting", date: s.from };
	if (s.until && today > s.until) return { state: "ended", date: s.until };
	return { state: "showing" };
}

function nice(date: string): string {
	const d = new Date(`${date}T00:00:00Z`);
	return d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
}

/* ------------------------------------------------------------------ */
/* What the site receives                                              */
/* ------------------------------------------------------------------ */

function siteScript(s: Settings): string {
	if (!s.active || !s.message) return "";
	const cfg = {
		id: barId(s),
		message: s.message,
		linkText: s.linkText,
		linkUrl: s.linkUrl,
		position: s.position,
		sticky: s.sticky,
		dismissible: s.dismissible,
		from: s.from,
		until: s.until,
		bg: s.bg,
		fg: s.fg,
		show: s.show,
		prefix: s.prefix,
	};
	// "<" is escaped so the settings can never close a script tag.
	return `var cfg = ${JSON.stringify(cfg).replace(/</g, "\\u003c")};\n${VISITOR_SCRIPT}`;
}

function loader(pluginId: string): string {
	const url = `/_emdash/api/plugins/${pluginId}/config`;
	return [
		`<script is:inline>`,
		`\t/* Announcement Bar: shows the bar you set up in the admin. */`,
		`\tfetch("${url}").then(function (r) { return r.json(); }).then(function (j) {`,
		`\t\tif (!j || !j.data || !j.data.script) return;`,
		`\t\tvar s = document.createElement("script"); s.text = j.data.script; document.head.appendChild(s);`,
		`\t}).catch(function () {});`,
		`</script>`,
	].join("\n");
}

/* ------------------------------------------------------------------ */
/* Admin page                                                          */
/* ------------------------------------------------------------------ */

type Interaction = {
	type?: string;
	action_id?: string;
	block_id?: string;
	value?: unknown;
	values?: Record<string, unknown>;
};

const TABS = { bar: 0, setup: 1 } as const;

async function loaderStatus(ctx: PluginContext): Promise<{ seen: boolean; ago: string }> {
	const at = await ctx.kv.get<number>("loaderSeenAt");
	if (!at) return { seen: false, ago: "" };
	const mins = Math.max(0, Math.round((Date.now() - at) / 60_000));
	const ago = mins < 1 ? "just now" : mins < 60 ? `${mins} min ago` : mins < 1440 ? `${Math.round(mins / 60)} h ago` : `${Math.round(mins / 1440)} days ago`;
	return { seen: true, ago };
}

function statusBanner(s: Settings, loaderSeen: boolean): Block | null {
	const sc = schedule(s);
	switch (sc.state) {
		case "off":
			return null;
		case "empty":
			return { type: "banner", variant: "alert", title: "No message yet", description: "The bar is switched on but has nothing to say. Type a message below." };
		case "waiting":
			return { type: "banner", title: `Starts on ${nice(sc.date!)}`, description: "The bar is set up and will appear on that day." };
		case "ended":
			return { type: "banner", title: `Ended on ${nice(sc.date!)}`, description: "The bar is no longer shown. Clear or change the end date to bring it back." };
		case "showing":
			return loaderSeen
				? { type: "banner", title: "Showing now", description: "Visitors see the bar. Changes reach the site within a minute." }
				: { type: "banner", variant: "alert", title: "The bar is not reaching the site yet", description: "Add the block from the Setup tab to your theme once." };
	}
}

function barForm(s: Settings): Block {
	const fields: FormField[] = [
		{ type: "toggle", action_id: "active", label: "Show the bar", initial_value: s.active },
		{ type: "text_input", action_id: "message", label: "Message", placeholder: "Free delivery on every order this week", initial_value: s.message },
		{ type: "text_input", action_id: "linkText", label: "Link text", placeholder: "Shop now", initial_value: s.linkText },
		{ type: "text_input", action_id: "linkUrl", label: "Link address", placeholder: "/shop or https://…", initial_value: s.linkUrl },
		{
			type: "select",
			action_id: "position",
			label: "Position",
			options: [
				{ value: "top", label: "Top of the page" },
				{ value: "bottom", label: "Bottom of the page" },
			],
			initial_value: s.position,
		},
		{ type: "toggle", action_id: "sticky", label: "Stays visible while scrolling", initial_value: s.sticky },
		{ type: "toggle", action_id: "dismissible", label: "Visitors can close it", description: "Closed bars stay closed on that device until you change the message.", initial_value: s.dismissible },
		{ type: "date_input", action_id: "from", label: "Show from", placeholder: "Leave empty to show right away", initial_value: s.from },
		{ type: "date_input", action_id: "until", label: "Show until", placeholder: "Leave empty to show until you switch it off", initial_value: s.until },
		{ type: "text_input", action_id: "bg", label: "Background colour", placeholder: DEFAULTS.bg, initial_value: s.bg },
		{ type: "text_input", action_id: "fg", label: "Text colour", placeholder: DEFAULTS.fg, initial_value: s.fg },
		{
			type: "select",
			action_id: "show",
			label: "Show on",
			options: [
				{ value: "all", label: "Every page" },
				{ value: "home", label: "Home page only" },
				{ value: "prefix", label: "Addresses starting with…" },
			],
			initial_value: s.show,
		},
		{
			type: "text_input",
			action_id: "prefix",
			label: "Address starts with",
			placeholder: "/shop",
			initial_value: s.prefix,
			condition: { field: "show", eq: "prefix" },
		},
	];
	return {
		type: "form",
		block_id: `bar#${Date.now().toString(36)}`,
		fields,
		submit: { label: "Save", action_id: "save_bar" },
	};
}

async function barTab(ctx: PluginContext, s: Settings): Promise<Block[]> {
	const status = await loaderStatus(ctx);
	const blocks: Block[] = [];
	const banner = statusBanner(s, status.seen);
	if (banner) blocks.push(banner);
	blocks.push(barForm(s), {
		type: "context",
		text: "Dates follow each visitor's own clock, so a bar that ends on the 20th is gone everywhere by the end of the 20th. Colours are hex codes such as #111827.",
	});
	return blocks;
}

async function setupTab(ctx: PluginContext): Promise<Block[]> {
	const status = await loaderStatus(ctx);
	return [
		status.seen
			? { type: "banner", title: "Working", description: `Your site last loaded the bar ${status.ago}.` }
			: { type: "banner", title: "One block to add", description: "Your site has not loaded the bar yet. Add the block below to your theme." },
		{ type: "section", text: "Paste this once into the head of your base layout, usually src/layouts/Base.astro." },
		{ type: "code", language: "tsx", code: loader(ctx.plugin.id) },
		{ type: "context", text: "Everything you change here reaches the site within a minute, without touching the theme again." },
	];
}

async function page(ctx: PluginContext, tab: number): Promise<BlockResponse> {
	const s = await loadSettings(ctx);
	return {
		blocks: [
			{ type: "header", text: "Announcement Bar" },
			{
				type: "tab",
				default_tab: tab,
				panels: [
					{ label: "Bar", blocks: await barTab(ctx, s) },
					{ label: "Setup", blocks: await setupTab(ctx) },
				],
			},
		],
	};
}

async function handleAdmin(ctx: PluginContext, i: Interaction): Promise<BlockResponse> {
	const toast = (message: string, type: "success" | "error" | "info" = "success") => ({ toast: { type, message } });

	if (i.type === "form_submit" && i.action_id === "save_bar") {
		const current = await loadSettings(ctx);
		const next = settingsFrom(i.values ?? {}, current);
		if (next.active && !next.message) return { ...(await page(ctx, TABS.bar)), ...toast("Type a message before switching the bar on.", "error") };
		if (next.from && next.until && next.until < next.from) return { ...(await page(ctx, TABS.bar)), ...toast("The end date is before the start date.", "error") };
		await ctx.settings.set("bar", next);
		return { ...(await page(ctx, TABS.bar)), ...toast("Saved") };
	}

	return page(ctx, TABS.bar);
}

/* ------------------------------------------------------------------ */
/* The plugin                                                          */
/* ------------------------------------------------------------------ */

const plugin: SandboxedPlugin = {
	routes: {
		/** Public: the script the site runs, with the current settings in it. Same for every visitor, so it may be cached for a minute. */
		config: {
			public: true,
			methods: ["GET"],
			request: { body: "none" },
			cacheControl: "public, max-age=60",
			handler: async (_routeCtx, ctx) => {
				const s = await loadSettings(ctx);
				const seen = (await ctx.kv.get<number>("loaderSeenAt")) ?? 0;
				if (Date.now() - seen > LOADER_SEEN_WINDOW_MS) await ctx.kv.set("loaderSeenAt", Date.now());
				return { version: SCRIPT_VERSION, script: siteScript(s) };
			},
		},

		/** The admin page. */
		admin: {
			permission: "plugins:manage",
			handler: async (routeCtx, ctx) => handleAdmin(ctx, (routeCtx.input ?? {}) as Interaction),
		},
	},
};

export default plugin;

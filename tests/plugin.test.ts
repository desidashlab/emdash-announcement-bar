import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createPluginRuntimeTestHost, type PluginRuntimeTestHost } from "@emdash-cms/plugin-test";

let host: PluginRuntimeTestHost;

type AnyBlock = Record<string, unknown> & { type: string };
type Config = { version: number; script: string };

const config = () => host.transport.invokeRoute("config", {}, { method: "GET" }) as Promise<Config>;
const tabs = (page: { blocks: unknown[] }) => (page.blocks[1] as { panels: Array<{ label: string; blocks: AnyBlock[] }> }).panels;
const tab = (page: { blocks: unknown[] }, label: string) => tabs(page).find((p) => p.label === label)!.blocks;
const texts = (blocks: AnyBlock[]) => JSON.stringify(blocks);
const save = (values: Record<string, unknown>) => host.admin.submit("/overview", "save_bar", values, { blockId: "bar#x" });
const cfgOf = (script: string) => JSON.parse(/^var cfg = (.*);\n/.exec(script)![1]!) as Record<string, unknown>;
const field = (blocks: AnyBlock[], id: string) => {
	const form = blocks.find((b) => b.type === "form") as unknown as { fields: Array<{ action_id: string; initial_value?: unknown }> };
	return form.fields.find((f) => f.action_id === id)!.initial_value;
};
const BAR = { active: true, message: "Free delivery this week", linkText: "Shop now", linkUrl: "/shop" };

beforeEach(async () => {
	host = await createPluginRuntimeTestHost();
	await host.actions.plugin.activate();
});

afterEach(async () => {
	await host.dispose();
});

describe("what the site receives", () => {
	it("serves nothing until a bar is switched on", async () => {
		const { version, script } = await config();
		expect(version).toBe(1);
		expect(script).toBe("");
	});

	it("serves the script with the settings in front once saved", async () => {
		const res = await save(BAR);
		expect(res.toast?.message).toBe("Saved");
		const { script } = await config();
		expect(script).toContain("SCRIPT_VERSION = 1");
		expect(cfgOf(script)).toMatchObject({
			message: "Free delivery this week",
			linkText: "Shop now",
			linkUrl: "/shop",
			position: "top",
			sticky: false,
			dismissible: true,
			from: "",
			until: "",
			bg: "#111827",
			fg: "#ffffff",
			show: "all",
			prefix: "",
		});
		expect(typeof cfgOf(script).id).toBe("string");
	});

	it("changes the id when the message changes, so a closed bar shows again", async () => {
		await save(BAR);
		const a = cfgOf((await config()).script).id;
		await save({ ...BAR, message: "Sale ends Sunday" });
		const b = cfgOf((await config()).script).id;
		expect(a).not.toBe(b);
		await save({ ...BAR, message: "Sale ends Sunday" });
		expect(cfgOf((await config()).script).id).toBe(b);
	});

	it("keeps a message from closing the script", async () => {
		await save({ ...BAR, message: "</script><b>x</b>" });
		const { script } = await config();
		expect(script).not.toContain("</script>");
		expect(cfgOf(script).message).toBe("</script><b>x</b>");
	});
});

describe("settings", () => {
	it("refuses switching on without a message, and an end before the start", async () => {
		const empty = await save({ active: true, message: "  " });
		expect(empty.toast?.type).toBe("error");
		expect((await config()).script).toBe("");

		const dates = await save({ ...BAR, from: "2026-10-20", until: "2026-10-10" });
		expect(dates.toast?.type).toBe("error");
	});

	it("saves every setting, cleans bad ones and shows them back", async () => {
		await save({
			...BAR,
			linkUrl: "https://example.com/sale",
			position: "bottom",
			sticky: true,
			dismissible: false,
			from: "2026-10-20T00:00:00.000Z",
			until: "2026-10-31",
			bg: "#FA0",
			fg: "not a colour",
			show: "prefix",
			prefix: "shop",
		});
		expect(cfgOf((await config()).script)).toMatchObject({
			linkUrl: "https://example.com/sale",
			position: "bottom",
			sticky: true,
			dismissible: false,
			from: "2026-10-20",
			until: "2026-10-31",
			bg: "#ffaa00",
			fg: "#ffffff",
			show: "prefix",
			prefix: "/shop",
		});
		const page = await host.admin.loadPage("/overview");
		expect(field(tab(page, "Bar"), "from")).toBe("2026-10-20");
		expect(field(tab(page, "Bar"), "prefix")).toBe("/shop");
	});

	it("drops a link that is not a path or an http address", async () => {
		await save({ ...BAR, linkUrl: "javascript:alert(1)" });
		expect(cfgOf((await config()).script)).toMatchObject({ linkUrl: "", linkText: "" });
	});

	it("tells the owner whether the bar is showing, waiting or ended", async () => {
		const off = await host.admin.loadPage("/overview");
		expect(tabs(off).map((p) => p.label)).toEqual(["Bar", "Setup"]);
		expect(tab(off, "Bar").some((b) => b.type === "banner")).toBe(false);

		await save({ ...BAR, from: "2999-01-01" });
		expect(texts(tab(await host.admin.loadPage("/overview"), "Bar"))).toContain("Starts on 1 January 2999");

		await save({ ...BAR, until: "2000-01-01" });
		expect(texts(tab(await host.admin.loadPage("/overview"), "Bar"))).toContain("Ended on 1 January 2000");

		await save(BAR);
		expect(texts(tab(await host.admin.loadPage("/overview"), "Bar"))).toContain("not reaching the site yet");
		await config();
		expect(texts(tab(await host.admin.loadPage("/overview"), "Bar"))).toContain("Showing now");
	});
});

describe("setup", () => {
	it("shows the loader block and reports when the site has loaded it", async () => {
		const before = await host.admin.loadPage("/overview");
		expect(texts(tab(before, "Setup"))).toContain("/_emdash/api/plugins/announcement-bar/config");
		expect(texts(tab(before, "Setup"))).toContain("has not loaded");
		await config();
		expect(texts(tab(await host.admin.loadPage("/overview"), "Setup"))).toContain("last loaded the bar just now");
	});
});

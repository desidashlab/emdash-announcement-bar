/* Announcement Bar for EmDash. Shows one bar with a message and a link at the top or bottom of every page.
 * The settings object `cfg` is written in front of this file by the plugin's config route. */
var SCRIPT_VERSION = 1;
(function () {
	if (typeof cfg !== "object" || !cfg || window.__ddBar) return;
	window.__ddBar = true;

	var KEY = "ab_closed";

	function day(s, end) {
		// "YYYY-MM-DD" in the visitor's own time zone. The end date runs to the end of that day.
		if (!s) return null;
		var p = s.split("-");
		return new Date(+p[0], +p[1] - 1, +p[2], end ? 23 : 0, end ? 59 : 0, end ? 59 : 0).getTime();
	}

	function inWindow() {
		var now = Date.now();
		var from = day(cfg.from, false), until = day(cfg.until, true);
		if (from && now < from) return false;
		if (until && now > until) return false;
		return true;
	}

	function closed() {
		try { return localStorage.getItem(KEY) === cfg.id; } catch (e) { return false; }
	}

	function style() {
		if (document.getElementById("dd-bar-style")) return;
		var css =
			".dd-bar{box-sizing:border-box;display:flex;align-items:center;justify-content:center;gap:.75em;width:100%;padding:.6em 2.75em .6em 1em;font:500 15px/1.4 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;text-align:center;position:relative;z-index:9999}" +
			".dd-bar-sticky{position:sticky;top:0}" +
			".dd-bar-bottom{position:fixed;left:0;right:0;bottom:0}" +
			".dd-bar a{color:inherit;font-weight:700;text-decoration:underline;text-underline-offset:2px}" +
			".dd-bar-close{position:absolute;right:.6em;top:50%;transform:translateY(-50%);background:none;border:0;color:inherit;font:inherit;font-size:22px;line-height:1;cursor:pointer;opacity:.8;padding:.2em .4em}" +
			".dd-bar-close:hover{opacity:1}";
		var el = document.createElement("style");
		el.id = "dd-bar-style";
		el.textContent = css;
		document.head.appendChild(el);
	}

	function build() {
		var bar = document.createElement("div");
		bar.className = "dd-bar" + (cfg.position === "bottom" ? " dd-bar-bottom" : cfg.sticky ? " dd-bar-sticky" : "");
		bar.setAttribute("role", "region");
		bar.setAttribute("aria-label", "Announcement");
		bar.style.background = cfg.bg;
		bar.style.color = cfg.fg;
		var text = document.createElement("span");
		text.textContent = cfg.message;
		bar.appendChild(text);
		if (cfg.linkUrl && cfg.linkText) {
			var a = document.createElement("a");
			a.href = cfg.linkUrl;
			a.textContent = cfg.linkText;
			if (/^https?:\/\//i.test(cfg.linkUrl) && cfg.linkUrl.indexOf(location.origin + "/") !== 0) { a.target = "_blank"; a.rel = "noopener"; }
			bar.appendChild(a);
		}
		if (cfg.dismissible) {
			var x = document.createElement("button");
			x.className = "dd-bar-close";
			x.type = "button";
			x.setAttribute("aria-label", "Close");
			x.innerHTML = "&times;";
			x.addEventListener("click", function () {
				try { localStorage.setItem(KEY, cfg.id); } catch (e) {}
				remove(bar);
			});
			bar.appendChild(x);
		}
		return bar;
	}

	function remove(bar) {
		if (bar.parentNode) bar.parentNode.removeChild(bar);
		document.body.style.paddingBottom = "";
	}

	function run() {
		if (document.querySelector(".dd-bar")) return;
		var p = location.pathname;
		if (cfg.show === "home" && p !== "/") return;
		if (cfg.show === "prefix" && p.indexOf(cfg.prefix) !== 0) return;
		if (!inWindow() || closed()) return;
		style();
		var bar = build();
		if (cfg.position === "bottom") {
			document.body.appendChild(bar);
			document.body.style.paddingBottom = bar.offsetHeight + "px";
		} else {
			document.body.insertBefore(bar, document.body.firstChild);
		}
	}

	if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", run);
	else run();
	document.addEventListener("astro:page-load", run);
})();

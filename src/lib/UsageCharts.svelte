<script lang="ts">
	import type { Usage } from '$lib/board';

	let { usage }: { usage: Usage } = $props();

	// The reference palette's dark slots, validated on this surface (#0b1220):
	// every check passes for these four, adjacent pairs, CVD ΔE ≥ 8.4.
	const SLOT = ['#3987e5', '#d95926', '#199e70', '#c98500'];
	const MODELS = ['opus', 'sonnet', 'haiku', 'fable'] as const;
	const MODEL_COLOR: Record<string, string> = {
		opus: SLOT[0],
		sonnet: SLOT[1],
		haiku: SLOT[2],
		fable: SLOT[3]
	};
	const WINDOWS = [
		{ key: 'five_hour', name: '5-hour window', color: SLOT[0] },
		{ key: 'weekly', name: 'Weekly, all models', color: SLOT[1] },
		{ key: 'scoped', name: 'Weekly, Fable', color: SLOT[2] }
	] as const;

	// One drawing box for every chart: viewBox units, scaled to the width.
	// Two drawing boxes, each close to the width it is shown at, so 11px text
	// stays about 11px: the wide windows chart, and the small ones.
	const W = 460;
	const H = 200;
	const WW = 1200;
	const WH = 260;
	const PAD = { l: 40, r: 12, t: 10, b: 24 };
	const iw = W - PAD.l - PAD.r;
	const ih = H - PAD.t - PAD.b;
	const iww = WW - PAD.l - PAD.r;
	const ihw = WH - PAD.t - PAD.b;

	const fmtTokens = (n: number) =>
		n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(0)}k` : String(n);
	const day = (d: string) =>
		new Date(d + 'T12:00:00').toLocaleDateString([], { weekday: 'short', day: 'numeric' });
	const hour = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: 'numeric' });
	const when = (iso: string) =>
		new Date(iso).toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' });

	// ── the windows: a line per window, 0–100 % ──────────────────────────────
	const wins = $derived(usage.windows ?? []);
	const t0 = $derived(wins.length ? Date.parse(wins[0].at) : 0);
	const t1 = $derived(wins.length ? Date.parse(wins[wins.length - 1].at) : 1);
	const wx = (iso: string) => PAD.l + ((Date.parse(iso) - t0) / Math.max(1, t1 - t0)) * iww;
	const wy = (pct: number) => PAD.t + ihw - (Math.min(100, Math.max(0, pct)) / 100) * ihw;
	const line = (key: 'five_hour' | 'weekly' | 'scoped') =>
		wins.map((p) => `${wx(p.at).toFixed(1)},${wy(p[key]).toFixed(1)}`).join(' ');
	const dayTicks = $derived.by(() => {
		const out: { x: number; label: string }[] = [];
		if (!wins.length) return out;
		const start = new Date(t0);
		start.setHours(24, 0, 0, 0);
		for (let t = start.getTime(); t <= t1; t += 86400000) {
			out.push({
				x: PAD.l + ((t - t0) / Math.max(1, t1 - t0)) * iww,
				label: new Date(t).toLocaleDateString([], { weekday: 'short' })
			});
		}
		return out;
	});
	let hoverWin: number | null = $state(null);
	function onWinMove(e: PointerEvent) {
		const svg = e.currentTarget as SVGSVGElement;
		const r = svg.getBoundingClientRect();
		const x = ((e.clientX - r.left) / r.width) * WW;
		let best = 0;
		let dist = Infinity;
		wins.forEach((p, i) => {
			const d = Math.abs(wx(p.at) - x);
			if (d < dist) {
				dist = d;
				best = i;
			}
		});
		hoverWin = wins.length ? best : null;
	}

	// ── tokens per day, stacked by model ─────────────────────────────────────
	const days = $derived.by(() => {
		const set = [...new Set((usage.tokens_by_model ?? []).map((d) => d.day))].sort();
		return set.slice(-7);
	});
	const stacks = $derived(
		days.map((d) => {
			let y = 0;
			const segs = MODELS.map((m) => {
				const n = (usage.tokens_by_model ?? [])
					.filter((x) => x.day === d && x.model === m)
					.reduce((a, b) => a + b.tokens, 0);
				const seg = { model: m, from: y, n };
				y += n;
				return seg;
			}).filter((s) => s.n > 0);
			return { day: d, total: y, segs };
		})
	);
	const tMax = $derived(Math.max(1, ...stacks.map((s) => s.total)));
	const bw = $derived(days.length ? iw / days.length : iw);
	const ty = (n: number) => PAD.t + ih - (n / tMax) * ih;
	const usedModels = $derived(
		MODELS.filter((m) => stacks.some((s) => s.segs.some((g) => g.model === m)))
	);

	// ── hourly bars, one series each ─────────────────────────────────────────
	function bars(points: { hour: string; count: number; seconds: number }[]) {
		const max = Math.max(1, ...points.map((p) => p.count));
		const w = points.length ? iw / points.length : iw;
		return { max, w, y: (n: number) => PAD.t + ih - (n / max) * ih };
	}
	const ol = $derived(usage.ollama ?? []);
	const wh = $derived(usage.whisper ?? []);
	const olb = $derived(bars(ol));
	const whb = $derived(bars(wh));
	const sum = (p: { count: number; seconds: number }[], k: 'count' | 'seconds') =>
		p.reduce((a, b) => a + b[k], 0);
	const hourTicks = (points: { hour: string }[], w: number) =>
		points
			.map((p, i) => ({ i, p }))
			.filter(({ p }) => new Date(p.hour).getHours() % 6 === 0)
			.map(({ i, p }) => ({ x: PAD.l + i * w + w / 2, label: hour(p.hour) }));

	let table = $state(false);
</script>

<section class="usage">
	<div class="usage-head">
		<h2>Usage</h2>
		<button class="tbl" onclick={() => (table = !table)} aria-pressed={table}>
			{table ? 'Show graphs' : 'Show as tables'}
		</button>
	</div>

	{#if table}
		<div class="tables">
			<table>
				<caption>Claude windows, latest sample per day</caption>
				<thead
					><tr
						><th>Day</th>{#each WINDOWS as w}<th>{w.name}</th>{/each}</tr
					></thead
				>
				<tbody>
					{#each [...new Map(wins.map((p) => [p.at.slice(0, 10), p])).values()] as p}
						<tr
							><td>{day(p.at.slice(0, 10))}</td><td>{p.five_hour}%</td><td>{p.weekly}%</td><td
								>{p.scoped}%</td
							></tr
						>
					{/each}
				</tbody>
			</table>
			<table>
				<caption>Claude tokens per day</caption>
				<thead
					><tr
						><th>Day</th>{#each MODELS as m}<th>{m}</th>{/each}<th>Total</th></tr
					></thead
				>
				<tbody>
					{#each stacks as s}
						<tr
							><td>{day(s.day)}</td>{#each MODELS as m}<td
									>{fmtTokens(s.segs.find((g) => g.model === m)?.n ?? 0)}</td
								>{/each}<td>{fmtTokens(s.total)}</td></tr
						>
					{/each}
				</tbody>
			</table>
			<table>
				<caption>Local models, last 48 hours</caption>
				<thead><tr><th>Model</th><th>Calls</th><th>Time</th></tr></thead>
				<tbody>
					<tr
						><td>Ollama</td><td>{sum(ol, 'count')}</td><td
							>{sum(ol, 'seconds').toFixed(0)} s answering</td
						></tr
					>
					<tr
						><td>Whisper</td><td>{sum(wh, 'count')}</td><td
							>{(sum(wh, 'seconds') / 60).toFixed(0)} min of audio</td
						></tr
					>
				</tbody>
			</table>
		</div>
	{:else}
		<div class="charts">
			<figure class="chart wide">
				<figcaption>
					<b>Claude windows</b> <span class="sub">how full each limit is, last 7 days</span>
				</figcaption>
				<div class="legend">
					{#each WINDOWS as w}<span><i style="background:{w.color}"></i>{w.name}</span>{/each}
				</div>
				{#if wins.length < 2}
					<p class="none">No samples yet.</p>
				{:else}
					<svg
						viewBox="0 0 {WW} {WH}"
						role="img"
						aria-label="Claude usage windows over the last seven days"
						onpointermove={onWinMove}
						onpointerleave={() => (hoverWin = null)}
					>
						{#each [0, 25, 50, 75, 100] as g}
							<line class="grid" x1={PAD.l} x2={WW - PAD.r} y1={wy(g)} y2={wy(g)} />
							<text class="axis" x={PAD.l - 6} y={wy(g) + 4} text-anchor="end">{g}%</text>
						{/each}
						{#each dayTicks as t}
							<text class="axis" x={t.x} y={WH - 6} text-anchor="middle">{t.label}</text>
						{/each}
						{#each WINDOWS as w}
							<polyline
								points={line(w.key)}
								fill="none"
								stroke={w.color}
								stroke-width="2"
								stroke-linejoin="round"
							/>
						{/each}
						{#if hoverWin !== null}
							{@const p = wins[hoverWin]}
							<line class="cross" x1={wx(p.at)} x2={wx(p.at)} y1={PAD.t} y2={PAD.t + ihw} />
							{#each WINDOWS as w}
								<circle
									cx={wx(p.at)}
									cy={wy(p[w.key])}
									r="4"
									fill={w.color}
									stroke="#0b1220"
									stroke-width="2"
								/>
							{/each}
						{/if}
					</svg>
					<p class="readout">
						{#if hoverWin !== null}
							{@const p = wins[hoverWin]}
							{when(p.at)} · 5-hour {p.five_hour}% · weekly {p.weekly}% · Fable {p.scoped}%
						{:else}
							{@const p = wins[wins.length - 1]}
							Now · 5-hour {p.five_hour}% · weekly {p.weekly}% · Fable {p.scoped}%
						{/if}
					</p>
				{/if}
			</figure>

			<figure class="chart">
				<figcaption>
					<b>Claude tokens per day</b>
					<span class="sub">every session on this machine, by model</span>
				</figcaption>
				<div class="legend">
					{#each usedModels as m}<span><i style="background:{MODEL_COLOR[m]}"></i>{m}</span>{/each}
				</div>
				{#if stacks.length === 0}
					<p class="none">No sessions counted yet.</p>
				{:else}
					<svg viewBox="0 0 {W} {H}" role="img" aria-label="Claude tokens per day by model">
						{#each [0, 0.5, 1] as g}
							<line class="grid" x1={PAD.l} x2={W - PAD.r} y1={ty(tMax * g)} y2={ty(tMax * g)} />
							<text class="axis" x={PAD.l - 6} y={ty(tMax * g) + 4} text-anchor="end"
								>{fmtTokens(tMax * g)}</text
							>
						{/each}
						{#each stacks as s, i}
							{@const x = PAD.l + i * bw + bw * 0.2}
							{#each s.segs as g}
								<rect
									class="mark"
									{x}
									width={bw * 0.6}
									y={ty(g.from + g.n) + 1}
									height={Math.max(0, ty(g.from) - ty(g.from + g.n) - 2)}
									rx="3"
									fill={MODEL_COLOR[g.model]}
									><title>{day(s.day)} · {g.model}: {fmtTokens(g.n)} tokens</title></rect
								>
							{/each}
							<text class="axis" x={x + bw * 0.3} y={H - 6} text-anchor="middle">{day(s.day)}</text>
						{/each}
					</svg>
				{/if}
			</figure>

			{#each [{ name: 'Ollama', sub: 'calls to the local model per hour, last 48 hours', pts: ol, b: olb, color: SLOT[0], tip: (p: { count: number; seconds: number }) => `${p.count} calls · ${p.seconds.toFixed(1)} s answering`, total: `${sum(ol, 'count')} calls · ${sum(ol, 'seconds').toFixed(0)} s answering` }, { name: 'Whisper', sub: 'speech transcribed per hour, last 48 hours', pts: wh, b: whb, color: SLOT[0], tip: (p: { count: number; seconds: number }) => `${p.count} clips · ${(p.seconds / 60).toFixed(1)} min of audio`, total: `${sum(wh, 'count')} clips · ${(sum(wh, 'seconds') / 60).toFixed(0)} min of audio` }] as c (c.name)}
				<figure class="chart">
					<figcaption><b>{c.name}</b> <span class="sub">{c.sub}</span></figcaption>
					<p class="total">{c.total}</p>
					{#if c.pts.length === 0}
						<p class="none">Its log could not be read.</p>
					{:else}
						<svg viewBox="0 0 {W} {H}" role="img" aria-label="{c.name} per hour, last 48 hours">
							{#each [0, 0.5, 1] as g}
								<line
									class="grid"
									x1={PAD.l}
									x2={W - PAD.r}
									y1={c.b.y(c.b.max * g)}
									y2={c.b.y(c.b.max * g)}
								/>
								<text class="axis" x={PAD.l - 6} y={c.b.y(c.b.max * g) + 4} text-anchor="end"
									>{Math.round(c.b.max * g)}</text
								>
							{/each}
							{#each c.pts as p, i}
								{#if p.count > 0}
									<rect
										class="mark"
										x={PAD.l + i * c.b.w + 1}
										width={Math.max(1, c.b.w - 2)}
										y={c.b.y(p.count)}
										height={PAD.t + ih - c.b.y(p.count)}
										rx="2"
										fill={c.color}><title>{when(p.hour)} · {c.tip(p)}</title></rect
									>
								{/if}
								<rect
									class="hit"
									x={PAD.l + i * c.b.w}
									width={c.b.w}
									y={PAD.t}
									height={ih}
									fill="transparent"><title>{when(p.hour)} · {c.tip(p)}</title></rect
								>
							{/each}
							{#each hourTicks(c.pts, c.b.w) as t}
								<text class="axis" x={t.x} y={H - 6} text-anchor="middle">{t.label}</text>
							{/each}
						</svg>
					{/if}
				</figure>
			{/each}
		</div>
	{/if}
</section>

<style>
	.usage {
		border: 1px solid rgba(219, 230, 245, 0.1);
		border-radius: 10px;
		background: rgba(11, 18, 32, 0.6);
		padding: 12px 14px;
		display: flex;
		flex-direction: column;
		gap: 10px;
	}
	.usage-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 10px;
	}
	h2 {
		margin: 0;
		font-size: 0.75rem;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color: #8fa3bd;
		font-weight: 600;
	}
	.tbl {
		font: inherit;
		font-size: 0.8rem;
		color: #8fa3bd;
		background: transparent;
		border: 1px solid rgba(219, 230, 245, 0.18);
		border-radius: 999px;
		padding: 6px 12px;
		min-height: 36px;
		cursor: pointer;
	}
	.tbl:hover {
		color: #f2f7ff;
	}
	.charts {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(340px, 1fr));
		gap: 12px;
	}
	.chart {
		margin: 0;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 6px;
	}
	.chart.wide {
		grid-column: 1 / -1;
	}
	figcaption b {
		color: #f2f7ff;
		font-size: 0.9rem;
	}
	.sub,
	.total,
	.readout,
	.none {
		color: #8fa3bd;
		font-size: 0.8rem;
		margin: 0;
	}
	.legend {
		display: flex;
		gap: 12px;
		flex-wrap: wrap;
		font-size: 0.78rem;
		color: #dbe6f5;
	}
	.legend i {
		display: inline-block;
		width: 10px;
		height: 10px;
		border-radius: 2px;
		margin-right: 6px;
		vertical-align: -1px;
	}
	svg {
		width: 100%;
		height: auto;
		display: block;
		touch-action: pan-y;
	}
	.grid {
		stroke: rgba(219, 230, 245, 0.08);
		stroke-width: 1;
	}
	.cross {
		stroke: rgba(219, 230, 245, 0.35);
		stroke-width: 1;
	}
	.axis {
		fill: #64748b;
		font-size: 11px;
		font-family: Inter, system-ui, sans-serif;
	}
	.mark:hover {
		opacity: 0.85;
	}
	.tables {
		display: flex;
		flex-direction: column;
		gap: 14px;
		overflow-x: auto;
	}
	table {
		border-collapse: collapse;
		font-size: 0.8rem;
		min-width: 320px;
	}
	caption {
		text-align: left;
		color: #f2f7ff;
		font-weight: 600;
		padding-bottom: 4px;
	}
	th,
	td {
		padding: 4px 10px 4px 0;
		text-align: left;
		color: #dbe6f5;
		border-bottom: 1px solid rgba(219, 230, 245, 0.08);
		white-space: nowrap;
	}
	th {
		color: #8fa3bd;
		font-weight: 500;
		text-transform: capitalize;
	}
</style>

<script lang="ts">
	import '../../styles/table.css';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { enhance } from '$app/forms';
	import { fmtTime, num } from '$lib/format';
	import { m } from '$lib/paraglide/messages';
	import { toastErrors } from '$lib/formError';

	let { data } = $props();

	const columns = [
		{ key: 't', label: m.col_timestamp(), align: 'left' },
		{ key: 'server', label: m.col_server(), align: 'left' },
		{ key: 'download', label: m.series_download(), align: 'right' },
		{ key: 'upload', label: m.series_upload(), align: 'right' },
		{ key: 'ping', label: m.series_ping(), align: 'right' },
		{ key: 'jitter', label: m.series_jitter(), align: 'right' }
	] as const;

	function navigate(params: Record<string, string | number | null>) {
		const url = new URL(page.url);
		for (const [k, v] of Object.entries(params)) {
			if (v === null || v === '') url.searchParams.delete(k);
			else url.searchParams.set(k, String(v));
		}
		goto(url, { replaceState: true, keepFocus: true, noScroll: true });
	}

	const sortBy = (key: string) =>
		navigate({ sort: key, dir: data.sortKey === key && data.desc ? 'asc' : 'desc', page: 1 });

	const totalPages = $derived(Math.max(1, Math.ceil(data.total / data.pageSize)));

	let searchTimer: ReturnType<typeof setTimeout>;
	function onSearch(event: Event & { currentTarget: HTMLInputElement }) {
		const value = event.currentTarget.value;
		clearTimeout(searchTimer);
		searchTimer = setTimeout(() => navigate({ q: value, page: 1 }), 250);
	}
</script>

<header class="pagehead">
	<div class="pagehead__title">
		<div>
			<h1>{m.log_title()}</h1>
			<div class="subtitle">{m.log_subtitle()}</div>
		</div>
	</div>
</header>

<div class="scrollbody">
	<section class="panel">
		<div class="panel__head">
			<span class="hint">{m.shown_of_range({ shown: data.total, total: data.inRange })}</span>
			<div class="table-search">
				<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--fg-4)" stroke-width="1.8">
					<circle cx="11" cy="11" r="7" /><path d="M21 21l-4-4" />
				</svg>
				<input type="search" value={data.query} oninput={onSearch} placeholder={m.filter_placeholder()} aria-label={m.filter_placeholder()} />
			</div>
		</div>

		<div class="tablewrap">
			<table class="datatable">
				<colgroup>
					<col style="width: 130px" />
					<col />
					<col style="width: 90px" />
					<col style="width: 90px" />
					<col style="width: 80px" />
					<col style="width: 80px" />
					<col style="width: 150px" />
				</colgroup>
				<thead>
					<tr>
						{#each columns as col (col.key)}
							<th style:text-align={col.align} class:sorted={data.sortKey === col.key}>
								<button style:justify-content={col.align === 'right' ? 'flex-end' : 'flex-start'} onclick={() => sortBy(col.key)}>
									{col.label}<span class="arrow">{data.sortKey === col.key ? (data.desc ? '▼' : '▲') : ''}</span>
								</button>
							</th>
						{/each}
						<th></th>
					</tr>
				</thead>
				<tbody>
					{#each data.rows as row (row.t + row.provider)}
						<tr class:row--invalid={row.invalid}>
							<td class="mono">{fmtTime(row.t)}</td>
							<td class="server">{row.server}<span class="server__provider">{row.provider}</span></td>
							<td class="mono n n--download">{num(row.download, 'download')}</td>
							<td class="mono n n--upload">{num(row.upload, 'upload')}</td>
							<td class="mono n n--ping">{num(row.ping, 'ping')}</td>
							<td class="mono n n--jitter">{num(row.jitter, 'jitter')}</td>
							<td class="actions">
								<form method="POST" action="?/toggleInvalid" use:enhance={toastErrors}>
									<input type="hidden" name="t" value={row.t} />
									<input type="hidden" name="provider" value={row.provider} />
									<button class="btn" type="submit">{row.invalid ? m.unflag_invalid() : m.flag_invalid()}</button>
								</form>
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
			{#if !data.rows.length}
				<div class="table-empty">{m.no_results()}</div>
			{/if}
		</div>

		<div class="pager">
			<span class="hint">{m.page_label({ page: data.page, pages: totalPages, shown: data.rows.length })}</span>
			<div class="pager__buttons">
				<button class="btn" disabled={data.page <= 1} onclick={() => navigate({ page: data.page - 1 })}>{m.prev()}</button>
				<button class="btn" disabled={data.page >= totalPages} onclick={() => navigate({ page: data.page + 1 })}>{m.next()}</button>
			</div>
		</div>
	</section>
</div>

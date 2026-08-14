<script lang="ts">
	import '../styles/index.css';
	import { page } from '$app/state';
	import { invalidateAll } from '$app/navigation';
	import { setLocale, getLocale, locales } from '$lib/paraglide/runtime';
	import { m } from '$lib/paraglide/messages';
	import { testStatus } from '$lib/testStatus.svelte';
	import Toast from '$lib/components/Toast.svelte';
	import favicon from '$lib/assets/favicon.svg';

	let { children, data } = $props();

	const nav = $derived([
		{ href: '/', label: m.nav_speed(), icon: 'speed', badge: 0 },
		{ href: '/iperf', label: m.nav_iperf(), icon: 'iperf', badge: 0 },
		{ href: '/alerts', label: m.nav_alerts(), icon: 'alerts', badge: data.openAlerts },
		{ href: '/log', label: m.nav_log(), icon: 'log', badge: 0 }
	]);

	const isActive = (href: string) =>
		href === '/' ? page.url.pathname === '/' : page.url.pathname.startsWith(href);

	// Clicking a nav link to the route you're already on doesn't change the URL, so
	// SvelteKit's router treats it as a no-op and never re-runs that route's load — the
	// page just keeps showing whatever it last fetched. Force it explicitly.
	function refreshIfCurrent(href: string) {
		if (isActive(href)) invalidateAll();
	}
</script>

<svelte:head>
	<title>{testStatus.running ? `${m.title_measuring()} · SpeedMeasure` : 'SpeedMeasure'}</title>
	<link rel="icon" href={favicon} />
	<link rel="preconnect" href="https://fonts.googleapis.com" />
	<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="anonymous" />
	<!-- Degrades to system-ui if the host has no internet. -->
	<link
		href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600&display=swap"
		rel="stylesheet"
	/>
</svelte:head>

{#if data.user}
	<div class="shell">
		<aside class="rail">
			<div class="rail__logo">
				<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#04262b" stroke-width="2.6" stroke-linecap="round">
					<path d="M12 20a8 8 0 1 0-8-8" /><path d="M12 12l5-5" />
				</svg>
			</div>
			<div class="rail__rule"></div>

			<nav class="rail__nav">
				{#each nav as item (item.href)}
					<a class="navitem" class:navitem--active={isActive(item.href)} href={item.href}
						title={item.label} onclick={() => refreshIfCurrent(item.href)}>
						{#if item.badge}
							<span class="navitem__badge">{item.badge > 9 ? '9+' : item.badge}</span>
						{/if}
						{#if item.icon === 'speed'}
							<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round">
								<path d="M3 15l4-5 4 3 5-7 5 6" /><path d="M3 20h18" />
							</svg>
						{:else if item.icon === 'iperf'}
							<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
								<rect x="3" y="4" width="18" height="6" rx="1.5" /><rect x="3" y="14" width="18" height="6" rx="1.5" /><path d="M7 7h.01" /><path d="M7 17h.01" />
							</svg>
						{:else if item.icon === 'alerts'}
							<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round">
								<path d="M6 8a6 6 0 0 1 12 0c0 7 3 8 3 8H3s3-1 3-8" /><path d="M10 20a2 2 0 0 0 4 0" />
							</svg>
						{:else}
							<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round">
								<path d="M4 6h16M4 12h16M4 18h16" />
							</svg>
						{/if}
						<span>{item.label}</span>
					</a>
				{/each}
			</nav>

			<div class="rail__foot">
				<a class="navitem" class:navitem--active={isActive('/settings')} href="/settings" title={m.nav_settings()}
					style="width:100%" onclick={() => refreshIfCurrent('/settings')}>
					<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
						<circle cx="12" cy="12" r="3" />
						<path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
					</svg>
					<span>{m.nav_settings()}</span>
				</a>

				<div class="rail__rule" style="margin:8px 0"></div>

				<!-- Native <select>: a locale switcher is exactly what one is for. -->
				<select
					class="rail__locale"
					aria-label={m.language()}
					value={getLocale()}
					onchange={(e) => setLocale(e.currentTarget.value as (typeof locales)[number])}
				>
					{#each locales as locale (locale)}
						<option value={locale}>{locale.toUpperCase()}</option>
					{/each}
				</select>
			</div>
		</aside>

		<main class="main">
			{@render children()}
		</main>
	</div>
{:else}
	{@render children()}
{/if}

<Toast />

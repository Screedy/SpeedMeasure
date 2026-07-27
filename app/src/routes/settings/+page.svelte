<script lang="ts">
	import '../../styles/settings.css';
	import { untrack } from 'svelte';
	import { enhance } from '$app/forms';
	import { m } from '$lib/paraglide/messages';
	import { isUnexpectedError, toastErrors } from '$lib/formError';
	import type { ActionResult } from '@sveltejs/kit';

	let { data, form } = $props();

	const INTERVAL_PRESETS = [5, 15, 30, 60, 180, 360, 720];
	const intervalLabel = (min: number) => (min < 60 ? `${min} min` : `${min / 60} hr`);

	// Local mirrors of the fields whose *labels* react as you type. Everything else is
	// an uncontrolled input — the form post is the source of truth.
	let sched = $state(untrack(() => data.settings.sched));
	let interval = $state(untrack(() => data.settings.interval));
	let customInterval = $state(untrack(() => !INTERVAL_PRESETS.includes(data.settings.interval)));
	let adaptive = $state(untrack(() => data.settings.adaptive));
	let adaptiveInterval = $state(untrack(() => data.settings.adaptiveInterval));
	let provider = $state(untrack(() => data.settings.provider));
	let smtpEnabled = $state(untrack(() => data.settings.smtpEnabled));
	let planDown = $state(untrack(() => data.settings.planDown));
	let planUp = $state(untrack(() => data.settings.planUp));
	let gThreshold = $state(untrack(() => data.settings.gThreshold));
	let gMinThreshold = $state(untrack(() => data.settings.gMinThreshold));
	let gMaxDrop = $state(untrack(() => data.settings.gMaxDrop));

	const pct = (plan: number, threshold: number) => Math.round((plan * threshold) / 100);
	const guaranteedDown = $derived(pct(planDown, gThreshold));
	const guaranteedUp = $derived(pct(planUp, gThreshold));
	const floorDown = $derived(pct(planDown, gMinThreshold));
	const floorUp = $derived(pct(planUp, gMinThreshold));

	const saved = (section: string) => form?.section === section && !form?.error;
	const errorIn = (section: string) => (form?.section === section ? form?.error : null);

	// SvelteKit's default enhance behavior calls the native form.reset() on success,
	// which blanks any bind:value input (they have no static `value` attribute for
	// the browser to reset back to) without Svelte ever seeing an input event. Every
	// form below except the password one — clearing that after a save is the point —
	// needs this to keep showing what was just saved.
	const keepValues = () => async ({
		result,
		update
	}: {
		result: ActionResult;
		update: (opts?: { reset?: boolean }) => Promise<void>;
	}) => {
		await update({ reset: false });
		isUnexpectedError(result);
	};
</script>

<header class="pagehead">
	<div class="pagehead__title">
		<h1>{m.settings_title()}</h1>
		<form method="POST" action="?/signOut" use:enhance={toastErrors} class="settings__signout">
			<button class="btn" type="submit">{m.sign_out()}</button>
		</form>
	</div>
</header>

<div class="scrollbody">
	<div class="settings__stack">
		<!-- ------------------------------------------------------------ account -->
		<section class="settings-section">
			<h2>{m.sec_account()}</h2>
			<p>{m.sec_account_desc()}</p>

			<form method="POST" action="?/saveAccount" use:enhance={keepValues}>
				<div class="field field--narrow">
					<label for="email">{m.email()}</label>
					<input id="email" name="email" type="email" value={data.email} required />
				</div>
				<div class="form-actions">
					<button class="btn btn--accent" type="submit">{m.save_email()}</button>
					{#if saved('account')}<span class="saved">✓ {m.saved()}</span>{/if}
					{#if errorIn('account')}<span class="error">{errorIn('account')}</span>{/if}
				</div>
			</form>

			<div class="rule"></div>
			<h3>{m.change_password()}</h3>

			<form method="POST" action="?/savePassword" use:enhance={toastErrors}>
				<div class="form-grid pw-grid">
					<div class="field form-grid__full">
						<label for="pw-current">{m.current_password()}</label>
						<input id="pw-current" name="current" type="password" autocomplete="current-password" required />
					</div>
					<div class="field">
						<label for="pw-new">{m.new_password()}</label>
						<input id="pw-new" name="next" type="password" autocomplete="new-password" minlength="10" required />
					</div>
					<div class="field">
						<label for="pw-confirm">{m.confirm_new_password()}</label>
						<input id="pw-confirm" name="confirm" type="password" autocomplete="new-password" minlength="10" required />
					</div>
				</div>
				<div class="form-actions">
					<button class="btn btn--accent" type="submit">{m.update_password()}</button>
					{#if saved('password')}<span class="saved">✓ {m.password_updated()}</span>{/if}
					{#if errorIn('password')}<span class="error">{errorIn('password')}</span>{/if}
				</div>
			</form>
		</section>

		<!-- ----------------------------------------------------------- schedule -->
		<section class="settings-section">
			<h2>{m.sec_schedule()}</h2>
			<p>{m.sec_schedule_desc()}</p>

			<form method="POST" action="?/saveSchedule" use:enhance={keepValues}>
				<div class="field field--narrow">
					<span class="label">{m.mode()}</span>
					<div class="seg">
						<button type="button" aria-pressed={sched === 'interval'} onclick={() => (sched = 'interval')}>{m.mode_interval()}</button>
						<button type="button" aria-pressed={sched === 'daily'} onclick={() => (sched = 'daily')}>{m.mode_daily()}</button>
					</div>
					<input type="hidden" name="sched" value={sched} />
				</div>

				{#if sched === 'interval'}
					<div class="block">
						<span class="label">{m.run_every()}</span>
						<div class="chips">
							{#each INTERVAL_PRESETS as preset (preset)}
								<button
									type="button"
									class="chip"
									class:chip--on={!customInterval && interval === preset}
									onclick={() => ((customInterval = false), (interval = preset))}
								>
									{intervalLabel(preset)}
								</button>
							{/each}
							<button type="button" class="chip" class:chip--on={customInterval} onclick={() => (customInterval = true)}>
								{m.custom()}
							</button>
						</div>
					</div>
					{#if customInterval}
						<div class="field field--tiny">
							<label for="interval">{m.custom_interval()}</label>
							<input id="interval" name="interval" type="number" min="1" bind:value={interval} />
						</div>
					{:else}
						<input type="hidden" name="interval" value={interval} />
					{/if}

					<div class="field field--tiny">
						<label for="intervalTime">{m.interval_start()}</label>
						<input id="intervalTime" name="time" type="time" value={data.settings.time} />
					</div>
					<p class="note">{m.interval_start_desc()}</p>
				{:else}
					<div class="field field--tiny">
						<label for="time">{m.time_of_day()}</label>
						<input id="time" name="time" type="time" value={data.settings.time} />
					</div>
				{/if}

				<div class="rule"></div>

				<div class="block">
					<span class="label">{m.providers()}</span>
					<p class="note">{m.providers_desc()}</p>
					<div class="chips">
						{#each data.providers as p (p)}
							<label class="checkchip">
								<input type="radio" name="provider" value={p} bind:group={provider} />
								{#if p === 'ookla' || p === 'librespeed'}
									<img src="/providers/{p}.svg" alt="" class="checkchip__logo" />
								{:else}
									<svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">
										<path d="M2 5h9" />
										<path d="M8 2l3 3-3 3" />
										<path d="M14 11H5" />
										<path d="M8 14l-3-3 3-3" />
									</svg>
								{/if}
								{p}
							</label>
						{/each}
					</div>
				</div>

				{#if provider === 'iperf3'}
					<div class="field field--narrow">
						<label for="iperfServer">{m.iperf_server()}</label>
						<input id="iperfServer" name="iperfServer" value={data.settings.iperfServer} placeholder="iperf.example.com:5201" />
					</div>
					<p class="note">{m.iperf_udp_note()}</p>
				{/if}

				<div class="rule"></div>

				<div class="toggle-row">
					<div>
						<div class="toggle-row__title">
							<span>{m.adaptive_rampup()}</span><span class="tag">{m.smart()}</span>
						</div>
						<p class="note">{m.adaptive_desc({ threshold: gThreshold })}</p>
					</div>
					<button type="button" class="switch" role="switch" aria-checked={adaptive} aria-label={m.adaptive_rampup()} onclick={() => (adaptive = !adaptive)}>
						<span></span>
					</button>
					{#if adaptive}<input type="hidden" name="adaptive" value="on" />{/if}
				</div>

				{#if adaptive}
					<div class="field field--tiny">
						<label for="adaptiveInterval">{m.rampup_interval()}</label>
						<input id="adaptiveInterval" name="adaptiveInterval" type="number" min="1" bind:value={adaptiveInterval} />
					</div>
					<p class="note">{m.adaptive_note({ interval: adaptiveInterval, window: gMaxDrop })}</p>
				{/if}

				<div class="form-actions">
					<button class="btn btn--accent" type="submit">{m.save_schedule()}</button>
					{#if saved('schedule')}<span class="saved">✓ {m.saved()}</span>{/if}
				</div>
			</form>
		</section>

		<!-- --------------------------------------------------------------- smtp -->
		<section class="settings-section">
			<div class="settings-section__headrow">
				<h2>{m.sec_smtp()}</h2>
				<button
					type="button"
					class="switch"
					role="switch"
					aria-checked={smtpEnabled}
					aria-label={m.enable_email_alerts()}
					onclick={() => (smtpEnabled = !smtpEnabled)}
				>
					<span></span>
				</button>
			</div>
			<p>{m.sec_smtp_desc()}</p>

			<form method="POST" action="?/saveSmtp" use:enhance={keepValues}>
				{#if smtpEnabled}<input type="hidden" name="smtpEnabled" value="on" />{/if}

				<div class="rule"></div>

				<!-- Hidden, not removed — a disabled toggle shouldn't wipe saved credentials on save. -->
				<div hidden={!smtpEnabled}>
					<div class="form-grid smtp-grid">
						<div class="field">
							<label for="smtpHost">{m.smtp_host()}</label>
							<input id="smtpHost" name="smtpHost" value={data.settings.smtpHost} placeholder="smtp.example.com" />
						</div>
						<div class="field">
							<label for="smtpPort">{m.port()}</label>
							<input id="smtpPort" name="smtpPort" type="number" min="1" max="65535" value={data.settings.smtpPort} />
						</div>
					</div>

					<div class="field field--narrow">
						<span class="label">{m.security()}</span>
						<div class="seg">
							{#each [['none', m.sec_none()], ['starttls', m.sec_starttls()], ['ssltls', m.sec_ssltls()]] as const as [value, label] (value)}
								<label class="seg__opt">
									<input type="radio" name="smtpSec" {value} checked={data.settings.smtpSec === value} />
									<span>{label}</span>
								</label>
							{/each}
						</div>
					</div>

					<div class="form-grid form-grid--two">
						<div class="field">
							<label for="smtpUser">{m.username()}</label>
							<input id="smtpUser" name="smtpUser" value={data.settings.smtpUser} autocomplete="off" />
						</div>
						<div class="field">
							<label for="smtpPass">{m.password()}</label>
							<input id="smtpPass" name="smtpPass" type="password" value={data.settings.smtpPass} autocomplete="off" />
						</div>
					</div>

					<div class="field field--narrow">
						<label for="smtpFrom">{m.from_address()}</label>
						<input id="smtpFrom" name="smtpFrom" value={data.settings.smtpFrom} placeholder="alerts@example.com" />
					</div>
				</div>

				<div class="form-actions">
					<button class="btn btn--accent" type="submit">{m.save_smtp()}</button>
					{#if smtpEnabled}<button class="btn" type="submit" form="sendTestEmail">{m.send_test_email()}</button>{/if}
					{#if saved('smtp')}<span class="saved">✓ {m.saved()}</span>{/if}
					{#if saved('smtptest')}<span class="saved">✓ {m.test_email_queued()}</span>{/if}
				</div>
			</form>

			<form id="sendTestEmail" method="POST" action="?/sendTestEmail" use:enhance={toastErrors}></form>
		</section>

		<!-- ---------------------------------------------------------- guarantee -->
		<section class="settings-section">
			<h2>{m.sec_plan()}</h2>
			<p>{m.sec_plan_desc()}</p>

			<form method="POST" action="?/saveGuarantee" use:enhance={keepValues}>
				<div class="form-grid form-grid--two">
					<div class="field">
						<label for="planDown">{m.advertised_down()}</label>
						<input id="planDown" name="planDown" type="number" min="1" bind:value={planDown} />
					</div>
					<div class="field">
						<label for="planUp">{m.advertised_up()}</label>
						<input id="planUp" name="planUp" type="number" min="1" bind:value={planUp} />
					</div>
				</div>

				<div class="rule"></div>
				<p class="fineprint">{m.both_checked()}</p>

				<div class="sliderhead">
					<label for="gThreshold">{m.guaranteed_threshold()}</label>
					<span class="mono readout">{gThreshold}% · ↓{guaranteedDown} / ↑{guaranteedUp} Mbps</span>
				</div>
				<input id="gThreshold" name="gThreshold" type="range" min="10" max="100" step="5" bind:value={gThreshold} />

				<div class="field field--tiny">
					<label for="gMaxDrop">{m.sustained_window()}</label>
					<input id="gMaxDrop" name="gMaxDrop" type="number" min="1" bind:value={gMaxDrop} />
				</div>
				<p class="note">
					{m.guarantee_note({ down: guaranteedDown, up: guaranteedUp, threshold: gThreshold, window: gMaxDrop })}
				</p>

				<div class="rule"></div>

				<div class="toggle-row__title">
					<span class="label">{m.large_drop()}</span><span class="tag tag--danger">{m.immediate()}</span>
				</div>
				<div class="field field--tiny">
					<label for="gMinThreshold">{m.large_drop_pct()}</label>
					<input id="gMinThreshold" name="gMinThreshold" type="number" min="1" max="100" bind:value={gMinThreshold} />
				</div>
				<p class="note">
					{m.large_drop_note({ down: floorDown, up: floorUp, threshold: gMinThreshold })}
				</p>

				<div class="form-actions">
					<button class="btn btn--accent" type="submit">{m.save_guarantee()}</button>
					{#if saved('guarantee')}<span class="saved">✓ {m.saved()}</span>{/if}
				</div>
			</form>
		</section>
	</div>
</div>

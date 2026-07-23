<script lang="ts">
	import '../../styles/login.css';
	import { m } from '$lib/paraglide/messages';

	let { data, form } = $props();
</script>

<div class="login">
	<form class="login__card" method="POST">
		<div class="login__logo">
			<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#04262b" stroke-width="2.6" stroke-linecap="round">
				<path d="M12 20a8 8 0 1 0-8-8" /><path d="M12 12l5-5" />
			</svg>
		</div>

		<h1>{data.setup ? m.setup_title() : m.login_title()}</h1>
		<p>{data.setup ? m.setup_subtitle() : m.login_subtitle()}</p>

		<div class="field">
			<label for="email">{m.email()}</label>
			<input id="email" name="email" type="email" autocomplete="username" required />
		</div>

		<div class="field">
			<label for="password">{m.password()}</label>
			<input
				id="password"
				name="password"
				type="password"
				autocomplete={data.setup ? 'new-password' : 'current-password'}
				minlength={data.setup ? 10 : undefined}
				required
			/>
		</div>

		{#if data.setup}
			<div class="field">
				<label for="confirm">{m.confirm_password()}</label>
				<input id="confirm" name="confirm" type="password" autocomplete="new-password" minlength="10" required />
			</div>
		{/if}

		{#if form?.error}
			<div class="error error--banner" role="alert">{form.error}</div>
		{/if}

		<button class="btn btn--accent login__submit" type="submit">
			{data.setup ? m.create_account() : m.sign_in()}
		</button>
	</form>
</div>

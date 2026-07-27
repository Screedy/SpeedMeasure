<script lang="ts">
	import { toasts, dismissToast } from '$lib/toast.svelte';
</script>

{#if toasts.length}
	<div class="toasts">
		{#each toasts as toast (toast.id)}
			<div class="toast">
				<span>{toast.message}</span>
				<button type="button" aria-label="Dismiss" onclick={() => dismissToast(toast.id)}>&times;</button>
			</div>
		{/each}
	</div>
{/if}

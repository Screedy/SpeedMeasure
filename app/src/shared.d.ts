/**
 * Alert logic lives at the repo root so the runner container can share the exact
 * same file. Typed here rather than in the .mjs, which is outside this tsconfig.
 */
declare module '$shared/alerts.mjs' {
	export interface Settings {
		sched: 'interval' | 'daily';
		interval: number;
		time: string;
		adaptive: boolean;
		adaptiveInterval: number;
		provider: string;
		iperfServer: string;
		smtpEnabled: boolean;
		smtpHost: string;
		smtpPort: number;
		smtpSec: 'none' | 'starttls' | 'ssltls';
		smtpUser: string;
		smtpPass: string;
		smtpFrom: string;
		planDown: number;
		planUp: number;
		gThreshold: number;
		gMinThreshold: number;
		gMaxDrop: number;
	}

	export interface Point {
		t: number;
		download: number;
		upload: number;
		ping: number;
		jitter: number;
		loss: number;
	}

	export interface Alert {
		id: string;
		kind: 'outage' | 'sustained' | 'loss' | 'latency';
		sev: 'critical' | 'warning' | 'info';
		metric: 'download' | 'upload' | 'both' | 'loss' | 'ping';
		start: number;
		end: number;
		dur: number;
		worst: number;
		/** Numbers for the message placeholders; which ones are set depends on `kind`. */
		params: { value?: number; floor?: number };
	}

	export const DEFAULT_SETTINGS: Settings;
	export function computeAlerts(points: Point[], settings: Partial<Settings>): Alert[];
	export function inBreach(latest: Point | undefined, settings: Partial<Settings>): boolean;
	export function fmtDur(ms: number): string;
}

declare module '$shared/providers.mjs' {
	export const PROVIDER_NAMES: string[];
}

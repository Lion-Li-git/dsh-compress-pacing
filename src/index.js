// dsh-compress-pacing — one compressing call at a time.
//
// Measured before this existed (session b3a09167): 15 compress calls in four
// days, and three of the eleven compressing turns split into 2-3 back-to-back
// calls (one turn fired 82k, 50k and 19k within a minute). Every compress
// re-sends the whole context and invalidates the prefix cache, so the cost of
// a call is near-fixed while the tokens it frees are not: several small calls
// cost several full prompts.
//
// Rule: after a call that reclaimed something, another compress inside
// WINDOW_MS is denied — except ONE cleanup call within CLEANUP_MS when the
// previous call had spans rejected (it folded what it could; the leftovers are
// the model's to re-issue). A call that reclaimed 0 changed nothing and does
// not arm the window.
//
// This is pacing, not a fix. Upstream workarounds for the same pressure live in
// Tyan66666/billion-context-dsh issues #152 (in-place folding vs prompt cache),
// #213 (nudges with an empty range table) and #214 (retrying a rejected span).
//
// Everything fails open: non-compress tools, missing content, unparsable text.

const name = 'dsh-compress-pacing';
const inject = ['tools'];

const DEFAULTS = Object.freeze({
	windowMs: 15 * 60 * 1000,
	cleanupMs: 2 * 60 * 1000
});

function apply(ctx, config) {
	const cfg = { ...DEFAULTS, ...(config || {}) };
	const last = new Map();
	const cleanupCalls = new WeakSet();

	const keyOf = (exec) => (exec.agent && exec.agent.id) || 'root';

	ctx.on('tools/pre-execute', (exec, next) => {
		try {
			if (exec.name !== 'compress') return next();
			const prev = last.get(keyOf(exec));
			if (!prev || !(prev.reclaimed > 0)) return next();
			const elapsed = Date.now() - prev.t;
			if (elapsed >= cfg.windowMs) return next();
			if (prev.rejected > 0 && !prev.wasCleanup && elapsed <= cfg.cleanupMs) {
				cleanupCalls.add(exec);
				return next();
			}
			const mins = Math.max(1, Math.round(elapsed / 60000));
			return {
				kind: 'deny',
				reason: '[compress-pacing] refused: ' + mins + ' min ago a compress reclaimed ~' + prev.reclaimed + ' tokens. Each compress re-sends the whole context and invalidates the prefix cache - the cost of a call is near-fixed while the tokens it frees are not, so several small calls cost several full prompts and can cost more than they save. Fold EVERY range you are ready to give up into one call, aim for a real share of the visible context, and if only small rows are ready keep working. acp_status gives fresh refs and does not invalidate the cache. The only exemption is one cleanup call within ' + Math.round(cfg.cleanupMs / 60000) + ' minutes of a compress whose spans were partly rejected.'
			};
		} catch {
			return next();
		}
	});

	ctx.on('tools/post-execute', (exec, result, next) => {
		try {
			if (exec.name !== 'compress') return next();
			const blocks = result && Array.isArray(result.content) ? result.content : [];
			const text = blocks.map((b) => (b && typeof b.text === 'string' ? b.text : '')).join('');
			const m = text.match(/~(\d+) tokens reclaimed/);
			last.set(keyOf(exec), {
				t: Date.now(),
				reclaimed: m ? Number(m[1]) : 0,
				rejected: (text.match(/rejected/g) || []).length,
				wasCleanup: cleanupCalls.has(exec)
			});
			return next();
		} catch {
			return next();
		}
	});
}

export { apply, inject, name };

import type { Context } from 'cordis';

export declare const name: 'dsh-compress-pacing';
export declare const inject: ['tools'];
export interface CompressPacingConfig {
  windowMs?: number;
  cleanupMs?: number;
}
export declare function apply(ctx: Context, config?: CompressPacingConfig): void;

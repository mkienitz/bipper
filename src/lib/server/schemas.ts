import { CHUNK_SIZE } from '$lib/common';
import { z } from 'zod';

export const KeyHashSchema = z
	.string()
	.regex(/^[0-9a-f]{64}$/, 'Must be a 64-character lowercase hex string.');

export const StateUpdateSchema = z
	.object({
		keyHash: KeyHashSchema,
		chunkIdx: z.coerce.number({ coerce: true }).min(0).finite(),
		totalSize: z
			.string()
			.refine((val) => !isNaN(Number(val)), {
				message: 'String must be convertible to a number'
			})
			.transform((val) => Number(val))
			.nullable(),
		chunk: z.instanceof(ArrayBuffer).refine((buf) => buf.byteLength <= CHUNK_SIZE, {
			message: 'Chunk exceeds chunk size.'
		})
	})
	.strict();

export type StateUpdate = z.infer<typeof StateUpdateSchema>;

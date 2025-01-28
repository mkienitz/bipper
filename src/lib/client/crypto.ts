import { fromHex, toHex } from '$lib/client/util';
import { CHUNK_SIZE } from '$lib/common';

// AES-GCM 256 has an overhead of 12 IV and 16 tag bytes
export const ENCRYPTION_OVERHEAD = 12 + 16;

export const hashKey = async (key: CryptoKey): Promise<string> => {
	return crypto.subtle
		.exportKey('raw', key)
		.then((exportedKey) => {
			return crypto.subtle.digest('SHA-256', exportedKey);
		})
		.then((sha256) => toHex(sha256));
};

export const restoreKey = async (keyString: string): Promise<CryptoKey> => {
	return crypto.subtle.importKey(
		'raw',
		fromHex(keyString),
		{
			name: 'AES-GCM'
		},
		true,
		['decrypt']
	);
};

export const addMetadata = (file: File): Blob => {
	// Insert filename
	const encoder = new TextEncoder();
	const filename = encoder.encode(file.name);
	const filenameLength = new Uint8Array(4);
	const filenameLengthView = new DataView(filenameLength.buffer);
	filenameLengthView.setUint32(0, filename.length, false);
	return new Blob([filenameLength, filename, file]);
};

export const extractMetadata = (decrypted: ArrayBuffer): { file: Blob; filename: string } => {
	// Extract filename length
	const lengthView = new DataView(decrypted, 0, 4);
	const filenameLength = lengthView.getUint32(0, false);
	// Extract filename
	const filenameBytes = new Uint8Array(decrypted, 4, filenameLength);
	const decoder = new TextDecoder();
	const filename = decoder.decode(filenameBytes);
	return {
		file: new Blob([decrypted.slice(4 + filenameLength)]),
		filename
	};
};

export const encryptChunk = async (chunk: Blob, key: CryptoKey): Promise<Blob> => {
	// Generate nonce for each chunk
	let iv = new Uint8Array(12);
	crypto.getRandomValues(iv);
	return new Blob([
		iv,
		await crypto.subtle.encrypt(
			{
				name: 'AES-GCM',
				iv
			} satisfies AesGcmParams,
			key,
			await chunk.arrayBuffer()
		)
	]);
};

export const decryptChunk = async (chunk: Uint8Array, key: CryptoKey): Promise<Uint8Array> => {
	const res = new Uint8Array(
		await crypto.subtle.decrypt(
			{
				name: 'AES-GCM',
				iv: chunk.slice(0, 12)
			} satisfies AesGcmParams,
			key,
			chunk.slice(12)
		)
	);
	return res;
};

export const getChunkTransformer = (): TransformStream<Uint8Array, Uint8Array> => {
	let buffer = new Uint8Array(0);
	return new TransformStream({
		transform(chunk: Uint8Array, controller) {
			const combined = new Uint8Array(buffer.length + chunk.length);
			combined.set(buffer, 0);
			combined.set(chunk, buffer.length);
			buffer = combined;
			while (buffer.length >= CHUNK_SIZE) {
				const fullChunk = buffer.slice(0, CHUNK_SIZE);
				controller.enqueue(fullChunk);
				buffer = buffer.slice(CHUNK_SIZE);
			}
		},
		flush(controller) {
			if (buffer.length > 0) {
				controller.enqueue(buffer);
				buffer = new Uint8Array(0);
			}
		}
	});
};

export const getDecryptTransformer = (key: CryptoKey): TransformStream<Uint8Array, Uint8Array> => {
	let buffer = new Uint8Array(0);
	return new TransformStream({
		async transform(chunk: Uint8Array, controller) {
			controller.enqueue(await decryptChunk(chunk, key));
		},
		async flush(controller) {
			if (buffer.length > 0) {
				controller.enqueue(await decryptChunk(buffer, key));
				buffer = new Uint8Array(0);
			}
		}
	});
};

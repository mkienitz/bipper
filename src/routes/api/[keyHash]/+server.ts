import { error, json, type RequestHandler } from '@sveltejs/kit';
import fs, { type FileHandle } from 'node:fs/promises';
import path from 'node:path';
import { CHUNK_SIZE } from '$lib/common';
import { createReadStream } from 'node:fs';
import { z } from 'zod';
import { STORE_DIR } from '$lib/server/globals';

// TODO:
// [ ] Call cleanup logic (handle close, partial file delete) on errors
// [ ] Add content-length header so client can track progress

type FileUpload = {
	keyHash: string;
	totalSize: number;
	totalChunks: number;
	chunksWritten: number;
	fileHandle: FileHandle;
};

const KeyHashSchema = z
	.string()
	.regex(/^[0-9a-f]{64}$/, 'Must be a 64-character lowercase hex string.');

const UploadInfoSchema = z
	.object({
		chunkIdx: z.coerce.number({ coerce: true }).min(0).finite(),
		keyHash: KeyHashSchema,
		totalSize: z
			.string()
			.refine((val) => !isNaN(Number(val)), {
				message: 'String must be convertible to a number'
			})
			.transform((val) => Number(val))
			.nullable(),
		chunkSize: z.number()
	})
	.strict()
	.refine(({ chunkIdx, totalSize, keyHash, chunkSize }) => {
		// OR
		// Hash must exist and only chunkIdx must be present
		if (!uploadStates.has(keyHash)) {
			// New hash
			// => totalSize must be provided
			// => chunkIdx must be zero
			// => chunkSize must not exceed totalSize
			return totalSize !== null && chunkIdx === 0 && chunkSize <= totalSize;
		} else {
			// Existing hash
			// => totalSize must not be provided
			// => chunkIdx === chunksWritten + 1
			// => chunkIdx < totalChunks
			// => chunkSize + currSize must not exceed totalSize
			// => If it's not the last chunk chunkSize must be CHUNK_SIZE
			let currStatus = uploadStates.get(keyHash);
			return (
				totalSize === null &&
				chunkIdx === currStatus!.chunksWritten &&
				chunkIdx <= currStatus!.totalChunks &&
				currStatus!.chunksWritten * CHUNK_SIZE + chunkSize <= currStatus!.totalSize! &&
				(!(chunkIdx !== currStatus!.totalChunks - 1) || chunkSize === CHUNK_SIZE)
			);
		}
	}, 'Invariants were broken');

type UploadInfo = z.infer<typeof UploadInfoSchema>;

let uploadStates: Map<string, FileUpload> = new Map();

export const POST: RequestHandler = async ({ request, params, url }) => {
	// Get keyHash, chunkIdx and optionally, totalSize
	const keyHash = params.keyHash;
	const chunkIdx = url.searchParams.get('chunkIdx');
	const totalSize = url.searchParams.get('totalSize');
	// Use zod to validate the incoming data using the uoloadState als context
	const arrayBuffer = await request.arrayBuffer();
	const parseResult = UploadInfoSchema.safeParse({
		chunkIdx,
		keyHash,
		totalSize,
		chunkSize: arrayBuffer.byteLength
	});
	if (!parseResult.success) {
		error(422, { message: parseResult.error.toString() });
	}
	const uploadInfo: UploadInfo = parseResult.data;
	// Handle new transaction by setting up initial state and fileHandle
	if (!uploadStates.has(uploadInfo.keyHash)) {
		console.info('Starting new transaction...');
		const filePath = path.join(STORE_DIR, uploadInfo.keyHash);
		const fileHandle = await fs.open(filePath, 'w+');
		console.info(`Writing to ${filePath}...`);
		await fileHandle.truncate(uploadInfo.totalSize!);
		uploadStates.set(uploadInfo.keyHash, {
			keyHash: uploadInfo.keyHash,
			totalSize: uploadInfo.totalSize!,
			totalChunks: Math.ceil(uploadInfo.totalSize! / CHUNK_SIZE),
			chunksWritten: 0,
			fileHandle
		} satisfies FileUpload);
	}
	// After establishing state, write chunk to disk
	console.debug(`Receiving chunk ${chunkIdx} with size ${arrayBuffer.byteLength}`);
	const currStatus = uploadStates.get(uploadInfo.keyHash)!;
	try {
		currStatus.fileHandle.write(
			new Uint8Array(arrayBuffer),
			0,
			arrayBuffer.byteLength,
			uploadInfo.chunkIdx * CHUNK_SIZE
		);
	} catch (e) {
		console.log(e);
		await currStatus.fileHandle.close();
		uploadStates.delete(uploadInfo.keyHash);
		error(500);
	}
	currStatus.chunksWritten += 1;
	console.debug(`${currStatus.chunksWritten}/${currStatus.totalChunks} chunks written...`);
	if (currStatus.chunksWritten === currStatus.totalChunks) {
		await currStatus.fileHandle.close();
		uploadStates.delete(uploadInfo.keyHash);
		console.info('Transaction finished!');
	}

	return json(
		{ keyHash },
		{
			status: 201,
			headers: {
				Location: request.url
			}
		}
	);
};

const validateKeyHash = (keyHash: string | undefined) => {
	if (!keyHash) {
		error(404, { message: 'Missing route param [[keyHash]]' });
	}
	const parseResult = KeyHashSchema.safeParse(keyHash);
	if (!parseResult.success) {
		error(422, { message: parseResult.error.toString() });
	}
	return parseResult.data;
};

export const GET: RequestHandler = async ({ params }) => {
	const filePath = path.join(STORE_DIR, validateKeyHash(params.keyHash));
	console.info(`Serving ${filePath}...`);
	try {
		const fileStream = createReadStream(filePath) as unknown as BodyInit;
		return new Response(fileStream);
	} catch (e) {
		console.info('File not found!');
		error(404);
	}
};

export const DELETE: RequestHandler = async ({ params }) => {
	const filePath = path.join(STORE_DIR, validateKeyHash(params.keyHash));
	console.info(`Deleting ${filePath}...`);
	try {
		await fs.rm(filePath);
	} catch (e: any) {
		if (e.code === 'ENOENT') {
			console.info('File not found!');
			error(404);
		}
	}
	return new Response(null, { status: 204 });
};

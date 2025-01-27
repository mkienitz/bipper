import { error, json, type RequestHandler } from '@sveltejs/kit';
import fs, { type FileHandle } from 'node:fs/promises';
import path from 'node:path';
import { CHUNK_SIZE } from '$lib/common';
import { createReadStream } from 'node:fs';
import { z } from 'zod';
import { STORE_DIR } from '$lib/server/globals';

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
		totalSize: z.coerce.number({ coerce: true })
	})
	.refine(({ chunkIdx, totalSize }) => {
		const maxSize = Math.ceil(totalSize / CHUNK_SIZE) * CHUNK_SIZE;
		return (chunkIdx + 1) * CHUNK_SIZE <= maxSize;
	}, 'Chunk index implies an exceeded total size')
	.refine(
		({ totalSize, keyHash }) =>
			!uploadStates.has(keyHash) || uploadStates.get(keyHash)?.totalSize == totalSize,
		"Search param 'totalSize' does not match value for the ongoing transaction"
	);

type UploadInfo = z.infer<typeof UploadInfoSchema>;

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

let uploadStates: Map<string, FileUpload> = new Map();

export const POST: RequestHandler = async ({ request, params, url }) => {
	const chunkIdx = url.searchParams.get('chunkIdx');
	if (!chunkIdx) {
		error(400, { message: "Search param 'chunkIdx' was not provided" });
	}
	const totalSize = url.searchParams.get('totalSize');
	if (!totalSize) {
		error(400, { message: "Search param 'totalSize' was not provided" });
	}
	const keyHash = validateKeyHash(params.keyHash);
	const parseResult = UploadInfoSchema.safeParse({ chunkIdx, keyHash, totalSize });
	if (!parseResult.success) {
		error(422, { message: parseResult.error.toString() });
	}
	const uploadInfo: UploadInfo = parseResult.data;

	const filePath = path.join(STORE_DIR, uploadInfo.keyHash);
	if (!uploadStates.has(uploadInfo.keyHash)) {
		console.info('Starting new transaction...');
		const fileHandle = await fs.open(filePath, 'w+');
		console.info(`Writing to ${filePath}...`);
		await fileHandle.truncate(uploadInfo.totalSize);
		uploadStates.set(keyHash, {
			keyHash: uploadInfo.keyHash,
			totalSize: uploadInfo.totalSize,
			totalChunks: Math.ceil(uploadInfo.totalSize / CHUNK_SIZE),
			chunksWritten: 0,
			fileHandle
		} satisfies FileUpload);
	}
	const currStatus = uploadStates.get(uploadInfo.keyHash)!;
	const arrayBuffer = await request.arrayBuffer();
	console.debug(`Receiving chunk ${chunkIdx} with size ${arrayBuffer.byteLength}`);
	currStatus.fileHandle.write(
		new Uint8Array(arrayBuffer),
		0,
		arrayBuffer.byteLength,
		uploadInfo.chunkIdx * CHUNK_SIZE
	);
	uploadStates.set(keyHash, { ...currStatus, chunksWritten: currStatus.chunksWritten + 1 });
	console.debug(`${currStatus.chunksWritten + 1}/${currStatus.totalChunks} chunks written...`);
	if (currStatus.chunksWritten + 1 === currStatus.totalChunks) {
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

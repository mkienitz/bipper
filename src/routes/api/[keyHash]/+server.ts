import { error, json, type RequestHandler } from '@sveltejs/kit';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createReadStream } from 'node:fs';
import { STORE_DIR } from '$lib/server/globals';
import { StateHandler } from './StateHandler';
import { KeyHashSchema, StateUpdateSchema, type StateUpdate } from '$lib/server/schemas';

const stateHandler = new StateHandler();

export const POST: RequestHandler = async ({ request, params, url }) => {
	const keyHash = params.keyHash;
	const chunkIdx = url.searchParams.get('chunkIdx');
	const totalSize = url.searchParams.get('totalSize');
	const chunk = await request.arrayBuffer();
	const parseResult = StateUpdateSchema.safeParse({
		chunkIdx,
		keyHash,
		totalSize,
		chunk
	});
	if (!parseResult.success) {
		error(422, { message: parseResult.error.toString() });
	}
	const uploadInfo: StateUpdate = parseResult.data;

	stateHandler.handleUpdate({ ...uploadInfo, chunk });

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
		const size = (await fs.stat(filePath)).size;
		const fileStream = createReadStream(filePath) as unknown as BodyInit;
		return new Response(fileStream, {
			headers: {
				'Content-Length': size.toString()
			}
		});
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

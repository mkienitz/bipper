import type { ServerInit } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import path from 'path';
import { mkdir } from 'fs/promises';
import { setStoreDir } from '$lib/server/globals';

export const init: ServerInit = async () => {
	if (!env.BIPPER_STORAGE_DIR) {
		console.error('BIPPER_STORAGE_DIR is not set!');
		process.exit(1);
	}

	const storeDir = path.join(env.BIPPER_STORAGE_DIR, 'store/');
	setStoreDir(storeDir);
	await mkdir(storeDir, { recursive: true });
};

import type { ServerInit } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import path from 'path';
import { mkdir } from 'fs/promises';

export const init: ServerInit = async () => {
	if (!env.BIPPER_STORAGE_DIR) {
		console.error('BIPPER_STORAGE_DIR is not set!');
		process.exit(1);
	}
	const storeDir = path.join(env.BIPPER_STORAGE_DIR, 'store/');
	await mkdir(storeDir, { recursive: true });

	if (!env.BIPPER_MAX_FILE_SIZE) {
		console.error('BIPPER_MAX_FILE_SIZE is not set!');
		process.exit(1);
	}
	const maxFileSize = parseInt(env.BIPPER_MAX_FILE_SIZE);
	if (Number.isNaN(maxFileSize) || maxFileSize <= 0) {
		console.error(`Invalid value for BIPPER_MAX_FILE_SIZE=${env.BIPPER_MAX_FILE_SIZE}`);
		process.exit(1);
	}
};

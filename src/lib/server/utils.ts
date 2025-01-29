import { env } from '$env/dynamic/private';
import path from 'node:path';

export const getStorageDir = () => path.join(env.BIPPER_STORAGE_DIR, 'store/');
export const getMaxFileSize = () => Number(env.BIPPER_MAX_FILE_SIZE) * 1024 * 1024;
